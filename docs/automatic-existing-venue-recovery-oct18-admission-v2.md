# Automatic existing-venue recovery — admission revision 2

Status: **local replacement candidates; no deployment or live pilot**. This
supersedes the admission-safety claims in the earlier October18 preparation.
The old commits and receipts remain frozen as reviewed history; their successful
98/487 tests did not cover the two independently reproduced admission defects.

## Review findings and replacement scope

1. The old manual wrapper bypassed all admission reads after an ID was removed
   from the allowlist. An already admitted automatic worker could remain active
   during rollback. Removing rollout membership must not remove its mutex.
2. The old wrapper cleared its manual lease in `finally` after a throw, even if
   aliases, Drive, row tasks or shared promotion had already changed. A later
   automatic claim could mistake that record for untouched work.

Independent counterexamples:
`C:/Users/craig/Documents/Codex/2026-10-18/task/review-auto-existing-admission.cjs`
and `review-auto-existing-admission-results.json` beside it. They use in-memory
effects and perform no production calls or writes.

| Variant | Replacement commit | Reviewed parent retained unchanged |
| --- | --- | --- |
| scheduled | `19b561181ab49f3ae8d8442297d7681c4739af4b` | `78a5f7ea5e20469c3d3ad183a8b20de9966b90c8` |
| manual | `4fecc8e0bf1f269298ba570cff54673a49c61eb2` | `1b8176ad0b095250546f5d613885bc9cf9330594` |

New isolated checkouts and evidence:
`functions/artifacts/automatic-existing-recovery-oct18/admission-v2/`.
Each replacement changes exactly five source/test files,158 insertions and23
deletions: the recovery module, adapter, its regression file, resolver's empty-ID
validation and queue types. Both retain their separate immutable serving lineage.
No models, prompts, cache/compact contract, parser release, provider lookup or
automatic invocation of the broad manual finalizer is added.

## Revised admission contract

- The wrapper always reads the queue and durable automatic-operation document,
  independent of current gates or allowlist. Active/unverified/held automatic
  receipts remain protected after removal, rollback and lease expiry. They need
  explicit reconciliation, not a fallback through broad manual finalization.
- **Every existing unresolved manual finalization acquires shared admission**,
  including records outside the current cohort. This deliberately adds internal
  admission reads/writes to those manual calls. It prevents an automatic request
  still holding its older configuration from racing newly started manual work.
  The business callback and its ordinary actions remain the existing workflow.
  Healthy terminal idempotent calls and missing-record behavior remain unchanged
  after the durable-state reads.
- Before the callback runs, the transaction records both its15-minute lease and
  `manualFinalizationOutcome.state=running`. A throw conservatively records
  `uncertain` and preserves the lease token. This applies even before any known
  side effect; the generic wrapper cannot prove that nothing happened.
- Expiry is not permission to retry manual work. An unconfirmed expired admission
  becomes a durable uncertain receipt. Existing/manual/automatic attempts stay
  held until separately reviewed reconciliation. If the failure-receipt write
  itself fails, the original durable running admission remains a barrier; it is
  not silently cleared. No reconciliation/reset endpoint is introduced.
- Successful release requires a successful callback result plus a durable
  terminal queue status and its finalization record, within the same still-owned
  lease. Only the matching token and running receipt can become `confirmed` and
  clear the lease. A late/stale worker cannot clear a newer or uncertain receipt.
  Confirmation concerns the existing manual action's receipt; it does not claim
  that an asynchronously queued row finished recovering public events.
- The automatic planner and adapter reject manual-outcome/lease barriers.
  Automatic recovery still uses its own narrow item path and independent
  database/detail/complete-feed postconditions; it never invokes manual work.

The owner regressions cover rollback and removed allowlists, active/expired
automatic receipts, failures before effects and after alias/Drive/task/promotion/
queue-finalization boundaries, crashed/expired manual workers, unproven returned
success, late completion, stale tokens and manual-versus-automatic races. These
are deterministic simulations; actual external side effects are blocked.

Final build, focused/full-suite receipts and immutable payloads are linked in
`admission-v2/completion.json`. The independent bridge's provisional eight-case/
boundary verification passed against the compiled replacement, but frozen-commit
independent clearance remains a separate gate. No production readiness is
inferred from unit tests.

## Historical cohort and checkpoint follow-up

The pinned earliest-eight manifest is retained unchanged. Offline admission on
its incomplete projections holds all eight, and changing all human-resolution
labels leaves input hashes and decisions identical. This is not eight complete
source/matcher replays. All stored source-ID arrays remain empty; no source ID or
clock is backfilled to produce a positive.

The Motel original snapshot confirms an identity at the same venue independently
listed by [Tourism PEI](https://www.tourismpei.com/where-to-stay/lighthouse-beach-motel).
Its caption advertises seasonal business opening, not an ordinary timed activity.
The saved start21:22 is explicitly a post-time fallback and the end is unknown.
It is **venue-identity evidence only, never an item-recovery positive**. Original
ordered URL metadata was retained; gallery pixels were not downloaded or
re-inspected. The snapshot projection omitted input-text length; no missing field
was manufactured. Original stored token counts are historical, not paid calls
made during playback.

Historical-clock evaluation is allowed offline for a source-complete old fixture,
but cannot authorize publishing an expired occurrence now. Several independently
proven ordinary event-recovery positives are still missing. Do not search the
oldest eight for an impossible current positive or use their human outcomes as
candidate features. A recent/prospective cohort is separately owned.

Read-only checkpoint diagnosis at pinned readTime
`2026-10-19T00:03:30.677930Z` (October18,21:03 Halifax):

| Canonical checkpoint file ID | Last checkpoint | Batch progress | Current lock | Conclusion |
| --- | --- | --- | --- | --- |
| `1MUiME822YcTcCzzx_iWUHJSnmGvdhDSN` | March9,row142 | paused,142/336 | absent | incomplete/abandoned; completion unproved |
| `1_rRO9rp3aJXAhGbqUtVGltCvLAsp1Xj5` | February12,row107 | paused,107/305 | completed | lock completion is not dataset completion |
| `1na4z4c4TWFaLNxKY-p6VX7oGuH3wkiaf` | February17,row175 | processing,175/294 | failed; `manual_stop_queue_pause` | stopped historical work; completion unproved |

No exact or legacy field-matched processed marker exists for these three files.
All three batch inventories were complete (one document each), with no stored
job/task reference. The current serving resume guard rejects missing or terminal
locks; offline playback confirmed the two terminal verdicts. The missing-lock
case follows the explicit early return in the serving source. No task was
delivered or enumerated, no source Drive file was read and no completion was
inferred from age. The source status helper prioritizes retained checkpoints and
would treat these as paused; its HTTP endpoint was not invoked or independently
re-deployed.

Exact paths, versions, projected fields and proof limits:
`functions/artifacts/automatic-existing-recovery-oct18/checkpoint-diagnosis/result.json`.
The proposed six-document retirement batch is **unapproved and unapplied**:

- Full-backup then delete the three exact checkpoint documents.
- Mark their three exact batch documents failed with explicit operator-abandonment
  metadata, preserving stats, row positions and historical dates.
- Preserve locks, absent processed markers, all events/reviews/venues/media, feed,
  queues, schedules and runtime. Do not fabricate completed datasets or replay
  old sources. Abort on any version/status/marker drift.

`retirement-proposal.json` gives exact paths/update times and preconditions. It is
not an executable cleanup helper. A default-dry full-body preflight and complete
backup must precede any later reviewed approval. If the work must remain
resumable, apply nothing and retain the pilot blocker. Merely exempting old
checkpoints from admission is not part of this change.

## Remaining gates

Keep both production automatic gates OFF. Before any pilot: obtain independent
frozen-candidate clearance; qualify the separate source-complete positive cohort;
resolve the historical checkpoint decision through its own exact approved batch;
then review and approve a narrow release and one manual allowlisted pilot. No
deployment, traffic/environment/IAM/index/schedule change, live event/queue write,
email, credential change, paid model/provider call or checkpoint cleanup occurred.
