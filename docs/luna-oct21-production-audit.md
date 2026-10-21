# October 21 regular parse — source-to-output audit

Audit checkpoint: October 21, 2026. Dataset `12JeGpiiUUUPe-fLKJdqOax9-hpfKFuw2`, run `011bd5a6-7d1a-4a2b-ac70-20846d2fc53c`. One audit; no fresh scrape, paid model replay, catalog integrity bundle, parser deployment or audit repair write. The separately completed gallery repair is not repeated.

## Completion and serving

The regular run completed all 371 rows, 12:39:18.578–14:24:25.563 UTC (105m06.985s). Completed processing lock, processed marker, final batch371/371, no matching checkpoint and no active parser are captured in `functions/artifacts/luna-oct21-production-audit/completion.json`. Marker partitions:64 processed,213 invalid,94 skipped, zero errors.92 creates and61 update operations;61 updates address60 distinct documents, including three created within this run.149 distinct written event documents;170 formatted events are not170 writes.

Fresh readback: all three parsers ACTIVE, common Firebase source hash `7abb5795a9ef13d2f4d2d1d49749c5159eaf8775`;100% latest traffic on `processdataset-00509-xat`, `processdatasetresume-00473-veb`, `processdatasetselectedrows-00465-nop`. Immutable candidate `e92b4924d348068ec17277a66d301c64db04b4bd`. Automatic existing-venue resolution and creation remain OFF. Raw contract readbacks and environment fingerprints are retained; old MODEL_OVERRIDE variables must not be mistaken for effective pilot models.

## Actual review coverage

Original371-row workbook retained with origin/SHA receipt.166 rows contain source post IDs;205 are scraper placeholders(187 no_items,18 not_available). All166 original captions and available shared captions were reviewed before comparison, including eight pre-snapshot exclusions.158 parse snapshots and61 update audits captured. Frozen source-first inventory SHA256 `8d9adfd96287bd1752e9f599679c69b33993e503d022278c3c6fd65d6320a569`; separate166-row reconciliation retains expectations, published paths, held counts and findings.

265 media references;254 available references comprise246 unique byte hashes. This owner rendered28 sheets/245 references; location owner/parent rendered the other nine references. Ordered galleries were retained. Eleven references unavailable(115,123,126×2,226,268×5,335);39 raw rows have video fields and full videos were not watched. Row245 poster fine print is too small to establish dates. No claim of complete unseen-video recall, an exhaustive eligible-event denominator or a100% recall rate. Cached image bytes were reused; prior semantic conclusions were not.

One identity-only event projection selected exact run-source matches;150 linked/context/audited event documents and58 venues captured, including149 written targets.83 exact target documents and public detail APIs were freshly checked; all83 APIs returned200. This is source attribution, not another broad catalog audit.

## Confirmed actionable mechanisms

| Finding | Source rows | Result / correction boundary |
| --- | --- | --- |
| Distinct food bundles merged |12|$45 bundle with1lb wings absorbed by$35 bundle. Both were extracted. PastOct20: prevention, no expired recovery. |
| Distinct skating sessions merged |306|Stage5–6 at16:30 andStar3+ at18:45 lost after formatting; bare programme names bypass existing skating guard. Canteen operating hours also published. PastOct20: prevention. |
| False daily soup |316|New Tuesday Beef Chili offer became daily. Repair only `venues/ZDUj9euh7NVJ6INSlHM8/events/DwVqsfFeIpWm7CmrenTs`; legacy soup parent is separate protected context. |
| Missed aquatic family suitability |66|Two Leisure and Toddler Pools Open slots score15; plural/conjunction gap in current rules. Preserve negative lane/adult/closure controls. |
| Unsupported end |200|New `venues/slug_cornwallpubliclibrary/events/lJueyzn54aCUhXCItb0P`19:00–23:00; source only7PM, end.source:none, category_default. SourceType null bypasses calendar-only end guard. Fresh API confirms. Preserve19:00; remove invented23:00. |
| Reintroduced market copy |51,53|Royalty Crossing Artisan Market and vendor spotlight Halloween Market are sameOct31 market. Exact keeper/history/source/media check before consolidation. |
| Reintroduced luncheon PM typo |36|New23:30 copy contradicts already reviewed organizer11:30–13:30 keeper. Reuse exact organizer proof; no automatic AM guessing from title. |
| Calendar venue/date leakage |202|Extra CrapaudOct27 16 borrowed Kinkora cell. Correct CrapaudOct31 13 andKinkoraOct27 16 already exist. Withdraw extra, retain two correct records. |
| Ineligible retail discount |123|20% seniors front-store offer became recurring Food Special. Preserve distinct eligible09–18 pharmacist clinic. |
| Conditional screening |135|Blair Witch needs15 commitments; source update says8. Hold publication until confirmed. |
| Item category inheritance |101,149,195,201|Apps/pitchers inherited Trivia; contractor information evening and library cooking demonstration became Food Specials; pottery sale/social inherited Live Music. Source-local category correction. |
| Cinema masthead duplicate |141|Extra CITY CINEMA duplicated supported Second SundaysNov15 16. Other eight no-clock film runs remain held. |
| Trivia duplicate / live-music clock conflict |36,115|Darcy triviaOct22 21 has two title variants. Travis roundup23 vs host22 must hold conflict rather than guess priority. Original row115 image unavailable in this capture. |
| Mixed retail source missed food discount |142|Edible squash3.99→1.99 present among garden/decor pictures; Stage1 rejected. Bounded fixture/prompt correction, not general retail acceptance. |

Detailed exact paths, source captions, media indices and decision rationale: `functions/artifacts/luna-oct21-production-audit/source-output-dispositions.json`. O21-16 is a ruled-out price suspicion, not another defect: posters confirm Boston$15 pitchers and Carrefour child$3/adult$6/family$12. O21-17 records coordinated holds, not additional automatic repairs.

## Holds, protected decisions and owner boundaries

Reuse `firebase/artifacts/location-queue-leads-2026-10-21.md` from the location owner. Province House is one three-source schedule with five held review outputs, not five silent misses. Ceremony10:00 explicit; parade09:30 endpoints and tours start not established. SideDoor evidence lacks operator equivalence. Stratford address/time proven but event past. Cornwall row200 already owns the reception; row323 resolution must not create another. Month-long art show requires visiting-hours support, not an invented clock.

PEERS row172 matched an Oct13 manually approved event with exact venue/address but stale city-scope fields. Preserve its protected decision and report an exact scope correction separately. Low-resolution junior curling, unavailable sources, ambiguous midnight dates, generic drink-offer clocks and non-food retail policy questions are not silently promoted to proven repair candidates. Consecutive printed pool slots remain distinct; no automatic location gate, paid replay or queue recovery was enabled.

## Accounting, retries and evidence limits

Snapshot actual usage:506 calls;3,465,939 tokens(3,104,413 input,361,526 output). Actual models: gpt-6-luna422 calls/3,111,246 tokens; gpt-5-nano84 calls/354,693 tokens. Cache reads788,798 input tokens; cache writes725,281. Counts include three OCR-debug calls, not three additional calls. Input/output/cache counters are usage evidence; dollar billing is not available from these snapshots and no price-table estimate is presented as invoice cost.

| Stage | Calls | Input | Output | Cached input | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
|1|160|1,328,365|100,309|531,709|10,440|
|2|93|568,421|15,722|117,299|2,578|
|3|85|677,672|124,163|0|677,417|
|4|84|295,316|59,377|19,200|0|
|5|81|222,903|59,818|120,590|23,119|
|OCR debug|3|11,736|2,137|0|11,727|

Retained first1000 exact run/file log matches. Pagination hit HTTP429; no repeated retry. Full per-stage latencies, retry causes, every intermediate resume checkpoint and per-stage dollar costs are **not proven** by this partial log capture.158 snapshots versus160 stage1 calls and79 selected stage3 rows versus85 stage3 calls must not be relabeled as confirmed duplicate writes. Final completion/zero errors is proven; full monotonic-history/fencing proof remains limited.61 update operations versus60 targets includes a repeat operation, not proof of unintended repeated writes. No paid audit calls.

## Recommendation and implementation checkpoint

Source-to-output review is complete within the explicit coverage above. First prepare four small existing-mechanism fixes: bare skating programme identity, explicit same-source bundle distinctions, dated Daily Soup lifecycle, plural/conjunction recreational aquatics; also close the explicit-missing-end boundary with actual Cornwall saved-source/write-path regression. Freeze exact data corrections/retirements and source evidence for independent review before applying. Larger cross-gallery identity and protected-location work must be scoped explicitly, not hidden in a broad metadata redesign. Global fence, cache/layout redesign, automatic venue gates and broad historic cleanup remain paused.

This document is the audit checkpoint **before** parser source edits. No completed deployment, data repair, complete log audit or automatic hours fallback is claimed here.

## Tested preparation after the audit checkpoint

Candidate branch `codex/oct21-source-audit-guards`, clean committed `d8267e1b05dcad86d9814c2524491f8d4f05be24`, checkout `C:/Users/craig/.codex/worktrees/o21guard`, descends directly from immutable e92b492. Eight runtime files change52 added/16 removed lines; nine saved-response test groups plus eleven original row fixtures. Build passes;52 focused and1,121 full compiled backend tests pass. No new paid calls. The first broad end predicate failed six compatibility checks; the second failed one. Those failed receipts are retained. The final predicate preserves existing event-tagged and ordinary music/nightlife duration policies and adds only untyped, explicitly timed Gatherings & Parties to the existing calendar/schedule absence guard. The actual Cornwall saved response passes hours resolution, completeness, public processing, replay and real write-payload preview with19:00 retained and no end.

Candidate also protects bare STAR/Stage programme identities and explicitly different same-source plus-separated food bundles; prevents bare Daily Soup branding from establishing indefinite recurrence; scores open Leisure and Toddler Pools wording; holds canteen hours, non-food front-store discounts and the explicitly unconfirmed screening; corrects the five source-local category cases. Stage1 gains one explicit mixed-gallery edible-discount clarification; no paid evaluation claims that the model now passes row142. Models, efforts, cache/compact contracts, schemas, queues and location gates are unchanged. No global fence/metadata redesign, general venue mapping or cross-gallery vision architecture is added.

### Exact data batch ready for independent review

`functions/artifacts/luna-oct21-production-audit/repair-plan.json`, SHA256 `5960061950bfdfa3753bc95821599bbb986accaad00092016f330245267229be`:20 exact event documents,12 updates/eight archive-and-delete actions. With20 complete typed archives and the feed archive/update,42 atomic writes are proposed; feed358→359. Updates cover soup lifecycle, two pool scores, Cornwall end, five categories and three duplicate keepers. Retirements cover Royalty/luncheon/trivia copies, wrong Crapaud occurrence, non-food retail discount, unconfirmed film, cinema masthead and conflicting Travis listing. The film/Travis evidence remains held in the recoverable archive; no source-priority guess or queue resolution.

Keeper updates preserve primary media, original primary provenance, clocks and counters, while appending exact same-occurrence sources and supported secondary media/provenance. Complete retired originals preserve their counters/history. No storage media are deleted. Seven affected sibling collections were captured and checked; the dry run aborts on any version/field/sibling/feed drift. Dry run and owner verification pass. Full typed review capture and generated42-write body are retained locally. `apply-reviewed-repair.cjs` defaults to dry-run, requires an exact independent approved result for apply, verifies idle state twice and archives all original fields before the atomic commit. Its commit receipt prevents accidental reapply. No apply receipt exists and live writes remain zero.

Still pending: independent exact candidate/manifest/source review, source-preserving deployment assembly and qualified release gates, then authorized atomic repair plus public detail/complete affected active-feed verification. No second human approval is requested for this already authorized batch. PEERS protected manual scope remains a separate explicit review; location owner holds remain with that owner. General automatic visiting-hours extraction/Places fallback and a wider cross-gallery association solution are not claimed complete. Market/luncheon/trivia prevention beyond current selectors still needs the narrowly scoped source-identity follow-up; this candidate must not be described as a universal duplicate fix.

## Execution closeout — supersedes pending release/apply above

Independent review found and corrected real soup recurrence suppression and typed provenance timestamp loss before any live change. Final commit `c5e2f2644ec9558b55be19b36e342fa06d93a48a` passed build/27 affected cases, reusing earlier unchanged52/1,121 receipts. All three parsers deployed and verified at common hash `8c014dae9dbbc3a36c4f76746fdd65883c965aee`, latest100%, unchanged configuration and separate resolver releases, gatesOFF. The exact unchanged20-record plan applied16:43:13.999125UTC,42atomicwrites/feed358→359.20details,947-event complete feed,14affected venue feeds,14venue/contact controls,31unrelated sibling controls,21typed recovery archives and five affected media checks pass. Rollback dry-run passes and was not applied. No repeat audit or paid replay. Full evidence and remaining separately scoped limitations: `docs/oct21-source-audit-release-and-repair.md`.
