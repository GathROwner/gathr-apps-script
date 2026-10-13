# October 13 production audit

## Conclusion and recommendation

The regular 355-row parse completed in **54m47s**, at **10:34 a.m. Halifax**.
There were **84 creates and 25 update operations to 21 existing records**.
The model allocation, compact Stage 4, cached Stage 1/2/5 requests, resume
fencing and avatar protection worked. Keep the current model allocation.

This is **not a clean event-quality pass**. Source review found extraction
mistakes, unsupported times, category overrides and incorrect duplicate merges.
Prioritize narrow integrity repairs before further prompt/model experiments.
This audit changed only local evidence and documentation: no deployment,
replay, traffic change, live event/venue mutation or map interaction occurred.

## Completion, serving state and coverage

- Dataset `1jiS0_fwi1ph84lMz5CYaMHSHofx3WMDG`; run
  `75e785f3-e7e3-46f0-bdeb-58e4b8b045eb`.
- Started 12:39:32.144 UTC; processed marker 13:34:19.492 UTC.
- Completed processing lock, processed dataset marker, completed final batch
  355/355, and no checkpoint independently establish completion.
- Processed 38 + skipped 80 + invalid 237 = 355 rows. These counters are not
  event counts. Nineteen unknown-venue operations touched **10 queue documents**,
  not 19 different venues. Queue resolution remains the location task's scope.
- Collected 8,178 fully paginated function logs, 118 evaluated row snapshots /
  117 unique source identities, 25 update audits and the current event inventory.
- Visually reviewed 183 of 184 original ordered-gallery images, using 12
  contact sheets and native dense calendar/poster images. Red Sands row 46's
  image failed retrieval; its rejection cannot be independently visually proved.
- All 109 write operations / 105 distinct paths exist; every detail endpoint
  check returned HTTP 200. Fully paginated upcoming feed: 1,020 occurrences,
  11 pages. Detail presence alone does not prove correct upcoming recurrence.
- Independent readback: all three parser functions ACTIVE, 100% latest traffic,
  common hash `539278f36f5a501c465f2fe1489f6eda34e8f617`:
  `processdataset-00473-kib`, `processdatasetresume-00437-cuw`,
  `processdatasetselectedrows-00429-rim`.
- Actual calls: 279 Luna and 49 Nano; **zero Mini, GPT-5.2 or legacy fallback**.
  Stage 1 Luna high 118/118 eligible evaluations (107 image, 11 caption-only);
  Stage 2 Luna none with high negative review; Stage 3 Luna high 46/46 eligible
  posts (42 image, four caption-only); Stage 4 Nano low compact_v1; Stage 5
  Luna none for all formatting. No Nano Stage 5 calls or reasoning tokens.
- Stage 3's 54 calls include 48 extractor calls, four umbrella date maps and
  two calendar inventory audits. One auxiliary OCR call is accounted separately.

## Costs and latency

Standard configured USD token estimates, including cache reads/writes once;
not invoice reconciliation, scraping fees, Places, Cloud Run or storage costs.
No PRICE_* environment overrides were present. All 328 calls have explicit
cache-write coverage. Summed API durations are not wall-clock stage durations.

| Stage | Calls | Input tokens | Output tokens | Cached-read tokens | Cache-write tokens | USD | Summed API seconds | Longest call seconds |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 Luna high | 121 | 978,695 | 75,060 | 393,575 | 6,737 | 0.100146 | 995.339 | 26.613 |
| 2 Luna | 52 | 348,886 | 8,795 | 64,450 | 2,578 | 0.033550 | 207.914 | 12.567 |
| 3 Luna high + audits | 54 | 441,491 | 77,455 | 0 | 441,329 | 0.093910 | 808.128 | 92.341 |
| 4 Nano low | 49 | 165,471 | 34,594 | 0 | 0 | 0.022111 | 343.852 | 20.752 |
| 5 Luna none | 51 | 138,422 | 44,099 | 88,100 | 1,762 | 0.028007 | 375.918 | 24.904 |
| Auxiliary OCR | 1 | 3,892 | 1,162 | 0 | 3,889 | 0.001067 | 10.650 | 10.650 |
| **Total** | **328** | | | | | **0.278791** | **2,741.801** | |

Stages 1-5 subtotal: USD 0.277724. Cache-read shares of input were 40.2%,
18.5%, and 63.6% for Stages 1, 2 and 5. Stage 3 reported writes but no reads;
this is not evidence that its held cache-layout experiment was released.

Yesterday's different cohort cost USD 0.257633 and took 48m03s. Today cost
8.2% more, with 143 Stage 3 items versus 109, 140 retained Stage 4 items versus
106, and 126 formatted items versus 86. This is not a paired regression test.
Stage 1 remains the largest single expense, just ahead of Stage 3.

All 49 Stage 4 and 51 Stage 5 responses completed; no malformed JSON,
incomplete/token-limit responses or source-identity contract failures. Stage 4
retained 140 of 143 items with no source-field mutation. Its compact diagnostic
has no parsedItemCount field: missing is not zero output. Stage 5 raw output
covered 140 supplied items; 11 incomplete-time holds and Dunes' four-to-one
consolidation explain 126 formatted items. That consolidation is semantically
wrong (below), despite passing the transport/completeness contract.

## Resume, write and image controls

All row indices 0-354 started exactly once. Nine productive sequential workers
made 363 monotonic checkpoint saves, reaching 355; handoff saves explain the
extra saves. A tenth, zero-row task was rejected as stale: expected row 139,
actual row 191. This is positive fencing evidence, not another active parser.
No overlapping productive workers, checkpoint regression, manual recovery or
ERROR logs were observed. Multiple sources touching a keeper are not row replays.

Longest five-stage rows: Cavendish 294, 217.544 seconds; City Cinema 190,
156.236 seconds; Inn at Bay Fortune 42, 123.491 seconds. Stage 3 extraction
including its auxiliary work reached 141.360 seconds on Cavendish. No October 6
serial-work stall recurred: 49 item venue matches totaled 14.683 seconds,
maximum 1.069; 110 dedupe checks totaled 8.550 seconds, maximum 0.132;
84 creates totaled 7.801 seconds, maximum 0.339.

Every touched document has image provenance and matching primary/relevant URLs.
Raw image indices include caption-only zero and caption-derived -1 sentinel
values; these are not proof of gallery misattribution. Source/gallery review
found no confirmed cross-post image swap. This does not claim every stored
image URL across all historic events was fetched.

All **549 venues** were probed: 246 available pictures, 15 pre-existing missing,
287 blank, one unverified. None of yesterday's 246 healthy pictures regressed.
Olde Dublin's repaired URL returns image/png HTTP 200 and appears on all four
upcoming Olde event API entries. Backend cleanup logged 84 post-image deletions
and **16 blocked protected-image attempts**, with zero profile-image deletions.
The remaining redundant caller attempts should stop being queued in a later
narrow cleanup fix; backend protection is working. Four separately prepared
avatar repairs remain unapplied and require their exact approval.

## Source-to-write findings

### 1. Cinema composite titles merge distinct screenings; existing good records prevent an overall omission

Tivoli row 143, source `122232429122578108`, advertises Screamplay at 21:10
October 19/20 and mentions the adjacent Evil Dead II screening. Stage 3 names
the primary event **Screamplay! and Evil Dead II**. Row 144,
`122232428936578108`, correctly extracts Evil Dead II at **19:15**. Duplicate
matching absorbs the latter into the composite 21:10 keepers instead of
matching their separate screening identity:

- `venues/slug_thetivolicinema/events/B0lJFx0bZMZBWrSWu95U` (Oct 19)
- `venues/slug_thetivolicinema/events/NiPGGgJyAfDuvFMxWuVA` (Oct 20)

Important correction to preliminary commentary: good Evil Dead 2 records
`Hw0e5PfAjRASQGyUjyID` and `h613CrtUC86Mz3P9SJvV` already exist at 19:15 from
another source. Thus there is
**no overall missing screening**. There are duplicate/composite Screamplay
listings, and today's merge route is wrong. Preserve the good screenings;
never create replacements merely because today's extracted rows were merged.

Prevention: primary-title/context separation and a narrow cinema screening
clock/title merge guard. Broad duplicate cleanup remains separately scoped.

### 2. Explicit Zumba duration lost, then the old keeper retains the wrong end

Milton row 224, source `2230951430970178`: native poster explicitly says
Wednesday October 14, 17:30, **one hour**. Stage 3 retains the duration in prose
but leaves endTime empty; formatting/time normalization uses the two-hour
`duration_default`. Duplicate matching preserves the existing weekly keeper:
`venues/nvQTJXSbDsSfJTCxDKCH/events/0gGOviSZCv9OE2KhpL3Z`.
The Oct 14 API occurrence ends **19:30**, rather than **18:30**.

Prevention: convert item-local explicit durations before category defaults,
retain provenance, and allow a proven end correction through the keeper merge.
Do not infer that every future Wednesday uses this one poster's duration.

### 3. A new watercolour course session disappears into an exhausted series

Downtown row 136 correctly extracts Beginner Watercolour Course, Session 1,
October 13 at 18:30. The writer merges it into
`venues/name_6387om/events/dUp4A9jObgs6DwbXrPOA`, a September 22 parent with
three Tuesday occurrences. The stored anchor/count are unchanged; the old
series exhausts by October 6. The fully paginated upcoming feed has **no Oct 13
occurrence of this Blank Canvas course**. Other painting classes at a different
venue are not substitutes.

Prevention: recurrence lifecycle/remaining-occurrence checks before matching a
new course cycle. Preserve source, date and count identity rather than merely
refreshing media on an exhausted keeper.

### 4. Calendar film-date and venue precision remains open; primary sources conflict

City Cinema row 190, source `1645766067560308`, supplies four small film cards. Stage 3
misreads several dates and copies A Long Winter to a venue absent from its card.
Concrete current records:

- New Back in Black City Cinema Oct 18, 19:30:
  `venues/slug_citycinemachtown/events/PARn8DD5TTQUgPqAgKjs`.
  The printed card says Oct 14. The current official City ticket says Oct 14
  **19:00**, while the card says 19:30. A separate 19:00 keeper must not be
  deleted as a supposed Q&A duplicate without resolving this evidence.
- New A Long Winter Tivoli Oct 16, 19:00:
  `venues/slug_thetivolicinema/events/e26D8wbYhP2Z27GVXSbA`.
  The card names **City Cinema only**; this Tivoli occurrence lacks support.
- In the Heart of the South City keeper
  `venues/slug_citycinemachtown/events/ViG0wijW2HqYwhWYdATH` remains Oct 18,
  although card and current program say **Oct 16, 18:00**.
- L'Autre Tivoli keeper `dz35gb3dc50NwIl9kuUo` retains Oct 18, 20:00 from the card; the
  current program and ticket agree on **Oct 16, 20:00**. This is an outdated
  or conflicting source card, not a demonstrated digit-reading failure alone.
- A Long Winter's official ticket is internally inconsistent: headline Oct 15,
  body Oct 16. The program says Oct 15; card says Oct 16. Hold/review that conflict.
- The exact-source guard blocked a new wrong Oct 18 Back in Black Tivoli write
  against yesterday's corrected Oct 14 identity. Yesterday's corrected three
  physical records retained their dates, but alternate IDs/venues can bypass it.

Primary evidence reviewed October 13:
[official film program](https://www.anchorfest.ca/film),
[Back in Black City ticket](https://locarius.io/events/5008/opening-night-back-in-black),
[A Long Winter ticket](https://locarius.io/events/4885/a-long-winter),
[L'Autre ticket](https://locarius.io/events/5011/lautre-the-other).
Do not silently substitute one source or redeploy the previously unsuccessful
blind second-read experiment. Resolve contradictory primary evidence first.

### 5. A correct music category is overwritten by a deterministic venue prior

Downtown row 136's violin recital (James Ernes title as extracted), October 13
19:30 at Sobey Family Theatre, is Live Music before `Cinema venue hardening`.
That code changes it to Cinema, reason `cinema_venue_prior`. Live path:
`venues/slug_sobeyfamilytheatre/events/xNXoeY9sf8n3R7MZfC1s`.
The non-cinema signals do not cover this recital wording adequately.

Prevention: protect explicit recital/orchestral/performance identity before a
venue prior. This specific error is **not Luna's final category decision**.

### 6. Weekday walking access becomes a one-day event; two pool windows retain a wrong category

Eastern Kings row 330, source `1670545314532853`, advertises walking track
access beginning Oct 19, **Monday-Friday 08:00-15:00**. Stage 3 reduces that to
one Monday, recurrence none; Stage 5 categorizes it Gatherings & Parties.
Only walking-track record found:
`venues/slug_easternkingssportsplex/events/QIGk3HATuvKTvgOVlRWm`.
Preserve advertised weekdays as Sports without inventing a season-end date.

Bell Aliant row 175 retains all ten valid activity windows and rejects the
closed-for-lessons notice. Lane swim/open pools are Sports, but two Leisure and
Toddler Pools Open windows remain Gatherings & Parties:
`venues/slug_bellaliantcentre/events/akgpr4MJcK4dVN43obb1` and
`venues/slug_bellaliantcentre/events/n03e77KuehV7mYNFOwfO`.
Extend the activity-category control; do not reject this public recreation.

### 7. Dunes' unknown clock bypasses the new time guard; venue queue contains the bad payload

Row 55, source `1705425784715943`, mixes retail hours with a Harvest Feast on
sparse dates Oct 2/3, 9/10, 16/17 and no dinner clock. Stage 3 produces four
partial/past dates with daily recurrence. Stage 5 collapses these into a daily
09:00-21:00 dinner, unsupported by the dinner evidence. **No live event was
written**: The Dunes is held at `unrecognized_venues/uv_24e6b3b36ceb02a9ffadb4de`.
That queued payload must be corrected before venue finalization publishes it.

Read-only code reproduction found two holes: startTime `unknown` passes the
non-empty-clock early return, and the actual dinner item lacks the `special`
type required by constrainSourceTimes. Emptying the clock alone or changing
the type alone does not trigger the guard; changing both does.
Prevention: semantic placeholder normalization, correct item scope, sparse
one-offs and no retail-hours substitution. Keep location resolution separate.

### 8. Door times and per-date ticket links are not consistently preserved

Trailside row 161, source `1556588789820786`, Jake Vaadeland Nov 4: the source
URL names **doors 18:30**; that becomes event start in
`venues/slug_trailsidemusichall/events/SB4isg36YH4uFsV1jJUq`.
The actual performance clock could not be independently verified. Flag
entry-time/showtime ambiguity rather than inventing 20:00.

Row 163, source `1556527319826933`, Life in the Fast Lane Oct 29/30/31:
caption contains three date-specific Locarius links. Stage 3 drops those links;
Stage 5 substitutes generic trailside.ca. Written IDs `PnGBYC08PbZd1J0OS1Nz`,
`spQAzzFJu7YJ5KjagTLG`, `zJx5OJ2vwHTYYgFsbOAZ` under
`venues/slug_trailsidemusichall/events/` have generic ticket metadata and 18:30
start derived from doors. Bind each date to its direct source URL and keep
entry/showtime semantics. Row 162 Jazz Ensemble is a healthy control:
explicit 18:30 doors / 19:00 show yields 19:00 with the direct ticket URL.

### 9. Incomplete source identities and private rentals need scope controls

Milton row 225, source `2610539662812967`, contains the cropped bottom of a
poster and a building image. Visible Nov 13/14 dates and 19:00/14:00 clocks
survive, but activity title is not captured. Published generic titles
**Milton Community Hall event (title not visible)** are not useful verified
activity identities. Paths end `OAIV0bPdyNQWoCodVhj6` and
`oKOqmdzrGjOJKk9dAXpN` under `venues/nvQTJXSbDsSfJTCxDKCH/events/`.
Hold placeholder identities or recover the full source; do not invent a title.

Cavendish row 294 publishes an explicitly **Private Rental** Oct 12
20:30-21:30 as Private Rental Ebbem Ouble:
`venues/LglliE42SPFssmoU01su/events/5iIhMrL3qDq8VhdXSfQ4`.
Already expired at audit time; do not turn that into an unnecessary deletion.
Reject private occupied slots while preserving genuine Available to Rent slots.
Thirty-two calendar items survive without transport loss; an unnamed Thursday
06:00 hockey cell and an uncertain age-group digit remain lower-confidence
inventory observations, not confirmed missing public activities.

## Rejections, holds and previous repairs

- Reviewed all 72 Stage 1 rejection evaluations / 71 unique sources against
  captions and available galleries: **no confirmed wrongful rejection**.
  One unavailable Red Sands image limits that conclusion. Thanksgiving greetings,
  ordinary retail inventory, closures and election filing controls remain out.
- Coach's, Razzy's and Ruby's advertised food offers pass content screening but
  have no printed serving clock and are held downstream. They are not Stage 1
  misses. Ruby's adjacent ordinary roast-pork-dinner wording constrains the
  Sloppy Joes item as dinner: record this item-scope/enrichment limitation.
- Inn at Bay Fortune row 42: past recap meal extracted instead of future chef
  content, safely held for missing time. Island Hill Farm row 305: both Wed/Thu
  tours accepted, held for missing hours; advertised Fri-Sun admission sale only
  survives in description. This is enrichment/inventory work, not scope exclusion.
- Milton's image-only Knit and Crochet Socials row 226 has no date/clock; safely
  rejected downstream. Rodd's Symphony row 229 and Lisa Kessler funeral row 188
  have no verified clock; no invented afternoon/morning start was published.
- Nadine's Oct 15 jazz listing has weekly metadata but the current feed shows
  only the correct Oct 15 base occurrence. Do not claim confirmed false future
  performer occurrences without tracing recurrence materialization. Preserve
  the previously approved Baba's source-owner recurrence controls.
- Chambers lunches remain 11:00-13:30, Boston Appy starts 20:00, Coats and book
  launch categories remain corrected. Milton's restored Oct 14 knitting session
  remains 13:30-15:30 and appears once. Approved Hunter brunch and A&W deletions
  remain absent. Expired volunteer records are not counted as new omissions.
- No new venue-image regression. The 15 old missing images and current blank
  venues are still outstanding; do not claim all venues have healthy pictures.

## Proposed next sequence (not executed)

1. Fix and regression-test placeholder clock/duration handling and the incorrect
   category overrides, with genuine printed clocks and recreation controls.
2. Add narrow merge protections for different cinema clocks and exhausted course
   cycles; protect performer/recurrence owners and the correct existing records.
3. Correct weekday recurrence, per-date ticket binding and placeholder/private
   activity scope. Review conflicted festival evidence separately.
4. Prepare exact backed-up live repair plans; obtain approval before applying.
   Do not add Evil Dead screenings that already exist or automatically resolve
   contradictory official festival dates. Do not finalize Dunes' bad payload.
5. Repeat affected rows in dry-run mode, then use the established narrow release
   gates. Keep current model allocations and deferred cache experiments unchanged.

## Evidence

Local ignored evidence root: `functions/artifacts/luna-oct13-production-audit/`.
Key files: completion.json, functions-readback.json, snapshots.json, ledger.json,
logs.json, attributed-logs.json, usage-summary.json, api-timing-summary.json,
runtime-controls.json, stage45-diagnostics.json, deterministic-reproductions.json,
case-evidence.json, final-controls.json, provenance-controls.json,
write-api-verification.json, api-feed.json, prior-repair-controls.json,
profile-controls.json, profile-cleanup-logs.json and original images/contact sheets.
The captured ledger, native sources and complete paths are the authority for
future plans; abbreviations in this narrative are not deletion manifests.
