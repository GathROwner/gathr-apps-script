# Olde Dublin missing profile image — October 12, 2026

## Confirmed cause and scope

`venues/fb_100063673418060` still references the deleted managed object
`profilepictures/1768411503650.webp`. A fresh public GET returns 404. Exact-prefix
object/version and soft-deleted listings found no recoverable copy. A later CLI
bucket read succeeded: there is currently no lifecycle deletion rule and soft
delete retention is seven days. This does not establish historical bucket policy.
The historic deletion request remains unproven.

Before repair, all four event detail endpoints and the venue endpoint returned
the broken canonical profile image. The three recent events were attributed to Downtown
Charlottetown's source, not an Olde Dublin first-party post. No retained exact-name
Olde Dublin parse snapshot was found. Existing first-party recovery consequently
has not supplied a replacement. The deployed October 5 prevention/recovery code
remains unchanged. This repair requires no parser deploy, replay or client OTA.

## Exact approved repair - applied and verified

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

Craig approved the exact plan. Applied at 17:39 UTC after fresh source-byte,
404, target-state, object-absence and no-active-parser checks. Public uploaded
bytes were verified before the update-time-guarded venue update. Full venue
reread confirmed only the planned image fields and updatedAt changed; all four
event documents were unchanged.

Fresh prewrite backup:
`firebase/oldedublin-profile-backup-2026-10-12T17-39-01-142Z.json`.
Result:
`functions/artifacts/oldedublin-profile-oct12/repair-result-2026-10-12T17-39-01-142Z.json`.

The backend's existing five-minute venue cache initially returned the old URL.
At 17:44 UTC, the venue endpoint, all four event detail endpoints, and both Olde
Dublin occurrences in the complete 974-event upcoming feed returned the new
avatar. Titles and event poster URLs were unchanged. `api-after.json` records
this evidence. This is backend/API verification, not a claim of device rendering.

## Historical mechanism and additional protection

Retained parser logs show the old URL was already missing on September 26,
2026. Queries for the exact object in the old backend project and bucket owner's
Storage deletion logs did not recover the delete operation. The earlier parser
cleanup bug is a plausible mechanism: a reused venue avatar could enter the
temporary-image list and be deleted when unused by that particular post. The
October 5 caller fix prevents that reuse mistake, but cannot restore old files.

The serving migrated backend's shared `/delete-image` route still allowed
arbitrary bucket object deletion. A guard was prepared from exact live backend
commit `e1d1a02264962c88d2d73e944307ba4c82b580fb` in its own isolated worktree:
`C:\Users\craig\.codex\worktrees\venue-profile-protection-20261012\gathr-backend`.
It categorically rejects profilepictures and checks canonical venue references
before deleting a post image, fails closed on reference-check errors, pins the
storage generation, and logs cleanup outcomes. Backend commit `13c8d52` contains
the guard and 14 passing backend utility tests. The clean-worktree release script
deployed only `gathr-backend` in `gathr-migrated/northamerica-northeast1`.
Cloud Build `cf7a07a6-3fd4-422d-bb75-a163a3f845b7` succeeded; image digest:
`sha256:e436793e8285d993fc8ca80a4c53e37602dbfe979a482c3096227fa5d5f08beb`.
Independent Cloud Run readback confirmed revision `gathr-backend-00084-66r`
at 100% traffic. API `/api/release` independently returned the exact full commit,
sourceClean=true and that revision. Environment variables, resource limits,
runtime identity, volume mounts and ports were unchanged. Prior revision
`gathr-backend-00083-pnh` remains the rollback target.

At 17:59 UTC a nonexistent `profilepictures/protection-contract-no-object-20261012.webp`
cleanup request returned 403/protected_image. A nonexistent post-image control
returned 200/Image already absent, proving the Firestore reference check and
storage path were usable. These probes cannot delete an existing production
asset. Olde Dublin's venue reference remained correct and its repaired image
returned 200. Cloud Run logs independently recorded image_cleanup_blocked from
the new revision. Artifacts: `backend-protection-after.json`,
`backend-service-after.json`, `backend-config-verification.json`, and
`backend-protection-logs.json`.

Cloud Build reported existing dependency deprecations and 86 audit findings
(6 low, 26 moderate, 47 high, 7 critical). No dependency upgrades or automated
audit fixes were introduced in this focused repair. The local lockfile stayed
unchanged. No parser deployment, model/prompt change, replay, or client OTA.

The legacy backend in project `gathr-backend` still exists. Its retained last
30 days show no upload-image or delete-image HTTP requests. It was not replaced
with the migrated backend's different source. The new guard protects current
parser cleanup through the migrated backend; it is not a blanket IAM restriction
on every older deployment or human bucket administrator.

## Complete venue audit

At 17:40-17:49 UTC, read all 549 venue documents and 1,065 stored event documents.
Probed all 259 distinct canonical profile URLs. Results:

- 246 venue profiles available as nonempty image content.
- 15 other venues have confirmed HTTP 404 profile URLs.
- 287 venue documents have no canonical profile image.
- One Facebook CDN profile could not be verified (403); do not call it deleted.

Paginated the full upcoming API feed: 974 occurrences in ten pages. Four venues
with broken files appear there: New Glasgow Lobster Suppers, The Lost Anchor,
Montague Rotary Library and PEI Brewing Company. Forty additional upcoming-feed
venues have blank canonical profiles (some have an event-level fallback icon).
This is not proof their images were deleted: blank library/park/room/new venue
records need source verification before choosing a representative picture.

`all-venue-profile-audit.json`, `venue-inventory.json`, `feed-impact.json` and
`upcoming-feed.json` retain every affected ID and probe result. One inactive
broken-image record, `venues/slug_sportpei`, has a conflicting Cape Breton Comedy
Festival name and Sport PEI Facebook URL. Hold that identity rather than copying
either organization's logo. No other live venue was changed by this audit.

## Evidence

`functions/artifacts/oldedublin-profile-oct12/`: live inspection, asset inspection,
official website HTML and three inspected image candidates, source-icon metadata,
API baseline, guarded repair result, post-repair API verification, full venue
audit and official-source candidates for the next exact repair batch.
