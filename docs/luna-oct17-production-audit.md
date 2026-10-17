# October 17 regular large-parse audit

## Decision

**Completed, with seven parser-quality issue groups and one remaining festival-linking evidence group.** This is not a clean quality pass. Prioritize session identity/duplicate handling and unsupported locations, then categories, family phrase coverage, recurrence ownership and clock conflicts. Prepare one combined reviewed release/repair plan; this audit does not authorize production mutations.

This audit made zero live event/review/venue/media writes, deployments, replays, model-generation calls or map interactions. Local predicate playback used captured data. Three read-only Responses retrievals recovered two existing Nano outputs; the failed festival capture's saved response returned 404. Normal scheduled worker calls are accounted separately.

Coordinator: `codex/shared-offer-origin-20261014`, starting HEAD `d8bbf9f`, checkout `C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script`. The dirty main checkout was preserved. Private evidence is under `functions/artifacts/luna-oct17-production-audit/`; original XLSX, captions, snapshots, images, cloud configuration and complete feeds remain local.

## Completion, denominator and release identity

- Regular `APIFY Dataset.xlsx`, file `1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g`, created 12:39:09.455 UTC, 469,538 bytes, 367 rows.
- Run `24bd52c0-fe67-4c1e-929c-ada0766febe6`; start 12:39:19.049 UTC; processed marker 13:50:33.144 UTC; terminal lock 13:50:33.302 UTC. Elapsed to marker: **71m14.095s**. Halifax completion: **10:50 a.m.**
- Matching completed lock, processed marker, final completed batch cursor 367/367 and absence of direct/queried checkpoints independently agree. No active parser lock at discovery.
- All 11,735 run-window log entries identify `processdatasetresume-00464-cud`, hash `3136192244fb564f412541a6d76af37689d7ac0c`. This run includes the family-v5 and Victoria Park prevention releases.
- Fresh Cloud Functions and Cloud Run readbacks: all three parsers ACTIVE, 100% latest traffic, common hash above: `processdataset-00500-nux`, `processdatasetresume-00464-cud`, `processdatasetselectedrows-00456-dog`. Main function is in northamerica-northeast2; resume/selected are in northamerica-northeast1.
- Environment variables, secret bindings, memory/CPU/timeout/instance/concurrency/ingress/service-account settings exactly match their saved Victoria release readbacks. Legacy model override strings are not evidence of actual execution; actual usage is below.
- Separate linker ACTIVE/100% latest at `scheduledfestivallinker-00006-buy`, hash `d06f641c15bc120ba6087d447e492ad7d3e34cfb`, mode `publish`.

| Terminal row result | Count |
| --- | ---: |
| Processed | 58 |
| Skipped | 89 |
| Invalid before model parsing | 220 |
| Hard errors | 0 |
| Total | 367 |

Invalid rows: 193 scraper `no_items`, 18 `not_available`, seven matched venues outside PEI and two textless/no-media entries (CFCY row26; A&W row39). Do not count scraper failures as rejected legible event posts. The seven regional exclusions produced no model snapshots. The 147 model snapshots reconcile to 71 Stage1 rejections, two Stage2 skips, three Stage3 skips and two Stage4 skips; another 11 formatted paths produce no publishable events and 58 rows produce processing outcomes.

186 final formatted items reconcile exactly to **89 creates +76 audited updates +five duplicate/conflict-only outcomes +10 unknown-venue operations +six area reviews**. Creates comprise 74 standard events/15 specials; updates 73 standard events/three specials. The 165 create/update operations affect 157 distinct parents. Seven parents have two audited updates; Be You's Mean Girls parent was created and enriched in the same run. The two skating duplicate outcomes additionally touched last-seen metadata; semantic counters are not a count of every Firestore write.

There were 367 distinct row starts, 367 terminal row results, 11 worker executions and 377 checkpoint saves with no decreasing cursor. No row replay was observed. Last logged event write preceded terminal completion. All 157 affected details returned 200; the complete default compatibility feed contained 1,025 entries across 11 pages. The current Preview's `dateOnlyActivities=v1` active feed was separately paginated completely:1,026 entries/11 pages. All 119 distinct managed target image URLs returned 200. These are timestamped captures, not invariant feed counts.

## Models, cost and latency

Actual calls: Luna for Stages1/2/3/5 and OCR; Nano for Stage4. Stage3 includes one additional Luna calendar inventory audit. Stage1 selected 147/147 eligible posts (138 image/nine text); Stage2 76/76 (72 image/four text); Stage3 74/74 (70 image/four text); Stage5 69/69 posts and 79 actual calls. No Nano Stage5 or legacy Mini/5.2 execution was observed. Existing efforts/compact contracts remain: Luna high/none/high/none for Stages1/2/3/5; Nano low with `compact_v1` for Stage4.

| Stage | Calls | Input | Output | Cached reads | Cache writes | Est. USD | Sum API minutes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 |151|1,333,025|101,459|505,094|6,911|0.13874632|17.68|
| 2 |85|566,704|15,917|106,987|2,578|0.05506452|4.21|
| 3 + inventory |85|757,922|125,726|11,209|745,640|0.15628739|20.20|
| 4 |77|270,108|54,853|3,072|0|0.03530836|6.99|
| 5 |79|220,951|65,439|124,208|16,011|0.04403616|10.31|
| OCR diagnostic |1|3,892|399|0|3,889|0.00068592|0.07|

Total **478 calls, 3,516,395 tokens, estimated US$0.430128665**, summed API time 59m27.649s. All 478 calls report cache-write coverage; zero unknown. Ordinary input is input minus reads minus writes; repository per-million estimate rates are Luna 0.10/0.01/0.125/0.50 and Nano 0.05/0.005/0.05/0.40 for ordinary/read/write/output. These are model-cost estimates, not invoices or total cloud costs. No cache/prompt/model experiment was performed.

One compact Stage4 attempt failed its recurrence-correction contract at row103 and recovered syntactically on retry, while retaining the wrong recurrence (group6). Existing managed-OCR deletion guards returned 403 on cleanup attempts for skipped posts; this did not fail the parser or authorize deleting source/display media.

## Source coverage and retained protections

All 147 model-source captions and decisions, including 71 Stage1 rejections, were reviewed against ordered galleries. **252/256 image references available, 29 contact sheets inspected.** The dense Tyne Valley schedule and comedy poster were also inspected directly. Four originals failed DNS twice: row327's canteen hiring image and three row335 bakery images. The captions/decisions remain readable, but unavailable images are not independently verified. No resolution escalation or new rescrape was needed to establish the findings.

Normal retail stock, recruiting, past recaps, lodging/private celebration promotion, online merchandise discounts and transport notices remained rejected. Public rink rental opportunities remain valid; private rental is held. Pool closures were excluded while seven public swim/slide/access sessions retained their printed clocks. The Inn's untimed dining series, untimed attraction posts and unclear cropped Halloween material remained held under current timing policy. No broad date-only publication is proposed.

The approved Victoria keeper remains one venue-scoped Sports event at Victoria Park, 11:00/unknown finish, family score100. Its four retired parent IDs and generated copies are absent. Daisy's two deleted publishers and Be You's two retired recurring copies remain absent. The seven October14 duplicate IDs also remain absent; five of their six reviewed keepers remain, along with the separate Be You keeper. The sixth October14 keeper, the expired October15 Arts Mixer parent, is absent from the current inventory; this audit does not attribute that absence to this new parse or establish its cleanup cause.

The family application artifact contains 61 updates plus a held event control and feed metadata. All 61 still-present event controls retain their reviewed scores. The one missing event control is the Fox Trot heat intentionally deleted by the later approved Victoria repair. No score regression was found among surviving approved controls.

No newly written area/city public parent or leaked private spatial-review description was found among the 157 touched parents. That does not mean spatial routing was entirely correct: group5 identifies six incorrectly broad held visits. Older APM evaluation-session coverage, Connolly Park's held Souris identity and consecutive Lane Swim controls were not exercised by new sources; do not claim a new source-based pass for those cases.

## Eight follow-up groups

### 1. Distinct sessions overmerged — priority

Row318/source `1733964295400114` contains 26 eligible timed sessions, including separate PreCan12:15–12:45 and CanSkate12:15–13:00; Stage5-6 13:15–14:00 and Star1-2 13:15–14:15. Both distinct second sessions survive extraction, validation and formatting, then match the first session and are discarded. Only 24 parents are created. Existing targets are:

- `venues/LglliE42SPFssmoU01su/events/sx21qYBy8wm8vXhd3w8g`
- `venues/LglliE42SPFssmoU01su/events/RXPvF76HBUPzhgmqJJmZ`

Row193/source `1629374475648571` similarly sends both Eptek time slots to Group1 `venues/slug_eptek.centre/events/3DO8t0Eyl1TB8scIBfEx`. Group2 `nOz8TgJISaSmdkMUVNzY` still exists with its separate14:15–15:30 schedule, but receives no new-source corroboration. Its older description also mentions the first time slot and needs independent correction review.

Actual compiled `isDuplicateEntry` playback returns true for all three wrong pairs; the stricter same-occurrence predicate returns false. The general OR path in `firestoreService.checkDuplicate` admits broad title similarity/three-hour tolerance. The same-post sibling guard does not separate same-start classes, and does not cover old/new source-root differences for Eptek. Protect source slot/program/group identity and incompatible windows before broad similarity; preserve genuine cross-post duplicates and repeat programmes. Restore the two missing classes only in an exact reviewed batch. An older Red Shores Oct2 keeper still names Emily Wilbur where the new monthly poster names Brad Milligan; record this historical source conflict separately rather than automatically renaming a past performance.

### 2. Duplicate occurrences under different names/venue aliases

- The November7 20:00–22:00 comedy show is present as `venues/DZ4nQZQnOKCkTotuKYVv/events/pXeHp206JhwAKXZfgoE3` (The Comedy Cave brand title at The Factory) and `venues/V7zQ5unfTY1GtNKUvR7c/events/bDdUKS57VSPMil4oKqqp` (Jalen + Friends). Rows325/326 show matching artwork/date/clocks; both venue documents have the same Facebook profile, coordinates and189 Kent Street address. Preserve the richer benefit-show/adult/doors evidence; review exact canonical venue/event identity before merging. This is not authority to merge venue documents.
- Founders' October17 17:00 NHL screening appears as generic `venues/slug_foundersfoodhall/events/Nqq3FWCRRCBudDP1FYYh` and named Canucks/Lightning `venues/slug_foundersfoodhall/events/sf9FKqC2RWLXStUj7Lwn`. The first-party poster identifies the game; the generic Downtown listing refers to the same venue/time. Keep the simultaneous Chris Burke concert separate. Add source-proven generic-versus-named occurrence handling, not blanket same-time deduplication.

### 3. Category safeguards still misroute three public listings

| Path | Current | Source-supported direction |
| --- | --- | --- |
| `venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ` | Artisan Market, Food Special, event false | Public artisan market event |
| `venues/qUg3AMPeXX9URM0UrXEA/events/4ZxbxygV32qUmnT7Pbt7` | Sterling Farmers Market, Food Special | Market event; keep the separate $5 soup special |
| `venues/slug_bellaliantcentre/events/jjOj9C8U4xuOe87fdmGV` | Y's Club Free Swim, Live Music | Sports/public swim |

Rows69/123/157; extraction/source roles distinguish the activities. Royalty's formatter log explicitly forces Food Special; its bad category/flags overwrite a prior event. The present source-grounded market guard covers craft but misses artisan and the possessive/plural farmers wording; subsequent food inference can undo a weak category correction. The pool guard is anchored to selected title beginnings and misses a sponsor-prefixed free swim. Use item-specific activity identity before food cues, preserving real food offers and unrelated pool-party/music cases.

### 4. Family phrase coverage and beneficiary evidence

New family-v5 misses reproduce in the current compiled scorer:

- Family/Public Skate `venues/LglliE42SPFssmoU01su/events/MaC5HZv3CVQR5M6koJCO`:15; normalizing the slash phrase alone yields85.
- My First Sports `venues/slug_cornwallciviccentre/events/NvtBo0lQs208nlxrHSYH`:15 despite source-supported children/ages4–6. Normalizing the colon and `yr` age notation yields80.
- Royalty's market above:15 despite inviting friends and family. Normalizing that conjunction into the currently recognized family invitation yields85.

These are offline diagnostic probes, not changed documents or replacement source text. Broaden equivalent phrase/age notation handling with negative controls. Coats for Kids distribution at the unsupported café location in group5 scores70 solely from `child_focused_program`; the campaign-name/beneficiary evidence does not establish a children's participation programme. Hold its location and badge until source-based attendee/venue proof exists. Existing reviewed family scores and the19+ benefit-show negative control remain intact.

### 5. Occurrence-specific location ownership

Row27/source `1735968125204476` lists six dated CFCY donation visits with one named venue per date. Extracted/formatted items retain those venues, yet the classifier turns all six into area-scoped Island Wide Food Drive Locations reviews in Charlottetown. They are held, not publicly mispinned:

- `city_level_event_reviews/cityevt_9820171506b137a15f9312eb` — Oct20, Connor and Kennedys No Frills, Charlottetown,12–16.
- `city_level_event_reviews/cityevt_1d8f8c8689925f63d077c957` — Oct22, Haunted Mansion, Kensington,16–19.
- `city_level_event_reviews/cityevt_be9a2226db0c5993d474880c` — Oct27, Summerside Butcher Shop,12–16.
- `city_level_event_reviews/cityevt_711783010369fad6f5e8e36f` — Oct29, Kay's Wholesale/Fresh Market,12–16.
- `city_level_event_reviews/cityevt_176747b0b70f4f7fd35d8684` — Nov3, Browns Volkswagen,12–16.
- `city_level_event_reviews/cityevt_54ceb3e3eb3abf94c3399853` — Nov5, HBM Summerside,12–16.

The umbrella name/global location list must not override a dated visit's source-bound venue. Resolve existing canonical venue identities or hold the specific unresolved point; do not invent pins or dissolve a genuine umbrella programme.

Row283/source `1118550040924946` creates `venues/RJ9iYyEWcYUr91hcGSeL/events/2DjVdRAtNrcyKPPgjjQU` for the November7 free clothing event at Summerside Waterfront Café. The source identifies that café as a collection partner, not the distribution-event venue. Stage3 leaves venue blank; publisher fallback supplies the café. Hold/correct only with actual event-location proof. Keep collection-role provenance distinct from attendance location. Nine queue documents retain current-file samples; ten queue operations are four creates/six updates. Six other current-file reviews are the CFCY visits above. No queue status is a venue-creation approval.

### 6. Recurrence evidence still leaks or disappears

- Row103/source `1565917082242490`: the October18 12–20 Stratford Sobeys Donation Day borrows `daily` from the separate Confederation Court Mall depot. The first actual Nano output correctly proposes `none`; `unsupported_recurrence_correction` rejects it. Retry keeps the item without correction. The result remains in `unrecognized_venues/uv_9532e4fe995e32f35d902f3e`, so fix recurrence ownership before recovery. Do not publish a daily event from this source.
- Row343 My First Sports retains only October24 as a one-off despite the advertised Saturday programme. Verify the full programme lifecycle and preserve supported weekly intent without inventing an end/count. This is separate from its missing family label.

Reproduce the actual source item/description and compact correction, not only the earlier Montague fixture. Retain genuine daily depot and weekly-program controls.

### 7. Conflicting source clocks were silently prioritized

Row247/source `1720610070064632`: caption starts18:00–21:00, chalkboard starts17:00. Published `venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW` uses17:00 as explicit; the caption also mentions Wednesday while its post date is Friday. Hold a materially conflicting occurrence rather than picking image/caption priority or guessing the intended weekday. This October16 listing is historical at audit time; prevention and an exact historical disposition should be reviewed without reviving it.

Ordinary unknown finishes/default discovery cutoffs are not counted as advertised-end errors when honest time flags suppress them. No new policy to display invented finish clocks is proposed.

### 8. Festival evidence still prevents complete automatic linking

The scheduled worker waited while the parser was active, then ran seven bounded capture-progress passes, reaching held generation8 at14:30 UTC. It made **11 actual existing-worker model calls** across seven source/edition captures:28,760 input,17,213 output, zero cached reads,28,727 cache writes;187.337s API latency; estimatedUS$0.012200675. The audit made none of these generation calls. Later polls return `already_held`, zero paid sources/writes.

- Anchor: `source_inventory_incomplete` for source `1650364973767084`; four items from `1651414103662171` fail `cross_card_excerpt`. The failed capture has one paid completed-response receipt, but read-only retrieval now returns404. Do not invent its missing response contents or repeatedly retry it.
- Pumpkin: ready, `no_public_delta`; existing12 Centre Belle-Alliance links plus one library link remain.
- Harvest: ready, `no_public_delta`; five source items fail `cross_card_excerpt`, one outcome remains held. Existing four reviewed programme links remain. The new first-party gallery corroborates component activities but does not authorize silently relaxing source ownership/clock guards.
- **Zero public event writes and zero added links** by this job. Existing Anchor17 links, Pumpkin13 and Harvest4 remain; no inferred venue/date-only membership was added.

Next work is a bounded saved-source/capture-contract diagnosis of shared caption/gallery headings and the unavailable Anchor capture. Validate exact canonical child identity, source completeness and conflicting clocks before any repair/re-capture or release. This run does not prove complete automatic festival linking; it does prove that unresolved evidence did not cause speculative publication.

## Other observations and next decision

The ordinary-menu versus limited-feature policy remains a review boundary: Lobster on the Wharf's seasonal featured spaghetti was rejected; Ruby's costume/cinnamon-roll-circuit post reached a food listing after fallback extraction. Those are eligibility-policy observations, not proved cleanup candidates from this audit. No broad replay is proposed. Missing media, the older Red Shores performer conflict, held venue identities and untimed activities require their own evidence before mutation.

Prepare one combined plan for the eight groups with exact public/queue targets, source receipts, narrow prevention tests, serving-baseline assembly and a backed-up guarded repair. Prioritize preserving the two missing skating classes, deduplicating the two proved occurrence pairs, and removing unsupported venue assumptions. Keep already-approved repairs completed; do not request their old approvals again. Neither an audit report nor code deployment repairs existing data.
