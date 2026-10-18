# Scraper One acquisition test — October 17 Halifax evening

## Scope and decision

Craig authorized paid comparison scrapes, including a full daily scrape if the
comparison was ready. This is an acquisition/importer experiment, not approval
to activate a replacement provider. Production remains on the existing scraper.
All candidate runs use pinned Scraper One build **0.0.120**, limited permissions,
dedicated default datasets, no added webhooks, and a combined **US$3 actor-charge
ceiling**. Existing webhooks were checked before starting. API credentials remain
inside the process; none was printed, copied to artifacts, or committed.

**Completed: Scraper One matched46/46 baseline source/post records in the corrected
20-source daily sample and preserved all seven baseline shared originals. Native
shared-original capture is substantially more promising than Dami. Missing images,
author metadata and startup throttling still need resolution before replacement.**

## Baseline and comparison method

The completed official run `i0cfrfOdZ96dcNpv9` ran October17 12:37:30–12:39:01 UTC,
returned367 raw rows including156 posts, and recorded US$1.836 actor charges.
The source file has323 entries representing320 distinct exact URLs: Dali, Baba's,
and Tivoli each occur twice. Every baseline `inputUrl` corresponds to that list.
Repeated source entries are acquired once in the comparison, with their original
entries retained in the plan. The saved October17 parser audit separately proves
the corresponding regular dataset complete; candidate data never enters it.

The lower bound is October16 UTC. Scraper One accepts only a whole-day upper
bound, October17. Candidate posts after12:39:01.446 UTC are excluded from matched
coverage but remain part of actual paid cost. Captures are hours apart: changed
captions, disappearing posts and changes in source availability require separate
adjudication. Stable matching uses normalized requested source URL plus exact
outer post ID; URL normalization removes HTTP/www/trailing-slash/case differences,
not venue-name similarities. Shared original identities remain separate.

## Completed nine-source regression scrape

Run `qIcLwVeGmUByinvNH`: October9–17 window,104 returned posts, US$0.26025.
Sources: Trailside, PEI Library, City Cinema, Downtown Charlottetown, Hunter's,
Fortune Bridge Farms, Evermoore, Kool Breeze and Robert McMillan Pottery.
This is a wider-window regression sample, not a full daily-feed recall result.

All13 returned shares have original caption, author name/profile, original post
URL and original timestamp. Three exact previously lost Dami controls match the
saved official October16 source captions and original author IDs:

| Sharing post | Original publisher | Ordered original photo IDs |
|---|---|---|
| Evermoore1777333234400302 | Harbourfront Theatre |5/5 exact |
| Kool Breeze1708152184652928 | Downtown Summerside |1/1 exact |
| Robert McMillan1674702811236207 | Potter's Wife of Hope River |5/5 exact |

The official raw galleries contain empty container objects before some actual
photos. These are excluded from asset comparison only when they have neither an
asset ID nor an image URL. They are not counted as missing images.

All29 selected candidate/control image downloads decoded successfully. Ten of
the11 candidate photos in these three controls have higher pixel dimensions than
the saved official variants; the remaining one has equal512×640 dimensions.
Five saved images were independently viewed, including the Harbourfront poster,
pottery gallery and Kensington skeleton. This establishes acquisition of the
original source material; no new model extraction or event-publication pass is
claimed. PEI Library's selfie-hunt share1434266702222333 also returned its original
Chamber caption and all three photos.

## Importer and content failures

Captured the immutable serving archive for `processdatasetresume-00465-tub`, with
100% latest traffic, and extracted only its compiled importer, mapper and row
validator. Archive SHA256:
`759cd3c110c562d0e3c9e383d23eb975925118b9a79484d5c826e9866ac78348`.

A scratch field adapter fed all104 records through that unchanged XLSX importer.
Cloud clients, timers and network are blocked inside its VM. Available captions,
shared captions, IDs, source URLs, timestamps, image URLs and original-author
provenance survive exactly, with zero preservation failures. **96/104** pass
basic row validation. This is not an end-to-end parser or publication test.

Eight failures remain:

| Post ID | Source | Failure |
|---|---|---|
|1541103558051224|PEI Library|Author name missing; numeric author ID/profile retained |
|1791601366304669|Hunter's|Author name missing; numeric author ID/profile retained |
|1648299067307008|City Cinema|No usable caption or image |
|1626657405916538|PEI Library|No usable caption or image |
|1558537279625937|Trailside|No usable caption or image |
|1730943142373811|Fortune Bridge Farms|Caption absent; video lacks a usable image thumbnail |
|3655937754564689|Evermoore|Facebook-event preview image absent |
|1668892618483893|Robert McMillan|No usable caption or image |

Fourteen video attachments across the sample provide video URLs without image
thumbnails. MP4 URLs are not passed into image columns. The two missing author
names are not guessed from a venue mention or substituted with a sharing-page
name. A verified registry could support explicit publisher reconciliation, but
that is not demonstrated here.

Evermoore3655937754564689 is a concrete content-loss control: the existing provider
captured the Tuesday Live/Alyssa Harper Facebook-event preview; the candidate
record has neither caption nor attachments. Its saved earlier parser output
contained one listing. The original preview variants were fetched and visually
inspected. This is one known previously productive input, not proof that all
eight invalid records represent lost upcoming events.

## Initial full-source attempt: not a valid recall score

Four80-source batches were launched, with a requested depth100 and US$0.55 cap
each. Three returned zero rows with **Rate limit reached** in their logs while
reporting SUCCEEDED; some also expose it in the API status message. A three-page
probe and one batch retry did the same.

The active first batch logged an inspected depth of **two** posts per page,
not100. The nine-source smoke similarly logged17 rather than the requested30.
Both match the apparent division of the spending cap across input pages at the
Starter result price. This budget-allocation explanation is an inference from
observed denominators; it is not a confirmed publisher contract.

The first test batch `2J7cLMPSb6UM7WIMM` was explicitly aborted when this setup
defect was established, retaining27 rows/25 posts and US$0.06275 actor charges.
All its output is retained. Its unmatched baseline IDs **must not** be reported
as a full-feed recall score or used for a savings estimate. This termination
affected only this chat's isolated candidate test, not any production parser.

The launcher now rejects a proposed cap below the verified init price plus
requested source count × requested depth × result price. This prevents reusing
the original invalid configuration as if it preserved the requested depth.

## Corrected daily comparison

Run `C09eoSwklEKQiKxeI` uses20 sources, requested depth20, and US$1.00025 cap,
started after every earlier test was terminal. It completed successfully at
00:18:42 UTC October18 (21:18 Halifax October17), after5m51s. Logs confirm all20
sources finished at effective depth20, and78 post rows cost US$0.19525.
Thus the earlier startup rejections do not
establish a blanket inability to use the paid Starter account. Their exact
quota/cooldown/concurrency rule remains undocumented and unresolved.

There are46 baseline posts across these20 normalized requested source URLs.
The launch plan's initial exact-string count43 omitted three Kool Breeze rows
whose input URL has a trailing slash. Matching normalizes that slash, preserving
all46 IDs without inventing additional sources.

| Corrected daily result | Count |
|---|---:|
| Baseline source/post records |46|
| Matched baseline IDs and exact timestamps |46/46|
| Exact outer captions |45/46|
| Baseline shared originals: captions, author IDs, ordered gallery IDs |7/7|
| Candidate duplicate source/post keys |0|
| Additional records within the same timestamp window |19|
| Later records excluded from matched comparison, still paid |13|
| Matched records with fewer usable image assets |8|

The one changed outer caption is Downtown1566791205488411: two marathon start
location clauses are more specific. This is consistent with an intervening
publisher edit, not a truncated caption; Facebook edit history was not separately
verified. All46 original post timestamps agree exactly. Of the19 additional
input records, seven are independently present in the saved October16 official
capture with the same timestamps. These are not19 newly discovered events;
some already supplied prior parsing and some are ordinary news/notices.

The same serving importer and validator also read the original October17 XLSX
as a control. Of46 matched baseline records,45 were valid originally and42 are
valid from the scratch candidate adapter. **Three new validation regressions**:
the same missing-author-name post1541103558051224 appears under both GovPE and
PEI Library, and Summerside Waterfront Cafe1118397330940217 loses its image-only
content. CFCY1736055591862396 was already textless/image-less in the official
control, so it is not blamed on this candidate. Across all78 returned records,
73 pass basic validation and all available mapped fields survive exactly.

Eight matched records lose usable image assets: GovPE1541350911359822;
GovPE and PEI Library copies of1541103558051224; City Cinema1651414103662171 and
1650364973767084; Credit Union Place1764690185378794;
Robert McMillan1676531811053307; Waterfront Cafe1118397330940217. Most are video
thumbnails; City Cinema retains video IDs/MP4 URLs but loses the corresponding
image previews. The cafe record lacks its photo. This is source acquisition loss,
not a field-renaming failure. No fresh candidate model extraction was run, so
this report does not claim an exact downstream event-loss count.

A valid320-source full-feed comparison has **not** been completed. The incorrect
initial depth and aborted/throttled runs cannot establish full-feed recall,
latency or monthly savings. The smaller source comparison exposed enough
remaining native-content problems to resolve before spending on that larger test.

## Final cost and isolation verification

All eight test runs are terminal: two completed nonempty samples, five empty
rate-limited attempts, and the explicitly aborted depth-limited batch.
Actual actor charges total **US$0.51950**:

| Test | USD |
|---|---:|
| Nine-source regression scrape |0.26025|
| Aborted depth-limited batch |0.06275|
| Five blocked starts |0.00125|
| Corrected20-source daily scrape |0.19525|
| Total |0.51950|

Ordinary API reads/storage are separate; no new model, image-publication or
Firestore costs were incurred by this test. The existing account was freshly
verified as paying Starter/Bronze with its existing US$29 monthly minimum.
Do not compare the20-source US$0.19525 directly to the full320-source US$1.836 or
present this incomplete experiment as a measured monthly saving.

At00:19:48 UTC, fresh readback confirms unchanged webhook routing, the same
official terminal run/dataset identity, and no remaining active test run.
Only the candidate actor was launched. No public GathR record was written.
Recommendation: retain the current production provider; continue with the native
preview/thumbnail and identity gaps plus explicit rate-limit handling before a
correctly provisioned full daily test. The successful share controls justify
continued evaluation; they do not establish publication readiness.

## Evidence and next gates

Private/local evidence: `functions/artifacts/scraper-one-oct17/`:
- raw official run/input/items and frozen source list;
- candidate build/input schema/pricing metadata and eight run records/logs;
- `shared-regression-checks.json`, `regression-image-checks.json`, saved image bytes;
- captured serving importer and `scratch-import-summary.json`/per-record checks;
- initial and corrected comparison plans, post comparisons and depth evidence;
- final `safety-verification.json`, `account-plan-proof.json`,
  `matched-import-control-comparison.json`, `matched-image-gaps.json`,
  `caption-differences.json`, and `additional-history-crosscheck.json`.

Reusable local scripts under `firebase/`: `test-scraper-one-oct17.py`,
`analyze-scraper-one-oct17.py`, `check-scraper-one-regressions-oct17.py`, and
`check-scraper-one-import-oct17.cjs`. These are test helpers, not production
launcher/importer changes. No paid model-generation call, Firestore mutation,
managed-media upload, production provider change, task/schedule edit, deployment
or external message is part of this experiment.

Before a replacement: resolve native event/link preview and video-thumbnail
coverage; reconcile missing/cross-post author identities; establish documented
startup limits and fail visibly on green-but-empty throttled runs; then repeat
a correctly provisioned full daily acquisition comparison. A later current-parser
shadow/publication-path test remains separate. Do not build a complicated
second-scrape recovery system merely to compensate for these observed gaps.

Primary references: [Scraper One README](https://apify.com/scraper_one/facebook-posts-scraper),
[input schema](https://apify.com/scraper_one/facebook-posts-scraper/input-schema),
[pricing](https://apify.com/scraper_one/facebook-posts-scraper/pricing).
