# October 10: full-cohort Stage 2 Luna evaluation

## Decision

The full-cohort test is complete. Luna is substantially cheaper and faster, with
no new whole-post confidence rejection. It is not yet a clean recommendation
for 100% Stage 2: two mixed entertainment/food posts expose missing special
coverage. Correct and repeat those cases before increasing the allocation.
This evaluation changes no production settings or event records. Stage 2
remains at the approved 50%; Stage 5's separately approved 100% release stands.

## Cohort and method

- Completed regular October 10 dataset: `1a8FFxUSkseWH6poV4-Htdhv4BRUSNlZl`,
  run `cbce0e1a-1b7f-496c-8694-8045aac55edf`, 382 source rows.
- Replay every actual Stage 2 evaluation: **90 evaluations across 86 rows and
  85 unique post IDs**. Red Shores source `1806949754401894` occurs at both rows
  106 and 218. Four sources (37, 38, 111, 118) have both the initial four-image
  evaluation and the later full five-image evaluation. Rows not reaching Stage 2
  are outside this comparison's denominator.
- Use the deployed classifier and router code at checkout `0e024f6`, with a
  fresh Mini control and the current Luna none / high negative-review policy.
  All 90 first-request prompt hashes and ordered image hashes match across arms.
- Original ordered media were regenerated through the deployed preprocessing
  endpoint and frozen locally for both arms: 154 image references, 138 unique
  source paths. These are regenerated frames, not proof of byte identity with
  the already-cleaned production OCR temporaries. All 165 newly owned upload
  objects received successful deletion responses; existing managed images were
  not cleanup targets.
- Empty captions on three image-only sources were normalized to empty strings.
  Their six initial harness failures made zero API calls and are excluded from
  the final results. All 180 final paired classification records are present.
- The first offline router calculation lacked `ENABLE_STAGE2_SCORE_ROUTING`.
  Reapply the production router with the complete current environment to the
  captured classifications; no API output was changed or rerun for this fix.
  The published summary uses the corrected resolved routes.
- Replay the 15 final-evaluation route/OCR-mode differences through Stages 3–5,
  plus row 32 as a same-route control: **32 completed downstream dry runs across
  16 source rows**. Freeze Stage 1 and each arm's Stage 2 result; use Luna high
  Stage 3, Nano low Stage 4, and the approved Luna none Stage 5 in both arms.
  This isolates the Stage 2 comparison from the Stage 5 rollout.
- These local downstream runs disable writes, uploads, Places calls, and
  website/ticket enrichment. Venue hours come only from a frozen exact-name
  venue lookup. Name mismatches can hold untimed specials, so compare Stage 3
  and Stage 4 inventories as well as final dry-run counts. These runs do not
  establish production writer behavior or fresh venue-hours accuracy.

## Stage 2 cost and timing

USD token estimates using the recorded model rates; not a billing invoice.
Times sum API requests, excluding image preparation and other parser stages.

| Metric | Today's production Mini | Fresh paired Mini | Full-cohort Luna policy |
|---|---:|---:|---:|
| Evaluations | 90 | 90 | 90 |
| Actual requests | 90 | 91 | 95 |
| Estimated token cost | $0.239678 | $0.242482 | $0.078803 |
| Summed model-call time | 443.258 s | 444.371 s | 293.172 s |
| Median request time | — | 4.541 s | 2.910 s |
| p95 request time | — | 7.930 s | 6.311 s |
| Incomplete responses | — | 2 | 0 |
| Classifier fallback evaluations | — | 1 | 0 |

Luna costs **67.1% less than today's live Mini** and uses **33.9% less summed
model-call time**. Against the matched fresh control, reductions are 67.5% and
34.0%. This is a Stage 2 result, not a whole-parse speed or cost promise.

Luna made 90 none calls and five high review calls, at rows 106, 162, 195, 218,
and 345. There were no Luna request failures, incomplete responses, or classifier
fallbacks. Both arms hold row 195's undated Bookface promotion; the other 85 row
evaluations pass at their final evaluation. The fresh Mini control on row 31
hit its existing 1,500-output-token cap twice and used the classifier fallback;
that row is not evidence of a clean matched model decision. Luna completed it.

## Individual listing coverage

### 1. Old Triangle: confirmed dinner omission caused by route choice

Row 35, [source post](https://www.facebook.com/1737936975008400).
The caption lists Friday/Saturday music, a Sunday Irish session, and a two-course
turkey dinner on **Sunday October 11**, at **$24.95 plus tax**, while quantities
last. A dated advertised meal offer qualifies under Craig's special policy; a
discount is not required.

Mini marks events plus food specials and resolves to `MIXED_EVENTS_AND_SPECIALS`.
Stage 3 emits three performances and the dinner as `_sourceType: special`;
Stage 4 retains all four. Today's production Mini path also wrote the dinner.

Luna confidently labels this `SCHEDULE`, sets `hasFoodSpecials=false`, and calls
the dinner a regular-priced meal rather than a deal. Stage 3 still sees the
dinner but tags it as schedule content. Stage 4 then rejects it because a
non-calendar event lacks a required start time. Three music items survive.
The low-confidence negative review does not run: the music makes this a
high-confidence positive classification.

Both local final outputs happen to contain three items because the Mini dinner
later cannot resolve hours in the restricted fixture. That matching final count
does not erase the demonstrated Stage 4 loss in Luna's route.

### 2. Local Pub: featured evening cocktail omitted beside trivia

Row 53, [source post](https://www.facebook.com/1128140023071506).
The caption advertises tonight's bookable trivia and tonight's named featured
cocktail, **Warren Grove Sour Smash**. This is a specifically advertised evening
drink feature, distinct from an ordinary month-long menu.

Mini chooses the mixed route and Stage 3/4 retain trivia and the cocktail.
Luna chooses `EVENT`, reports no food/drink special, and only trivia emerges.
This is the same coverage weakness: a confident entertainment classification
does not check that a concurrent food/drink feature was preserved.

The Mini downstream formatter incorrectly labels its cocktail as an event;
today's live parse wrote only trivia. Thus this is a source-policy coverage
finding, not proof that switching Stage 2 deletes a previously correct live
cocktail record. Fixing Stage 2 alone is not sufficient evidence of a correct
final special; the regression check must include its final food-special type.

### Other routing differences

| Row | Result of paired downstream review |
|---|---|
| 13 | Both retain Coach's October 11 and 12 dinners through Stage 4; final untimed fixture holds are not Stage 2 omissions. |
| 38 | Both preserve the 10 lb / $8 carrot harvest deal, excluding ordinary stock. |
| 74 | Both preserve the seasonal culinary offer; Luna's extra undated event is rejected. |
| 77 | Both preserve the October 11 turkey dinner, 11 a.m.–7 p.m. |
| 89 | Both recover the cake/toddy pairing as a special despite different routes. |
| 98 | Both preserve all eight October 9-and-later music occurrences. Earlier October 1/3 dates differ because Stage 3's recent-past guard holds different evidence. Same calendar route in both; do not attribute this to a Stage 2 reject. |
| 139 | Both preserve the two hockey viewings and source starts, 2 and 5 p.m.; inferred ends differ in shared downstream processing. |
| 166 | Both final inventories retain exactly six pool/lane/slide windows. Luna's schedule route rejects closure notices earlier than the Mini calendar route. |
| 266 | Both retain the October 9 roast beef dinner and 3–6 p.m. window. |
| 308 | Both reduce the printed October 9–10 pub-grub offer to October 9 only. This is a shared Stage 3 date-coverage issue, also present in today's production output, not a demonstrated Stage 2 regression. |
| 312 | Both end held with no final listing; the undated Cinnalove teaser must not acquire a post-date event. |
| 341 | Both extract the October 11 advertised local-special launch. Nano Stage 4 rejects the Mini-route item but retains the Luna-route item: downstream variation, not a new Luna rejection. |
| 348 | Both retain the $1.49 day-old bread offer, excluding ordinary baking pickup as an activity. |

Row 32's same-calendar-route control has identical no-website Stage 4 holds.
It cannot reproduce today's website-enriched marathon listings with website
enrichment deliberately disabled. It is not a Stage 2 loss count.

## Next repair and release gate

Clarify the classifier's food-special policy for dated/one-day advertised meal
offers and named daily/evening drink features, including posts that also contain
music or trivia. Preserve exclusions for ordinary menus, restocks, inventory,
and undated product teasers. Do not indiscriminately turn food mentions into
specials or bypass the start-time rule for ordinary events.

Repeat rows 35 and 53 through final formatting, verifying the dinner date,
food-special identity, the named cocktail, and every entertainment item. Include
ordinary menu/restock controls and the valid dated dinner/bread/deal cases.
Once those checks pass, reconsider 100% Stage 2. This report does not deploy a
prompt change or authorize a production allocation increase.

Record the shared row 308 second-date omission, row 98 recent-past evidence
variation, row 139 inferred ends, and row 341 Stage 4 variation separately from
Stage 2 classifier quality. No live record changes were made by this test.

## Evidence

- `artifacts/luna-oct10-production-audit/stage2-100pct-summary.json`
- `artifacts/luna-oct10-production-audit/stage2-100pct-downstream-ledger.json`
- Private raw paired responses, source images, preparation manifests, logs, and
  dry-run stage objects: `C:\Users\craig\.codex\luna-oct10-audit\stage2-100pct-*`.
  Existing API credentials and function environment snapshots remain private.
