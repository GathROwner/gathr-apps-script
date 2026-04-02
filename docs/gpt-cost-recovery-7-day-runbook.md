# GPT Cost Recovery Runbook (7-Day, Flag-Driven)

## Goal
- Recover daily API spend from recent `~$4-$7/day` back toward `~$1/day`.
- Keep Stage 3 quality for complex calendars/schedules and large 50-100 event posts.
- Change exactly one major cost lever per day, measure, then keep or roll back.

## Baseline Context
- Recent observed spend (from usage screenshot and notes):
  - Range: `~$4/day` to `~$7/day`
  - Prior baseline: `~$1/day`
- Date range shown in screenshot: `February 17, 2026` to `March 4, 2026`.

## Hard Constraints
- Do not reduce Stage 3/Stage 5 max output token limits for now.
- Do not change multiple major flags in the same day.
- Keep `ENABLE_PARSE_SNAPSHOTS=true` during this optimization window.

## What Was Implemented
- Reversible feature flags for stage model/detail routing and Stage 3 behavior.
- Per-row GPT usage summaries saved into parse snapshots.
- Stage artifact capture + replay path for Stage 4/5 A/B without re-running Stage 3 GPT.
- Automated daily report:
  - Function: `scheduledPipelineCostReport`
  - Schedule: `4:15 AM America/Halifax`
  - Output collection: `pipeline_cost_reports`
- Manual on-demand report:
  - Function: `manualPipelineCostReport`
  - URL: `https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/manualPipelineCostReport`

## Required Env Flags (keep set)
- `ENABLE_PARSE_SNAPSHOTS=true`
- `ENABLE_DAILY_PIPELINE_COST_REPORT=true`
- `PIPELINE_COST_REPORT_LOOKBACK_HOURS=24`
- `PIPELINE_COST_REPORT_SCAN_LIMIT=5000`

## Stage 4/5 Replay (New)
Purpose:
- Re-run Stage 4 and Stage 5 against saved Stage 3 artifacts.
- Avoid paying Stage 3 OCR/tiling GPT costs for A/B tests.

Enable artifact capture for future rows:
- `ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS=true`
- Optional cap: `PARSE_SNAPSHOT_STAGE_ARTIFACT_MAX_ITEMS=120`

Replay endpoint:
- Function: `replayStage45FromSnapshot`
- URL: `https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/replayStage45FromSnapshot`

Request body:
```json
{
  "snapshotDocId": "parse_snapshots_doc_id",
  "replayFrom": "stage3",
  "stage4Model": "gpt-5-mini",
  "stage5Model": "gpt-5-mini",
  "saveReplaySnapshot": true
}
```

`replayFrom` options:
- `stage3` = run Stage 4 + 5 from captured Stage 3 items.
- `stage4` = run Stage 5 only from captured Stage 4 items.
- `auto` = prefer Stage 3, fallback Stage 4.

## Price Estimation (optional, but recommended)
Set pricing env vars so reports include estimated USD:
- `PRICE_<MODEL>_INPUT_PER_M`
- `PRICE_<MODEL>_OUTPUT_PER_M`
- `PRICE_<MODEL>_CACHED_INPUT_PER_M`

Example for model id `gpt-5.2`:
- `PRICE_GPT_5_2_INPUT_PER_M=...`
- `PRICE_GPT_5_2_OUTPUT_PER_M=...`
- `PRICE_GPT_5_2_CACHED_INPUT_PER_M=...`

## Deploy Command (known-good)
From `functions/`:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --only functions:gathr-functions --project gathr-migrated
```

## Critical Guardrail (must run after every deploy)
Run parser env verification immediately after deploy:

```powershell
cd functions
npm run verify:parser-env
```

This command fails if Stage 2 score-routing flags drift/missing on any parser service.
Do not trust A/B routing results unless this check passes.

## Cloud Run Env Safety
- Use `gcloud run services update ... --update-env-vars ...` for partial flag edits.
- Avoid `--set-env-vars` for partial edits; it can replace existing env values and disable model-router flags.
- If router behavior changes unexpectedly, verify `ENABLE_MODEL_ROUTER*` keys on all 3 parser services.

## Daily Measurement Sources
1. Firestore `pipeline_cost_reports` (primary).
2. Firestore `parse_snapshots` (row-level deep checks).
3. OpenAI usage dashboard (sanity check only).

Primary comparison metrics (day-over-day):
- `usage.totalTokens`
- `usage.totalCalls`
- `estimatedCost.usd` (if pricing vars set)
- `qualityStats.rowsWithEvents`
- `qualityStats.rowsSkippedOrEmpty`
- `qualityStats.totalEventsExtracted`

## Quality Gates (must pass to keep change)
- `rowsWithEvents` drop is not worse than `-3%`
- `rowsSkippedOrEmpty` increase is not worse than `+3%`
- `totalEventsExtracted / rowsWithEvents` drop is not worse than `-5%`
- Manual QA sample for calendar-heavy posts passes

If any gate fails:
1. Revert only that day's flag.
2. Redeploy immediately.
3. Run manual report after stabilization.

## Manual Report Call
```powershell
$headers = @{ Authorization = "Bearer <ADMIN_API_KEY>" }
$body = @{
  lookbackHours = 24
  scanLimit = 5000
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/manualPipelineCostReport" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body
```

## 7-Day Rollout Plan
Use this exact order for highest savings with lowest risk first.

If starting on `March 6, 2026`, use:
- Day 1: `March 6, 2026`
- Day 2: `March 7, 2026`
- Day 3: `March 8, 2026`
- Day 4: `March 9, 2026`
- Day 5: `March 10, 2026`
- Day 6: `March 11, 2026`
- Day 7: `March 12, 2026`

### Day 1
- Change: `ENABLE_OCR_DEBUG=false`
- Expected impact: remove always-on extra OCR debug model call per row.

### Day 2
- Change: `STAGE1_MODEL_OVERRIDE=gpt-5-mini`
- Expected impact: cheaper validation stage.

### Day 3
- Change: `STAGE2_MODEL_OVERRIDE=gpt-5-mini`
- Expected impact: cheaper classification stage.

### Day 4
- Change: `STAGE1_IMAGE_DETAIL=low`
- Expected impact: lower Stage 1 image-token cost.

### Day 5
- Change: `STAGE2_IMAGE_DETAIL=low`
- Expected impact: lower Stage 2 image-token cost.

### Day 6
- Change: `STAGE4_MODEL_OVERRIDE=gpt-5-mini`
- Expected impact: cheaper secondary validation.

### Day 7
- Change: `STAGE5_MODEL_OVERRIDE=gpt-5-mini`
- Expected impact: cheaper final formatting while keeping output caps.

## Higher-Risk Flags (do after Day 7 only if needed)
- `ENABLE_STAGE3_CALENDAR_SUPPLEMENTAL_OCR=false`
- `ENABLE_STAGE3_MIXED_DUAL_EXTRACT=false`
- `STAGE3_MODEL_OVERRIDE=...` (canary only; not broad rollout first)

## Agent Operating Protocol (for any AI doing deploys)
1. Confirm current flags before making changes.
2. Change one planned flag only (with `--update-env-vars`, not partial `--set-env-vars`).
3. Deploy.
4. Run `npm run verify:parser-env` and confirm PASS.
5. Verify function revision advanced.
6. Run manual report at +2h for early signal.
7. Review next scheduled daily report for final pass/fail.
8. Record decision: keep or rollback.
9. Do not proceed to next day until current day is marked pass.

## Daily Execution Log Template
Copy this block per day:

```text
Date:
Flag changed:
Deploy revision:
Manual report id:
Daily report id:
totalTokens delta:
totalCalls delta:
estimatedCost.usd delta:
rowsWithEvents delta:
rowsSkippedOrEmpty delta:
eventsPerRow delta:
QA sample result:
Decision (KEEP/ROLLBACK):
Notes:
```

## Notes
- This runbook is optimized for rapid spend recovery while protecting Stage 3 extraction quality.
- If spend does not trend down by Day 4, pause and run a focused audit on Stage 3 call multiplicity before continuing.
