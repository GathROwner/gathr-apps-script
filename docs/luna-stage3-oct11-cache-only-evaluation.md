# Stage 3 caching-only evaluation — October 11, 2026

## Decision

**Hold this experimental request layout. Do not deploy it.** The full available cohort demonstrated shared-prefix cache reads and lower estimated input cost, but repeated source-grounded extraction differences prevent a quality pass. Prompt cleanup, wording changes, reasoning changes and production deployment were not part of this experiment.

The source baseline is checkout `codex/luna-oct11-integrity-repair`, commit `e3354b4`, in `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`. This experiment adds standalone scripts only. No production parser module, live event, queue or traffic configuration changed. The last saved production readback is documented in the accepted Stage 2 cache release; this experiment did not perform a fresh serving readback and does not assert a new live revision.

## What was changed in the experimental request

- Retain every original nonempty instruction line exactly once, with identical wording and multiplicity.
- Move reusable rules ahead of the changing source context. Move the **entire** item field list, including its interpolated venue instruction, together into the source suffix. Keep timestamp instructions verbatim in that suffix.
- Set an explicit cache breakpoint after the reusable text, with explicit-only caching and a 30-minute TTL.
- Preserve Luna high, the 32,000 output-token cap, request schema/settings, original source caption, JPEG image bytes, image order and high detail between each pair.
- Leave auxiliary OCR requests without the recognized CONTENT block unchanged. Short fallback prefixes were not padded to obtain cache reads.

Changing instruction order can change model behavior even when all words are preserved. The assertions prove request preservation; they do not prove extraction equivalence. The field list now follows some output-format instructions that originally followed it. This remains a possible cause to investigate, not an established diagnosis.

Implementation: `functions/scripts/stage3-cache-layout.mjs`. This is a test transport transformation, not a production request builder or deployed feature.

## Coverage and method

Frozen completed dataset: `1w9joG-FJhXFTLKes7T4836iykHoPMZYU`, run `e2f105c9-2f63-4a8b-9045-c676d273a838`.

- 54 original Stage 3 sources; 52 had complete available galleries or were genuinely caption-only.
- Excluded rows 81/82, posts `1703280601801849` / `1702971805166062`: unavailable original galleries. They were not relabeled as caption-only.
- Available cohort: 50 image-bearing sources, 100 attached images, two caption-only sources (37/234).
- Routes: 36 EVENT, eight FOOD_SPECIAL, six SCHEDULE, one MIXED_EVENTS_AND_SPECIALS, one CALENDAR.
- Deterministic downtown schedule rows 20/22 produce 19/41 items per arm without API calls; include them as request-path controls, not model-quality evidence.
- Interleaved baseline/candidate arms, bounded concurrency four, no dummy warmup requests. Previously authorized GathR API key was loaded into process environment from Secret Manager and cleared afterward; no credential was written to an artifact.
- API-only fetch allowlist. No Firestore, updater, uploader or live-writer imports. Calls, raw visible responses, actual usage/cache fields, reasoning counts, status, latency, source hashes and results were retained locally.
- Guard: three sources, ten API calls. Full: 52 pairs, 121 API calls. Discrepancy repeat: eight pairs, 19 API calls. Total paid testing: 150 calls, estimated USD **0.136116605** across both arms, including auxiliary OCR.
- Three offline contract tests passed across all 52 sources. Offline response stubs only prove request construction and preservation, not quality or API latency.

The saved JPEG galleries are identical between experiment arms but can differ from production-preprocessed image bytes. These measurements are a controlled replay, not a forecast of complete production-run cost or wall time.

## Full-cohort measured result

Estimated USD uses the existing Luna defaults: ordinary input $0.10/M, cached reads $0.01/M, cache writes $0.125/M, output $0.50/M. Cache-write tokens are API-reported and known for all measured calls; ordinary/write/read tokens are charged separately. Output includes reasoning. This is an estimate, not invoice reconciliation.

| Metric | Unchanged baseline | Cache layout |
| --- | ---: | ---: |
| Sources | 52 | 52 |
| Actual calls, including unchanged OCR | 61 | 60 |
| Input tokens | 165,317 | 165,654 |
| Cached read tokens | 8,058 | 74,852 |
| Cache-write tokens | 153,620 | 1,643 |
| Output tokens | 62,456 | 72,428 |
| Reasoning tokens, included in output | 36,299 | 42,905 |
| Input cost | $0.019646980 | $0.009869795 |
| Output cost | $0.031228000 | $0.036214000 |
| Total cost | **$0.050874980** | **$0.046083795** |
| Summed API seconds | 521.605 | 593.749 |
| Raw extracted items | 149 | 156 |
| HTTP/response/incomplete errors | 0 | 0 |

Observed input cost fell **49.8%**, total cost fell **9.4%**, and summed API time **increased 13.8%**. Additional output/reasoning offset part of the input savings. Item counts differ, so total cost is not the price of an identical correct inventory.

The guard ran shortly before the full comparison and warmed shared candidate prefixes as well as exact baseline requests for rows 37/234/292. Excluding those three sources: 49 sources, baseline/candidate 56/55 calls, input cost $0.019515600/$0.009497125 (**51.3% lower**), total $0.043973100/$0.037450625 (**14.8% lower**), summed 428.993/486.062 seconds (**13.3% slower**). Baseline cache reads in this subset were zero; candidate reads were 69,475. Candidate shared prefixes still benefited from the earlier legitimate guard requests. Neither subset is a cold-cache production simulation.

Main Stage 3 excluding the unchanged OCR helper: baseline/candidate 60/59 calls, 164,821/165,158 input, 58,915/68,631 output, 33,007/39,357 reasoning, cost $0.049054880/$0.044135695 and summed 494.988/569.177 seconds.

### Shared prefix evidence

| Variant | Prefix characters | Full candidate calls | Calls with cache reads |
| --- | ---: | ---: | ---: |
| Food specials | 4,621 | 9 | 9 |
| Event with images | 7,572 | 36 | 35 |
| Event caption-only | 8,482 | 1 | 1 |
| Schedule | 5,267 | 4 | 4 |
| Calendar | 6,722 | 1 | 1 |
| Short fallback | 2,037 | 8 | 0 |

The remaining candidate call is unchanged auxiliary OCR. Avoiding cache writes for the unique source/image suffix contributes to the input savings alongside shared-prefix reads. Caching did not reduce input token counts, reuse old answers or eliminate output/reasoning work.

## Source-grounded quality review

All 52 pairs were compared for inventory, title, date/time, recurrence, effective venue, price/pricing, ticket link, image index and spatial structure. Important differences were checked against captions and original retained images; this was not a second exhaustive visual audit of every image in every accepted gallery. Prose/evidence wording differences are review targets, not automatically defects. Actual source evidence takes precedence over frozen production output or baseline equality.

| Source | Evidence and result | Assessment |
| --- | --- | --- |
| Clam Diggers, row 127, post 1952258282834780 | Caption and poster explicitly offer $35 Thanksgiving dinner **Saturday and Sunday**. Baseline returned Oct 10/11 in both full and repeat. Candidate returned only Oct 10 in both, with `recurringPattern=none`; Sunday remained only in description. | **Repeated candidate inventory loss; release blocker.** A description mention is not a dated occurrence. |
| Tipsy Sunday, row 120, post 1135515799005452 | Buffet is Oct 11, 16:30–18:30. Preordered pickup at 14:00 and ordinary Grab n Go restock are supporting logistics/stock. Full candidate returned all three as specials; baseline only buffet. Repeat reversed that behavior: candidate only buffet, baseline three. | Existing model variability in both layouts; no basis to attribute this solely to caching. No quality pass based on counts. |
| Tipsy Saturday, row 121, post 1134654075758291 | Source says venue “Open till 8pm,” then soup of the day and $24 brisket burger. Candidate assigned 20:00 end times in full and repeat; baseline left both empty in both. No separate printed serving end time. | **Repeated candidate venue-hours attribution risk.** Do not call this a newly invented numeric time: the issue is attributing a printed business closing time to each offer. No downstream serving-time proof was obtained. |
| Souris tour, row 292, post 1740954254704708 | Poster lists 11 tour dates; Lower Granville is Oct 27. Candidate retained all 11 top-level venue fields in guard/full/repeat, resolving the older candidate's structural omission. Full baseline read Oct 26 while candidate read Oct 27; repeat reversed them. Tiny Oct 23 venue text remained uncertain. | Venue-field preservation improved, but **date variability remains in both arms**. Identical counts do not prove correct dates. The caption's Zeffy link advertises Fredericton; do not assign it to every tour stop. |
| Toby's, row 76, post 1722999493168176 | Caption promotes corn maze, slide and fun park all Thanksgiving weekend including Monday. Full baseline returned three Saturday items; candidate nine activity/day items Oct 10–12. Repeat baseline returned nine; candidate grouped the three attractions into one item per day. | Source supports the weekend dates. Grouping/multiplicity varies; not six invented events. Requires downstream inventory comparison before release. |
| Noodle Guy, row 32, post 1626636658917907 | Image 3 explicitly says “Student discount Wednesdays 15%.” Full candidate dated Oct 14, baseline Oct 10. Repeat reversed dates; both use nonrecurring output. | Baseline/candidate weekday variability. Source does not justify a Saturday discount. Do not treat baseline equality as truth. |
| Soul Fit, row 217, post 122282191970151845 | Image is Box Fit photos without date/time. Full baseline supplied Oct 9; candidate left date empty. Repeat both left date empty. | Candidate's empty date is safer; no confirmed dated occurrence to require. |
| Stratford food drive, row 315, post 1565233575638164 | Oct 17, 09:00–14:00; image 1 lists four drive-through collection locations. Both arms retain all four in structured `multi_location`; candidate also concatenates them into top-level venue. | Spatial inventory retained; writer handling of concatenated venue not validated. Do not invent a single host venue. |

Other controls retained: all nine hockey-camp slots and three age groups on Oct 13/20/27; Nick Hoben Oct 10 19:00–22:00 and four named pub specials; Seaside Oct 12 public clinic 09:00–16:00; all four College of Piping shows with correct source indices; Emily St John Mandel Oct 22 19:00 with both $20/$45 options and exact ticket URL; Capitals Oct 10 19:00 with ticket link and no 18:00 gate-opening substitution; Charlottetown Farmers' Market access, Stratford council meeting fallback, Island Hill farm and free-entry vendor market on both weekend dates, and weekly Evermoore Saturday Session. Ordinary Pearl Sauna booking remained empty. Budley's $29.99 is printed in the image. Inn at Bay Fortune's image-index change selects another actual source photo; neither arm invented a date for undated Chefs' Harvest.

The earlier guard's 25/25 retained items did **not** establish field-level correctness; its venue/date/qualification observations are superseded by the full/repeat evidence above. No live event was modified or diagnosed as wrong solely from this replay. The Stage 3 harness does not run production website/time enrichment, venue resolution, Stage 4 or Stage 5. For example Souris 19:30 is downstream enrichment, not a printed time to force into raw extraction.

## Repeat evidence and next gate

Repeated rows 32, 76, 120, 121, 127, 217, 292 and 315. Ten baseline/nine candidate calls, $0.012871665/$0.011340090, 30/21 raw items, zero response errors/incomplete results. Repeated baseline exact requests could read the complete previously written prefix, while explicit candidate caching only reads reusable rules. This selective warm repeat is **diagnostic quality evidence, not a fair cross-post savings benchmark**.

The repeated Sunday loss is sufficient to hold the candidate at Stage 3. Therefore additional paid downstream replays were not run: they are required before a future release recommendation but cannot make this experiment pass by silently relying on later stages to recreate missing dates. Likewise no production diagnostics or prompt cleanup were deployed as part of this user-approved test.

Next useful experiment, still requiring a distinct reviewable candidate: preserve the relative order and proximity of field, date-expansion and JSON-output instructions while separating the changing source values. Keep any necessary source-reference wording changes explicit and separate from prompt consolidation. Repeat the blocking food/date controls first, then the complete cohort and unchanged downstream dry-run paths. Do not combine a slimmer prompt or lower reasoning with that comparison. Caching itself works; this particular layout is not approved.

## Reproduction and retained artifacts

From `functions` in the experiment checkout:

```powershell
node --test scripts/stage3-cache-layout.test.mjs
node scripts/stage3-cache-report.mjs artifacts/luna-stage3-cache-layout-oct11/full-api
node scripts/stage3-cache-report.mjs artifacts/luna-stage3-cache-layout-oct11/discrepancy-repeat1-api
```

The API runner is `scripts/stage3-cache-validation.mjs`; only `--execute` performs paid API calls, and output-directory reuse fails closed. Do not rerun paid work simply to regenerate an offline report.

Artifacts under `functions/artifacts/luna-stage3-cache-layout-oct11/`: `guard-offline`, `full-offline`, `guard-api`, `full-api`, `discrepancy-repeat1-api`, their bounded console logs, cohort/exclusion manifests, per-call response records, `results.jsonl`, `summary.json` and `analysis.json`. Raw artifacts remain local; they contain public source captions/images references and responses, never API credentials. Original images remain in the existing production-audit directory.
