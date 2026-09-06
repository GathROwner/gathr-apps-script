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

const TARGET_PATHS = [
  'venues/slug_confedcentre/events/i5rV9dIg2n9KwUD7R5gq',
  'venues/slug_sobeyfamilytheatre/events/25fkcLJtO9teSYpomDoY',
  'venues/slug_confedcentre/events/c285BGlYbTzbPRkFQtkQ',
  'venues/slug_sobeyfamilytheatre/events/J9PYe7ZIbxkyEMPvjov4',
  'venues/slug_ccoagallery/events/EPR0X4GLGqfogESGv2du',
  'venues/slug_sobeyfamilytheatre/events/NJohWlqWnB0dWMkbdyHg',
];

const UNIQUE_IDS = [
  '1392327566265948_1',
  '1459418062890231_4e55d20a4534d155',
  '1368680751963963_4',
  '1460496102782427_5360f722c20c13e3',
  '1455782159920488_6bf665eab9054fb8',
  '1525873122913553_6758bfef9182eef9',
];

function asIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString();
  }
  return String(value);
}

function compactEvent(doc) {
  const data = doc.data() || {};
  return {
    path: doc.ref.path,
    title: data.title || data.name || data.eventName || null,
    uniqueId: data.uniqueId || data.sourceUniqueId || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    isRecurring: data.isRecurring ?? null,
    recurringPattern: data.recurringPattern || null,
    recurrenceUntilDate: data.recurrenceUntilDate || null,
    venueId: data.venueId || null,
    venue: data.venue || data.establishment || null,
    sourceUrl: data.facebookUrl || data.sourceUrl || null,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
    lastSeenAt: asIso(data.lastSeenAt),
  };
}

function compactProvenance(doc, matchedField) {
  const data = doc.data() || {};
  return {
    path: doc.ref.path,
    matchedField,
    uniqueId: data.uniqueId || data.sourceUniqueId || null,
    sourceUniqueIds: data.sourceUniqueIds || null,
    eventName: data.eventName || data.title || data.name || null,
    publishedEventPath: data.publishedEventPath || null,
    fileId: data.fileId || data.lastSeenFileId || null,
    rowIndex: data.rowIndex ?? data.lastSeenRowIndex ?? null,
    status: data.status || null,
    action: data.action || data.finalization?.action || null,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

async function provenanceForCollection(collectionName) {
  const matches = new Map();
  const querySpecs = [
    ['uniqueId', 'in'],
    ['sourceUniqueId', 'in'],
    ['sourceUniqueIds', 'array-contains-any'],
  ];

  for (const [field, operator] of querySpecs) {
    try {
      const snapshot = await db
        .collection(collectionName)
        .where(field, operator, UNIQUE_IDS)
        .get();
      for (const doc of snapshot.docs) {
        matches.set(doc.ref.path, compactProvenance(doc, `${field} ${operator}`));
      }
    } catch (error) {
      matches.set(`error:${field}:${operator}`, {
        path: null,
        matchedField: `${field} ${operator}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Array.from(matches.values());
}

async function main() {
  const exact = [];
  for (const targetPath of TARGET_PATHS) {
    const snapshot = await db.doc(targetPath).get();
    exact.push(snapshot.exists ? compactEvent(snapshot) : { path: targetPath, exists: false });
  }

  const titleMatches = [];
  const allEvents = await db.collectionGroup('events').get();
  for (const doc of allEvents.docs) {
    const data = doc.data() || {};
    const title = String(data.title || data.name || data.eventName || '');
    if (/come\s+from\s+away/i.test(title)) titleMatches.push(compactEvent(doc));
  }

  const provenance = {};
  for (const collectionName of [
    'parse_snapshots',
    'event_update_audits',
    'processed_datasets',
  ]) {
    provenance[collectionName] = await provenanceForCollection(collectionName);
  }

  console.log(JSON.stringify({ exact, titleMatches, provenance }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });
