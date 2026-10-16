# Four current-listing venue profile repairs - exact approval plan

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

All four canonical image URLs return HTTP 404 and all four venues occur in the
complete upcoming API feed. Default-dry-run helper:
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
