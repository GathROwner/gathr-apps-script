# External public-place check-ins (Preview)

This experiment lets an authenticated Preview user explicitly check in at a nearby public business or POI that is not already a canonical GathR venue.

## Trust and privacy contract

- `discoverNearbyCheckInPlacesCallable` accepts the current foreground latitude, longitude, and accuracy. It returns at most five nearby choices, with recognized GathR venues first.
- OpenStreetMap results are restricted to named public amenities, shops, tourism locations, and leisure venues. Address-only results, raw pins, and residence-like categories are rejected. The public-service endpoint is server-configurable; the Preview default has a second public endpoint as a failover, so it can be moved to a hosted provider without a mobile update.
- External results are stored only as opaque, user-bound `checkInPlaceCandidates` records with a 15-minute expiry. The app never submits a trusted name, address, or coordinate.
- Selecting a result does not check the user in. The target-free readiness protocol can satisfy the 90-second stationary dwell before selection; the legacy `recordCheckInEligibilitySampleCallable` target-first flow remains available during rollout.
- `createCheckInCallable` remains the explicit consent action. It preserves audience, duration, optional message, blocking, idempotency, and expiry behavior.
- An active external check-in and its authorized friend projections contain only the public POI name, public address/category, public map coordinate, and the existing user-selected visibility metadata. The legacy place-first dwell flow does not store raw location samples.
- Checkout, expiry cleanup, blocking, and account deletion remove the related visibility. Expired candidates are removed by the social cleanup schedule.

## Request shapes

Nearby discovery:

```json
{ "latitude": 46.2382, "longitude": -63.1311, "accuracyMeters": 12, "capturedAtMs": 1789000000000 }
```

External dwell sample:

```json
{
  "sessionId": "client-generated-operation-id",
  "placeCandidateId": "opaque-server-candidate-id",
  "latitude": 46.2382,
  "longitude": -63.1311,
  "accuracyMeters": 12,
  "speedMetersPerSecond": 0
}
```

External explicit check-in:

```json
{
  "operationId": "client-generated-operation-id",
  "eligibilitySessionId": "completed-dwell-session-id",
  "placeCandidateId": "opaque-server-candidate-id",
  "durationMinutes": 60,
  "audienceMode": "all_friends",
  "message": "Optional"
}
```

Canonical venue requests continue to use `venueId` and are backward-compatible. A request must supply exactly one of `venueId` or `placeCandidateId`.

## Target-free readiness protocol v1

The readiness flow can accrue server-authorized evidence before the user chooses a place. It is additive: the existing target-first 90-second request remains supported during rollout.

`recordCheckInReadinessSampleCallable` accepts a monotonically increasing sequence and a fresh device location:

```json
{
  "protocolVersion": 1,
  "reset": false,
  "sessionId": "client-generated-readiness-id",
  "sequence": 3,
  "latitude": 46.2382,
  "longitude": -63.1311,
  "accuracyMeters": 12,
  "speedMetersPerSecond": 0,
  "capturedAtMs": 1789000000000
}
```

The result reports server-timed `hereQualifyingMs`/`hereReady` for the 30-second approximate-private threshold and `placeQualifyingMs`/`placeReady` for the 90-second public/exact-private threshold, plus a short-lived numeric `expiresAtMs` receipt deadline. Client elapsed time is never accepted. Here permits accuracy up to 50 m; Place requires 25 m or better. Poor accuracy, movement, a long sample gap, or an explicit reset clears the affected evidence. Driving-speed evidence clears both rings and starts a 30-second owner-level settling period that cannot be bypassed with a new session ID.

For spatial binding, the server stores only a short-lived, owner-private readiness session containing its anchor and latest coordinates, plus an owner-scoped active-session/cooldown record without coordinates. It never stores an address, never creates a check-in, and both records are removed by the existing eligibility-session cleanup. These coordinates are not returned to friends or copied into social projections.

After the user selects a target, `bindCheckInReadinessCallable` binds the session once:

```json
{
  "protocolVersion": 1,
  "readinessSessionId": "client-generated-readiness-id",
  "operationId": "stable-bind-operation-id",
  "venueId": "selected-venue-id",
  "latitude": 46.2382,
  "longitude": -63.1311,
  "accuracyMeters": 12,
  "speedMetersPerSecond": 0,
  "capturedAtMs": 1789000090000
}
```

Use exactly one of `venueId` or `placeCandidateId`. Binding checks the target against both the accumulated anchor and a fresh current sample. A private candidate can bind at the 30-second threshold for approximate sharing; `exactPrivateAllowed` is true only after 90 seconds. Public venues and external places cannot bind before 90 seconds. The same readiness cannot be rebound to another target.

`createCheckInCallable` then consumes the returned `eligibilitySessionId`. It still enforces explicit user action, audience permissions, idempotency, expiry, and selected-friends-only exact private sharing. A 30-second private grant fails closed if exact sharing is requested.

## Release boundary

This feature is staging/Preview-only. It uses the public Overpass API only for explicit, low-volume user requests, with cached opaque candidates and OpenStreetMap attribution. Do not deploy it to Production until GathR uses a hosted or paid OpenStreetMap-compatible provider with an appropriate service level and capacity agreement.

The Firebase Functions codebase name is not the Firebase project id. `firebase.staging.json` names the codebase `gathr-social-staging`, while the repository's default Firebase project remains the parser project `gathr-migrated`. Always target the social staging project explicitly:

```powershell
cd functions
npm run deploy:social-staging
```

For a narrow rollout, retain both explicit arguments and add the exact function filter, for example:

```powershell
firebase deploy --project gathr-social-staging --config firebase.staging.json --only "functions:recordCheckInReadinessSampleCallable,functions:bindCheckInReadinessCallable,functions:createCheckInCallable"
```

Do not infer the Firebase project from the codebase label, and do not use the unqualified `npm run deploy` command for this Preview service.
