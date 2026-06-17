# Integrity Follow-up 2026-04-28

Branch: `codex/integrity-followup-2026-04-28`

Latest scan:
- report: `firebase/tmp_recurrence_integrity_report_2026-04-28.json`
- scanned: `1237`
- recurring scanned: `667`
- docs with issues: `8`

Baseline comparison:
- `firebase/tmp_recurrence_integrity_report_2026-04-20.json` was clean (`docsWithIssues: 0`)

## Current issue groups

### 1. Tipsy Farmers explicit lunch range bug

Status:
- reproducible in parser snapshot output
- likely parser/post-parser explicit time range recovery issue

Affected live docs:
- `venues/slug_tipsyfarmers/events/PuR8uTEFH8K0n3as3SAr`
- `venues/slug_tipsyfarmers/events/6kAg5pmocjuKA23ZFYPf`
- `venues/slug_tipsyfarmers/events/XDFqxSbOjjD9IbBMFnnx`

Source snapshots:
- `1sYMwf6GaKh3QvR5s4y4T1O3fanI8E2fr_292_1776785006667`
- `1mE7HQv4uyytTU-9wkxkJ3dyrMtEQdQRV_139_1776951476622`
- `12boS5aufaDzkDcehchylIiytoAPHbXoF_162_1777124503242`

Observed shape:
- input contains `Available 11-2pm`
- parser snapshot output lands `startTime: 23:00`, `endTime: 14:00`
- `timeFlags` still mark the range as explicit

Interpretation:
- this is not stale live data
- the wrong time shape is already present in the formatted parser snapshot

### 2. Milton Community Hall stale recurring landing

Status:
- latest parser snapshot does not match the current live recurring docs
- likely rerun/write-path/manual cleanup lane before code lane

Affected live docs:
- `venues/nvQTJXSbDsSfJTCxDKCH/events/KuTSPXxAzKoUA9F9uxMF`
- `venues/nvQTJXSbDsSfJTCxDKCH/events/ChipgdYNDuJCaCJ24xnJ`

Source snapshot:
- `1QGONwkNllWxtEe5MjeFk_5hbfqRJUvzr_258_1776699714542`

Observed shape:
- parser snapshot emits one-off `TOPS` on `2026-04-21`
- parser snapshot emits one-off `Person Centered Universe` on `2026-04-23` and `2026-04-24`
- live docs still show recurring weekly artifacts

Interpretation:
- investigate with rerun / cleanup before deciding on code changes

### 3. Default end-time too broad

Status:
- reproducible in parser snapshot output
- likely post-parser end-time fallback heuristics

Affected live docs:
- `venues/slug_soulfitpei/events/6GxrYxG0rgt00oisyVBT`
- `venues/slug_soulfitpei/events/GjnXXXzcDUjQ2n8D7fwJ`
- `venues/KeaYNQ0m7AfE583KyS5R/events/G4QeqqDHMPjFvC9bMGqS`

Source snapshots:
- `12DvqvGpvHToTqW1v9MRP70wzhhOydEQE_356_1775150980707`
- `1hG60uHGLZc8viuqzNxkWSIPFyIZJX7uP_161_1777385103574`

Observed shape:
- Soul Fit classes land with `endTime: 21:00` and `timeResolution.endFromHours: category_default`
- Rotary `Teen Advisory Group` lands with `endTime: 23:00` and `timeResolution.endFromHours: category_default`

Interpretation:
- parser/write-path currently falls back to venue/category close-style end times when a shorter program-style duration is more plausible

## Planned order

1. Fix the narrow Tipsy explicit-range bug first.
   - dry-run: parser regression plus exact snapshot replay
   - wet rerun: rerun one Tipsy row, then recheck all three Tipsy docs

2. Reassess Milton with venue-review style rerun/cleanup.
   - if rerun lands cleanly, treat as live cleanup lane
   - only patch code if rerun reproduces the recurring artifact

3. Tackle default-end-time heuristics for Soul Fit and Rotary.
   - dry-run: add targeted parser/post-parser regressions
   - wet rerun: rerun one Soul Fit case and the Rotary row after the heuristic change

## Notes

- The clean fix work is being done from this branch/worktree so the older local WIP on `codex/write-path-consistency` stays untouched.
- Firestore inspection in this investigation used the existing local service account from the main workspace only for read access.
