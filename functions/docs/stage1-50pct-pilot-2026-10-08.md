# Stage 1 Luna 50% pilot and occurrence safeguards

Craig approved preparing this pilot and fixing both safeguards on October 8.
The accepted release baseline is `ab6a43b`; the evaluated Stage 1 candidate is
`24054be`. This work preserves the October 8 parser and live-record repairs.

## Pilot contract

- Enabled only with `LUNA_STAGE1_PILOT_ENABLED=true`; sample percent `50`.
- Denominator: posts actually reaching Stage 1 with at least one usable
  preprocessed image and a source post ID, before Stage 1 eligibility is known.
  Empty scraped rows and text-only posts are excluded from the sample.
- SHA-256 of stage name, dataset ID and source post ID determines the sample.
  It targets 50%, rather than enforcing an exact half in a small dataset.
  Source order, row index and resume worker do not affect selection.
- Selected: GPT-6 Luna high, frozen compact-v10 prompt, normal JSON schema,
  `source-menu-guards`, existing image budget. Unselected: existing Mini path.
- Stage 2 stays Mini; eligible image Stage 3 stays 100% Luna high; image-ineligible
  Stage 3 stays GPT-5.2; Stages 4–5 stay Nano low/medium. Legacy fallback stays off.
- Allocation logs, actual usage records, `lunaStage1EligibleCount` and
  `lunaStage1SelectedCount`, and saved Stage 1 decisions support the next audit.
  Counters represent allocations made by row attempts; audit source IDs and
  calls to distinguish retries from unique posts.
- Roll back the Stage 1 experiment with `LUNA_STAGE1_PILOT_ENABLED=false` on all
  three parser functions, retaining Stage 3 and the two safeguards.

## Safeguard 1: recent-past source dates

The saved Mitsubishi replay did **not** contain a generic retry. The old guard
held the caption's October 3 recap while missing a separate September 25 event
on the background sign. The latter date was in the model's image transcription,
not the caption inspected by the old guard. The evaluation report has been
corrected to reflect this trace.

The guard now checks each item's source evidence after enrichment on every
Stage 3 attempt. It retains valid items from mixed posts, records held items,
and prevents generic or legacy fallback after a source-date hold. Explicit
caption years and same-day events remain exempt. Image transcription is still
model evidence; this does not claim independent OCR certainty.

## Safeguard 2: Stage 5 occurrence identity

Before corrections and after recurrence normalization, formatting restores the
validated Stage 4 start date, explicitly printed clock times, and canonical
recurrence. A validated one-off cannot become a weekly parent. Existing explicit
multi-day window corrections and deterministic finite-series handling remain.
Alignment and source-identity holds run before restoration, so guessed alignment
does not become authorization to attach another event's date.

Closer inspection also found that the older Stage 4 reply changed dates and age groups. The existing invalid-response fallback now detects those mutations in a repeated, explicitly dated one-off inventory and preserves the original Stage 3 items. It still accepts unchanged decisions and retains existing rejection behavior for valid responses.

Regression evidence includes the actual PowerSkating Stage 3 inventory and the failing Stage 4 reply:
twenty dated items without `_sourceType`, which made the older calendar-only
restoration insufficient. Deliberate date/time/recurrence corruption still
returns the exact twenty printed dates, including the November/December gaps.

## Evidence and release status

Evidence is saved outside the checkout at
`C:/Users/craig/.codex/stage1-evaluation-20261008/`.
The four-day candidate evaluation is documented in
`stage1-oct5-8-comprehensive-evaluation.md`.

Initial full backend suite: 555 passed; intermediate suite: 556 passed. The final suite includes the captured Stage 4 corruption case. Repaired Mitsubishi API replay:
`pilot-repaired-sign.jsonl`, zero final events and no writer calls.
PowerSkating full API replay (`pilot-repaired-powerskate-full.jsonl`): Stage 3=20, Stage 4=20, final=20, all exact printed dates at 07:00–08:00, all one-offs, no writer calls. It took 277.7 seconds; this is quality evidence, not a Stage 4/5 speed improvement. Production Stage 1 entrypoint smoke (`pilot-production-entry-smoke.json`): an advertised burger deal accepted and ordinary produce stock rejected, both actually using Luna despite the Mini environment override. Final release gates are recorded below once complete.
At the initial production preflight, no processing lock was running, the
October 8 processed marker existed, and its checkpoint was absent.
All three live parser functions were ACTIVE on source hash
`6ec1fb03acc847610ed2dd5f3ef8ae2cf4e42b10`.

Prepared code does not itself prove that the pilot is deployed or enabled.

Final local release gates: TypeScript build passed, all 557 compiled backend tests passed, 40 evaluator tests passed, and git diff --check passed.
