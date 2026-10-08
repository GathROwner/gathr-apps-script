import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

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
admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
const db = admin.firestore();

// These paths and fingerprints are the source-verified October 8 defects only.
// Kept Tipsy daily specials and public Bell Aliant activities are never targets.
const targets = [
  ['delete', 'venues/fb_100064337752910/events/OXNqzwt90jRPs1VhIgA6', 'Final-day council nomination submissions', '1523609006460343_f081098571726cac', '2026-10-16', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/53BOryllIcYWV9W5CPPb', 'Shepherds Pie', '1131897499367282_598186f60de86f88', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/fJKNqZRr7RKyvmaEHUMN', 'Clam Chowder', '1131897499367282_a75be70ffa28996c', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/Or7ANqQ1Cl0cM6UvQkrj', 'Classic Mac ‘n Cheese', '1131897499367282_b908cce0d3a377da', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/Sc1G0RSx6cLSSMSlPlrf', 'Beef Chilli', '1131897499367282_dc556202e1cebf7a', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/737iCoJsAL5076HCTXQB', 'Chicken Bacon Alfredo', '1131897499367282_e06a98bc4045f3c7', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/xsqB0d3zat3nv0d83DSJ', 'Beef + Barley Soup', '1131897499367282_e8ab8b010ec7e55f', '2026-10-07', 'none'],
  ['delete', 'venues/slug_tipsyfarmers/events/xg6mVBDusRS5SBRqt58m', 'Carrot + Ginger Soup', '1131897499367282_ef203247bde88a1a', '2026-10-07', 'none'],
  ['delete', 'venues/slug_thepeicostore/events/oQNkGHY7Wqz0DgqnsZN5', '25% Off Christmas Décor', '1710132027779560_38d68a70681f1880', '2026-10-08', 'none'],
  ['update', 'venues/og4maVJ5Z2V4HcXCrDNY/events/CSOQnZG8ZvlGGrJRuRl3', 'Kraft Salad Mix Macaroni 200 g', '1688522943286210_fe8c427c9553a697', '2026-10-08', 'weekly_thursday'],
  ['delete', 'venues/og4maVJ5Z2V4HcXCrDNY/events/HvwY2fIDPevrMDktcXw4', 'Lattice Crust Apple Pies', '1688030250002146_7da7efe21c993e0c', '2026-10-08', 'none'],
  ['delete', 'venues/slug_bellaliantcentre/events/3sSaAmoHi35ivs1YKhW9', 'All Pools Closed for Swimming Lessons', '1525967399551178_7b560f8f246bc8c6', '2026-10-08', 'none'],
].map(([action, documentPath, title, uniqueId, startDate, pattern]) =>
  ({ action, path: documentPath, title, uniqueId, startDate, pattern }));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve('functions/artifacts/luna-oct8-full-audit');
await fs.mkdir(outputDir, { recursive: true });
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const captured = [];
for (const target of targets) {
  const ref = db.doc(target.path);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Target missing: ${target.path}`);
  const data = snap.data();
  if (data.eventName !== target.title || data.name !== target.title ||
      data.uniqueId !== target.uniqueId || data.startDate !== target.startDate ||
      data.endDate !== target.startDate || data.recurringPattern !== target.pattern ||
      data.isRecurring !== (target.pattern === 'none' ? 'No' : 'Yes')) {
    throw new Error(`Target fingerprint changed: ${target.path}`);
  }
  captured.push({ ...target, updateTime: snap.updateTime.toDate().toISOString(),
    dataHash: hash(data), data, ref, snap });
}
const bySource = new Map();
for (const item of captured) {
  const venuePath = item.path.slice(0, item.path.lastIndexOf('/'));
  const root = item.uniqueId.split('_')[0];
  const key = `${venuePath}|${root}`;
  if (!bySource.has(key)) bySource.set(key, { venuePath, root });
}
const siblings = [];
for (const { venuePath, root } of bySource.values()) {
  const docs = await db.collection(venuePath).get();
  siblings.push({ venuePath, root, ids: docs.docs
    .filter(doc => String(doc.data().uniqueId || '').startsWith(`${root}_`))
    .map(doc => doc.id).sort() });
}
siblings.sort((a, b) => `${a.venuePath}|${a.root}`.localeCompare(`${b.venuePath}|${b.root}`));
const summary = captured.map(({ action, path: docPath, title, uniqueId, startDate,
  pattern, updateTime, dataHash }) =>
  ({ action, path: docPath, title, uniqueId, startDate, pattern, updateTime, dataHash }));

if (!apply) {
  const backupPath = path.join(outputDir, `live-cleanup-backup-${stamp}.json`);
  const planPath = path.join(outputDir, `live-cleanup-plan-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(),
    project: key.project_id, records: captured.map(({ path: docPath, updateTime, data }) =>
      ({ path: docPath, updateTime, data })), siblings }, null, 2));
  await fs.writeFile(planPath, JSON.stringify({ createdAt: new Date().toISOString(),
    project: key.project_id, backupPath, targets: summary, siblings }, null, 2));
  console.log(JSON.stringify({ mode: 'dry-run', planPath, backupPath,
    deleteCount: summary.filter(item => item.action === 'delete').length,
    updateCount: summary.filter(item => item.action === 'update').length,
    targets: summary.map(({ action, path: docPath, title }) =>
      ({ action, path: docPath, title })), siblings }, null, 2));
  process.exit(0);
}

const plan = JSON.parse(await fs.readFile(path.resolve(planArg.slice('--plan='.length)), 'utf8'));
if (plan.project !== key.project_id || !Array.isArray(plan.targets) ||
    JSON.stringify(plan.targets) !== JSON.stringify(summary) ||
    JSON.stringify(plan.siblings) !== JSON.stringify(siblings)) {
  throw new Error('Live records or same-source siblings changed since approved dry run');
}
const batch = db.batch();
for (const item of captured) {
  if (item.action === 'delete') batch.delete(item.ref, { lastUpdateTime: item.snap.updateTime });
  else batch.update(item.ref, { isRecurring: 'No', recurringPattern: 'none' },
    { lastUpdateTime: item.snap.updateTime });
}
await batch.commit();
const verified = [];
for (const item of captured) {
  const after = await item.ref.get();
  const ok = item.action === 'delete' ? !after.exists :
    after.exists && after.data().isRecurring === 'No' &&
    after.data().recurringPattern === 'none' &&
    after.data().startDate === '2026-10-08';
  verified.push({ action: item.action, path: item.path, ok });
}
const resultPath = path.join(outputDir, `live-cleanup-result-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify({ planPath: path.resolve(planArg.slice('--plan='.length)),
  completedAt: new Date().toISOString(), verified }, null, 2));
console.log(JSON.stringify({ resultPath, verified }, null, 2));
if (verified.some(item => !item.ok)) process.exitCode = 1;
