# Stage 1 Mini A/B Test (Row 278)

Date: 2026-03-07 (UTC)
Dataset fileId: 1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN
Target rowIndex: 278
Target uniqueId: 1484671689786884

## 1) Baseline row selected from today's parse (highest token row)

Source snapshot docId: 1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772808480504
CreatedAt: 2026-03-06T14:48:00.530Z
DryRun: false
ParserMode: full5stage
EventCount: 51
TotalCalls: 5
InputTokens: 30093
OutputTokens: 26285
TotalTokens: 56378
CachedInputTokens: 0

By-stage tokens:
- stage1: 3477 (input 3082, output 395)
- stage2: 2683 (input 2505, output 178)
- stage3: 12447 (input 6735, output 5712)
- stage4: 12570 (input 8570, output 4000)
- stage5: 25201 (input 9201, output 16000)

Baseline stage outputs from logs (same row/time window):
- Stage 1: VALIDATION_PASSED (confidence 0.95)
- Stage 2: CALENDAR (confidence 0.90, estimatedItems 40)
- Stage 3: Extracted 51 items from CALENDAR
- Stage 4: fallback to raw data due parse error; validatedCount 51
- Stage 5: Formatted 51 items
- Final: parsePostData completed with 51 events

## 2) Model switch applied

Cloud Run service updated:
- service: processdataset (northamerica-northeast2)
- new revision: processdataset-00161-wbp
- env change: STAGE1_MODEL_OVERRIDE=gpt-5-mini

Note: this switch was applied to processdataset for controlled row replay testing.

## 3) Rerun of same row with Stage 1 mini

RunId: 8e80ec8a-e7fb-4ae5-9cb1-e3c4a05a5d93
Replay mode: selected row override, dryRun=true, parserMode=full5stage
Source snapshot docId: 1tgf29-Jl0N42cto64f8cfMYXF1oZyOdN_278_1772844518372
CreatedAt: 2026-03-07T00:48:38.433Z

EventCount: 51
TotalCalls: 5
InputTokens: 28298
OutputTokens: 26063
TotalTokens: 54361
CachedInputTokens: 0

By-stage tokens:
- stage1: 3997 (input 3082, output 915) model=gpt-5-mini
- stage2: 2665 (input 2505, output 160) model=gpt-5.2
- stage3: 11372 (input 6384, output 4988) model=gpt-5.2
- stage4: 11848 (input 7848, output 4000) model=gpt-5.2
- stage5: 24479 (input 8479, output 16000) model=gpt-5.2

Mini run stage outputs from logs:
- Stage 1: VALIDATION_PASSED (confidence 0.92)
- Stage 2: SCHEDULE (confidence 0.93, estimatedItems 35)
- Stage 3: Extracted 51 items from SCHEDULE
- Stage 4: fallback to raw data due parse error; validatedCount 51
- Stage 5: Formatted 51 items
- Final: parsePostData completed with 51 events

## 4) Output comparison

Token deltas (mini - baseline):
- stage1: +520
- stage2: -18
- stage3: -1075
- stage4: -722
- stage5: -722
- total: -2017 (-3.58%)

Structured output diffs (51 events vs 51 events):
- Names: mostly casing changes (42/51 case-only differences)
- Start times: 1 changed (Sunday Skate 12:30 -> 12:00)
- End times: 51 changed
  - baseline distinct end times had many schedule-specific values
  - mini run end times were all 23:00 (51/51)
- Key set difference: 1 baseline-only key and 1 mini-only key (Sunday Skate time shift)

Observed functional behavior change:
- Classification shifted CALENDAR -> SCHEDULE on the same row.
- Downstream final event end times regressed heavily in the mini replay output.

## Raw artifacts

- Baseline row logs (today run): functions/tmp/tmp_file_1tgf_logs_36h_10000.json
- Mini replay logs (revision window): functions/tmp/tmp_processdataset_rev161_2h.json
- Mini replay run-filter logs: functions/tmp/tmp_run_8e80_processdataset.json
