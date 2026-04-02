# Logging Runbook (Parser + Resume)

Use this as the first stop for parse troubleshooting.

Related deploy notes: `docs/deploy-runbook.md`.

## Project and region map
- Parser project: `gathr-migrated` (do not use `gath-m1` for parser analysis).
- Main batch parser service: `processdatasetresume` in `northamerica-northeast1`.
- Start/webhook services: `apifywebhook`, `processdataset`, `retryapifywebhook` in `northamerica-northeast2`.
- Image upload/delete service: `gathr-backend` in `northamerica-northeast1`.

## Where key logs live
- `processdatasetresume`:
  - Stage logs (`STAGE 1..5.6`)
  - Row progress and parse timing
  - GPT timing (`step=gpt_call`, component/model/imageCount/durationMs)
  - OCR upload/cleanup summaries
  - Pause/resume outcomes and lock mismatch skips
- `apifywebhook` and `processdataset`:
  - Run start, lock acquisition/skip, initial batch trigger
  - Task scheduling for resume
  - `processdataset` also runs one-off selected-row parses (`rowIndexes` / `rowIndex`)
- `gathr-backend`:
  - Actual image API request failures (`/upload-image`, `/delete-image`)
  - Useful for diagnosing `OCR image delete failed` causes
- Firestore (state of truth):
  - `processing_locks/{fileId}`: active run guard (`runId`, `status`, `expiresAt`)
  - `checkpoints/{fileId}`: current row/batch position for resume
  - `processed_datasets/{fileId}`: completion state and summary
  - `apify_webhooks/*`: inbound webhook history and status

## Fast query patterns
Replace `<FILE_ID>` and `<RUN_ID>`.

```powershell
# 1) Core parse timeline (most useful)
$f='resource.type="cloud_run_revision" AND resource.labels.service_name="processdatasetresume" AND resource.labels.location="northamerica-northeast1" AND jsonPayload.context.fileId="<FILE_ID>"'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=200 --format='table(timestamp,jsonPayload.message,jsonPayload.context.rowIndex,jsonPayload.context.step,jsonPayload.context.runId)'
```

```powershell
# 1b) Single-row Cloud Run trigger (selected row; logs appear in processdataset)
$body = @{
  fileId = "<FILE_ID>"
  rowIndexes = @(<ROW_INDEX>)
  parserMode = "full5stage"   # Use full 5-stage parser
  dryRun = $true              # Set false to persist writes
  resumeFromCheckpoint = $false
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post `
  -Uri "https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/processDataset" `
  -ContentType "application/json" `
  -Body $body
```

```powershell
# 1c) Logs for one-off selected-row run
$f='resource.type="cloud_run_revision" AND resource.labels.service_name="processdataset" AND resource.labels.location="northamerica-northeast2" AND jsonPayload.context.fileId="<FILE_ID>" AND jsonPayload.context.rowIndex=<ROW_INDEX>'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=300 --format='table(timestamp,jsonPayload.message,jsonPayload.context.step,jsonPayload.context.runId,resource.labels.revision_name)'
```

```powershell
# 2) GPT timing only
$f='resource.type="cloud_run_revision" AND resource.labels.service_name="processdatasetresume" AND resource.labels.location="northamerica-northeast1" AND jsonPayload.context.fileId="<FILE_ID>" AND jsonPayload.context.step="gpt_call"'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=300 --format='table(timestamp,jsonPayload.context.component,jsonPayload.context.model,jsonPayload.context.imageCount,jsonPayload.context.durationMs,jsonPayload.context.runId)'
```

```powershell
# 3) Resume request-level failures/timeouts
$f='resource.type="cloud_run_revision" AND resource.labels.service_name="processdatasetresume" AND logName="projects/gathr-migrated/logs/run.googleapis.com%2Frequests"'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=200 --format='table(timestamp,httpRequest.requestMethod,httpRequest.status,httpRequest.requestUrl,httpRequest.latency)'
```

```powershell
# 4) Webhook/start trigger timeline
$f='resource.type="cloud_run_revision" AND (resource.labels.service_name="apifywebhook" OR resource.labels.service_name="processdataset")'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=200 --format='table(timestamp,resource.labels.service_name,resource.labels.location,jsonPayload.message,jsonPayload.context.fileId,jsonPayload.context.runId)'
```

```powershell
# 5) Backend image API failures (upload/delete root causes)
$f='resource.type="cloud_run_revision" AND resource.labels.service_name="gathr-backend" AND resource.labels.location="northamerica-northeast1"'
gcloud logging read $f --project gathr-migrated --freshness=48h --limit=200 --format='table(timestamp,logName,textPayload,jsonPayload.message)'
```

## Field conventions
- Most parser logs use `jsonPayload.context.fileId` and `jsonPayload.context.runId`.
- Stage/timing logs use:
  - `jsonPayload.message="Timing"`
  - `jsonPayload.context.step` (for example `gpt_call`, `parse_total`, `stage3_extract`)
- Row-level progress usually appears as:
  - `jsonPayload.context.rowIndex`
  - message like `Row N: processed`

## Triage order
1. `processdatasetresume` logs by `fileId`.
2. Narrow to one `runId` to avoid mixed runs.
3. Check request logs for status/latency spikes.
4. If OCR upload/delete errors exist, pivot to `gathr-backend`.
5. Confirm lock/checkpoint docs in Firestore for true current state.
