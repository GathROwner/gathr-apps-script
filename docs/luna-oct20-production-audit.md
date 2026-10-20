# October20,2026 source-to-output accuracy audit

**APPROVED RELEASE/REPAIRS COMPLETE; SOURCE-SEMANTIC COVERAGE QUALIFIED.** See `docs/oct20-source-semantic-coverage.md`:76individual downstream source notes,71generic rejection notes; exhaustive false-negative coverage is not established. Operational log coverage is explicitly partial. Owner chat `01a0ea83-7031-7423-b853-966f2180d186`. The 11:30 Halifax scheduled audit must reuse this report and its existing dataset key, not start another audit.

## Exact run and durable completion

- Regular POSTS actor `KoJrdxJCTtpon81KY`, successful actor run `gzzNWmRqsXHYptunL`; webhook `cUrUrrqRWiWkbNZUyVus`.
- Workbook/file `1IwZa8Q4SbsP745o5H_jVlIb11xXYnTST`, parser run `88a0dae3-b010-4ec8-b31d-b54eb1cd7329`.
- Original workbook SHA256 `e182faed3bed00239a019827a05382db6de2f81b97b69397a1ae48c60369b4ab`, 498,755 bytes, 370 data rows, 2,000 flattened columns. Original obtained through the existing connected Drive identity after Firebase CLI Drive scope returned403; no credentials/scopes changed.
- Started09:39:28.712 Halifax; completed11:15:31.170 Halifax, **96m02.458s**.
- Matching completed processing lock, processed-dataset marker, final batch at row370/370, and absent matching canonical/alternate checkpoint prove full completion. `processedRows:329` is not the visited-row denominator.
- **58 processed +223 invalid +89 skipped +0 errors =370**. The223 invalid rows reconcile as196 `no_items`,18 `not_available`, and9 pre-snapshot geography rejects. All147 remaining rows have saved decisions:71 Stage1 rejections and76 downstream decisions.
-122 creates (98 standard/24 specials);43 reported update operations;41 distinct audited update targets (one created earlier in this run);162 affected canonical records. All162 are independently attributable to this run's exact source IDs, not merely their creation time.

## Coverage and limits

Local evidence root: `functions/artifacts/luna-oct20-production-audit/`.

- The saved packet contains147source-caption/decision records.76downstream rows have individual source-specific notes;71Stage1rows have generic rejection wording. `adjudicate.py` sets both review booleans programmatically, so those flags alone do not prove147individual semantic checks or exhaustive missed-event screening. Recorded visual work is described below; exact qualification: `docs/oct20-source-semantic-coverage.md`.
-268 of274 parser-gallery references visually reviewed on31 contact sheets. Missing: row38 image0; row39 images0–2; row72 image0; row154 image0. Errors were DNS failures, not proof the original sources never existed. Full videos were not replayed; parser-available stills/thumbnails were reviewed.
- Original workbook reconciliation found **two additional shared attachment posters at row248** that the parser's media extraction omitted. Both were downloaded once and visually reviewed: total270 available images reviewed. See `supplemental-gallery.json`; original six failed references remain explicitly unverified.
- All162 affected event-detail endpoints200, all149 unique managed primary images HEAD200. Complete saved active feed:978 events over10 pages. These availability checks do not imply semantic correctness.
-10,000 execution log entries preserved through14:03:50.889UTC. One bounded continuation hitHTTP429 again. No further retrieval attempts. Final12minutes of detailed retry/timing/fencing chronology are unverified; durable full completion and full snapshot accounting are verified.
- No paid scrape/model/replay/reparse; no production writes, deployment, gate/checkpoint/history/contact/schedule changes during audit. Automatic-resolution architecture remains stopped.

## Serving runtime

All three functions independently ACTIVE/latest100%, common source hash `ce3ebb70913656bd000cea33a97822427b274a7b`, accepted immutable release `b269f626d32436c0ff942b7a9e71328cf9f0b460`:

- `processdataset-00508-kul`
- `processdatasetresume-00472-gef`
- `processdatasetselectedrows-00464-wic`

Actual configuration/environment hashes match the last verified release. Saved usage meters show402 Luna calls and81 nano calls; Stage4 uses nano, other metered stages Luna. Stage3 high effort, Stage4 low, Stage5 none; compact validation/cache contracts unchanged. Automatic existing/creation recovery switches OFF, allowlist absent. Separate resolver serving baselines are not part of this parser candidate or release.

## Confirmed findings, consolidated by mechanism

Exact canonical paths and source/body/version fingerprints are captured in `row-canonical-reconciliation.json` and the forthcoming guarded repair manifest. Proposed actions below are not applied results.

1. **Shared event wrongly hosted by reposting venue — row248, four records.** `1935901177863884` became three Haunted Woods dates plus Open Farm Day at Milton Hall. Original shared author is Trilby Lane Farm and Day Camps; two omitted posters specify804 Rustico Road. Caption17:30–20:30 conflicts with poster18:00–20:30 Oct23/30 and18:00–21:00 Oct24. Recoverably withdraw all four wrong-venue records; preserve source/media and hold conflict, no guessed relocation/time priority. Fix shared attachment extraction and disallow publisher fallback when original shared host differs.
2. **Same Scream Park programme pinned to two posting venues — rows314/315/342, five-record connected cluster.** Two sessions17:30–19 and19:30–20:30 Oct21 appear under Cornwall Town Hall and APM Centre; original row315 identifies Eliot River Scream Park. Do not keep five copies or claim the posting venue hosts it. Hold wrong-location copies pending exact attendee venue; retain distinct light/scary sessions and source evidence.
3. **Organizer operations published as public event — row274.** Home Decoration Contest judging6–10PM was pinned to Stratford Youth Centre. Poster distinguishes judging from public viewing Oct23–31; public viewing has no clock and correctly remains held. Recoverably withdraw judging, preserve public-viewing hold.
4. **Ordinary gallery story/hours became three events — row260.** Broken-teacup memoir plus Friday–Sunday gallery hours is not an organized exhibition opening/workshop. Three `A Cup of Tea not Meant to Be!` records should be withdrawn. Do not reject genuine dated exhibitions/open days by the same guard.
5. **Movie run treated as continuous attendance — row97.** `Winter of the Crow` parent spansOct19–24,19:00–23:00. Caption says opens tonight/plays untilSaturday, not continuous admission. ExactOct20/21 screenings already corroborated by row30 remain intact. Remove continuous-span interpretation; no invented22–24 performance clocks.
6. **Source roundup clock typo — row30 luncheon.** Raw caption explicitly says11:30PM; extraction copied it. Organizer Innovation PEI confirmsOct21 **11:30AM–1:30PM**, Delta18 Queen. Reviewed data correction may use this exact primary evidence; runtime must not silently inferAM because a title says luncheon. [Organizer](https://www.innovationpei.com/event/pei-export-excellence-luncheon/).
7. **Calendar end-clock certainty lost — rows121/155.** Seven newly created library parents lack `timeFlags`, showing synthetic two-hour ends. Eight Speaker's Corner sessions inherit overall13:00 end, also without flags. Preserve source-supported starts, mark genuinely absent ends unknown. Organizer explicitly says a different speaker every30minutes, supporting bounded speaker sessions; the ninth extracted venue-name heading should be a meaningful programme overview. [Organizer programme](https://www.innovationpei.com/event/business-marketplace-with-speakers-corner/).
8. **Category drift.** Live illusion `Mysteries of the Keyhole House` isCinema; Indigo Romance Book Club isLiveMusic; six weekday alcoholic specials areFoodSpecial; two ReadSingPlay programmes areLiveMusic. Correct only source-proven category fields, with meal/film/music healthy controls. Hauntacular and fitness-access categories are lower-priority polish, not date/location failures.
9. **Family evidence missed — row121.** Both library costume parties explicitly say“For families” and list stories/games/crafts/treats but score15. Correct source-backed audience evidence and exercise the existing scoring function; adult knitting/tech help remain unbadged. BAC pool family repairs and explicit18+ class exclusions remain preserved.
10. **Finite series flattened to one-offs — row268; protected legacy row326.** Three six-week class starts lost bounded continuation. Primary TinyTot page explicitly confirmsSaturdaysNov7–Dec12,09–10; AdultImprov FridaysNov6–Dec18,18:30–20,**noDec11**. Strut primary page conflicts with post (Nov4Wednesday18–19 vsNov5Thursday20); hold disagreement instead of choosing priority. Existing manual LindyHop eight-week city keeper received provenance only: do not silently overwrite that protected decision. [TinyTot](https://confederationcentre.com/event/tiny-tot-step-tap/), [Improv](https://confederationcentre.com/event/adult-improv/), [Strut conflict](https://confederationcentre.com/event/strut-heels-technique/).
11. **Daily Soup label mistaken for recurrence — row330.** Tuesday BeefChili was classifieddaily and merged into a legacyAugust24 daily LoadedPotatoSoup parent. Today's offered flavour did not become its own dated offer. Prevent brand-label recurrence; preserve the legacy parent until exact separate repair review, not a broad soup cleanup.
12. **Wrong stored coordinates cause local source exclusion — pre-snapshot row65.** Explicit IslandChefDownTown62 QueenPEI source matched `fb_100090273050576` withCalifornia coordinates35.1394/−120.6424, despitePEIaddress. Existing downtown venue `slug_islandchefdowntownloungeandeatery` corroborates62 Queen. Today's lamb product-only caption is not a proven missed qualifying deal; correct routing/quarantine inconsistent location evidence without weakening geography guards or inventing coordinates.

## All eight unknown outcomes reconciled

| Source row | Event misses | Outcome |
|---|---:|---|
|30 Coraline|1|Existing Marc's Lounge exact room named; no broad Brickhouse alias|
|31 BusinessWeek|3|Reused ignored organizer queue `uv_2e41e0f9dcad47f174b174a5`; zero public writes|
|211 Samuel's|1|“downtown location” misread asOntario; exact existing4QueenSummerside page identity; no source clock, no replay|
|297 Havenwood|2|Reused ignored `uv_ad7091e58731d1ee919c82b6`; currentOct24shows16/18 and135GreatGeorge explicitly proven; old reasonexpired is stale for this new source. Exact source-specific review needed, preserve general manual ignore|
|303 UPEI|1|Oct19booklaunch expired; no replay/backfill|

BusinessWeek primary pages corroborate Mall, TheAlley200Richmond and Rodd75Kent. They do not justify turning DowntownCharlottetownInc into a venue or reopening all ignored history. [Mixer](https://www.innovationpei.com/event/after-hours-member-mixer/), [Keynote](https://www.innovationpei.com/event/sbw-2026-breakfast-keynote-the-business-of-tourism-why-it-matters-to-all-of-us/).

## Correct protections and holds retained

- All16 BACOct21 and10BACOct20 outputs checked; noon–1 and1–4 lane swims remain separate, pool closures not public events, advertisedpublic windows preserved, start-only classes not given source-proven ends.
- FaithTalk rows178/180 andNatureTrivia320/321 merge to single keepers.43 update-audit documents cover41 distinct targets, including two targets each audited twice (source append followed by content/media update). One target was created earlier in this same run, so122 creates plus41 distinct updates minus1 overlap equals162 affected parents. No evidence of a resume replay causing these repetitions.
-322 saved checkpoint entries are monotonic through row311 in the available logs. Full final-window fencing chronology is not claimed. Final matching checkpoint absent and finalbatchcomplete.
- TorchRun route review `cityevt_84db7c99a808f479dad376bc` remainsheld; no RCMPofficepin/guessedroute. Older holds and manual decisions retained.
- Rejected scenic posts, ordinary menu/merchandise, nomination windows, completed outings, broadcasts/podcasts and private-party booking promotions upheld. Virtual parentingcourse row249 formatted but didnotpublish; rejectvirtual-onlycourses earlier under Craig's accepted scope. Four private team practices/canteenhours row318 are ineligible but alreadyOct19expired; no historicalcleanup.

## Cost and latency

Saved147snapshot meters contain **483 calls,3,752,943 tokens**. Same per-model input/cache/write/output accounting basis asOct19; estimatedUSD, not provider invoice:

| Stage | Calls | Estimated USD |
|---|---:|---:|
|1 validation|151|0.14812|
|2 classification|83|0.05637|
|3 extraction/inventory|88|0.18012|
|4 validation|81|0.03689|
|5 formatting|77|0.04665|
|OCR debug|3|0.00242|
|Total|483|**0.47057**|

`accounting-review.json` retains input/output/cache counts and rates. Partial logs show413 timedmodel calls totaling70m12s, withStage3 longest individualcall119.701s; these are partial-call sums and nested stage timings must not be added together. One compact-validation attempt failed and recovered, sevenStage3fallbacks, five exact-post-calendar review holds; no terminalparsererror. Full-run96m02 is independently proven. No additional paid calls were made to audit this run.

## Correction handoff

Audit review is finished with the stated source/log limitations. Next: freeze a narrow prevention patch with source fixtures/healthy controls, compile and run focused/full tests once on the final candidate; prepare recoverable exact-document repair manifest with fresh source/version/sibling/body checks, complete prewrite backup, atomic mutations and rollback plan. Independent bridge review must accept the frozen patch and dry-run plan before any deploy/apply. Preserve all contact fields, acceptedb269baseline, separate resolver releases, gatesOFF and historical checkpoints.

### Frozen review packet (not an applied result)

- Candidate `1af916041edb83753cb7f01ff3380ff0befe9c52`, direct parent `b269f626d32436c0ff942b7a9e71328cf9f0b460`;10 changed files,234 insertions/4deletions, original newline styles retained. Models/prompts/env/configuration untouched.
- Build,13 focused regressions and1,107 full compiled tests pass. A retained-source playback caught a missing judging-title case after the first green suite; that concrete case was fixed and both required gates rerun on the final source. Final test manifests prove no source changed during tests.
- Offline original370row/147saved-source playback: eight source-artifact changes reviewed; all10 formatted wrong-host items fromMilton/Cornwall/APM are held (nine distinct public records because one item merged). Two missing shared attachments now extracted in originalorder; home-decoration judging now held. This is not a paid/full model reparse.
- Exact55-action proposal:16 recoverable withdrawals,31 updates including queues/feed,8 exact source-backed creations (Coraline1,Havenwood2,AdultImprov5). Fresh feed340→341 proposed, not applied. No venue/contact writes.
- Existing Mall overview `Uy8r8W2L5GW7WF0fdNic` was found during sibling reconciliation: preserve it and merge proven source/media; retire the extra venue-heading event instead of renaming it into a second overview.
- Default-dry helper `firebase/repair-oct20-full-audit.cjs` reuses the final resource-name-corrected Oct19 committer and exact archive/rollback safeguards. Its source-occurrence check is scoped to exact source/date/clock/**venue**: a roundup may legitimately advertise different venues at19:00. First dry run stopped on that overly broad cross-venue test before any write; corrected exact-venue guard then passed.
- Dry run15:22:12UTC passed:55actions, sixnew/consolidated source media200, no active lock, three unchanged historical checkpoints, no alternate checkpoint. Full fresh backup `firebase/artifacts/oct20-full-audit/prewrite-backup-2026-10-20T15-22-12-606Z.json`.
- Review inputs: `functions/artifacts/luna-oct20-production-audit/review-ready.json`, `prevention-review.patch`, `repair-review.md`; exactplan `firebase/artifacts/oct20-full-audit/repair-plan.json`, SHA256 `3ec0e2959d870254664cf17fc242afab662f81ed7052986f64732ba269c3068f`.
- Explicit followups beyond this small patch: global finite-series/weekly-drink extraction, the protected legacy LindyHop shape, legacyRubySoup history and IslandChef verified-location repair. No new matching/recurrence/automatic-resolution engine is being built here. Wrong-host and contradictory current listings are quarantined by exact reviewed actions; no unsupported clocks or coordinates are invented.


### Revised independent review correction — not deployed or applied

The initial frozen packet above is superseded by child commit `e92b4924d348068ec17277a66d301c64db04b4bd`, direct parent `1af916041edb83753cb7f01ff3380ff0befe9c52`, preserving serving baseline `b269f626d32436c0ff942b7a9e71328cf9f0b460`. Independent review found that original absent-end metadata survived but the actual final completeness function retained generated clocks. The revision clears unsupported calendar/schedule ends through actual Stage5.5, Stage5.6, repeated completeness and final `processEvents` publication. Explicit printed ends, source-proven duration/overnight ends, ordinary event defaults, to-close instructions and specials keep their paths.

This intentionally changes preserved calendar/schedule `end.source=none` rows (not missing flags alone). Four legacy tests asserted generated two-hour ends for source text with only starts: Buenos SASS, Factory schedule karaoke, Milton Exercise, and Knit/Crochet Social. Their assertions now require unknown ends; healthy printed-range and duration controls remain. The first failed revision run is retained, not claimed green. Final unchanged-source manifests show **35 focused and1,112 full compiled tests pass**. Actual saved sources row121/155 independently pass the targeted end-time reproduction; local retained-source playback also verifies actual hours, completeness twice and publication with zero network/child attempts or paid calls. Scope and test classification: `functions/artifacts/luna-oct20-production-audit/independent-review-corrections.md`.

The exact55action targets and public patches remain unchanged. The repair guard now checks same-source/date/clock at the destination venue **and exact normalized item identity across other venues**, allowing unrelated roundup items elsewhere. Seven targeted pure-helper tests pass. New plan SHA256 `6f7654ebe185fb69f1638a4b6f52a6248104dfbfe1a67e852773a08c9af9d34b`; the only plan changes are parser commit and test references. Fresh dry run16:04:37UTC passed all55actions with no active parser, three unchanged historic checkpoints, no alternate checkpoints, six source media HEAD200 and zero live writes. Backup: `firebase/artifacts/oct20-full-audit/prewrite-backup-2026-10-20T16-04-37-095Z.json`. Feed340→341 remains proposed. All initial review/repair receipts and original assembly are preserved separately. Final review of the revised release and plan is required before deploy/apply.


## Final implementation and verification — complete

The revised child `e92b4924d348068ec17277a66d301c64db04b4bd` passed final independent review, was narrowly deployed to all three parsers, and is independently ACTIVE/latest100% at common source `7abb5795a9ef13d2f4d2d1d49749c5159eaf8775`. Exact same55actions applied16:17:49UTC/1:17p.m.Halifax:16withdrawals,31updates,8creates plus47complete recovery archives (102atomicwrites), feed340→341.51detail checks, complete963-event feed, all16retired parents/instances absent, all8creates at reviewed venues and12affected mediaHEAD200 verify.17whole venues/contacts,17source snapshots,123unrelated venue events and3protected records unchanged. Rollback dry run passes; three historical checkpoints unchanged, no active lock and gatesOFF. Source/configuration/IAM/secret binding/model/prompt and excluded release fingerprints preserved.

The first TinyTot postflight assertion incorrectly expected all6dates in a next-occurrence feed. That failed receipt is preserved. Six exact dated details return200/09–10 with lifecycle metadata intact; Dec19returns404. Actual app metadata fallback and weekly-through-Dec12 formatting preserve the bound. No second apply, backend expansion change, full feed rescan, paid replay, map interaction or OTA. Full evidence, backup, rollback and explicit remaining followups: `docs/oct20-audit-repair-release.md` and `functions/artifacts/luna-oct20-production-audit/implementation-completion.json`. Earlier pending/frozen sections above are historical preparation, not the final state.


Final independent closeout:29frozen +203applied/saved-public +28final checks passed; status `complete_deployed_applied_and_verified`, with no execution blocker or pending approved action. Receipt: `functions/artifacts/luna-oct20-production-audit/final-independent-verification.json`. Retained source-conflict/legacy followups remain as documented; no further execution was needed.


## Source-semantic / missed-event clarification

Accounting/release/repair completion is distinct from semantic recall acceptance.76downstream decisions have specific source notes (72main dictionary +4explicit fallback PASS notes);71Stage1rejections have generic wording.37model-identified multi-item posts all have individual notes, including8nonempty Stage3-to-formatted reductions, but no separately retained exhaustive source-first expected-event inventory exists.214scraperempty/unavailable placeholders cannot establish semantic recall;9geography rejects are separate, with source-specific row65investigation rather than uniform visual proof for all9.270available image references were recorded reviewed;6references/full videos remain uncovered.162source-attributed records/HTTP200checks do not themselves prove semantic correctness.

8missing canonical events were created; the TinyTot parent additionally restores5later Saturdays. Broader missed-series/legacySoup/LindyHop and source holds remain unresolved. Saved RoyaltyCrossing rows91/92 also show two same-venue/date/clock records despite a one-keeper note; source identity remains unverified, no added live repair. Detailed evidence/limits and future two-direction audit standard: `docs/oct20-source-semantic-coverage.md`; machine clarification: `functions/artifacts/luna-oct20-production-audit/source-semantic-coverage-clarification.json`. Original evidence is unchanged; no repeat audit/scans/tests/replay/deploy/apply occurred.
