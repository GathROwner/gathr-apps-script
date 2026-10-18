# Facebook page activity prefilter trial — October 17, 2026

Completed October 18 at 02:05 UTC (October 17, Halifax). Craig authorized the bounded TopAPI experiment with “Ok try it.”

## Decision

Keep the current production acquisition unchanged. TopAPI is inexpensive, but this trial did not establish a useful combined speed improvement or sufficiently trustworthy quiet-page decisions. No skip rule, provider replacement, schedule or parser change was enabled.

## Exact acquisition contract

- Actor `topapi/facebook-page-posts-scraper`, ID `kiZdaJePboSkd43aZ`; immutable build `0.1.9`, build ID `9bk7YOGQwABySkXsL`.
- Actual paid account verified. API price: `post-scraped` $0.0012; details add-on $0.001, disabled. No start fee. Prices are US dollars.
- Requested and actual memory 512 MB, the actor's published maximum; explicit concurrency 8 (published maximum); explicit Apify RESIDENTIAL US proxy. No assumption of resource parity with the current actor.
- One returned post per Page; no text, type, engagement or total-item filters. Monitor enabled except for the final exact-ID diagnostic. Noncompact output retains source identities for inspection.
- Fixed UTC window October 16 through October 17, inclusive to the actor's advertised end-of-day bound. This is historical live acquisition, not a next-day monitoring test.
- Dedicated stores `gathr-activity-shadow-oct17-015454` and `gathr-activity-full-shadow-oct17-015454`. Actor-internal page watermarks were the only state writes beyond normal acquisition artifacts. Anonymous session contents are excluded from local monitor-state captures.
- Experiment maximum $1.50; every run had a full-depth charge reservation and pinned build, webhook isolation, active-run and launch-intent guards. Unknown launch outcomes must not be retried.

Primary publisher documentation: [README](https://apify.com/topapi/facebook-page-posts-scraper), [pricing](https://apify.com/topapi/facebook-page-posts-scraper/pricing). Fresh authenticated actor/build/pricing readback is saved locally. Publisher claims are not substituted for trial results.

## Completed runs

| Run | Pages submitted / per-page summaries | Delivered post rows | Elapsed including startup | Actual actor charge |
| --- | --- | --- | --- | --- |
| Sample warm `NgFOylCE6JWVz539P` | 24 / 24 | 19 | 9.577 s | $0.0228 |
| Sample repeat `ijHvVxfjWD8Rogp3T` | 24 / 24 | 0 | 4.820 s | $0 |
| Full warm `NL1pyijDNeTpazYol` | 320 / 310 | 107 | 191.877 s | $0.1284 |
| Full repeat `jltFwGANMSTcxRflz` | 320 / 310 | 1 | 88.124 s | $0.0012 |
| Exact-ID diagnostic `dJ3ygl8i9AT8xaqad` | 13 / 13 | 3 | 8.339 s | $0.0036 |

Total actual actor charges **$0.156**. All five runs completed; none remains active. This is actor billing, not an estimated monthly saving.

The sample caught all 16 historically positive control pages. Its four access failures remained separate from quiet pages. The repeat preserved all sample activity timestamps, seen post IDs and page IDs; timestamps recording the check advanced and two cached display names normalized their encoding.

## Why 107 active pages versus the morning's 99

The saved current-provider run `i0cfrfOdZ96dcNpv9`, dataset `2r2EzoHF9PCOcHXHG`, ended October 17 at `12:39:01.446Z`. It returned 156 posts across 99 source URLs; 367 total rows include diagnostics. Its 320-page, three-post-per-page run took 91.042 seconds and charged $1.836.

The later full scout identified 13 additional active source URLs. Every one of those 13 returned a post timestamp after the morning cutoff. Conversely it did not flag five historically positive source URLs. Thus **99 - 5 + 13 = 107**. This is timing-dependent coverage, not proof the new actor finds more than the current one in a matched capture. Exact timestamps are in `additional-active-pages.json`.

The other 221 morning source URLs were never established as all quiet. Failed/unavailable sources must not be inferred inactive from an empty dataset.

## Reliability findings

1. **Two false-quiet candidates in the initial full scout.** Points East Coastal Drive (`1758612622719059`, October 16 20:42:06 UTC) and Port Charlottetown (`1592514236006165`, October 17 10:00:16 UTC) had in-window morning control posts but returned `empty`, zero posts read, and “no public posts in this date window.” Correct page IDs matched the control. No actor-level error exposed these omissions.
2. **The same-window repeat recovered Points East.** It returned the exact previously missed post. Its activity watermark moved from zero to `1792183326`; all other full-repeat activity watermarks/seen IDs stayed stable. This is recovery of an existing post, not a post published between the two fixed-window checks. The first empty answer was unsafe as a skip decision. Port remained empty.
3. **Ten `/p/…` inputs disappeared from the per-page summary.** Eleven such inputs became one submitted `/p/…` summary, for Be You, which returned `not_found`. This strongly indicates an input-handling/deduplication problem for this URL form; the private actor implementation was not inspected. Missing summaries are fallback cases, not quiet successes.
4. **Exact-ID diagnostic.** Numeric IDs were taken directly from the eleven original `/p/…` URLs; Points East and Port IDs were corroborated independently by the control and fresh actor page headers. All 13 numeric inputs received distinct summaries. Be You and Red Shores recovered the exact historical control event IDs `1396785132620208` and `1640530994176767`. The Club returned a post. APM Centre still returned empty despite historical post `1748191810644973`. Two other numeric inputs were unavailable. No live source-list rewrite occurred.
5. **Combined recovery is not single-pass correctness.** Across initial scout, repeat and exact-ID diagnostic, 97 of the morning's 99 positive source URLs can be corroborated; Port and APM remain unresolved. This combination must not be advertised as a 97/99 single-run result or as a production-ready adapter.
6. **Shared-post activity works in the inspected sample.** Souris post `1532702602217650` retained its October 16 outer timestamp, matching the control; the original shared post was October 9. Waterfront post `1118550040924946` retained its October 16 outer timestamp while the original was September 28. This supports activity detection for those shares, not complete shared-original content/media compatibility.
7. **Unavailable pages and latency matter.** Full warm returned 41 `not_found`, 162 `empty`, 107 active and no declared errors. Together with ten omitted inputs, at least 51 submitted URLs require fallback rather than skipping. Eight session rotations occurred. Full warm used 596 requests / 31,538,895 reported wire bytes; repeat used 311 requests / 3,543,224 bytes. Cheap output did not make the full-list repeat instant.
8. **Latest-post guarantee remains unproven.** The Club's `/people/` input returned an October 17 23:19 post in the sample, while the later numeric-ID diagnostic returned an October 17 12:29 post under the same broad window. A one-post response is insufficient proof that the watermark always represents the newest available post.

Pinned posts are a documented publisher limitation, but this trial did not independently prove that pinning caused the particular omissions. Do not assert that root cause from the README alone.

## Limits and next useful work

The combined scout plus full-content pipeline was not run. The current actor's production webhook is enabled; launching a new current-provider control without verified ingestion isolation could start a parser run. No such control was launched. Differences in capture time, depth, resources and proxy make precise speed multipliers inappropriate.

For a future skip implementation, first resolve URL handling and false-quiet responses, then compare against an isolated simultaneous full-content control over several daily cycles. Persist pending full-scrape work before trusting a scout watermark; retry downstream failures regardless of a later quiet scout. Keep failures/missing summaries on fallback and retain overlapping/periodic full checks for edits, pinning and same-time post arrivals. None of these future gates passed merely because a repeated frozen window returned few posts.

Given an 88-second full-list repeat before any full content retrieval, this actor presently lacks a demonstrated speed advantage for Craig's workflow. Further broad paid runs were stopped after this bounded diagnostic.

## Evidence and safety

Artifacts: `functions/artifacts/activity-prefilter-oct17/`: frozen plan, actor/build/pricing metadata, five exact inputs and launch intents, raw rows, run summaries, logs, page-only monitor-state captures, decisions, additional-active timestamps, exact-ID plan, `analysis.json`, `safety-after.json`.

Fresh after-readback at `2026-10-18T02:05:20Z`: all experiment runs terminal, no active TopAPI runs, account webhook routing unchanged. No production actor launch, parser invocation, public event/review/venue/media mutation, new schedule, traffic change, new API key or deployment was performed by the experiment.
