# Stage 5 static-prefix cache: full October 11 validation

## Decision

The cache layout has passed full-cohort inventory and raw-response checks and demonstrates a useful input-cost saving. **Hold its production release pending a small date/category hardening pass and focused retest.** This is a formatting-prompt cache experiment; production already uses Luna none in Stage 5. No runtime source, deployment, traffic, queue, media or live event document was changed by this validation.

**Subsequent approved release:** Craig approved the safeguards and deployment. The focused controls and full saved-response replay passed; source commit `6c8b430` is now independently verified ACTIVE on all three parsers at source hash `3a97d4348ad1907befbedd9adf45878f577ad426`. See [the release record](luna-stage5-oct11-cache-release.md). This supersedes the original hold above without changing the experiment evidence below.

The accepted runtime baseline remains Stage 1 caching commit `1fceb8d`, recorded by `ad15419`, serving source hash `c6f04a6761d3129fc2b0399f3a77d84ad9a9afd7` at the preceding release verification. This validation did not refresh live configuration and does not assert a new live readback.

## Test scope and method

- Every October 11 source with nonempty captured Stage 4 items: **43 unique posts, 119 supplied items**, including the 40-item downtown schedule and sources subsequently held before writing.
- **86 arm runs, 98 paid API calls: 49 baseline and 49 candidate.** Both arms use Luna none, a 32,000 output-token setting, nine-item batching and concurrency two, with the current formatter safeguards.
- The baseline uses the accepted request layout. The candidate moves static formatting instructions ahead of a cache breakpoint, with changing context, batch count, venue-specific rules and complete indexed items afterward. Role, schema, rules, items, reasoning effort and output limit are preserved by request assertions.
- Every paired source has identical original-request hash multisets. All candidate calls share one stable prefix hash. Raw batch outputs have exactly the expected local source indices, with no duplicate/missing indices.
- The harness permits only the OpenAI Responses endpoint and imports no database/media writers. It refuses to overwrite prior results. Offline capture is separately stored and is not paid API evidence.
- This validates formatting against the supplied Stage 4 inventory. It does not re-establish that every upstream event, enrichment or extraction was correct. For example, the saved farm input has two visits; its missing upstream market sessions cannot be recovered by changing the Stage 5 cache layout.

## Results

| Check | Baseline | Cached layout |
| --- | ---: | ---: |
| Posts | 43 | 43 |
| Final records | 113 | 113 |
| Occurrences represented | 119 | 119 |
| Missing/extra supplied occurrences | 0 / 0 | 0 / 0 |
| Raw JSON/index failures | 0 | 0 |
| Transport/incomplete responses | 0 | 0 |
| Formatter errors/guard holds | 0 | 0 |
| Additional formatting retries | 0 | 0 |
| Reasoning tokens | 0 | 0 |

Three bounded weekly hockey-camp parents represent nine supplied occurrences in each arm. Recurrence expansion shifts both date fields by the occurrence offset; blank/unknown clocks are equivalent. This avoids falsely reporting the camp's compressed representation or the untimed pottery visit as missing events.

All supplied titles/start dates/start clocks, explicit closing clocks, ticket links/prices, explicit image indices and food-special flags survived. Nonempty explicit venues survived; Harmony House versus Harmony House PEI is a same-place alias difference. Broad category and unspecified image-choice differences remain and are reviewed below. Equal inventory is not a claim of identical or perfect output.

## Cost and latency

| Cohort | Calls per arm | Baseline USD | Cached USD | Cost change | Summed call seconds, baseline / cached |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full 43 posts | 49 | 0.026640605 | 0.023045280 | 13.5% lower | 246.485 / 250.364 |
| 28 posts not used in earlier cache tests | 32 | 0.019888725 | 0.013965440 | **29.8% lower** | 155.994 / 155.394 |
| Previously tested 15 posts | 17 | 0.006751880 | 0.009079840 | 34.5% higher | 90.491 / 94.970 |

The full comparison cost **USD 0.049685885**. Prices are the accepted accounting estimates, with ordinary/read/write/output tokens charged separately, not invoice reconciliation.

The 15 previously tested exact baseline requests can reuse their whole messages. That makes them an unusually favorable baseline for retries, rather than a fresh cross-post workload. Use the new 28-post subset to assess the cross-post opportunity, while retaining the full result. Its baseline reported zero cached reads; the candidate reported 56,384. Baseline/candidate output tokens were 19,823/22,119, so the total saving includes the candidate's greater actual output cost.

The candidate prefix was already warm from the earlier Stage 5 experiment: this run reported zero candidate cache-write tokens. The initial experiment charged a 1,762-token prefix write. Do not forecast the full-run result as a cold-cache guarantee. All 98 calls report cache-write usage explicitly, including zeros.

No meaningful speed improvement was established. The new subset differed by only 0.6 summed seconds; the full candidate was 1.6% slower. Full baseline/candidate median latency was 3.476/3.251 seconds and p95 12.689/15.371 seconds. These are model-call sums and distributions, not complete pipeline wall time.

## Source-grounded differences

### Overnight dates: distinguish blank from wrong

- **Row 212, PonyBoat, source `1103064525641429`, DJ ✮jada✮:** the source explicitly says 10–2 a.m. on October 10. Baseline returns October 11 as end date; the candidate returns **blank**, not October 10. The existing full-parser write code calculates a missing end date from the clocks, producing October 11. This difference is safe at that boundary. The first provisional report treated blank as same-day; that was corrected in the retained reporter and communicated to Craig.
- **Row 229, BE YOU, source `122204911406910683`, International Coming Out Day:** Stage 4 explicitly supplies October 10, 20:00–02:00. **Both arms return October 10 as end date**, when October 11 is required. Existing new-write normalization derives an end date only if blank; it does not correct an explicit same-day result. The duplicate-merge overnight safeguard runs only when replacing the end-time field and is not a general solution for new writes or unchanged clocks. This is a shared existing weakness, not a demonstrated cache regression. No live defect or live repair is inferred from the isolated formatting replay.

Trace: `functions/src/processing/rowProcessor.ts`, full-parser write normalization around line 4641; duplicate end-time merge around line 5893. The reporter imports the existing pure `calculateEndDate` utility and checks both boundary cases locally without invoking a writer.

Before release, protect a source-grounded overnight span from a model-supplied same-day date, while preserving genuine explicit multi-day spans. Test missing dates, same-day errors, known daytime spans, recurrence anchors and new-write/merge behavior.

### Categories

| Source | Baseline / candidate | Assessment |
| --- | --- | --- |
| Row 48, Seaside Rxtra Care Clinic | Gatherings & Parties / Workshops & Classes | A dated walk-in clinic is not a workshop; candidate category is weaker. Preserve the public activity while correcting its category. |
| Row 285, Kool Breeze pumpkin/squash weigh-off | Gatherings & Parties / Sports | Caption advertises a family fall festival with produce judging, wagon rides and kids' activities. Sports is a poor classification. |
| Row 234, hockey development camps | Workshops & Classes / Sports | Sports is defensible and arguably better. All three age groups and all nine slots survive. |
| Row 183, Messy Church/potluck/Halloween | Religious / Gatherings & Parties | Mixed worship, crafts, games and meal; neither label establishes inventory loss. |
| Row 22, Fringe variety show / musical | Comedy vs Gatherings; Gatherings vs Live Music | Broad theatre/variety taxonomy variation; review against accepted category rules, not baseline equality alone. |

These differences do not prove cache reuse itself causes errors: prompt ordering and normal model variability are both possible. The candidate has not earned a claim of perfect category parity. Address the clear clinic and produce-competition cases narrowly; avoid title-specific overrides or excluding legitimate activities.

### Images and location wording

Rows 20, 48 and 204 differ in image choices where Stage 4 did not supply an explicit integer index. The downtown image is a generic banner, not an individual event listing. Every explicit supplied index survived, and neither arm was given images to analyze in Stage 5. An index-choice comparison is not verification of a managed-image write or app rendering.

Row 183 differs only in punctuation in the Prince Street address. Row 302 keeps the explicit `17 Broadway Rd` address, with the baseline additionally repeating Hope River; the retained spatial evidence names Hope River in both arms. Row 294 keeps Harmony House PEI as establishment even where venue is blank. None establishes a wrong-location change.

## Evidence and reproducibility

- `functions/scripts/cache-stage-audit.mjs 5 --full-stage5` — offline capture.
- Add `--execute` only for an intentionally new paid run; it refuses existing output.
- `functions/scripts/cache-stage-audit-report.mjs artifacts full` — raw usage/status/guard aggregation.
- `functions/scripts/stage5-cache-full-report.mjs` — source multiplicity, recurrence expansion, field checks, write-boundary date handling and cost subsets.
- `functions/artifacts/luna-stage5-cache-oct11-full/` — source cohort, raw `response-*.json`, `results.jsonl`, completion summary, analysis and validation.
- `functions/artifacts/luna-stage5-cache-oct11-full-offline/` — request capture only.
- `functions/artifacts/stage5-cache-full-{paired,metrics,validation}.log` — execution and reports.

Syntax checks and local assertions passed: 43 paired sources, all 119 represented occurrences, zero raw/identity failures, identical original requests, DJ blank-date normalization, and the shared BE YOU error identified in both arms. No additional paid repeat was needed to establish these concrete findings.

## Next step

Make and validate the small overnight/category safeguards, then repeat those affected sources under both layouts before approving a Stage 5 cache deployment. Keep the currently deployed Stage 5 request layout until that result is reviewed. The completed validation supports pursuing caching for cost; it does not support promising faster Stage 5 calls.
