'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

const EXPECTED_COUNT = 87;
const projectId = serviceAccount.project_id || 'gathr-migrated';
const planPath = path.resolve(
  __dirname,
  'artifacts/address-normalization-cleanup-preview-2026-08-07.json'
);

if (!process.argv.includes('--apply-events')) {
  throw new Error('Refusing to write without --apply-events');
}
const countIndex = process.argv.indexOf('--confirm-count');
if (countIndex < 0 || Number(process.argv[countIndex + 1]) !== EXPECTED_COUNT) {
  throw new Error(`Refusing to write without --confirm-count ${EXPECTED_COUNT}`);
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
  const actions = Array.isArray(plan.eventActions) ? plan.eventActions : [];
  if (actions.length !== EXPECTED_COUNT) {
    throw new Error(`Plan contains ${actions.length} event actions; expected ${EXPECTED_COUNT}`);
  }

  const snapshots = [];
  const stale = [];
  for (const action of actions) {
    const ref = db.doc(action.path);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      stale.push({ path: action.path, reason: 'missing' });
      continue;
    }
    const currentFingerprint = fingerprint(snapshot.data());
    if (currentFingerprint !== action.beforeFingerprint) {
      stale.push({
        path: action.path,
        reason: 'fingerprint_changed',
        expected: action.beforeFingerprint,
        actual: currentFingerprint,
      });
    }
    snapshots.push({ action, ref, snapshot });
  }

  if (stale.length > 0) {
    throw new Error(`Stale-state check failed for ${stale.length} event(s): ${JSON.stringify(stale)}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    __dirname,
    `artifacts/address-normalization-event-backup-${timestamp}.json`
  );
  const backup = {
    createdAt: new Date().toISOString(),
    projectId,
    approvedScope: 'event_documents_only',
    documentCount: snapshots.length,
    documents: snapshots.map(({ action, snapshot }) => ({
      path: action.path,
      beforeFingerprint: action.beforeFingerprint,
      data: serialize(snapshot.data()),
    })),
  };
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');

  const batch = db.batch();
  for (const { action, ref } of snapshots) {
    batch.update(ref, {
      address: action.plannedUpdate.address,
      rawAddress: action.plannedUpdate.rawAddress,
      normalizedAddress: action.plannedUpdate.normalizedAddress,
      addressSource: action.plannedUpdate.addressSource,
      addressNormalizationIssues: action.plannedUpdate.addressNormalizationIssues,
      addressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  const verificationFailures = [];
  for (const { action, ref } of snapshots) {
    const after = await ref.get();
    const data = after.data() || {};
    if (
      data.address !== action.plannedUpdate.address ||
      data.normalizedAddress !== action.plannedUpdate.normalizedAddress ||
      data.rawAddress !== action.plannedUpdate.rawAddress ||
      data.addressSource !== action.plannedUpdate.addressSource
    ) {
      verificationFailures.push({
        path: action.path,
        expected: action.plannedUpdate,
        actual: addressState(data),
      });
    }
  }

  const resultPath = path.resolve(
    __dirname,
    `artifacts/address-normalization-event-result-${timestamp}.json`
  );
  const result = {
    appliedAt: new Date().toISOString(),
    projectId,
    approvedScope: 'event_documents_only',
    attempted: snapshots.length,
    verified: snapshots.length - verificationFailures.length,
    verificationFailures,
    backupPath,
  };
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
  if (verificationFailures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
