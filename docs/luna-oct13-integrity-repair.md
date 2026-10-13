# October 13 parser integrity repair

## Authorization and scope

Craig accepted the October 13 audit recommendations. This release addresses
source-time handling, semantic categories, narrow duplicate identity and source
link preservation. Models, effort, allocation, cache layouts, worker fencing,
checkpoint logic, backend/map code and venue resolution are unchanged.
Historical data is a separate exact plan in `luna-oct13-live-repair-plan.md`;
its 19 mutations received exact approval and were applied and API-verified on
October 13. An additional older Zumba sibling found during final verification
received separate approval and was repaired at 21:24 UTC; see the live plan.

Working baseline: `codex/luna-oct11-integrity-repair` in
`C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`,
starting HEAD `099d15b`. Before readback: common source hash
`539278f36f5a501c465f2fe1489f6eda34e8f617`; all three functions ACTIVE with
100% latest traffic. October 13 run completed, checkpoint absent, no active lock.

## Prevention

1. Normalize unknown/invalid clock placeholders before time fallback, while
   preserving the earlier strict meridiem hold and same-day chronological context.
   Untimed dining service cannot acquire retail/whole-day hours merely because
   the extractor did not tag it as a special. Sparse listed dinner dates cannot
   turn into daily recurrence. Dunes remains held pending a real dinner clock.
2. Derive a session end from one unambiguous item-local printed duration before
   category defaults. Keep calculated/implied time flags and mathematical proof.
   A film runtime, arrival offset or multiple competing durations does not qualify.
   The formatter restores that duration if the model invents a different end.
   A one-off duration cannot overwrite an older weekly family wholesale.
3. Protect recital/orchestral activity identity from cinema venue priors;
   classify public leisure/toddler pool access and walking tracks as Sports,
   preserving lesson and pool-party controls.
4. Preserve explicit Monday-Friday seasonal walking access as weekly_custom,
   without an invented end. Reconcile the Stage 3/4 enum with the existing type
   and formatter: Stage 4 previously called weekly_custom invalid and attempted
   weekly_monday, causing a strict response hold. Correct schema/instructions,
   retain source-owned weekday arrays, and keep unsupported corrections blocked.
5. Keep primary cinema title separate from an adjacent screening introduced by
   "screening back to back with". Explicit shared-admission double features are
   retained. Carry the corrected source title through final formatting.
6. Protect different known cinema clocks across duplicate selectors and at the
   merge boundary. Prevent bounded, exhausted earlier class cycles from absorbing
   new courses. Preserve still-covered/unbounded classes, existing development
   slots and source-owner recurrence rules.
7. Carry source occurrence multiplicity through formatting and storage. A
   single-occurrence cinema reparse cannot bypass an existing same-source date
   by changing its generated ID. Only exact normalized title/source root/venue
   matches qualify; declared multiple dates/occurrences and other source roots
   are not treated as that conflict. The lookup is bounded to 64 source peers.
8. Bind direct ticket URLs using an unambiguous occurrence date in their own
   source URL/block; do not select among conflicting links or borrow a neighbor.
   Restore a source ticket over a generic formatter homepage and allow a
   same-date incoming direct ticket to improve a generic stored homepage.
9. Door-opening evidence alone cannot become performance start. For exact
   caption-linked Locarius events, use a matched scheduled event's explicit
   timestamp, converting with the event-date Halifax offset. Require name/date
   and exact offer-URL agreement. Four URLs maximum, two concurrent, four-second
   timeout each batch, 256 KiB per page; no redirects, bootstrap, price, venue,
   date or image substitution. Unavailable, cancelled or inconsistent evidence
   retains its hold. A verified showtime may improve a keeper incorrectly flagged
   as explicit merely because its evidence was a doors clock.
10. Hold unreadable/placeholder activity identities and occupied private rentals.
    Preserve public rent/book availability, including bookable private-party offers.

## Evidence and tests

Final build/focused/full suite: build passed; **643/643 compiled backend tests and 24/24 focused tests passed**.

- Captured October 13 playback covers all 46 Stage 3 posts / 143 items.
  Source changes are logged separately from publication holds and image sentinels.
- Six actual API calls (three Nano low Stage 4, three Luna none Stage 5) passed
  three controls with 11 supplied occurrences: duration/categories, four distinct
  cinema screenings, and three date-bound Eagles ticket/showtime items. All
  responses completed; no inventory loss or Nano fallback. Saved raw-response
  playback is additional local validation, not another paid timing measurement.
- Four actual linked-page reads resolved Jake Nov 4 and Eagles Oct 29/30/31 to
  20:00. Two source posts took roughly 0.65 and 0.36 seconds in that check; this
  is a focused measurement, not a whole-run guarantee. November conversion uses
  UTC-4, October UTC-3. Tourism PEI independently agrees on Jake at 20:00:
  https://www.tourismpei.com/what-to-do/events/jake-vaadeland-the-sturgeon-river-boys
- A source-binding prompt experiment was tested on the original five-image film
  gallery. It returned six items but still read the L'Autre card's tiny Oct 18 as
  Oct 16. Although the current ticket/program say Oct 16, that is not proof of
  faithful card transcription. The prompt experiment was **removed**, is not
  released and is not counted as a passing release control. Stage 3 request
  prompts remain unchanged. Its recurring-pattern sanitizer now accepts the
  already-supported weekly_custom enum.
- Small-card date/venue precision remains open; independent primary-source
  contradictions require review. Same-source date protection preserves corrected
  keepers but is not a general vision accuracy or cross-venue correction claim.
- The live plan preserves the correct Evil Dead screenings; it does not create
  replacements or perform broad historic duplicate cleanup. Back in Black's
  existing City time/Q&A pair and A Long Winter's contradictory date remain held.

Evidence: `functions/artifacts/luna-oct13-repair/`: full-tests.txt,
focused-tests.txt, api-replay.json, linked-starts.json, cohort-playback.json,
stage3-film-replay.json, lautre-footer.png, serving-before.json, live-dry-run.json
and exact timestamped backups/plan. No credentials or model request secrets are
written to the evidence; public source images/response data remain ignored locally.

## Live-data read-only duplicate controls

The real writer payload preview and Firestore duplicate selector were run without
write calls for four captured sources. Back in Black on the wrong October 18
was held against its October 14 source peer; the new October 13 watercolour
course was eligible to create instead of merging into the exhausted series;
Screamplay matched its correct 21:10 keeper; Evil Dead II matched the existing
19:15 Evil Dead 2 keeper, preserving the Roman/Arabic title variant. See
`live-dedupe-dry-run.json`. This is read-only selector evidence, not live repair.

## Release

Source commit: `2098f4d`. Narrow dry run and actual deployment passed.
Independent readback at 2026-10-13T15:51:52.361Z verified all three functions ACTIVE,
100% traffic on latest revisions and common source hash
`58380c92610b48f9d4058be4c79988d3c0ace273`. Every captured model/effort/allocation environment
variable matched the before-release readback exactly. Post-deploy preflight
again found no active parser, completed October 13 marker/batch and no checkpoint.

| Function | Serving revision |
|---|---|
| processDataset | `processdataset-00474-yuc` |
| processDatasetResume | `processdatasetresume-00438-jiv` |
| processDatasetSelectedRows | `processdatasetselectedrows-00430-dav` |

Commands from functions/:

```powershell
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
node artifacts/luna-oct13-repair/release-gates.cjs after
```

Existing Firebase warning: firebase-functions dependency is outdated; no SDK
upgrade was included. The package ignored local artifacts; only the three
qualified parser targets were deployed. See deploy-dry-run.txt, deploy.txt,
serving-after.json and preflight-after.json.

Narrow targets only: processDataset, processDatasetResume,
processDatasetSelectedRows; project gathr-migrated, codebase gathr-functions.
Compare every model/effort/allocation variable before and after, all functions
ACTIVE, common source hash, 100% latest traffic, and no active parser/checkpoint.
Rollback reference is source commit `18e6aa2` and previous three serving revisions
`processdataset-00473-kib`, `processdatasetresume-00437-cuw`,
`processdatasetselectedrows-00429-rim`. A rollback does not undo live data repairs.

## Remaining boundaries

Live repair applied at approximately 16:01 UTC: 11 updates, six deletes and two
creates, all 19 verified in Firestore and the public API. All 42 untargeted
backed-up sibling records were preserved. Evidence and the newly discovered
older Zumba recurrence overlap are recorded in `luna-oct13-live-repair-plan.md`.
That overlap was outside the original 19 paths. Craig subsequently approved
ending the older parent after October 7. The guarded update was applied and
API-verified at 21:24 UTC: exactly one October 14 one-hour Zumba remains, with
the correct October 21/28 parent unchanged. Historical October 7 and media were
preserved. No code deployment accompanied this live data correction.

Dunes' stale queued dinner payload must be reviewed by the specialized location
queue task before finalization. This release does not mutate that queue or create
its venue. Private rental is already expired and excluded from the live cleanup.
Four pending profile repairs, redundant protected-avatar caller cleanup attempts,
broad deduplication and further model/cache optimization remain separate work.
