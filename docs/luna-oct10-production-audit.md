# October 10 production audit and next pilots

## Completed regular run

Dataset `1a8FFxUSkseWH6poV4-Htdhv4BRUSNlZl`, run
`cbce0e1a-1b7f-496c-8694-8045aac55edf`, ran 12:39:21–14:29:18 UTC
(9:39–11:29 Halifax). Firestore has a completed processing lock, a processed
dataset marker, completed final batch state at 382/382, and no checkpoint.
This was a regular full dataset, not a selected-row replay or dry run.

Batch counters: 61 processed, 108 skipped, 213 invalid, 0 errors; 90 creates,
50 updates, 1 duplicate. Logs show 141 successful create/update operations on
136 distinct paths. The extra logged update is row 97's second representation
of the same dinner: it updates the just-created record and is counted as the
duplicate rather than as a batch update. Four other repeated paths are
cross-source updates. Every source row started exactly once (382 unique starts);
there is no observed replay or checkpoint regression in this run.

All three parser functions were ACTIVE, all traffic on their latest revisions,
with common source hash `53c15f4a10bd3f5e04b1057023e23302803ba0bc`:
`processdataset-00461-xey`, `processdatasetresume-00425-nav`,
`processdatasetselectedrows-00417-gaq`.

Stage 1 eligible/selected: 169/169 (164 image evaluations, 5 caption-only).
Stage 3 eligible/selected: 85/85. Actual usage matches Luna in Stages 1/3,
Mini in Stage 2, Nano in Stages 4/5, with no GPT-5.2 fallback. Stage 1's
173 calls and Stage 2's 90 calls include four gallery-refresh evaluations.
Stage 3's 111 calls include auxiliary calendar checks, not 111 unique posts.

## Source review and findings

Reviewed all 169 caption/snapshot records, all 83 Stage 1 rejections, and the
available ordered galleries. Retrieved 284/287 original gallery images.
Unavailable: row 23 image 0, row 143 image 0, row 326 image 0. These are source
limitations, not confirmed negative decisions. The per-source ledger records
extraction, holds, formatted output and actual logged event paths separately.

| Row/source | Source and observed outcome | Repair or status |
|---|---|---|
| [117: Seaside clinic](https://www.facebook.com/1793693025774013) | Caption advertises a walk-in clinic Oct 9, 9 a.m.–4 p.m.; Stage 1 rejects health services. Poster has a conflicting `9PM` typo. | Public dated clinic policy now applies to images as well as captions. Fresh Luna high replay accepts it. Already past at this parse; do not create an expired event automatically. |
| [274: Farmers' Market](https://www.facebook.com/1770064988462507) | Saturday market session, Oct 10, 9–2, 614 North River Road; Stage 1 rejects as retail. | Explicit public market-session policy. Fresh Luna high replay accepts it. Ordinary shop hours/stock controls remain rejected. |
| [313: Milton sale](https://www.facebook.com/1925415225579146) | Stage 3/4 and Nano's raw Stage 5 correctly describe the Oct 10, 9–2 craft/yard sale, $2 admission. Local merchandise filtering drops it. | Retain explicitly dated/timed craft, yard, garage and flea-market sales; ordinary merchandise promotions still fail. Both fresh Nano and Luna formatting retain it. |
| [180: Souris tour](https://www.facebook.com/1740954254704708) | Stage 3 reads eleven tour dates. Website enrichment lends the Oct 24 Souris time/link to other dates. Oct 30 PEI Brewing record is written with that borrowed detail. Souris child is incorrectly routed as an area because a city inferred from its venue is counted as another stop. | Require explicit website date agreement; keep each already-split venue's spatial context. Collapse an inferred city inside that same named venue, while preserving actual routes and multi-site events. No live repair applied. |
| 207: Tivoli calendar | Discounted movie admission is classified as food on three occurrences. Two additional printed screenings are omitted: Evil Dead 2 Oct 20, and Dracula vs Frankenstein Oct 22 at 7:15 p.m. Oct 21's distinct Frankenstein/Dracula double feature is conflated with the latter title. | Cinema admission category correction tested. The calendar inventory/title omissions remain an explicit Stage 3 follow-up; failed 8,000-token inventory calls did not repair them. Do not call this calendar complete. |
| 312: Samuel's | A teaser says special rolls return later this month, without an availability date. Extraction defaults to Oct 9; a live food special is created. | Hold item-level undated future teasers assigned the post date; current daily specials stay eligible. No live deletion applied. |

Additional observations: row 32's race website enrichment supplies an invalid
11:00–06:00 child range; that row writes no events, so this is an enrichment/hold
issue, not a wrong live race. Row 31's `2:00am` walking tour is printed that way
in the source; do not silently correct it to p.m. Row 202 has a source weekday
versus date conflict. Untimed activity holds and out-of-region tour stops are
not proof of model omission. Broad cross-source deduplication remains deferred
until the Luna transition is complete.

Persisted-record distinction: the omitted Oct 20 Evil Dead 2 and Oct 22 Dracula
screenings already exist correctly from prior sources; today's extraction
misses did not remove those listings. The existing Oct 21 double-feature keeper
also retains its correct title. Minions' formatted food flags do not become
three wrong live food records: the two existing Minions keepers remain cinema
listings, while Suspiria is actually stored as a food special. Existing extra
Minions records and an Oct 10 keeper at 17:00 despite today's 15:00 extraction
are writer/history observations for the deferred deduplication work. Do not
mistake formatted snapshot defects for the exact persisted mutation.

## Recorded token cost

USD, recorded input/cache/output tokens at published standard rates. These are
API token estimates, not a Google Cloud bill or an invoice reconciliation.

| Stage | Calls | Input | Output | Estimated USD |
|---|---:|---:|---:|---:|
| 1: Luna high | 173 | 1,444,620 | 108,854 | 0.198889 |
| 2: Mini | 90 | 583,649 | 53,075 | 0.239678 |
| 3: Luna high, including auxiliary checks | 111 | 986,547 | 156,033 | 0.176671 |
| 4: Nano low | 86 | 239,956 | 130,852 | 0.064339 |
| 5: Nano medium | 81 | 223,111 | 433,277 | 0.184466 |
| Separate OCR diagnostic: Luna | 1 | 3,892 | 1,623 | 0.001201 |
| Total | 542 | 3,481,775 | 883,714 | **0.865244** |

Stage 2 has 55,040 cached input tokens. Luna cache writes are not separately
reported in these snapshots; treating every Luna input token as a cache write
would add at most about $0.061. Rates verified October 10:
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Mini](https://developers.openai.com/api/docs/models/gpt-5-mini),
[Nano](https://developers.openai.com/api/docs/models/gpt-5-nano).

Stage 5 reasoning was 363,008/433,277 output tokens (83.8%). The Tivoli row's
Stage 5 took 140 seconds; Stage 3 also consumed 226 seconds, including two
failed inventory calls. Stage 5 replacement will not remove that Stage 3 cost.

## Fresh Stage 5 evaluation

Replayed all 69 saved Stage 4-positive sources, 221 supplied items, through
production formatting with Luna none; no writer or Firebase mutations are
available to the harness. 81 actual Luna API calls, estimated $0.055290.
One completed response was malformed JSON (row 359); bounded two-item retries
recovered all four items. Raw response evidence is retained before repairs.

Reviewed apparent field/count differences: row 291's 18 dates become three
bounded weekly parents (7 Wednesdays, 6 Thursdays, 5 Mondays); row 39's three
slide days become one daily parent with exactly three occurrences. Both preserve
the source dates through existing recurrence code. Row 348's `$1.49 per loaf`
retains the source price. Repeated same-title shows are matched by date/time,
not merely title. No confirmed lost supplied occurrence, price, time, venue,
ticket URL or image identity remains in this checked cohort.

Five matched fresh Nano/Luna pairs (rows 31, 111, 207, 224, 313):

| Measure | Nano medium | Luna none | Reduction |
|---|---:|---:|---:|
| Sum of per-post elapsed time | 325.187 s | 84.252 s | **74.1%** |
| Recorded token cost | $0.033983 | $0.012763 | **62.4%** |

This is a five-source matched measurement, not a whole-run speed projection.
It agrees with the earlier October 9 comparison. The small-post completeness
guard now checks raw count and unique source indices before normalization;
failed batches split within a bound, then hold the post if still incomplete.
Legacy placeholder reconstruction retains supplied price and ticket URL.

## Stage 2 readiness and decision

The October 9 readiness work covered 119 paired classifier cases and 30
five-stage no-write replays. Added 12 current source pairs and six downstream
extraction comparisons for three route differences. An initial local fixture
mistakenly supplied the post timestamp as Facebook event metadata; those
results are retained as invalid and excluded. The corrected evaluation uses
the original `utcStartDate` only.

Both models reject the library Bookface post. The Thanksgiving meal remains
two dated specials through both routes. The undated Samuel's teaser remains
subject to the new date hold. The Souris tour's low one-item estimate weakens
calendar routing; independently observed grid + tiling + multi-listing evidence
now preserves the calendar prompt, with a single-event control retained.

Decision: retain Luna high at 100% of eligible Stages 1/3, Nano low in Stage 4;
prepare independent 50% source-stable pilots for Stage 2 Luna none (high review
of negative decisions) and Stage 5 Luna none. Release evidence and live env
readback are recorded separately. Exact live-event corrections require a
reviewed, backed-up plan and Craig's approval. This audit is not a live repair.

Private evidence: `C:\Users\craig\.codex\luna-oct10-audit` contains the full
logs, completion records, original images, per-call raw responses, test runs,
and frozen replay cases. Sanitized source/write ledger is saved under
`artifacts/luna-oct10-production-audit/ledger.json`.

Final verification: build succeeded; all **583 compiled tests** passed, all
**53 pilot script checks** passed, the added **7 Stage 5 reasoning/override
checks** passed, and all **26 website/spatial/router focused checks** passed.
The first regression run exposed the city/venue duplication and a website
fixture without a same-paragraph title; both were resolved before this final
suite. Read-only release preflight at 15:11 UTC found no active parser locks.
