# Facebook Shared Event Ingest

This feature is split across two isolated branches:

- Backend/rules: `C:\Users\craig\Dev\gathr-apps-script-facebook-share-ingest`
- Mobile native share target: `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`

## Product Flow

1. User taps Facebook event share.
2. Facebook opens its share sheet.
3. User picks GathR from the "Share to" row.
4. GathR opens `/shared-event` with the shared URL/text/media.
5. User reviews the parsed fields and taps Save Event.
6. Backend verifies source accessibility:
   - `public_verified`: save a private copy and queue `public_shared_event_candidates/{id}` for public validation.
   - anything else: save only to `users/{uid}/privateSharedEvents/{id}`.

## Privacy Boundary

Do not rely on Facebook profile/page visibility. The only public signal that matters is whether GathR can independently fetch enough source metadata without user cookies or credentials. A share payload visibility hint can force private handling, but it cannot force public handling.

Private shared events are not stored under any subcollection named `events` because the current Firestore rules expose `/{path=**}/events/{eventId}` publicly.

Private shared events do not enter:

- public venue event writes
- public map queries
- unknown venue Gmail/review flows
- city-level event review
- scheduled public cleanup

Public candidates require validation/promotion before public publication.

## Public Review / Promotion Boundary

The app label "Public review" means "eligible for backend public validation." It does not mean the user chose to make the event public, and it does not guarantee that a human has reviewed it yet.

Public eligibility is determined server-side:

- `public_verified`: GathR could independently fetch usable public source metadata from the URL without user cookies or Facebook credentials.
- `restricted_unverified`, `user_private`, or `unknown`: the share stays user-private unless a later explicit promotion flow is built.
- A share payload hint can force private handling, but it cannot force public handling.

All shared events are first saved to the submitting user's private area:

- `users/{uid}/sharedEventIngests/{ingestId}` stores the raw ingest record and routing/status metadata.
- `users/{uid}/privateSharedEvents/{eventId}` stores the parsed user-visible private copy.

Deployment/testing note: on 2026-06-23, iOS preview app share traffic for `submitSharedEvent` and `uploadSharedEventImage` was observed in Firebase project `gathr-m1`. This likely reflects private shared-event/profile data living with the app's user data there, even though public parser deploy runbooks often target `gathr-migrated`. Future shared-event testing should verify the active phone target in Cloud Run logs before assuming which Firebase project needs deployment.

Only `public_verified` parsed events with `routing: "public_candidate"` also create:

- `public_shared_event_candidates/{candidateId}`

Important trust boundary: `public_verified` only proves that the source URL can be fetched publicly. It does not prove that event facts supplied by the client share payload are correct. Public auto-promotion requires the critical event facts to be attributed to backend-fetched public source metadata:

- title
- start date
- start time, when present
- location name or address

The parser stores this attribution in `fieldSources`. Facts from direct share payload fields, shared text, or user-uploaded/shared images are saved for the user's private copy, but public candidates using those facts are marked `needs_user_review` instead of being auto-promoted. This prevents a user from attaching incorrect title/date/location data to a real public Facebook URL and publishing it to the public map.

Public candidates are then processed by `processSharedEventPublicCandidates` or the scheduled `scheduledSharedEventPublicCandidateProcessor`. The scheduled processor only runs when the deployed environment has `SHARED_EVENT_PUBLIC_PROMOTION_ENABLED` enabled.

Promotion outcomes:

- `promoted`: the candidate was converted into the normal public event shape and written to the public venue/event collections.
- `duplicate_existing`: the candidate matched an existing public event and was not duplicated.
- `needs_user_review`: required details such as title, date, or location were missing.
- `rejected_expired`: the candidate event date had already passed.
- `queued_unknown_venue`: the venue could not be matched and was handed to the unknown-venue pipeline.
- `queued_city_level_review`: the location was city/area-level rather than a specific venue.
- `venue_unresolved` or `failed`: promotion could not safely complete.

Unknown-venue handoff for shared-event candidates is not dataset row replay. Shared-event unknown-venue samples carry `sharedEventCandidateId`, `sharedEventPrivateEventId`, `sharedEventIngestId`, and `sharedEventOwnerUid`. When an unknown venue is finalized as an existing venue or a new venue, the resolver writes the resolved venue id back to the candidate and re-runs the shared-event promotion path directly. Synthetic `shared-event:{ingestId}` samples are deliberately excluded from `processDatasetSelectedRows`.

When a candidate is promoted, the public event is intended to look like a normal parsed event from the larger pipeline. It carries shared-event provenance fields such as `sharedEventCandidateId`, `sharedEventPrivateEventId`, `sharedEventIngestId`, `sharedEventOwnerUid`, and `sharedEventSource: "public_shared_event_candidate"` so the app can show a "Shared by you" badge to the submitting user.

Public Facebook posts with weak initial share payloads may also queue Apify scrape enrichment. The share screen may show only the initial matches while the full Facebook post scrape runs later through the normal parser/webhook flow.

## Native App Boundary

The Facebook "Share to" row requires a native app build. The mobile branch adds `expo-share-intent` and configures:

- iOS share extension for text, web URLs/pages, and one image
- Android share intent filters for text and images
- a root share-intent provider/router
- `/shared-event` review/save route

Expo Go cannot test this native share target. Use a dev-client or EAS build.
