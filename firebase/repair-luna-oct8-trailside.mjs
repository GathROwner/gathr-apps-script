import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { buildExpandedEventStoredUniqueId } from '../functions/lib/processing/rowProcessor.js';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const planArg = args.find(arg => arg.startsWith('--plan='));
if (args.some(arg => arg !== '--apply' && !arg.startsWith('--plan=')) ||
    (apply && !planArg) || (!apply && planArg)) {
  throw new Error('Use no arguments for a dry run, or --apply --plan=<dry-run plan path>');
}
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath) throw new Error('Set GATHR_SERVICE_ACCOUNT_PATH');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
if (key.project_id !== 'gathr-migrated') throw new Error('Unexpected Firebase project');
const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id },
  'lunaOct8TrailsideRepair');
const db = admin.firestore(app);
const venueId = 'slug_trailsidemusichall';
const venueName = 'Trailside Music Hall';
const sourceRoot = '1552488536897478';
const collection = db.collection(`venues/${venueId}/events`);
const templateRef = collection.doc('qaCg89kgjsn0WPJyz8sC');
const targetRef = collection.doc('trailside-fucked-up-club-rat-2026-10-08');
const artifactDir = path.resolve('functions/artifacts/luna-oct8-full-audit');
const replay = JSON.parse(await fs.readFile(path.join(artifactDir, 'row212-local-readonly.json'), 'utf8'));
const ledger = JSON.parse(await fs.readFile(path.join(artifactDir, 'ledger.json'), 'utf8'));
const source = ledger.find(row => row.row === 212 && row.postId === sourceRoot);
const item = replay.events?.[0];
if (replay.row !== 212 || replay.postId !== sourceRoot || replay.events?.length !== 1 ||
    !source || !source.caption.includes('TONIGHT! Huge show at the Trailside') ||
    item?.name !== 'Fucked Up with opener Club Rat' ||
    item.startDate !== '2026-10-08' || item.endDate !== '2026-10-09' ||
    item.startTime !== '20:00' || item.endTime !== '01:00' ||
    item.isRecurring !== 'No' || item.recurringPattern !== 'none') {
  throw new Error('Verified Trailside October 8 source/replay changed');
}
const imageUrl = source.mediaUrls?.[0];
if (!imageUrl?.startsWith('https://scontent-')) throw new Error('Source poster URL missing');
const imageResponse = await fetch(imageUrl, { method: 'HEAD' });
if (!imageResponse.ok) throw new Error(`Source poster no longer loads: HTTP ${imageResponse.status}`);
const [template, target, venueEvents] = await Promise.all([
  templateRef.get(), targetRef.get(), collection.get(),
]);
if (target.exists) throw new Error(`Planned event already exists: ${targetRef.path}`);
if (!template.exists) throw new Error('Trailside venue template missing');
const templateData = template.data();
if (templateData.eventName !== 'NINTH ANNUAL JOHN PRINE TRIBUTE' ||
    templateData.startDate !== '2026-10-09' || templateData.venueId !== venueId) {
  throw new Error('Trailside venue template changed');
}
const sameSourceIds = venueEvents.docs
  .filter(doc => String(doc.data().uniqueId || '').startsWith(`${sourceRoot}_`))
  .map(doc => doc.id).sort();
if (sameSourceIds.length) throw new Error(`Trailside source already written: ${sameSourceIds}`);
const sameDate = venueEvents.docs.filter(doc => doc.data().startDate === '2026-10-08')
  .map(doc => ({ path: doc.ref.path, title: doc.data().eventName,
    startTime: doc.data().startTime, uniqueId: doc.data().uniqueId }))
  .sort((a, b) => a.path.localeCompare(b.path));
if (sameDate.length) throw new Error(`Other Trailside October 8 event needs review: ${JSON.stringify(sameDate)}`);
const nowStamp = admin.firestore.FieldValue.serverTimestamp();
const data = {
  ...templateData,
  uniqueId: buildExpandedEventStoredUniqueId({
    row: { uniqueId: sourceRoot, sourceScraperType: 'posts' },
    eventName: item.name, startDate: item.startDate, endDate: item.endDate,
    startTime: item.startTime, endTime: item.endTime, venueName,
    additionalLocation: item.additionalLocation,
  }),
  eventName: item.name, name: item.name, description: item.description,
  category: item.category, startDate: item.startDate, endDate: item.endDate,
  startTime: item.startTime, endTime: item.endTime,
  eventType: 'live_music', timeFlags: item.timeFlags,
  timeResolution: item.timeResolution,
  isRecurring: 'No', recurringPattern: 'none',
  ticketLink: 'https://www.trailside.ca', ticketsBuyUrl: 'https://www.trailside.ca',
  ticketPrice: '', price: '', externalLinks: [],
  image: imageUrl, imageUrl, relevantImageUrl: imageUrl, mediaUrls: [imageUrl],
  imageProvenance: {
    version: 1, primaryUrl: imageUrl, primaryField: 'relevantImageUrl',
    primarySource: 'post_media', isFallback: false,
    selectionReason: 'source_verified_oct8_poster',
    sourceFields: ['relevantImageUrl', 'image', 'imageUrl', 'mediaUrls'],
    media: [{ url: imageUrl, source: 'post_media' }],
    updatedBy: 'source_verified_repair', setAt: nowStamp,
  },
  facebookUrl: 'https://www.facebook.com/TrailsideMusicHall',
  cleanedFacebookUrl: 'https://www.facebook.com/TrailsideMusicHall',
  sourceTimestamp: admin.firestore.Timestamp.fromDate(new Date(source.postedAt)),
  likes: 0, shares: 0, topReactionsCount: 0,
};
delete data.totalOccurrences;
delete data.recurrenceUntilDate;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Server timestamp sentinels do not have stable JSON; compare all other fields.
const stableData = { ...data, imageProvenance: { ...data.imageProvenance, setAt: 'SERVER_TIMESTAMP' } };
const summary = {
  project: key.project_id, sourceRoot, venueId, sourceDate: item.startDate,
  sourceImage: imageUrl, sourceImageStatus: imageResponse.status,
  templatePath: templateRef.path,
  templateUpdateTime: template.updateTime.toDate().toISOString(),
  templateHash: hash(templateData), sameSourceIds, sameDate,
  create: { path: targetRef.path, title: item.name, date: item.startDate,
    time: item.startTime, ticket: data.ticketLink,
    uniqueId: data.uniqueId, dataHash: hash(stableData) },
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (!apply) {
  const backupPath = path.join(artifactDir, `trailside-backup-${stamp}.json`);
  const planPath = path.join(artifactDir, `trailside-plan-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(),
    template: { path: templateRef.path,
      updateTime: template.updateTime.toDate().toISOString(), data: templateData },
    sameSourceIds, sameDate }, null, 2));
  await fs.writeFile(planPath, JSON.stringify({ ...summary, backupPath }, null, 2));
  console.log(JSON.stringify({ mode: 'dry-run', planPath, backupPath, ...summary }, null, 2));
  process.exit(0);
}
const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice('--plan='.length)), 'utf8'));
const { backupPath: _backupPath, ...approved } = plan;
if (JSON.stringify(approved) !== JSON.stringify(summary)) {
  throw new Error('Trailside source, image, venue events, or template changed since approved dry run');
}
const batch = db.batch();
batch.create(targetRef, { ...data, createdAt: nowStamp,
  updatedAt: nowStamp, lastSeenAt: nowStamp });
await batch.commit();
const after = await targetRef.get();
const ok = after.exists && after.data().uniqueId === data.uniqueId &&
  after.data().startDate === '2026-10-08' &&
  after.data().ticketLink === 'https://www.trailside.ca';
const resultPath = path.join(artifactDir, `trailside-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify({ completedAt: new Date().toISOString(),
  planPath: path.resolve(planArg.slice('--plan='.length)), ok, created: targetRef.path }, null, 2));
console.log(JSON.stringify({ resultPath, ok, created: targetRef.path }));
if (!ok) process.exitCode = 1;
