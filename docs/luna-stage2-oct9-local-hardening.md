# Stage 2 local hardening and Luna evaluation — October 9

## Status

Local candidate only. No deployment, production environment change, scheduled audit change, Firestore write, image-service mutation, or map interaction occurred. Tomorrow's accepted Stage 1/3 Luna baseline retains GPT-5 mini in Stage 2 and unchanged Nano Stages 4/5.

This follows [the initial Stage 2 audit](luna-stage2-oct9-model-audit.md), starting from commit `6a856a3` and preserving all accepted parser changes.

## Changes prepared

- EVENT explicitly covers clinics, tours, classes, recreation, bookable slots, registration invitations, and organized food trails. Missing dates in a registration invitation are left for extraction/validation to resolve.
- Food routing requires food/drink offer evidence. Main Street, a special guest/gift, unrelated prices, lodging rates, ordinary restock prices, and ordinary month-long menu features cannot independently trigger the deterministic guard. Model-detected specials in images remain available; this guard is not a complete food vocabulary or an eligibility filter.
- A response explicitly identifying neither activities nor food/drink specials cannot pass merely because it is confident about its closest available category. Contradictory MIXED correction cannot restore confidence to that empty result.
- GPT-6 Stage 2 effort is configurable through `stage2ReasoningEffort`; its existing default remains `none`. Mini's request settings remain unchanged.
- Optional `stage2LunaNegativeRecheck` makes a negative no-reasoning Luna result receive one high-effort classification review by the same Luna model. Positive initial results remain one classification pass. A failed review retains the initial hold. The option defaults off, and no production pilot allocation or environment switch was enabled. Each classification pass retains the existing SDK retry/image-error behavior; this is a bound on reasoning passes rather than a new bound on all transport attempts.

## Real API comparisons

The same frozen 98 sources from the initial audit were reused: 78 image sources and 20 captions, including eight galleries exceeding four images. The final three-arm run made 294 completed API calls. The additional candidate with negative-result review made 107 completed calls for 98 posts: nine received high review. All requests completed without classification error fallback.

| Stage 2 approach | Observed cost, USD | Cost with caching removed, USD | Summed classifier time |
| --- | ---: | ---: | ---: |
| Mini | 0.147456 | 0.147802 | 429.903 s |
| Luna, no reasoning | 0.028073 | 0.023928 | 243.878 s |
| Luna, high throughout | 0.040411 | 0.036267 | 454.013 s |
| Luna, high review of negative results | 0.011687 | 0.028849 | 303.275 s |

The review candidate ran after the other arms and benefited heavily from warm caches: 190,692 of 191,013 input tokens were cached. Its observed 92% saving must not be presented as a forecast. Applying uncached standard rates to every arm's actual recorded input/output gives **80.5% lower estimated cost** for the review candidate. Summed per-post classifier time was **29.5% lower**. These are local comparison results, not a whole-parse speedup or a promised production bill.

Pricing was checked October 9 against the official [Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) and [Mini model page](https://developers.openai.com/api/docs/models/gpt-5-mini). Observed cost includes recorded cache reads/writes; the uncached comparison is a separate calculation.

The first revised prompt also completed 294 calls, but exposed false holds for a food trail and curling registration; it was superseded by the final prompt. Reapplying the final deterministic guards to all 294 standalone final-run responses and 98 review-candidate responses changed no gate or route decisions. Earlier experiments are retained externally rather than silently treated as final results.

## Quality evidence

- The clinic and pottery tour no longer acquire food-special routes from address or gift wording. Final Mini, none, and high all preserve their activity classification.
- The final prompt preserves the dated dessert trail and curling registration in all three standalone arms.
- Pure no-reasoning still rejected an orchard photo invitation and a named golf tournament that high accepted. It is not the preferred standalone production candidate.
- The candidate with review of negative results matched the fresh Mini arm's accept/hold decisions on all 98 sources: 94 accepted, four held. This is agreement with Mini, not independent proof that all 94 should become live listings.
- Its four holds were a retail footwear promotion, generic library promotion, restaurant closure, and downloadable kids' guide.
- Ordinary produce-box pickup, a lodging getaway, and an out-of-region travel itinerary remain scope observations. Some arms treat these as public visits or bookable activities. Matching Mini does not establish source eligibility; current Stage 1 eligibility and downstream source/date/venue checks remain necessary.
- Twelve explicitly constructed semantic fixtures were each tested through four approaches with actual API calls. All three Luna approaches matched all expected activity/food flags and gates. Mini incorrectly admitted an ordinary month-long menu feature and a bookkeeping advertisement. These are constructed tests, including the structured Facebook UTC metadata case, not independent real-world source coverage.
- The TypeScript build and 38 focused local tests passed, including food-signal boundaries, no-item confidence, structured Facebook metadata, configurable effort, one optional review, failure retention, and existing structural routing.

Nine full no-write downstream replays with the first revised prompt completed and were verified against source dates/times: one clinic, two weekend pottery visits, the dated clinic without an apple-stock event, 20 printed PowerSkating one-offs, and four APM ice slots. Classifications and effective route/count differences between that revision and the final prompt are retained in the evidence. Stage 3 remained Luna high; Stages 4/5 remained Nano low/medium.

Two additional downstream replays used the final review-candidate classifications. PowerSkating retained exactly the 20 printed 07:00–08:00 dated one-offs, without November 7/8 or weekly parents. APM retained exactly October 8 18:20, October 10 09:20 and 18:40, and October 12 18:20. Both source inventories were verified programmatically. PowerSkating's Stage 2 estimate was only two groups; the full extraction still preserved all 20 sessions. Estimated classifier counts are not source-inventory truth. In total, 11 downstream replays completed.

## Release boundary and next step

Retain this as a local candidate and collect tomorrow's already approved Stage 1/3 production results. Before a Stage 2 production pilot, cover the exact production preprocessed images and first-four/full-gallery refresh flow, plus a real structured Facebook Event source. The tests here used captured original color images; production's enlarged grayscale inputs have different token costs. No live writer, persisted gallery provenance, or live deduplication behavior was certified by these no-write tests.

Evidence: [summary](../artifacts/luna-stage2-oct9-hardening/summary.json), [classification ledger](../artifacts/luna-stage2-oct9-hardening/classification-ledger.json), `functions/scripts/stage2-model-audit.mjs`, `functions/scripts/stage2-classification-replay.mjs`, and `functions/scripts/stage2-safeguards.test.mjs`. Private source captures and raw request results remain under `C:\Users\craig\.codex\luna-stage2-20261009`; credentials are excluded.

## Subsequent readiness testing

[Stage 2 release readiness](luna-stage2-oct9-release-readiness.md) adds production-preprocessed images, 119 paired cases, 30 complete no-write pipeline replays, formal Facebook metadata, strict response/error handling and a default-off stable allocation switch. Its production-preprocessed cost estimate is the current planning estimate. It also records clinic eligibility variation and sparse calendar date errors in the unchanged Stage 1/3 baseline. Production remains unchanged.
