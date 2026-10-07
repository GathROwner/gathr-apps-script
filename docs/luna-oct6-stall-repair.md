# October 6 parser stall repair and guarded continuation

## Scope and stop point

The regular 376-row dataset `1IcZOB0T9oxC1hugFaR0QbSD4nD_25t9I` runs under `f1e9ec56-544a-4ed6-bed0-1f853705db5e`. Craig approved pausing this run to repair repeated large-row stalls. The `processDatasetResume` queue was paused at 23:08 UTC. The active worker finished naturally at checkpoint row 274, batch 1, and left the lock `paused`; no `processed_datasets` completion marker existed. The source file and run ID were retained.

## Diagnosis and code

Rows 55, 80, 257, and 258 had different expensive components. Row 80 sent 37 validated items to one unbatched GPT-5 nano Stage 5 call because nine-item batching applied only after a Luna Stage 3 selection. Rows 55 and 258 spent substantial time in serial venue/deduplication/write work. A resume task could exhaust six busy-lease attempts before a long worker's lease became stale, leaving the queue empty. Earlier partial writes were updated on replay, but individual event writes lacked a worker-fencing check. See `docs/luna-oct6-row55-stall.md` for timings and the guarded manual recoveries.

Commit `d2abaec` applies 15-item Stage 4 and nine-item Stage 5 batches with at most two simultaneous model calls to regular full-dataset rows on either Stage 3 model path. Batch results retain source order and Stage 5 still holds a post on count or source-identity failure. It caches repeated venue and address lookups within one row only, checks worker ownership around per-event work, increases the resume function timeout to 1,740 seconds, and sets a 1,800-second Cloud Tasks dispatch deadline for newly enqueued initial and successor tasks. A busy resume claim now schedules a delayed guarded probe instead of spending all retries while another worker is alive. A genuine successor-enqueue error propagates without modifying another worker's lock.

## Verification and release

The final TypeScript build and 38 focused tests passed. The tests include out-of-order parallel Stage 5 responses, complete source-item ordering, Stage 4 partition coverage, venue-cache separation, and resume checkpoint guards. A local `dryRun:true` replay of Baba's row 80 used the same GPT-5.2 Stage 3 path: 37 extracted, 36 Stage 4 validated in three chunks, four nine-item Stage 5 calls, and 27 final listings after the existing recurrence collapse. `parse_full5stage` took 242,752 ms versus the earlier 612-second first pass. The replay wrote no events and had no parser error; it does not prove all 27 listings are source-correct. Log: `artifacts/luna-oct6-stall-repair/row80-fixed-dry.log`.

The exact four-function Firebase dry run passed. Only `processDataset`, `processDatasetResume`, `processDatasetSelectedRows`, and `apifyWebhook` were deployed to project `gathr-migrated` / codebase `gathr-functions`. Firebase warned that `firebase-functions` is outdated; deployment succeeded. All four functions read back `ACTIVE`, and Cloud Run readback showed 100% on the new ready revisions: `processdataset-00453-fam`, `processdatasetresume-00417-gut`, `processdatasetselectedrows-00409-feb`, and `apifywebhook-00330-yay`. The resume function readback shows timeout 1,740 seconds. Canary configuration remained Stage 3 only, Luna high at 50% of eligible image posts, GPT-5 mini in Stages 1-2, GPT-5 nano in Stages 4-5, GPT-5.2 for unselected Stage 3, and no legacy fallback.

While the queue was paused, the exact pending 600-second task was backed up at `artifacts/luna-oct6-stall-repair/queued-resume-before-replacement.json`. A new task `resume-repaired-f1e9ec56-row274` was created through the signed-in operator account with the same dataset, run ID, `full5stage` mode, `dryRun:false`, and expected checkpoint `{rowIndex:274,batchNumber:1}`, plus a verified 1,800-second deadline. The old exact task was deleted, leaving only the replacement, and the queue was resumed. The replacement claimed on revision `processdatasetresume-00417-gut` and advanced the same run to checkpoint row 281 by 23:42 UTC with a fresh worker heartbeat.

## Remaining evidence

The full run has not yet completed at this checkpoint. Confirm final lock, processed dataset, batch state, absent checkpoint, selected Luna posts and actual writes. Reconcile first-pass/replay writes for rows 55, 80, 257, and 258 against source inventory and watch any further large row for latency, holds, and duplicate records. A per-item Firestore write is checked against worker ownership just before the write, but that read and write are not one transaction; an extremely narrow handoff race still remains possible and requires the final duplicate audit.

## Completion, October 7 at 00:14 UTC

The resumed regular dataset completed under the original run ID. Firestore readback showed `processing_locks/{fileId}` completed, `processed_datasets/{fileId}` present with `processedAt=2026-10-07T00:14:11.273Z`, `batch_states/{fileId}_1` completed at 376/376, and no `checkpoints/{fileId}` document. After the repaired task claimed row 274, 106 observed checkpoint advances reached 376 with no regression or further stall. Final batch statistics: 60 processed, 100 skipped, 216 invalid, 8 duplicate, 0 error rows; 139 new events and 78 event updates. The separate source and live-write audit is in `docs/luna-stage3-oct6-50pct-production-audit.md`.
