# Olde Dublin missing profile image — October 12, 2026

## Confirmed cause and scope

`venues/fb_100063673418060` still references the deleted managed object
`profilepictures/1768411503650.webp`. A fresh public GET returns 404. Exact-prefix
object/version and soft-deleted listings found no recoverable copy. Bucket-level
policy inspection was permission-denied, so no bucket retention-policy claim is
made. The historic deletion cause remains unproven.

All four current event detail endpoints and the venue endpoint return the broken
canonical profile image. The three recent events were attributed to Downtown
Charlottetown's source, not an Olde Dublin first-party post. No retained exact-name
Olde Dublin parse snapshot was found. Existing first-party recovery consequently
has not supplied a replacement. The deployed October 5 prevention/recovery code
remains unchanged. This repair requires no parser deploy, replay or client OTA.

## Exact proposed repair — dry run passed, not applied

Use the pub's own square 192x192 green clover icon, linked from its official
website: https://oldedublinpub.com/wp-content/uploads/2021/03/cropped-odp-site-icon-192x192.png .
Downloaded HTTP 200 image/png, 23,986 bytes, visually inspected. SHA-256:
`49f5ede02f70b2d81157436d39688b2df1d0cba060a4c17ed1f4b3d4b3447a7b`.

- Create managed object `profilepictures/oldedublinpub-official-20261012-49f5ede02f70.png`
  with a create-only generation precondition. Preserve the original PNG bytes.
- Update only `venues/fb_100063673418060`: `profileImage` to that managed URL,
  `profileImageSourceSignature` to the official source host/path, and `updatedAt`.
- Preserve all four event documents, event posters, venue location, hours and
  other venue fields. No existing storage object is deleted.
- Dry-run plan:
  `functions/artifacts/oldedublin-profile-oct12/repair-plan-2026-10-12T17-22-57-457Z.json`.
- Complete venue/event backup:
  `firebase/oldedublin-profile-backup-2026-10-12T17-22-57-457Z.json`.
- Guarded helper: `firebase/repair-oldedublin-profile-oct12.mjs`; default dry run,
  exact plan required for apply; abort on venue/event drift or active parser.

After approval, revalidate source bytes and old 404, save a fresh backup, upload
and verify public bytes before the update-time-guarded venue change. Reread the
venue, verify event documents unchanged, then check venue/four event detail API
responses and the complete upcoming feed. Only the backend image reference is
being repaired; app device adoption or rendering is not claimed from API proof.

## Evidence

`functions/artifacts/oldedublin-profile-oct12/`: live inspection, asset inspection,
official website HTML and three inspected image candidates, source-icon metadata,
API baseline and repair dry-run log. No live mutation has been performed.
