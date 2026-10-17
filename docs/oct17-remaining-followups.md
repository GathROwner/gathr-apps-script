# October 17 remaining follow-ups

Craig authorized all listed follow-ups after the eight-group repair batch. This
work starts from coordinator commit `d19699d`, branch
`codex/shared-offer-origin-20261014`. The dirty main checkout and previous releases
are preserved. Source investigation is separate from confirmed data corrections.

## Completed: Junior Curling family score

Exact target:
`venues/1ehK5wrBKC460QSpqUMq/events/A3QGhNGCFKfVvEElf4WB`, Junior Curling
(10 and over), Thursdays, 15:30–16:30, Montague Curling Club.

Fresh October17 readback proves the parent still carried family-v4 score15. The
actual released family-v6 scorer returns70 (`child_focused_program`). Two retained
original source snapshots for `1732518712212204` explicitly invite parents to
register their children for Junior Curling. This is participation evidence, not
a beneficiary campaign or generic all-ages admission claim.

The guarded helper defaulted to dry run, checked all five exact source siblings,
two immutable source snapshots, the venue/feed and absence of active parser locks.
The atomic transaction changed only the five family scoring fields plus
`updatedAt` on this parent and feed version300→301 plus its `updatedAt`. Schedule,
recurrence, IDs, venue, source evidence and images were preserved; four siblings
were unchanged. No parser deployment or model call was needed.

Private evidence:

- `firebase/artifacts/oct17-remaining-followups/housekeeping-readback.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-reviewed-plan.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-prewrite-backup-2026-10-17T17-26-37-967Z.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-result-2026-10-17T17-26-37-967Z.json`
- `firebase/artifacts/oct17-remaining-followups/junior-family-api-verification.json`

Independent17:27:05 UTC verification proves exactly two document deltas, seven
untouched read-set documents, detail200, score70/family-v6 and one matching
upcoming occurrence in the complete997-entry/10-page active Preview feed. The
retained source image returned200. These counts are timestamped observations.

The source-sibling inspection also finds older v4 scores on four other programme
and registration records. They were inspected as controls and were not silently
added to the single-parent correction. Original programme commencement wording
must be reviewed independently before any schedule repair; no recurrence dates
were inferred during this family-score refresh.

## Completed: compact test maintenance

The historical October11 legacy-off request fixture predates the accepted
`weekly_custom` prompt wording. Keep that capture immutable. The test now verifies
the original full request hash, permits precisely the already-reviewed recurrence
rule insertion, checks the accepted serving full request hash, and deep-compares
the entire emitted request. It still forbids compact schemas/cache keys when the
switch is off; no assertion, prompt or model contract is relaxed.

- Original request SHA256:
  `b718d2f56c1cdc0df42ecba27d986265c2a45a39508050b3e76e45d41780958d`
- Accepted serving request SHA256:
  `05a5f0c655e2c3d8a15b49ad1ce7b08030db45150aa1918226674748412a92a1`
- **36/36 checks pass** against the exact released parser's compiled code.
- Log: `functions/artifacts/oct17-remaining-housekeeping-qa/compact-qa.log`.

Only the test script changes. No production deployment is required for this
maintenance. Initial QA runs lacked the private fixture path; the passing run
uses the existing assembly's fixture directory without modifying its source or
historical captures.

## Moth Lane clock: investigated, remains held

The original saved image explicitly says Wing Night starts at5pm, with qualifying
drinks after5pm. It is from a shared October14 first-party post. The newer
October16 first-party caption says tonight starting6 till9. The image remains
legible at its captured526×701 resolution; this is not a blur/OCR problem. A newer
share alone does not establish whether the photo's clock or the caption changed.

Public-source searches and direct first-party post access did not supply an
accessible correction for this exact occurrence. Unrelated operating hours and
other dates cannot settle it. No publisher was messaged.

Fresh readback confirms the historical parent
`venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW` remains absent and
`event_integrity_holds/oct17_mothlane_clock_1720610070064632` remains held. The
already-deployed clock guard and source-specific retirement policy remain the
correct disposition. Do not revive or redate this expired occurrence. A future
clear dated first-party post can establish a new occurrence separately.

## Venue and festival source investigations

Independent tasks own separate checkouts and no live mutation targets. Their
read-only Firestore scripts were independently reviewed and executed by the
coordinator because task sandbox restrictions blocked Node access. No broader
permissions were needed. The task waiting tool returned a host error; monitoring
continues through compact task status/turn readbacks.

- Venue task: `01a14ae0-8b42-7e02-abb5-a231c526c19d`, isolated checkout `2dba`.
- Festival task: `01a14ae1-2b51-7972-8088-cb31dd9de0f4`, isolated checkout `3cdd`.

Final investigation decisions and independent verification are recorded below
after the tasks finish. No new monitor or tomorrow-run claim is implied.
