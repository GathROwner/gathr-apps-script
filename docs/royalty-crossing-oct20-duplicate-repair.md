# Royalty Crossing duplicate repair — October 20, 2026

## Applied and publicly verified

At 14:06:55 America/Halifax (17:06:55 UTC), the independently reviewed exact repair committed atomically. The two listings advertised the same Halloween Artisan Market at Royalty Crossing, October 31, 09:30–17:00. Original captions and posters established that the vendor spotlight was part of that market rather than separate attendance.

- Keeper: `venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ` (Artisan Market).
- Retired duplicate: `venues/slug_royaltycrossing/events/7ZldwUnCeCMmPsvxIwD6` (Halloween Market).
- Feed marker: `runtime_metadata/event_feed`, version 341 → 342.

The keeper now retains all five original source IDs/URLs and all six gallery images, with original primary poster and existing image provenance preserved. Only sourceUniqueIds, sourceUrls, mediaUrls, imageProvenance and updatedAt changed on the keeper. Title, description, dates/clocks, venue, family score 85, original source timestamps, prices, counters and all other fields are unchanged. Historical sources were preserved, not all re-adjudicated. Facebook source counts were not summed across posts.

Exactly three canonical actions and three complete typed original archives were committed (six writes). Fresh guarded reads found no active parser, three unchanged historical checkpoints, no alternate checkpoints, no event subcollections, and no references on the inspected user/counter/history surfaces. The whole venue document, including contacts, stayed unchanged. These bounded checks do not assert knowledge of every possible schema.

## Evidence

Local artifacts: `firebase/artifacts/royalty-crossing-oct20/`.

- `repair-plan.json`: SHA256 `dc424d07659ecf291f5fd1d06d4b5f4a17538c34cc3dfc27f81b12c93aa6aadd`.
- `independent-review.json`: 22 checks passed against the exact plan, helper and dry run.
- `prewrite-backup-2026-10-20T17-06-54-789Z.json`: full fresh typed prewrite backup.
- `commit-response.json` and `result.json`: confirmed atomic commit and exact canonical/archive readback.
- `postflight-result.json`: keeper detail HTTP 200, retired detail HTTP 404; complete Royalty Crossing / October 31 filtered feed has exactly one event, the keeper. No retired parent or instance. All six media URLs return HTTP 200; feed version is 342; venue, user-reference and unpatched-field preservation checks pass.
- `rollback-dry-run.json`: archive contents and unchanged poststate verified, zero writes. The helper verifies rollback eligibility only; it does not execute a restore. `rollback-exact-restore-payload.json` is a recoverable typed payload with version preconditions and monotonic next feed version, requiring fresh review before any actual restore.

No parser release, paid replay, whole-catalog scan, media deletion, user/contact mutation or map interaction occurred in this repair. The earlier 55-action batch remains a separate historical result. Rows 115/126/161 remain held; unavailable media and the incomplete independent activity census remain audit limitations.

## Prevention followup

The concrete pattern is whole-market versus vendor-spotlight naming with the same source-supported venue/date/time. Add bounded identity regression fixtures and healthy distinct-vendor-event controls before proposing a matching change. This repair does not claim a new general duplicate-prevention algorithm was released.

## Final independent verification

All 23 independent receipt/body/delta checks passed at 14:09:33 America/Halifax. The review used the fresh owner live readbacks and saved exact bodies; it did not repeat the apply or scan. Receipt: `firebase/artifacts/royalty-crossing-oct20/final-independent-verification.json`, SHA256 `df2c64353327aecca5d81ebf8b1bf126dd7ccf799e58e3ee156a6f8234ee4bc3`. No pending action or execution blocker remains for this exact repair. The source/video/recall limitations above remain.
