# Existing-venue recovery — three-handler decision packet

**Local source preparation and independent review are complete. No deployment,
live write, automatic admission, cleanup, source replay or new monitor occurred.**
Both automatic gates remain OFF on all three serving functions, with no allowlist.
This packet supersedes the earlier two-handler preparation milestones. It is a
reviewed **code preparation**, not a deployment-ready environment assembly or a
claim that real event recovery has been validated.

## Frozen candidates and independent tests

| Handler | Candidate commit | Actual serving lineage | Tests |
| --- | --- | --- | --- |
| `scheduledUnknownVenueResolver` | `19b561181ab49f3ae8d8442297d7681c4739af4b` | `cc64c1efb063acdd8cdb505481bc69a2bd3ee071` → reviewed parent `78a5f7e` |106 focused;495 full across61 files;634 payload hashes |
| `processUnrecognizedVenues` | `4fecc8e0bf1f269298ba570cff54673a49c61eb2` | `f83ba410ef422ca20e96afe33af071093c4aef54` → reviewed parent `1b8176ad` |106 focused;495 full across61 files;634 payload hashes |
| `finalizeUnrecognizedVenueTrigger` | `48e10b636650466c19ee7d0ca789069866e491f8` | actual source generation`1786566580891239`, locally pinned as`fc958bf177c962da0e6f42e90c89d970f8d5131f` |22 focused;324 full across49 files;570 payload hashes |

The bridge independently reran each full suite: zero failures/skips, clean Git
state, and every source/compiled/package hash unchanged before/after. Independent
rollback/failure/crash boundary checks also passed. The finalizer's shared
admission function and its five core declarations are byte-identical to both
resolver variants; function SHA256:
`fcca026067cc6767a57a57c3ad8333b24971c3602af2eaa77d25cba9d43689c5`.
Its original business implementation body is byte-identical. Removing only its
new imports/wrapper/private rename restores the original source file exactly.

The actual finalizer candidate changes three source/test files only. A baseline
build first reproduced all412 shipped compiled files byte-for-byte. After the
patch, the only changed existing runtime files are the resolver service source,
its JavaScript and two source maps; its public declaration is unchanged. The
standalone helper does not import automatic recovery, provider or parser code.
Neither resolver baseline replaces the finalizer's older serving baseline.

Evidence root:
`functions/artifacts/automatic-existing-recovery-oct18/admission-v2/`.
The actual-handler subtree is`manual-finalizer-preparation/`, containing its
archive/configuration fingerprints, source-restoration proof, test logs, payload
hashes, commit and cross-variant proof. Prior frozen candidates/receipts remain
unchanged; the old`78a5f7e`/`1b8176ad` admissions are superseded and must not ship.

## Serving identities and environment boundary

Fresh normal-auth readback verified ACTIVE/latest100%, configuration/environment/
secret-binding/IAM hashes unchanged, both automatic gates false and no allowlist:

| Handler / region | Serving revision | Source hash |
| --- | --- | --- |
| scheduled resolver / northeast1 |`scheduledunknownvenueresolver-00243-rek`|`57eee386d0270dda44c00ca167be4c1eda06c3ea`|
| manual resolver / northeast2 |`processunrecognizedvenues-00242-siv`|`eff38f8bef686f069e94daf7837158a065ac8bf5`|
| manual finalizer / northeast2 |`finalizeunrecognizedvenuetrigger-00236-cen`|`9da2aaf2edc38a0bc0a2494505cc516db7f113c3`|

The finalizer runtime is Node22, timeout180seconds. Its immutable source archive
SHA256 is`c000e69c7f4479a31da4d09af9647a3928271f9a3e649276854c41f219fb8177`.
Only566 runtime/build files were extracted;1,594 nonruntime entries, including
historical logs/sandbox and opaque environment members, were not expanded. No
opaque`.env` contents were extracted or committed. Package and lock bytes match
the existing frozen resolver dependencies; no package download or dependency
upgrade was needed.

**Do not deploy directly from these code-only folders.** A later reviewed release
assembly must preserve each handler's own serving environment, secret bindings,
IAM, memory/concurrency/timeouts, ingress and source configuration. Hashes and
safe gate booleans are recorded; raw environment/secret values are not exposed.
Existing resolver scanning/schedules are separate from the two automatic gates
and were observed, not changed. The three whole-source hashes intentionally
differ; only the shared admission protocol must match.

## Admission behavior and operational consequence

Automatic recovery uses saved, independently source-bound single items. It does
not invoke broad manual finalization, aliases/Drive enrichment, paid lookups,
shared promotion or whole-row tasks. Queue completion follows exact stored and
public detail/complete-feed verification. Ambiguities, missing clocks, protected
manual decisions, drift, stale workers and exhausted retries hold.

Manual admission survives gate-off, allowlist removal and expired automatic
receipts. Every existing unresolved manual finalization acquires shared admission,
including outside the rollout cohort, so a worker holding older configuration
cannot race it. This intentionally adds internal admission reads/writes to manual
calls; the business callback remains unchanged. Healthy terminal idempotence and
empty-ID validation are preserved.

**A throw after admission deliberately leaves a durable uncertain outcome—even
when it happened before any known external effect.** A generic wrapper cannot
prove that no side effect happened. Crashed/expired work is held too. No reset
endpoint or automatic reconciliation is supplied. An operator must investigate
the exact action/queued work and obtain any necessary reviewed repair before
retrying. Successful manual confirmation proves its terminal finalization
receipt, not completion of asynchronous row tasks.

## Actual source coverage: no positive recovery claim

- Four retained resolver cases hold. Six separate CFCY area-review cases remain
  outside this resolver benchmark; do not shrink their multi-event source into
  synthetic positives.
- The pinned earliest-eight historical cohort remains intact:227 resolved
  records,217 with timestamps and10 excluded missing timestamps. All eight stored
  source-ID arrays are empty. Their incomplete projection admission holds, and
  perturbing human resolution labels leaves input hashes/decisions identical.
  These are not eight full source/matcher replays.
- Motel evidence confirms venue identity only. Its21:22 start was a post-time
  fallback and no event end was advertised. The independently checked StMary's
  June27 case is future at historical clock`2026-06-04T00:36:24.524Z`, but its
  advertised end is still missing. Neither is a complete historical recovery
  positive or live-eligible now. No missing fields were invented.
- The separately predeclared recent ordinary cohort is dataset
  `1Nwf4lh-reDH0alm37Lvkqu61Shv_mwer`, run
  `23cfe6d4-18e5-4ba2-bfa7-1ba3017cc213`. The selection owner proved completed lock,
  marker,351/351 final batch,0errors and no matching checkpoint at pinned
  readTime`2026-10-19T00:17:35.500105Z`. Its complete328-lock/892-review projected
  selection found four unknown occurrences across three associated reviews
  (two new, one carried forward): **zero routine existing-venue candidates and
  zero strict-eligible links**. Both retained Places suggestions were unsafe.
  Missing and uninspected fields are distinguished in that manifest. This is
  abstention evidence only; notification-attempt timestamps are not delivery
  counts.

Several independently source-complete ordinary recovery positives remain a
required gate. The separately owned prospective plan uses the first next ordinary
completed resume-owned run without triggering a scrape/parse or adding a schedule.
Keep historical and recent denominators separate, include new and carried-forward
cases, preserve all exclusions and report zero if zero. Do not fish for positives,
hydrate missing clocks/IDs or weaken guards to produce a pass.

## Checkpoints: technical blocker, not active-processing evidence

For an otherwise eligible selected record, the current committed`claim` calls a
global idle predicate before any operation/event/feed write. It checks every lock
status and whether either checkpoint collection contains a document, **without a
file-ID filter**. Therefore these three retained canonical checkpoints block even
a different single-record pilot. The result is`busy: parser_or_checkpoint_active`;
that generic reason does not mean these old files are running. There is no
allowlist/config bypass or age exemption in this preparation.

At pinned readTime`2026-10-19T00:03:30.677930Z`, each file had exactly one retained
batch and no direct or field-matched processed marker. No checkpoint had a runId
or stored job/task reference. Their versions remained unchanged during the later
bounded event check at`00:24:26.222703Z`.

| File ID | Last activity and state | Bounded event-state proof | Current disposition and risk |
| --- | --- | --- | --- |
|`1MUiME822YcTcCzzx_iWUHJSnmGvdhDSN`|March9 checkpoint row142; batch paused at142/336; no lock; no completion marker.|14 retained entry IDs; first3 lexical exact IDs returned no current match. Remaining11 uninspected.|Retain pending explicit abandonment decision. Current queued resume rejects missing lock; safe resumption/source availability is unproved. Partial public writes may remain.|
|`1_rRO9rp3aJXAhGbqUtVGltCvLAsp1Xj5`|February12 checkpoint row107; batch paused at107/305; lock completed; no completion marker.|No retained entry IDs; no exact event link or event query. Event state unknown.|Retain/hold. Completed lock is not full-dataset completion. Neither abandonment intent nor safe resume is proved; do not fabricate completion.|
|`1na4z4c4TWFaLNxKY-p6VX7oGuH3wkiaf`|February17 checkpoint row175; batch processing at175/294. Lock failed March9 with`manual_stop_queue_pause`; no completion marker.|41 retained entry IDs; first3 lexical exact IDs returned no current match. Remaining38 uninspected.|Preserve the recorded stop; no resume. Retirement needs explicit abandonment approval. An old processing batch label is not evidence of an active worker.|

These are stored batch totals, not a new Drive-file inspection. Six exact-ID
nonmatches are **not a census** and cannot prove no related or merged/renamed
events remain. No captions/media or unrelated event inventory were exported.
Retirement would not undo prior public writes, and no event cleanup is proposed.

Current resume fencing rejects missing/terminal locks; no task was dispatched or
whole queue enumerated. Explicit manual start can technically adopt an old
checkpoint under a new run, so absence of active work is not proof of safe resume.
Source-file availability/content and full historical completion remain unknown.

Safest current action for all three is **leave them unchanged**. The separately
approvable alternative is explicit abandonment: full-backup/delete their three
exact checkpoints and mark their three exact batches failed with retirement
metadata while preserving stats, positions and historical dates. Do not mark
datasets processed. A full-body default-dry preflight, exact versions/hashes,
timestamped complete backups, idle recheck and explicit approval must precede
that six-document transaction. Restore is only a separately guarded metadata
operation if no newer run/state intervened; backups do not reverse old event writes.

Exact identities, versions, minimal projections and limits:
`checkpoint-diagnosis/result.json`, `event-state-result.json`,
`bounded-pilot-admission-proof.json` and `retirement-proposal.json` beneath the
original evidence root. The proposal is not approved, executable or applied.

## Groundwork release — explicit approval still required

The three-handler groundwork can be reviewed/deployed with gates OFF before a
positive cohort or checkpoint-retirement decision exists. Those are prerequisites
for **automatic pilot admission**, not evidence that these old files are active
or permission to change them. No groundwork deployment approval has been
forwarded to this task; all deployment remains held.

1. After explicit approval for the three-handler OFF-gate groundwork, re-pin all
   three immutable serving packages/configuration hashes and prepare
   per-handler release assemblies that preserve opaque environment/secret/IAM
   state. Observe actual active locks and both checkpoint collections, distinguishing
   the three known historical holds from active work. Wait for active parser work
   unless its timing was explicitly approved. Do not invoke recovery or exempt
   checkpoints. Commit and build/test the exact release payload; stop on drift.
2. Deploy **manual finalizer first**, with its own reviewed configuration and
   codebase-qualified single target:
   `functions:gathr-functions:finalizeUnrecognizedVenueTrigger`.
   Qualified dry run must pass first; verify ACTIVE/latest100%, exact serving
   code and preserved config/env/secrets/IAM. Let old unfenced HTTP invocations
   drain for their180-second maximum after verified cutover before any automatic
   admission. This does not prove queued asynchronous tasks finished: the chosen
   pilot record's manual/task history must independently be known or remain held.
3. Deploy the **manual resolver**, target
   `functions:gathr-functions:processUnrecognizedVenues`, then the **scheduled
   resolver**, target`functions:gathr-functions:scheduledUnknownVenueResolver`,
   each from its own assembly with its own qualified dry run and independent
   readback. Do not combine them under one unrelated source baseline, deploy all
   exports, update the three parsers or change schedules/traffic manually.
4. Confirm all three shared protocol hashes and OFF gates/empty allowlists, then
   **stop**. Groundwork approval does not authorize a pilot call, allowlist/gate
   change, checkpoint retirement, mail or monitoring.

## Separate pilot prerequisites — not authorized by groundwork

Qualify real ordinary positive evidence and decide the historical checkpoint
issue. Prepare a full checkpoint preflight before seeking its separate exact
apply approval; no cleanup follows from approving source code. Inspect any prior
manual/task history affecting the chosen record; unknown partial effects remain
held. Only after these gates and the separate exact pilot approval may the manual
resolver enable
   automatic-existing resolution for **one named proven ID**. Auto-create remains
   OFF; the scheduled resolver's automatic-existing gate remains OFF. One
   authenticated saved-source`docId` request must satisfy full backup/source/
   occurrence/duplicate/media/DB/detail/complete-feed postconditions. No broad
   manual finalizer, paid lookup, model call or whole-row replay is authorized.

Each future groundwork CLI command must use its own reviewed config,`--project gathr-migrated`
and its one exact`--only` target, first with`--dry-run`. A rejected narrow target
must be fixed, never widened. None of these deploy commands was run here.

## Safe rollback and earliest milestone

Turning gates OFF or clearing the allowlist **does not cancel admitted workers**.
Safest rollback retains the shared admission code on all handlers and every
operation/manual-outcome receipt while disabling future automatic admission.
Do not revert the manual finalizer to unfenced legacy source while any worker or
unverified/uncertain receipt exists. Lease expiry is not reconciliation. Do not
clear ledger/outcome fields or delete public data to make a retry pass. Inspect
exact backups, source/target/queued-work evidence and independently approve any
required repair. Code rollback does not undo event writes.

The measurable preparation milestone is complete: three frozen, independently
reviewed code candidates and a decision-ready plan. The next grounded milestone
is an approved, environment-preserving OFF-gate groundwork release; it has not
started. **No defensible live-pilot date exists yet**: zero current positives, the
unresolved checkpoint decision and separate pilot approval are real gates. No new
monitor or schedule was installed, and no further source search is implied.
