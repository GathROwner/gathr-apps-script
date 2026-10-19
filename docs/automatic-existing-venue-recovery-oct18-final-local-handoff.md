# Existing-venue recovery — final local handoff, October18

**The two admission defects are fixed and independently cleared in the replacement
candidates. Production automation remains OFF; no deployment or live repair was
performed.** This handoff updates the earlier provisional review status while
preserving every prior frozen candidate and receipt.

| Variant | Independently verified replacement |
| --- | --- |
| scheduled | `19b561181ab49f3ae8d8442297d7681c4739af4b` |
| manual | `4fecc8e0bf1f269298ba570cff54673a49c61eb2` |

Each candidate built and passed106 focused checks and all495 compiled backend
tests across61 files. The independent verifier separately reran all495 tests on
both exact commits with zero failures/skips, clean Git state and all634 payload
hashes unchanged before/after. Independent rollback/failure/crash boundary checks
also passed. The old commits remain reproducible evidence of the two review
findings and must not be released.

The fixes preserve admission after gate-off/allowlist removal and retain durable
uncertain manual outcomes after partial failure or expired/crashed work. No
automatic retry can clear those receipts. Successful admission confirmation
requires an owned live lease plus a successful terminal finalization receipt;
it does not claim that a queued asynchronous row has finished. The automatic
path never invokes the broader manual finalizer.

Detailed scope and evidence limits:
[admission revision2](automatic-existing-venue-recovery-oct18-admission-v2.md).
Machine-readable final receipt and payload manifest:
`functions/artifacts/automatic-existing-recovery-oct18/admission-v2/final-completion.json`
and `final-frozen-completion.json`. The root `LATEST.json` points to these.

## What remains before a live pilot

1. **Source-complete ordinary event positives.** Four retained resolver cases hold;
   eight incomplete historical manifest projections also hold, with all human
   resolution labels excluded from features. The Motel is venue-identity
   evidence only: its21:22 clock was explicitly a post-time fallback. It is not
   an event-recovery positive. No source IDs, clocks or policy fields were filled
   in, and no production-yield claim follows from these abstentions.
2. **Historical checkpoint decision and full preflight.** The three files stopped
   at142/336,107/305 and175/294 rows, with no processed marker. Current resume
   guards reject their missing/terminal locks, but completion is unproved.
   The unapplied six-document proposal would archive/delete three exact
   checkpoints and honestly retire their three batch states. Full-body dry-run
   fingerprints/backups and explicit abandonment approval would be needed; age
   alone is not permission, and no cleanup is authorized by this handoff.
3. **Actual release assemblies and approval.** The separate manual handler
   `finalizeUnrecognizedVenueTrigger` also needs the mutex. Its fresh baseline is
   `finalizeunrecognizedvenuetrigger-00236-cen`, source hash
   `9da2aaf2edc38a0bc0a2494505cc516db7f113c3`, source generation
   `1786566580891239`. It is ACTIVE/latest100%, timeout180s. A separately pinned
   assembly must preserve that handler's own serving behavior. A two-resolver-only
   deployment is insufficient. After all evidence gates, prepare the exact narrow
   release and one manual allowlisted pilot for separate approval; the scheduled
   automatic gate stays OFF.

Checkpoint diagnosis, exact paths/versions and proposal are under
`functions/artifacts/automatic-existing-recovery-oct18/checkpoint-diagnosis/`.
There were no production event/review/venue/checkpoint writes, source replays,
Drive reads, paid model/provider calls, credential changes, email, new monitor,
schedule, traffic, IAM, index or environment changes.
