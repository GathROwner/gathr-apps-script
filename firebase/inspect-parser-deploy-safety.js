const path = require('path');
const admin = require('../functions/node_modules/firebase-admin');

const serviceAccountPath =
  process.env.GATHR_SERVICE_ACCOUNT_PATH ||
  'C:\\Users\\craig\\Dev\\gathr-apps-script\\firebase\\service-account.json';
const serviceAccount = require(path.resolve(serviceAccountPath));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

function asMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value) {
  const millis = asMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

function mostRecentTimestamp(data) {
  return Math.max(
    ...[
      data.updatedAt,
      data.lastUpdatedAt,
      data.heartbeatAt,
      data.lastHeartbeatAt,
      data.createdAt,
      data.processedAt,
      data.completedAt,
      data.releasedAt,
    ].map(asMillis)
  );
}

function compact(doc) {
  const data = doc.data() || {};
  const recentMillis = mostRecentTimestamp(data);
  return {
    path: doc.ref.path,
    status: data.status || null,
    state: data.state || null,
    active: data.active ?? data.isActive ?? null,
    locked: data.locked ?? null,
    released: data.released ?? null,
    complete: data.complete ?? data.completed ?? null,
    datasetId: data.datasetId || data.fileId || null,
    rowIndex: data.rowIndex ?? data.lastProcessedRow ?? data.currentRow ?? null,
    totalRows: data.totalRows ?? data.rowCount ?? null,
    updatedAt: asIso(data.updatedAt || data.lastUpdatedAt || data.heartbeatAt || data.lastHeartbeatAt),
    expiresAt: asIso(data.expiresAt || data.lockExpiresAt || data.leaseExpiresAt),
    completedAt: asIso(data.completedAt || data.processedAt),
    releasedAt: asIso(data.releasedAt),
    recentMillis,
  };
}

async function main() {
  const now = Date.now();
  const result = { checkedAt: new Date(now).toISOString(), collections: {} };

  for (const name of ['processing_locks', 'checkpoints', 'batch_states', 'processed_datasets']) {
    const snapshot = await db.collection(name).get();
    const records = snapshot.docs
      .map(compact)
      .sort((left, right) => right.recentMillis - left.recentMillis);
    const activeCandidates = records.filter((record) => {
      const status = String(record.status || record.state || '').toLowerCase();
      const notTerminal = !/(complete|completed|released|failed|cancelled|expired)/.test(status);
      const explicitlyActive = record.active === true || record.locked === true;
      const liveLease = Boolean(record.expiresAt && Date.parse(record.expiresAt) > now);
      const recent = record.recentMillis > now - 30 * 60 * 1000;
      return liveLease || explicitlyActive || (notTerminal && recent);
    });

    result.collections[name] = {
      count: records.length,
      activeCandidates,
      latest: records.slice(0, 5),
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
