# Deploy Runbook (Firebase Functions)

Use this for parser/logging code changes in this repo.

## Related Docs
- Unknown venue cloud pipeline (queue/resolver/email/manual review/finalize): `docs/UNKNOWN-VENUE-CLOUD-PIPELINE-README.md`

## Known-good deploy path
1. `cd functions`
2. Set discovery timeout for this environment:
   - PowerShell: `$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'`
3. Deploy the functions codebase:
   - `firebase deploy --only functions:gathr-functions --project gathr-migrated`

## Shared-Event Mobile Test Target
- 2026-06-23 observation: iOS preview app shared-event traffic for `submitSharedEvent` and `uploadSharedEventImage` landed in Firebase project `gathr-m1`, not `gathr-migrated`.
- This appears consistent with private shared-event/user-profile writes living with the app's user data in `gathr-m1`, while the public parser/project runbooks often target `gathr-migrated`.
- Before testing or deploying shared-event changes from a phone, verify the live target with:
  - `gcloud logging read 'resource.type="cloud_run_revision" AND (resource.labels.service_name="submitsharedevent" OR resource.labels.service_name="uploadsharedeventimage")' --project gathr-m1 --freshness=2h --limit=20 --format='table(timestamp,resource.labels.service_name,jsonPayload.message)'`
- If phone traffic is hitting `gathr-m1`, deploy shared-event functions there as well:
  - `firebase deploy --only functions:gathr-functions --project gathr-m1`
- After any `gathr-m1` deploy, verify parser guardrails explicitly:
  - `node scripts/verify-parser-env.mjs --project gathr-m1`

## Why this is the default
- The Firebase project config (`firebase.json`) is inside `functions/`, not repo root.
- Deploying from repo root fails with:
  - `Not in a Firebase app directory (could not locate firebase.json)`
- Filtering by function name can fail in this setup:
  - `--only functions:processDatasetResume` may return `No function matches given --only filters`
- Deploying the codebase target (`functions:gathr-functions`) is reliable.

## Quick verification after deploy
1. Confirm service revision advanced:
   - `gcloud run services describe processdatasetresume --region northamerica-northeast1 --project gathr-migrated --format='value(status.latestCreatedRevisionName,status.latestReadyRevisionName,status.traffic[0].revisionName,status.traffic[0].percent)'`
2. Confirm new logs come from the new revision:
   - `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="processdatasetresume" AND resource.labels.location="northamerica-northeast1"' --project gathr-migrated --freshness=30m --limit=50 --format='table(timestamp,resource.labels.revision_name,jsonPayload.message)'`
3. Verify parser env guardrails (fails if Stage 2 score-routing flags drift):
   - `cd functions`
   - `npm run verify:parser-env`

## Env Update Safety
- Prefer `gcloud run services update ... --update-env-vars ...` for incremental flag changes.
- Do not use `--set-env-vars` unless you pass the complete required parser flag set.
- `--set-env-vars` can wipe existing model-router env keys and silently force expensive fallback routing.

## Notes
- If old log patterns still appear right after deploy, they may be from in-flight requests on the previous revision.
- Wait for the next task dispatch to confirm new log lines from the latest revision.
