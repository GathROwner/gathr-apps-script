# Phase 6: Firestore-backed v2 API

## Files created/modified
- `backend/services/firestoreService.js` – centralized Firestore helper that supports collection-group queries, cursor-based pagination, venue enrichment, and named `firestore-service` initialization.
- `backend/middleware/v2Auth.js` – bearer/API key guard for the new admin trigger so only authorized actors can call `/api/v2/firestore/admin/process-dataset`.
- `backend/routes/v2/events.js` – GET `/api/v2/firestore/events` plus `/api/v2/firestore/events/:eventId`.
- `backend/routes/v2/venues.js` – GET `/api/v2/firestore/venues`, `/api/v2/firestore/venues/:venueId`, and `/api/v2/firestore/venues/:venueId/events`.
- `backend/routes/v2/admin.js` – proxy POST `/api/v2/firestore/admin/process-dataset` that forwards to the Cloud Function using the admin API key.
- `backend/server.js` – new routers mounted under `/api/v2/firestore/*`, dual Firebase app initialization (legacy `gathr-m1` + new `gathr-migrated` app), and exported routers.
- `docs/PHASE-6-SUMMARY.md` (this file) – documents the work, key decisions, configuration, testing, and limitations.

## Key decisions
- Namespace the new Firestore surface under `/api/v2/firestore` so the legacy Google Sheets-based endpoints continue working while new clients can opt into the Firestore-backed data.
- Initialize a second Firebase Admin app named `firestore-service` using `FIRESTORE_SERVICE_ACCOUNT`; references to the legacy spreadsheet cache keep using the existing `FIREBASE_CREDENTIALS`.
- Use full Firestore document paths for `startAfter` tokens and accept both doc path and doc ID for backwards compatibility in the pagination helper.
- Protect dataset triggering via the `v2Auth` middleware plus a proxy that forwards the request to the Cloud Function with its own API key, keeping control in the Cloud Run service layer.

## Configuration required
- `FIRESTORE_SERVICE_ACCOUNT` – JSON key for a `gathr-migrated` service account (e.g., `firebase-adminsdk-fbsvc@gathr-migrated.iam.gserviceaccount.com`). This is parsed to initialize the named Firestore app.
- `FIRESTORE_V2_ADMIN_API_KEY` – bearer token expected by `/api/v2/firestore/admin/process-dataset`.
- `FIRESTORE_PROCESS_DATASET_URL` – Cloud Function HTTP trigger that processes datasets.
- `FIRESTORE_DATASET_TRIGGER_API_KEY` – token sent to the Cloud Function to authenticate the incoming request.
- Existing secrets: `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_CREDENTIALS` continue powering the original cache & Google Sheets code path.
- IAM binding: grant the Cloud Run service agent `service-924732524090@serverless-robot-prod.iam.gserviceaccount.com` in `gathr-backend` the `Artifact Registry Reader` role so `gathr-migrated` can pull the image.

## Testing / validation
1. `curl 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events?limit=1'` – ensure first page of Firestore events returns `events`, `nextPageToken`, and `pageLimit`.
2. Use the returned `nextPageToken` (full document path) to fetch the next page:
   ```
   curl 'https://.../api/v2/firestore/events?limit=5&startAfter=venues/<venueId>/events/<eventId>'
   ```
3. `curl 'https://.../api/v2/firestore/events/<eventId>'` – confirm event details include `venueInfo`.
4. `curl 'https://.../api/v2/firestore/venues/<venueId>/events?startDate=2026-01-01&endDate=2026-02-01'` – ensure venue-specific event list honors date filters.
5. Admin trigger test:
   ```
   curl -X POST 'https://.../api/v2/firestore/admin/process-dataset' \
     -H 'Authorization: Bearer <FIRESTORE_V2_ADMIN_API_KEY>' \
     -H 'Content-Type: application/json' \
     -d '{"fileId":"<id>","fileType":"<type>"}'
   ```

## Known limitations / TODOs
- Pagination tokens are now full document paths, so clients should treat `nextPageToken` as opaque and never try to mutate it.
- Venue search currently matches on `normalizedName` only; fuzzy/address search could be added later.
- The admin proxy assumes the Cloud Function is reachable and trusts the configured trigger API key—consider adding retry/backoff logic or observability if the chain expands.
