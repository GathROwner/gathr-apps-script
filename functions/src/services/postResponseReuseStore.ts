import * as admin from 'firebase-admin';
import { PostResponseReuseRecord, PostResponseReuseStore, ReuseFence } from '../parsing/postResponseReuse.js';

const COLLECTION = 'parser_response_reuse';
const version = (t: FirebaseFirestore.Timestamp | undefined): string => t &&
  Number.isInteger(t.seconds) && Number.isInteger(t.nanoseconds) ? `${t.seconds}:${t.nanoseconds}` : '';
export function createPostResponseReuseStore(getDatabase: () => FirebaseFirestore.Firestore): PostResponseReuseStore { return {
  async load(id, consumer) {
    const db = getDatabase(), snapshot = await db.doc(`${COLLECTION}/${id}`).get();
    if (!snapshot.exists) return undefined;
    const data = snapshot.data() as PostResponseReuseRecord;
    const producer = data?.producer;
    if (!producer?.fileId || !producer.runId || producer.fileId === consumer.fileId) return undefined;
    const [lock, marker] = await db.getAll(db.doc(`processing_locks/${producer.fileId}`), db.doc(`processed_datasets/${producer.fileId}`));
    // Never reuse a decision from an unfinished/failed run, or a later replay
    // whose old completed marker happens to remain present.
    if (lock.get('status') !== 'completed' || lock.get('runId') !== producer.runId ||
        marker.get('fileId') !== producer.fileId ||
        !Number.isFinite(data.validatedAtMs) ||
        !(marker.get('processedAt')?.toMillis?.() >= data.validatedAtMs)) return undefined;
    if (!data.dependencies?.length || data.dependencies.length > 32 ||
        data.dependencies.some(d => !/^(?:venues\/[^/]+(?:\/events\/[^/]+)?|events\/[^/]+)$/.test(d.path) || !d.updateTime)) return undefined;
    const current = await db.getAll(...data.dependencies.map(d => db.doc(d.path)));
    if (current.some((d, i) => !d.exists || version(d.updateTime) !== data.dependencies[i].updateTime)) return undefined;
    return data;
  },
  async save(id: string, record: PostResponseReuseRecord, fence: ReuseFence) {
    const db = getDatabase();
    await db.runTransaction(async transaction => {
      const lock = await transaction.get(db.doc(`processing_locks/${fence.fileId}`));
      if (lock.get('status') !== 'running' || lock.get('runId') !== fence.runId || lock.get('workerId') !== fence.workerId) {
        throw new Error('resume_worker_fenced');
      }
      if (!record.dependencies?.length || record.dependencies.length > 32 ||
          record.dependencies.some(d => !/^(?:venues\/[^/]+(?:\/events\/[^/]+)?|events\/[^/]+)$/.test(d.path))) return;
      const current = await transaction.getAll(...record.dependencies.map(d => db.doc(d.path)));
      if (current.some(d => !d.exists || !d.updateTime)) return;
      const dependencies = current.map((d, i) => ({ path: record.dependencies[i].path, updateTime: version(d.updateTime) }));
      transaction.set(db.doc(`${COLLECTION}/${id}`), { ...record, dependencies });
    });
  },
}; }
export const postResponseReuseStore = createPostResponseReuseStore(() => admin.firestore());
