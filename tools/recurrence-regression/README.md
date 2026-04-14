# Recurrence Regression Tool

This tool runs local regression fixtures against the deterministic recurrence normalization guardrails.

It is meant to catch the exact classes of recurrence bugs we just cleaned up:

- one-off events accidentally left recurring
- alternating weekday schedules
- finite explicit date-list posters
- bounded weekly class series
- split-series posts that should keep their specific weekday rule

What it does:

- builds `functions`
- imports the compiled helper from `functions/lib/parsing/finalFormatter.js`
- runs curated fixture cases from `fixtures/recurrence-normalization-fixtures.json`
- includes a separate explicit-time regression runner for cases like `11-12PM` and standalone end-evidence recovery
- includes a separate holiday-weekend regression runner for mixed finite specials like `Saturday from 4pm onwards, Sunday & Monday all day`
- writes a JSON report under `tools/recurrence-regression/results/`
- includes a live wet-run verifier driven by `fixtures/live-wet-cases.json`

What it does not do:

- it does not call GPT
- it does not touch Firestore
- it does not validate live deployment state

The live wet-run verifier is separate and does touch Firestore.

Audit interpretation:

- the bucketed recurrence audit compares a row's final parser snapshot against Firestore docs that still carry that row's `uniqueId` prefix
- divergence families are investigation leads, not a direct count of live user-visible bugs
- `missing_in_firestore` can mean a true write miss, but it can also mean the row merged into an older keeper from a different post and therefore no longer appears under this row's `uniqueId` prefix
- use the live integrity scan as the source of truth for confirmed active data problems
- use the bucketed audit to separate parser-shape issues from write/merge landing issues

Open follow-up note:

- [PENDING_PARSER_HARDENING.md](C:/Users/craig/Dev/gathr-apps-script/tools/recurrence-regression/PENDING_PARSER_HARDENING.md)

Run all fixtures:

```powershell
node tools/recurrence-regression/run-recurrence-regression.mjs
```

Run one fixture:

```powershell
node tools/recurrence-regression/run-recurrence-regression.mjs --case redshores_homestyle_finite_fridays
```

Run the explicit-time fixture pack:

```powershell
node tools/recurrence-regression/run-explicit-time-regression.mjs
```

Run the holiday/weekend fixture pack:

```powershell
node tools/recurrence-regression/run-holiday-weekend-regression.mjs
```

Run one live wet case:

```powershell
node tools/recurrence-regression/run-live-wet-regression.mjs --case redshores_theme_nights
```

Run a live wet case and clean known stale docs after the rerun:

```powershell
node tools/recurrence-regression/run-live-wet-regression.mjs --case redshores_theme_nights --cleanup-stale
```

Run the whole live wet pack:

```powershell
node tools/recurrence-regression/run-live-wet-regression.mjs --cleanup-stale
```

Fixture format:

- `event`: the formatted event entering recurrence normalization
- `originalItem`: the paired Stage 3/4 item text used by guardrails
- `expect`: a subset assertion against the normalized output
- use `__absent__` in `expect` when a field must be cleared

When adding a new recurrence bug:

1. add a new fixture row
2. run the tool and confirm it fails
3. patch the parser/normalizer
4. rerun until the fixture passes
