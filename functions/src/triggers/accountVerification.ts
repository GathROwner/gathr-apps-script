import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import {
  brandedVerificationActionUrl,
  buildBrandedVerificationEmail,
  verificationContinueUrl,
} from '../services/brandedVerificationEmail.js';
import { logger } from '../utils/logger.js';

if (!admin.apps.length) {
  admin.initializeApp();
}

const brandedEmailUser = defineSecret('BRANDED_EMAIL_USER');
const brandedEmailPassword = defineSecret('BRANDED_EMAIL_PASSWORD');
const REGION = 'northamerica-northeast2';
const RATE_LIMIT_COLLECTION = 'account_verification_email_limits';
const MIN_SEND_INTERVAL_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;

function setCorsHeaders(response: { set: (name: string, value: string) => unknown }): void {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Cache-Control', 'no-store');
}

function bearerToken(authHeader: unknown): string {
  const raw = Array.isArray(authHeader) ? authHeader[0] : String(authHeader || '');
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

async function reserveSend(uid: string, nowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = admin.firestore();
  const ref = db.collection(RATE_LIMIT_COLLECTION).doc(uid);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    const lastSentMs = data.lastSentAt?.toMillis?.() || 0;
    const windowStartedMs = data.windowStartedAt?.toMillis?.() || 0;
    const windowExpired = !windowStartedMs || nowMs - windowStartedMs >= WINDOW_MS;
    const sendsInWindow = windowExpired ? 0 : Number(data.sendsInWindow || 0);

    if (lastSentMs && nowMs - lastSentMs < MIN_SEND_INTERVAL_MS) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((MIN_SEND_INTERVAL_MS - (nowMs - lastSentMs)) / 1000)),
      };
    }
    if (!windowExpired && sendsInWindow >= MAX_SENDS_PER_WINDOW) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (nowMs - windowStartedMs)) / 1000)),
      };
    }

    transaction.set(ref, {
      lastSentAt: admin.firestore.Timestamp.fromMillis(nowMs),
      windowStartedAt: admin.firestore.Timestamp.fromMillis(windowExpired ? nowMs : windowStartedMs),
      sendsInWindow: sendsInWindow + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

export const sendBrandedEmailVerification = onRequest(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [brandedEmailUser, brandedEmailPassword],
  },
  async (request, response) => {
    setCorsHeaders(response);
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    try {
      const token = bearerToken(request.headers.authorization);
      if (!token) {
        response.status(401).json({ error: 'authentication_required' });
        return;
      }

      const decoded = await admin.auth().verifyIdToken(token);
      const user = await admin.auth().getUser(decoded.uid);
      if (user.disabled) {
        response.status(403).json({ error: 'account_disabled' });
        return;
      }
      if (user.emailVerified) {
        response.status(200).json({ status: 'already_verified' });
        return;
      }
      if (!user.email) {
        response.status(409).json({ error: 'email_unavailable' });
        return;
      }

      const reservation = await reserveSend(user.uid, Date.now());
      if (!reservation.allowed) {
        response.set('Retry-After', String(reservation.retryAfterSeconds));
        response.status(429).json({
          error: 'too_many_requests',
          retryAfterSeconds: reservation.retryAfterSeconds,
        });
        return;
      }

      const firebaseActionLink = await admin.auth().generateEmailVerificationLink(user.email, {
        url: verificationContinueUrl(),
        handleCodeInApp: false,
      });
      const verificationUrl = brandedVerificationActionUrl(firebaseActionLink);
      const message = buildBrandedVerificationEmail(verificationUrl, user.displayName);
      const transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: brandedEmailUser.value(),
          pass: brandedEmailPassword.value(),
        },
      });
      await transport.sendMail({
        from: `"GathR Team" <${brandedEmailUser.value()}>`,
        to: user.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      logger.info('Sent branded verification email', {
        uidHash: createHash('sha256').update(user.uid).digest('hex').slice(0, 16),
      });
      response.status(200).json({ status: 'sent' });
    } catch (error) {
      logger.error('Failed to send branded verification email', {
        error: error instanceof Error ? error.message : String(error),
      });
      response.status(500).json({ error: 'delivery_failed' });
    }
  }
);
