'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');
const {
  isStructurallyAcceptableAddress,
  normalizeCanadianAddress,
} = require('../functions/lib/utils/addressNormalization.js');

const projectId = serviceAccount.project_id || 'gathr-migrated';
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

function inferSource(data, fallback) {
  const explicit = String(data.addressSource || '').trim();
  if (explicit) return explicit;
  if (String(data.googlePlaceId || data.placeId || '').trim()) return 'google_places';
  if (String(data.sourceSheet || '').trim().toLowerCase() === 'contact info') return 'contact_info';
  return fallback;
}

function buildAction(doc, fallbackSource) {
  const data = doc.data();
  const beforeAddress = String(data.address || '').trim();
  const normalized = normalizeCanadianAddress(beforeAddress);
  if (
    !normalized.changed ||
    !isStructurallyAcceptableAddress(beforeAddress) ||
    !isStructurallyAcceptableAddress(normalized.normalizedAddress)
  ) {
    return null;
  }

  return {
    path: doc.ref.path,
    name: String(data.name || data.eventName || '').trim() || null,
    beforeFingerprint: fingerprint(data),
    before: addressState(data),
    plannedUpdate: {
      address: normalized.normalizedAddress,
      rawAddress: String(data.rawAddress || beforeAddress).trim(),
      normalizedAddress: normalized.normalizedAddress,
      addressSource: inferSource(data, fallbackSource),
      addressNormalizationIssues: normalized.issues,
      addressUpdatedAt: '<server timestamp at apply>',
    },
  };
}

async function main() {
  const venueSnapshot = await db.collection('venues').get();
  const venueActions = [];
  const eventActions = [];
  const reviewOnly = [];

  for (const venueDoc of venueSnapshot.docs) {
    const venueData = venueDoc.data();
    const venueAddress = String(venueData.address || '').trim();
    const venueNormalization = normalizeCanadianAddress(venueAddress);
    const venueAction = buildAction(venueDoc, 'unknown');
    if (venueAction) venueActions.push(venueAction);
    if (
      venueNormalization.issues.length > 0 &&
      !venueAction
    ) {
      reviewOnly.push({
        path: venueDoc.ref.path,
        name: String(venueData.name || '').trim() || null,
        address: venueAddress,
        issues: venueNormalization.issues,
        reason: venueNormalization.issues.includes('ambiguous_component_order')
          ? 'ambiguous_component_order'
          : 'not_a_complete_civic_address',
      });
    }

    if (!venueAction) continue;
    const eventSnapshot = await venueDoc.ref.collection('events').get();
    for (const eventDoc of eventSnapshot.docs) {
      const eventAction = buildAction(eventDoc, 'venue');
      if (eventAction) eventActions.push(eventAction);
    }
  }

  const issueCounts = {};
  for (const action of [...venueActions, ...eventActions]) {
    for (const issue of action.plannedUpdate.addressNormalizationIssues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    projectId,
    mode: 'read_only_preview',
    summary: {
      venuesInspected: venueSnapshot.size,
      venueUpdates: venueActions.length,
      eventUpdates: eventActions.length,
      reviewOnly: reviewOnly.length,
      issueCounts,
    },
    safety: {
      staleStatePolicy: 'abort any document whose address-state SHA-256 differs at apply time',
      backupPolicy: 'write complete before states for every approved document before the first Firestore update',
      proposedBackupPath: 'firebase/artifacts/address-normalization-cleanup-backup-<apply-timestamp>.json',
      writesPerformed: false,
    },
    venueActions,
    eventActions,
    reviewOnly,
  };

  const outputArgIndex = process.argv.indexOf('--output');
  if (outputArgIndex >= 0 && process.argv[outputArgIndex + 1]) {
    const outputPath = path.resolve(process.argv[outputArgIndex + 1]);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2));
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
