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
- Row 80 was outside the 50% Luna cohort (`postId=1667441038524756`, eligible ordinal 15, selected=false). Its Stage 3 call used GPT-5.2 for 77.4 seconds. Stage 4 used GPT-5 nano for 77.1 seconds. The Stage 5 formatter then sent all 37 validated items in one GPT-5 nano call lasting 324.6 seconds; its result contained 29 formatted items. No `Stage 5 canary formatting batch` logs appeared. The nine-item Stage 5 limit is currently configured only for selected Luna posts, so large unselected posts retain the unbounded formatter call.
- The active resume worker for row 80 began at 18:32 UTC and entered the row at 18:34:33 UTC. Its 540-second request deadline occurred during Stage 5; subsequent row writes continued after that deadline. The 612-second `parse_full5stage` duration therefore includes this overrun and should not be read as Stage 3 model latency.
- The row 80 worker stopped heartbeating at 19:10:56 UTC; the sixth busy-lease retry exhausted the queue at 19:12:08 UTC. A second guarded manual task, `manual-recover-row80-20261006-1921`, used the same run ID and expected checkpoint `{rowIndex:80,batchNumber:1}` and claimed the stale lease at 19:21 UTC.
- The replay finished row 80 by 19:27:52 UTC; the checkpoint reached 87 under the next worker by 19:28:45 UTC. All eight event IDs created during the first row 80 attempt appeared as updates on replay, rather than new creations. The replay created 19 other records and updated 10 total, per timing logs. These counts do not replace a source-grounded inventory audit.
- Replay output varied: Stage 3 again extracted 37 items, Stage 4 kept 36 rather than 37, and Stage 5 formatted 30 rather than 29. Persisting validated row results before partial writes should be considered so a timeout does not silently change the event inventory on replay.

## Third stall at row 257

- At 22:02 UTC, the checkpoint remained at row 257 with the original worker's last lock heartbeat at 21:41:43 UTC. Its last logged event write was 21:41:46 UTC. The resume queue was empty after a 21:43 busy-lease retry, and there was no processed-dataset marker.
- A guarded task, `manual-recover-row257-20261006-2203`, carried the same run ID and expected checkpoint `{rowIndex:257,batchNumber:1}`. It atomically claimed the stale lease at 22:02:59 UTC and began row 257 at 22:03:02 UTC. Checkpoint completion and write reconciliation remain pending.
- The replay's Stage 1 image validation needed a second call after its first JSON response was truncated. This is an additional source of row latency; its relationship to the first attempt's stall is not yet established.
- The lease change prevented the queued 21:43 resume from claiming while the old heartbeat was fresh; the 22:02 recovery claimed only after staleness. No concurrent row 257 workers are visible in the available logs. However, worker fencing protects checkpoint/lock writes, while individual event create/update calls do not carry a worker ID. The post-run repair should fence those writes too and make recovery durable when a retry queue exhausts before the lease goes stale.
- The replay advanced the checkpoint to row 258 at 22:09:56 UTC. All five event IDs created by the first row 257 attempt were updated by the replay, not created a second time; the prior updated ID was also updated again. The replay made additional writes after those updates. These write logs show reuse of the first-pass records, but do not yet prove a correct source-grounded inventory or exclude other duplicates.
- First-pass timing logs show Stage 3 at 76,455 ms, Stage 4 at 178,679 ms, Stage 5 at 218,064 ms, and the full five-stage parse at 607,927 ms. The parse itself exceeded the worker's 540-second request limit before the later serial venue/write work. The row was unselected for Luna and used GPT-5.2 in Stage 3, so the Luna-only nine-item Stage 5 batch configuration did not apply. The guarded replay parsed the row in 389,365 ms (Stage 3 78,342; Stage 4 103,733; Stage 5 121,648), then wrote quickly enough to checkpoint.

## Fourth stall at row 258

- Row 258's first pass validated 14 items. Its five-stage parse took 254,324 ms (Stage 3 31,702; Stage 4 44,536; Stage 5 68,950), within the request limit. Subsequent serial resolution, dedupe, and writes kept the row active for more than 28 minutes. Two dedupe checks alone took 30,799 and 57,400 ms. The last original-worker heartbeat was 22:41:01 UTC, with row activity through 22:42; a 22:43 retry still saw a busy lease, and the queue later emptied without a checkpoint past 258.
- At 22:57:40 UTC, the lock still had the same run and worker, checkpoint 258/batch 1, no processed dataset, and no queued task. Guarded task `manual-recover-row258-20261006-2257` carried the same run ID and expected checkpoint 258/batch 1; it claimed the stale lease at 22:58:11 UTC and restarted the row. Completion and first-pass write reconciliation remain pending.
- This row shows a second independent timeout route: a moderate 14-item model parse can still strand the run during later serial item processing. Stage 5 batching alone will not solve it.
