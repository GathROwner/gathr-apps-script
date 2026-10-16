# Four current-listing venue profile repairs - exact approval plan

**COMPLETE:** approved four-venue repair applied and independently verified
October 15 Halifax time (2026-10-16T00:37:33Z). All four managed replacement
images and venue endpoints return 200. Five event details and both complete
upcoming feeds return the corrected canonical profiles; all five stored event
documents and all other venue fields are unchanged.

## October 15 approved refresh

Craig approved repairing these exact four venues together (“Ok do that”) after
a fresh public check found all four profile images still returned 404. Fresh
dry run on October 15 local time (October 16 00:34:44 UTC) verified the same
official source bytes, MIME types, four target references, absent destination
objects, idle parser and complete venue/event state hash. It exactly matches
the previously reviewed plan; no new venue or replacement is added.

Fresh plan: `functions/artifacts/oldedublin-profile-oct12/four-venue-repair-plan-2026-10-16T00-34-44-222Z.json`.
Full fresh backup: `firebase/venue-profiles-oct12-backup-2026-10-16T00-34-44-222Z.json`.
Prewrite backup is refreshed automatically on apply. Helper reads target
venues, all their event siblings and processing locks again inside the atomic
transaction, aborting on drift. Immutable equal-byte uploads can be reused
after an interrupted attempt; staged assets are reported and retained.

All four image candidates were independently viewed again. This approval
changes only the reviewed canonical image references/signatures and timestamp.
No venue address or event update is included. API verification must wait for
the existing five-minute venue cache when stale responses are observed.

Before repair, all four canonical image URLs returned HTTP 404 and all four
venues occurred in the complete upcoming API feed. Default-dry-run helper:
`firebase/repair-venue-profiles-oct12.mjs`.

| Exact Firestore target | Verified official replacement |
| --- | --- |
| `venues/fb_100057777755102` - New Glasgow Lobster Suppers | 192px red lobster icon linked by https://peilobstersuppers.com/ |
| `venues/fb_100064147174976` - The Lost Anchor | Venue building photograph published as https://www.lostanchorpei.com/opengraph-image?bebca75a60abe85a |
| `venues/slug_montague-rotary-library` - Montague Rotary Library | Library building photograph linked by https://www.princeedwardisland.ca/en/point-interest/montague-rotary-library |
| `venues/slug_peibrewingcompany` - PEI Brewing Company | Official top-hat site icon linked by https://peibrewingcompany.com/ |

The actual downloaded images were visually inspected. Preserve original image
bytes in four new create-only managed objects under `profilepictures/`; the exact
source URLs, SHA-256 hashes, destination paths and patches are in:

`functions/artifacts/oldedublin-profile-oct12/four-venue-repair-plan-2026-10-12T17-57-37-838Z.json`.

Complete venue and associated event backup:
`firebase/venue-profiles-oct12-backup-2026-10-12T17-57-37-838Z.json`.

Only change each venue's `profileImage`, `profileImageSourceSignature` and
`updatedAt`. Preserve all location, address, hours, identity and event fields.
Do not delete old files, write events, or change recurrence. Montague's official
page lists a different street address from the stored venue; this image-only
plan does not authorize a location repair.

Before applying, reread all four venues and events and require the exact reviewed
state hash, recheck the four 404s and official source bytes, and ensure no parser
is active. Save a fresh backup. Verify public uploaded bytes, then apply the four
venue updates in one Firestore batch with individual update-time preconditions.
Reread all documents and prove all event documents and other venue fields
unchanged. After the venue cache expires, verify the venue endpoints, associated
event detail endpoints and the full upcoming feed.

The remaining eleven broken-image venues have no current stored events. Blank
canonical profiles and the conflicting Sport PEI identity need separate reviewed
targets and verified images; this plan does not authorize those changes.

## Applied repair and independent evidence

The approved four-target plan matched the fresh source/state verification
exactly, including the original reviewed SHA-256 image bytes. Helper commit
`7cd8ab4` adds transactional target/event-sibling/active-parser drift checks
and safe equal-byte reuse of staged immutable objects. No existing object was
deleted or overwritten. Four original assets were uploaded with create-only
generation preconditions and checked publicly before the atomic venue update.

- Fresh prewrite backup:
  `firebase/venue-profiles-oct12-backup-2026-10-16T00-36-54-408Z.json`.
- Exact result:
  `functions/artifacts/oldedublin-profile-oct12/four-venue-repair-result-2026-10-16T00-36-54-408Z.json`.
- Staged asset receipt:
  `functions/artifacts/oldedublin-profile-oct12/four-venue-staged-assets-2026-10-16T00-36-54-408Z.json`.
- Independent read-only verifier: `firebase/verify-four-venue-profiles-oct15-readonly.mjs`
  (commit `d9e78e7`).
- Final evidence:
  `functions/artifacts/oldedublin-profile-oct12/four-venue-independent-verification-oct15.json`.

Independent verification at00:37:33UTC confirmed all four image hashes/HTTP200,
all four canonical venue responses, all five associated event details with
correct profiles, exact venue-field deltas and all five event snapshots/update
times unchanged. Complete default upcoming feed915events/10pages and capable
upcoming feed923events/10pages each contained five affected occurrences with
the correct profiles. Feed marker267 is unchanged. Public API cache responses
were already fresh; no cache flush, API/parser deployment or client OTA was
needed. Source images were visually inspected; device adoption is not claimed.

This closes these four specific broken profiles. The October12 inventory of
other inactive broken/blank profiles remains a separate, dated audit snapshot;
refresh that inventory before proposing additional exact repairs. Montague's
address discrepancy and SportPEI's conflicting identity were not changed.
