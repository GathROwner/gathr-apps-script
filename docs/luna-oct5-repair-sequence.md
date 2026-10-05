# Luna Stage 3 repair sequence after the October 5 full parse

Evidence: `docs/luna-stage3-oct5-50pct-production-audit.md` and `artifacts/luna-oct5-canary-audit/`. The regular 351-row run completed; these are repairs for the next run, not edits to that completed dataset.

## 1. Resume replay and canary identity — deployed, awaiting next full-run proof

The October 5 snapshots show rows 119–147 processed twice roughly 11 minutes apart. The second pass switched rows 121 and 145 from Luna to GPT-5.2 and row 147 from GPT-5.2 to Luna. Cloud Run logs confirm overlapping resume executions of the same run: one began row 119 at 13:03:22 UTC and reached row 147 at 13:07:54; another began row 119 at 13:13:21 while the first was still working. The first saved checkpoint row 148 at 13:13:44, then the overlapping execution saved row 146 at 13:20:22, moving durable progress backward. A resume request hit a 540-second timeout at 13:03:18. The logs establish overlap and a timeout in this period, but do not conclusively identify the task-dispatch event that initiated the second execution. The code proves two further weaknesses: checkpoints were saved only at batch pause, and Stage 3 selection used a mutable eligible ordinal while only logging the post ID.

Save a checkpoint after each fully handled row and select eligible Stage 3 posts by a deterministic hash of dataset ID and source post ID. This makes a retry start after the most recent durable row and preserves the model for any row that must be replayed. The resulting percentage is an expected rate among eligible posts rather than an exact quota; compare the observed eligible and selected counts after the next full run. It adds one checkpoint write per row and does not promise exactly-once event writes for a timeout inside a row. A resumed worker transactionally claims a paused lock with the exact queued checkpoint, or recovers a newer per-row checkpoint only after the previous 540-second worker's lease has been stale for 570 seconds. The worker refreshes the lease every 30 seconds while alive. Fresh concurrent claims retry; a worker-specific ownership token and monotonic checkpoint check prevent an older execution from replacing newer progress.

Inspect Cloud Task and function logs to distinguish timeout retry from duplicate dispatch. The transactional guard closes the concurrent-claim code path, but its behavior still needs production observation. A timed-out task that had already written some events inside its current row may retry that row; normal dedup must still be verified there.

Gate: TypeScript build, replay test showing a post keeps its model at different ordinals, test of configured sample rates, narrow Firebase dry-run, no active large parse, then deploy the three parser entry points and read back revisions/environment. These checks passed on October 5. The narrow Firebase deploy completed at about 16:01 UTC. Firebase function readback shows `processDataset`, `processDatasetResume`, and `processDatasetSelectedRows` ACTIVE on source hash `84b4f6081296804c29cae9beeb1cf8427e2d8b58`, with Luna enabled, Stage 3 only, sample 50, reasoning effort high, and legacy fallback false. Independent Cloud Run revision/traffic readback remains unavailable to this account. Audit replay, checkpoint monotonicity, and counters on the next completed regular dataset.

## 2. Wrong dates and five live records — parser fix deployed; live cleanup pending

The Local Pub source says October 11–12 but two October 4–5 records were written. Cloud Logging proves Luna extracted October 11–12, then the special weekday-prefix postprocessor changed them to October 4–5 based on the October 4 posting date. The event path already preserved an extracted date whose weekday matched the prefix; the food-special path lacked that check. The repair gives food specials the same protection. An exact-post dry run with the original source image kept October 11–12 through Stages 3 and 4. This run's model did not provide meal hours, so the final completeness check held both listings; the date repair is verified, but a complete event write is not established by that replay.

Harmony House's yearless September 25–26 source was rolled into 2027 by Luna at Stage 3, although official source pages establish 2026. A narrow source-date guard now holds a Luna item when its yearless source month/day occurred within 30 days before the post and the extracted date uses either that past year or the next year. The hold applies per item and stops legacy fallback when it removes the whole post. The first exact-post replay exposed the fallback escape; after the fix, a second replay with fallback deliberately enabled held all three 2027 items, made no GPT-5.2 call, and produced no payloads.

The parser repair is commit `a0bbde5`. TypeScript build, 15 focused tests, and narrow Firebase dry run passed. A narrow deployment of `processDataset`, `processDatasetResume`, and `processDatasetSelectedRows` succeeded October 5 at approximately 16:32 UTC. Firebase readback reports all three ACTIVE on source hash `0595bd7ef372c95ec01d5a83688209fded2de04c`, with Luna enabled for Stage 3 only at 50%, effort high, and legacy fallback false; Stages 1–2 remain GPT-5 mini and Stages 4–5 remain GPT-5 nano. Independent Cloud Run revision/traffic readback remains unavailable to this account.

The five false live records remain. The target-specific script `firebase/repair-oct5-luna-wrong-dates.mjs` defaults to a read-only dry run. Its October 5 dry run found exactly the five expected same-source siblings, and all five title, source ID, date, time, recurrence shape, and Firestore update times matched. It wrote a fresh complete backup to `artifacts/luna-oct5-canary-audit/wrong-date-cleanup-backup-2026-10-05T16-35-37-156Z.json`. The correct October 11 and 12 Local Pub listings are separate source records and are excluded. The guarded atomic delete needs specific approval before `--apply`; then verify Firestore and the API feed. Audit new date behavior in the next regular full run.

## 3. Source-grounded omissions — pending

Trace Stage 4 no-item results for Trailside and RCMP, Stage 5 no-item results for Milton Hall, and extraction misses for Bell Aliant Centre and Stanley Bridge. Reproduce each using original caption and ordered gallery, then make a scoped parser or validation fix and repeat dry runs.

## 4. Write and dedup losses — pending

Trace why Bell Aliant Centre saved nine of eleven payloads and Eastern Kings Sportsplex saved eight of ten. Check source identity and time-slot reconciliation before changing dedup. Preserve the corrected rink records and Side Door Tango occurrences.

## Separate scope tracks

Ontario Cornwall Public Library under a PEI venue requires a geography/venue rule and live-record review; it is not a Luna-only defect. The ticket-pill URL issue and app-only display issues remain separate from this parser sequence. Do not interact with the GathR map.
