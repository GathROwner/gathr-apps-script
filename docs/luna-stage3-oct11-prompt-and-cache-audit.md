# October 11 Stage 3 prompt and cache audit

## Scope and baseline

Read-only analysis of the completed regular dataset `1w9joG-FJhXFTLKes7T4836iykHoPMZYU`, run `e2f105c9-2f63-4a8b-9045-c676d273a838`. No new paid API calls, live data changes or deployment were made for this audit. Work starts from accepted branch `codex/luna-oct11-integrity-repair`, HEAD `431dd7a`, in the `luna-accounting-release` checkout. Stage 3 source is unchanged from the production accounting baseline `27bf96e`; its SHA-256 is `0e5605243385e634f31faa667937419d7a048797857c0141719b50006e83d70e`.

Stages 1, 2 and 5 caching were subsequently released. The last saved independent serving verification, at 17:47:57.777Z, has common source hash `0678cc45a38a27c4ad4a04a7f947241106a41eb9`. That is a saved readback, not a new live check in this audit. Stage 3 caching is not deployed.

The completed morning run measured Stage 1 at USD 0.163686785 and Stage 3 at USD 0.105678625. Stage 3 may become the most expensive after the new cache layouts, but tomorrow's production usage must establish that ranking.

## Actual production usage

There were 54 Stage 3 posts: two downtown schedules used the existing deterministic parser; 52 posts made 60 extraction calls. Seven extra calls were another Luna extraction after an empty result, and one was the second extractor for a mixed event/special post. These additional extraction passes are not a GPT-5.2 model fallback. Two separate OCR-helper calls are excluded from the main Stage 3 totals below.

| Measure | Run total | Per-call average | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Input tokens, including images | 585,897 | 9,764.95 | 6,540 | 20,694 | 25,090 |
| Output tokens, including reasoning | 64,892 | 1,081.53 | 765 | 3,021 | 4,642 |
| API duration | 559.602 seconds summed | 9.327 seconds | 7.146 seconds | 22.883 seconds | 34.981 seconds |

The sum of API durations is not the full parser's elapsed time. Percentiles use the nearest-rank method on all 60 calls. All 60 response statuses were `completed`. The requested 32,000 output-token cap was substantially above the largest observed output; there is no Stage 3 output-cap exhaustion evidence in this run.

- Cached reads: **0 tokens**.
- Cache writes: **585,717 tokens**, known for all 60 calls.
- Ordinary input: **180 tokens**.
- Estimated input cost: **USD 0.073232625**, 69.30% of Stage 3.
- Estimated output cost: **USD 0.032446**, 30.70%.
- Estimated total: **USD 0.105678625**.
- Separate OCR helpers: 7,784 input tokens, 1,839 output tokens, 16.602 summed seconds, USD 0.00189235.

These use the accepted accounting rates, not invoice reconciliation: Luna ordinary/read/write/output USD 0.10/0.01/0.125/0.50 per million tokens. Writes replace the ordinary input charge for those tokens; they are not charged twice.

### Production measurement limitations

Stage 3 currently saves input/output/cache totals and visible character length, but does not retain `output_tokens_details.reasoning_tokens`. Its exact production reasoning-versus-visible-output split is therefore **unknown**, not zero. Input usage also does not separate written text from image tokens. Do not label the entire 585,897 input as the written prompt or calculate exact image tokens by subtracting an approximate tokenizer count.

Image attachment groups illustrate why prompt size alone is insufficient:

| Attached images per call | Calls | Average total input tokens |
| --- | ---: | ---: |
| 0 | 3 | 1,967 |
| 1 | 34 | 5,987 |
| 2 | 6 | 10,287 |
| 3 | 8 | 16,514 |
| 4 | 3 | 18,098 |
| 5 | 6 | 21,387 |

These are descriptive groups, not a controlled image-token attribution experiment. Captions, routes and image dimensions differ.

### Calls by extraction branch

| Branch | Calls | Input tokens | Output tokens | Summed seconds |
| --- | ---: | ---: | ---: | ---: |
| Events | 37 | 392,948 | 36,472 | 321.720 |
| Specials | 9 | 83,332 | 8,311 | 81.963 |
| Schedule | 5 | 43,230 | 8,629 | 58.702 |
| Calendar | 2 | 11,191 | 8,336 | 61.025 |
| Another extraction after an empty result | 7 | 55,196 | 3,144 | 36.192 |

The highest-input call was Robert McMillan Pottery, row 301: five attached images, 25,090 input and 1,420 output tokens. The slowest/largest-output call was Souris Show Hall, row 292: one image, 5,564 input and 4,642 output tokens, 34.981 seconds. Big input and big output are distinct optimization targets.

## How large are the written instructions?

The retained offline request captures cover the active four main prompt builders and the caption-only event preamble. The following measures describe the reusable text extracted by the earlier cache prototype, excluding its source block and dynamic instruction lines. They do not include images or request overhead. Actual production prompts currently intermingle these rules and source fields.

| Variant | Reusable instruction characters | Words | Approximate text tokens |
| --- | ---: | ---: | ---: |
| Event, images | 10,187 | 1,569 | 2,242 |
| Event, caption only | 11,097 | 1,707 | 2,407 |
| Food/drink specials | 5,780 | 908 | 1,328 |
| Calendar | 7,744 | 1,217 | 1,571 |
| Schedule | 6,636 | 1,021 | 1,482 |

Token estimates use local `tiktoken 0.13.0` with `o200k_base`. That package does not map `gpt-6-luna`; these are explicitly estimates, not exact Luna billing counts. Captured complete written requests, including their captions, ranged from about 1,489 to 2,633 estimated tokens for these main variants. Instructions are substantial, but are not tens of thousands of text tokens per request.

## Concrete prompt problems

1. **Changing source fields appear before most reusable instructions.** All four builders place `CONTENT` early. Event prompts also interpolate the timestamp/timezone into date rules and the posting venue into field instructions later. Simply moving the first caption paragraph does not create one stable prefix.
2. **Event time rules contradict the output contract.** Missing `endTime` is specified as `unknown` in one section and an empty string in another. The start-time rule allows source `none`, but its later enum omits `none`. This should be one consistent contract checked against downstream sentinel handling.
3. **Date guidance is partly inconsistent.** The event prompt forbids using the post date for an undated activity, then says recurring events may use the first occurrence or post date. Weekday, this-week and explicit-date policies must retain their intended source-specific precedence. Do not flatten them into one vague shortened rule.
4. **An impossible preprocessing instruction is embedded in event extraction.** It asks a text/vision extraction request to crop, dewarp, denoise and export a 300-DPI image. No image-editing/export tool is attached to that request. Keep the useful per-region reading instruction; actual preprocessing belongs in the image pipeline.
5. **Repeated reminders increase length without adding new contracts.** Examples include repeated no-invented-end-time rules, duplicate colloquial-time examples, repeated JSON-only instructions, repeated special qualification lists, and schedule fields repeated in both prose and a large output example. Festival exceptions and shared-time-region exceptions are meaningful and must survive consolidation.
6. **Output contracts drift between routes.** Event requests explicitly ask for `ticketLink`; calendar and schedule field lists do not. Calendar venue identity is especially vulnerable when a tour contains separate dated venues. “JSON object with two arrays” is also inaccurate for the event/special envelope, which contains one array and a summary object.
7. **Special qualification has old contradictory restrictions.** A named unpriced daily deal is allowed, while another line excludes all-you-can-eat offers without a price. Calendar special typing also emphasizes explicit price/discount. These need source-backed controls for Craig's policy on separately advertised meals/deals; ordinary stock and month-long menu features remain excluded.
8. **Outputs ask for several prose explanations.** Descriptions, per-item extraction reasons, spatial evidence and overall extraction notes can repeat the source. Keep the precise date/time/location/link evidence that downstream checks use. Do not shorten them blindly or treat hidden reasoning as ordinary explanatory prose.

## Caching architecture to test

Use a stable prefix containing the source-grounding rules, the route's rules and its explicit item/output contract. Put an explicit cache breakpoint after that prefix. Put caption, posting venue, reference dates, gallery metadata and ordered images afterward. Use explicit-only mode and the supported 30-minute TTL, consistent with the accepted Stage 1/2/5 releases.

OpenAI's current [prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) explains why a shared early prefix is insufficient when the implicit breakpoint is after changing content. Explicit-only mode can also avoid cache-writing the unique source/image suffix. Unique galleries should not be assumed reusable across unrelated posts. A cache saves input work; it does not reuse a previous answer or remove new output/reasoning costs.

Use a shared core where the policies actually agree, followed by a compact route contract. Preserve route distinctions and legacy behavior. Keep variable venue/date values solely in the source context and reference them by stable field names inside the rules. Unknown prompt shapes should retain the original request rather than applying a brittle text rewrite. Do not pad a slim prompt merely to reach the cache minimum; compare its actual total cost with the longer cached alternative.

The earlier 12-source paired test already showed feasibility: 15 calls per arm including the unchanged auxiliary OCR helper, 57 extracted items each, USD 0.01511035 versus 0.012562995, or 16.9% lower total cost. Input cost was 41.1% lower. Output varied, so this is an observed total, not a pure cache-only price guarantee. Reasoning represented 57.0% and 51.0% of output tokens in those experimental arms, including the helper; neither percentage is the missing production split.

That candidate remains **held**. On Souris, the candidate repeatedly omitted top-level venue fields while retaining location names in descriptions/spatial metadata. Matching counts did not establish equivalent outputs. The baseline also had date/name/link errors, so the release gate is the poster and accepted contract, not blind baseline equality. The retained audit images are JPEGs and can differ from production preprocessing; the 16.9% experiment is not a forecast for tomorrow's complete run.

## Controlled next steps

1. **Measurement:** Add Stage 3 response ID/status/incomplete reason, reasoning tokens, visible output characters, route/prompt version, prefix hash, prefix/source character lengths and gallery image count to the diagnostics. Preserve unknown historical fields. Never log API keys, full data URLs or hidden reasoning text.
2. **Cache layout only:** Build each main request from explicit stable rules plus separate source context. Preserve existing wording and output policies in this arm. Retain venue/date-rule meaning in the reusable prefix instead of moving complete venue instructions into the source suffix. Compare against the unchanged baseline.
3. **Slim prompt as a separate arm:** Consolidate duplicate rules, remove the preprocessing/export request and reconcile contradictory field guidance. Use one clear output contract per route. Target a measurable reduction, rather than promising a percentage before testing. Keep Luna high and image preprocessing/detail/order unchanged.
4. **Quality controls:** Cover Souris tour venues/dates/ticket links, caption-only booking/clinic/registration, all named performers, shared date/time blocks, dense schedules, sparse calendar dates, weekly versus finite occurrences, prepaid series/festival grouping, named unpriced specials, preorder windows, multiple galleries, relevant image indices, and explicit empty/missing time behavior. Preserve weekday prefixes needed by existing date correction.
5. **Full replay:** Freeze all 54 Stage 3 sources from the completed run, record both deterministic no-call controls, and use every complete available original gallery. The audit could not re-download rows 81/82; preserve their unavailable-source status and report the missing visual coverage. Add previous retained dense/source controls rather than silently substituting caption-only data. Reconcile inventory and every important field, not just counts; repeat any discrepancy against the source.
6. **Downstream validation:** Run both extraction outputs through the existing Stage 4/5 and venue/link resolution dry-run paths for every meaningful difference, particularly tour venues. A Stage 3 code change does not itself repair existing live documents.
7. **Release gate:** Require no unexplained source-identity, date/time/recurrence, venue, link, price, gallery or inventory loss; compare actual total cost, reasoning, retries and API latency. Deploy only after the candidate passes and the exact release is approved. No reasoning-effort reduction is part of this experiment.

## Reproduction and evidence

`functions/scripts/stage3-prompt-usage-audit.mjs` makes no network calls and imports no writer modules. It correlates response records with timing and row identity within each execution, checks that correlations are within one second, verifies all 60 main/two OCR call counts and token totals against the frozen usage summary, and verifies per-row call counts against the ledger. It refuses to overwrite an existing audit directory.

Results: `functions/artifacts/luna-stage3-prompt-audit-oct11/analysis.json`, `production-call-ledger.json`, `prompt-texts.json` and `text-token-estimates.json`. Existing paired/repeat quality evidence: `functions/artifacts/luna-stage3-cache-oct11-{paired,repeat}/`. Source production evidence: the sibling `luna-pilot-release` checkout's `artifacts/luna-oct11-production-audit/`.

The local tokenizer output is a supplementary estimate; the audit's production totals and percentiles use the actual saved API usage. No new extraction-quality claim is made from offline replay or statistics alone.
