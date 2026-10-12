# Stage 4 cache-layout audit — October 11, 2026

## Decision

**Hold. Do not deploy the cache-only layout.** The complete frozen cohort saved 7.15% overall with essentially unchanged aggregate API time, but decisions and preserved fields were not equivalent. A targeted repeat was more expensive and slower and triggered two validation fallbacks. There is no reliable combined quality, speed and cost case for this change.

Craig accepted this decision on October 11 and directed that Stage 4 cache optimization not proceed. He asked to record and explain the smaller-validation-response suggestion. That proposal is deferred, not approved for implementation or deployment; see [the compact-response proposal](stage4-compact-validation-response-proposal.md).

Production Stage 4 remains GPT-5 Nano low. No parser runtime file, model allocation, live record, queue or traffic was changed by this audit. Stage 3 caching remains held; accepted Stage 1, 2 and 5 caching work is preserved.

## Baseline and scope

- Checkout: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`.
- Branch: `codex/luna-oct11-integrity-repair`; baseline HEAD `1eb2687`.
- Frozen full dataset: `1w9joG-FJhXFTLKes7T4836iykHoPMZYU`, run `e2f105c9-2f63-4a8b-9045-c676d273a838`.
- Production evidence: `luna-pilot-release/gathr-apps-script/artifacts/luna-oct11-production-audit/{ledger,snapshots,logs,image-manifest}.json`.
- **53 posts, 171 captured Stage 3 input items, 56 Stage 4 calls per full arm.** Rows 20 and 22 contain 19 and 41 items; batching remains 15 with concurrency 2. All other posts fit one call.
- Replays use the current accepted validator, including the October 11 distinct-weekly-sibling repair. This adds 34 input tokens per call relative to the morning production prompt; 56 × 34 = 1,904. Therefore paired replay costs are compared with each other, not presented as an exact replay of the old serving request bytes.
- Images are not sent to Stage 4. The frozen extracted items are the inputs. Rows 81/82 retain usable extracted text but their original galleries are unavailable; no fresh visual quality claim is made for those images.
- The separate deferred Stage 4 prose-override repair in the other checkout was **not** included.

## What was tested

The old layout puts the changing posting context and item array before the validation rules. The candidate places unchanged validation rules first, then the complete changing context and item array, and keeps the complete JSON instructions **last**. It uses three text blocks in the same user message and a stable `prompt_cache_key` of `gathr-stage4-rules-json-last-v2`.

All original nonempty prompt lines, source item values, Nano model, low effort, 32,000 output cap, batching and deterministic postprocessing are preserved. There is no rule cleanup, model experiment or explicit cache breakpoint. Two offline request-contract tests cover every frozen request and reject unrecognized shapes/settings.

Nano uses implicit prompt caching. Exact prefixes and routing matter; a stable key does not guarantee a hit. Prices used here are USD per million tokens: ordinary input $0.05, cached input $0.005, output $0.40. Nano cache writes were explicitly reported as zero in every measured call. Sources: [OpenAI caching guide](https://developers.openai.com/api/docs/guides/prompt-caching), [GPT-5 Nano model pricing](https://developers.openai.com/api/docs/models/gpt-5-nano).

## Actual production Stage 4 cost composition

The 56 distinct response diagnostics reconcile exactly to the ledger Stage 4 call/input/output/cache totals.

| Metric | October 11 production |
|---|---:|
| Input tokens | 151,211 |
| Cached reads / writes | 0 / 0 |
| Output tokens, including reasoning | 78,610 |
| Reasoning tokens, included above | 17,280 |
| Non-reasoning output tokens | 61,330 |
| Input cost | $0.00756055 |
| Output cost | $0.03144400 |
| Total estimate | **$0.03900455** |
| Summed API duration | 379.351 seconds |
| Median / p95 / maximum call | 4.891 / 18.870 / 21.280 seconds |

**80.6% of cost is output.** Even the impossible best case of discounting every input token by 90% would reduce total cost by only 17.45%; real changing source tokens cannot all share a cache prefix. Visible output accounts for approximately 62.9% of total cost, reasoning 17.7%, and input 19.4%.

## Full paired API replay

Interleaved arm order, four source tasks at a time, identical frozen inputs. No dummy warm-up calls. This is a replay comparison, not whole-parser wall-clock evidence.

| Metric | Current layout | Candidate |
|---|---:|---:|
| Sources / supplied items / calls | 53 / 171 / 56 | 53 / 171 / 56 |
| Input tokens | 153,115 | 153,115 |
| Cached input tokens | 0 | 81,536 |
| Output tokens | 80,080 | 82,155 |
| Reasoning tokens | 17,664 | 20,480 |
| Input cost | $0.00765575 | $0.00398663 |
| Output cost | $0.03203200 | $0.03286200 |
| Total estimate | **$0.03968775** | **$0.03684863** |
| Summed API duration | 393.412 sec | 392.371 sec |
| Median / p95 call | 4.762 / 20.601 sec | 4.733 / 19.180 sec |
| Retained Stage 4 items | 141 | 123 |
| Count/format fallbacks | 1 | 0 |

Input cost fell **47.93%**, total cost **7.15%**, and summed time **0.26%**. Forty-nine candidate calls had cache hits. Larger retained counts are not a quality score: the baseline count includes a fallback that retained all 11 Souris input items.

## Targeted repeat

Rows **22, 27, 64, 81, 127, 217, 292, 294** were repeated to investigate specific decision/field differences and the previously problematic Clamdiggers/Souris responses. No other paid reruns were performed.

| Metric | Current layout | Candidate |
|---|---:|---:|
| Sources / items / calls | 8 / 66 / 10 | 8 / 66 / 10 |
| Cached input tokens | 30,464 | 27,648 |
| Output / reasoning tokens | 22,786 / 3,392 | 24,522 / 4,480 |
| Total estimate | $0.00942432 | $0.01024544 |
| Summed API duration | 108.804 sec | 115.565 sec |
| Count/format fallbacks | 0 | 2 |

Candidate cost **8.71% more**, time **6.21% longer**. The baseline also received cache hits because these were exact source replays; do not extrapolate this warm repeat to first-time production posts or mix its rates with the full cohort.

All 132 paid calls completed at the API level; no HTTP error, incomplete response, model fallback or automatic paid retry was observed. The whole experiment cost an estimated **$0.09620614**. Application validation fallbacks below are distinct from API completion.

## Source and output review

| Source | Observed behavior | Interpretation |
|---|---|---|
| Downtown Charlottetown row 22, `1559590459541819` | First pair retained 41/40 items; repeat 40/41. Difference is the second identical Got Blues Matinee at Oct 10, 13:00, Trailside. Caption prints it twice. | Duplicate rejection varies in both arms; this is not a missing distinct performance. |
| Inn at Bay Fortune row 27, `1722331433230764` | Both models explicitly rejected the undetermined-time FireWorks Feast; candidate postprocessing retained it once. Repeat rejected it in both arms. | Existing prose-based override matches “valid event” inside a sentence stating the minimum fields failed. This is a code issue, not evidence that cache storage changes event facts. No live write was performed. |
| Founders Harvest Fest row 64, `1718913086910871` | Candidate changed `spatial.kind` from `single_location` to `singleLocation` in both passes; address/date/time unchanged. | Repeated source-metadata mutation. Original flyer visually confirms Founders, 6 Prince St, Oct 17, 3–8 p.m. No downstream location behavior is claimed from this Stage 4-only test. |
| Luka Hall row 81, `1703280601801849` | First pair retained all seven dated performers in baseline and none in candidate; repeat rejected them in both. | Missing-time validation varies. Caption confirms dated performances, but no supplied clock times; original galleries have expired. This is not proof of seven wrong live omissions. Stage 4 lacks the source/time enrichment needed to resolve it. |
| Clamdiggers row 127 | First pair retained both dated turkey-dinner specials. Repeat candidate produced malformed JSON, and runtime fallback preserved two input specials. | Correct count after fallback is not a clean response-quality pass. Exact response error is saved. |
| Soul Fit row 217, `122282191970151845` | Baseline model rejected undated Box Fit but code retained it once; repeat and candidate rejected it. | Same prose-override weakness. Visual review confirms the image names Box Fit with no date or clock time. |
| Souris row 292, `1740954254704708` | First baseline returned 12 decisions for 11 inputs, triggering raw-input fallback; candidate retained only Oct 24. Repeat reversed that pattern. | Tour poster visibly assigns different dates to different towns; only Oct 24 is Souris. Retaining all 11 inputs at Souris is not completeness success. The 12th decision repeats the correct occurrence. Both layouts can trigger this existing fallback failure. |
| Harmony House row 294, `1734407122021543` | Recurrence alternated between `none` and `weekly_thursday` across arms/reruns. Candidate repeat also omitted `spatial` and `_ticketImageUrl`. | Original image says Music Trivia Thursdays; caption says starting Oct 29. This audit does not decide a new recurrence policy. Returning entire items permits unwanted field/metadata rewrites. |

Remaining compared outputs had no additional protected-field or inventory differences; Albert & Crown row 37 had quotation-mark differences in extraction explanations only. Dense camp row 234 retained all nine supplied sessions, both layouts; the family visit/vendor-market row 332 retained all four. Retained paired fields include date/time, venue, prices, URLs, image index and recurrence; this is not a full end-to-end write audit or visual review of all 53 source galleries.

## Better next experiment

The present contract requires `validatedItems[].item` to reproduce each whole extracted item, plus decision, explanation, correction explanation and a summary. In the full baseline replay, re-serialized item objects occupy about **65.0% of normalized response JSON characters**. This is a character measurement, not a token-saving or speed guarantee.

A more promising separate experiment would return a stable input index, decision and narrowly permitted corrections; code would retain the original source fields and apply only validated deltas. That could reduce visible output and accidental field loss. It needs tests for source-index uniqueness, completeness, recurrence, duplicate decisions and malformed-response handling. Keep reasoning/model fixed initially to isolate that output-contract change.

Before any such release, also resolve the existing prose-based rejection override and establish a safe policy for malformed validation output. These are recorded findings, **not implemented repairs** in this audit. No existing live event was reclassified or repaired.

## Reproduction and evidence

- `functions/scripts/stage4-cache-layout.mjs`: experimental layout only.
- `functions/scripts/stage4-cache-validation.mjs`: bounded API-only full/selected source replay; no DB/writer imports; refuses output overwrite.
- `functions/scripts/stage4-cache-layout.test.mjs`: two passing request-contract tests, all 56 frozen requests covered.
- `functions/scripts/stage4-cache-validation-report.mjs`: ledger/diagnostic reconciliation, actual usage accounting and canonical field/inventory comparison.
- Local artifacts: `functions/artifacts/luna-stage4-cache-layout-oct11/{full-offline,full-api,targeted-repeat-api,report.json}`. Each API response, raw decision, usage record and fallback is saved. Artifact data is not committed.
- Offline command: `node scripts/stage4-cache-validation.mjs`; tests: `node --test scripts/stage4-cache-layout.test.mjs`; report: `node scripts/stage4-cache-validation-report.mjs`.
- Paid execution requires the previously authorized GathR key in `OPENAI_API_KEY`, `--execute`, and a fresh label. Default labels now refuse automatic replay. Credential values were neither printed nor stored.

**Release status: held; no deployment.**
