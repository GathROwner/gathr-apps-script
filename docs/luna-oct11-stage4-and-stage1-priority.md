# October 11: Stage 4 check and Stage 1 caching priority

## Decision

Keep production Stage 4 at GPT-5 nano low. Prioritize a controlled Stage 1 caching experiment. No parser runtime, prompt, model allocation or production configuration changed during this follow-up. The approved eight-record live repair is complete and separately verified.

## Actual targeted Stage 4 comparison

Used the deployed October 11 validator code, including the new recurrence anchor/meal/market protections. Frozen inputs: nine October 11 sources (rows 66, 120, 234, 277, 313, 315, 332, 75, 217), plus three previously repaired October 10 controls (Old Triangle dinner/music, Local Pub trivia/cocktail, combined dinner concert). Twelve posts, 28 candidate items per arm, 24 actual Responses calls. Same input/prompt/schema hashes across the paired arms, alternating arm order, four harness workers, no writer imports and network restricted to the model endpoint. No repeated same-source warm-up calls.

| Arm | Summed validator seconds | Estimated USD | Cold-input estimate | Retained items |
| --- | ---: | ---: | ---: | ---: |
| Nano low | 84.832 | 0.00703132 | 0.00768220 | 28 |
| Nano minimal | 70.570 | 0.00567604 | 0.00640180 | 27 |

Minimal used 16.8% less summed time and 19.3% less usage-priced cost; the cold-input cost advantage was 16.7%. These small-cohort measurements are not a whole-parse speed or cost guarantee. Both arms completed all calls without HTTP/incomplete failures. Nano low had one malformed-JSON fallback, which retained its original input; minimal had no fallback. Retained counts are not accuracy scores: ordinary veggie-box and untimed BoxFit controls remained for later pipeline filtering in both arms.

Confirmed minimal regressions:

- Rejected the explicitly advertised Warren Grove Sour Smash cocktail as an unpriced menu feature. Nano low kept it cleanly. This repeats the existing daily-special policy weakness.
- Changed Saturday and Sunday brunch `recurringPattern` values to `none`. Both arms preserved two dates after the deployed sibling anchor repair, but minimal lost their weekly cadence.

Both arms kept the camp's nine source items, timed Tipsy buffet, four farm/market items, civic/literary/donation activities and the other repaired meal controls. No source title, ticket-link, image-index or venue change was detected in retained items. Do not deploy the separate coordinator checkout's deferred Stage 4 experiment to compensate for these results.

Evidence: `functions/artifacts/luna-stage4-oct11-priority-check/` contains the frozen cohort, 24 raw/final captures, reporter summary and logs. Total model-token estimate for this comparison: USD 0.01270736. Reporting is not invoice reconciliation.

## Why Stage 1 has higher priority

October 11 actual production usage: Stage 1 USD 0.163686785 across 112 calls; Stage 4 USD 0.03900455 across 56 calls. Stage 1 is about 39.3% of all recorded model-token cost. A hypothetical 30% Stage 4 saving is only USD 0.01170 on this run; Stage 1 is the larger optimization target.

Stage 1 input processing cost USD 0.123848285, generation (including reasoning) USD 0.0398385. Input: 1,024,462 tokens; cached reads: 36,531 (3.57%); writes: 987,595. The write premium alone was USD 0.024689875. It is not all removable while preserving useful cache reuse. Image-post calls account for 106 calls and USD 0.160455235; caption-only calls account for six and USD 0.00323155. These are post-kind costs, not a measured split between image tokens and instruction tokens.

The current compact-v10 Stage 1 rules occupy about 13.5k characters before post details for image posts, and 14.4k for caption-only posts. Image count is interpolated around character 7,239, before later stable rules. The Responses request places rules, changing post details and all images in one user message, without a selected explicit cache boundary. Existing usage indicates frequent writes with very little reuse. Character counts are not token counts and do not prove a future hit rate.

## Controlled Stage 1 experiment to do next

1. Start from this accepted October 11 release baseline. Preserve Luna high, all eligibility/rejection guards, source-gallery order, completeness checks, schema and retries.
2. Separate unchanged rules/schema from changing source text, date, venue, attachment count and images. Use a supported explicit breakpoint at the reusable boundary; do not cache each unique gallery merely because it is present.
3. Keep caption-only and image-specific rules explicit; do not omit booking/clinic/public-activity or daily-special protections. First attempt only a transport/layout change, without shortening policy or reducing reasoning.
4. Compare current and candidate on the same reviewed source cohort, with separate cold and cross-post warm groups. Measure input/read/write tokens, output/reasoning tokens, latency, retries and quality. Same-post repeated tests are not proof of cross-post reuse.
5. Review every changed qualification decision, source image description/index and complexity/tiling recommendation before recommending a production release. A cache hit reduces repeated input work; it does not remove new image processing or generation costs. No percentage saving is promised before this measurement.

Official documentation checked October 11: [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Luna cached reads use 10% of ordinary input pricing; writes cost 1.25 times ordinary input. Use API-reported reads/writes and net cost, not the advertised read discount as a full-stage saving.
