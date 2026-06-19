import * as admin from 'firebase-admin';
import {
  PrivateSharedEventRecord,
  PublicSharedEventCandidateRecord,
  PublicSharedEventCandidateStatus,
} from '../types/sharedEvent.js';

const COLLECTIONS = {
  PRIVATE_SHARED_EVENTS: 'privateSharedEvents',
  PUBLIC_SHARED_EVENT_CANDIDATES: 'public_shared_event_candidates',
} as const;

function projectIdFromFirebaseConfig(): string {
  try {
    const config = process.env.FIREBASE_CONFIG
      ? JSON.parse(process.env.FIREBASE_CONFIG)
      : undefined;
    return String(config?.projectId || '').trim();
  } catch {
    return '';
  }
}

function getCurrentProjectId(): string {
  return String(
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    projectIdFromFirebaseConfig() ||
    admin.app().options.projectId ||
    ''
  ).trim();
}

export function getSharedEventSourceProjectId(): string {
  const configured = String(process.env.SHARED_EVENT_SOURCE_PROJECT_ID || '').trim();
  if (configured) return configured;

  const currentProjectId = getCurrentProjectId();
  // Share intake runs against the app/auth project, while public venue/event
  // promotion runs in the migrated parser project.
  if (currentProjectId === 'gathr-migrated') return 'gathr-m1';

  return currentProjectId;
}

function getSourceDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const sourceProjectId = getSharedEventSourceProjectId();
  const currentProjectId = getCurrentProjectId();
  if (!sourceProjectId || sourceProjectId === currentProjectId) {
    return admin.firestore();
  }

  const appName = `shared-event-source-${sourceProjectId}`;
  const existingApp = admin.apps.find((app) => app?.name === appName);
  const app = existingApp || admin.initializeApp({ projectId: sourceProjectId }, appName);
  return admin.firestore(app);
}

export async function listPublicSharedEventCandidates(options?: {
  statuses?: PublicSharedEventCandidateStatus[];
  limit?: number;
}): Promise<PublicSharedEventCandidateRecord[]> {
  const db = getSourceDb();
  const statuses = (options?.statuses || [])
    .map((status) => String(status || '').trim())
    .filter((status): status is PublicSharedEventCandidateStatus => Boolean(status));
  const limit = Math.max(1, Math.min(Number(options?.limit || 25), 100));

  const fetchForStatus = async (
    status?: PublicSharedEventCandidateStatus,
    rowLimit = limit
  ): Promise<PublicSharedEventCandidateRecord[]> => {
    let query: admin.firestore.Query = db.collection(COLLECTIONS.PUBLIC_SHARED_EVENT_CANDIDATES);
    if (status) {
      query = query.where('status', '==', status);
    }
    const snapshot = await query.limit(rowLimit).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as PublicSharedEventCandidateRecord),
    }));
  };

  if (statuses.length === 0) {
    return fetchForStatus(undefined, limit);
  }

  const rows: PublicSharedEventCandidateRecord[] = [];
  const seen = new Set<string>();
  for (const status of statuses) {
    const remaining = limit - rows.length;
    if (remaining <= 0) break;
    const current = await fetchForStatus(status, remaining);
    for (const row of current) {
      const id = String(row.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      if (rows.length >= limit) break;
    }
  }

  return rows;
}

export async function claimPublicSharedEventCandidate(
  candidateId: string
): Promise<PublicSharedEventCandidateRecord | null> {
  const db = getSourceDb();
  const normalizedCandidateId = String(candidateId || '').trim();
  if (!normalizedCandidateId) return null;

  const candidateRef = db
    .collection(COLLECTIONS.PUBLIC_SHARED_EVENT_CANDIDATES)
    .doc(normalizedCandidateId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(candidateRef);
    if (!snapshot.exists) return null;

    const record = {
      id: snapshot.id,
      ...(snapshot.data() as PublicSharedEventCandidateRecord),
    };
    if (record.status !== 'pending_validation') {
      return null;
    }

    tx.set(candidateRef, {
      status: 'processing',
      promotionAttemptCount: admin.firestore.FieldValue.increment(1),
      promotionLastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ...record,
      status: 'processing',
    };
  });
}

export async function updatePublicSharedEventCandidate(
  candidateId: string,
  updates: Partial<PublicSharedEventCandidateRecord> & Record<string, unknown>
): Promise<void> {
  const normalizedCandidateId = String(candidateId || '').trim();
  if (!normalizedCandidateId) return;

  await getSourceDb()
    .collection(COLLECTIONS.PUBLIC_SHARED_EVENT_CANDIDATES)
    .doc(normalizedCandidateId)
    .set({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

export async function updatePrivateSharedEventPublicPromotion(params: {
  ownerUid: string;
  privateEventId: string;
  publicPromotionStatus: PublicSharedEventCandidateStatus;
  publicCandidateId?: string;
  publicVenueId?: string;
  publicEventId?: string;
  publicEventPath?: string;
  publicUnknownVenueDocId?: string;
  publicCityLevelReviewDocId?: string;
}): Promise<void> {
  const ownerUid = String(params.ownerUid || '').trim();
  const privateEventId = String(params.privateEventId || '').trim();
  if (!ownerUid || !privateEventId) return;

  const patch: Partial<PrivateSharedEventRecord> & Record<string, unknown> = {
    publicPromotionStatus: params.publicPromotionStatus,
    ...(params.publicCandidateId ? { publicCandidateId: params.publicCandidateId } : {}),
    ...(params.publicVenueId ? { publicVenueId: params.publicVenueId } : {}),
    ...(params.publicEventId ? { publicEventId: params.publicEventId } : {}),
    ...(params.publicEventPath ? { publicEventPath: params.publicEventPath } : {}),
    ...(params.publicUnknownVenueDocId ? { publicUnknownVenueDocId: params.publicUnknownVenueDocId } : {}),
    ...(params.publicCityLevelReviewDocId ? { publicCityLevelReviewDocId: params.publicCityLevelReviewDocId } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await getSourceDb()
    .collection('users')
    .doc(ownerUid)
    .collection(COLLECTIONS.PRIVATE_SHARED_EVENTS)
    .doc(privateEventId)
    .set(patch, { merge: true });
}
