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

## Native App Boundary

The Facebook "Share to" row requires a native app build. The mobile branch adds `expo-share-intent` and configures:

- iOS share extension for text, web URLs/pages, and one image
- Android share intent filters for text and images
- a root share-intent provider/router
- `/shared-event` review/save route

Expo Go cannot test this native share target. Use a dev-client or EAS build.
