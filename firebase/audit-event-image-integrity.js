const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(__dirname, 'service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const IMAGE_SCALAR_FIELDS = [
  'image',
  'imageUrl',
  'relevantImageUrl',
  'cachedImageUrl',
  'sharedPostThumbnail',
  'icon',
  'profileImage',
  'metadata.image',
  'metadata.imageUrl',
  'metadata.relevantImageUrl',
  'metadata.cachedImageUrl',
  'metadata.sharedPostThumbnail',
  'metadata.icon',
  'metadata.profileImage',
];

const IMAGE_ARRAY_FIELDS = [
  'mediaUrls',
  'metadata.mediaUrls',
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getNestedValue(data, fieldPath) {
  return fieldPath.split('.').reduce((cursor, segment) => {
    if (!cursor || typeof cursor !== 'object') return undefined;
    return cursor[segment];
  }, data);
}

function normalizeUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function isManagedStorageUrl(url) {
  return url.startsWith('https://storage.googleapis.com/gathr-uploaded-images/');
}

function tokenizeUrls(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(tokenizeUrls);
  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/)
      .map((token) => normalizeUrl(token))
      .filter(Boolean);
  }
  return [];
}

function serializeValue(value) {
  if (!value) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializeValue(child)])
    );
  }
  return value;
}

function compactDoc(docPath, data) {
  return {
    path: docPath,
    title: data.eventName || data.name || data.title || '',
    venueId: data.venueId || (docPath.startsWith('venues/') ? docPath.slice('venues/'.length) : ''),
    venueName: data.establishment || data.venueName || data.locationLabel || data.venue ||
      (docPath.startsWith('venues/') ? data.name || '' : ''),
    locationScope: data.locationScope || (docPath.startsWith('events/') ? 'city' : 'venue'),
    startDate: serializeValue(data.startDate) || '',
    endDate: serializeValue(data.endDate) || '',
    isRecurring: data.isRecurring || '',
    recurringPattern: data.recurringPattern || '',
    uniqueId: data.uniqueId || '',
    createdAt: serializeValue(data.createdAt) || '',
    updatedAt: serializeValue(data.updatedAt) || '',
    lastSeenAt: serializeValue(data.lastSeenAt) || '',
    facebookUrl: data.facebookUrl || data.cleanedFacebookUrl || '',
  };
}

function collectImageReferences(docPath, data) {
  const refs = [];

  for (const field of IMAGE_SCALAR_FIELDS) {
    const normalized = normalizeUrl(getNestedValue(data, field));
    if (normalized && isManagedStorageUrl(normalized)) {
      refs.push({ url: normalized, field, ...compactDoc(docPath, data) });
    }
  }

  for (const field of IMAGE_ARRAY_FIELDS) {
    const urls = tokenizeUrls(getNestedValue(data, field));
    for (const url of urls) {
      if (isManagedStorageUrl(url)) {
        refs.push({ url, field, ...compactDoc(docPath, data) });
      }
    }
  }

  return refs;
}

async function fetchAllEventDocs() {
  const byPath = new Map();

  const venueEvents = await db.collectionGroup('events').get();
  for (const doc of venueEvents.docs) {
    byPath.set(doc.ref.path, doc.data() || {});
  }

  const topLevelEvents = await db.collection('events').get();
  for (const doc of topLevelEvents.docs) {
    byPath.set(doc.ref.path, doc.data() || {});
  }

  return byPath;
}

async function fetchAllVenueDocs() {
  const snapshot = await db.collection('venues').get();
  const byPath = new Map();
  for (const doc of snapshot.docs) {
    byPath.set(doc.ref.path, doc.data() || {});
  }
  return byPath;
}

async function checkUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
    });
    return {
      url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      statusText: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const concurrency = Math.max(1, Math.min(Number(args.concurrency || 12), 50));
  const timeoutMs = Math.max(1000, Math.min(Number(args.timeoutMs || 10000), 60000));
  const maxUrls = args.maxUrls ? Math.max(1, Number(args.maxUrls)) : null;

  const eventDocs = await fetchAllEventDocs();
  const venueDocs = await fetchAllVenueDocs();
  const docs = new Map([...eventDocs, ...venueDocs]);
  const referencesByUrl = new Map();

  for (const [docPath, data] of docs.entries()) {
    for (const ref of collectImageReferences(docPath, data)) {
      if (!referencesByUrl.has(ref.url)) {
        referencesByUrl.set(ref.url, []);
      }
      referencesByUrl.get(ref.url).push(ref);
    }
  }

  let urls = Array.from(referencesByUrl.keys()).sort();
  if (maxUrls) urls = urls.slice(0, maxUrls);

  const checks = await mapWithConcurrency(urls, concurrency, (url) => checkUrl(url, timeoutMs));
  const broken = checks.filter((check) => !check.ok);
  const missing = broken.filter((check) => check.status === 404);

  const brokenReferences = broken.flatMap((check) =>
    referencesByUrl.get(check.url).map((ref) => ({
      ...ref,
      status: check.status,
      statusText: check.statusText,
      error: check.error || null,
    }))
  );

  const stamp = timestampForFile();
  const reportPath = path.join(__dirname, `image-integrity-audit-${stamp}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read_only_event_and_venue_image_integrity_audit',
    eventDocsScanned: eventDocs.size,
    venueDocsScanned: venueDocs.size,
    docsScanned: docs.size,
    uniqueManagedUrlsChecked: urls.length,
    referenceCount: Array.from(referencesByUrl.values()).reduce(
      (sum, refs) => sum + refs.length,
      0
    ),
    okUrlCount: checks.filter((check) => check.ok).length,
    brokenUrlCount: broken.length,
    missingUrlCount: missing.length,
    errorUrlCount: broken.filter((check) => check.status == null).length,
    checks,
    brokenReferences,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    reportPath,
    eventDocsScanned: report.eventDocsScanned,
    venueDocsScanned: report.venueDocsScanned,
    docsScanned: report.docsScanned,
    uniqueManagedUrlsChecked: report.uniqueManagedUrlsChecked,
    referenceCount: report.referenceCount,
    okUrlCount: report.okUrlCount,
    brokenUrlCount: report.brokenUrlCount,
    missingUrlCount: report.missingUrlCount,
    errorUrlCount: report.errorUrlCount,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
