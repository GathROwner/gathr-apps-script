# Named venues incorrectly published as city events — October 16 audit

Status: diagnosis and offline source playback complete. Craig subsequently
accepted the recommended hardening, with the timing policy below. Implementation
is pending; no parser change, deployment, paid model call, replay or live-data
mutation was performed by this audit.
Craig requested a small audit of three phone examples before further work.

## Accepted doors/start policy

Craig prefers the scheduled activity/performance start in the app's existing
time row, with doors opening stated in the description. Use that policy in the
implementation and regression controls. For Ireland the row is19:30–22:00;
the description says “Doors open at6:30p.m.” Preserve independently evidenced
doors metadata when available, without adding another time-row field. Doors
opening alone does not prove an activity/performance start; retain the distinction
and existing missing/conflicting-time holds. A structured Facebook start matching
doors can explain the discrepancy, but is not proof by itself: the October12
19:00 value still conflicts with the source's19:30 show and18:30 doors. Do not
claim all clock differences are solved by classifying doors.

Acceptance covers the recommended prevention work. Historical repair still
requires the exact reviewed keeper/delete/review delta and source/media retention
plan, rather than treating candidate IDs as approval for unspecified mutations.

## Findings

| Phone example | Creation and route | Cause | Current prevention |
| --- | --- | --- | --- |
| Beaconsfield By Candlelight (House Tour), October 16 17:30 | Source `2000138767801772`, October 2 full parse, dataset `1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq`, row349; approved recovery October2 | Classifier counted Beaconsfield Historic House plus its contextual city as separate locations. The recovery helper assigned the correct existing venue but explicitly wrote city scope and omitted time provenance. | Fresh serving classifier playback now returns one venue with no review reasons. That deployed fix does not repair the old records. |
| Ireland From Famine to Freedom at the Benevolent Irish Society (BIS), 18:30 | Source `1091879233223535`, August24, dataset `17yx_sSeBzNiM_-p_SqbUCh9UNN3tW4RS`, row24 | Structured Facebook Events adapter trusted `Location: Charlottetown, PEI`, ignored the venue in the title, and automatically published a centroid event. | Still open in the serving adapter and publication gates. |
| Ireland, From Famine to Freedom, 19:00 | Source `1408391401435421`, October12, dataset `1BNqV1lXFSI_7lMHmr-BxmHCOlMVFkafi`, row0 | Same structured shortcut. Poster explicitly names BIS, October16/23, 19:30–22:00, doors18:30; the adapter copied Facebook's UTC19:00 local start without examining the poster. | Still open; source conflicts need validation/hold rather than silent priority guesses. |

The two Ireland snapshots each record **zero model calls**. Their only saved
stage is the deterministic adapter's `format` result. This was not a Luna
misclassification or Stage3 vision failure.

### Additional related live records

Beaconsfield has **ten** top-level recovered records, all with canonical
venueId `DqhaDw4xcuBFIm6WCQSq`, city scope and point map mode. All overlap
existing venue-scoped records on the same date/start. The twelve venue records
cover all twelve source-advertised dates, including October30 and November6.
The October2 format snapshot contained twelve outputs but only ten distinct
dates: November10/13 repeated and October30/November6 missing. This is old
inventory evidence, not an omission in the current twelve venue records.

A third Ireland record already resolves to `slug_irishculturalcentre` at
19:30–22:00: `events/location_4a31a72846d2aabe0ca31f21`. It was recovered on
October13 from source `1559194202673746`, dataset `1BNqV1lXFSI_7lMHmr-BxmHCOlMVFkafi`,
row1. Its approved recovery also hardcoded city scope. The source explicitly
gives 582 North River Road and the BIS organizer, matching the existing venue.
All three Ireland listings concern October16; exact source corroboration and
canonical keeper selection are required before merging their different clocks.

The original third source was held because the classifier treated the full
postal address and its truncated `582 North River Road, P.O` prefix as separate
places. Fresh serving playback still reproduces that false multi-location
classification. The inline labelled-location extractor's sentence split at
`. ` truncates `P.O. Box`; the line extractor retains the full address and exact
label deduplication cannot reconcile them. This is another current code gap.

The official BIS website and the poster both advertise October23 too. No
matching Ireland October23 record was found in the captured collection-group
inventory. Treat that as a separately reviewed recovery candidate, not
permission to expand a structured October16 occurrence during this audit.

## Source verification

- Downloaded and personally inspected all four retained original managed
  source images, each HTTP200; original snapshot media ordering was retained.
  The August Ireland image is artwork without venue/clocks; its title supplies
  the venue. The October12 Ireland image is the explicit 19:30–22:00 poster.
- Beaconsfield's first-party poster prints the named house/address, all twelve
  dates, 17:30–18:30 and doors17:00. The [Government of PEI release](https://www.princeedwardisland.ca/en/news/haunting-season-at-pei-heritage-sites-0)
  independently confirms the same inventory and time, separately from Orwell.
- The [official BIS website](https://bisofpei.com/) identifies the Irish Cultural
  Centre at 582 North River Road and lists this show on October16 and23. This
  corroborates venue/date identity; the retained poster supplies the exact clocks.
- Fresh API details for the three examples and the additional Ireland record
  all return200 with `locationScope: city`. This is incorrect persisted scope,
  not a new frontend classification bug. End clocks are present in Firestore
  and API, but explicit provenance was lost in the publishing/recovery route;
  the app consequently displays an unknown end. Do not invent a new end time.

## Exact code trace and serving evidence

Current parser functions are ACTIVE on one independently reread source hash
`ccae940c2d876badd058c446071d54a5cf0cb12d`:

- processDataset: `processdataset-00493-pog`, northamerica-northeast2.
- processDatasetResume: `processdatasetresume-00457-vaz`, northamerica-northeast1.
- processDatasetSelectedRows: `processdatasetselectedrows-00449-kit`, northamerica-northeast1.

Downloaded processDataset's immutable serving archive generation
`1792149582769592`. Its `rowProcessor.ts` and `spatialEventClassifier.ts` are
byte-identical to this checkout. No inference from checkout age was needed.

1. `functions/src/processing/rowProcessor.ts:isCityLevelFacebookEventLocation`
   accepts the structured city flag; `processRow` skips row venue/address lookup.
2. `buildStructuredFacebookEventScraperEvents` copies title/UTC clock and the
   broad city label, prepares display media, and avoids the five model stages.
   It does not inspect title/poster venue evidence or clock conflicts.
3. `processFullParserEvent` cannot resolve a venue from the adapter's city-only
   establishment and queues the city candidate.
4. `functions/src/services/firestoreService.ts:evaluateCityLevelAutoPublishEligibility`
   treats structured title/UTC/location field provenance plus a supported PEI
   centroid as sufficient. No countervailing venue/poster evidence gate exists.
5. `buildPublishedCityLevelEventData` publishes that city record. Its city/area
   builder is deliberately not a normal venue-event factory; do not casually
   add venue scope to its normalization and bypass venue validation.
6. Unchanged-source signature skipping preserves the previous result. A code
   deployment will not itself revisit or correct these historical documents.

Historical helper causes are exact:
`C:/Users/craig/Dev/gathr-apps-script/firebase/apply-approved-location-queue-2026-10-02.js:eventFromReview`
and `apply-approved-location-queue-2026-10-13.js:eventFromReview` explicitly write
`locationScope: 'city'` after resolving a physical venue, and copy clocks without
their source flags. Do not reuse these historical apply scripts as templates.

Offline execution of the **serving compiled classifier**, using saved full
captions, retained spatial evidence and both available description previews,
returns venue twice for Beaconsfield and false area twice for the postal
address case. Genuine multi-venue and route controls remain area/route.
This bounded playback is not a fresh extraction or paid API comparison.

## Recommended narrow implementation, before any cleanup

1. **Generic Facebook location guard** in `rowProcessor.ts`: before the
   structured shortcut or city auto-publication, reconcile explicit event-venue
   mentions in title/full caption against existing venue identity, address and
   exact aliases. A confirmed single venue can override a generic city label.
   An organizer name alone cannot. An explicit unresolved venue must hold for
   resolution rather than auto-publish as city-wide.
2. **Bounded poster validation** only for ambiguous broad-location structured
   sources with usable original media. Reuse the deployed Luna/image safeguards
   and existing source/time contracts. Inspect named venue and printed clocks;
   retain structured occurrence identity, preserve doors separately, and hold
   conflicting sources rather than unconditionally trusting either clock. No
   all-post vision pass, new model rollout or missing-image fallback is implied.
3. **Postal-address parser guard** in `spatialEventClassifier.ts`: preserve
   postal abbreviations and reconcile duplicate mentions of the same explicit
   street-number/address. Never collapse different numbers, genuine rooms,
   independent venue names, routes or real festival locations via fuzzy matching.
4. **Validated publication/recovery fields**: use a common verified-venue
   payload/validator for resolved point events, preserving correct venue scope,
   exact precision, canonical ID/address and explicit time provenance. Keep the
   city/area finalizer restricted to genuine broad events; reject contradictory
   venue-bound point publication instead of silently defaulting to city.
5. **Versioned validation and duplicate controls**: an old content signature is
   not proof that a new venue check ran. Record bounded location-validation
   version/evidence, preserve human rejects/holds and exact occurrence clocks,
   and test old city-to-venue resolution against an existing canonical event.
   Do not expand broad time tolerance or merge solely on venue/date similarity.

Planned focused regressions: title `at [known venue]` with generic city; a poster
venue missing from caption; structured/poster clock conflict and doors-only
time; unavailable poster; a true city event; independent organizer/ticket outlet;
the postal abbreviation collision and different-address controls; one house
with many dates; genuine multi-venue/route cases; reviewed venue scope and clock
provenance surviving refresh; old unchanged-source validation; same event
cross-posted with conflicting clocks versus two genuine separate sessions.
Use minimal synthetic fixtures, not credentials or production snapshots.

Expected commands: `npm run build` in functions; the compiled Node test files
for `spatialEventClassifier`, `rowProcessor.spatialEventRouting`, structured
Facebook Events, venue matching, city auto-publication and approved occurrence
deduplication; then the full compiled backend suite. Actual filenames/command
list must be pinned to the isolated implementation commit. No tests were added
or claimed passing for unimplemented guards in this diagnostic audit.

After approval, implement from an isolated exact serving baseline, preserve
accepted releases/models/prompts, pass offline replay and regressions, then
perform the qualified three-parser dry run/deploy only while idle. Any changed
finalizer must use its independently verified serving baseline and narrow
target. Code release and historical repair remain separate gates.

## Historical repair candidates — no write authorization

Beaconsfield: review ten overlapping city roots versus the twelve complete
venue occurrences. Do not create more dates. Select keepers using original
media, source provenance, social state and exact date/time; retain every source
link and redirect corresponding resolved reviews. A cosmetic scope-only change
would leave duplicate events. The candidate roots are:

| Date | Top-level candidate |
| --- | --- |
| October16 | `events/location_4f6c94a8e9429d6ccee727c3` |
| October17 | `events/location_01bda2e55237f73f702c81db` |
| October20 | `events/location_1518c20f60c455e4b16918b2` |
| October23 | `events/location_cc6e4aa4be2f2df8d7f9a7e4` |
| October24 | `events/location_464c1ab6b390a7f627e98fec` |
| October27 | `events/location_f3bfe93f4c067a530ff42f3a` |
| November3 | `events/location_c2a21e7b199fb4ff06c3c094` |
| November7 | `events/location_c1e3bfe7ff58d83918453134` |
| November10 | `events/location_ca1518a5c9cb47a9d90f764c` |
| November13 | `events/location_026862b9a02d1999f835622d` |

Ireland: reconcile `events/cityevt_f19b13983b98ad9bc1c310e4`,
`events/cityevt_cbb1f0ed500402f7e9d5ede5` and
`events/location_4a31a72846d2aabe0ca31f21`, plus their three city review records.
The source-supported event is at the existing Irish Cultural Centre,
October16 19:30–22:00, doors18:30, $25. Preserve original poster and all source
identities; do not simply change all three to venue scope and leave duplicates.

A subsequent combined repair plan must list every keeper/delete/review delta,
pin live/source/sibling versions, save full prewrite backups under firebase,
default to dry run, require exact approval, preserve all media/venue documents,
and verify Firestore, detail endpoints and the complete active feed. No such
apply/deletion has occurred. Additional October23 recovery needs its own exact
reviewed inclusion in that batch.

Private evidence and read-only helpers:
`functions/artifacts/city-point-audit-oct16/`: `live-evidence.json`,
`trace-evidence.json`, four downloaded images, `api-evidence.json`,
`serving-parser.json`, `serving-resume.json`, `serving-selected.json`,
immutable `serving-source.zip`, and `serving-playback.json`.

## Approved prevention and separate repair follow-through

After this read-only audit, Craig accepted the prevention recommendations and
specified actual show start in the time row, with doors opening in the
description. Implementation/release evidence is tracked in
`docs/city-point-venue-oct16-release.md`. Parser `8e366b3` and separate finalizer
`b4bc732` passed their focused/full suites and source playback. This supersedes
the diagnostic-only implementation status above without rewriting its evidence.

The exact historical repair was prepared and dry-run verified in
`docs/city-point-venue-oct16-repair-approval-plan.md`:12 duplicate deletes,
11 keeper updates,13 review redirects and1 feed marker. Craig subsequently
approved this exact batch; it applied at18:12UTC with full fresh backup and
exact-delta verification. Public verification passed25 details, the complete
1,044-event/11-page active feed and both original poster checks. All12
Beaconsfield dates remain; Ireland retains19:30–22:00 with doors18:30 in the
description. Result/backup paths are recorded in the plan. No additional date,
venue/media deletion, family relabelling or replay was included.
