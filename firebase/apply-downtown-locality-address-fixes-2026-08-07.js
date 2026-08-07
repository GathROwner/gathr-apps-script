'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

const EXPECTED_VENUES = 2;
const EXPECTED_EVENTS = 10;
const planPath = path.resolve(
  __dirname,
  'artifacts/downtown-locality-address-preview-2026-08-07.json'
);
const projectId = serviceAccount.project_id || 'gathr-migrated';

if (!process.argv.includes('--apply')) {
  throw new Error('Refusing to write without --apply');
}
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });
}
const db = admin.firestore();

function serialize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { __type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.path === 'string' && typeof value.get === 'function') {
    return { __type: 'document_reference', path: value.path };
  }
  if (Array.isArray(value)) return value.map(serialize);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, serialize(entry)])
  );
}

function addressState(data) {
  return serialize({
    address: data.address,
    rawAddress: data.rawAddress,
    normalizedAddress: data.normalizedAddress,
    addressSource: data.addressSource,
    addressNormalizationIssues: data.addressNormalizationIssues,
    addressUpdatedAt: data.addressUpdatedAt,
    updatedAt: data.updatedAt,
  });
}

function fingerprint(data) {
  return crypto.createHash('sha256').update(JSON.stringify(addressState(data))).digest('hex');
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const actions = [...plan.venueActions, ...plan.eventActions];

  if (
    plan.venueActions.length !== EXPECTED_VENUES ||
    plan.eventActions.length !== EXPECTED_EVENTS
  ) {
    throw new Error(
      `Unexpected plan size: ${plan.venueActions.length} venues, ${plan.eventActions.length} events`
    );
  }
  for (const action of actions) {
    const issues = action.plannedUpdate.addressNormalizationIssues || [];
    if (issues.length !== 1 || issues[0] !== 'downtown_locality_qualifier') {
      throw new Error(`Unexpected issue scope for ${action.path}: ${JSON.stringify(issues)}`);
    }
  }

  const live = [];
  for (const action of actions) {
    const snapshot = await db.doc(action.path).get();
    if (!snapshot.exists) throw new Error(`Missing approved document: ${action.path}`);
    const data = snapshot.data();
    const liveFingerprint = fingerprint(data);
    if (liveFingerprint !== action.beforeFingerprint) {
      throw new Error(`Stale state for ${action.path}; refusing all writes`);
    }
    live.push({ action, snapshot, data });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    __dirname,
    `artifacts/downtown-locality-address-backup-${timestamp}.json`
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(
    backupPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      projectId,
      planPath,
      documents: live.map(({ action, data }) => ({ path: action.path, data: serialize(data) })),
    }, null, 2)}\n`,
    'utf8'
  );

  const batch = db.batch();
  for (const { action, snapshot } of live) {
    batch.update(snapshot.ref, {
      ...action.plannedUpdate,
      addressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  const verification = [];
  for (const { action } of live) {
    const snapshot = await db.doc(action.path).get();
    const data = snapshot.data();
    verification.push({
      path: action.path,
      address: data.address,
      matches: data.address === action.plannedUpdate.address,
    });
  }
  const failed = verification.filter((entry) => !entry.matches);
  if (failed.length) throw new Error(`Verification failed: ${JSON.stringify(failed)}`);

  console.log(JSON.stringify({
    projectId,
    backupPath,
    updated: verification.length,
    venues: plan.venueActions.length,
    events: plan.eventActions.length,
    verification,
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
