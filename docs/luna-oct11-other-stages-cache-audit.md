# October 11 caching audits: Stages 2-5

## Decision and production state

Craig approved the tested Stage 1 cache implementation and similar audits of the other four stages. Stage 1 is released at source commit `1fceb8d`; independent readback confirmed common serving hash `c6f04a6761d3129fc2b0399f3a77d84ad9a9afd7` and unchanged model, reasoning and allocation flags. See [Stage 1 release](luna-stage1-oct11-cache-release.md).

**Only Stage 1 caching was deployed.** The four candidates below are local, API-only experiments. The first next candidate worth pursuing is Stage 5, with a full formatting-cohort quality check before release. Stage 2 needs routing stability checks; Stage 3 needs structured venue preservation; Stage 4 has no convincing total-cost advantage and failed two repeat validation contracts. None is recommended for immediate deployment from these results alone.

## Experiment design and limits

- Actual compiled production functions, frozen October 11 source captions and complete available galleries. Both arms receive identical image bytes and order. Saved audit JPEGs may differ from production WebP/resized bytes, so these token estimates are not whole-run forecasts.
- Stage 2: Luna none, with the existing Luna high negative review. Stage 3: Luna high. Stage 4: GPT-5 nano low. Stage 5: Luna none. No model or reasoning changes.
- Each stage is tested independently. Stage 3 output is not chained into Stage 4, nor Stage 4 output into Stage 5. Stage 4 uses repaired frozen Stage 3 items where available; Stage 5 uses the captured production Stage 4 items. In particular, the latter contains only the two farm-visit items for row 332, so Stage 5 parity cannot prove the separately advertised market was recovered.
- Stage 4 row 20 has the two frozen repair items (Rat Tales and Karaoke), rather than the full 19-item downtown list. Stage 3's same source uses the existing anchored schedule parser, which returns all 19 without an API call. Stage 5 formats all 19 captured items.
- Two arms run concurrently per source, sequential source pairs, separate processes per stage. Call sums are not wall-clock parse time. Small samples, output variability and provider cache routing prevent a general speed guarantee.
- Request transformations preserve every nonempty rule/source/schema line and its multiplicity, the user role, image payload, output limits and reasoning. Stage 2 changes only a positional reference from “present above” to “present in CONTENT” because the content block moves below the rules.
- API transport permits only the OpenAI Responses endpoint, saves raw responses/usage, and imports no database/media writers. A per-stage USD 2 cap and request caps prevent unbounded paid replay. No GathR records, queues, model allocations or traffic were changed by these experiments.
- The initial Stage 2 harness used default score-routing flags. Its model requests are valid, but its provisional effective routes were not production routes. The analysis recomputes routing from the saved responses and the independently read serving environment; no new API calls or rewritten raw evidence are involved. The retained harness now loads that environment before execution. Model raw routes are retained separately.

## Candidate layouts

| Stage | Candidate |
| --- | --- |
| 2 | Static classification rules and schema first; changing CONTENT and ordered images after an explicit Luna breakpoint. |
| 3 | Separate stable prefixes for event, special, mixed caption, schedule and calendar prompts; changing CONTENT, derived date/timezone and venue-specific lines after the boundary. Auxiliary OCR requests remain unchanged. |
| 4 | Stable validation rules first; CURRENT CONTEXT and ITEMS afterward. Nano uses implicit caching with a stable `prompt_cache_key`; no unsupported explicit-breakpoint option is added. |
| 5 | Stable formatting rules/schema first; changing context, batch counts, venue-specific lines and complete indexed items afterward. Explicit Luna breakpoint. |

Luna candidate requests use explicit cache mode and a 30-minute TTL. The mechanism follows [OpenAI's prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching). This audit measures actual reported cached reads and writes; merely adding a cache key is not treated as a cache hit.

## Initial paired results

All 137 actual initial API calls returned HTTP 200 and completed responses; no transport errors or incomplete responses occurred. Application-level guards are checked separately below. The 12 Stage 3 post pairs include one zero-call deterministic source; they are not 24 API calls.

| Stage | Paired posts | API calls, baseline / candidate | Estimated USD, baseline / candidate | Total cost change | Summed seconds, baseline / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 18 | 22 / 21 | 0.007787850 / 0.004592520 | 41.0% lower | 72.642 / 85.261 |
| 3 | 12 | 15 / 15 | 0.015110350 / 0.012562995 | 16.9% lower | 161.462 / 152.643 |
| 4 | 15 | 15 / 15 | 0.009597600 / 0.010030800 | 4.5% higher | 92.136 / 117.185 |
| 5 | 15 | 17 / 17 | 0.011985850 / 0.008903470 | 25.7% lower | 95.439 / 89.705 |

Stage 2 had one fewer high negative review in the candidate arm; the total comparison includes that actual difference. It is not a per-identical-call estimate.

| Stage | Input USD, baseline / candidate | Cached read tokens, baseline / candidate | Cache write tokens, baseline / candidate | Output tokens, baseline / candidate | Reasoning tokens, baseline / candidate |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.005534350 / 0.002215520 | 0 / 23,427 | 44,222 / 2,466 | 4,507 / 4,754 | 1,475 / 1,888 |
| 3 | 0.004286350 / 0.002524495 | 0 / 13,127 | 32,270 / 9,045 | 21,648 / 20,077 | 12,338 / 10,242 |
| 4 | 0.002064800 / 0.000941600 | 0 / 24,960 | 0 / 0 | 18,832 / 22,723 | 4,992 / 6,016 |
| 5 | 0.005564850 / 0.001957970 | 0 / 28,192 | 44,478 / 1,762 | 12,842 / 13,891 | 0 / 0 |

All initial calls reported cache-write coverage explicitly, including Nano's zeros. USD uses the same standard estimates as the accepted accounting release: Luna ordinary/read/write/output at 0.10/0.01/0.125/0.50 per million tokens; Nano ordinary/read/output at 0.05/0.005/0.40. Ordinary input excludes cached reads and writes to avoid double charging. These are API-usage estimates, not invoice reconciliation.

## Quality findings and repeat controls

### Stage 2: savings, but routing still needs work

All 18 pairs agreed on classification confidence passing versus holding; two held sources were the ordinary annual retail sale (157) and rink conduct notice (235). The retrospective book-launch source (278) was classified EVENT by both arms and explicitly described as a recap; this is a forced independent Stage 2 control, not proof it should pass the complete pipeline.

Four effective extraction routes differed even after production score routing was applied:

- **Harvest Fest, row 64:** EVENT / one item versus SCHEDULE / seven. The gallery actually contains timed festival activities, but a schedule route may split a festival differently. Neither label alone establishes downstream inventory correctness.
- **Founders hockey, row 65:** SCHEDULE versus EVENT; both estimate two games. Caption and ordered images identify Bruins/Flyers at 2 p.m. and Oilers/Sharks at 5 p.m.
- **Local Pub brunch, row 66:** EVENT versus FOOD_SPECIAL. The caption explicitly advertises Saturday/Sunday brunch, 10 a.m.-2 p.m.; it must remain in scope regardless of label.
- **Tipsy Farmers, row 120:** FOOD_SPECIAL versus MIXED_EVENTS_AND_SPECIALS. The usable offer is the dated dine-in turkey buffet, 4:30-6:30 p.m.; ordinary restocking and preorder pickup must not become extra events.

Four-source fresh repeat: routes converged for Harvest and brunch, but hockey and Tipsy still differed. This is evidence of output variability, not proof that caching alone caused every difference. Before release, replay both routes downstream and verify the actual advertised inventory, especially festival bundling and ordinary-stock exclusion. The current change is **held**.

### Stage 3: inventory counts match, structured venues do not

Both arms returned 57 items across 12 sources, including all four farm/market occurrences and nine hockey-camp slots. Names, price representations and some venue/time fields differed. Candidate Nick Hoben retained the explicit 7-10 p.m. end time that the first baseline fresh read omitted.

The **Souris tour poster, row 292**, is the strongest reason to hold this candidate. Both reads found 11 tour stops, but the candidate omitted the top-level `venue` field throughout; names remained in descriptions and `spatial.locations`. The same omission repeated. A downstream venue resolver cannot be assumed to reconstruct equivalent identity from those fields. Both arms also omitted a direct ticketLink on this calendar read; the first baseline spelled one Miramichi venue differently from the poster. The candidate correctly read October 27 for Lower Granville while baseline read October 26 in both fresh reads. These mixed results require a source-backed contract check, not automatic preference for baseline.

The original retained poster was visually inspected, including its printed October 24 Souris and October 30 Charlottetown stops. No new live venue or event correction was made. Auxiliary OCR calls and their costs are included but their request layout is unchanged. The current Stage 3 candidate is **held** pending structured venue and ticket preservation.

### Stage 4: cache hits do not establish a useful total saving

Initial 15 pairs returned the same 44 retained item records on the audited identity/date/time/price/recurrence projection. Candidate input cost was 54.4% lower, but greater generated output made its total cost 4.5% higher and summed model time 27.2% higher.

The full 15-source repeat found two candidate application-level failures despite HTTP-completed responses:

- **Clamdiggers, row 127:** malformed JSON, `_validationFallbackReason=parse_error`.
- **Souris, row 292:** only one validation entry for 11 inputs, `_validationFallbackReason=response_count_mismatch`.

Existing guards preserved raw items rather than trusting either malformed or partial inventory. The repeat baseline returned one retained Souris item, rejecting others for missing required start times; the first baseline had retained all 11. Candidate fallback retained all 11. Therefore the 1-versus-11 repeat result is not a successful cache comparison or a claim of ten correct new events. Only the source-enriched Souris stop has the explicit 19:30 time in the frozen Stage 4 input.

Repeat total cost was lower for the candidate, but its invalid validation outputs make that an unsuitable success benchmark. Leave Stage 4 caching unchanged; it is a lower priority than the Luna stages.

### Stage 5: best next candidate, still needs full-cohort validation

Initial 15 pairs returned 42 final records each. All 17 calls per arm passed the existing batch count/source-identity safeguards, with zero reasoning tokens and no smaller-batch recovery. Three development-camp weekly parents represent the nine supplied occurrences in both arms; equal final counts are not being confused with one object per expanded occurrence.

Nine sources matched the full audited field projection exactly. The remaining differences included same-day endDate versus blank, title capitalization, same-venue fields blank versus repeated, categories, and image indices. For the camp and farm, `establishment` stayed correct even when `venue` was blank; those are not established wrong-venue writes. On the downtown source, candidate used the supplied generic downtown image where baseline returned -1 for several events; the original image contains a downtown/scarecrow banner, not individual event text. Provenance behavior still merits an explicit contract check.

Three-source repeat (downtown, hockey camp, farm) preserved counts and all batch identities again. Camp categories repeatedly differed: Workshops & Classes versus Sports. Downtown theatre/meditation categories also varied. The cached layout is promising, but should be checked against accepted category rules and the complete formatting cohort before rollout. Missing market items in the frozen production farm input cannot be repaired by a formatting-only cache experiment.

## Repeats, cost and reproducibility

The repeat suites made 58 actual calls: Stage 2 four sources / eight calls, Stage 3 three / ten, Stage 4 fifteen / thirty, Stage 5 three / ten. Every repeat HTTP response completed; the two Stage 4 contract failures above were caught after decoding.

**195 paid API calls total, estimated USD 0.121356805**, across all four initial audits and repeats. No extra paid warmup was used. Repeats are quality controls, not cold cross-post benchmarks: baseline exact requests can reuse the entire earlier message, while a static-only candidate still pays ordinary input for changing source blocks. For example, the Stage 5 three-post repeat cost more in the candidate despite its initial cross-post saving. Do not combine repeat costs to claim a universal production saving.

Retained tools:

- `functions/scripts/cache-stage-audit.mjs` — offline request-contract capture or explicit `--execute`; optional `--repeat`; refuses automatic overwrite/replay.
- `functions/scripts/cache-stage-audit-report.mjs` — aggregates raw usage, guards and identity-field differences; corrects Stage 2 score routing using serving readback without new API work.

Raw evidence: `functions/artifacts/luna-stage{2,3,4,5}-cache-oct11-{paired,repeat}/`, including cohort/source hashes, raw `response-*.json`, `results.jsonl`, `summary.json`, and `analysis.json`. Offline captures are separately named and never counted as API work. Stage 1 deployment evidence is separate. The accepted runtime change remains only Stage 1.

## Recommended sequence

1. Measure the deployed Stage 1 cache on the next regular parse; the preceding 101-source experiment measured 43.4% lower Stage 1 token cost, with no established speed improvement.
2. Validate Stage 5 static-prefix formatting against the full accepted cohort, including source indices, occurrence expansion, ticket links/prices, image indices and category consistency. This is the next worthwhile caching release candidate.
3. Validate Stage 2 route changes through extraction before deploying its static-prefix layout.
4. Keep Stage 3 unchanged until structured venue/ticket identity is stable under its prompt variants.
5. Defer Stage 4 cache changes; output cost and validation reliability dominate its small input-cache opportunity.
