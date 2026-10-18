# Automatic existing-venue recovery — October 18 local preparation

Status: **local implementation built, committed and validated; no production release or pilot**.
Both production automatic gates remain OFF. Existing serving releases are the
separate immutable resolver baselines, not the parser checkout's older resolver.
No live database write, replay, paid call, provider lookup, email, token action,
permission, environment, index, schedule, traffic or venue creation is authorized
or performed by this preparation.

Evidence root:
`functions/artifacts/automatic-existing-recovery-oct18/`.

## Defect and intended change

The serving resolver's automatic branch can set `resolved_existing` and a venue
ID without invoking event recovery. A later manual request can return
`alreadyApplied` from that queue status. The broad manual finalizer also enriches
venue/alias metadata, appends to Drive, queues whole rows and resumes shared-event
promotion. It is unsuitable as an automatic item-recovery primitive.

Two isolated candidates preserve their individual serving baselines:

| Candidate | Branch | Serving parent commit |
| --- | --- | --- |
| `scheduled-candidate` | `codex/automatic-existing-recovery-oct18-scheduled` | `cc64c1efb063acdd8cdb505481bc69a2bd3ee071` |
| `manual-candidate` | `codex/automatic-existing-recovery-oct18-manual` | `f83ba410ef422ca20e96afe33af071093c4aef54` |

Frozen candidate commits: scheduled
`78a5f7ea5e20469c3d3ad183a8b20de9966b90c8`; manual
`1b8176ad0b095250546f5d613885bc9cf9330594`. Each is clean and changes nine
source/test files, 886 insertions and 12 deletions, on its own serving parent.

Fresh readback at preparation start confirmed scheduled revision
`scheduledunknownvenueresolver-00243-rek`, source hash
`57eee386d0270dda44c00ca167be4c1eda06c3ea`; manual revision
`processunrecognizedvenues-00242-siv`, hash
`eff38f8bef686f069e94daf7837158a065ac8bf5`. These are baseline observations,
not a claim that either new candidate is serving. All 619 frozen source/compiled
files for each previous candidate were independently checked unchanged.

## Narrow recovery contract

- Every automatic existing matcher (Places, exact, alias, fuzzy, configured or
  Apify-derived) requires independent captured attendee proof and matching
  geography. A high heuristic search score is not a probability or source proof.
- The pilot needs both the existing resolution flag and an explicit valid
  `UNKNOWN_VENUE_AUTO_EXISTING_ALLOWLIST`, default empty, maximum five IDs. No
  environment value is changed here. Ordinary non-cohort lookups cannot write a
  queue-only automatic terminal resolution.
- The existing authenticated `docId` endpoint is reused. An allowlisted request
  uses saved suggestions and bounded source/catalog reads. It does not invoke
  Places, Apify, URL hydration, alias updates, Drive, shared-event promotion,
  email or a selected-row task. Unqualified records remain held.
- V1 accepts complete single-item regular captures, a uniquely named attendee
  venue, one explicit `Date:` line including its year, one explicit `Time:` line,
  explicit start/end flags, a valid future same-day nonrecurring occurrence,
  supported publication fields and managed post media. Original gallery order is
  preserved independently of the chosen primary image. OCR-derived clocks,
  generic rooms, missing source IDs, multi-item/multiday/recurring/private/shared
  cases, collection partners and separate spatial reviews remain outside this
  pilot. Indented, blank-line and BOM-prefixed OCR markers also fail closed.
- Missing-event creation additionally requires captured current v7 family-score
  fields. Older scoring captures may support reuse of a correct keeper, never a
  fresh event with a retired policy. The global date-only switch stays unchanged.

## State, fencing and postconditions

Root queue status remains `candidate_found` through `running`,
`written_pending_verification` and `retryable_failed`. A dedicated operation at
`unknown_venue_recovery_operations/<queueId>` preserves the exact plan/proof,
prewrite queue backup, semantic operation identity, target paths, attempt count,
lease token, created paths and feed-version backup. The queue's source identity
is insensitive to equivalent sample/suggestion order and duplicate samples.

Transactions re-read queue, canonical venue identity, complete bounded catalog,
all matching source captures and cross-venue occurrence inventory. Any source,
candidate, manual decision, venue or conflicting sibling drift holds the action.
An existing correct occurrence is reused without an event/venue/feed write.
A missing qualified item receives one deterministic event ID and an atomic feed
increment; the source row is never rerun. Similar or protected existing records
are never overwritten to satisfy a match.

A five-minute recovery lease fences stale workers. The broader manual finalizer
shares admission only for the explicit pilot cohort, preventing it from racing
the automatic operation. Its 15-minute admission outlives its 180-second HTTP
timeout; outside-cohort manual behavior is unchanged. No lease expiry invokes
the manual finalizer or clears a parser lock/checkpoint.

The idle check projects all lock statuses (bounded at 1,000) and treats every
unknown/nonterminal status, including `paused`, as active. The immutable parser
source defines `CHECKPOINTS='checkpoints'`; the pre-existing normal-auth release
helper queried `processing_checkpoints`. The new adapter checks **both**. Neither
collection is cleared or migrated by this work.

Fresh normal-sign-in readback at23:54UTC found **three historical checkpoints**
in `checkpoints`, last updated February12, February17 and March9. Their row
positions are107,175 and142; none has a runId or a `processed_datasets` marker.
The corresponding lock statuses are completed, failed and missing, respectively.
The complete bounded lock projection found zero nonterminal locks; the alternate
`processing_checkpoints` collection is empty. This is not evidence that today's
parse is active. It does qualify earlier broad “no checkpoints” statements made
using the alternate-collection helper. The new conservative adapter would hold a
pilot until these historical leftovers receive separate exact review. No resume,
cleanup, checkpoint deletion or automatic stale-record exemption is included.
Exact minimal readback: `checkpoint-readonly.json` and
`checkpoint-status-readonly.json` in the evidence root.

Completion requires exact stored source/point/time/media proof, event-detail
responses and the complete active Preview-compatible API feed with every target
present exactly once and no generated duplicates. Fresh transaction readback
must still match after API verification. Only then does root status become
`resolved_existing`. Verified retries recheck postconditions. Transient failure
retains target receipts, with at most three attempts; ambiguity or exhausted
retries becomes an explicit hold. Source drift after a committed write retains
the event and backup for exact review; it never silently deletes or resolves it.

Legacy queue-only `resolved_existing` records are not scanned or reopened. A
separately approved, source-proven, allowlisted record requires explicit
`recoveryOnly:true`, the same canonical venue and no manual-finalization record.

## Verification and coverage limits

Final build/test receipts, immutable payload hashes and candidate commits are
recorded in `completion.json`. Offline tests block remote network, credential-file
reads and business subprocesses, and remove secrets from the child environment.
Their in-memory transaction double proves adapter behavior and rollback logic;
it does **not** establish real Firestore IAM, index availability, production
transaction contention or live API latency. Both frozen original baselines remain
unchanged. No parser, prompt/model/cache/compact source or release is altered.

Both builds passed. **98 focused checks and all487 compiled backend tests across
61 files pass for each candidate**, zero failures/skips. The exact634 source,
compiled and package/config files are hashed before and after each final run;
they were unchanged throughout and match the final candidate payload. An earlier
470-test run and a483-test run preceded final review changes; the final487-test
receipts supersede them. CRLF serving-source bytes were preserved; Git whitespace
checks passed with `cr-at-eol` enabled for that check.

Independent normal-auth readback after preparation confirms all five functions
remain ACTIVE/latest100% at their previous revisions/source hashes, with exact
configuration/environment/secret/IAM hashes unchanged. The three parsers retain
common hash `0fdf11b55618540c09d43b53ea1cae9463d19b63`; both resolver automatic
flags remain false. Evidence: `serving-after-preparation.json`. This readback made
metadata/status reads only; the no-write shadow itself made zero live calls.

The retained-response shadow is deliberately separate from synthetic positives:

- Four real resolver cases hold: Linkletter's multi-activity/OCR context, Village
  Pottery's incomplete source binding, Tignish's OCR-dependent source and the
  wrong-UPEI Memorial Hall concert case. Zero links/writes/paid calls are made.
- Six CFCY area-review cases are excluded from the resolver cohort. Do not shrink
  their original multi-event capture into a synthetic positive. Five previously
  resolved reviews/events remain a separate completed operation.
- Independently ground-truthed historical eligible positives: **zero so far**.
  The broader cohort owner is still selecting/validating originals. A previous
  operator resolution alone is not independent attendee proof. The UPEI tipi
  candidate remains unqualified until original first-party venue evidence exists.
- The current 15-review inventory's reported zero proven eligible records is
  separate from the four-case playback and separate from flags being OFF. No
  eligibility yield, recall, model improvement, cost saving or general precision
  rate is established by a zero-positive cohort.

`scheduled-shadow.json` and `manual-shadow.json` report exact input hashes,
per-record holds, excluded cases and measured local playback time. Paid token
usage, provider calls, live database reads/writes and public API calls are zero.
These timings are local saved-response playback, not paid-call or live recovery
latency.

## Recommendation and next concrete steps

Keep both gates OFF. Local source preparation can be reviewed independently of
deployment, but the current evidence does **not** justify enabling a pilot yet.

1. Finish the separately owned bounded historical cohort selection and verify
   original captions/ordered galleries, attendee venue and occurrence fingerprints
   independently of prior human outcomes. Hold incomplete or expired records.
   Separately adjudicate the three historical checkpoints before requesting a
   live pilot; do not delete them or exempt them solely because they are old.
2. Replay genuine eligible positives through this no-write harness. Require all
   eligible reviewed targets to be recovered/reused exactly once, no incorrect
   venue/clock/source/media links, all ambiguity/manual negatives held, and no
   provider/model/whole-row calls. Report the actual denominator and hold reasons.
3. Review the exact candidate diff and complete evidence, then obtain separate
   release/pilot authorization. Re-read each function's serving archive, gates,
   environment/secrets/IAM and actual idle state. Follow the narrow deploy skill;
   preserve each serving baseline and leave the scheduled gate OFF.
4. If independently qualified and approved, allowlist **one** manual `docId` pilot.
   Verify its full backup, operation receipt, exact event/feed delta and API
   postconditions. Do not broaden the cohort based solely on unit tests.
5. Disable future invocations if a pilot fails. Gate-off does not roll back public
   writes or necessarily interrupt an already admitted worker. Inspect retained
   target paths and use an exact reviewed repair if needed; never broad cleanup.

There is no new monitor or schedule. Deployment, actual live read/write latency,
paid/provider comparison and the historical positive benchmark remain outside
the completed local preparation.
