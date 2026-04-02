# Google Places (Stage 5.5) Runbook

Stage 5.5 ("hours-based time resolution") uses Google Places to fetch venue operating hours so we can infer missing event times (start/end or "to close").

## Where It Lives
- Stage 5.5 resolver: `functions/src/parsing/venueResolver.ts`
- Google Places client: `functions/src/services/placesService.ts`
- Venue reads/writes: `functions/src/services/firestoreService.ts`

## What It Does
1. For each parsed item that is missing a start/end time (or uses "to close"), Stage 5.5 attempts to resolve times using venue operating hours.
2. It first checks Firestore for cached hours on the venue doc.
3. If the cache is missing or stale, it calls Google Places (New) to fetch `currentOpeningHours`, converts that to our `OperatingHours` format, and caches it back to Firestore.

## Requirements (GCP)
The code uses Places API (New) (`places.googleapis.com`).

If you only enable the legacy Places backend (`places-backend.googleapis.com`), calls to the v1 endpoints will fail and you'll see `Places search failed` in logs.

## Environment Variables
- `GOOGLE_PLACES_API_KEY`: required for Places calls
- `OPERATING_HOURS_CACHE_TTL_MS`: optional; defaults to 7 days

## Caching Behavior
- Cache location: Firestore `venues/{venueId}`
- Fields written:
  - `operatingHours`
  - `operatingHoursUpdatedAt` (server timestamp)
  - `googlePlaceId` (when available)
- Minimum cache lifetime: 7 days by default (controlled by `OPERATING_HOURS_CACHE_TTL_MS`)
- Per-row memoization: within a single row parse, operating hours are fetched once per `(venueName,address)` and reused for the remaining items in that row.

## How To Verify
- In Cloud Logs: look for Stage 5.5 logs and absence of repeated `Places search failed` spam per item.
- In Firestore: confirm `operatingHours`, `operatingHoursUpdatedAt`, and `googlePlaceId` appear on the relevant venue doc after a run.

