# Guarded regular-post response reuse — October 26, 2026

## Status

Implemented in isolated branch `codex/unchanged-post-reuse-20261026`, reconstructed from the independently verified serving package for commit `bb1ea30dc74a2b4db223969730cf99c492133184` / common source hash `ed111d2797fe07a3ad733ce2e330ba83a208fd30`. The original candidate Git object is not present in the main repository; `post-reuse-oct26-baseline.json` records the reconstruction and byte verification. Main and other release checkouts were preserved.

**Not deployed or enabled.** `PARSER_RESPONSE_REUSE_ENABLED` defaults off. Today's regular dataset `1BacBzGL0VV4lxdttFuGTMpBcu2q6sqNr` was observed running at13:36UTC; the14:00UTC readback showed no active lock. There were no deployments, event/review writes, replays, queue/checkpoint mutations, model calls, scrapes or traffic changes in this work. Existing automatic venue-resolution/creation gates remain off.

## Behavior

The guard reuses visible JSON answers for identical AI requests. It does **not** skip the row's routing, venue resolution, date/recurrence guards, duplicate matching, manual protections, engagement updates or event-writing logic. This deliberately preserves downstream checks even when an AI answer is reused.

- Regular full-dataset processing only. Selected-row reruns, dry runs, structured Facebook Events, malformed source identities and unfenced invocations retain the original path.
- Exact source identity, publisher context, captions, source timestamps and shared-post context; engagement counters are excluded from the source fingerprint.
- SHA256 of all original source images in order, including the distinction between outer/shared galleries. No truncation into a smaller gallery or caption-only source.
- A bounded initial scope of up to four complete source images and up to four images per request. Larger/dense-image requests use normal processing. Original and preprocessed image bytes must both match. Image reads have1.5-second timeouts and bounded byte budgets; failures use normal processing.
- Automatic policy fingerprint of runtime JavaScript/JSON, dependency lockfile, configuration and environment. Secret values are hashed in memory and never recorded. Exact request bodies still bind models, efforts, prompt/schema/cache contracts and image detail.
- Prior producer must be a different completed dataset/run with a processed marker after the latest validation. Entries expire after72hours; repeated hits cannot extend the original answer lifetime.
- Current versions of the affected venue/event documents must match the saved pins. Venue edits, event repairs, deletions and missing version proof invalidate reuse. Nanosecond timestamp precision is retained. Existing row-level protections still execute afterward.
- Successful resolved posts and ordinary explicit Stage1/2 rejections may approve capture. Holds, unresolved items, stage failures, malformed JSON, provider refusals, incomplete replies and subsequent row/snapshot errors do not approve capture.
- Only visible JSON is stored. Provider IDs, historic billed usage and hidden reasoning are omitted. Answers containing temporary/managed source-image URLs are not retained.
- `parser_response_reuse` is the only new write destination. Cache writes re-read the exact run/worker lock in their Firestore transaction. Live Firestore rules were read: there is no recursive allow rule or public rule for this new collection. No rules were changed.
- Snapshots separate `reusedResponses` / `reusedResponsesByStage` from paid calls and tokens. Reused answers contribute no historic usage to the new run's cost report.

Logical expiry does not create a retention cleanup job. No automatic-resolution gate, Stage4 cache/layout/compact contract, model setting or prompt was changed.

## Validation and limits

- Build passed.
- Initial full compiled backend run:1280/1281 checks passed. The one failure was the existing October24 STEAM fixture being filtered as expired on October26. The same failure was reproduced on the unchanged serving package. Its test now fixes the clock to the fixture's own date; runtime date filtering is unchanged.
- Final focused checks cover cache equality/invalidation, source and processed-image bytes, concurrent row isolation, exact SDK request/options preservation with offline fetch playback, paid-call accounting, completion proof, nanosecond document pins and stale-worker transaction fencing. Exact results are retained in `functions/artifacts/post-reuse-oct26/focused-final-tests.log`.
- Saved-source transport playback:53 of57 byte-confirmed historical repeat rows passed; four exceeded the initial four-image budget. The saved normalized Stage1 validation JSON remained identical. Request envelopes were rebuilt for this offline check; they are **not** original provider request/response recordings. This is not a new quality audit, production cache-hit measurement, live-document-pin test or network-latency benchmark. No paid calls or live writes were made.
- The earlier27-cent/five-day figure is associated historical spend, not a savings forecast for this narrower implementation. Code/config changes, document updates, image budgets and unavailable images intentionally reduce reuse coverage. Hashing/storage introduce overhead that must be measured before claiming net savings.

## Remaining release work

1. Independently review the exact candidate and its new internal storage/read overhead; retain the original serving archive for rollback.
2. Prove the regular run fully completed using its lock, processed marker, final batch and absent matching checkpoints; refresh the three serving functions, traffic and configuration.
3. Assemble a narrow immutable parser release from the verified serving baseline, preserving all existing environment/model/cache contracts and max-instance limits. Run the codebase-qualified three-parser dry run.
4. Perform a bounded production rollout/readback and assess the added source-image verification overhead before enabling reuse. Cold caches require normal processing first; no historical entries have been backfilled.
5. Verify actual paid calls versus reused responses during a subsequent normal completed run. Keep all unrelated automatic-resolution gates off.

No release or activation is implied by the offline tests.
