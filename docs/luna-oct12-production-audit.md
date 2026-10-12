# October 12 production audit: cached prompts and compact Stage 4

## Result and recommendation

The regular parse completed normally in **48m03s**, with **62 new events and
22 updates to 22 distinct existing records**, plus one duplicate touch. The
optimized requests are serving, cache reads are being reported, and compact
Stage 4 preserved the retained source records. Keep the current model rollout
and cache layouts. Repair the specific extraction, category and time failures
below before doing another optimization experiment.

This is a completed read-only audit, not a clean quality pass or a deployment.
No historical records, parser settings, traffic or map were changed. Source
review found material wrong listings, including errors in deterministic code
and an existing keeper that ignored a correct new extraction. These must not
all be attributed to Luna or prompt caching.

## Completion and runtime proof

- Dataset: `1qGUkgURxqthV6F8Y4jAKZIpET_qC82wq`, regular APIFY Dataset.xlsx,
  345 rows. Run: `82668a64-bc89-4711-a272-d83738c2894f`.
- Start: October 12 12:39:27.848 UTC / 09:39:27 Halifax.
- Processed marker: 13:27:31.178 UTC / 10:27:31 Halifax.
- Fresh Firestore read: completed processing lock, processed marker, completed
  final batch at 345/345, no checkpoint. See `completion.json`.
- 7,045 Cloud Run log entries were collected with complete pagination for
  12:38–13:30 UTC. No ERROR log or pipeline error counter was recorded.
- Nine sequential resume executions processed source indices 0–344 exactly
  once. Eight handoffs; no overlapping execution intervals, repeated row starts,
  checkpoint regression, stale recovery or manual recovery observed.
- 353 checkpoint-save logs: per-row saves plus handoffs, monotonically 1–345.
  The extra saves are not extra processed rows.
- Longest five-stage row was Milton row 289: 170.522 seconds. No recurrence of
  the October 6 serial venue/write stall was observed. Venue-item matching took
  7.008 aggregate seconds across 32 calls, maximum 0.857 seconds; 85 dedupe
  checks took 6.349 aggregate seconds, maximum 0.152 seconds.
- 112 evaluated post-row snapshots / 110 unique source identities. The two
  repeated identities are scraped duplicate race recaps, both rejected; they
  are not worker replays. 233 invalid rows + 86 skipped + 26 processed = 345.

## Serving and actual models

Independent function and Cloud Run traffic readback at 14:24 UTC found all
three parser functions ACTIVE, one common source hash, 100% latest traffic:

| Function | Revision |
|---|---|
| processDataset | processdataset-00471-rin |
| processDatasetResume | processdatasetresume-00435-boz |
| processDatasetSelectedRows | processdatasetselectedrows-00427-niw |

Hash: `208dd07dac4181c01dda572270ffe20f3401ed3a`.
Runtime release: `27a3d08e259d8c08bf7509b9956d65af7775fae1`; checkout HEAD
`dd7090e` adds the deployment record. Worktree:
`C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`,
branch `codex/luna-oct11-integrity-repair`.

- Stage 1: Luna high, 112/112 eligible evaluations; seven caption-only,
  105 image evaluations. 117 actual calls include bounded additional evaluations.
- Stage 2: Luna none primary, high negative review; 38 eligible allocations and
  48 calls. No actual Mini calls.
- Stage 3: Luna high, 36/36 eligible selections; 48 calls including fallback
  extraction within the same Luna model and two calendar inventory audits.
- Stage 4: GPT-5 Nano low, 38 calls, every diagnostic `compact_v1`.
- Stage 5: Luna none, 34 allocated posts / 38 formatting calls, zero reasoning
  tokens and zero Nano formatting calls.
- Two additional Luna OCR diagnostic calls. Total **291 calls: 253 Luna,
  38 Nano**, independently reconciled between usage snapshots and API timing
  logs. No actual GPT-5.2 calls or legacy-model fallback in this run.
- Stage 1/2/5 cache layouts are deployed; Stage 3/4 cache experiments remain
  held. Stage 4 compaction did not change its model or effort.

All seven caption-only sources were rejected at Stage 1. Today's run therefore
exercised caption-only Stage 1, but did not exercise caption-only Stage 2/3.

Legacy override environment values are still present beneath the allocation
layer. Those are not evidence that the legacy model was called; actual calls
above are the authority. See `functions-readback.json` and `runtime-controls.json`.

## Cost and timing

Estimated model-token costs use the deployed accounting module's standard USD
rates, including ordinary input, cached reads, cache writes and output exactly
once. All 291 calls have explicit cache-write coverage; none is historical
unknown coverage. This is not invoice reconciliation and excludes scrape,
Google Places, Cloud Run and storage charges.

| Stage | Oct 11 USD | Oct 12 USD | Oct 12 calls | Oct 11 mean API seconds | Oct 12 mean API seconds | Oct 12 input read from cache |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0.163687 | 0.100721 | 117 | 7.39 | 8.73 | 38.9% |
| 2 | 0.073603 | 0.035567 | 48 | 3.14 | 3.77 | 15.8% |
| 3 | 0.105679 | 0.083023 | 48 | 9.33 | 13.27 | 0% |
| 4 | 0.039005 | 0.016397 | 38 | 6.77 | 5.68 | 0% |
| 5 | 0.032650 | 0.020010 | 38 | 5.32 | 7.78 | 64.8% |
| OCR diagnostics | 0.001892 | 0.001915 | 2 | 8.30 | 10.47 | 0% |
| **Total** | **0.416516** | **0.257633** | **291** | | | |

Today's estimated total is **38.15% lower**. These are different production
cohorts, not a paired causal experiment: 345 versus 358 rows, 109 versus 171
Stage 3 candidates, and a different distribution of dense galleries and
negative reviews. The whole run was **39 seconds longer** than October 11's
47m23.863s. Aggregate API-call time was 2,372.139 seconds versus 2,260.563;
summed calls include parallel batches and cannot be added to estimate wall time.
The cache deployment is demonstrably getting hits and reducing input charges;
this day does not establish a whole-run latency improvement.

For compact Stage 4, output fell from 78,610 tokens across 56 calls to 25,363
across 38 calls. Cost per call was 38.1% lower; API mean was 16.1% lower.
Normalized per supplied candidate, cost was approximately 34.1% lower and
summed API time approximately 10.7% lower. These normalizations still do not
replace the controlled replay documented in the release record.

| Stage | Input tokens | Output tokens | Cached-read tokens | Cache-write tokens | Summed API seconds |
|---|---:|---:|---:|---:|---:|
| 1 | 959,584 | 76,461 | 373,712 | 6,631 | 1,021.576 |
| 2 | 359,099 | 9,401 | 56,718 | 2,466 | 181.132 |
| 3 | 415,964 | 62,063 | 0 | 415,820 | 636.818 |
| 4 | 125,030 | 25,363 | 0 | 0 | 216.010 |
| 5 | 100,653 | 31,536 | 65,194 | 1,762 | 295.673 |
| OCR diagnostics | 8,504 | 1,704 | 0 | 8,498 | 20.930 |

## Source and inventory audit

All 112 evaluated cases, including **all 74 Stage 1 rejections**, were reviewed
against captions and available ordered galleries. 166 of 171 original gallery
entries were downloaded and visually reviewed in 14 contact sheets; important
small-print cases were inspected individually at original resolution. One
additional Bell Aliant managed display copy was recovered and reviewed. Four
entries on rows 188 and 250 remain unavailable because the original Facebook
hosts fail DNS. Model image descriptions do not substitute for their pixels.
No confirmed Stage 1 false negative was found in the available evidence.
One ordinary limited-time product false positive is described below.

See [the source-by-source ledger](luna-oct12-source-review.md) for every case,
its source identity, decision, inventory and write counts.

109 Stage 3 candidates → **106 retained Stage 4 candidates** → **106 raw Stage
5 outputs** → **86 complete formatted events**. The three Stage 4 exclusions
were ordinary apple inventory and two bookable offers with no occurrence date
(Bay Fortune retreat and generic sauna booking). Twenty final items were held
for missing clock evidence. These are not formatter inventory loss or a policy
that bookable activities are out of scope.

Every original field in each retained Stage 4 item was compared to the source
item by stable pipeline index, allowing only recurrence fields. **Zero source
field mismatches**. No contract retry, unresolved contract hold, malformed
Stage 4/5 JSON or incomplete API response was observed. Stage 4 used 15,104
reasoning tokens; Stage 5 used zero. Stage 5 batch count and parsed count agree
on all 38 calls. No gallery index outside its supported range was found; -1 on
the three Bell Aliant caption-grounded items is the intentional context-image
sentinel, not a missing gallery index.

## Confirmed problems and their first failing layer

### 1. Chambers lunch specials become evening listings — row 8

Source `1126752633437556` explicitly says lunch and the poster is headed
Lunch Specials for October 13–16. Stage 3 recovered all four dishes and dates,
but left clock times blank and omitted the lunch constraint from item prose.
Compact Stage 4 correctly preserved the items pending time enrichment.
The later hours resolver filled **17:00** from Google Places, with a 21:00
category-default end. All four listings appear in the app API feed.

Affected IDs under `venues/slug_chambersrestaurant/events/`:
`fNQMBf8SmZpyFTVyWZcW`, `G4TX7ui4tdAmRJL0kIZY`,
`aR5TwlLPYwOsP8PBjNri`, `1MAjyg2swS7g3jPZ3ebX`.

Prevention: retain meal-period constraints and reject hours fallback that
contradicts them. The source does not print an exact lunch clock; do not replace
17:00 with an invented 11:00 or 12:00 without further evidence.

### 2. Small film-card dates misread — row 86

Source `1645766067560308`, gallery card 1, prints Back in Black on **October 14
at 19:30 at City Cinema and October 14 at 19:30 at Tivoli**. Stage 3 read October
19 and October 18. Card 2 prints A Long Winter on **October 16 at 19:00**;
Stage 3 read October 18. Stage 4 preserved those already-wrong dates and all
three reached Firestore and the upcoming app feed.

Affected paths:

- `venues/slug_citycinemachtown/events/fdb8VaM7ZGSbChf3jtYI`
- `venues/slug_thetivolicinema/events/ML7bTSmmRtAAPZy24OeR`
- `venues/slug_citycinemachtown/events/ffHWF306JJWirP4DaFMH`

The other three film-card screenings have the printed dates/times and correct
venue assignments. All six retain the ticket URL in API `ticketLink` and
`ticketsBuyUrl`; this does not independently prove client button rendering.

Row 85's separate Q&A poster says October 14, 7 and 7:30 p.m. without assigning
each venue. It emitted two Back in Black starts, but the writer touched the
19:00 keeper rather than creating the 19:30 item. Resolve the venue/time
ambiguity and existing siblings against the festival schedule before changing
live films. Do not blindly create another City Cinema occurrence.

Prevention: test a focused small-print date verification step against these
original cards; preserve correct gallery selection and source identity. This
is a Stage 3 visual read error, not evidence that compact Stage 4 rewrote dates.

### 3. Milton ambiguous time becomes overnight — row 289

Source `1927464192040916` prints Knit and Crochet Socials as **1:30–3:30** in
Wednesday October 14's calendar cell, without AM/PM. Stage 3 explicitly said
meridiem was not printed. Stage 4 retained that evidence. Stage 5 normalization
treated the bare clocks as 24-hour time and published **01:30–03:30**.

Path: `venues/nvQTJXSbDsSfJTCxDKCH/events/pgViRsWspKTtSODqvrN6`.

Existing `hasUnresolvedEarlyMeridiem` only recognizes a few exact prose forms.
A local, zero-API diagnostic reproduced that the actual wording returns false,
while the wording AM/PM unspecified returns true. Use explicit ambiguity
metadata and a reliable source-time contract, not one phrase-sensitive regex.
The surrounding daytime schedule suggests afternoon, but the source does not
print PM: confirm or hold rather than silently guessing.

### 4. Deterministic food-category safeguards misclassify civic activity

- Row 268, Coats for Kids, source `1558965776270954`:
  `venues/name_2lgcnn/events/Hzlbjr0vwVKvmfHlMK6C` is Food Special, 08:00–21:00.
  The formatter's food regex includes `mains?`, which matches **main level** in
  the clothing drop-off location. The log explicitly records a category
  safeguard changing this to Food Special. A local diagnostic changing only
  main level to ground floor leaves it Gatherings & Parties. The wrong category
  then enables venue-hours/default-clock filling despite the pending-time flag.
- Row 257, Montague volunteering, source `1744576431006432`:
  `venues/1ehK5wrBKC460QSpqUMq/events/ihXEVvVDroR8rqQll94j` is Food Special,
  10:00–21:00. The caption invites volunteers to move tables/chairs at 10:00;
  turkey dinner is something volunteers previously ate, not an advertised meal.

Prevention: require an actual offered food/drink identity, exclude civic and
volunteer prose from food keyword inference, and do not let a category change
bypass an unresolved source-clock constraint. Both activities remain in scope.

### 5. Correct extraction cannot repair an older wrong keeper — row 242

Source `1687836756269672` clearly advertises the **free evening double book
launch**, October 16 at 19:00, Beaconsfield Carriage House. All current parsing
stages produced the right book-launch title/category. The duplicate merge kept
the older **Lunch with Nancy Taber & Katie Mac / Food Special** identity while
refreshing price and description. The live detail and feed are still wrong:
`venues/DqhaDw4xcuBFIm6WCQSq/events/sjLQqSYJhqiUigyxcla9`.

This is not a newly invented lunch from today's Luna call. Prevention must be
a narrowly supported same-activity keeper correction, preserving valid
recurrence and source ownership. A separate guarded live correction is needed.
Smaller inherited category discrepancies also remain on the Seaside clinic,
Baba's Karaoke and Hunter's Open Mic keepers; current extraction is correct.

### 6. Food offer scope and price/time binding

- Hunter row 80 (`1562051112608773`) combines an ordinary weekend brunch menu
  with its **$5 mimosa/Bloody Caesar drink specials**, then writes Weekend Brunch
  with price **$5**. The photographed meals have separate prices. Path:
  `venues/fb_100064116963888/events/HiLFpkYIw4nqzK2cpudo`. The one-off October
  11 record is expired at audit, but the extraction defect remains actionable.
  Retain only the qualifying offer with its own price/schedule identity.
- Boston Pizza row 181 (`1711681630965477`) correctly retains all three public
  activities and the associated drink offer. The offer is inside the **20:00
  October 20 trivia block**, but absent item clock led to 11:00–21:00 fallback.
  Path: `venues/slug_bostonpizzacharlottetown/events/UGPSmkwEFYiZzQc7eLX2`.
  Bind serving context to its activity; the poster does not explicitly print
  the offer's end time. Do not advertise all-day availability without evidence.
- A&W row 136 (`1922797609125258`) is ordinary limited-time burger availability,
  not a daily/date-specific feature or stated discount/bonus. Stage 1 passed it
  merely because it says for a limited time; later stages wrote a Food Special
  at `venues/fb_100041851131270/events/XbLA2IHZ9j2P90c6zaeU`. Its October 11
  occurrence is expired. Align the short-term inventory guard with existing
  policy without excluding genuinely advertised unpriced daily specials.

### 7. One Stage 2 false rejection, with live coverage — row 214

Source `1566546105506911` advertises public recreation-centre access on October
12, 12:00–17:00. Stage 1 correctly accepted the image. Stage 2 none and high
negative review both returned confidence zero and rejected it as hours. The
same qualifying announcement on row 212 was correctly accepted and written,
so this is a reproducible inconsistent decision, not a missing live activity.
Reinforce recreational public access versus ordinary business-hours policy.

## Healthy controls and remaining holds

- Bell Aliant: all three pool/lane/waterslide sessions, correct 10:00–20:00 and
  Sports; caption-only item context preserved within an image post.
- Tipsy: Sunday 16:30–18:30 buffet preserved despite Monday closure.
- Seaside: dated public clinic retained, ordinary apple stock excluded.
- Souris: both printed craft-sale dates/times preserved; vendor registration
  did not replace activity times. Rocky Horror source-linked showtime and
  ticket URL survived; the untimed senior movie series remained held.
- Milton: all 21 candidate activities preserved, 18 timed outputs, three
  untimed future calendar items held. Election nomination deadline excluded.
  Existing Elvis end chronology was repaired by the normal merge.
- Downtown: 19 extracted items, 9 creates, 9 updates, one unresolved Black
  Culture Society venue hold. Existing Rat Tales/Karaoke weekly parents kept
  their recurrence, so an older stored start date is not an omitted occurrence.
- All eight exact October 11 approved repair targets retain their approved
  fields, including the held city-level food drive and the added U9 slot.
- Undated retreat/sauna offers were not assigned their booking-deadline date.
  Genuine corn-maze, studio and lounge activities remain in scope; absent
  clock evidence is the reason for their holds, not content rejection.
- Unknown-venue handling remains with the location-queue workflow. No venue
  resolution was performed during this audit.

## Live write, media and duplicate verification

All 62 create paths and 22 update paths were matched to logs, Firestore and the
event detail API: **84 distinct targets, zero missing documents, zero detail
API errors**. The upcoming feed was paginated through 10 pages / 986 events.
Fourteen touched one-offs dated October 11 are legitimately absent from the
upcoming feed; the remaining targets have upcoming feed occurrences.

No new exact same-venue/title/date/time duplicate involving a touched record
was found. This does not certify broad semantic deduplication; that work remains
deferred. Row 85's possible over-merge is explicitly flagged above.

All 64 distinct managed event-media URLs on touched records returned HTTP 200.
The previously known Olde Dublin venue profile URL still returns **404**. Three
writer checks dropped that missing icon reference rather than reintroducing it
into event writes. This audit does not claim the venue profile itself is fixed
or that all historical managed images are healthy.

## Next sequence

1. Keep the current 100% Luna Stage 1/2/3/5 rollout, Nano low compact Stage 4,
   accepted cache layouts and existing source holds.
2. Reproduce and repair deterministic category and ambiguous-clock failures,
   plus meal/trivia offer time constraints. Test healthy food, class and public
   activity controls; do not add guessed clocks.
3. Test the film-card date verification and offer price binding against the
   exact original galleries. Re-test the recreational access false negative.
4. Add a narrow existing-keeper correction safeguard with recurrence controls.
5. Prepare exact live repair targets, source-confirmed replacement values,
   sibling checks and backups for approval under the event-integrity skill.
   Code deployment does not repair current documents. No live mutation has
   been performed by this audit.

## Evidence

Local raw evidence is under
`functions/artifacts/luna-oct12-production-audit/`: completion, function readback,
paginated logs, attributed logs, snapshots, ledger, reviewed cases, original
images/contact sheets, per-stage usage and API timing, Stage 4/5 diagnostics,
source preservation, resume/checkpoint sequence, 84-path API verification,
upcoming feed, managed-media health, prior repair controls and zero-API cause
diagnostics. Raw production data and credentials are not committed.
