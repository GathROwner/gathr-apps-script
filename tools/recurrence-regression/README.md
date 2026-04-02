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
- writes a JSON report under `tools/recurrence-regression/results/`
- includes a live wet-run verifier driven by `fixtures/live-wet-cases.json`

What it does not do:

- it does not call GPT
- it does not touch Firestore
- it does not validate live deployment state

The live wet-run verifier is separate and does touch Firestore.

Run all fixtures:

```powershell
node tools/recurrence-regression/run-recurrence-regression.mjs
```

Run one fixture:

```powershell
node tools/recurrence-regression/run-recurrence-regression.mjs --case redshores_homestyle_finite_fridays
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
