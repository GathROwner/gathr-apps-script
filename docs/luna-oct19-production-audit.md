# October 19, 2026 full POSTS parse accuracy audit

Status: **full audit complete; the subsequently approved prevention release and exact recoverable repair batch are applied and verified. Seven original image-reference gaps remain explicit.** This is the usual full input-to-public-output review, not a venue-readiness sample. No live mutation, replay, deploy, paid audit model call or schedule change occurred during the audit.

## Exact run and completion proof

- Original Drive file `1h-jAjJyKgD8CChB_A02mv3gxUg3szA2h`; Apify POSTS actor `KoJrdxJCTtpon81KY`, run `MaGLsJJ5DXaErlPCc`, webhook `b24pSYcdP107jcMKoXuR`.
- Parser run `8c8ffde2-049f-4859-a213-b48e7d5ef60c`, October 19 **09:39:20–10:39:30 a.m. Halifax**, elapsed **60m09.636s**.
- Original retained workbook SHA-256 `167aed3ad32505fce5d7db80f61ba5f0b0da0b460dd0e17bc8cb5b69f014ec9d`, 321,627 bytes. No actor was rerun for this audit.
- All **348** input rows have a terminal log decision: **33 processed + 251 invalid + 62 skipped + 2 errors**. The invalid cohort reconciles to 245 scraper status rows (227 `no_items`, 18 `not_available`), three empty rows and three out-of-region rows. Three out-of-region captions were inspected; Ontario library and The Club matched outside allowed regions and were excluded before model parsing.
- Completed matching `processing_locks`, `processed_datasets` and final `batch_states`, final index348, and absence of matching documents in both checkpoint collections prove completion. No active parser lock at capture. The batch's separate `processedRows:321` counter is not the visited-row denominator; logs independently account for all348.
- Run output: **73 creates (55 standard/18 specials), 31 update operations, 101 distinct parent documents**. All101 were present. Repeated updates account for the operation/document difference; these counts alone are not correctness proof.

Today used prior immutable baseline `1c48a0bfe5fc38f7d202747110dd87e057485125`, revision `processdatasetresume-00470-kuc`. The later caption-provenance release did not produce today's parsing results. Fresh readback after that release shows the three parsers ACTIVE, 100% latest traffic, common source `df28d94839b6b87753805c08443d86da7a190ab8`: `processdataset-00507-mog`, `processdatasetresume-00471-kah`, `processdatasetselectedrows-00463-yir`. The resolver releases remain separate. Automatic recovery/creation gates remain OFF; old historical checkpoints remain retained.

## Coverage and limitations

- All **97 saved post decisions** reviewed: **47 Stage1 rejections and 50 downstream decisions**, including failures and safe holds. Captions, ordered available galleries, extraction/validation/formatted outputs, canonical siblings,31 update audits and public results were compared. A row-by-row adjudication is saved in `source-adjudications.json`; full348 terminal ledger in `full-row-decisions.json`.
- All **184 available original gallery references** visually reviewed: **85 accepted /99 rejected**, across21 contact sheets; dense Eastern Kings and Milton calendars independently opened at their retained original resolution. Original raw media URL reconciliation found **zero additional source media URLs outside the retained191-reference gallery** for these97 posts. This does not establish that the scraper captured every image available on Facebook.
- **Seven references unavailable**, not counted as visually verified: row67 image0; row199 image0; row215 image0; row216 images0–2; row265 image0. Row199's DJ/date remains unresolved. Row215 has explicit caption date/time/venue evidence but no image confirmation. Remaining missing rejected images are caption-only decisions; the missing imagery is not fabricated as supporting rejection.
- Complete app-equivalent active API query: `/api/v2/firestore/events?includeExpired=false&dateOnlyActivities=v1&limit=100`, pagination to exhaustion, **nine pages /895 results**. All101 affected detail endpoints returned200. **72 distinct managed event media URLs independently returned HEAD200**, no failure. Generated recurrence IDs were reconciled through `originalEventId`, not by parent ID alone.
- Normal signed-in Firebase CLI reads only; no service-account/ADC file reads or new credentials. No map interaction.

## Confirmed findings and proposed coordinated scope

### 1. Missing Bell Aliant leisure-pool session and narrow family-label omission

Source `1536820758465842`, row173, snapshot `parse_snapshots/1h-jAjJyKgD8CChB_A02mv3gxUg3szA2h_173_1792415075142`. The caption advertises three leisure intervals:05:30–16:00, **17:30–19:00**,20:00–21:00. The middle range is printed `5:30 pm 7:00 pm` without a separator. Extraction retained only two; canonical venue `slug_bellaliantcentre` has no middle occurrence and neither does the complete public feed.

Proposed data target: **one new October19 17:30–19:00 one-off occurrence**, not a replay or broad venue update. Preserve `pSWkryDJlTVGij7IjUtH` (05:30–16:00) and `nqcr6CjIR7UcLMrNafuS` (20:00–21:00), plus all four distinct lane-swim slots. In particular noon–13:00 `agD8GuCFbmSNr8LHYU4v` and13:00–16:00 `Hv9J295zlGA2Sr5ZtueV` are legitimate adjacent sessions, not duplicates. Recheck expiry and siblings immediately before a future apply; do not publish an already-ended recovery simply to make counts green.

The two existing leisure-pool occurrences score15 and have no family badge, while All pools open/Public Skate correctly score60, toddler pool70, French Club80 and DuffleBag100; adult19+ line dance correctly scores0. Serving aquatic title matching omits `Leisure pool open`. Extend the recreational pool rule narrowly with adult/lane/class exclusions; do not import family imagery or unrelated sibling text as proof.

### 2. Corrected pancake-breakfast start overwritten

Source `1752343520229723`, row321. Caption says breakfast `930-11am`; Stage3 correctly extracted09:30–11:00. Stage5.6's explicit-range recovery changed start to11:00. Update audit `event_update_audits/mLEvohUQgYEf2mHxkNIt` proves a **09:30 →11:00** overwrite of the existing corrected keeper:

`venues/1ehK5wrBKC460QSpqUMq/events/oct18audit_pancake_20261031_0930`

Both live detail and active feed show11:00–11:00 onOctober31, while the retained description still says09:30–11:00. The frozen serving parser's endpoint matcher accepts one/two-digit hours, allowing a suffix match within `930`; it then replaces a valid earlier stage clock. Fix full-token compact-clock parsing and make recovery/merge refuse a contradictory or zero-length downgrade. Restore this exact keeper to09:30–11:00, preserving ID/media/source history and original source wording. Halloween Hustle has no separate clock and correctly remains held.

### 3. Merchantman duplicate offers and invalid close boundary

Source `2018884169555793`, row208, explicitly daily14:00–16:00 and21:00–close. Six new recurring parents were created instead of matching existing offer families. Three offer clusters are source-supported:10 oysters/$20, Gahan16oz/$6, Benjamin Bridge5oz/$10. At the audit capture, **seven active night cards cover these three offers**, including all three new night parents; older oyster duplication also exists. This is three offer clusters, not seven separate defects.

Current source parents under `venues/slug_merchantmanpei/events/`:

- Day: `9KF9K6CVjNVwsXi9w2FY`, `I61Yc3pf2nZQYqP7WK8v`, `neiK6OnZ1P3HmYgySA0Q`.
- Night: `uoMdsISSOiE1B5NWowas`, `wXOg8BKjT6jY0FAu2hBd`, `7XcGF8lkQ8XlLqhRmwyL`.

All three new night parents/materialized occurrences are21:00–21:00: venue-close enrichment collapsed the interval onto its start. Preserve source `until close` and unknown actual finish when venue hours conflict; never publish an explicit zero-length supported range or invent22:00 from older records. Propose exact offer/price/size/slot-aware deduplication, complete sibling evidence and one keeper per supported slot. Do not merge day and night slots or broaden to all Happy Hour titles. `merchantman-source-clusters.json` retains exact canonical/public evidence. Existing recurring lifecycles require source review before retiring old families.

### 4. Milton weekly calendar: stale merge, category and sidebar date errors

Source `1935042294616439`, row319, retained original poster reviewed independently.

- October21 **17:30 Zumba** was formatted but merged into `venues/nvQTJXSbDsSfJTCxDKCH/events/0niGreSHiC7mgtbxUksA`, an oldOctober7 series bounded toOctober7 with totalOccurrences1. Today's merge updated media/source metadata without representing itsOctober21 source occurrence. Cross-source verification subsequently confirmed this public date is **already covered** by `venues/nvQTJXSbDsSfJTCxDKCH/events/0gGOviSZCv9OE2KhpL3Z` (Zumba Adult Fitness Class, October21 17:30, source1920077486112920). Fix expired-merge prevention; do **not** create another Zumba listing or reopen the old series. Bind today's proven source to the valid keeper only within an exact reviewed repair.
- October19 **09:00 Exercise** at `.../rQrKaA30QP3Rjpu4VVBS` became **Food Special**, while the same poster's Friday Exercise became Workshops & Classes. This is item/category leakage, not an advertised food deal. (Verify exact ID in the saved manifest: `rQrKaA30QP3Rjpu4VVBS`.) The adjacent free coffee may be a valid food offer; do not remove it simply because Exercise was misclassified.
- `.../5qGw3bLvoWGplnFuAiG8` advertises **Christmas Decor October22 18:00**, but its independent sidebar literally prints `Thurs Oct12 6p.m.`. The source's weekday/date disagree; do not move it into the mainOctober22 band or guess which date the organizer meant. Hold the unsupported publicOctober22 occurrence until corrected source evidence.
- Standard duplicate candidates form separate clusters for Friday Exercise versus oldMWF Exercise, October30 Zumba Gold versus old weeklyFriday, and Tuesday Mat Yoga08:15 versus oldYoga08:30. The first two are overlapping activity identities; the15-minute Yoga mismatch requires exact legacy source adjudication before mutation. No blanket recurring-parent deletion. Rehearsal/Celebration of Life publicity remains uncertain from a room-use schedule; no invented public admission.

### 5. New Glasgow attendee host replaced by shared organizer

Source `1540835551185689`, row142. Both captions explicitly support **Spooktacular Spaghetti Dinner Fundraiser, October25 16:00–19:00, New Glasgow Lobster Suppers**, adults15/kids10, children's carnival in the lower level. Extraction named the venue and a generic sentence as events, and formatting called the dinner a Food Special named after the venue. The shared food-origin guard then substituted **Rustico Ringette Association** as the place to resolve.

Private queue `unrecognized_venues/uv_62051ccb8d1f18656ed107f2`; **no public event**. Fix original-organizer versus explicit attendee-host precedence and retain fundraiser title/category/child evidence. Validate the canonical host before any targeted recovery; do not send attendees to the ringette organization or treat ticket-returnOctober22 as event date. This is stronger source proof than a generic venue-readiness rule; automatic gates stayOFF.

### 6. Off-season announcement falsely extracted as a current daily special

Source `122145650913157304`, row286: future restaurant setup says Fridays/Saturdays16:00–20:00, **“not sure when day1 is yet, SOON!”**. Output instead invented anOctober18 daily dinner special. It is **not live**: private queue `unrecognized_venues/uv_2f3b1e653da7fb7fb23057b8`, no canonical parent/public occurrence. Reject/hold not-started availability before recurrence/time enrichment, preserve the source's launch uncertainty and Fri/Sat limits. No missing venue resolution can make this unsupported launch date publishable.

### 7. Eastern Kings Stage5 failure and unsafe away-game candidates

Source `1676580473929337`, row235. Stage3 yielded17 items. The two ordered original posters distinguish **four AWAY games** from home activities; those four cannot be pinned to Eastern Kings. The second poster also printsThursdayOctober21 while the first printsOctober22. Stage5 matched count9, then count8 but failed source identity, retried a bounded four-item half and failed identity again. Two schema-shape warnings followed by terminal `stage5_contract_failed`; **no partial publication**.

Keep the identity/count guard. Add exact source-item matching diagnostics and the retained two-poster regression, exclude/hold away games and contradictory date/location items before formatting. A replay of all17 as public Eastern Kings events is unsafe; genuine home activity recovery still needs supported meridiem/venue/date proof.

### 8. Potter's Gallery strict-schema failure

Source `1677902190916269`, row253. Caption supports a public studio/gallery visitOctober18 10:00–17:00, including watching pottery and a photo invitation. The extracted title contains a newline: `Studio Stories\nThe Great Migration`. Two consecutive400 `invalid_json_schema` errors state that a newline is not allowed in the strict schema's sourceIdentity.name constraint. This was **skipped/held**, not one of the two terminal aggregate errors.

Normalize the identity representation before schema constraints and use the same reversible/canonical comparison on validation, preserving original caption/title evidence. Treat deterministic schema errors as nonretryable until the request changes. Recover source clocks without guessing; this source-day event is already expired, so no public backfill is recommended.

### 9. MacPhee's missing canonical address

Source `1535393265281917`, row57: free community BBQOctober19 11:00–13:00. Correctly extracted. Canonical `venues/DQWS0hMi8eZIyw3knhjC` has name/city but no canonical address, causing the required publication guard to abort. Correct catalog identity/address only after first-party verification; do not bypass the guard or invent coordinates. By audit time the BBQ ended, so no expired public recreation. The failure path also discarded stage usage from its snapshot despite five completed model calls; preserve diagnostics/accounting on terminal write failures.

### 10. Existing Souris show duplicate and historical-only items

The sameNovember18 19:30 **Lennie Gallant's Innkeeper's Christmas** survives in two public canonical records at Souris Show Hall: `cityrecovered_371494ff078fe977dbd01555` and `v6nhvS47PIV7bZqSfMqZ`. Today's row175 enriched the recovered keeper; it did not create both records. Consolidate only after exact retained source/keeper comparison, preserve proven links and remove public diagnostic prose from the reviewed keeper when approved within the exact plan.

Italian Buffet source rows69/70 is an expired duplicate pair with differing weaker opening-hours versus explicit16:30 start. Both absent from active feed; use as a prevention case, no urgent public cleanup. Seventeen affected nonrecurring parents had dates beforetoday, all createdtoday: elevenOctober18 and six older calendar/sidebar dates. Their absence from active feed is correct. Scheduled cleanup lists32 ended candidates globally,30 touched bythis run including13 endingtoday; these are not proven cleanup survivors and are not a broad delete request.

## Rejections, holds and healthy controls

Most47 Stage1 rejections are supported recaps, merchandise/services, closures,observances,online contests or insufficient activity evidence. Row41 scarecrow social-voting/drop-by language is an explicit public-display policy boundary, retained as uncertainty rather than invented visit hours. Five unavailable rejected image references prevent an image-complete rejection claim.

Twenty-five Stage5.6 missing-clock items remain held: dinner/soups4, music1, maze/park2, marathon1, Chef Harvest9, Lindy teaser1, post contest1, children courses2, Milton Treat DriveThru/craftfair3, HalloweenHustle1. Three earlier Stage3 held occurrences remain separate from that denominator. Other safe downstream holds include launch timing, ambiguous DJdate, route/season windows and venue room identity. No proposal relaxes clocks to increase acceptance.

Four unknown occurrences reconcile to three new review documents (NewGlasgow, FacultyLounge, PintsEast) and one updated HydePark review `uv_27875830ca6c01576d751d5c`. The provenance release does not repair them or make four ready plans; the historical4/4/0 readiness denominator remains intact.

Healthy cases: sixteen Downtown schedule slots assigned to their advertised venues; FrenchClub three future dates/age badge; comedy uses20:00 show with19:00 doors; PublicSkate/AllPools/Toddler badges;19+ line dance excluded fromfamily; source-unavailable evidence held; explicit weekly Hooks&Needles remains recurring; no film six-day span in current canonical/public output despite row112 intermediate span. Unknown finish cutoffs remain nonexplicit in source flags and are not automatically factual show ends.

## Standard audit results, scope and execution limits

Established eleven audit families executed over a fresh **typed REST inventory of1025 events/566 venues/97 snapshots**, using frozen serving predicates and a read-only offline adapter. Each script exited0; that means execution completed, not that every finding is a defect or that network checks passed.

- Midnight/false24h and operating-hours candidates:0.
- Aggregator: three snapshots, one comparable schedule,0 venue/start mismatches.
- Deadlines: three low-confidence historical candidates, none among today's101.
- Source/venue:0 high-severity global findings; today's publisher/host differences are source-supported aggregator/sharing cases, except the confirmed held NewGlasgow role bug above.
- Duplicates:5452 materialized occurrences,2548 groups,67 connected pair candidates globally,14 production-strict. **Five pair candidates touch today's parents; none production-strict.** One is the legitimate adjacent lane swim; oneLennie cluster; threeMilton activity conflicts. Merchantman offer duplication is additionally source-confirmed even though title/type heuristics missed it. Strict matching remains a review aid, never automatic deletion proof.
- Recurrence: eight touched warnings, six legitimate daily happy-hour families, healthy weekly Hooks&Needles, one expired Milton Zumba source merge. The Zumba public date is covered by another valid keeper. Global357 open-ended flags are not357 newly broken events.
- Shared images:12 global groups; common schedule poster across distinct children is valid and not a blanket image failure.
- Provenance: all101 affected parents have provenance;96 global missing entries are historical scope. No same-day missing-provenance claim is made from a sample.
- **Image-integrity offline report says1168 errors/0ok because external requests were deliberately blocked. It is an execution/coverage artifact, not1168 broken live images.** Replacement live checks cover all72 distinct affected managed media URLs:72HEAD200. Remaining historical image integrity was not live verified bythis audit.

## Actual models, usage, cache and latency

Actual call logs, rather than legacy override names: Stage1/2/3/5 **gpt-6-luna**; Stage4 **gpt-5-nano**. Stage1 high, Stage2 none, Stage3 high, Stage4 low, Stage5 none in frozen serving selection. All three current parser environments match; Stage4 compact remains enabled, Stage5 source identity/count protection remains, cache contract is unchanged by provenance release. Legacy model override labels do not describe the effective Luna allocations.

**321 successful timed model calls**, plus two schema-rejected attempts. Saved usage covers316 calls; the missing five are row57's completed calls before the publication exception. Stage3's usage bucket includes calendar/theme auxiliary calls, so it is not equal to the main extractor call count. Logged known total across all successful calls: **2,484,143 tokens**; two missing calls lack complete input/output/cache split.

| Stage | Successful timed calls | Median | Cumulative model seconds | Snapshot-usage estimated USD |
|---|---:|---:|---:|---:|
| Stage1 |102|8.162s|955.403|0.101903|
| Stage2 |59|3.534s|244.089|0.039185|
| Stage3 main |54|12.254s|875.869|0.108331 including auxiliary Stage3 usage|
| Stage4 |51|5.376s|340.467|0.022689|
| Stage5 |50|6.115s|455.802|0.028747|

Auxiliary: OCR7.827s, three calendar-inventory calls118.684s, theme-date map7.591s. Total cumulative model time **3005.732s** versus3609.636s elapsed; this is cumulative call time, not exclusive wall-time attribution. Saved316-call cost estimate **US$0.30168741**, plus missing row57 usage. Using the retained audited accounting rates and log totals gives a conservative modeled bound about **US$0.3050–0.3109** for321 completed calls; not an invoice, and excludes Apify/cloud infrastructure. Persisted cache input476,646 tokens and writes554,226 tokens are separately accounted; do not call cache writes cache hits or free input. No exact whole-run price is asserted from incomplete split data.

## Schedule ownership

`daily-post-parse-gathr-audits` is a real ACTIVE heartbeat, daily18:15UTC (**15:15Halifax ADT /14:15AST**), targeting `019e9cce-54e0-7460-81dd-966a7e07239c`, not this owner thread. Queue-owner schedule is ACTIVE on its separate thread; local clock has no explicit TZ field, so its exact timezone interpretation is being verified by the coordinating chat. This thread's `luna-dense-post-live-canary` and Oct15-only `luna-repaired-canary-next-full-run-audit` are both PAUSED. No active daily heartbeat targets this implementation-owner chat. No second watcher was created and no schedule was changed. Manual implementation ownership is distinct from actual scheduler targeting.

## Next authorized implementation phase

The coordinating chat independently observed the existing daily heartbeat execute onOctober19 in `Bad Event Remover`. Its narrower completion/catalog-integrity prompt does not perform this full97-source/gallery adjudication. No schedule was retargeted.

The coordinating chat forwarded Craig's instruction to finish the audit first, then fix all confirmed issues as a coordinated batch. This report is the audit milestone **before source changes**. Group prevention and exact repairs around: clocks/ranges and keeper protection; calendar item ownership/expired merges; offer identity and close-boundary safety; explicit host versus organizer/not-started offers; strict schema identities and failure accounting; narrow recreational-pool labelling.

Use existing immutable release candidates and preserve provenance changes; no new task/worktree/agent or automatic-gate change. First prepare exact target manifests and regressions, verify saved-source playback plus unaffected reviewed sources, then build/full tests/narrow release and fresh guarded repair receipts. No live correction has occurred at this milestone. Ambiguous source dates/away locations, seven unavailable images and legacy recurrence lifecycles remain held; implementation cannot fabricate their resolution.

## Local artifact bundle

`functions/artifacts/luna-oct19-production-audit/`: `audit-completion.json`, `completion.json`, `capture-summary.json`, `input-metadata.json`, `full-row-decisions.json`, `source-adjudications.json`, `gallery-manifest.json`, `raw-additional-media.json`, `held-item-adjudications.json`, `current-duplicate-pairs.json`, `merchantman-source-clusters.json`, `event-update-audits.json`, `written-events.json`, `written-api-details.json`, `active-api-feed.json`, `bell-aliant-public-readback.json`, `written-media-head.json`, `analysis.json`, `usage-by-stage.json`, `usage-by-model.json`, `latency-summary.json`, `runtime-summary.json`, `schedule-inventory.json` and `standard/` exact reports. Retained private source and canonical records stay local.


## Approved implementation follow-up — completed October19

The initial read-only audit was completed before code or production mutation. The confirmed batch subsequently shipped parser commit `b269f626d32436c0ff942b7a9e71328cf9f0b460` to all three entrypoints at common source `ce3ebb70913656bd000cea33a97822427b274a7b`; full1,094/1,094 and15/15 focused tests pass. On20:20:02UTC the exact26-action repair committed with24 complete typed archives and feed326→327. Nine-page/878-item active-feed,23 detail and17 media checks pass;85 unrelated venue events unchanged. Nine duplicate copies plus one unsupported-date listing were recoverably retired; two proven dated events were added. All six Merchantman keepers survive, with today's ended daytime slots correctly absent and three night offers active. No new Zumba, expired BBQ/pottery backfill, gates/checkpoint/schedule or map changes. Deliberate source/legacy holds are not declared resolved. See `docs/oct19-audit-repair-release.md`, final target plan/result under `firebase/artifacts/oct19-full-audit/`, and `functions/artifacts/luna-oct19-production-audit/implementation-completion.json` for exact commits/revisions/paths/backups/rollback and execution limits. Implementation validation used zero paid model calls.
