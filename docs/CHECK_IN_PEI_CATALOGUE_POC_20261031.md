# PEI OSM catalogue proof of concept

Local-only implementation, starting from497680f50644abb694d4d01e667645ed3b18e8ee. No deployment, push, production data write, paid service, new persistent infrastructure, security/credential change or private-check-in policy change. The coordinator separately owns full-app native acceptance and any future release decision.

## Actual source and artifact

Official source: https://download.geofabrik.de/north-america/canada/prince-edward-island-latest.osm.pbf

PBF11,583,438bytes; publishedMD5 verified `99fac4174cd8981c42a2557c372288e4`; computedSHA256 `12d783b94e75d8964d2d562bd79233a03abddb3398bd5ba09d86672dc24bc1fa`. Actual PBF header and official replication state both report2026-10-29T21:21:26Z, sequence4951. The official `.poly` extent SHA256 is `cf82eb5db24067be8e4783c93df71ac1d4d026eb8dbb1ced83f2648cb84d66e7`.

Offline pyosmium4.3.2 was installed only into the workspace-local tools directory. The importer makes no network/Firestore calls and accepts no proprietary GathR input. Required missing/cyclic/unbounded references or checksum/extent failures abort before replacing the prior artifact.

| Source measurement | Count |
|---|---:|
| All nodes / ways / relations |1,574,264 /173,399 /2,283|
| Named nodes / ways / relations |2,474 /19,177 /1,381|
| Named amenity/shop/tourism/leisure nodes / ways / relations |982 /1,213 /24|
| Output identities |2,219|
| Complete supported closed-way rings |1,210|
| Complete open/non-area ways, center-pin policy |3|
| Complete recursively bounded relation pins |24|
| Missing required references / bounded geometry limitations |0 /0|

No relation exclusion zones were introduced: the existing parser uses relation center pins, not multipolygon footprints. All24 centers match full recursive member-bounds midpoints, preserving that policy without extra restrictions. Complete closed-way coordinates are retained, including large footprints whose pins lie more than175m from an eligible query point.

The derived JSON is956,453bytes, SHA256 `19434ebbc8799f40f9a5da499a5a127b12ebf66aaae5b45afa9603fc88236f8c`. It is lazy-loaded only by discovery, integrity-checked, and remains separate from canonical venues and user authorization documents. The current raw source does not contain a named Holy Whale record; this catalogue is mapped OSM coverage, not proof that every business exists in OSM. No venue repair or fabricated record was made.

## Lookup and compatibility

The entire175m search circle must fit the official polygon, including holes, with a conservative boundary margin. A bounded regional full scan then uses the existing parser, public category/privacy filters, exact point/footprint distance, canonical response deduplication and20-result preparation cap. No catalog records are truncated to meet a scan limit.

Inside covered fresh data, discovery makes zero Overpass requests. Stale/future, invalid or unavailable catalogue data yields honest partial preparation retaining valid canonical choices; no hidden live dependency is introduced. Outside the pilot extract, the original bounded two-operator Overpass path remains, so this is not a permanent PEI-only geographic restriction. The local POC maximum data age is7days; this is not an approved Production maintenance agreement.

Candidates retain the legacy `source: openstreetmap_overpass` compatibility discriminator accepted by separately deployed bind/create functions, plus truthful `catalogSource: osm_regional_snapshot`, `catalogVersion` and `catalogSourceTimestamp`. Each returned target still gets a fresh owner-bound UUID,15-minute TTL and existing one-use/idempotent arrival pipeline. No catalogue coordinate counts as user presence. Auth, rate guards,30/90second dwell, departure/accuracy rules and private sharing remain unchanged.

An additive optional public `locationKey` response field exposes the existing OSM identity (`external:` plus32hex digits from type/ID hashing) for exact client re-resolution across refreshed UUIDs. It is not authorization. Bind/create still accept only the owner-bound candidate UUID and enforce its expiry/consumption and session/arrival checks. Canonical/private response behavior is unchanged. Older clients ignore the new field; a client receiving no stable key must explicitly reselect rather than guess by name/coordinates. The focused54-case follow-up passed, including fresh UUID/same identity and expired/consumed/wrong-owner/wrong-ID rejection. No TTL was extended.

## Measured local cost/performance

One actual-data run on the local Windows host: cold catalogue load29.1ms; added post-GC heap2,108,944bytes; addedRSS9,302,016bytes. Across200 full regional lookup+parser samples: median26.68ms, p9563.19ms, maximum103.33ms. These measurements are not Cloud Run or iPhone latency guarantees. The real Fox & Crow test point returns four OSM places; internal parsed payload5677bytes.

Per supported request: zero catalogue Firestore reads/writes and zero providerHTTP calls. Existing canonical numeric/string queries and rate guard are unchanged. For Eexternal choices(E≤20), Enew candidate writes and eventual Ecleanup deletes remain, as with a successful former lookup. Compared with today's provider outage, those normal candidate writes/deletes are additional because the outage writes no external candidates. Bind/create/readiness operations are unchanged. The bundle adds956KB plus notice/manifest to existing code artifacts; this is not a claim of zero Firebase/compute cost.

## Reproduction, tests and publication boundary

`functions/scripts/build-pei-osm-catalogue.py <official-source-directory>` reproduces the pure OSM dataset using the workspace pyosmium tool path. `prepare-social-staging-deploy.mjs` copies the reviewed data, checksum and NOTICE into local compiled output and the existing isolated package; it never downloads data during build/deploy. `measure-pei-catalogue.cjs` records actual data/heap/query measurements.

Full TypeScript build and focused ESLint passed. The final offline suite passed78/78, including five actual-catalogue tests, actual remote-center closed-way selection, extent/holes/freshness/missing-reference negatives, legacy candidate validation, existing arrival/privacy/provider behavior and rendered function settings. Provider-specific regression tests explicitly bypass the regional data dependency to continue testing their intended transport branch; actual-data tests do not bypass it.

`test/pei-catalogue-http.integration.test.mjs` separately passed1/1 using Auth REST, callable HTTP and Firestore Admin SDK readback against the demo project. It performed real timed samples without seeding readiness counters, earnedHere30/Place90, obtained actual catalogue choices, bound and created/replayed/checked out The Fox & Crow external-place candidate. The successful run's discovery was159ms and actual arrival elapsed91.75s. Receipt `pei-catalogue-http-integration-receipt-20261031.json` records source/version, chosen target, consumed candidate and idempotent revision. An initial run's owner-record assertion incorrectly expected a candidateID field instead of the existing venueLocationKey; correcting that assertion and rerunning the real timed flow passed. Full actual-app client SDK/navigation/device QA remains coordinator-owned.

OSM attribution and ODbL terms are retained in `src/social/data/NOTICE.md`. The complete derived JSON and reproducible importer are the local derived-data distribution package, containing no private user data. Before any public use, the coordinator must settle visible attribution, the public ODbL offer/download location and refresh maintenance; no offer hosting or Production deployment is performed by this POC.
