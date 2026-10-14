# October 14 regular production parse audit

## Conclusion and recommended next work

The full run completed normally. Keep the current Luna allocation; repair the specific source-date and downstream classification/recovery failures before further optimization. This is not a clean quality pass. No production records, code, traffic or model configuration were changed during this audit.

Priority order:

1. Protect printed schedule dates and ambiguous clocks, reproduce APM row 268, and prepare an exact guarded live repair for its six unsupported future occurrences.
2. Repair the food-category heuristics that override genuine activities, with Harmony House and PEERS controls plus genuine advertised specials. Recover four missing Harmony House performances after checking current siblings, venue and source times. Correct the PEERS category separately from its unresolved caption/poster date disagreement.
3. Improve Stage 5 failure visibility and bounded recovery, preserving whole-post source identity and preventing partial publication. Investigate API prompt rejections separately from malformed JSON; do not silently count these as successful processing or bypass an API rejection.
4. Review the narrow cinema source-conflict/duplicate cases and explicit closing-time overrides below. Broad deduplication remains separate deferred work.

## Full-run baseline

- Dataset: `11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC`.
- Run: `dc33e41e-d6f6-45f0-a82d-c26fbb3c3e40`.
- Started October 14 at 12:39:55.350 UTC; processed marker at 14:12:53.398 UTC, **11:12 a.m. Halifax**. Elapsed **92m58s**.
- Completed lock, processed marker, final batch `_1` completed at **370/370**, and no checkpoint independently confirmed. Final batch start is the final resume time, not the whole-run start.
- Final counters: 43 processed, 108 skipped, 219 invalid; 85 creates, 32 update operations, 2 duplicates, 151 snapshots. `errorCount=0` is only a row-level counter and **does not mean no stage/API failures**.
- 117 write operations touch 114 distinct paths. All current documents exist and all 117 detail lookups returned HTTP 200. Fully paginated upcoming feed: 11 pages, 1,047 results. Expired occurrences absent from that feed are not automatically missing writes.
- Unknown-venue counter is 35 operations, not distinct venues. Logs identify 29 full-five-stage queue writes to 11 distinct queue IDs. Location queue resolution stays with its specialized task.

## Serving configuration and runtime

Fresh readback: all three functions ACTIVE, 100% latest revision traffic, common hash `9c8f58ea905d9f85501c2d3f6676a7ab890777fa`:

| Function | Revision |
|---|---|
| processDataset | processdataset-00475-zec |
| processDatasetResume | processdatasetresume-00439-quv |
| processDatasetSelectedRows | processdatasetselectedrows-00431-cib |

Actual accounted calls: **430 Luna and 93 Nano**, zero Mini/GPT-5.2 calls. Stages 1/2/3/5 use Luna; Stage 4 uses Nano low compact_v1. Stage 5 has zero reasoning tokens. Legacy fallback disabled; selected-source allocation remains 100%.

Stage 1: 151/151 eligible evaluations, 142 image and 9 caption-only. Stage 3: 85/85 eligible posts, 78 image and 7 caption-only. Actual model calls include retries/reviews and auxiliary reads; they must not be equated to unique selected posts.

All 370 row starts are unique. 383 checkpoint saves never regress. Fourteen productive workers hand off sequentially. One busy probe overlaps the final worker but starts zero rows and queues a delayed probe; it is not an overlapping parse. No repeat of October 6's serial venue/write stall: item venue lookup maximum 1.150 seconds, dedupe maximum 0.156 seconds.

## Source review and quality findings

151 saved source evaluations and their captions/stage inventories were reviewed. All 65 Stage 1 rejections were checked against available evidence; no confirmed wrongful rejection was identified. Original gallery retrieval recovered 249/259 images. Ten originals remain unavailable, including two rejected sources (rows 57/59); those captions were reviewed but a full visual rejection pass cannot be claimed. Image review used 16 labeled contact sheets, recovered originals and full-resolution inspection of suspicious schedules. Saved source text/model descriptions are not a substitute for unavailable pixels.

Stage inventory: 255 extracted items, 236 after Stage 4, 148 surviving final formatting/time checks. These counts alone do not measure accuracy: some losses are valid missing-time, unavailable-source, logistics or out-of-region holds.

### APM conditioning schedule: six wrong future dates published

Row **268**, source **1744646754332812**, is a 500x261 shared-image thumbnail. Its embedded original image URL was retrieved read-only at 1200x630 and inspected. Visible dates/times:

| Division | Printed date/clock | Published date/clock |
|---|---|---|
| U9 | Oct 10, 9:20 | Oct 16, 09:20 |
| U9 | Oct 12, 9:00 | Oct 23, 09:00 |
| U11 | Oct 11, 11:40 | Oct 17, 11:40 |
| U11 | Oct 14, 4:00 | Oct 24, 04:00 |
| U13 | Oct 10, 5:30 | Oct 16, 05:40 |
| U13 | Oct 12, 5:10 | Oct 23, 05:10 |

The Stage 3 API response preview already contains the wrong future date. This is not a resume or Stage 5 date shift. Stages 4/5 preserve the incorrect extracted identity. The source does not specify AM/PM, so replacing 04:00 with 16:00 by guess is not a validated repair.

Affected live IDs under `venues/ItWg0uH2yXtETbhlepAJ/events/`:
`Bc249Rqr374nSPC5ndZs`, `leUhUmHcEuM48hg8PUhf`, `v1dfWxtnoLnvI0Ruhhcs`, `5FTkut3T5d5KCclsuQtL`, `O7vemBuoK4VtmSaDOj5i`, `qsbHiAurDCbdCPAeRzIj`.

Prepare backups/guards and an exact approval plan before live changes. Larger original is local `functions/artifacts/luna-oct14-production-audit/images/268-linked-original.jpg`; it still cuts off later divisions, which must not be invented.

### Deterministic food override loses valid activities

- **Harmony House row 274**, source **1738309221631333**: Stage 2 correctly calls the post a four-show schedule, explicitly stating the pub menu is not a special. Stage 3 extracts Nov 4/11/18/25 at 19:00; Stage 4 retains all four; Stage 5's model provides Live Music. The local `validateEventTypeFlags` food heuristic forces Food Special, after which no formatted items survive. No current Jazz-ish records were found. The model did not reject these performances.
- **PEERS row 325**, source **1535288085304229**: Stage 2 correctly identifies a peer-support event with incidental pizza. The category safeguard forces Food Special and publishes `venues/KeaYNQ0m7AfE583KyS5R/events/KONZP3s2tJNWCQRKvrB9`. Caption says Oct 21 while model-read poster says Oct 20; original poster currently unavailable. Category is confirmed wrong; date needs source resolution, not blind correction.
- Local compiled-function reproduction with genuine event categories independently recreates both Food Special conversions without paid API calls.
- A sparse Sobey listing for Lorena McKennitt's anniversary tour is also written as Cinema: `venues/slug_sobeyfamilytheatre/events/LLfTk1jgPz6tavQqfqlO`. Review the venue prior against actual performance evidence; do not assume every theatre listing is cinema.

### Stage 5 failures and omissions

Three rows receive HTTP 400 `invalid_prompt` API rejections: **168** pumpkin-festival program, **262** Barktoberfest, **326** Red Ribbon artwork activity. These are API rejections, not evidence that the activities are out of scope. Capture their exact failure status and keep a reviewable recovery path. Barktoberfest already has several root/venue records from other workflows; do not create another blindly.

Row 168 has 21 extracted/validated items. Two nine-item formatting batches complete successfully, then the final three-item request is rejected. The whole post returns zero formatted items; no partial write occurs. This protects against silent partial publication but loses the post's otherwise successful work. Its calendar inventory audit separately hits **8,000 output tokens**, status incomplete, on one frame. Raw names/dates include uncertainty, so the 21 items are not automatically 21 verified missing listings.

Row **219**, Raine Maida/Chantal Kreviazuk, has one completed Stage 5 response with malformed JSON. The one-item count mismatch has no smaller-batch retry. No new write; correct existing `venues/slug_sobeyfamilytheatre/events/h9MBeKYxZW3TXANEfSYO` already covers Nov 4 at 20:00. Treat as a failed extraction attempt, not a missing live concert.

All 93 Stage 4 responses complete, with no JSON failures. Stage 5 has 79 completed diagnostic responses, no incomplete responses and one parse error; the three rejected requests have no completed-response usage diagnostics. Zero output reasoning does not prevent API/schema failures.

### Source conflicts, holds and dedup observations

- Tivoli row 130 correctly retains all ten visible screenings and their printed times, including Jim Queen Oct 15 at 21:30. Downtown row 135 explicitly advertises Jim Queen at 21:00 and creates `kcj1QvFVL5I78GNtZSF6`, alongside the 21:30 record `NJzspju9NlqTrmGPEumW`. This is a contradictory cross-source duplicate, not a transcription error in row 135. Prefer an authoritative occurrence check/hold; do not automatically merge different genuine screening times.
- Downtown also creates a second same-time City Cinema Back In Black listing (`bi8tjyu0PjfessyR0eGi`), alongside existing same-time `9hRzOvheJh5llYmNNDdt` and the known 19:30 conflict. A Long Winter remains an existing source-conflict topic. Preserve evidence and use an exact source-grounded cleanup plan.
- Downtown's 23:00/02:00 tour clocks are printed in its caption, and routed to an unknown-venue queue, not published. Distinguish source errors from model invention. Box-office tour meeting places need individual venue review.
- Baba's named Nadine performance remains on a preexisting weekly Island Jazz parent. The caption says the series is every Thursday but only dates this performer once. This recurring-personalization issue is continuing, not a new resume replay.
- Albert & Crown row 133 explicitly closes at 19:00, while three dated food specials end 21:00. Tipsy rows 185/187 explicitly close 20:00, while several soup/pizza special records end 21:00. These need a source-hours precedence check, not a claim that every inferred end is a new Luna hallucination.
- Four Island Hill tour/admission dates hold for missing clocks; Sunday has 10:00–16:00 from enrichment and is written. Blank Canvas/Havenwood public bookable activities pass Stage 1 but lack complete dated scheduling; do not label them out of scope. Live online events remain in a venue hold rather than being forced onto a physical map pin.

## Prior repair and location-role controls

All six October 13 deleted IDs remain absent. Surviving upcoming repair fields match their approved patches: walking recurrence, Trailside date-specific show/ticket records, L'Autre, In the Heart of the South and Milton recurrence limits. Four repaired Oct 13 records are now absent after their dates expired; their absence alone is not evidence of an omission or repair regression. New October 14 one-hour Zumba exists, old overlapping parent remains ended October 7, and Oct 21/28 two-hour parent remains intact.

Jingle & Mingle remains one canonical root event, `events/location_8b000022923eb52b50d35935`, Red Shores venue `fb_100052606604879`, Dec 5 at 20:00. Neither original Red Shores/Eastlink source appears in this dataset and no approved-occurrence linking log occurs. Therefore serving code is verified, existing keeper preservation is verified, but the new role/linking path is **not exercised by this full run**.

Venue profile scan: 559 venues, 246 available, 15 preexisting missing, 297 blank, one unverified. No healthy-to-missing/blank regressions. Olde Dublin's restored profile image returns 200. Additional missing-image repair plans remain separate and unapproved.

## Cost and latency

Estimated standard USD model token cost, using current local accounting defaults and API-reported input/cache/output usage. Not invoice reconciliation; excludes scraping, Cloud Run, Places, storage and unavailable usage on rejected requests.

| Stage | Calls | USD | Summed API time | Mean call | Max call |
|---|---:|---:|---:|---:|---:|
| 1 | 155 | 0.141283 | 21.68 min | 8.39 s | 30.22 s |
| 2 | 97 | 0.062685 | 6.05 min | 3.74 s | 12.77 s |
| 3 | 96 | 0.182429 | 26.91 min | 16.82 s | 87.08 s |
| 4 | 93 | 0.040117 | 12.49 min | 8.06 s | 31.02 s |
| 5 | 79 | 0.044782 | 10.84 min | 8.23 s | 27.73 s |
| OCR debug | 3 | 0.002318 | 0.34 min | 6.87 s | 10.53 s |
| **Total** | **523** | **0.473615** | **78.32 min** | | |

All 523 recorded usage calls have explicit cache-write coverage. Stage 3 includes 89 extraction calls, three umbrella date maps and four inventory audits. API summed time includes concurrent batch work and is not wall-clock attribution.

Yesterday: 118 Stage 1 evaluations, 46 Stage 3 eligible posts, 328 calls, USD 0.278791, wall time 54m47s. Today: 151 evaluations, 85 Stage 3 eligible posts, 523 calls, USD 0.473615, wall time 92m58s. Increased workload is a major evidenced contributor; average Stage 3/4/5 calls are also modestly slower. No 90–195 second venue lookups or 324-second formatting call returned. Longest row is 168 at 301.678 seconds, including 240.718 seconds in Stage 3 extraction/audits and 23.951 seconds Stage 5 formatting before rejection.

## Evidence and authorization

Local evidence: `functions/artifacts/luna-oct14-production-audit/` (completion, serving readback, 12,145 logs, 151 snapshots, source ledger, original galleries, all current events, update audits, write/API verification, model/cost/timing summaries, category reproductions and prior/profile controls). Helpers in `functions/artifacts/luna-oct14-status/`.

Audit is read-only against production. No deployment or live cleanup has been performed. Existing approvals for yesterday's exact plans do not authorize today's newly identified record changes.
