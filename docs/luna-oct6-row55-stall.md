# October 6 large parse: row 55 stall and guarded recovery

Dataset `1IcZOB0T9oxC1hugFaR0QbSD4nD_25t9I` (376 rows), run `f1e9ec56-544a-4ed6-bed0-1f853705db5e`, source hash `454511a1e557e04d1973e025fb7dbc2d43a789ab`.

## Observed failure

- The first resume worker began Downtown Charlottetown Inc. row 55 at 17:34 UTC. Its five-stage parse yielded 21 items and took 294.2 seconds. The following venue matches ran serially, taking 88–195 seconds for several individual calls. Sixteen `venue_match_item` calls totalled 1,186,725 ms.
- The 540-second request timed out. The worker continued making some progress after that response, but its final logged row activity was 18:07:31 UTC and its final lock heartbeat was 18:06:59 UTC. The checkpoint remained at row 55.
- The queued resume saw the fresh running lease and retried until its six attempts were exhausted at 18:08:34 UTC. The queue then had no task, so the run could not advance on its own if the original worker remained stalled.

## Recovery and verification

- After the lease had aged past the 570-second stale threshold, readback at 18:16 UTC still showed the same run, worker, checkpoint 55, no processed dataset, and no queued task.
- Queued one HTTP task, `manual-recover-row55-20261006-1817`, for 18:17:15 UTC with the same run ID, `full5stage` mode, and expected checkpoint `{rowIndex:55,batchNumber:1}`. The new worker atomically claimed the stale lease at 18:17:20 UTC and began from row 55.
- The replay passed 21 items through Stage 4 and advanced the checkpoint to row 56 at about 18:20:57 UTC, then row 57. Its 21 venue matches took roughly 0.06–0.8 seconds each. This supports a transient lookup slowdown; it does not identify its underlying cause.
- The first pass created four events before stalling. The replay updated existing events for those already written and created four other events; no repeated creation of the first four was observed in the timing and creation logs. A full source-to-Firestore audit is still required after the run completes.

## Follow-up after completion

- Audit row 55 writes against its source and verify no duplicate records or missing items.
- Bound per-row work so one broad roundup cannot exceed the function timeout without a per-item checkpoint. Review venue lookup latency, per-row memoization, and retries; the nine-item Stage 4/5 model batching does not bound this later serial venue/write pass.
- Audit the completed full run and all Luna-selected posts before making a rollout decision. Do not deploy parser changes while this run is active.

## Second oversized row observed during the same run

- Row 80 began at 18:34:33 UTC with the checkpoint at 80. Its five-stage parse alone took 612,017 ms, exceeding the 540-second worker request limit before per-event venue resolution and writes began.
- The row was still making individual event writes at 19:02 UTC. The next queued resume had already made five unsuccessful busy-lease attempts and was scheduled for its sixth at 19:12 UTC. A fresh lock heartbeat meant the current worker was still active at the 19:01 audit.
- This shows that the hardening must address bounded work and durable progress for any large row. Venue-match memoization alone cannot prevent a model parse that already exceeds the worker request limit. The current run remains active; no parser deployment was made.
