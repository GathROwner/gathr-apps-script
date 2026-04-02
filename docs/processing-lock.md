# Processing Lock and runId Guard

This project uses a Firestore lock to prevent overlapping parses for the same
dataset file. The lock lives in the `processing_locks` collection and is keyed
by `fileId`.

Related: `docs/logging-runbook.md` for where parser, webhook, backend image,
and request logs are located.

## Why it exists
- Multiple starts or resumes for the same fileId were causing checkpoint
  regressions (row index jumps backward) and repeated processing.
- The lock ensures only one active run can drive a fileId at a time.

## Lock fields
- `fileId`: Drive file ID being parsed.
- `runId`: Unique ID for a single parse run.
- `status`: `running`, `paused`, `completed`, or `failed`.
- `startedAt`: When the run began.
- `lastHeartbeat`: Last time the run refreshed the lock.
- `expiresAt`: When the lock becomes stale.
- `source`: Trigger that last updated the lock (for debugging).

## Behavior
- Start triggers (`processDataset`, `apifyWebhook`, `retryApifyWebhook`) call
  `acquireProcessingLock` before any work. If another active lock exists for
  the same fileId, the start is skipped and the caller gets a 409.
- When a batch pauses, the lock is refreshed with `status: paused` and the
  `runId` is passed into the Cloud Task payload.
- `processDatasetResume` requires `runId`. Tasks without a `runId` or with a
  mismatched `runId` are skipped to avoid stale replays.
- `processDatasetResume` also refuses lock refresh when lock status is
  `completed` or `failed` (terminal), so delayed/stale Cloud Tasks cannot
  revive a finished run.
- Resume task enqueue now uses deterministic task IDs derived from
  `fileId + runId + checkpoint(batch,row)` to dedupe duplicate
  schedule attempts for the same checkpoint.
- Completion or failure releases the lock by setting `expiresAt` to now.

## TTL configuration
- Default lock TTL is 30 minutes.
- Override with `PROCESSING_LOCK_TTL_MS`.
- Ensure the TTL is longer than the max batch duration plus the pause delay so
  paused runs stay locked.

## Manual recovery
- If a run is stuck, wait for the lock to expire or delete the lock document
  in Firestore to allow a fresh start.
