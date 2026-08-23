import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const firebaseToolsAuth = require(path.join(
  process.env.APPDATA,
  'npm',
  'node_modules',
  'firebase-tools',
  'lib',
  'auth'
));
const { DateTime } = require(path.resolve('..', 'functions', 'node_modules', 'luxon'));

const PROJECT_ID = 'gathr-m1';
const BUCKET = 'gathr-m1.firebasestorage.app';
const OWNER_UID = process.argv.find((arg) => arg.startsWith('--ownerUid='))?.split('=')[1];
const APPLY = process.argv.includes('--apply');
const GRACE_HOURS = Number(process.argv.find((arg) => arg.startsWith('--graceHours='))?.split('=')[1] || 0);

if (!OWNER_UID) throw new Error('Pass --ownerUid=<Firebase uid>.');
if (!Number.isFinite(GRACE_HOURS) || GRACE_HOURS < 0) throw new Error('graceHours must be zero or greater.');

function decode(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, decode(child)]));
  }
  return undefined;
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').at(-1),
    path: document.name.split('/documents/')[1],
    createTime: document.createTime,
    updateTime: document.updateTime,
    data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
  };
}

async function listCollection(collectionPath, token) {
  const rows = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    const payload = await response.json();
    rows.push(...(payload.documents || []).map(decodeDocument));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return rows;
}

function effectiveEnd(data) {
  const baseDate = /^\d{4}-\d{2}-\d{2}$/.test(data.endDate || '')
    ? data.endDate
    : /^\d{4}-\d{2}-\d{2}$/.test(data.startDate || '') ? data.startDate : undefined;
  const recurrenceEnd = /^\d{4}-\d{2}-\d{2}$/.test(data.recurrenceUntilDate || '')
    ? data.recurrenceUntilDate
    : undefined;
  const date = data.recurringPattern && recurrenceEnd && (!baseDate || recurrenceEnd > baseDate)
    ? recurrenceEnd
    : baseDate;
  if (!date) return undefined;
  const time = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(data.endTime || '')
    ? data.endTime
    : '23:59:59';
  const requestedZone = typeof data.timezone === 'string' ? data.timezone : 'America/Halifax';
  const zone = DateTime.local().setZone(requestedZone).isValid ? requestedZone : 'America/Halifax';
  const parsed = DateTime.fromISO(`${date}T${time}`, { zone });
  return parsed.isValid ? parsed : undefined;
}

function storagePathFromUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    const marker = '/o/';
    const index = url.pathname.indexOf(marker);
    if (index < 0) return undefined;
    const decoded = decodeURIComponent(url.pathname.slice(index + marker.length));
    return decoded.startsWith(`sharedEventUploads/${OWNER_UID}/`) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function eventStoragePaths(data) {
  return (Array.isArray(data.mediaUrls) ? data.mediaUrls : [])
    .map(storagePathFromUrl)
    .filter(Boolean);
}

function ingestStoragePaths(data) {
  const paths = [];
  for (const upload of Array.isArray(data.receivedUploads) ? data.receivedUploads : []) {
    if (typeof upload?.filePath === 'string' && upload.filePath.startsWith(`sharedEventUploads/${OWNER_UID}/`)) {
      paths.push(upload.filePath);
    }
    const mediaPath = storagePathFromUrl(upload?.mediaUrl);
    if (mediaPath) paths.push(mediaPath);
  }
  return paths;
}

async function storageMetadata(storagePath, token) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(storagePath)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return { path: storagePath, exists: false };
  if (!response.ok) return { path: storagePath, exists: 'unknown', error: `${response.status}: ${await response.text()}` };
  const data = await response.json();
  return { path: storagePath, exists: true, size: Number(data.size || 0), contentType: data.contentType };
}

async function backupStorageObject(storagePath, targetPath, token) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Storage backup failed for ${storagePath}: ${response.status} ${await response.text()}`);
  fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
  return true;
}

async function deleteStorageObject(storagePath, token) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(storagePath)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status !== 204 && response.status !== 404) {
    throw new Error(`Storage delete failed for ${storagePath}: ${response.status} ${await response.text()}`);
  }
}

async function deleteFirestorePaths(paths, token) {
  for (let index = 0; index < paths.length; index += 400) {
    const writes = paths.slice(index, index + 400).map((documentPath) => ({
      delete: `projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
    }));
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:batchWrite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes }),
    });
    if (!response.ok) throw new Error(`Firestore batch delete failed: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const account = firebaseToolsAuth.getGlobalDefaultAccount();
  const access = await firebaseToolsAuth.getAccessToken(account.tokens.refresh_token, account.tokens.scopes);
  const token = access.access_token;
  const now = DateTime.now().toUTC();
  const cutoff = now.minus({ hours: GRACE_HOURS });
  const [events, ingests] = await Promise.all([
    listCollection(`users/${OWNER_UID}/privateSharedEvents`, token),
    listCollection(`users/${OWNER_UID}/sharedEventIngests`, token),
  ]);
  const candidates = events.filter((event) => {
    const end = effectiveEnd(event.data);
    return end && end.toUTC().toMillis() <= cutoff.toMillis();
  });
  const retained = events.filter((event) => !candidates.includes(event));
  const candidateIds = new Set(candidates.map((event) => event.id));
  const allEventIds = new Set(events.map((event) => event.id));
  const deletableIngests = ingests.filter((ingest) => {
    const ids = Array.isArray(ingest.data.privateEventIds) ? ingest.data.privateEventIds.filter((id) => typeof id === 'string') : [];
    return ids.length > 0 && ids.every((id) => candidateIds.has(id) || !allEventIds.has(id));
  });
  const retainedPaths = new Set(retained.flatMap((event) => eventStoragePaths(event.data)));
  const candidatePaths = new Set([
    ...candidates.flatMap((event) => eventStoragePaths(event.data)),
    ...deletableIngests.flatMap((ingest) => ingestStoragePaths(ingest.data)),
  ].filter((storagePath) => !retainedPaths.has(storagePath)));
  const storage = await Promise.all([...candidatePaths].map((storagePath) => storageMetadata(storagePath, token)));
  const recurrenceGroups = Object.values(candidates.reduce((groups, event) => {
    if (!event.data.recurringPattern) return groups;
    const key = `${event.data.sourceContentSignature || event.data.title || event.id}|${event.data.recurringPattern}`;
    groups[key] ||= { key, eventPaths: [], recurrenceUntilDates: [] };
    groups[key].eventPaths.push(event.path);
    if (event.data.recurrenceUntilDate) groups[key].recurrenceUntilDates.push(event.data.recurrenceUntilDate);
    return groups;
  }, {}));
  const stamp = now.toFormat("yyyy-MM-dd'T'HH-mm-ss-SSS'Z'");
  const reportPath = path.resolve(`shared-event-cleanup-audit-${stamp}.json`);
  const report = {
    projectId: PROJECT_ID,
    ownerUid: OWNER_UID,
    generatedAt: now.toISO(),
    graceHours: GRACE_HOURS,
    applyRequested: APPLY,
    totals: {
      privateEvents: events.length,
      expiredEventCandidates: candidates.length,
      retainedEvents: retained.length,
      ingestDocs: ingests.length,
      deletableIngests: deletableIngests.length,
      storageObjects: storage.filter((item) => item.exists === true).length,
      storageBytes: storage.reduce((sum, item) => sum + (item.size || 0), 0),
    },
    retained: retained.map((event) => ({ path: event.path, title: event.data.title, effectiveEnd: effectiveEnd(event.data)?.toISO() })),
    recurrenceGroups,
    deletePaths: {
      privateEvents: candidates.map((event) => event.path),
      ingests: deletableIngests.map((ingest) => ingest.path),
      storage,
    },
    backupDocuments: {
      privateEvents: candidates,
      ingests: deletableIngests,
    },
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, ...report.totals, retained: report.retained }, null, 2));
  if (!APPLY || candidates.length === 0) return;

  const backupDir = path.resolve(`shared-event-cleanup-backup-${stamp}`);
  const uploadDir = path.join(backupDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.copyFileSync(reportPath, path.join(backupDir, 'firestore-documents.json'));
  const storageManifest = [];
  for (const [index, item] of storage.entries()) {
    if (item.exists !== true) continue;
    const extension = path.extname(item.path) || '.bin';
    const localName = `${String(index + 1).padStart(4, '0')}${extension}`;
    const localPath = path.join(uploadDir, localName);
    await backupStorageObject(item.path, localPath, token);
    storageManifest.push({ ...item, localPath: path.relative(backupDir, localPath) });
  }
  fs.writeFileSync(path.join(backupDir, 'storage-manifest.json'), JSON.stringify(storageManifest, null, 2));

  await deleteFirestorePaths([
    ...candidates.map((event) => event.path),
    ...deletableIngests.map((ingest) => ingest.path),
  ], token);
  for (const item of storage) {
    if (item.exists === true) await deleteStorageObject(item.path, token);
  }

  const [eventsAfter, ingestsAfter] = await Promise.all([
    listCollection(`users/${OWNER_UID}/privateSharedEvents`, token),
    listCollection(`users/${OWNER_UID}/sharedEventIngests`, token),
  ]);
  const verification = {
    backupDir,
    deletedPrivateEvents: candidates.length,
    deletedIngests: deletableIngests.length,
    deletedStorageObjects: storage.filter((item) => item.exists === true).length,
    remainingPrivateEvents: eventsAfter.length,
    remainingIngests: ingestsAfter.length,
    firestorePathsStillPresent: [
      ...candidates.map((event) => event.path),
      ...deletableIngests.map((ingest) => ingest.path),
    ].filter((target) => [...eventsAfter, ...ingestsAfter].some((doc) => doc.path === target)),
  };
  fs.writeFileSync(path.join(backupDir, 'verification.json'), JSON.stringify(verification, null, 2));
  console.log(JSON.stringify(verification, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
