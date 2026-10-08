import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('artifacts/luna-oct8-full-audit');
const load = name => fs.readFile(path.join(root, name), 'utf8').then(JSON.parse);
const [cleanup, power, hunter, trailside] = await Promise.all([
  load('live-cleanup-plan-2026-10-08T18-57-36-933Z.json'),
  load('powerskate-plan-2026-10-08T19-00-50-553Z.json'),
  load('hunter-plan-2026-10-08T19-05-04-027Z.json'),
  load('trailside-plan-2026-10-08T19-05-03-974Z.json'),
]);
const base = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app';
const id = docPath => docPath.split('/').at(-1);
const deleted = [...cleanup.targets.filter(item => item.action === 'delete').map(item => item.path),
  ...power.deletes.map(item => item.path)];
const created = [...power.creates.map(item => item.path),
  ...hunter.creates.map(item => item.path), trailside.create.path];
const updated = cleanup.targets.filter(item => item.action === 'update').map(item => item.path);
const kept = [
  'venues/slug_tipsyfarmers/events/KGmelH90U1u4jPmxeXbR',
  'venues/slug_tipsyfarmers/events/ii3bGbYqqUCYVO1AFWxE',
  'venues/slug_tipsyfarmers/events/PNIzPxFRTDKVGAQpp9LG',
  'venues/fb_100064116963888/events/sy3avBQCRLbJdPqYSRqG',
  'venues/fb_100064116963888/events/ZysgKuFs6h8yORQARC38',
  'venues/slug_trailsidemusichall/events/qaCg89kgjsn0WPJyz8sC',
];
const all = [...deleted, ...created, ...updated, ...kept];
const details = [];
for (let i = 0; i < all.length; i += 6) {
  const chunk = await Promise.all(all.slice(i, i + 6).map(async docPath => {
    const response = await fetch(`${base}/api/v2/firestore/events/${encodeURIComponent(id(docPath))}`);
    let body = null;
    if (response.ok) body = await response.json();
    return { path: docPath, status: response.status,
      title: body?.event?.title, startDate: body?.event?.startDate,
      startTime: body?.event?.startTime,
      recurringPattern: body?.event?.recurringPattern,
      ticketLink: body?.event?.metadata?.ticketLink,
      ticketsBuyUrl: body?.event?.metadata?.ticketsBuyUrl };
  }));
  details.push(...chunk);
}
const feedIds = new Set();
const powerFeed = [];
let cursor = '';
let pages = 0;
while (pages < 30) {
  const url = new URL(`${base}/api/v2/firestore/events`);
  url.searchParams.set('includeExpired', 'false');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('startAfter', cursor);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`App feed HTTP ${response.status} on page ${pages + 1}`);
  const body = await response.json();
  for (const event of body.events || []) {
    feedIds.add(String(event.id || ''));
    if (event.venueId === 'LglliE42SPFssmoU01su' &&
        /powerskating/i.test(String(event.title || ''))) {
      powerFeed.push({ id: event.id, title: event.title,
        startDate: event.startDate, recurringPattern: event.recurringPattern });
    }
  }
  pages++;
  if (!body.nextPageToken) break;
  if (body.nextPageToken === cursor) throw new Error('App feed cursor repeated');
  cursor = body.nextPageToken;
}
if (pages === 30) throw new Error('App feed exceeded 30 pages');
const find = docPath => details.find(item => item.path === docPath);
const result = {
  checkedAt: new Date().toISOString(), base,
  detail: {
    deleted: deleted.map(find), created: created.map(find),
    updated: updated.map(find), kept: kept.map(find),
  },
  feed: {
    pages, count: feedIds.size,
    deletedPresent: deleted.filter(docPath => feedIds.has(id(docPath))),
    createdMissing: created.filter(docPath => !feedIds.has(id(docPath))),
    updatedMissing: updated.filter(docPath => !feedIds.has(id(docPath))),
    powerFeed,
  },
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultPath = path.join(root, `live-repair-api-verify-${stamp}.json`);
await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
const deletedOk = result.detail.deleted.every(item => item.status === 404);
const createdOk = result.detail.created.every(item => item.status === 200);
const updatedOk = result.detail.updated.every(item => item.status === 200 &&
  item.recurringPattern === 'none');
const keptOk = result.detail.kept.every(item => item.status === 200);
const trailsideOk = find(trailside.create.path)?.ticketLink === 'https://www.trailside.ca';
const expectedPowerIds = new Set(power.creates.map(item => id(item.path)));
const powerFeedOk = powerFeed.length === 20 &&
  powerFeed.every(item => expectedPowerIds.has(String(item.id)) &&
    item.recurringPattern === 'none' &&
    item.startDate !== '2026-11-07' && item.startDate !== '2026-11-08');
console.log(JSON.stringify({ resultPath, deleted: deleted.length, deletedOk,
  created: created.length, createdOk, updatedOk, keptOk, trailsideOk,
  powerFeedOk, feed: { ...result.feed, powerFeed: { count: powerFeed.length,
    unexpected: powerFeed.filter(item => !expectedPowerIds.has(String(item.id))) } } }, null, 2));
if (!deletedOk || !createdOk || !updatedOk || !keptOk || !trailsideOk ||
    !powerFeedOk || result.feed.deletedPresent.length ||
    result.feed.createdMissing.length) process.exitCode = 1;
