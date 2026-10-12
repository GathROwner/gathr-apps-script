# October 12 integrity repair

## Scope and baseline

Production audit: `luna-oct12-production-audit.md`. Dataset
`1qGUkgURxqthV6F8Y4jAKZIpET_qC82wq`, run
`82668a64-bc89-4711-a272-d83738c2894f` completed before repair work.
Release checkout: `codex/luna-oct11-integrity-repair` in the existing
`luna-accounting-release/gathr-apps-script` worktree. Serving source before this
repair was `208dd07dac4181c01dda572270ffe20f3401ed3a` on all three parsers.

No model, effort, allocation, cache-layout, resume-lock or broad deduplication
change is included. Stages 1/2/3/5 remain Luna at their approved settings;
Stage 4 remains Nano low compact validation.

## Prevention changes

- Preserve an explicitly unresolved early AM/PM clock before formatting can
  normalize `1:30` into `01:30`. Recognize the actual Milton explanation,
  not just the former exact phrase `meridiem unspecified`.
- Carry untimed meal-period and same-image activity-offer constraints through
  validation/formatting. Do not borrow whole-day opening hours or publication
  time for an offer advertised specifically as lunch/dinner or within an
  activity block. A trusted explicit clock still survives; no clock is guessed.
- Clothing donation campaigns and volunteer work remain activities despite
  incidental meal wording. `main level` is location prose, not a main course.
  Keep genuine meal-course and cocktail/mimosa/Bloody Caesar offer controls.
- Narrowly allow a newer same-publisher literary announcement to correct an old
  Food Special keeper when venue, date, clock and two distinctive title words
  agree, protecting other publishers, occurrences and recurring families.
- Clarify dated public recreation opening access in Stage 2, ordinary seasonal
  product availability in Stage 1, and offer-specific price/time binding in
  Stage 3. A $5 mimosa beside a brunch menu does not make brunch cost $5.

## Film experiment rejected for release

The four original 472x590 film cards were tested with a blind schedule-only
read, four isolated image reads, and a downstream disagreement-guard probe.
They consistently identify Back In Black on October 14 and A Long Winter on
October 16, confirming the three audit corrections. However, later-card reads
also confuse October 18 with October 16. The disagreement guard held five of
six listings, including two potentially correct items. It therefore failed
the output-preservation gate and is **not in the production extraction path**.

The prototype and API evidence remain under
`functions/artifacts/luna-oct12-repair/`. Production gets no extra film API
calls or automatic date overwrites from this experiment. Low-resolution film
date reading remains open work; manually repairing three records does not
prove that mechanism fixed. The row 85 Q&A/film overlap also remains an
observation, not approval to merge or delete either source's listing.

## Validation

- Final TypeScript build passed. Focused integrity/category/enrichment tests
  passed 33/33, and the complete compiled backend suite passed 625/625 with
  no failures, skips or cancellations (342.177 seconds). Logs are
  `final-release-focused.txt` and `final-release-full.txt` in the repair artifacts.
- Fresh actual API controls: ordinary A&W limited-time product rejected;
  Chambers dated lunch specials retained; both Stratford public recreation
  posts accepted; Hunter extraction produces two $5 drink offers, not $5 brunch;
  Boston extraction preserves three activities and its October 20 20:00 offer.
- A fresh downstream Nano Stage 4 / Luna-none Stage 5 replay retains Hunter's
  two offers and Boston's four items. Five captured Responses calls completed;
  no incomplete response or inventory loss. Film probe holds are experiment
  failures, not successful production extractions.
- Across 86 captured Stage 3 items, time constraints identify nine items: four Chambers
  meals, three other untimed meals, Boston's old untimed offer and Milton's
  explicitly ambiguous clock. An unrelated caption-only produce offer remains
  unconstrained. The fresh Boston read
  has the printed activity clock, so that constraint does not block it.
- Raw captures, usage/status/timing, regression fixtures, full test logs,
  preflight and serving readback are in the local repair artifact directory.

## Existing records

No historical record mutation is implied by deployment. The exact plan and
full backup are prepared separately in `luna-oct12-live-repair-plan.md`.
Coats' existing venue-derived hours remain unconfirmed even after the proposed
category correction. Milton's actual AM/PM remains unconfirmed. The three
other untimed meal offers exposed by the cohort check need serving-time evidence;
this release will hold a fresh unsupported extraction rather than invent it.

## Release evidence

Pending final build, tests, narrow deploy dry run, deployment and independent
live source-hash/traffic/environment readback. Do not treat this section as a
deployment confirmation until those results are appended.
