# October 28: dated-offer availability batch

Status: prepared, not deployed or applied. Craig accepted the policy in direct message `01a1853b-aab2-77f1-a4b6-a439209b0682`: “I agree. That sounds perfect”. This authorizes the implementation/preparation described here; the two new venue records and exact live batch still need their single scoped approval.

## What changes

A date-specific, one-off food/drink offer without advertised clocks may use verified relevant service hours as **inferred availability**. Both endpoints remain estimated, with the existing information indicators and an explanation in the description. This does not assert an organizer-advertised arrival time. Explicit clocks, meal periods, happy hours, scheduled sessions, recurring offers, unresolved locations and source holds retain their restrictions.

| Offer | Current → prepared |
|---|---|
| A&W Charlottetown, 650 University Avenue, October 31 | Unpublished → inferred 06:00–02:00 next day, at the existing branch. |
| A&W Summerside, 451 Granville Street, October 31 | Unpublished → inferred 06:00–23:00; create its missing canonical branch. |
| A&W Stratford, 2 Jubilee Road, October 31 | Unpublished → inferred 06:00–23:00; create its missing canonical branch. |
| PonyBoat Halloween drinks & treat bags, October 30 | 12:00–23:00 category default → inferred bar availability 12:00–02:00 next day. |
| PonyBoat Halloween drinks & treat bags, October 31 | Unrelated party-page start22:00/category-default finish23:00 → inferred bar availability12:00–02:00 next day. Remove the exact unrelated party ticket links. |

All times are America/Halifax. October31 overnight windows finish November1 after the DST transition; local02:00 is06:00UTC. A&W overnight continuation is inferred from the business service day, not a separately advertised November1 promotion. The descriptions explicitly advise confirming availability, especially after midnight. A&W original children/costume wording supports family badges; the prepared payloads score70. PonyBoat remains below the family threshold. PonyBoat's kitchen16:00–00:00 and separate22:00 party do not define these drink offers.

## Evidence and limits

The original October27 A&W post `1939264440811908`, row61, explicitly names Summerside, Charlottetown and “Startford” (the source typo). Caption:

> FREE BUDDY BURGERS FOR HALLOWEEN SPOOKTACULAR AT A&W PEI LOCATIONS. Calling all little ghosts, superheroes, princesses, and monsters! This Halloween, come visit A&W Summerside, Charlottetown and Startford in your Halloween costume! October31st. Wear your Halloween costume. Get a FREE Buddy Burger! Bring the little ones, show off those amazing costumes, and celebrate Halloween with us. It's going to be a spooktacular treat!

Original saved photos, already inspected and shown in this chat:

- [A&W original1](</C:/Users/craig/Documents/Codex/2026-10-28/task/media/61-stored-0.img>)
- [A&W original2](</C:/Users/craig/Documents/Codex/2026-10-28/task/media/61-stored-1.img>)
- [A&W original3](</C:/Users/craig/Documents/Codex/2026-10-28/task/media/61-stored-2.img>)

The three canonical managed URLs were fetched read-only and exactly match the inspected saved image bytes. All three images are retained on each branch offer. No image upload or deletion is proposed.

PonyBoat original October27 post `1119028204045061`, row329:

> The boos are calling. Catch our Halloween drinks & treat bags this Friday & Saturday!

[Saved original video thumbnail](</C:/Users/craig/Documents/Codex/2026-10-28/task/media/329-stored-0.img>) was inspected; the complete video was not reviewed. Existing native media, IDs, source dates and engagement remain unchanged.

Current exact Places identities and date-specific periods support the branch/bar windows. The [current University Avenue branch page](https://web.aw.ca/en/locations/8211/charlottetown/charlottetown-pei) corroborates that branch's hours. [PonyBoat's official site](https://www.ponyboat.ca/) distinguishes bar and kitchen hours. No source advertises these promotion clocks. A historical2017 A&W all-day-burger statement is context only; it is not proof of current branch-specific burger clocks. The accepted inference policy bridges that uncertainty explicitly.

## Exact data scope

Five create-only documents:

1. `venues/place_1e2f9d0e542ba3ee` — A&W Summerside, PlaceID`ChIJ571_XDOFX0sRM3b7VCuBD-g`,451GranvilleSt.
2. `venues/place_2cc92170c21a5ff3` — A&W Stratford, PlaceID`ChIJN1PPfABTXksRcuo2xiQ9iZ4`,2JubileeRd.
3. `venues/fb_100041851131270/events/oct28_offer_6daec721e57fa963d685` — Charlottetown offer.
4. `venues/place_1e2f9d0e542ba3ee/events/oct28_offer_ecda0aa5fb4e449ad639` — Summerside offer.
5. `venues/place_2cc92170c21a5ff3/events/oct28_offer_394b02b6c932936ec99f` — Stratford offer.

Two masked updates:

- `venues/slug_ponyboat.socialclub/events/p8g8rifF2A2XS9h6Xhty` — Friday.
- `venues/slug_ponyboat.socialclub/events/bgZo98tQM6AFZN1eQ9eI` — Saturday.

Both update masks contain description, startTime/endTime/endDate, timing, timeFlags/timeResolution, and identity-bound audience evidence/score/hash/version. Only Saturday additionally deletes ticketLink/ticketsBuyUrl, and only if each still equals `https://www.ponyboat.ca/events/saints-sinners-halloween-party`. No original source/gallery/engagement/ID/parent field is changed. No Facebook page, scrape configuration or alias is invented for the new branches. Existing Charlottetown/PonyBoat venue records and the A&W manual queue remain unchanged.

One create-only typed prestate archive `event_repair_archives/O28_OFFER_SERVICE_HOURS_20261028` and one serialized feed increment complete the **nine-write** batch. Fresh readback observed feed497;498 is proposed only while that version is still owned and unchanged. A changed feed/version/source/sibling/branch identity requires a fresh guarded plan, not a bypass.

The exact full typed before/after payloads are in [PREPARED_OFFER_BATCH.json](</C:/Users/craig/.codex/worktrees/post-reuse-oct26/gathr-apps-script/functions/artifacts/oct28-repairs/offer-service-hours/PREPARED_OFFER_BATCH.json>), digest`86058f5342aad031a5f2143ad7107c7eec68cdfc81630d7c7a73e116b528652f`. Fresh capture saw568venues, zero active locks, no A&W published source matches and exactly two PonyBoat source matches. Preparation is not a completed transaction/dry run.

## Parser release scope and gates

Isolated candidate `functions/artifacts/oct28-repairs/offer-hours-candidate`, branch `codex/offer-service-hours-20261028`, commit **`4a803f5df2078dbc66c046bd91eb85f49cb8cf68`**, starts from immutable serving commit`0e9403a1ab789ef61afa4a0777fa7bc180373abc`. It changes only the offer service-hour path, narrower special-offer website identity, the final venue/proof bind and associated tests/types. It rejects ambiguous branches, mismatched civic identities, wrong-date/truncated/split hours, missing closes, mixed food-service premises and failed lookups; all held cases retain the hold through later fallbacks. Estimated windows cannot partially overwrite an existing different clock during duplicate merging.

The source-backed repairs are not automatic three-branch creation. Automatic venue resolution/creation and date-only publication gates stay OFF; response reuse remains parked OFF. Models, efforts, prompts, cache/compact contracts and unrelated serving files/configuration stay at the immutable baseline. No paid replay or app OTA is needed for this existing timingV2 contract.

Release only the codebase-qualified processDataset/processDatasetResume/processDatasetSelectedRows functions after final independent review, committed exact package, build/testing and parser-idle readback. Perform the narrow official CLI dry run before deployment; stop on any additional service/permission mutation outside approval. Independently verify all three ACTIVE/latest100% at one new source hash, matching source/environment/configuration. Then apply the exact recoverable data batch only after fresh external and transactional idle, target/source versions, branch absences, sibling/reference/child state and feed ownership checks. Persist full typed prewrite backup, use create/version preconditions and one atomic transaction, report commit immediately, and verify exact native deltas plus all five details, both venue routes and the complete active feed. No automatic rollback or historical helper rerun is authorized by this plan.

Validation:66focused tests passed; the full compiled run had1320passes and one stale, unchanged spatial-test expectation. That failure reproduced on the immutable serving baseline. The corrected spatial file then passed2/2, asserting existing source-owned spatial priority and input/clone isolation. All reviewed runtime files are unchanged since the full run. `offer-service-hours/VALIDATION_RECONCILIATION.json` records the exact distinction; this is not a claim of one green full-suite execution. No runtime behavior was changed to satisfy that old expectation. Existing full-suite results are reused rather than rerunning unchanged suites.
