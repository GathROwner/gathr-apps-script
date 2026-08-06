'use strict';

const fs = require('node:fs');
const path = require('node:path');

const firebaseRoot = process.env.GATHR_FIREBASE_ROOT || 'C:\\Users\\craig\\Dev\\gathr-apps-script\\firebase';
const admin = require(require.resolve('firebase-admin', { paths: [firebaseRoot] }));
const serviceAccountPath =
  process.env.GATHR_SERVICE_ACCOUNT_PATH || path.join(firebaseRoot, 'service-account.json');
const apply = process.argv.includes('--apply');

const scheduleUrl = 'https://hpibet.com/Racing/Schedule';
const targets = [
  {
    path: 'venues/fb_100052606604879/events/L3NgkSMZqgvxRPryIJp0',
    eventName: 'Live Race Nights (Thursdays at Top of the Park)',
    expectedUpdateTime: '2026-07-10T13:24:37.245Z',
  },
  {
    path: 'venues/fb_100052606604879/events/HLQ7QiDYBFGkCWWr4M7Q',
    eventName: 'Ultimate Guest Experience package',
    expectedUpdateTime: '2026-07-10T13:53:48.822Z',
  },
];

admin.initializeApp({
  credential: admin.credential.cert(require(serviceAccountPath)),
});

const db = admin.firestore();

function assertStaleState(target, snapshot) {
  if (!snapshot.exists) throw new Error(`Missing target: ${target.path}`);
  const data = snapshot.data() || {};
  const updateTime = snapshot.updateTime?.toDate().toISOString();
  if (updateTime !== target.expectedUpdateTime) {
    throw new Error(`Stale approval for ${target.path}: updateTime is ${updateTime}`);
  }
  if (data.eventName !== target.eventName || data.ticketLink !== scheduleUrl || data.ticketsBuyUrl !== scheduleUrl) {
    throw new Error(`Stale approval for ${target.path}: approved false-ticket fields changed`);
  }
  if (data.startTime !== '07:58') {
    throw new Error(`Stale approval for ${target.path}: approved false startTime changed`);
  }
}

function correctedImageProvenance(data) {
  const existing = data.imageProvenance || {};
  const primaryUrl = String(data.relevantImageUrl || data.image || '').trim();
  const mediaUrls = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];
  const icon = String(data.icon || '').trim();
  const media = [];
  if (primaryUrl) {
    media.push({
      url: primaryUrl,
      source: 'manual',
      field: data.relevantImageUrl ? 'relevantImageUrl' : 'image',
      isPrimary: true,
      isFallback: true,
    });
  }
  for (const url of mediaUrls) {
    const normalized = String(url || '').trim();
    if (normalized && normalized !== primaryUrl) {
      media.push({ url: normalized, source: 'post_media', field: 'mediaUrls', isPrimary: false, isFallback: false });
    }
  }
  if (icon && icon !== primaryUrl) {
    media.push({ url: icon, source: 'profile_image', field: 'icon', isPrimary: false, isFallback: true });
  }
  return {
    version: 1,
    primarySource: primaryUrl ? 'manual' : 'no_image',
    primaryField: primaryUrl ? (data.relevantImageUrl ? 'relevantImageUrl' : 'image') : undefined,
    primaryUrl: primaryUrl || undefined,
    isFallback: true,
    sourceFields: Array.from(new Set(media.map((entry) => entry.field).filter(Boolean))),
    media,
    selectionReason: 'manual_preserve_image_after_schedule_link_reclassification',
    updatedBy: 'manual_action_link_correction_2026_08_06',
    setAt: admin.firestore.Timestamp.now(),
    previousSelectionReason: existing.selectionReason || undefined,
  };
}

function buildUpdates(data) {
  const externalLinks = Array.from(
    new Set([...(Array.isArray(data.externalLinks) ? data.externalLinks : []), scheduleUrl])
  );
  return {
    ticketLink: admin.firestore.FieldValue.delete(),
    ticketsBuyUrl: admin.firestore.FieldValue.delete(),
    actionLinks: [
      {
        url: scheduleUrl,
        role: 'schedule',
        label: 'View Schedule',
        confidence: 0.98,
        source: 'manual',
        evidence: 'HPI Two Week Schedule page; no ticket-purchase action',
      },
    ],
    externalLinks,
    startTime: '18:00',
    endDate: '2026-07-10',
    timeFlags: {
      start: {
        source: 'explicit',
        evidence: 'source_post: Post time is 6 PM',
      },
      end: data.timeFlags?.end || { source: 'none', toClose: false, evidence: '' },
    },
    imageProvenance: correctedImageProvenance(data),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    correctionReason: 'reclassified_nontransactional_hpi_schedule_link',
  };
}

async function main() {
  const snapshots = await Promise.all(targets.map((target) => db.doc(target.path).get()));
  snapshots.forEach((snapshot, index) => assertStaleState(targets[index], snapshot));

  const preview = snapshots.map((snapshot, index) => ({
    path: targets[index].path,
    before: snapshot.data(),
    updates: buildUpdates(snapshot.data() || {}),
  }));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', targets: preview.map(({ path, updates }) => ({ path, updates })) }, null, 2));
  if (!apply) return;

  const artifactDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(artifactDir, `redshores-action-link-backup-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        reason: 'Approved HPI schedule-link reclassification and false 07:58 correction',
        documents: snapshots.map((snapshot, index) => ({
          path: targets[index].path,
          updateTime: snapshot.updateTime?.toDate().toISOString(),
          data: snapshot.data(),
        })),
      },
      null,
      2
    )
  );

  await db.runTransaction(async (transaction) => {
    const refs = targets.map((target) => db.doc(target.path));
    const freshSnapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    freshSnapshots.forEach((fresh, index) => assertStaleState(targets[index], fresh));
    freshSnapshots.forEach((fresh, index) => {
      transaction.update(refs[index], buildUpdates(fresh.data() || {}));
    });
  });

  console.log(JSON.stringify({ applied: true, backupPath }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
