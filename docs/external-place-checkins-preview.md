# External public-place check-ins (Preview)

This experiment lets an authenticated Preview user explicitly check in at a nearby public business or POI that is not already a canonical GathR venue.

## Trust and privacy contract

- `discoverNearbyCheckInPlacesCallable` accepts the current foreground latitude, longitude, and accuracy. It returns at most five nearby choices, with recognized GathR venues first.
- Mapbox Search Box results are filtered to `poi` features. Address-only results, raw pins, and residence-like categories are rejected.
- External results are stored only as opaque, user-bound `checkInPlaceCandidates` records with a 15-minute expiry. The app never submits a trusted name, address, or coordinate.
- Selecting a result does not check the user in. `recordCheckInEligibilitySampleCallable` still requires the existing 90-second stationary dwell with the existing accuracy, speed, distance, reset, and expiry limits.
- `createCheckInCallable` remains the explicit consent action. It preserves audience, duration, optional message, blocking, idempotency, and expiry behavior.
- An active external check-in and its authorized friend projections contain only the public POI name, public address/category, public map coordinate, and the existing user-selected visibility metadata. Raw location samples are not stored.
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

## Release boundary

This feature is staging/Preview-only. Do not deploy it to Production until GathR has a Mapbox agreement that permits the required active-check-in/projection storage, or uses a POI provider and contract that permits it. Search Box response data must not become a permanent GathR venue or event catalogue.
