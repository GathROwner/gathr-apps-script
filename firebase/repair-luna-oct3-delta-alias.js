#!/usr/bin/env node
// Add the source-printed hotel name as a guarded venue alias after CBA relocation.
const fs = require('node:fs');
const path = require('node:path');
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
if (!keyPath || !path.isAbsolute(keyPath)) throw new Error('Set absolute GATHR_SERVICE_ACCOUNT_PATH.');
const admin = require(require.resolve('firebase-admin', { paths: [path.dirname(keyPath)] }));
admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();
const apply = process.argv.includes('--apply');
const ref = db.doc('venues/slug_thecorkandcast');
const outDir = path.resolve(__dirname, '../artifacts/luna-oct3-canary-audit');

async function main() {
  if (process.argv.some(arg => arg.startsWith('--') && arg !== '--apply')) {
    throw new Error('Only --apply is supported. Default is dry run.');
  }
  const doc = await ref.get();
  if (!doc.exists) throw new Error('Delta venue missing.');
  const data = doc.data();
  if (data.name !== 'Delta Hotels by Marriott Prince Edward | Charlottetown PE' ||
      data.googlePlaceId !== 'ChIJafTyeuJSXksRfB4nqjM1eRc' ||
      data.address !== '18 Queen St, Charlottetown, PE C1A 4A1, Canada' ||
      data.facebookUrl || data.pageurl || data.pagenameSlug ||
      JSON.stringify(data.aliases) !== JSON.stringify(['Delta Hotel by Marriott']) ||
      JSON.stringify(data.aliasesNormalized) !== JSON.stringify(['delta hotel by marriott'])) {
    throw new Error('Delta identity or alias baseline changed.');
  }
  const sourceAlias = 'The Delta Prince Edward';
  const aliases = [...data.aliases, sourceAlias];
  const aliasesNormalized = [...data.aliasesNormalized, sourceAlias.toLowerCase()];
  const plan = { mode: apply ? 'apply' : 'dry-run', path: ref.path,
    aliases, aliasesNormalized, source: 'printed CBA PEI half-day CLE venue' };
  if (!apply) { console.log(JSON.stringify(plan, null, 2)); return; }
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(outDir, `delta-alias-live-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ path: ref.path,
    updateTime: doc.updateTime.toDate().toISOString(), data }, null, 2));
  await ref.update({ aliases, aliasesNormalized,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { lastUpdateTime: doc.updateTime });
  const after = await ref.get();
  if (JSON.stringify(after.get('aliases')) !== JSON.stringify(aliases) ||
      JSON.stringify(after.get('aliasesNormalized')) !== JSON.stringify(aliasesNormalized)) {
    throw new Error(`Write committed but verification failed; inspect ${backupPath}`);
  }
  const resultPath = path.join(outDir, `delta-alias-live-result-${stamp}.json`);
  fs.writeFileSync(resultPath, JSON.stringify({ ...plan, backupPath,
    appliedAt: new Date().toISOString(), verified: true }, null, 2));
  console.log(JSON.stringify({ mode: 'applied', backupPath, resultPath, verified: true }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => admin.app().delete());
