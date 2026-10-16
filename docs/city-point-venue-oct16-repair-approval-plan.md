# Exact city/venue duplicate repair approval plan — October 16

Status: **approved, applied and verified** on October16. Craig approved this exact batch after the parser/finalizer safeguards were deployed and independently verified. Historical planning text below describes the reviewed delta; completion evidence is appended at the end.

## Short approval summary

- Delete twelve confirmed copies: ten Beaconsfield city roots plus the two conflicting Ireland city listings.
- Retain all twelve dated Beaconsfield venue occurrences; enrich ten with the first-party poster and retired source links. The October30 and November6 keeper documents remain unchanged.
- Retain the existing October16 Ireland venue record, 19:30–22:00. Correct its scope/explicit clock evidence, use the original poster, retain all three galleries/source links, and state doors18:30 in its description.
- Redirect thirteen historical source reviews to the retained records; preserve original source clock evidence and signatures.
- Advance only runtime_metadata/event_feed283→284 so clients refresh.
- No new event, October23 recovery, venue/profile change, media deletion, family-label change, or replay.

Total:12 deletions,11 retained-event updates,13 review updates and1 feed-marker update =37 document mutations, now applied with the exact delta verified.

## Backups, guards and verification

Default-dry helper: `firebase/repair-city-point-duplicates-oct16.mjs`.
Saved plan: `firebase/artifacts/city-point-repair-oct16/repair-plan-2026-10-16T17-16-31-069Z.json`.
Full dry-run backup: `firebase/artifacts/city-point-repair-oct16/prewrite-backup-2026-10-16T17-16-31-069Z.json`.

Apply requires the exact saved plan, no active parser, unchanged target/source/reference versions and related sibling inventory, and identical bytes for the reviewed original posters. Delete targets have no subcollections or positive stored app social counters. Any drift aborts; it must not be bypassed. A new full prewrite backup is taken immediately before the transaction. All updates preserve untargeted fields, venue documents and media objects.

After exact approval, use ANCHOR_CREDENTIAL_PATH pointing to the existing main-checkout credential (never copy/print it), and:

```text
node firebase/repair-city-point-duplicates-oct16.mjs --apply --plan=firebase/artifacts/city-point-repair-oct16/repair-plan-2026-10-16T17-16-31-069Z.json
```

The helper verifies every document against the exact expected delta. Coordinator then verifies retained/deleted API details, every retained occurrence and the complete active app feed. Expected:one October16 Ireland venue event with19:30–22:00 and description doors18:30; twelve Beaconsfield venue dates with17:30–18:30, zero deleted root copies, both untouched extra dates intact; no removed media. This is a backend/data correction; no new OTA is needed.

Read-only verifier: `node firebase/verify-city-point-repair-oct16-readonly.mjs --after`.
Its before-mode baseline passed25 detail checks, the complete1,057-event/11-page
active feed and both original poster HTTP checks. Baseline artifact:
`firebase/artifacts/city-point-repair-oct16/before-api-verified.json`.

## Exact targets

| Action | Exact path | Event/date or purpose | Changed fields |
| --- | --- | --- | --- |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/nOe87zqZqhoBvkqeGl3i` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-16 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_7d7d4053ff64811a1f22ebe4` | Beaconsfield By Candlelight (House Tour) 2026-10-16 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_4f6c94a8e9429d6ccee727c3` | Beaconsfield By Candlelight (House Tour) 2026-10-16 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/nOe87zqZqhoBvkqeGl3i` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/xHDwARCZtjlQ207ZY2lJ` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-17 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_5a7c469a8efbf9b43c609d59` | Beaconsfield By Candlelight (House Tour) 2026-10-17 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_01bda2e55237f73f702c81db` | Beaconsfield By Candlelight (House Tour) 2026-10-17 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/xHDwARCZtjlQ207ZY2lJ` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/a1WCQNq2GPrG3uZ2QlME` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-20 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_9a70fad3d6292b757b758d03` | Beaconsfield By Candlelight (House Tour) 2026-10-20 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_1518c20f60c455e4b16918b2` | Beaconsfield By Candlelight (House Tour) 2026-10-20 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/a1WCQNq2GPrG3uZ2QlME` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/Sgm2qZ0dMqMXCpm8v3VD` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-23 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_b786467fd664c009634513a2` | Beaconsfield By Candlelight (House Tour) 2026-10-23 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_cc6e4aa4be2f2df8d7f9a7e4` | Beaconsfield By Candlelight (House Tour) 2026-10-23 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/Sgm2qZ0dMqMXCpm8v3VD` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/tqcAnE97TrFfjkDH9dsn` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-24 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_700c176abcaaf44095e1d491` | Beaconsfield By Candlelight (House Tour) 2026-10-24 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_464c1ab6b390a7f627e98fec` | Beaconsfield By Candlelight (House Tour) 2026-10-24 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/tqcAnE97TrFfjkDH9dsn` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/GzdKRqP193kemtBpJtP2` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-10-27 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_7807b84bbdbd780f8dbb28c1` | Beaconsfield By Candlelight (House Tour) 2026-10-27 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_f3bfe93f4c067a530ff42f3a` | Beaconsfield By Candlelight (House Tour) 2026-10-27 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/GzdKRqP193kemtBpJtP2` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/n9HKeELCJLOgeuVfU746` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-11-03 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_e42c579614efcf82bae40a02` | Beaconsfield By Candlelight (House Tour) 2026-11-03 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_c2a21e7b199fb4ff06c3c094` | Beaconsfield By Candlelight (House Tour) 2026-11-03 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/n9HKeELCJLOgeuVfU746` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/FzKxjLZKWZyviU4BlUv0` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-11-07 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_180a5aad7404509c0396110d` | Beaconsfield By Candlelight (House Tour) 2026-11-07 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_c1e3bfe7ff58d83918453134` | Beaconsfield By Candlelight (House Tour) 2026-11-07 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/FzKxjLZKWZyviU4BlUv0` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/37JlimkZ56KyeXVtrV59` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-11-10 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_ee85c1617f8af969a9d089be` | Beaconsfield By Candlelight (House Tour) 2026-11-10 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_ca1518a5c9cb47a9d90f764c` | Beaconsfield By Candlelight (House Tour) 2026-11-10 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/37JlimkZ56KyeXVtrV59` |
| update | `venues/DqhaDw4xcuBFIm6WCQSq/events/KlVm64xsYOnRA6zOP3vw` | Beaconsfield Historic House - Spooky Season Evening Stories (19th century true crime tales) 2026-11-13 | imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls |
| update | `city_level_event_reviews/cityevt_f5d737d1d6f644c605688a08` | Beaconsfield By Candlelight (House Tour) 2026-11-13 | publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/location_026862b9a02d1999f835622d` | Beaconsfield By Candlelight (House Tour) 2026-11-13 | Retained at `venues/DqhaDw4xcuBFIm6WCQSq/events/KlVm64xsYOnRA6zOP3vw` |
| update | `events/location_4a31a72846d2aabe0ca31f21` | From Famine to Freedom: A Musical and Storytelling Journey 2026-10-16 | locationScope, locationPrecision, mapMode, description, imageUrl, image, relevantImageUrl, mediaUrls, imageProvenance, sourceUniqueIds, sourceUrls, timeFlags, timeResolution |
| update | `city_level_event_reviews/cityevt_cbb1f0ed500402f7e9d5ede5` | Ireland, From Famine to Freedom* 2026-10-16 | status, publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes, finalization |
| update | `city_level_event_reviews/cityevt_f19b13983b98ad9bc1c310e4` | Ireland From Famine to Freedom* at the Benevolent Irish Society (BIS) 2026-10-16 | status, publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes, finalization |
| update | `city_level_event_reviews/cityevt_eb41eaa00118c6919af02b9e` | From Famine to Freedom: A Musical and Storytelling Journey 2026-10-16 | status, publishedEventId, publishedEventPath, resolvedVenueId, resolvedLocationScope, resolutionNotes |
| delete | `events/cityevt_cbb1f0ed500402f7e9d5ede5` | Ireland, From Famine to Freedom* 2026-10-16 | Retained at `events/location_4a31a72846d2aabe0ca31f21` |
| delete | `events/cityevt_f19b13983b98ad9bc1c310e4` | Ireland From Famine to Freedom* at the Benevolent Irish Society (BIS) 2026-10-16 | Retained at `events/location_4a31a72846d2aabe0ca31f21` |
| update | `runtime_metadata/event_feed` | Feed refresh  | version |

Source evidence and current-serving diagnosis: `docs/city-point-venue-oct16-audit.md`. Private full before-documents, source snapshots, dates, gallery URLs, versions and field values are in the pinned backup/plan.

## Approved application and verification

Craig's direct `I approve` authorized this exact plan. The pinned helper applied
it on2026-10-16 at18:12UTC after fresh source/target/sibling/media checks and
parser-idle checks before and within the transaction. No drift was bypassed.

- Fresh full backup: `firebase/artifacts/city-point-repair-oct16/prewrite-backup-2026-10-16T18-12-13-885Z.json`.
- Applied result: `firebase/artifacts/city-point-repair-oct16/applied-2026-10-16T18-12-13-885Z.json`.
- Exact37-document delta verified by rereading every target/reference.
- Feed version advanced283→284.
- Read-only public verification: `firebase/artifacts/city-point-repair-oct16/after-api-verified.json`.
- All25 detail checks passed:12 deleted details404;13 retained details200 with correct venue scope, dates, explicit start/end flags and clocks. Both untouched Beaconsfield extra dates remain intact.
- Complete active feed:1,044 events across11 pages; no deleted IDs/materialized copies, and every active keeper appears once.
- Both original posters returned200. Venue documents, media objects, untargeted fields and family labels were preserved.

The existing Ireland keeper retains19:30–22:00 and its original poster, with
doors18:30 in its description. No October23 event was created. No replay or new
OTA was performed or needed.
