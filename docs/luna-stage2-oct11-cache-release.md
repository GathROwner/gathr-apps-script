# October 11 Stage 2 cache validation and release

## Authorization and accepted baseline

Craig approved pursuing Stage 2 after the earlier 18-post cache experiment. This work starts from accepted commit `68ec3ec`, including the released Stage 1 and Stage 5 caching and safeguards. Independent Firebase Functions and Cloud Run readback confirmed all three parser functions ACTIVE, 100% latest traffic, common source hash `3a97d4348ad1907befbedd9adf45878f577ad426` before this change. Model/reasoning/allocation flags are saved for an exact after comparison.

The runtime change is limited to Stage 2 Luna request layout. `stage2PromptCache.ts` moves the unchanged classification rules and JSON schema ahead of changing CONTENT. The static block has the experimentally tested explicit cache boundary; TTL is 30 minutes. The Facebook-event reference changes from “present above” to “present in CONTENT” to preserve its meaning. Caption, venue, Facebook metadata, image order/bytes/detail, output cap, none primary/high negative review, normalization, routing and failure holds remain unchanged. Other models retain the original request; unknown prompt shapes return the uncached layout. Exported prompt/schema builders support independent request reconstruction only.

## Complete broader classification test

Frozen October 11 sources: all 53 Stage 1-passed sources with available original galleries, plus two prior negative/route controls, for **55 paired sources**. Rows 81/82 have unavailable original images and are excluded explicitly, never relabeled as caption-only. Retained source hashes and ordered galleries are identical between arms. These are audit JPEG encodings, not a claim of byte-identical production WebP payloads.

The real runtime cached builder matched an independent reconstruction of the earlier experiment on every request. An additional offline 55-source/110-request builder check made zero paid calls. Initial offline setup stopped on unavailable images before making any API calls; the retained harness now records those exclusions explicitly.

Both fresh arms agreed on **55/55 pass-versus-hold decisions**. Only Harvest Fest and Founders hockey changed effective extraction route in the broader test. There were **124 actual classification API calls**, zero errors, incomplete responses or classification fallback results. The existing high review explains calls exceeding 110.

Five sources had different estimated item counts (48, 64, 120, 234, 332); none was routed CALENDAR. Inspection of `postParser.ts` confirmed the count is passed to calendar inventory auditing only on the CALENDAR branch. It is otherwise telemetry here, not a limit that truncates extraction. No calendar count changed in this paired cohort.

| Measurement | Original layout | Cached layout |
| --- | ---: | ---: |
| Posts | 55 | 55 |
| Actual calls | 64 | 60 |
| Estimated USD | 0.023184325 | 0.011510590 |
| Summed call seconds | 177.415 | 208.425 |
| Input tokens | 136,521 | 128,007 |
| Cached reads | 0 | 71,514 |
| Cache writes | 136,329 | 2,466 |
| Output tokens, including reasoning | 12,248 | 10,169 |
| Reasoning tokens | 3,521 | 2,180 |

**50.4% lower estimated total cost**, but four fewer high reviews contributed. On the **51 source pairs with identical effort/call sequences**, cost was USD 0.019940425 versus 0.010844670: **45.6% lower**. This is still fresh stochastic output, not a claim that the entire difference is caused only by cache reads. Two candidate calls incurred measured prefix writes of 1,233 tokens each (row 21 none, row 32 high); no paid prewarming was used. Both arms ran concurrently per source with four task slots. Summed API time is not full-parse wall-clock time; the candidate was 17.5% slower in this comparison, so there is **no established speed gain**.

Usage-based estimates retain ordinary input, cached reads, writes and output as separate charges without charging write input twice, using the accepted accounting rates. They are not invoice reconciliation or a whole-run forecast.

## Downstream route checks

Every differing route observed in either earlier Stage 2 suite was replayed through the actual current Stage 3 extraction, Stage 4 validation and Stage 5 formatting. No model prompt/cache change was made in those stages. Four original captions and ordered galleries, **eight route executions / 26 actual API calls**, estimated USD **0.014503590**. This is a bounded no-write integration replay, not a Firestore write or an entire postParser/website-enrichment replay.

| Source | Routes exercised | Source-backed result per route |
| --- | --- | --- |
| Founders Harvest Fest, row 64 / 1718913086910871 | EVENT, SCHEDULE | One October 17 festival, 15:00–20:00, correct venue/image, no recurrence. Festival activities remain contextual details. Schedule route retained the full printed activity times in its description; event route summarized several activities and retained both bands' times. Descriptions are not identical. |
| Founders hockey, row 65 / 1718627620272751 | SCHEDULE, EVENT | Two October 10 viewings: Bruins/Flyers 14:00 image 0; Oilers/Sharks 17:00 image 1. No invented end times. |
| Local Pub brunch, row 66 / 1128907866328055 | EVENT, FOOD_SPECIAL | Two weekly brunch parents, Saturday October 10 and Sunday October 11, both 10:00–14:00 and Food Special. Printed weekday recurrence retained. |
| Tipsy Farmers, row 120 / 1135515799005452 | FOOD_SPECIAL, MIXED_EVENTS_AND_SPECIALS | Exactly one October 11 turkey buffet special, 16:30–18:30, correct venue. No preorder-pickup, pizza restock, cookies or ordinary pie-stock listings. |

The eight route executions produced 12 records in total, representing the same six records across two routes per source. These are comparison outputs, not duplicate live writes. All responses completed; no malformed-response fallback or validation override was required. Source assertions verify dates, clocks, recurrence, venue and printed hockey image indices. The original Harvest Fest, brunch and two hockey posters were visually inspected; the Tipsy qualifying offer and exclusion rules are explicit in its caption. No source-backed omission attributable to the changed classification route was found in these controls. No broad claim of identical generated descriptions is made.

## Local checks and evidence

- TypeScript build passed.
- **67/67 focused tests passed**: cache boundaries, all source/rule/schema lines, marker-like source text, captions/images/Facebook metadata, static prefix stability, unknown-layout fallback, real none/high requests, Mini unchanged, existing safeguards, gallery refresh, allocation and score routing.
- Initial focused suite found one test that assumed Facebook metadata was in the first text block. Its assertion now checks the full request and the dynamic CONTENT block explicitly; no runtime metadata was missing.
- Initial offline report assumed all Stage 4 diagnostic properties were absent. These are existing zero counters; the corrected report verifies no fallback and zero override counters. Reanalysis used saved responses only, with no additional paid calls.
- `functions/scripts/stage2-cache-validation.mjs`: independent runtime request contract; bounded `--execute`, Responses-only transport; no DB/media writer imports; raw responses retained; no automatic paid overwrite/replay. It replaces the pre-release generic Stage 2 cache experiment harness, whose single-text-block assumption is now obsolete.
- `functions/scripts/stage2-cache-report.mjs`: zero-API aggregation and explicit source assertions.
- Ignored evidence: `functions/artifacts/luna-stage2-cache-release/` (`classify-api`, `downstream-api`, `playback-offline`, `analysis.json`, before/after readback and release preflight). Build/test logs are in `functions/artifacts/stage2-cache-*.log`.

## Deployment

Release source: `ef95df2`, including runtime change `4555ccf`. The final read-only preflight at **2026-10-11T17:42:30.177Z** found zero active processing locks, the completed October 11 marker and final batch, and no checkpoint. Dry run and actual deployment both succeeded using the established discovery timeout of 60 seconds:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
```

Only those three parser functions in codebase `gathr-functions`, project `gathr-migrated`, were updated. The existing outdated firebase-functions warning did not prevent release; dependencies were not upgraded. Independent post-deploy verification is recorded below. No historical live event records were changed by this work.

At **2026-10-11T17:47:57.777Z**, independent Firebase Functions and Cloud Run readback confirmed all three ACTIVE, common source hash **`0678cc45a38a27c4ad4a04a7f947241106a41eb9`**, all traffic on their new revisions:

- `processdataset-00470-rol`
- `processdatasetresume-00434-keh`
- `processdatasetselectedrows-00426-rul`

Model/reasoning/allocation environment fields exactly match the fresh before record. Stage 1/3 remain Luna high, Stage 2 Luna none with high negative review, Stage 4 Nano low, Stage 5 Luna none. Stage 1 and Stage 5 cache changes are preserved. **Stages 1, 2 and 5 caching are now deployed; Stages 3 and 4 caching remain unchanged.** The next regular production parse must measure actual cache reads/writes, negative reviews, qualification and downstream inventory; replay savings are not a production guarantee. No new automation was started.
