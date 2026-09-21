# Burgoyne public-place resilience: backend handback

**Date:** 2026-09-21  
**Scope:** backend-only implementation from `b592089` / `codex/checkin-place-boundary-fix-20260920`. No mobile code, Firestore data, OSM data, fixtures/check-ins, observability, deploy, or OTA was changed.

## Change

`discoverNearbyCheckInPlaces` still validates the request location, freshness, accuracy, canonical venue radius, and every external candidate's final radius/closed-boundary geometry exactly as before. The 175 m Overpass fetch radius is unchanged.

The callable result now has this client contract:

| Situation | Returned behavior | Client meaning |
| --- | --- | --- |
| An external provider returns a valid payload, including `{ elements: [] }` | `externalLookupStatus: "complete"` | The external lookup completed; an empty candidate list is a clean empty result, not an outage. |
| Every provider is unavailable but one or more eligible canonical GathR venues exist | Eligible canonical candidates plus `externalLookupStatus: "partial_unavailable"` | Keep those candidates usable and communicate that additional public-place results could not be loaded. |
| Every provider is unavailable and no eligible canonical venue exists | Callable `unavailable` error with `details: { condition: "nearby_public_places_external_lookup_unavailable", retryable: true }` | Show nearby-public-search-specific retry copy. Do not turn this into a generic offline/social-wide state. |

The `condition` contains no provider name, coordinates, place name, or other sensitive request data. `SocialDomainError` details are now preserved when the callable creates its `HttpsError`, so the mobile client can receive this condition.

## Files changed

- `functions/src/social/nearbyCheckInPlaces.ts` — additive status contract and canonical fallback.
- `functions/src/social/validation.ts` — optional typed domain-error details.
- `functions/src/social/callables.ts` — preserve safe domain-error details in callable responses.
- `functions/src/social/nearbyCheckInPlaces.test.ts` — four focused discovery cases.

The existing `functions/src/social/checkInPlaceGeometry.test.ts` remains the Event Grounds regression: a point roughly 69–70 m from the centre is accepted only when it is inside a valid closed footprint; a point-only result still uses the 50–75 m final radius.

## Focused test cases added

1. Canonical venue plus two provider failures returns the canonical venue with `partial_unavailable`.
2. No canonical venue plus two provider failures throws the typed retryable condition.
3. A successful empty provider payload returns `complete` and no candidates.
4. A normal successful provider payload returns `complete` and a server-owned external candidate.

## Validation limitation

`npm.cmd run build:social` could not run in this task's restricted Windows sandbox: Node failed resolving the existing shared dependency junction with `EPERM: lstat C:\\Users\\craig`. Per coordinator instruction, the escalated retry was cancelled rather than requesting approval. `git diff --check` passed. The source/test changes were statically inspected, but compile/lint/test execution must be rerun from the authorized backend environment before release or deploy.

Recommended commands from that environment:

```powershell
cd functions
npm.cmd run build:social
node --test lib/social/nearbyCheckInPlaces.test.js lib/social/checkInPlaceGeometry.test.js
npm.cmd run lint:social
```

## Current OSM/tag and distance findings

This is evidence only; it does not change eligibility categories or OSM.

- [Official OSM API way 361875736](https://api.openstreetmap.org/api/0.6/way/361875736/full), read September 21, identifies **Maid Marion's** as a closed way tagged `amenity=restaurant` and `building=yes`. `amenity=*` is already in the deployed query, so it would be fetched when Overpass succeeds.
- Using the supplied public address reference (`46.2584007, -63.1216956`), the way-centre estimate is **137.0 m** away and its nearest recorded boundary vertex is **125.6 m** away. It is inside the 175 m fetch circle but outside the final roughly 50–75 m point/accuracy threshold and outside its closed footprint. Therefore it should not be made selectable from that address reference, even though it can be fetched. The screenshot does not expose a reliable coordinate or GPS accuracy, so no phone-coordinate distance was calculated.
- Current official Nominatim searches for a pharmacy and doctor near that public address returned no result records. That is not proof that no nearby POI exists; it means this implementation handback has no official OSM object, tags, or geometry from which to compute a POI distance. The current generic `amenity=*` query/parser could process an `amenity=pharmacy` or `amenity=doctors` feature if it is fetched and passes the final geometry/radius rule. An `office=doctor` feature is parser-recognized but is not requested by the current query, and a `healthcare=doctor`-only object is not currently recognized. Neither omission is changed here.
- The supplied-address OSM reference remains an interpolation feature rather than a named Burgoyne POI, as documented in the preceding diagnosis. No private/home coordinate was inferred.

During this implementation's read-only probe, `overpass-api.de` returned a busy-dispatcher timeout for a narrow pharmacy query and the configured Kumi fallback timed out after 20 seconds. Those are environment-time observations only, not a production-request correlation and not new observability.

## Remaining mobile work

The mobile phase should consume `externalLookupStatus` on successful callable results and the error `details.condition` above. It should retain the generic network/social unavailable copy for true callable transport failures, and use a nearby-provider-specific retry state only for this typed condition. A `partial_unavailable` result should still render canonical venues and leave the existing opt-in private-place route available. It needs a rendered picker/device artifact before any release decision.

## Explicitly unchanged

No office/craft expansion, missing-place flow, Firestore write, OSM edit, candidate fixture, check-in, function deployment, OTA publication, provider logging/metrics, final-radius rule, freshness rule, GPS-accuracy rule, dwell/readiness rule, or anti-spoofing/boundary verification was changed.
