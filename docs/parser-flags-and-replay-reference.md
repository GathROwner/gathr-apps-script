# Parser Flags And Replay Reference

## Purpose
Single handoff doc for future AI operators.
Covers parser feature flags, model-routing controls, and Stage 4/5 replay flow.

## Services
- `processdataset` (`northamerica-northeast2`)
- `processdatasetresume` (`northamerica-northeast1`)
- `processdatasetselectedrows` (`northamerica-northeast1`)

Keep parser behavior aligned across all 3 unless intentionally testing one service only.

## Model Selection Order
1. Stage-specific per-request override in parser config (new for Stage 4/5 replay).
2. Stage env override (`STAGE*_MODEL_OVERRIDE`) when present.
3. Config default (`gptModelFast` / `gptModelReasoning`).
4. Model-router decision (Stage 1/2/3 only when enabled).

## Core Flags

### Snapshot And Reporting
- `ENABLE_PARSE_SNAPSHOTS` (`true|false`)
- `ENABLE_DAILY_PIPELINE_COST_REPORT` (`true|false`)
- `PIPELINE_COST_REPORT_LOOKBACK_HOURS`
- `PIPELINE_COST_REPORT_SCAN_LIMIT`

### OCR / Debug
- `ENABLE_OCR_DEBUG` (`true|false`)
- `OCR_DEBUG_MODEL_OVERRIDE`

### Stage Model Overrides
- `STAGE1_MODEL_OVERRIDE`
- `STAGE2_MODEL_OVERRIDE`
- `STAGE3_MODEL_OVERRIDE` (legacy broad override path)
- `STAGE4_MODEL_OVERRIDE`
- `STAGE5_MODEL_OVERRIDE`

### Stage Image Detail
- `STAGE1_IMAGE_DETAIL` (`low|high|auto`)
- `STAGE2_IMAGE_DETAIL` (`low|high|auto`)

## Stage 2 Score Routing Flags
- `ENABLE_STAGE2_SCORE_ROUTING=true`
- `ENABLE_STAGE2_SCORE_SHADOW_LOG=true`
- `STAGE2_CALENDAR_SCORE_MIN=8`
- `STAGE2_CALENDAR_MARGIN_MIN=2`
- `STAGE2_SCHEDULE_SCORE_MIN=7`
- `STAGE2_SCHEDULE_MARGIN_MIN=2`
- `STAGE2_SMALL_POST_MAX_ITEMS=5`
- `STAGE2_TILED_CALENDAR_SCORE_MIN=10`
- `STAGE2_TILED_MIN_ITEMS=8`
- `STAGE2_SCHEDULE_BLOCK_IF_GRID=true`
- `STAGE2_AMBIGUOUS_ROUTE=CALENDAR_BASIC`

Use `npm run verify:parser-env` from `functions/` after each deploy.

## Model Router Flags
- `ENABLE_MODEL_ROUTER`
- `ENABLE_MODEL_ROUTER_SHADOW_LOG`
- `ENABLE_MODEL_ROUTER_FALLBACK_RETRY`
- `MODEL_ROUTER_FALLBACK_MODEL`

### Stage 1/2 Router
- `ENABLE_MODEL_ROUTER_STAGE1`
- `ENABLE_MODEL_ROUTER_STAGE2`
- `MODEL_ROUTER_STAGE1_MODEL`
- `MODEL_ROUTER_STAGE2_MODEL`

### Stage 3 Router
- `ENABLE_MODEL_ROUTER_STAGE3_EVENT`
- `ENABLE_MODEL_ROUTER_STAGE3_SPECIALS`
- `ENABLE_MODEL_ROUTER_STAGE3_MIXED`
- `MODEL_ROUTER_STAGE3_CALENDAR_MODEL`
- `MODEL_ROUTER_STAGE3_SCHEDULE_MODEL`
- `MODEL_ROUTER_STAGE3_EVENT_MODEL_LOW`
- `MODEL_ROUTER_STAGE3_EVENT_MODEL_HIGH`
- `MODEL_ROUTER_STAGE3_SPECIALS_MODEL_LOW`
- `MODEL_ROUTER_STAGE3_SPECIALS_MODEL_HIGH`
- `MODEL_ROUTER_STAGE3_MIXED_MODEL_LOW`
- `MODEL_ROUTER_STAGE3_MIXED_MODEL_HIGH`
- `MODEL_ROUTER_EVENT_MINI_MAX_ITEMS`
- `MODEL_ROUTER_SPECIALS_MINI_MAX_ITEMS`
- `MODEL_ROUTER_MIXED_MINI_MAX_ITEMS`
- `MODEL_ROUTER_HIGH_IF_HAS_CALENDAR_GRID`
- `MODEL_ROUTER_HIGH_IF_RECOMMENDS_TILING`
- `MODEL_ROUTER_HIGH_IF_HAS_MULTIPLE_EVENT_LISTINGS`
- `MODEL_ROUTER_MIXED_HIGH_REQUIRE_MIN_ITEMS_FOR_MULTIPLE_LISTINGS`
- `MODEL_ROUTER_MIXED_HIGH_MIN_ITEMS_FOR_MULTIPLE_LISTINGS`
- `MODEL_ROUTER_UNKNOWN_ITEMCOUNT_FORCE_HIGH`

## New Stage Artifact Capture
- `ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS=true` to persist Stage 3/4 artifacts into parse snapshots.
- Optional cap: `PARSE_SNAPSHOT_STAGE_ARTIFACT_MAX_ITEMS` (default `120`).

Artifacts are stored under parse snapshot `stages[format].output.stageArtifacts`:
- `stage3Items`
- `stage4Items`
- `contentType`
- `stage37TicketUrl`

## New Replay Endpoint (Stage 4/5 Only)
- Function: `replayStage45FromSnapshot`
- URL: `https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/replayStage45FromSnapshot`

### Request
```json
{
  "snapshotDocId": "parse_snapshots_doc_id",
  "replayFrom": "stage3",
  "stage4Model": "gpt-5-mini",
  "stage5Model": "gpt-5-mini",
  "saveReplaySnapshot": true
}
```

### `replayFrom` options
- `stage3`: run Stage 4 + Stage 5 from captured Stage 3 items.
- `stage4`: run Stage 5 only from captured Stage 4 items.
- `auto`: prefer `stage3`, fallback `stage4`.

Replay does not run Stage 1/2/3 GPT calls.

## Standard Test: "Only Stage 3 On 5.2"
Goal:
- Stage 1/2/4/5 on mini
- Stage 3 calendar/schedule on 5.2

Set:
- `STAGE1_MODEL_OVERRIDE=gpt-5-mini`
- `STAGE2_MODEL_OVERRIDE=gpt-5-mini`
- `STAGE4_MODEL_OVERRIDE=gpt-5-mini`
- `STAGE5_MODEL_OVERRIDE=gpt-5-mini`
- `MODEL_ROUTER_STAGE3_CALENDAR_MODEL=gpt-5.2`
- `MODEL_ROUTER_STAGE3_SCHEDULE_MODEL=gpt-5.2`
- `ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS=true`

Then run selected-row dry-run and compare final events against baseline snapshot output.

## Known-Good Validation (March 7, 2026)
- Controlled dry-run file: `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN`
- Rows tested: `278`, `290`
- Run completed under runId: `0aa8b215-089d-468f-bc1a-e6774bfa9d9d`
- Hybrid snapshots (`1,2,4,5=mini` + `3=5.2`):
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772926835756`
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_290_1772926081351`
- Full-5.2 baselines:
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772809050224`
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_290_1772809368236`
- Comparison report artifact:
  - `functions/tmp/stage145mini_stage3_52_vs_full52_report_20260307.json`

## Nano A-B Caution (March 8, 2026)
- Test intent: keep Stage 3 on `gpt-5.2`, downgrade Stage 1/2/4/5 to `gpt-5-nano`.
- Rows tested: `278`, `290` on file `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN`.
- Result: both rows failed before extraction (`eventCount=0`).
  - Row 278 failed at Stage 2 confidence gate (`0.55 < 0.6`).
  - Row 290 failed at Stage 1 validation heuristic.
- Snapshot IDs:
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772929792676`
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_290_1772929804498`
- Detailed token and pricing report artifact:
  - `functions/tmp/stage_breakdown_baseline_mini_nano_20260308.json`

## Mixed Hybrid Replay Test (March 8, 2026)
- Test shape:
  - Stage 1/2 from mini source snapshots
  - Stage 3 from 5.2 source snapshots
  - Stage 4/5 replayed on nano (`replayStage45FromSnapshot`)
- Replay snapshot IDs:
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772931702082`
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_290_1772931690059`
- Result summary on rows `278,290`:
  - Event counts preserved (`87/87`).
  - Estimated savings improved vs baseline (`~75%`) vs mini-hybrid (`~66%`).
  - Exact-overlap dipped (`~95.4%`) vs mini-hybrid (`~97.7%`).
- Detailed report artifact:
  - `functions/tmp/baseline_vs_mini_vs_mixed_nano45_20260308.json`

## Replay Usage Split Verification (March 8, 2026)
- `replayStage45FromSnapshot` now reports replay usage by:
  - `byModel`
  - `byStage` (separate `stage4` and `stage5`)
  - `byComponent`
- Verified replay snapshot IDs (nano on Stage 4/5):
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772935062711`
  - `1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_290_1772935182108`
- Verification payload artifacts:
  - `functions/tmp/replay_278_nano45_splitcheck_20260308.json`
  - `functions/tmp/replay_290_nano45_splitcheck_20260308.json`

## Mixed Variance Field Audit (March 8, 2026)
- Field-level comparison artifact:
  - `functions/tmp/variance_breakdown_mixed_nano45_split_20260308.json`
- Summary on rows `278,290` (87 events total):
  - Exact matches: `82/87` (`94.3%`)
  - Non-exact paired events: `3`
  - Unmatched rename/substitution cases: `2`
  - Schedule-critical deltas (date/time/recurrence fields): `3 events`
- Critical deltas observed:
  - Row 278: one event shifted from `12:30-13:30` to `12:00-13:00`.
  - Row 290: two overnight events normalized to same-day `23:00` end instead of next-day `01:00`.

## Top-8 Mixed Hybrid Run (March 8, 2026)
- Scope: remaining top 8 expensive rows (`29,31,68,117,243,269,288,291`), excluding calendar rows `278,290` already tested.
- Pipeline shape:
  - Source run: Stage 1/2/4/5 on mini, Stage 3 on 5.2, stage artifacts enabled.
  - Replay run: Stage 4/5 on nano from captured Stage 3 artifacts.
- Source snapshots:
  - `functions/tmp/top8_latest_source_snapshots_20260308.json`
- Replay run responses:
  - `functions/tmp/top8_replay_stage45_nano_20260308.json`
- Main comparison report (baseline vs mixed with split stage usage):
  - `functions/tmp/top8_baseline_vs_mixed_nano45_stage_split_20260308.json`
- Human-readable per-row table:
  - `functions/tmp/top8_baseline_vs_mixed_nano45_summary_20260308.md`
- Additional field variance audit:
  - `functions/tmp/top8_field_variance_audit_20260308.json`
- Aggregate outcome on these 8 rows:
  - Baseline est cost: `$1.293298`
  - Mixed est cost: `$0.397298`
  - Savings: `$0.896000` (`69.3%`)
