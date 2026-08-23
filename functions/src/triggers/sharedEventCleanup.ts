import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { DateTime } from 'luxon';
import { logger } from '../utils/logger.js';
import {
  isSharedEventStale,
  isUndatedSharedEventStale,
} from '../utils/sharedEventCleanup.js';

if (!admin.apps.length) admin.initializeApp();

const CLEANUP_GRACE_DAYS = 1;
const UNDATED_CLEANUP_GRACE_DAYS = 30;
const MAX_EVENTS_PER_RUN = 400;
const MAX_SCAN_PER_RUN = 5000;

function firestoreDb(): admin.firestore.Firestore {
  return admin.firestore();
}

function ownerUidForPrivateEvent(snapshot: admin.firestore.QueryDocumentSnapshot): string | undefined {
  const userRef = snapshot.ref.parent.parent;
  return userRef?.parent.id === 'users' ? userRef.id : undefined;
}

function storagePathsFromIngest(data: admin.firestore.DocumentData): string[] {
  const paths = new Set<string>();
  for (const upload of Array.isArray(data.receivedUploads) ? data.receivedUploads : []) {
    if (typeof upload?.filePath === 'string' && upload.filePath.startsWith('sharedEventUploads/')) {
      paths.add(upload.filePath);
    }
  }
  return [...paths];
}

function storagePathFromMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const marker = '/o/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return undefined;
    const decoded = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    return decoded.startsWith('sharedEventUploads/') ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function storagePathsFromPrivateEvent(data: admin.firestore.DocumentData): string[] {
  return Array.from(new Set((Array.isArray(data.mediaUrls) ? data.mediaUrls : [])
    .map((value: unknown) => storagePathFromMediaUrl(value))
    .filter((value: string | undefined): value is string => Boolean(value))));
}

export async function cleanupStaleSharedEvents(params: {
  now?: DateTime;
  graceDays?: number;
  maxEvents?: number;
} = {}): Promise<{
  scanned: number;
  deletedEvents: number;
  deletedIngests: number;
  deletedUploads: number;
  backupPath?: string;
}> {
  const now = (params.now || DateTime.now()).setZone('America/Halifax');
  const graceDays = Math.max(0, params.graceDays ?? CLEANUP_GRACE_DAYS);
  const maxEvents = Math.min(Math.max(1, params.maxEvents ?? MAX_EVENTS_PER_RUN), 450);
  const snapshot = await firestoreDb()
    .collectionGroup('privateSharedEvents')
    .limit(MAX_SCAN_PER_RUN)
    .get();
  const candidates = snapshot.docs
    .filter((doc) => (
      isSharedEventStale({ fields: doc.data(), now, graceDays })
      || isUndatedSharedEventStale({
        fields: doc.data(),
        now,
        graceDays: UNDATED_CLEANUP_GRACE_DAYS,
      })
    ))
    .sort((left, right) => {
      const leftDate = String(left.data().endDate || left.data().startDate || '9999-12-31');
      const rightDate = String(right.data().endDate || right.data().startDate || '9999-12-31');
      return leftDate.localeCompare(rightDate);
    })
    .slice(0, maxEvents);
  if (candidates.length === 0) {
    return { scanned: snapshot.size, deletedEvents: 0, deletedIngests: 0, deletedUploads: 0 };
  }

  const candidatePaths = new Set(candidates.map((doc) => doc.ref.path));
  const retainedUploadPaths = new Set(snapshot.docs
    .filter((doc) => !candidatePaths.has(doc.ref.path))
    .flatMap((doc) => storagePathsFromPrivateEvent(doc.data())));
  const ingestRefs = new Map<string, admin.firestore.DocumentReference>();
  for (const eventDoc of candidates) {
    const ownerUid = ownerUidForPrivateEvent(eventDoc);
    const ingestId = typeof eventDoc.data().ingestId === 'string' ? eventDoc.data().ingestId : '';
    if (ownerUid && ingestId) {
      const ref = firestoreDb().collection('users').doc(ownerUid).collection('sharedEventIngests').doc(ingestId);
      ingestRefs.set(ref.path, ref);
    }
  }

  const ingestSnapshots = await Promise.all([...ingestRefs.values()].map((ref) => ref.get()));
  const deletableIngests: admin.firestore.DocumentSnapshot[] = [];
  for (const ingest of ingestSnapshots) {
    if (!ingest.exists) continue;
    const privateEventIds: string[] = Array.isArray(ingest.data()?.privateEventIds)
      ? ingest.data()!.privateEventIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const ownerRef = ingest.ref.parent.parent;
    if (!ownerRef || privateEventIds.length === 0) continue;
    const linkedRefs: admin.firestore.DocumentReference[] = privateEventIds
      .map((id: string) => ownerRef.collection('privateSharedEvents').doc(id));
    const linkedSnapshots = await Promise.all(linkedRefs.map((ref: admin.firestore.DocumentReference) => ref.get()));
    const allRemoved = linkedSnapshots.every((linked) => !linked.exists || candidatePaths.has(linked.ref.path));
    if (allRemoved) deletableIngests.push(ingest);
  }

  const runId = now.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const backupPath = `sharedEventCleanupBackups/${runId}/firestore.json`;
  const backup = {
    schemaVersion: 1,
    createdAt: now.toUTC().toISO(),
    graceDays,
    undatedGraceDays: UNDATED_CLEANUP_GRACE_DAYS,
    privateEvents: candidates.map((doc) => ({ path: doc.ref.path, data: doc.data() })),
    ingests: deletableIngests.map((doc) => ({ path: doc.ref.path, data: doc.data() })),
  };
  const bucket = admin.storage().bucket();
  await bucket.file(backupPath).save(JSON.stringify(backup, null, 2), {
    contentType: 'application/json',
    resumable: false,
    metadata: { cacheControl: 'no-store' },
  });

  const sourceUploadPaths = new Set(candidates
    .flatMap((doc) => storagePathsFromPrivateEvent(doc.data()))
    .filter((sourcePath) => !retainedUploadPaths.has(sourcePath)));
  for (const ingest of deletableIngests) {
    for (const sourcePath of storagePathsFromIngest(ingest.data() || {})) {
      if (!retainedUploadPaths.has(sourcePath)) sourceUploadPaths.add(sourcePath);
    }
  }

  const copiedUploadPaths: string[] = [];
  for (const sourcePath of sourceUploadPaths) {
      try {
        const destination = `sharedEventCleanupBackups/${runId}/uploads/${encodeURIComponent(sourcePath)}`;
        await bucket.file(sourcePath).copy(bucket.file(destination));
        copiedUploadPaths.push(sourcePath);
      } catch (error) {
        logger.warn('Could not archive stale shared-event upload; leaving source object intact', {
          sourcePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
  }

  const deleteRefs = [
    ...candidates.map((doc) => doc.ref),
    ...deletableIngests.map((doc) => doc.ref),
  ];
  for (let index = 0; index < deleteRefs.length; index += 400) {
    const batch = firestoreDb().batch();
    for (const ref of deleteRefs.slice(index, index + 400)) batch.delete(ref);
    await batch.commit();
  }

  let deletedUploads = 0;
  for (const sourcePath of copiedUploadPaths) {
    try {
      await bucket.file(sourcePath).delete({ ignoreNotFound: true });
      deletedUploads += 1;
    } catch (error) {
      logger.warn('Could not delete archived stale shared-event upload', {
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    scanned: snapshot.size,
    deletedEvents: candidates.length,
    deletedIngests: deletableIngests.length,
    deletedUploads,
    backupPath,
  };
}

export const scheduledSharedEventCleanup = onSchedule(
  {
    schedule: '30 4 * * *',
    timeZone: 'America/Halifax',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'northamerica-northeast1',
  },
  async () => {
    logger.setContext({ functionName: 'scheduledSharedEventCleanup' });
    try {
      const result = await cleanupStaleSharedEvents();
      logger.info('Scheduled shared-event cleanup complete', result);
    } finally {
      logger.clearContext('functionName');
    }
  }
);
