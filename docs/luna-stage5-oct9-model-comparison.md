# Stage 5: Nano medium versus Luna none, low and medium

October 9, 2026. Local comparison based on accepted parser commit `df4a5a1`. **No deployment, live record changes, or production configuration changes.**

## Recommendation

**Luna none is the leading Stage 5 candidate.** It preserved the checked source fields across all 13 formatter runs, with 63.1% lower usage-priced cost and 70.7% less summed formatter wall time than Nano medium. More reasoning did not improve the observed field preservation. This is evidence for a subsequent Stage 5 shadow test, not approval to change today's production baseline or skip the planned Stage 1/3 audit and Stage 2 pilot.

Before a Stage 5 pilot, make the completion check for small posts as strict as the existing large-post batch check, and preserve price/link fields when a missing model item is reconstructed. The comparison exposed that existing weakness through Luna medium; it is not inherently specific to that model.

## Method and scope

- **10 frozen cases from eight source posts**, including two derived subsets. Three cases (15-item pool schedule, 20-item PowerSkating schedule, two-item music/special post) were repeated once in each arm: **52 formatter runs and 84 actual Responses calls**.
- Every arm received identical saved Stage 4 inputs and the current formatter prompt/schema. Initial planned request hashes match in all 39 paired comparisons. Recovery creates additional smaller prompts, so the complete request sets differ for the PowerSkating repeat.
- Actual `performFinalFormatting`, strict structured output, 32,000 output-token cap, maximum nine items per batch and two concurrent batches. Current calendar/source-preservation logic enabled for all arms.
- Only model and reasoning effort changed: GPT-5 nano medium; GPT-6 Luna none, low and medium. Raw Responses payloads were checked for the requested effort. Luna none returned **zero reasoning tokens**.
- No Stage 1–4 model calls, images, venue lookups, live event writer, or Stage 5.5 time enrichment. Untimed specials remained untimed in this isolated formatter test.
- Each arm processed 104 input occurrences across its 13 runs. All produced **101 final records representing 104 dated occurrences**: the ice case collapses six occurrences to four finite recurring records, and the course case collapses five to four. Those changes are existing deterministic recurrence handling, not dropped events.
- Checks cover name/date/start identity, end time (including blank ends), explicit venue, ticket link, supplied image index, supplied price, explicit event/special type, missing occurrences and additional occurrences. Raw outputs were inspected separately from repaired final outputs. Categories and descriptions were reviewed as observations, not given a universal correctness score.

## Measured results

Times include each formatter's deterministic processing and any recovery calls; they exclude process startup. Summed times are the sum of isolated run durations, not elapsed benchmark time or full-parse latency.

| Arm | Runs / API calls | Median run | Summed run time | Usage-priced USD | USD without input-cache benefit | Reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nano medium | 13 / 22 | 31.3 s | 568.8 s | $0.057857 | $0.058958 | 103,040 |
| Luna none | 13 / 20 | 11.2 s | 166.9 s | $0.021351 | $0.022541 | 0 |
| Luna low | 13 / 22 | 13.7 s | 218.7 s | $0.025355 | $0.026375 | 4,002 |
| Luna medium | 13 / 20 | 17.4 s | 231.6 s | $0.028433 | $0.029623 | 6,988 |

Relative to Nano medium:

| Arm | Less summed formatter time | Lower usage-priced cost | Lower cost without cache benefit |
| --- | ---: | ---: | ---: |
| Luna none | 70.7% | 63.1% | 61.8% |
| Luna low | 61.6% | 56.2% | 55.3% |
| Luna medium | 59.3% | 50.9% | 49.8% |

These are **token usage multiplied by published standard API rates**, not a billing invoice or a forecast of daily savings. Nano rates per million tokens: $0.05 input, $0.005 cached input, $0.40 output. Luna: $0.10 input, $0.01 cached input, $0.125 cache write, $0.50 output. Actual reported cache reads/writes are included; the cache-neutral column charges all input at the ordinary input rate. Sources: [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano) and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

Nano is cheaper per token. Luna none was cheaper for this work because it generated far fewer output tokens: **31,425 versus 138,004**. Nano's 103,040 reasoning tokens account for 74.7% of its output-token usage. All 84 calls returned HTTP 200, completed status and valid JSON; none was reported incomplete or hit the output cap. Output limits did not explain the observed differences in this cohort.

## Quality and recovery observations

1. **Luna none:** no detected raw identity/count/source-field discrepancies or final checked-field losses. All 20 printed PowerSkating dates, 15 pool activities, ten gallery show dates, course URLs and the supplied fifth-image index survived. This does not establish a zero error rate on unseen posts.
2. **Luna low, PowerSkating repeat:** a nine-item request returned only one item. The current count guard rejected it and retried five plus four items. All 20 final records were correct; total calls rose from three to five and time was 45.7 seconds. Raw evidence: `powerskate-20-luna-low-r2.json`.
3. **Luna medium, music and wings:** a two-item request returned only Daniel's performance. Existing alignment code rebuilt the missing Wings listing from Stage 4, retaining its description and date, but set `ticketPrice` to blank instead of `$10/lb`. The description still contained the price. The repeat returned both items and preserved the price. Nano, Luna none and Luna low preserved both items and the price in both runs. This is a real final-field defect despite a superficially correct final count. Evidence: `music-and-wings-luna-medium-r1.json` and `r2.json`.
4. **Luna medium, virtual courses:** all five raw items omitted the explicit `Virtual` venue. Existing deterministic venue restoration recovered it in final outputs. Do not count this as flawless model output. Evidence: `courses-5-luna-medium-r1.json`.
5. **Nano medium, PowerSkating repeat:** the nine-item batch beginning at input offset nine changed the last U13/U15 group to U9/U11. The source identity guard rejected it and retried five plus four items. Final dates/names were preserved, but the run took **172.7 seconds and five calls**. Luna none's matching repeat took 28.4 seconds and three calls. Evidence: `powerskate-20-nano-medium-r2.json`.
6. **Categories vary:** the all-pools activity becomes Gatherings & Parties with Nano/none and Sports with Luna low/medium; PowerSkating becomes Workshops & Classes consistently with none and a mix of Sports/Workshops with other arms. Higher reasoning did not yield stable agreement. These differences need product category expectations in a future Stage 5 rollout review.

The small-post completion weakness is visible in `finalFormatter.ts`: `formatValidatedItemsInBatches` checks raw item count before alignment, while the single-request path calls alignment directly. `buildFormattedEventPlaceholder` fills an absent item but initializes price/link fields blank. Counting only final records would conceal the lost wings price. No repair was mixed into the benchmark; its prompt, guards and normalization remained constant across arms.

## Cases and evidence limits

| Case | Inputs | Evidence / purpose |
| --- | ---: | --- |
| pool-15 | 15 | Bell Aliant Oct 7 row 172, saved instrumented Stage 4 replay; dense activity inventory |
| pool-tail-6 | 6 | Derived final six pool items; isolates the earlier six-item latency concern |
| ice-6 | 6 | Eastern Kings row 244; finite recurrence and distinct time slots |
| courses-5 | 5 | Sport PEI; virtual venue, dated courses, registration URLs and recurrence |
| course-single | 1 | Derived first Sport PEI course |
| untimed-special | 1 | Clam Diggers; preserve unpriced/untimed Thanksgiving offer |
| powerskate-20 | 20 | Cavendish row 287; exactly printed sparse dates, no invented Nov 7/8 or Dec 26 |
| theatre-10 | 10 | Harbourfront; multiple dates/venues, ticket link and image index four |
| music-and-wings | 2 | Tipsy; performance plus $10/lb special |
| clinic-single | 1 | Rxtra Care; single dated appointment activity |

The pool input is a saved replay from the affected source, **not the original missing 470-second request/response**. October 6 rows 55/80/257/258 snapshots contained final outputs rather than frozen Stage 4 inputs, so those snapshots were not misrepresented as equivalent benchmark inputs. The Sport PEI caption context is a generic fixed sentence; its saved Stage 4 items carry the detailed course evidence. Historical reference events in `cohort.json` are retained for provenance, not used as independent ground truth. The price repeat was added after discovering the first medium omission and is not an independent random sample. The API runs overlapped across arms at a maximum of four formatter processes, so timing is a practical sample, not a controlled service-capacity test.

## Local change and validation

The formatter previously ignored an explicit `none` value. This would silently make a purported Luna-none experiment use the API default reasoning. The local change accepts `none` **only for `gpt-6-luna`**, retaining Nano's existing request behavior and every production default.

- TypeScript build passed.
- **87 focused tests passed**: 81 existing formatter regressions and six mocked request checks for Luna none/low/medium, Nano medium, Nano unsupported none and omitted effort. Tests assert strict schema and the 32k cap.
- Captured initial prompt/schema hashes match in every pair; raw model, effort, usage, response status, input/output counts and recovery calls are saved.
- No credential values or images are in the saved comparison artifacts.

Evidence folder: [artifacts/luna-stage5-oct9-model-comparison](../artifacts/luna-stage5-oct9-model-comparison/). `summary.json` contains aggregate metrics, raw discrepancy checks and final field checks; `results/` retains all 52 full responses/outputs/usage records; `cohort.json` freezes the inputs. See `README.md` there for reproduction.

**Production remains Nano low in Stage 4 and Nano medium in Stage 5.** This experiment does not change the Stage 1/3 baseline or the prepared Stage 2 release gates.
