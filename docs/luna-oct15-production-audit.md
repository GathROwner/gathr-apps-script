# October 15 regular production parse audit

## Outcome and decision

The full run completed and the intended Luna models served all eligible calls.
Keep the current model allocations. This is **not a clean content-quality pass**:
wrong enrichment clocks, two new duplicate/conflict clusters, lost accepted
activities/specials and a contained Stage 5 generation loop need follow-up.
Do not broaden automatic merging or publish festival shadow proposals.

The separately approved Arts Mixer correction and narrow classifier release
are complete, after this run. All other live findings below remain unchanged;
their review does not authorize deletion, replays or blanket data correction.
The October 15 heartbeat should pause after this audit and shadow report.

The existing heartbeat is now PAUSED; automation-update success and saved
status readback were verified. Its prompt records this dataset as audited,
the completed Arts Mixer repair/release and the held festival-linking decision.
No further checks are scheduled to execute unless Craig requests resumption.

## Completed full-run authority

- Dataset `1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit`, run
  `d65bfa80-4e89-458d-9bf1-03a2e6371756`.
- Started12:39:32.555 UTC, processed13:57:45.719 UTC (10:57:45 Halifax).
  Elapsed **78m13s**, versus92m58s yesterday. The cohorts differ; this is a
  descriptive comparison, not a controlled speed experiment.
- Completed processing lock, processed marker, completed final batch372/372,
  no checkpoint; resume queue empty after completion.
- 43 processed rows,100 skipped,228 invalid,1 error.58 creates and31 updates
  touch89 distinct paths. All89 detail lookups return200. Complete active feed:
  1,038 records/11 pages. All95 image URLs attached to those writes return200.
- No checkpoint regression, repeated row starts, repeated write targets or
  busy overlapping resume claim was observed in10,620 run-window logs.
  Thirteen queue workers resume at forward cursors; twelve normal pauses.
  This run does not exercise every stale-worker race proved by focused tests.

All actual run function revisions belong to pre-repair source hash
`544339ea554116d3e7880b151d9afaca775adb20`. Do not attribute these measurements
to the later Arts Mixer release.

## What the372 rows contain

The original XLSX and all372 terminal outcomes were reconciled:

| Input/outcome | Count | Interpretation |
|---|---:|---|
| Upstream `no_items` |202|No post data returned; empty/private distinction unknown|
| Upstream `not_available` |18|Unavailable-content status, no recoverable post fields|
| Matched venue outside configured coverage |7|Source/address-based early exclusion|
| Unavailable Sport PEI placeholder |1|No caption or gallery to evaluate|
| Saved model evaluations |144|43 processed,100 skipped,1 error|

All220 upstream status rows contain only error/description/URL fields. No
recoverable caption/author/gallery mapping loss was found in those supplied
rows. This does not prove the upstream scraper captured every Facebook post.
The100 skips are **not cached sources**:69 Stage1 rejects,10 source-review
holds,17 no-events outputs,2 Stage2-confidence holds,1 recent-past yearless-date
hold and1 compact recurrence-correction hold. DuplicateCount4 is an event-level
counter within processed rows, not four additional row outcomes.

## Actual models, selection and inventory

| Stage | Eligible selected posts | Actual paid calls | Actual model |
|---|---:|---:|---|
|1|144/144:134 image,10 text-only|148|Luna high|
|2|75/75:71 image,4 text-only|88|Luna none, high negative review|
|3|73/73:69 image,4 text-only|80 extraction +3 auxiliary|Luna high|
|4|Upstream retained items|75|GPT-5 Nano low, compact_v1|
|5|62/62 formatting posts|68|Luna none|

One additional Luna OCR-debug call is separately accounted. No Mini/GPT-5.2
production calls or legacy fallback were observed. Preliminary disabled-router
messages mentioning Nano are not actual executed model selections. Counters,
selection logs, per-component timings and snapshot usage reconcile; extra
paid calls reflect reviews, bounded batches and auxiliary work, not extra rows.

Stage3 retains184 items, Stage4 retains168, raw Stage5 parses167 of168 supplied
items (one generation-loop failure), and109 items survive final local formatting/
completeness rules. Those109 reconcile to89 writes,4 duplicate suppressions,
12 venue deferrals,3 occurrence-region rejections and1 area review.

All144 saved captions and all69 Stage1 rejections were reviewed. Of250 ordered
gallery references,243 originals were recovered and visually inspected across18
contact sheets:126/130 rejected-source images,111/114 Stage3 images,6/6 Stage2
hold images. Videos were reviewed through retained thumbnails, not playback.
Seven originals remain unavailable (rows105,177,286–288,304); no visual pass is
claimed for them. No confirmed Stage1 missed qualifying activity was found in
the available sources under the current public-activity/food-special policy.
Routine services and retail discounts remain policy boundaries, not proof of
a new parser failure. All genuine public/bookable recreational activities and
advertised daily/unpriced food features remain in scope.

## Confirmed source-grounded issues

The full20-group source ledger, original galleries, exact live paths and holds
are saved under `functions/artifacts/luna-oct15-production-audit/source-review/`.
Coordinator independently checked the key posters/captions, live paths, raw API
responses and official pages; delegated findings were not accepted blindly.

### Urgent wrong time and duplicate/conflict clusters

- **Auditions**, row337, source `1512432880922082`:
  `venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo` shows Oct26 08:00 until
  Oct27 01:00. Caption/poster and the
  [official audition page](https://confederationcentre.com/on-stage/submissions-auditions/)
  specify the evening and individual appointments, without exact clocks.
  Website enrichment marks08:00 as explicit; the finish is a category default.
  The source's own description admits no confirmed clocks. Generic website
  imagery also displaces the audition poster. Do not replace08:00 with a guessed
  evening hour: preserve the activity and hold unsupported scheduling.
- **Pressure Points**, row21, source `1564814712352727`: new
  `venues/slug_thetivolicinema/events/VtmHIyg7T7V4Tb0sC3Fo` at21:00 conflicts with
  canonical `venues/slug_thetivolicinema/events/nepcYF8RIzLrzPKBXjWX` at18:00 on
  Oct16. The aggregator really prints21:00; the original programme and
  [official festival schedule](https://www.anchorfest.ca/film) confirm18:00 at
  Tivoli. This is source conflict plus publication/dedup failure, not a model
  inventing a different clock. Preserve the canonical source-grounded record.
- **Pints East Trivia**, row301, source `122145244485157304`: new
  `venues/sJQHqeQVXehTHcFarwc6/events/Ez7t4IXyxsxjRisCtHnC` General Trivia and
  `venues/sJQHqeQVXehTHcFarwc6/events/oXz81O57WSQ1D4nGMkn6` Trivia are both
  Oct16 18:30–20:30 with staff hostAlex. This is a confirmed same-session copy.
  Different printed Bell Aliant swim starts remain separate, not cleanup targets.

### Accepted activities lost downstream

- **Ruby's Counter**, row325, source `122317448546189551`: all four specials
  survive Stages3/4, then disappear for missing clocks. The$10 eggroll already
  exists. The current$10 Chicken Cacciatore conflicts with an older$16 parent;
  the$6.50 corn/bacon chowder and$16 two-burger feature are absent. Three current
  offers are not correctly represented, rather than four entirely missing
  foods. Stage3 also transcribes the soup price as$6; original board shows$6.50.
- **FiN Taco Thursday**, row257, source `122305763552019252`: Stage3 correctly
  extracts weekly Thursday fish/chicken tacos. Both retrieved raw Nano responses
  mark them KEPT but emit `corrections.recurringPattern: none` with an empty
  reason. The compact contract interprets that as an unsupported destructive
  correction, retries once, then holds the post. No new tacos are published.
  Distinguish a no-op placeholder from a real source-supported correction.
- **Mill River Stay & Play**, row48, source `1512635307563171`: dated Oct16
  bookable night-and-golf package,$149+HST, passes through Stage4 then disappears
  without clocks. An honest date-only booking offer needs a publication path.
- **Daniel James McFadyen**, rows269/270: supported Nov19 Trailside show is
  lost for missing time; the other tour stops are not local occurrences.
- **Inn at Bay Fortune**, rows201/202: nine later dated Chefs Harvest items
  (Oct22–24,Oct29–31,Nov5–7) lose final publication. The one created Oct15 item
  `venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W` has unsupported12:30.
  Older generic series are not proven equivalent to the named programmes.
  Opening weekend is partially covered; do not overcount every date as missing.

### Spatial, identity and media observations

- Row221 bike-bus update loses route scope and gains post-time10:17 plus
  fallback23:00 at a school. No source route geometry/clocks are available.
- Row84 all-PEI A&W offer is narrowed to one store's address/hours.
- RCMP Teams sessions have correctly bounded two-Monday recurrence but retain
  a physical venue; Zoom/YouTube activities still enter unknown-venue queues.
- Andersons Creek's Oct24 Bash is held under Course/Club wording while its two
  food/drink offers publish at the existing club. Venue ownership needs source
  resolution through the location workflow, not a new invented venue.
- Book-club category, Rodd Brudenell dinner versus music clock ownership and
  Blank Canvas store-versus-mall specificity need focused review.
- L'Autre loses a specific dated programme image to the aggregator's generic
  image. Twelve row21 updates include mostly generic-to-generic replacements;
  do not call all twelve specific-poster losses.
- Additional date-only/ongoing access losses and unavailable originals are
  listed individually in the source ledger. Existing Johnny Reid, A Long Winter,
  Chris Burke and Brett Kissel records cover several source-specific failed
  attempts; these are not all missing live activities.
- Row90 grilled cheese/soup is **not a confirmed false listing**. Its caption
  advertises the dish today; an absent discount/price cannot alone disqualify
  unpriced daily food features. No removal is recommended on that evidence.

## Stage5 actual error and contained formatter defect

Be You row277, source `122205753014910683`, sends one validated karaoke item.
The original retained API response was retrieved read-only:97 repeated
`formattedEvents` objects,128,858 visible characters,32,000 output tokens,
**zero reasoning tokens**,207.272 seconds, incomplete `max_output_tokens`.
The parser rejects the incomplete result; no partial events/duplicates are
written, checkpoint moves forward, and the dataset completes. Existing weekly
keeper `venues/name_n2ivcu/events/NJ5X8fPIVOy405M9sfFS` and its next occurrence
already cover karaoke. This is a failed refresh/generation loop, not confirmed
missing karaoke. No paid regeneration or live replay was performed.

Milton row244 changes09:00 to12:00 in the formatter. Persistence retains the
correct existing09:00–12:00; it is a contained formatter error, not a wrong
published clock. Future recovery must preserve source identity and completeness,
reject partial responses and bound any single-item retry. Raising the output
cap would let the observed loop run longer and is not the recommended repair.

## Preservation, source availability and unfinished prior work

Eleven prior removed parent IDs (seven root/child copies,two Be You,two Daisy)
and their generated feed occurrences remain absent. Six approved one-off
keepers remain present once; Wednesday/Friday Sing-Along identities remain
separate. Anchor retains eight unordered points,seventeen explicit child links,
blank public clocks and the reviewed discovery-only date-range timing. The
Arts Mixer correction preserves its already-linked event ID.

No APM evaluation/Hamilton showcase/Connolly Park original source appears in
today's usable cohort. Hamilton queues remain ignored and Connolly Park held
in Souris. These are preservation checks, not new full-run exercises of those
guards. **The older17-item APM recovery has not materialized**: current APM has
nine older events and none of the sixteen North River sessions/volunteer
meeting. See the still-prepared exact plan in
`docs/oct14-followup-live-approval-plan.md`; queue resolution alone did not
create the events. Do not silently claim this prior recovery was finished.

Profile scan559 venues:246 available,15 preexisting missing,297 blank,1
unverified. No newly missing/blank healthy profiles. Olde Dublin remains200.
Forty-nine current-feed venues have preexisting blank profiles; no new repair
authorization is inferred.56 cleanup403 warnings reflect rejected automatic
image-deletion attempts, not successful profile-image deletions.

## Actual per-stage model estimates and timing

Standard USD local accounting defaults, API-reported ordinary input/cache reads/
cache writes/output. These are estimates, not invoice reconciliation; exclude
scraping, Cloud Run, Places, storage and separate festival shadow calls.
All463 measured calls have known cache-write coverage. No write input is charged
twice. One OCR-debug call is outside the five primary stages.

| Stage | Calls | USD | Summed API seconds | Mean seconds | Max seconds |
|---|---:|---:|---:|---:|---:|
|1|148|0.136354|1239.971|8.38|23.758|
|2|88|0.058355|370.689|4.21|13.931|
|3, including3 auxiliaries|83|0.137895|1143.403|13.78|67.557|
|4|75|0.030306|410.684|5.48|12.385|
|5|68|0.048820|687.982|10.12|207.272|
|OCR debug|1|0.000619|3.469|3.47|3.469|
|Total|463|**0.412348**|3856.198|—|—|

The primary-stage subtotal is$0.411729. Yesterday's measured model estimate was
$0.473615, with a different source cohort. Excluding the single looping call,
Stage5 mean is7.17 seconds. Nano Stage4 has no incomplete/malformed responses;
all75 complete, but the compact semantic hold above still loses a valid source.
Stage5 has67 completed and1 incomplete, zero reasoning tokens overall. Counts
and mean latency are API observations, not a claim of near-instant responses.

## Completed approved repair and remaining order

Arts Mixer exact data correction is backed up/independently API-feed verified.
Only its spatial classifier guard was deployed after completion from isolated
commit2dbd81c:785 full tests, narrow dry run/deploy, all three ACTIVE/100% at
common hash `608dca297a322ff2d5ced72337b5cd60dbedc9b9`;71 user environment values
and secret bindings unchanged. See `docs/arts-mixer-oct15-venue-repair.md`.

Recommended next sequence, one reviewed change at a time:

1. Source-bound website clock/image enrichment fences; prepare exact wrong-clock
   and duplicate corrections with full backups/approval.
2. Compact Stage4 no-op recurrence semantics and conservative date-only offer
   completeness, tested against tacos,Ruby,Mill River and healthy timed events.
3. Bounded Stage5 single-item loop recovery with retained diagnostics; no cap
   inflation or partial publication. Include the contained Milton regression.
4. Finish source-aware duplicate/media protection and the outstanding exact APM
   recovery through its approved-plan workflow. Preserve genuine slot differences.
5. Finish festival evidence/context and canonical provenance work in shadow;
   no automatic public linking until its gates pass.

## Evidence

Coordinator artifacts: `functions/artifacts/luna-oct15-production-audit/`:
completion/snapshots/ledger,10,620 raw and attributed logs, usage/timing summaries,
model-worker controls,all89 write/API results,profile scan,cleanup/area controls,
raw row277 Stage5 and row257 Stage4 response retrievals. Source-audit documents
are copied into `source-review/`; original galleries/contact sheets remain in
the existing isolated investigation checkout's `functions/tmp/oct15-production-audit/`.
No unavailable pixels, historical absence or source conflict was silently
converted into a confirmed model mistake or deletion target.
