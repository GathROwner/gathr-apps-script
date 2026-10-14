# October 14 parser integrity repair

Baseline: `54dfeb6`, branch `codex/luna-oct11-integrity-repair`, serving parser
source hash `9c8f58ea905d9f85501c2d3f6676a7ab890777fa`. Today's completed dataset
is `11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC`. See the production audit for its
completion proof and source-by-source findings.

## Prevention

- Shared external calendar/schedule thumbnails receive a bounded independent
  transcription of the embedded, allowlisted original. Printed dates and
  unambiguous clocks must support the extracted occurrence. Conflicts and
  unreadable sources hold; dates are never rolled forward or AM/PM guessed.
  There are at most two extra model reads per post, with explicit holds beyond
  that budget. Analysis-frame provenance maps each check back to its source.
- Harmony's incidental pub menu and PEERS' provided pizza no longer convert
  their activities into meal specials. The source item remains available in
  both category-correction passes. Genuine food specials retain their category.
- An anniversary concert tour is not classified as Cinema merely because it
  takes place in a theatre; explicit film/screening cues remain authoritative.
- Named Island Jazz guests cannot regain the general program's weekly flag
  when validated occurrence fields are copied back after recurrence correction.
  The generic, explicitly weekly Island Jazz series remains recurring.
- Same-day advertised food specials respect an explicit printed closing time
  when their end was inferred. Explicit service ends and other days are retained.
- Downtown cinema copies yield to the cinema's own matching occurrence. A
  close-time conflict is held without updating the official screening; genuine
  first-party separate showtimes remain independent. Ambiguous/oversized peer
  sets hold. A Downtown duplicate cannot repaint a venue-owner post's managed
  poster. Other source relationships retain their existing behavior.
- Stage 5 single-item malformed responses receive one unchanged retry. API
  rejections are terminal and are not bypassed. A failed batch holds the whole
  post; it cannot publish earlier partial batches. Request diagnostics include
  the batch, elapsed time, error/status and request ID. Failed formatting is a
  row error and failed snapshot stage, rather than a successful empty skip.
- Calendar inventory audit output allowance is 16,000 tokens, retaining the
  complete-response and schema gates and the existing two-frame bound.

## Validation before deployment

TypeScript build passed; all **674 compiled backend tests** passed. Sixteen
focused new integrity checks passed, including healthy recurrence, food-special,
film, owner-image-refresh, explicit-end and separate-screening controls.

Captured-output playback covered **43 posts / 148 formatted events**. Only the
expected McKennitt and PEERS categories/type flags changed. Other checked
occurrence and image-index fields were unchanged. This is saved-data playback,
not paid API performance evidence.

Fresh model-only Stage 5 replays recovered Harmony's four printed November
Wednesdays as one bounded four-occurrence parent, PEERS, Raine/Chantal,
Barktoberfest, Red Ribbon and all 21 frozen festival items. Nine actual Stage 5
calls completed with zero failures. The separate APM image transcription found
the original October 10–14 dates and rejected all six manufactured future
dates. No Firestore event writer ran in those model-only tests.

The two real festival inventory reads completed within the new output bound.
However, the small source still yielded missing titles/invalid schema and a
conflicting reading; the addition gate correctly applied **zero** additions.
Successful formatting is not proof that these 21 partially unreadable source
identities are ready to publish. They remain held for source clarification.
Increasing a token allowance does not repair missing pixels.

Follow-up source comparison found the organizer's linked original 2026 program:
`https://www.belle-alliance.ca/_files/ugd/b35d6e_752ed570d7a946c8af80537fffa039e7.pdf`.
The small-image extraction had substantive identity/location errors, including
Michel Robichaud being replaced by a murder mystery at another venue. Explicit
bracketed unreadability/partly unclear titles now hold; a dense schedule with
repeated identity gaps holds all of its cells before formatting. Only row168
in today's saved Stage3 cohort meets this whole-schedule condition. The linked
original is being used for a separate guarded recovery, never as authorization
to publish the frozen 21-item extraction.

The full-resolution original recovered31 source occurrences in a fresh Luna
high extraction. Actual Stage4 Nano low / Stage5 Luna none retained31. Thirteen
public activities at existing Centre Belle-Alliance/library records have
source-verified manual writer previews. Matching registration pages supplied
eleven exact end times and ticket URLs; the other two retain printed/inferred
time provenance. This is a reviewed recovery batch, not proof of automatic
future linked-PDF ingestion. A newly exposed indoor costume-parade routing
case is narrowly guarded; an actual street parade remains spatial. Final build
and678 backend tests passed. Remaining museum, Ghostwalk and area-location
questions are in [the prepared location handoff](luna-oct14-location-followups.md).

The PEERS managed poster was recovered and visually checked: October 20,
6–8 p.m. Its date remains correct despite the caption's October 21 typo.
The Nadine source poster was recovered and visually checked. Harmony's poster
was preserved as a managed image and its actual existing-venue writer preview
produced the correct bounded November parent, with an explicitly marked inferred
21:00 end. No unknown venue was created or resolved.

## Release and live correction boundary

Fresh preflight: completed lock/marker/batch, no checkpoint or active parser;
all three serving parsers ACTIVE with one common baseline hash and 100% traffic.
Model, effort, allocation and cache settings are preserved. Only processDataset,
processDatasetResume and processDatasetSelectedRows are deployment targets.
Independent release readback will be appended after deployment.

Live corrections are separately backed up and default-dry. The exact plan
requires approval before event deletion, update or creation. Correct existing
Raine/Chantal and Barktoberfest listings must not be duplicated; the expired
Red Ribbon activity must not be republished. Existing expired October 13 meal
history is retained; prevention fixes its mechanism for subsequent posts.

Evidence: `functions/artifacts/luna-oct14-repair/` contains builds, focused/full
tests, captured comparison, actual model requests/results, source pictures,
writer preview and release gates. Generated production data stays local.
