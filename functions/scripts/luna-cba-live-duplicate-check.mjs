import fs from 'node:fs/promises';
import admin from 'firebase-admin';

const [serviceAccountPath, reportPath] = process.argv.slice(2);
if (!serviceAccountPath || !reportPath) throw new Error('Expected service account and dry-run report');
const credentials = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: credentials.project_id });
const { checkDuplicate } = await import('../lib/services/firestoreService.js');
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const payload = report.payloads?.[0];
if (!payload || payload.venueId !== 'slug_thecorkandcast' || payload.startDate !== '2026-10-20') {
  throw new Error('Unexpected CBA dry-run payload');
}
const result = await checkDuplicate({ ...payload, eventName: payload.name }, payload.venueId);
console.log(JSON.stringify({ isDuplicate: result.isDuplicate,
  existingEventId: result.existingEvent?.id || null,
  existingEventName: result.existingEvent?.eventName || null }, null, 2));
