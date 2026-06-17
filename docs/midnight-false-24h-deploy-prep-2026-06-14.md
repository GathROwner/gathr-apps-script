# Midnight False 24h Deploy Prep - 2026-06-14

## Goal

Ship the PEERS/WERK NIGHT fix today after the large parser run completes:

- Parser: explicit ranges like `9 PM - Midnight` must resolve to `21:00 -> 00:00`, with the end date moved to the next day.
- Parser: operating-hours-only extracted items must be rejected deterministically at Stage 4.
- Backend API: Firestore v2 event responses should not serve historical false-24-hour midnight docs, and should return no-store cache headers.
- Data repair: any live docs already written with the false-24-hour or operating-hours-only shape should be backed up and repaired/deleted after review.

## Deploy Scope

Functions deploy scope:

- `functions/src/parsing/postParser.ts`
- `functions/src/parsing/postParser.integrityFollowup.test.ts`
- `functions/src/parsing/secondaryValidator.ts`
- `functions/src/parsing/secondaryValidator.operatingHours.test.ts`

Backend deploy scope:

- `gathr-backend/backend/services/firestoreService.js`
- `gathr-backend/backend/routes/v2/events.js`
- `gathr-backend/backend/routes/v2/venues.js`

Backend pre-existing deploy-relevant change:

- `gathr-backend/server.js` currently contains the Baba's Island Jazz generic fallback suppression change. A Cloud Run `--source .` deploy will include it. It is not part of the midnight fix, but it is not a log/report file either.

Operational scripts/docs only:

- `firebase/audit-midnight-false-24h-events.js`
- `firebase/apply-midnight-false-24h-repairs.js`
- `firebase/verify-midnight-api-deploy.js`
- `firebase/audit-operating-hours-events.js`
- `firebase/delete-operating-hours-events.js`
- `docs/event-cleanup-weakness-log-2026-06-07.md`
- `docs/midnight-false-24h-deploy-prep-2026-06-14.md`

Important: the repo has many pre-existing modified source files from previous cleanup/parser work. Do not treat the word "dirty" as meaning only generated logs. Before deploying, confirm whether those source edits are already intentionally part of the live deployed state. Avoid a clean checkout deploy unless we first confirm it will not roll back recent parser/image/cleanup fixes. If deploying from the current worktrees, the deployment should be described as shipping the accumulated verified parser/backend fixes plus the new midnight fix.

## Pre-Deploy Checks After Large Parse Completes

From `C:\Users\craig\Dev\gathr-apps-script`:

```powershell
gcloud logging read "resource.type=cloud_run_revision AND (resource.labels.service_name=processdataset OR resource.labels.service_name=processdatasetresume OR resource.labels.service_name=processdatasetselectedrows)" --project=gathr-migrated --freshness=30m --limit=20 --format=json
```

Confirm the parse is complete or no longer actively processing rows.

From `C:\Users\craig\Dev\gathr-apps-script\firebase`:

```powershell
node audit-midnight-false-24h-events.js
node audit-operating-hours-events.js
```

Review the generated `midnight-false-24h-audit-*.json` report. If it only contains clear false-24-hour midnight events and the user approves:

```powershell
node apply-midnight-false-24h-repairs.js --report .\midnight-false-24h-audit-<timestamp>.json --apply
```

Review the generated `operating-hours-event-audit-*.json` report. If it only contains clear operating-hours-only event docs and the user approves:

```powershell
node delete-operating-hours-events.js --report .\operating-hours-event-audit-<timestamp>.json --apply
```

Both scripts create backups before writing and verify afterward.

## Functions Verification

From `C:\Users\craig\Dev\gathr-apps-script\functions`:

```powershell
npm run build
node --test lib/parsing/postParser.integrityFollowup.test.js
node --test lib/parsing/secondaryValidator.operatingHours.test.js
npm run verify:parser-env
```

Known-good deploy command:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --only functions:gathr-functions --project gathr-migrated
```

After deploy, confirm relevant revisions advanced:

```powershell
gcloud run services describe processdataset --region northamerica-northeast2 --project gathr-migrated --format="value(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)"
gcloud run services describe processdatasetresume --region northamerica-northeast1 --project gathr-migrated --format="value(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)"
```

## Backend Verification

From `C:\Users\craig\Dev\gathr-apps-script\gathr-backend`:

```powershell
node --check backend\services\firestoreService.js
node --check backend\routes\v2\events.js
node --check backend\routes\v2\venues.js
node --check server.js
```

Deploy the active public backend region:

```powershell
gcloud run deploy gathr-backend --source . --region northamerica-northeast1 --project gathr-migrated --quiet
```

After deploy:

```powershell
gcloud run services describe gathr-backend --region northamerica-northeast1 --project gathr-migrated --format="value(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)"
```

Then from `C:\Users\craig\Dev\gathr-apps-script\firebase`:

```powershell
node verify-midnight-api-deploy.js
```

Expected result after backend deploy and/or data repair:

- `foundInLiveApi: false`
- `noStoreHeaderPresent: true`

## Post-Deploy Audits

From `C:\Users\craig\Dev\gathr-apps-script\firebase`:

```powershell
node audit-midnight-false-24h-events.js
node audit-operating-hours-events.js
node audit-event-image-provenance.js --sampleSize 30 --sinceHours 8
node audit-event-image-integrity.js --concurrency 20 --timeoutMs 10000
node audit-event-shared-source-images.js --minGroupSize 3 --minConfidence medium
node audit-event-duplicates.js --windowStart 2026-06-01 --windowEnd 2026-08-31 --minConfidence medium
```

Do not perform Firestore writes from audit output without showing exact target docs and getting approval.

## Known Current PEERS Target

- Path: `venues/slug_peersalliance/events/GBtwC7jmlpUrX55NfWc1`
- Title: `WERK NIGHT`
- Stored: `2026-06-13 21:00` to `2026-06-14 21:00`
- Source text: `Saturday, June 13th. 9 PM - Midnight.`
- Correct stored end should be: `endDate=2026-06-14`, `endTime=00:00`, or the event can be deleted because it is now over.

## Known Current Operating-Hours Target

- Path: `venues/slug_islandchefdowntownloungeandeatery/events/jz456G5d13rzHqGtZodH`
- Title: `Operating Hours (Sunday-Thursday)`
- Venue: `Island Chef Downtown Lounge & Eatery`
- Stored: recurring weekly custom, `11:00` to `20:30`
- Source text: `Regular hours Sunday-Thursday: 11:00 AM - 8:30 PM.`
- Correct action: delete the event doc after backup. Do not delete the venue or source metadata.
