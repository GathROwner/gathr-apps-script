# October 20 audit: source semantics and missed-event coverage

This clarifies the completed audit using existing evidence only. It does not repeat the source review, download, scan, tests, paid replay, deployment or 55-action repair. The approved release/repair remains complete. **Exhaustive false-negative coverage is not established.**

## What the retained evidence establishes

|Layer|Established coverage|What it does not establish|
|---|---|---|
|Input accounting|370 input rows:196 `no_items`,18 `not_available`,9 pre-snapshot geography decisions,147 saved caption/decision records|370 manually readable/reviewed Facebook posts. The214 scraper placeholders contain no usable original source for semantic conclusions.|
|Individual semantic notes|**76 downstream rows have source-specific notes**:72 in the main notes dictionary plus4 explicit fallback PASS notes for56/91/92/94|147 independently documented semantic adjudications.|
|Stage1 rejected rows|71 saved source captions/decisions and the same generic rejection note for each|An individually justified rejection or exhaustive search for missed activities in every one of those71 posts.|
|Recorded image review|268 available parser-gallery image references on31 contact sheets, plus2 original shared attachment posters omitted by the parser and recovered in the earlier audit: **270 references reviewed**|All images on all370 rows, or270 distinct physical images. These are reference counts; duplicate posters can occur across posts.|
|Unavailable media|6 of274 parser references unavailable:row38 image0;row39 images0–2;row72 image0;row154 image0. With the2 supplemental references,270 of276 known references were available/reviewed|Semantic correctness of unavailable pixels. Full videos were not reviewed; available stills/thumbnails were.|
|Geography rejection|9 pre-snapshot rows accounted separately. Row65/IslandChef has a source-specific venue/geography investigation|Uniform caption/image/false-negative adjudication of all9. They are not part of the147 saved decisions.|
|Stored/public output|162 affected canonical parents attributed by exact source IDs and compared through saved row/canonical data;162 initial detail200 and149 primary-media HEAD200|162 separate semantic acceptance checklists, or correctness merely because an ID matches and an endpoint/image works.|

`adjudicate.py` assigns `savedDecisionReviewed` and `captionReviewed` to every record programmatically. Those booleans alone are not proof that all147 received independent manual semantic review. The four fallback PASS notes are genuinely source-specific; they are not generic rejection mistakes. The original adjudication file is preserved unchanged.

The substantive downstream source comparisons are recorded in `source-adjudications.json` and `ledger.json`, with saved captions/gallery identities, extracted/formatted items and held decisions. `row-canonical-reconciliation.json` carries the actual matched stored fields: identity, venue, dates/clocks, category, recurrence, family score, description, source IDs and media. Initial API bodies are in `written-api-details.json`; the applied batch’s final bodies/feed are in `firebase/artifacts/oct20-full-audit/postflight-details.json` and `postflight-active-feed.json`.

## Partial posts and false negatives

All **37 posts with multiple Stage3-extracted items** have individual source notes. Eight have a nonempty reduction from Stage3 inventory to formatted outputs:12/31/71/121/199/274/287/319. These are model-inventory accounting counts, not an independent count of every source activity; venue rejection can also drop a formatted item later, as Coraline demonstrates.

There is **no separately retained exhaustive source-first expected-event inventory** for each usable post. Stage3 inventories are model output and cannot prove the model did not omit an activity entirely. The existing work therefore supports concrete missed-event findings and reviewed holds, but not a dataset-wide recall percentage or “no events were missed.” The71 generic Stage1 rejection notes are a particular false-negative evidence gap, even though their source bodies are retained.

Concrete source-first comparisons and corrections include:

|Source|What the original source established versus output|Completed correction|
|---|---|---|
|Row30, source `1569882561845942`|Coraline advertised at Brickhouse **in Marc’s Lounge**; formatted item failed room resolution|1 exact venue event recovered; compound-room guard added.|
|Row297, source `1729981745801342`|Two October24 Havenwood shows at16:00/18:00; an old ignored queue entry blocked current-source publication|2 exact occurrences recovered while general ignored history remains protected.|
|Row268, source `1517127330452637`|Six-week classes became one-offs; organizer primary evidence supplied actual finite dates/clocks|5 additional Adult Improv documents created; Tiny Tot’s existing first date became6 bounded Saturdays, adding5 permitted dated occurrences without5new documents. Strut’s conflicting evidence stays held.|
|Row248, source `1935901177863884`|Original shared attachment posters were absent from parser media; venue/clocks disagreed with publisher-derived outputs|2 posters recovered during the earlier audit; wrong-host outputs withdrawn; attachment/host guards added. This is not an automatic repair of conflicting farm clocks.|

Exactly **8 missing canonical event records** were created:1Coraline+2Havenwood+5AdultImprov. Tiny Tot additionally restores5later Saturdays under its existing parent. These are concrete recoveries, not an overall missed-event rate.

Not every known/potential miss was repaired: row31’s3blocked organizer outcomes are not automatically3misses (a Mall overview already existed); row326’s protected LindyHop finite-series/location shape and row330’s dated soup merged into a legacy flavour/recurrence remain unresolved. Missing-clock/locality/route evidence stays held rather than being labelled automatically invalid or published with guessed facts. Broader finite-series and weekly-drink extraction is still a prompt/code followup; deployment does not repair untouched historical records.

## Additional retained identity inconsistency

Reconciling saved notes also exposes a limit to treating notes as blanket acceptance. Row92 says the same market/keeper merge was checked, but `row-canonical-reconciliation.json` retains two records at Royalty Crossing on October31,09:30–17:00: `venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ` (Artisan Market, row91/source1613223867129593) and `venues/slug_royaltycrossing/events/7ZldwUnCeCMmPsvxIwD6` (Halloween Market, row92/source1613077720477541). This is an **unresolved source-identity/possible-duplicate observation**, not a newly verified deletion target. It was not repaired by the55-action batch. No new source/live scan or write was performed to settle it.

## Standard for future audits

Audit both directions: source → expected eligible activities (false negatives), and final stored/public event → exact source support (false positives). For each usable source, record a source-first activity inventory independent of Stage3, including “none” with a specific reason. Include Stage1 rejects, geography rejects, held/skipped sources and partially published multi-event posts. Classify true misses, correct holds, expired/ineligible items, duplicate/merge representations and unavailable sources separately. Track unavailable images/videos as unknown coverage. Compare supported venue/date/time/recurrence/category/family/provenance/media fields with final canonical and API outputs. Record recurring error mechanisms and focused prompt/code fixtures with healthy controls.

Completion of row accounting, deployment tests or repair verification must not be represented as exhaustive semantic/recall acceptance. Machine-readable clarification: `functions/artifacts/luna-oct20-production-audit/source-semantic-coverage-clarification.json`.
