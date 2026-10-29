# Listing video pilot: implementation checkpoint

Craig approved fleshing out and implementing the bounded video pilot on October 29. The code is committed in isolated worktrees. Delivery is OFF; this is not a deployed or visually accepted release.

| Part | Worktree | Commit |
| --- | --- | --- |
| Worker, policy, registry, manifest, scoped cleanup | `C:/Users/craig/.codex/worktrees/listing-video-pilot` | `3d48e9585ba670fef9d738ed9213876397c24ca3` |
| Events/Specials/lightbox playback controls | `C:/Windows/System32/GathR-Project/listing-video-pilot` | `af955c63e332728f338faad57c4bee780d9b5f51` |

Detailed plan: backend `docs/listing-video-pilot.md`. Validation and remaining gates: backend `docs/listing-video-validation.json`.

Implemented: 20-clip lifetime pilot quota; complete-clip and audio review bound to SHA256; rejected-by-default preparation; capped HTTPS downloads and local decoding; H.264/AAC fast-start compression without truncation; 60-second/8-MB/1280x720 limits; single stored object shared by explicitly reviewed listing bindings; current source/version/fingerprint guards; invisible publication reservations and source rechecks; public metadata without source download URLs; existing images left unchanged; no video bytes before a tap; muted playback with close/background teardown; future-occurrence reference protection and seven-day cleanup grace; retryable interrupted uploads/deletes; staging expiry/bounds.

Checks passed: backend build and 16 focused tests, including real ffmpeg compression of a synthetic audio/video fixture; app TypeScript and seven focused tests; app lint zero errors, 215 repository warnings. Twenty candidates were identified offline in saved October 28 input. These are NOT 20 reviewed listings or videos: no real clips were downloaded, approved, uploaded or published. No paid model calls, fresh scraper runs, parser edits/deploys, live Firestore writes, traffic changes, schedules, map interactions or OTAs occurred. After sign-in, one disposable 1,875-byte synthetic MP4 was uploaded, checked with an exact HTTP 206 byte-range read, and generation-safely deleted; it was never linked into the app. Existing storage recovery retains its deleted bytes for seven days.

Release blockers:

1. Fresh EAS Preview readback: group `4fe3d163-cf5a-4bad-be8e-361021eea5db`, iOS runtime `1.1.10`, commit `b27a8081331ff5739f066ba607ddcbb97510cc6e`. This commit is missing from the authoritative app repository and origin (`not our ref`); owner-scoped GitHub commit search returned no result. The feature patch starts at accepted local `0f570df`; recover/reconcile the actual live source before assembling an OTA.
2. **Resolved after sign-in:** bucket retention, existing-identity create/get/delete permissions, deployer actAs, and real upload/range-read/delete acceptance passed. The cleanup code uses the existing authorized Firebase service identity and verifies object ownership/generation before deletion. No new IAM, API enablement or bucket configuration changes were made. Seven-day application grace is followed by seven-day soft deletion. Evidence is committed in the backend storage readback/probe/deployer receipts.
3. Existing s24 emulator window capture returned `FrameArrived timed out`; adb app probe hung. No visual layout or native playback acceptance is claimed. No reset/reinstall/rebuild was attempted.

Next: recover the live app source and a responsive QA session, visually verify the actual controls/player, review 10-20 real clips against exact current public listings and reuse permission, dry-run/narrowly deploy only the two new video functions, verify storage and cleanup, publish the compatible iOS Preview patch, then apply/verify the exact reviewed media bindings while parser idle and enable the bounded pilot. Existing automatic-resolution and response-reuse gates remain off. The next regular-parse audit is separate and still requires completion proof.
