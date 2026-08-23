import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import {
  buildSharedEventPushContent,
  isExpoPushToken,
  sharedEventPushInstallationId,
  shouldSendSharedEventPush,
} from '../services/sharedEventPush.js';
import { logger } from '../utils/logger.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const REGION = 'northamerica-northeast2';
const INSTALLATIONS_COLLECTION = 'shared_event_push_installations';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CLAIM_LEASE_MS = 2 * 60 * 1000;

type PushInstallation = {
  expoPushToken?: string;
  ownerUid?: string;
  active?: boolean;
  platform?: string;
};

function bearerToken(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : String(value || '');
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function requestBody(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function limitedText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

async function authenticatedUid(authorization: unknown): Promise<string> {
  const token = bearerToken(authorization);
  if (!token) throw new Error('Missing Firebase ID token.');
  const decoded = await admin.auth().verifyIdToken(token);
  if (!decoded.uid) throw new Error('Firebase ID token did not include a user id.');
  return decoded.uid;
}

export const registerSharedEventPushToken = onRequest(
  {
    region: REGION,
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
    if (request.method !== 'POST') {
      response.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    let ownerUid = '';
    try {
      ownerUid = await authenticatedUid(request.headers.authorization);
    } catch (error) {
      response.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unauthorized',
      });
      return;
    }

    const body = requestBody(request.body);
    const expoPushToken = limitedText(body.expoPushToken, 256);
    const action = limitedText(body.action, 20) || 'register';
    if (!isExpoPushToken(expoPushToken)) {
      response.status(400).json({ success: false, error: 'Invalid Expo push token' });
      return;
    }
    if (action !== 'register' && action !== 'unregister') {
      response.status(400).json({ success: false, error: 'Invalid registration action' });
      return;
    }

    const installationId = sharedEventPushInstallationId(expoPushToken);
    const ref = db.collection(INSTALLATIONS_COLLECTION).doc(installationId);
    if (action === 'unregister') {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.ownerUid !== ownerUid) return;
        transaction.set(ref, {
          active: false,
          unregisteredAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      response.status(200).json({ success: true, active: false });
      return;
    }

    const existing = await ref.get();
    const platform = limitedText(body.platform, 20) || 'unknown';
    const deviceName = limitedText(body.deviceName, 100);
    const appVersion = limitedText(body.appVersion, 40);
    const runtimeVersion = limitedText(body.runtimeVersion, 40);
    await ref.set({
      expoPushToken,
      ownerUid,
      active: true,
      platform,
      ...(deviceName ? { deviceName } : {}),
      ...(appVersion ? { appVersion } : {}),
      ...(runtimeVersion ? { runtimeVersion } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });

    logger.info('Registered shared event push installation', {
      ownerUid,
      installationId: installationId.slice(0, 12),
      platform,
    });

    response.status(200).json({ success: true, active: true });
  }
);

async function claimDelivery(
  ownerUid: string,
  ingestId: string,
  terminalStatus: string
): Promise<admin.firestore.DocumentReference | null> {
  const deliveryRef = db
    .collection('users')
    .doc(ownerUid)
    .collection('sharedEventPushDeliveries')
    .doc(`${ingestId}-${terminalStatus}`);

  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(deliveryRef);
    const data = snapshot.data() || {};
    if (data.state === 'sent') return false;
    const sendingAt = data.sendingAt?.toMillis?.() || 0;
    if (data.state === 'sending' && Date.now() - sendingAt < CLAIM_LEASE_MS) return false;
    transaction.set(deliveryRef, {
      ingestId,
      ownerUid,
      terminalStatus,
      state: 'sending',
      attempts: admin.firestore.FieldValue.increment(1),
      sendingAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    }, { merge: true });
    return true;
  });

  return claimed ? deliveryRef : null;
}

export const sendSharedEventCompletionPush = onDocumentWritten(
  {
    document: 'users/{ownerUid}/sharedEventIngests/{ingestId}',
    region: REGION,
    retry: true,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    if (!shouldSendSharedEventPush(before.processingStatus, after.processingStatus)) return;

    const ownerUid = String(event.params.ownerUid || '').trim();
    const ingestId = String(event.params.ingestId || '').trim();
    const terminalStatus = String(after.processingStatus || '').trim();
    if (!ownerUid || !ingestId) return;
    if (after.ownerUid && String(after.ownerUid) !== ownerUid) {
      logger.warn('Shared event push owner mismatch', { ownerUid, ingestId });
      return;
    }

    const deliveryRef = await claimDelivery(ownerUid, ingestId, terminalStatus);
    if (!deliveryRef) return;

    try {
      const installations = await db
        .collection(INSTALLATIONS_COLLECTION)
        .where('ownerUid', '==', ownerUid)
        .get();
      const targets = installations.docs
        .map((snapshot) => ({
          ref: snapshot.ref,
          data: snapshot.data() as PushInstallation,
        }))
        .filter((entry) => entry.data.active && isExpoPushToken(entry.data.expoPushToken));

      if (targets.length === 0) {
        await deliveryRef.set({
          state: 'skipped_no_active_tokens',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
      }

      const content = buildSharedEventPushContent(ingestId, after);
      const messages = targets.map((target) => ({
        to: target.data.expoPushToken!,
        sound: 'default',
        title: `GathR - ${content.title}`,
        body: content.body,
        priority: 'high',
        ttl: 3600,
        channelId: 'gathr-share-updates',
        data: {
          kind: content.kind,
          ingestId: content.ingestId,
        },
      }));
      const pushResponse = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const pushResult = await pushResponse.json().catch(() => ({})) as {
        data?: Array<{ status?: string; id?: string; message?: string; details?: { error?: string } }>;
        errors?: unknown;
      };
      if (!pushResponse.ok || !Array.isArray(pushResult.data)) {
        throw new Error(`Expo push request failed (${pushResponse.status})`);
      }

      const invalidRefs: admin.firestore.DocumentReference[] = [];
      const tickets = pushResult.data.map((ticket, index) => {
        if (ticket?.details?.error === 'DeviceNotRegistered' && targets[index]) {
          invalidRefs.push(targets[index].ref);
        }
        return {
          status: ticket?.status || 'unknown',
          id: ticket?.id || null,
          error: ticket?.details?.error || null,
          message: ticket?.message || null,
        };
      });
      if (invalidRefs.length > 0) {
        const batch = db.batch();
        invalidRefs.forEach((ref) => batch.set(ref, {
          active: false,
          invalidatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }));
        await batch.commit();
      }

      await deliveryRef.set({
        state: 'sent',
        kind: content.kind,
        tokenCount: targets.length,
        successCount: tickets.filter((ticket) => ticket.status === 'ok').length,
        tickets,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deliveryRef.set({
        state: 'failed',
        lastError: message.slice(0, 500),
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.error('Shared event completion push failed', error, { ownerUid, ingestId });
      throw error;
    }
  }
);
