# Stage 2 Luna pilot readiness — October 9, 2026

## Recommendation and boundary

Recommend a **50% Stage 2 pilot after reviewing tomorrow's regular run with Stage 1 and Stage 3 at 100% Luna**. The Stage 2 comparison found no demonstrated loss of a source-backed event caused by changing this classifier. This is sufficient evidence for a monitored pilot, not proof of perfect classification or extraction.

Production was not deployed or reconfigured during this work. The Stage 2 allocation is prepared locally and disabled by default. Stage 1/3, Nano Stages 4/5, source-image handling and the live writer retain tomorrow's accepted production baseline. No live event records were changed.

Two existing model variations were exposed and must be included in tomorrow's decision: Stage 1 inconsistently admitted a public pharmacy clinic, and Stage 3 inconsistently read one date on the sparse PowerSkating poster. Their evidence is below; neither should be hidden by the classifier's cost savings.

## Candidate

- Luna with reasoning `none` for initial classification. An initial negative result gets one Luna `high` review; an unsuccessful review retains the hold. No GPT-5 mini/5.2 fallback is introduced for selected posts.
- Public and bookable activities remain in scope, including clinics, classes, tours, registration invitations and recreation. Advertised daily/unpriced food specials qualify; ordinary month-long menus and retail restocks do not independently qualify.
- The contextual food guard avoids false food routing from addresses, special guests/gifts and unrelated prices. Existing structural calendar/schedule routing remains available.
- Valid JSON is parsed before repair. The comment scanner preserves URLs and comment-like characters inside strings.
- Selected Luna responses require completed status and a valid category, confidence, item count and analysis schema. Malformed, incomplete or unavailable responses receive confidence zero and a review/retry reason, rather than permissive heuristic acceptance.
- Image-call errors cannot silently retry the candidate as caption-only. Each Luna classification pass has a 45-second SDK timeout and at most one transport retry. There can be two reasoning passes per classification, and a gallery refresh can classify again; 45 seconds is not a hard total deadline for the whole post.

## Source coverage and preprocessing

The paired classifier cohort contains **119 cases per approach**:

- 98 frozen historical/source-reviewed cases from the prior evaluation, rerun with production preprocessing.
- Eight first-four-image versions of real galleries with five images, in addition to their full-gallery versions.
- Seven previously unused October 5–8 caption-only sources covering retrospective activities, closures, restock, volunteer invitations and transport notices.
- Six real captured Facebook Event captions and UTC metadata, covering a fair, festival, painting series, gala, book ball and farm day.

The ordinary structured Facebook Event adapter bypasses Stage 2. Its **46 existing adapter tests** pass. The six classifier cases exercise real metadata fallback inputs; original Facebook Event images were not available in this cohort and these cases do not certify their image ingestion.

The deployed OCR service processed 151 source-file references into 144 fresh uploaded images; seven references reused identical local bytes. All 144 returned images were downloaded as production WEBP, hashed, and all 144 newly created temporary objects were deleted successfully. Existing managed images were not deleted. Replays use these frozen production bytes and exclude upload latency. This testing did make temporary image-service uploads/deletions; it did not write Firestore events or change production configuration.

## Classifier results

**238 paired decisions, 254 actual API calls, no request errors, no incomplete responses and no heuristic error fallback.** The Luna candidate made 119 initial calls and 16 high reviews. Paired prompt hashes match.

| Metric | Current Mini | Luna with negative review |
| --- | ---: | ---: |
| Accepted / held | 110 / 9 | 111 / 8 |
| Actual calls | 119 | 135 |
| Observed token cost, USD | 0.282025 | 0.092576 |
| Cost with caching removed, USD | 0.325542 | 0.087628 |
| Summed classifier time | 636.630 s | 499.285 s |
| Median per-case time | 4.951 s | 3.114 s |
| 95th percentile per-case time | 9.074 s | 11.161 s |
| Maximum per-case time | 12.945 s | 18.849 s |
| Reasoning output tokens | 43,456 | 5,481 |

The cache-neutral comparison is **73.1% lower Stage 2 token cost** and **21.6% lower summed classifier time**. High reviews increase tail latency; not every post is faster. A representative 50/50 mixture would reduce Stage 2 cost about 36.5%, not the whole parser bill by that percentage. These production-preprocessed results replace the earlier original-color estimate of 80.5% savings as the more relevant planning estimate. This is an evaluation cohort, not a forecast of a complete day's bill.

Rates used, checked October 9: Luna $0.10 input / $0.01 cached input / $0.125 cache-write / $0.50 output per million tokens; Mini $0.25 input / $0.025 cached input / $2 output. Observed cost uses recorded cache reads/writes; the uncached calculation removes them. Official references: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [Mini](https://developers.openai.com/api/docs/models/gpt-5-mini).

Three accept/hold disagreements were inspected:

| Source | Mini | Luna | Follow-up |
| --- | --- | --- | --- |
| Row 58, downloadable kids' guide | Accept | Hold | No dated activity inventory; controlled full pipeline produced zero events with either classifier. |
| Row 82, New Brunswick travel article | Hold | Accept | Luna unnecessarily admits it to extraction; subsequent source/date checks produced zero events. |
| Row 320, first four Wintermoor photo-op images | Hold | Accept | Undated invitation; full-gallery pipeline produced zero events. |

These are not three confirmed missed events. They are also not perfect Stage 2 agreement. Downstream checks remain necessary.

Reapplying the latest JSON/schema/normalization rules to 98 earlier candidate responses and all 238 new paired responses changed **zero accept/hold or routing decisions** under the production routing environment.

## Full-pipeline and failure tests

**30 completed no-write five-stage replays**: nine paired independent cases, four paired cases sharing an actual Stage 1 result to isolate Stage 2, and two paired repeats also sharing Stage 1. Stage 1/3 calls use Luna high; Stage 2 uses the comparison arm; Stage 4/5 use Nano low/medium with the current bounded batches. Existing read-only venue-hours resolution was enabled after an initial ADC credential attempt stalled. That interrupted attempt is retained externally and excluded from clean latency comparisons.

Verified results:

- Harbourfront's five-image gallery: both approaches preserve ten dated occurrences. Stage 2 sees the same ordered four-image entry followed by all five. The October 19 Relive event uses `relevantImageIndex: 4`, proving the fifth poster is represented. Caption says 19:30 but the fifth poster prints 19:00; both arms use the poster's 19:00.
- Pottery tour: both preserve October 10 and 11, 10:00–17:00.
- Tipsy: both preserve Daniel's October 8 18:00–20:00 music and the wings special, including the repeat. Existing inferred times for the untimed wings special remain; they are not newly source-confirmed opening/closing times.
- Public pharmacy clinic: a controlled accepted Stage 1 result produces October 9, 09:00–16:00 with both Stage 2 models. In independent runs Stage 1 accepted it once and rejected it once as healthcare. This is an existing eligibility variation to watch, not evidence that Stage 2 discarded the clinic.
- Closure, golf teaser, Poppy volunteer notice, undated Wintermoor invitation, kids' guide and travel article produce no listings in the tested complete paths.
- PowerSkating initially produced exactly the 20 printed one-offs with candidate Stage 2, with 07:00–08:00 times, no November 7/8 and no weekly parent. The initial Mini-control arm already duplicated November 21 and omitted January 2 in its **Stage 3** snapshot. On repeat, Mini-control was exact while candidate Stage 3 substituted December 26 for January 2. Both repeat arms used identical Stage 3 extraction and inventory-audit prompt/image hashes. The error exists before Stage 4/5, and does not establish a Stage 2 routing regression. This remains a **real unresolved Stage 3 source-reading observation**; total item count alone cannot certify inventory.

Build and **96 focused automated checks passed**: 42 classifier/router checks, five gallery-flow checks, three allocation checks, 46 structured Facebook Event adapter checks. Failure coverage includes invalid/incomplete responses, failed high review, URL/comment preservation, one SDK transport retry, image failures without text fallback, hold-before-promotion, full-gallery config propagation, default-off allocation and stable resume selection.

The no-write runner stops before the live event writer; it does not certify persisted display provenance, live deduplication or API-feed updates. External enrichers were disabled. Existing duration/category/venue end-time inference remains and final times are not universally printed source facts. No map interaction occurred.

## Prepared allocation and activation sequence

Local allocator uses a separate Stage 2 hash of dataset ID and source post ID. It selects among posts that **pass Stage 1 and have usable text or the initial preprocessed gallery**, not among all scraped rows. The same identity survives resume/reordering, and the selected model/config is retained for full-gallery refresh. An explicit per-call Stage 2 override takes priority for audits. Missing source identity, missing images, invalid percentages and default configuration do not select Luna.

After tomorrow's regular Stage 1/3 audit:

1. Prove full completion using lock, processed marker, final batch and absence of checkpoint. Reconcile actual Stage 1/3 models, source inventory, writes, holds and cost. Review the clinic and sparse calendar observations explicitly.
2. If that baseline supports expansion, use the established parser deployment/release gates to release this candidate across all three parser functions with `LUNA_STAGE2_PILOT_ENABLED=true` and `LUNA_STAGE2_PILOT_SAMPLE_PERCENT=50`. Preserve every accepted source fix and all other stage/model settings.
3. Read back common source hash, ACTIVE state, traffic and configuration. Reconcile Stage 2 allocation logs/snapshots against actual Mini/Luna calls, including high reviews, failed calls and gallery refreshes. Fifty percent is a deterministic sample, not an exact count guarantee for a small cohort.
4. Audit the first complete pilot run for wrongful holds, routes, full source inventory, image order, final writes, retries, latency and actual stage cost. Do not expand further based only on cost or accept counts.
5. If Stage 2 causes a material regression, disable only its pilot switch while retaining Stage 1/3 at 100% Luna and all accepted parser repairs. Coordinate changes outside an active parse unless Craig directs otherwise.

This document prepares that decision; it does not authorize or claim an activation today.

## Fresh production readback and evidence

All three functions were verified ACTIVE with 100% traffic on the latest revision and common source hash `53c15f4a10bd3f5e04b1057023e23302803ba0bc`:

- `processDataset`: `processdataset-00461-xey`
- `processDatasetResume`: `processdatasetresume-00425-nav`
- `processDatasetSelectedRows`: `processdatasetselectedrows-00417-gaq`

Stage 1 and eligible image/text Stage 3 remain 100% Luna; Stage 2 remains Mini; Stage 4/5 remain Nano; legacy fallback is disabled. Static model defaults in the environment are not the actual selector outcome.

Inspectable evidence: [summary and full replay inventories](../artifacts/luna-stage2-oct9-readiness/summary.json), [paired classifier ledger](../artifacts/luna-stage2-oct9-readiness/classification-ledger.json), [preprocessing/cleanup](../artifacts/luna-stage2-oct9-readiness/preprocessing.json), [safe live readback](../artifacts/luna-stage2-oct9-readiness/live-baseline-readback.json). Summary includes source/test hashes, per-call usage/status/timing and the Stage 3 request-equivalence proof. Raw captures and private credentials remain external under `C:\Users\craig\.codex\luna-stage2-20261009`; credentials and image base64 are excluded from committed evidence.

Runners: `functions/scripts/stage2-model-audit.mjs`, `stage2-classification-replay.mjs`, `stage2-pipeline-audit.mjs`. Earlier experiments are preserved in [local hardening](luna-stage2-oct9-local-hardening.md); this report adds production-preprocessed and gallery-flow evidence rather than replacing historical results.
