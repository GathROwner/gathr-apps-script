# Stage 4: Nano low versus Luna none, low and medium

October 9, 2026. Local comparison on accepted parser commit `cd6aa93`. **No deployment, production configuration change, or live record change.**

## Recommendation

**Keep Nano low as the Stage 4 production baseline for now. Luna none is the strongest Luna challenger for quality, but this is not another Stage 5 cost saving.** Luna none used 9.1% less summed validation time and cost 14.1% more in this cohort (11.0% more without input caching). Luna low was slightly cheaper than none, but had no persuasive quality advantage; medium wrongly rejected three advertised sessions on its first pass. More reasoning did not reliably improve decisions.

Prioritize the separate Stage 5 Luna-none shadow test after the planned Stage 1/3 full-run audit and Stage 2 pilot gates. Stage 5's much larger reasoning overhead produced a materially larger speed and cost opportunity. For a subsequent Stage 4 pilot, first fix the existing prose-based contradiction override, verify administrative deadlines remain excluded by the upstream guard, and repeat the affected policy cases. These tests support a quality investigation of Luna none, not an immediate Stage 4 rollout.

## Method

- **21 frozen cases:** 17 saved Stage 3 replay inputs from real posts and four separately labelled synthetic policy fixtures. Real cases cover pools, ice slots, sparse PowerSkating dates, gallery theatre shows, courses/URLs, clinic appointments, shows, food specials, studio tours, markets, unscheduled classes, registration notices and an online giveaway.
- Four cases repeated once in every arm: PowerSkating, mixed menu/activity fixture, market/unscheduled classes, and untimed marathon. **100 validator runs, 108 actual API calls; 25 runs and 170 input occurrences per arm.** The 21 first-pass cases contain 124 items. Repeats add 46 occurrences per arm.
- Actual `performSecondaryValidation`: current prompt, free-form JSON output, 32,000 output-token cap, 15-item batches and two concurrent batches. No strict schema was introduced. Only model and reasoning effort changed. The production `lunaCalendarLiteralSourcePrompt` guard setting was retained across all arms.
- All 75 complete paired request sets have identical prompt/output-contract hashes. Model/effort/cap were captured from outgoing requests. Luna none returned zero reasoning tokens. No images, other model stages, venue lookups or live event writer ran.
- Maximum four validator processes ran concurrently across arms. Times include deterministic validation/guards and parallel batching, exclude process startup, and are practical samples rather than a controlled service-capacity benchmark. Summed run time is not total elapsed time or a forecast for a complete parse.
- Grading uses 145 decisions per arm; 25 review-only occurrences cover untimed races and the legacy giveaway candidate. Source-field checks include name/date/start, end, venue, price, ticket URL, supplied image index, source type and metadata presence. The final fixture additionally tests holiday recurrence correction, ordinary weekly deals, separate concert dates and unusual explicitly printed AM times.

## Measured results

| Arm | Median validator run | Summed run time | Usage-priced USD | USD without input-cache effects | Reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nano low | 11.1 s | 322.2 s | $0.031051 | $0.031990 | 11,840 |
| Luna none | 10.1 s | 292.8 s | $0.035437 | $0.035524 | 0 |
| Luna low | 9.1 s | 300.9 s | $0.033790 | $0.033877 | 1,672 |
| Luna medium | 9.8 s | 348.2 s | $0.037072 | $0.037159 | 3,744 |

| Arm versus Nano low | Change in summed time | Change in usage-priced cost |
| --- | ---: | ---: |
| Luna none | 9.1% less | 14.1% more |
| Luna low | 6.6% less | 8.8% more |
| Luna medium | 8.1% more | 19.4% more |

Nano generated 68,128 output tokens; 11,840 (17.4%) were reasoning. Luna none generated 52,093 output tokens. This reduction is insufficient to offset Luna's higher per-token rates. By comparison, the separate Stage 5 benchmark had 74.7% reasoning in Nano medium's output usage. Do not carry the Stage 5 savings percentage over to Stage 4.

These are actual returned usage multiplied by published standard API prices, not invoices. Rates per million tokens: Nano $0.05 input / $0.005 cache read / $0.40 output; Luna $0.10 input / $0.01 cache read / $0.125 cache write / $0.50 output. Cache-neutral estimates charge all input at the ordinary input rate. Sources: [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Total estimated API cost of the comparison was **$0.137350 USD**.

All 108 requests returned HTTP 200 and completed status. None reported output-limit exhaustion. One Nano response was invalid JSON; the validator recovered through its existing fallback. Output-token limits do not explain the timing in this cohort.

## Quality: distinguish model output from the guard's final result

| Arm | Final decision discrepancies / 145 graded items | Final recurrence discrepancies | Runs using existing count/JSON fallback |
| --- | ---: | ---: | ---: |
| Nano low | 5 | 1 | 4 |
| Luna none | 1 | 0 | 0 |
| Luna low | 3 | 0 | 0 |
| Luna medium | 5 | 0 | 0 |

These counts are cohort observations, not production error rates. They include repeated occurrences and historical candidates already blocked earlier in the repaired pipeline. All final retained items preserve the other checked supplied source fields; there were no unmatched additional final items. A missing event is still an error even when the remaining fields are correct.

### Existing contradiction override reverses correct rejections

The code searches a rejected item's prose reason for `valid event` or `should be kept`, then overrides the decision to `KEPT`. It does not understand negation or conditional phrasing. Raw responses and logs establish four negation failures:

- Nano, mixed fixture: correctly rejects **Happy Thanksgiving** with “not a valid event”; the guard accepts the greeting.
- Nano, market repeat: correctly rejects **Baking Class** and **Sketching Class** because no date/time is provided, with “not a valid event”; the guard accepts both.
- Luna low, required-fields fixture: correctly rejects **Membership Announcement** with “not a valid event”; the guard accepts it.

Nano's first marathon response also rejects the registration notice but says it “should be kept only if treated as a special deal.” The same override accepts it. Nano's second response directly accepts it. Therefore Nano's five final decision discrepancies are four guard reversals plus one model acceptance; Luna low's three are one guard reversal plus two model acceptances. This is a shared deterministic-code defect, not evidence that those models rejected badly.

Repair target: `secondaryValidator.ts` contradiction detection around lines 624–653. Replace broad prose substring overrides with an explicit, narrowly validated rule; negated and conditional statements must not reverse a rejection, and required-field failures must remain rejected. Keep the intentional public-pool, daily-special and Happy Hour exceptions separate. No change to this guard was mixed into the benchmark.

### Registration-price notice: model inconsistency and a corrected test label

All arms accept the old registration-price-change candidate on at least one pass. Luna none rejects it first, then accepts it on repeat; low and medium accept it twice. The current production upstream safeguard already excludes standalone administrative deadlines, as documented in [the October 9 production audit](luna-oct9-production-audit.md). The frozen Stage 3 candidate predates that guard; this does not prove a fresh production leak.

The initial benchmark label incorrectly copied historical acceptance. It was corrected to `REJECTED` using that existing audit, with the correction recorded separately in `adjudications.json`. Frozen inputs and their hashes were preserved, and no expected label was included in the API prompt. Untimed races remain review observations: they are valid activities needing time enrichment, and no arm invented a start to make them pass Stage 4.

### PowerSkating: medium omits valid sessions; Nano relies on fallback

Luna medium rejected the December 13, December 20 and January 3 U13/U15 sessions because the description says “dependent on interest.” Those are advertised, dated, bookable public sessions; retain them with the condition in the description. Medium kept all 20 on repeat. None and low retained all 20 on both passes.

Nano returned 14 entries for the first 15-item batch on both passes, so the existing count guard discarded that response and retained the source batch. Final output had all 20 dates. Nano also returned seven entries for a six-slot ice request, and malformed JSON for the two studio tours. Existing fallback retained six correct ice slots and both tours. These are successful guard recoveries, not flawless raw model output. Positional field attribution is deliberately disabled in the analyzer when the raw count differs, because one omitted entry shifts later positions.

### Recurrence and other policy controls

In the synthetic holiday fixture, Nano retained `weekly_monday` on a Thanksgiving-only dinner; all Luna arms corrected it to `none`, retained the ordinary weekly Friday deal, kept both separately dated concerts and preserved the explicitly printed 3:15 AM skate. This isolated Stage 4 defect is not a claim that a new false recurring record was written by the full pipeline.

All arms kept the public bookable ice/pool access, studio tour, advertised unpriced daily special and Happy Hour controls. All arms rejected ordinary month-long menu/product offerings, plain kitchen hours and private pool closure. The older online giveaway candidate is ungraded: none and medium rejected it, Nano and low kept it; its upstream exclusion already exists and the current Stage 4 prompt alone is not the entire product policy.

## Local implementation and validation

The Stage 4 request builder previously ignored explicit `none`, silently leaving the API default in effect. The local change accepts `none` only when the model is `gpt-6-luna`; Nano and all production defaults retain their existing behavior. Six mocked request tests cover Luna none/low/medium, Nano low, unsupported Nano none, and omitted effort; they assert the existing 32k cap and free-form contract. TypeScript build and all **26 focused tests** passed, including 20 existing validator regressions.

Evidence: [artifacts/luna-stage4-oct9-model-comparison](../artifacts/luna-stage4-oct9-model-comparison/). The folder retains frozen inputs, adjudication, all 100 raw/final captures, usage/status/timing, prompt hashes, aggregate review, test log and four guard-reversal logs. `README.md` explains reproduction. Credential values and images are excluded.

Limitations: this is a deliberately varied, small frozen-input study, not a random full-run sample or independent original-image audit. Some historical replay inputs lack original timestamp metadata and use the visible fixed fallback. The four repeats and final recurrence fixture are targeted diagnostics. Missing end times/prices are allowed; generic untimed classes are held pending evidence, not declared outside GathR's activity scope. Production remains **Nano low in Stage 4 and Nano medium in Stage 5**.
