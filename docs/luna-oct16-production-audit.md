# October 16 regular full-parse audit

## Decision

**Run completed; quality review requires follow-up.** Do not call this a clean
parse or attribute its results to the later Beaconsfield/Ireland release.
The highest priority is isolating each activity's recurrence and preserving
source-supported clocks. Follow with the exact category/price corrections,
bounded formatting/festival evidence repairs, and venue-queue review. The
family-friendly investigation has a saved cohort and remains a separate task.

This audit made **zero live writes, replays, deployments, new model generation
calls or map interactions**. The scheduled festival worker's own activity is
reported separately below. Five read-only Responses retrievals recovered four
existing outputs; the failed Anchor capture output returned404. No API key was
created, printed or saved.

## Completion and serving chronology

- Dataset `1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw`, regular `APIFY Dataset.xlsx`;
  run `330c717b-7612-427a-bd71-a7ec776e5cce`;385 input rows.
- Lock start12:40:24.424UTC; processed marker14:06:53.049UTC; terminal lock
 14:06:53.219UTC: **86m28.625s** to marker.
- Completed lock, matching marker, final completed batch385/385, and absence
  of both direct and queried matching checkpoints independently agree.
  There were no active locks at readback.
- All13,004 captured parser log entries identify
  `processdatasetresume-00457-vaz`, serving hash
  `ccae940c2d876badd058c446071d54a5cf0cb12d` (festival-refresh release `bbea8ac`).
- Current post-run parser release `8e366b3` is independently ACTIVE/100% latest
  on all three functions, common hash `35bb203d979f3aaa914acb6abac2d9bd85b72712`:
  `processdataset-00494-cij`, `processdatasetresume-00458-hic`,
  `processdatasetselectedrows-00450-ruz`. This run **predates that release**.
- Separate festival worker remains ACTIVE/100% latest at
  `scheduledfestivallinker-00004-wul`, hash
  `f84328f133a8410265e2011bde5cbb35c4a474f0`, mode `publish`.

Local private evidence: `functions/artifacts/luna-oct16-production-audit/`.
`completion.json`, original XLSX/metadata,156 snapshots,58 update audits,
run-window logs, current inventories, function and Cloud Run traffic readbacks
are retained. The source dataset was created12:40:13.941UTC,469,867 bytes.

## Row, write and recovery reconciliation

| Terminal result | Rows |
|---|---:|
| Processed |53|
| Skipped after model/source decisions |102|
| Invalid before model parsing |229|
| Hard error |1|
| Total |385|

The229 invalid rows reconcile to216 scraper no-items/unavailable entries,
11 matched venues outside allowed coordinates, and2 textless rows. The latter
are an unavailable Sport PEI attachment and a Milton profile-picture attachment,
not overlooked legible event posters. No model snapshots, event writes or new
local unknown-venue samples were produced for the11 excluded rows. This
exercises regional exclusion, including Cornwall **Ontario**, rather than
mistaking its library for Cornwall PEI. It does not establish a universal
per-occurrence coverage guarantee for mixed local/remote sources.

One hundred reported creates (83 events/17 specials) and58 audited updates
(54 events/4 specials) affect155 distinct parents. These are semantic counters,
not the total number of Firestore operations. All155 remain readable:155 detail responses200;
complete active feed1,039 entries/11 pages; all144 distinct managed target
images checked by HEAD returned200. Feed counts are time-dependent and are
not comparable to an earlier repair's count without matching its timestamp.

The three operations beyond155 distinct targets are explained: Brackley
Taste the Orchard and Belly Dance Fridays were created then enriched from
another source; City Cinema `ViG0wijW2HqYwhWYdATH` was updated at rows57/240.
No row replay occurred:385 distinct row starts,385 terminal results,13 worker
executions,397 saved checkpoints with no decreasing cursor. Two busy-worker
probes did not start duplicate row processing; no event write followed terminal
completion. This does not establish that every semantic merge was correct
(see Montague and Belly Dance below).

The181 final formatted items reconcile to158 reported create/audited-update
outcomes,16 unknown-venue operations,3 duplicate/conflict-only outcomes,
1 area review and3 explicit out-of-coverage occurrence
holds. The last three are Lady Smith Manor's Dorchester NB market/programme;
none reached local publication or unknown-venue review. Earlier stages retain
244 Stage3 items,237 Stage4 items,4 Stage3 held items and11 Stage5/6 held items;
those counts are not one-to-one with final parents because recurrence collapse,
bounded formatting batches and missing-time gates also act between them.
Ancillary writes include a last-seen touch and an internal Montague recurrence
count update. The latter is not a separate audited semantic update: it occurs
while incorrectly merging the second rally (see group1). Do not mistake these
additional metadata writes for row replays or silently equate counters to all
database writes.

Sixteen unknown-venue queue operations reconcile to8 new/8 updates; repeated
operations and bounded samples explain why operation count is not unique
queue count. The fresh inventory retains14 current-dataset samples in11 queue
documents. One new area review is the correctly held Stratford multi-stop
food drive. No queue item is authorization to invent a venue or map point.

## Actual models, cache accounting and latency

Actual timed calls and saved usage agree with the intended allocation; legacy
Mini/5.2 configuration strings alone are not counted as executions.
Stage1 selected156/156 eligible posts (145 image/11 text), Luna high.
Stage2 selected88/88 (85 image/3 text), Luna none, with10 logged negative
high-effort reviews. Stage3 selected86/86 (83 image/3 text), Luna high.
Stage4 used Nano low with `compact_v1`; recovered actual response metadata
also confirms low effort. Stage5 selected81/81 formatting posts, Luna none;
all97 actual Stage5 calls were Luna, **zero Nano or legacy fallback**.
The three current runtimes preserve pilot100/global Stage5 Luna/none and
compact contracts. No explicit price override is configured.

| Stage | Actual calls | Input tokens | Output tokens | Cached reads | Cache writes | Est.USD | Sum API minutes |
|---|---:|---:|---:|---:|---:|---:|---:|
|1|161|1,388,938|106,257|518,638|13,474|0.145682|21.01|
|2|103|708,184|18,427|127,611|5,156|0.068676|6.38|
|3|96|913,384|133,072|0|913,096|0.180702|23.08|
|4|92|320,851|64,525|17,792|0|0.041052|9.83|
|5|97|261,644|76,209|167,390|3,524|0.049292|11.00|
|OCR diagnostic|1|3,112|359|0|3,109|0.000568|0.09|

Total550 calls, **US$0.485972 estimated model cost**; API duration sum71.39min.
Stage3 accounts for37.2% of estimated model cost and Stage1 for30.0%.
The elapsed full-run time also includes uploads, enrichment, resume scheduling
and writes; summing overlapping stage timers would double count work.

All550 calls explicitly report cache-write coverage:550 known/0 unknown.
Ordinary input is input minus cached reads minus cache writes; charge those
three classes separately, then output. Standard repository estimate rates
per million: Luna0.10/0.01/0.125/0.50; Nano0.05/0.005/0.05/0.40.
These are model estimates, not invoice reconciliation or total cloud cost.
Stage3's zero cached reads is an observed outcome, not a reason to re-enable
the previously held slower caching experiment.

Four compact Stage4 first attempts failed their contract (rows124/206/243/324)
and recovered after bounded retry. Stage5 recovered malformed outputs at
rows234/301 and split/recovered the six-item row217 batch. Row56 alone failed
after its bounded retry. No truncation/token-cap diagnosis is supported for
that failure: both Responses statuses were completed with ample output budgets.

## Source-review coverage and healthy controls

All156 model-source captions/decisions were reviewed, including all68 Stage1
rejections and the long mixed Downtown schedule. Available ordered gallery
coverage:252/265 image references,29 contact sheets. Thirteen originals on
rows98/99/101/102/314 failed DNS resolution twice. Their unavailable images
are explicit audit limitations; captions/decisions/managed published media do
not prove every missing original's text. No higher-resolution substitution,
gallery omission or paid rescrape was used to force a pass.

Ordinary inventory, appointments, private bookings, past recaps and online
prize draws remained rejected. The dated Seaside public walk-in clinic retained
09:00–18:00. Bell Aliant retained all13 source activities, separate lane/leisure
sessions and waterslide, with swim access classified as Sports. Brackley's two
source posts enriched one Taste the Orchard parent; its separate karaoke
remained distinct. Beaconsfield Carriage House book launch bound the existing
Beaconsfield venue. Existing Matt Minglewood20:00 starts and Harbourfront live
show categories resisted worse incoming18:30/Cinema outputs. This is useful
merge containment, not proof the bad upstream outputs are harmless forever.

APM's only new source is administrative team formation, correctly rejected;
the older16 evaluation sessions and Connolly Park were not exercised by today's
cohort. No new evidence authorizes changing Connolly's held Souris identity.
Untimed activities, missing-source constraints and uncertain locations remain
holds. No broad date-only switch, online-course recovery or festival inference
from venue/date alone is proposed.

## Finite follow-up inventory: eight issue groups

### 1. Montague recurrence contamination — highest priority

Row324/source `1749217910542284` explicitly gives two membership rallies
(Oct17 13–15; Oct25 15–17), three try-curling sessions (Oct28/29/30 18–20),
a six-Thursday Learn to Curl course starting Nov12, and weekly Thursday poker.
`eventExtractor.ts` falls back from each item's description to `combinedText`,
assigning poker's Thursday recurrence to all these activities. Stage4's first
actual Nano response tries to remove that recurrence from the rallies and
drop-ins. `compactStage4.ts:supportedRecurrence` rejects the explained removal
because its narrow holiday/annual exception does not cover ordinary one-offs;
the retry returns no changes. Later recurring collapse/dedup loses the second
rally and turns the three printed consecutive dates into weekly Thursdays.

Persisted affected parents:

- `venues/1ehK5wrBKC460QSpqUMq/events/v08itQxkWgTVRQ3Uvm4z`
- `venues/1ehK5wrBKC460QSpqUMq/events/dVOV8QMohPKYBp2OGp02`
- `venues/1ehK5wrBKC460QSpqUMq/events/yjd37dklHpKmS4uIcL1C`

The course also has08:06 attributed to a website URL, with no matching clock
in the supplied source. Website retrieval did not independently validate that
clock. Preserve the course's six-week scope, but hold its hour until verified.

Fix item-scoped recurrence evidence/provenance before collapse; permit proven
removal of an automatically borrowed recurrence without allowing a model to
erase a source-supported weekly programme. Regression controls must preserve
both rallies' different hours, all three consecutive sessions, six course
Thursdays and unchanged poker. Prepare exact repair/materialization inventory
and backup before requesting one live batch approval.

### 2. Unsupported or lost source clocks

- Be You `venues/name_n2ivcu/events/s6fa06YUzIT8i8hfL0kK`, row172/source
  `122205865490910683`: “Tonight:6–12”, upstream18:00–00:00; final clock became
 20:00 while retaining next-day endDate, yielding a26-hour stored window.
  Preserve supported midnight and recompute date/clock pairs atomically when
  applying any fallback; do not silently replace an explicit end with two hours.
- City Cinema `venues/slug_citycinemachtown/events/rf7Ftmb7ExLB1YsviCPC`,
  row241/source `1649327733870808`: “TONIGHT (THURSDAY)” became the post's09:38
  timestamp. A timed performance requires its actual show clock or a hold.
- Inn `venues/fb_100063617721610/events/zHLjrYAlkafP2wpFbvqq`, row249/source
  `1727757279354846`: a new Oct15 parent was created at post time12:30 despite
  the approved Harvest evening programme. The other11 retained evenings remain
 17:00–21:30. This is a recreated past-date bad parent, not proof the retained
  future keepers were overwritten. Reconcile retired/expired source policy and
  the approved programme before choosing the exact delta.

Scope the post-time restriction to timed activities; legitimate same-day
offers and their existing hours policy need independent healthy controls.
Show start remains the time row; doors belong in description. The protected
Matt Minglewood20:00 keepers demonstrate why incoming doors18:30 must not win.

### 3. Three confirmed price/category errors

- `venues/ZDUj9euh7NVJ6INSlHM8/events/Hsy0at1WEYoq2Nh4qKYg`: Ruby Oct16
  Meatloaf Sandwich says$18; original720×540 board clearly prints **$16**.
- `venues/slug_koolbreezefarms/events/cityrecovered_01bdb05e9cfe396610c2202e`:
  Nov14 Christmas Craft Fair was changed to Food Special by row165 enrichment.
  A craft market with treats/vendors remains an event, not a meal offer.
- `venues/slug_sobeyfamilytheatre/events/ZPFgcUjzYQ9BI7a5oe52`: Men of the
  Deeps Nov7 chorus concert became Cinema; source supports Live Music.

Use source-grounded type/category validation and protect meaningful approved
metadata during enrichment. A price-reading error needs the original board and
focused evaluation, not a broad rule that guesses handwritten digits. These
three records are a concrete future repair batch; no live changes were made.

### 4. Belly Dance probable duplicate and duration loss

Same studio/Oct16/19:00:
`venues/0F6W6IBgJqlKQ8AmaTGC/events/IkBW9YLN1X0VeJ9JdF2A`
(aggregator “for Beginners”) and
`venues/0F6W6IBgJqlKQ8AmaTGC/events/QqkS6gWBGaW3soS96iqm`
(first-party “Fridays”). Rows330/331 correctly merge with each other but do
not merge the aggregator title. The complete first-party poster says55 minutes,
Fridays, Alika, all levels; the stored default end is21:00 and recurrence is off.
Verify the older source/room/instructor before authorizing a deletion; differing
class titles alone are insufficient. Then preserve explicit19:55 duration and
only the recurrence/horizon supported by the source. Do not add a global fuzzy
alias or merge genuine simultaneous classes.

### 5. Harvest Fest malformed Stage5 output, contained loss

Row56/source `1565816972252501` failed Stage5 twice. Read-only retrieval proves
both completed responses contain extra closing syntax and a second JSON
object with extraneous text. Strict rejection was correct. Do not increase
token limits, select one object arbitrarily or bypass source identity/count.
Evaluate schema-constrained single-envelope output with bounded failure controls.

The correct existing Harvest Fest parent
`venues/slug_foundersfoodhall/events/01q4d8wzK8R8VH0revQX` remains Oct17 15–20,
with the poster's programme in its description and family score100. It is not
missing entirely. Stage3 deliberately returned one parent; independently timed
programme children were not extracted. A one-venue programme requires a
separate reviewed parent/child design; do not falsely turn it into an area event
or create children as part of a JSON repair.

### 6. Anchor programme capture failure; existing links preserved

New-run job
`festival_link_jobs/88c65c91dc325a0eb0159f12d12c72ce5730109587d2994301c60871b70e139d`
is held for Anchor source `1565799665587565`: `caption_transcription_changed`.
The model was asked to reproduce a long caption exactly. Its failed raw
response is no longer retrievable (404); the precise character difference is
therefore unverified. The saved error and matching paid request are verified.

Three bounded source captures generated five paid calls:8,854 input/11,432
output tokens,8,839 write tokens,0 reads,88.134s summed API latency, estimated
US$0.006822 separately from the parser. Later polls report `already_held`;
there is no repeated paid-error loop. The worker made **zero public writes**
for today's dataset. Two other captures have incomplete normalized occurrence
identity; do not promise a link count merely by fixing caption echo.

Anchor retains17 existing manual links. Pumpkin retains13 machine links at two
reviewed venues and reports no public delta; today's cohort contains no new
eligible Pumpkin programme, so it is not a fresh13-link creation test.

Proposed prevention: carry the original caption as authoritative input instead
of making a model echo it; validate every quoted excerpt/row against that
original, then independently verify membership and exact canonical occurrence.
Version/fence new captures; preserve old errors and manual ownership. Do not
relax edition, year, venue, clock or unavailable-gallery holds to obtain green
counts. Validate with this long caption, relative “tonight” sources, missing
child later arrival, repeat/order and manual-preservation controls before release.

### 7. Venue/area queue hardening observations

- Two further legacy single-venue city roots are exposed by today's sources:
  `events/location_6113f49ab46fd8e8731a06c8`, Two Pianos at Souris Show Hall
  Oct24. It already has the exact Souris venue ID but still says city scope and
  exposes private review wording in its description. Row168's original poster
  supports19:30 at the hall; its missing finish conflicts with the approved
  root's21:30, so the source guard correctly holds enrichment and creates no
  copy. Apply the same source-grounded venue-scope/public-description approach
  used for Beaconsfield, with exact review/clock readback first. This root was
  outside that earlier37-document approval and has **not** been repaired.
  `events/location_e6d499b424052528b5ddfb05`, Mayoral Candidates Mix & Mingle,
  also retains city scope/private review wording despite the explicit Fox & Crow
  venue and Oct19 19–21 source. Row222/source `1755457876587781` only enriched
  provenance on that protected root; it did not create another copy or repair
  its legacy scope. Both roots need separately reviewed exact deltas.
- Summerside Library ADL Room was queued rather than resolving its parent.
  Verify exact existing library/address identity before generalizing the already
  accepted room normalization; no bare-room or fuzzy-parent rule.
- Witches on Water Street from rows106/167 entered an unknown point-venue queue.
  It is a multi-business street activity; review area routing rather than
  geocoding a road as a venue or inventing individual stops.
- Three Oaks generated separate queue keys with city hints Summerside and
  **Canada**. Country is not city evidence. Fix hint granularity and exact queue
  identity after checking the real school; no automatic venue creation.
- Linkletter, the Tignish arena and Hyde Park Trail remain legitimate unknown
  identity holds unless exact existing source/address proof is established.
  Cornwall's school parking reference must not relocate the trail to the school.

These are review candidates, not a broad queue-cleanup authorization. Preserve
the source-supported public activities and distinguish identity holds from
out-of-scope content.

### 8. Al Tuck expiry rejection needs date verification

Row220/source `1559528609526804` advertises Al Tuck at Trailside Oct28. Stage1
treated `25` in `al-tuck-october-28th-25-doors-630-pm` as year2025 and rejected it.
That interpretation is unsupported by a year-labelled source; neighbouring
ticket slugs also contain prices. No Al Tuck record exists in the inventory.
The current event year/ticket page could not be independently verified, so this
is a likely rejection weakness with recovery **held**, not a confirmed2026
publication candidate. Require explicit year/date evidence, never infer a past
year solely from an unlabelled two-digit URL segment.

## Family-friendly audit handoff

Among155 touched parents,153 are `unlikely`, one `high`, one missing a level.
This is a distribution, not an accuracy estimate. Keep the original cohort and
labelled controls for a separate source-to-badge audit:

- Farm-animal visit `venues/4OcLMCRKRGoKO5eQncLi/events/vienqEqn0AgXiVcebm4G`:
  explicit family rates/activity, score15/insufficient-family-evidence.
- Symphony `venues/slug_sobeyfamilytheatre/events/ARClj8Qo5mCWzpZCI4GF`:
  score0 with `alcohol_focused`, despite that individual schedule line containing
  no alcohol evidence. Trace mixed-post contamination before deciding suitability.
- Kensington Skeleton Selfie Hunt remains the user's reported likely omission.
- Harvest's all-ages family score100 and Be You's19+ score0 are healthy controls.

Do not infer child suitability from “Family” in a theatre name, from absence of
19+, or from a festival-wide label. Trace extraction, scoring, enrichment,
persistence, API projection and badge thresholds before changing policy.

## Next action

Work through the eight groups in order, combining related clock/recurrence
implementation and original-source regression evidence first. Present one short
reviewed batch containing exact release targets and live-record deltas, with
remaining unverified cases explicitly held. No broad cleanup, new source
subscription, model-allocation experiment or family backfill is part of this
audit. Existing accepted frontend, festival ownership and post-run venue
repairs remain the baseline.
