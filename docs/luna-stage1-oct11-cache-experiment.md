# October 11 Stage 1 explicit-cache experiment

## Scope and baseline

Craig authorized a test of the Stage 1 caching recommendation. This experiment uses the accepted `codex/luna-oct11-integrity-repair` baseline after `46b4c1d`. No runtime source, production prompt, allocation, traffic, database or media record changed. Stage 1 stays Luna high in both arms.

The test harness calls the existing compiled `validateContentForStage1Evaluation`, using compact-v10, the deployed `source-menu-guards`, current normalization and output-limit retry logic. Its client intercepts only the Responses request. The network client permits only `https://api.openai.com/v1/responses`, has a USD 1 conservative spend cap per suite and disables opaque SDK retries. No database or media writer is imported. Raw responses, request hashes, source-image hashes, attempts and normalized results are saved under ignored `functions/artifacts/`.

## Candidate request layout

The baseline sends the current single user-message text plus ordered images. The candidate keeps the same user role, all policy wording, the complete schema hint, post text/date/venue, attachment-count instruction, image detail/order/bytes, reasoning high and output limits. It moves the changing attachment-count instruction and post details after the unchanged rules and schema hint. The unchanged text block has `prompt_cache_breakpoint: {mode: "explicit"}`; the request uses `prompt_cache_options: {mode: "explicit", ttl: "30m"}`. Changing post content and images are processed at the ordinary input rate, without cache writes.

Offline checks verify all nonempty text lines and their multiplicity are preserved, attachment counts 0/1/3/5/16, same image prefix across counts, distinct caption-only booking protections, unchanged image order and failure on unexpected prompt layout. Every paired call verifies matching source/rule/schema hashes. No new `prompt_cache_key` is used.

## Initial reviewed cohort: complete

Twelve October 8 frozen source-truth fixtures plus fourteen October 11 reviewed sources: **26 posts, 48 source images, 52 actual API calls**. Both arms use the complete saved gallery; this includes five-image sources and is not an exact reproduction of production's initial four-image pass. October 11 images are the audit's JPEG encodings of downloaded source galleries, not necessarily production's resized/WebP payload. Both arms receive identical bytes. These limits matter when extrapolating token use to a whole production run.

| Measurement | Current layout | Explicit static prefix |
| --- | ---: | ---: |
| Correct reviewed qualification decisions | 26/26 | 26/26 |
| Completed calls | 26/26 | 26/26 |
| Input tokens | 110,187 | 110,161 |
| Cached read tokens | 0 | 78,249 |
| Cache write tokens | 110,109 | 6,631 |
| Input cost, USD | 0.013771425 | 0.004139465 |
| Output cost, USD | 0.008324500 | 0.008254500 |
| Total estimated cost, USD | 0.022095925 | 0.012393965 |
| Summed model-call seconds | 182.672 | 178.068 |
| Median call seconds | 5.389 | 5.632 |
| P95 call seconds | 16.620 | 14.380 |

**43.9% lower total estimated token cost; 69.9% lower input cost.** Summed latency was only 2.5% lower and the median was higher, so this does not establish a useful speed improvement. Output/reasoning use was similar: 16,649/6,409 versus 16,509/6,368 tokens. The cost gain primarily comes from input reuse and avoiding unique-input write premiums.

The first image and caption requests were measured cold. Image prefix: 3,242 tokens; caption prefix: 3,389. The following **21/21 image posts and 3/3 captions** reused their prefix without new writes. No separate paid prewarming or same-post repetition was used to establish this initial cross-post result. Total paid-model estimate for both arms: USD 0.03448989.

All images had exactly one populated analysis entry at the correct index; no errors, incomplete responses, no-image fallbacks or output-limit retries occurred. Calendar detection and explicit tiling recommendations were unchanged. The pure deployed dense-frame selector returned the same indices on all 26 pairs.

Image metadata is not byte-identical. Candidate differences included recognizing two PEERS session blocks and the two Frozen in Time showtimes as multiple listings, marking the PowerSkating date table dense, and calling the road-closure graphic non-promotional. Original PEERS/Frozen images were visually checked. Both arms omitted Art Buds/address text from brief Summerside summaries; a candidate dessert-photo description used "chocolate-colored pie" and failed a literal "chocolate pie" cue despite describing the same image. Frozen cue expectations were retained, not rewritten to manufacture a pass. No source identity or qualification loss was established by those checks. This is a Stage 1 experiment, not a Stage 2–5 inventory replay.

Evidence: `functions/artifacts/luna-stage1-cache-oct11/{plan,cohort,summary,analysis}.json`, `results.jsonl`, `requests.jsonl` and `response-*.json`.

## Broader October 11 screen

The next suite evaluates each of the **101 unique October 11 sources with a complete available cached gallery**, covering 183 images. Duplicate source IDs are evaluated once using the latest captured ledger entry. Rows 81/82 are excluded for unavailable original-image evidence; they are not converted to caption-only cases. This screen compares fresh baseline and candidate decisions, with source review required for differences; prior production decisions are not treated as ground truth.

Fourteen sources were also in the initial suite. Earlier exact-request cache warming can make those baseline calls cheaper, so both the whole screen and the 87 sources not in the initial suite must be reported separately. The candidate prefix is already warm from the initial suite. This is not a second cold-start benchmark. Exact same-post retries can benefit more from the baseline's whole-message cache than from static-only caching; the candidate trades that benefit for lower cost across new posts.

### Completed full screen

All **101 paired sources / 202 API calls completed**, with **101/101 qualification decisions agreeing** between layouts. All 183 supplied images had complete indexed analysis in each arm. No failed or incomplete Responses calls, output-limit retries, no-image fallback, or coverage failures occurred. These 101 sources are a parity screen, not 101 independently scored ground-truth cases; the reviewed 26-case suite above is the scored quality check.

| Measurement | Current layout | Explicit static prefix |
| --- | ---: | ---: |
| Estimated input cost, USD | 0.046248455 | 0.012685240 |
| Estimated output cost, USD | 0.031576000 | 0.031375000 |
| Estimated total cost, USD | 0.077824455 | 0.044060240 |
| Input tokens | 422,445 | 422,344 |
| Cached read tokens | 56,953 | 328,324 |
| Cache write tokens | 365,189 | 0 |
| Output / reasoning tokens | 63,152 / 23,892 | 62,750 / 23,858 |
| Summed model-call seconds | 647.402 | 664.667 |
| Median call seconds | 5.603 | 6.001 |
| P95 call seconds | 13.667 | 12.969 |

**43.4% lower total cost; 72.6% lower input cost.** Cached reads covered 13.5% versus 77.7% of input. The candidate reused its previously measured prefix on all 101 calls with zero new writes. It was **2.7% slower** in summed model time and had a slower median; there is no established speed benefit. Paired calls ran concurrently, so summed call time is not wall-clock suite duration or end-to-end parser time.

For the **87 sources not present in the initial suite**, total cost was USD **0.073606725 versus 0.038989980**, a **47.0% reduction**. Input cost was USD 0.045674725 versus 0.011124980, a 75.6% reduction. Summed time was 570.766 versus 583.582 seconds, 2.2% slower. This subset avoids warming from the initial suite, but cannot rule out earlier provider-cache state. The combined two-suite model estimate is **USD 0.156374585 for 254 actual calls**. Fourteen posts appear in both suites; there are 113 unique tested source cases overall.

### Source review and routing caveats

Two decisions changed relative to the original production observation, identically in both fresh arms:

- **Local Pub row 66:** the caption and poster advertise weekend brunch, Saturday/Sunday 10 a.m.-2 p.m. Both fresh arms rejected it as routine service without a special. Today's audit retained the existing brunch listings, so this exposes a shared qualification inconsistency worth a separate focused policy check. It is not evidence that the cache layout caused a rejection, and the existing live brunch records were not changed.
- **Eastern Kings row 235:** a spectator conduct warning with a bin of cans. Both fresh arms correctly rejected it as a notice rather than an invitation. Production Stage 1 accepted it but Stage 2 rejected it; there was no downstream event to repair.

Twelve sources had at least one changed image-complexity boolean. Most were promotional-photo/density/multiple-listing labels, with no changed qualification. Row 228's ordinary flavour board gained a tiling recommendation but remained rejected, so it cannot trigger downstream tiling. The pure deployed dense-frame selector changed on two sources:

- **HarvestFest row 64:** baseline selected frame 0, candidate none because density moved from 0.68 to 0.58. The recorded content type was EVENT, so the CALENDAR-specific inventory-audit branch would not apply under that recorded route. Both retained dense/multiple-listing/tiling flags. This conditional check is not proof of a fresh Stage 2 route.
- **Souris row 292:** baseline selected no dense frame, candidate selected frame 0. Its recorded type was CALENDAR. The original image was visually reviewed: a performance poster with a compact Maritimes tour-date list, including October 24 at Souris. Both accepted the show and read the correct Souris date; the candidate adds an inventory audit rather than removing one. Its calendar-grid boolean is a coarse layout judgment, not proof of literal physical cells.

No qualification regression attributable to the cache layout was found. Metadata is not deterministic, and no fresh end-to-end Stage 2-5 replay was performed. The output should not be described as identical or the broad screen as proof of zero missed events.

## Recommendation and release boundary

Proceed next with a narrow Stage 1 request-layout implementation using the tested static boundaries, preserving Luna high, every qualification rule, all source fields, ordered images and current failure holds. Keep this separate from policy changes or Stage 4 model work. Before release, exercise the actual request builder and the routing-sensitive HarvestFest/Souris controls; record the shared brunch inconsistency as separate policy work. Retain per-call cache reads/writes, source-kind coverage and decision review in the next full parse audit.

This turn completed only the experiment and evidence. No production deployment, parser allocation change, prompt-policy change, event write/delete or image mutation occurred. Production token savings must be measured after deployment because gallery encoding, retries, source mix and downstream audit choices can change the result.

Evidence: `functions/artifacts/luna-stage1-cache-oct11-full/{plan,cohort,excluded,summary,analysis}.json`, `results.jsonl`, `requests.jsonl`, and `response-*.json`. Harness: `functions/scripts/stage1-cache-experiment.mjs`; paired reporter: `functions/scripts/stage1-cache-report.mjs`.

## Pricing and source references

Estimates use API-reported input/read/write/output counts and standard Luna USD rates per million: ordinary input 0.10, cached reads 0.01, writes 0.125, output 0.50. Ordinary input is input minus reads minus writes; write input is not charged twice. Prices were checked October 11 against the official [Luna model page](https://developers.openai.com/api/docs/models/gpt-6-luna) and [prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching). Estimates are not invoice reconciliation. No whole-run saving or speed percentage is promised from the selected cohort.
