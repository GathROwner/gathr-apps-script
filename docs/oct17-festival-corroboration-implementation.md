# October 17 reviewed festival corroboration implementation

Implemented a narrow private acknowledgement interface for existing reviewed
festival members and an exact umbrella self-reference. It produces no links,
public provenance, new children, source ownership, or rewritten capture facts.
Deployment and the three private document creates remain coordinator-owned gates.

## Exact source boundary

Coordinator checkout baseline: `6bd300f75f32bacf19bafbb4f815eeba2e83f615`.
Implementation checkout: `C:/Users/craig/.codex/worktrees/d43e/gathr-apps-script`.
Own assembly: `functions/tmp/oct17-festival-corroboration/assembly/`.

The immutable serving baseline is
`C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/oct17-eight-group-release/festival-release/`,
commit `938320ddce85c331d5361f22b5e0ed77abc2f91d`, serving source hash
`24edc95235106a71b30b2712d06b504d9d3bd2e1`.
Every copied baseline `src/`, `scripts/` and `test/` file compared byte-identical
before edits (zero mismatches). Parent repository `functions/src` was not used as
the worker baseline and remains unchanged. The dependency junction points to
`a2af/gathr-apps-script/functions/node_modules` and is used read-only.

Reproducible patch:
`release-patches/oct17-festival-reviewed-corroboration.patch`, SHA256
`c8b65d6d2f95866d37c829e111748c378beac12755df1be1e4b74956b9c7ee22`.
`release-patches/oct17-festival-corroboration-manifest.json` pins all four exact
before/after file hashes. Only these serving-assembly files differ:

- `src/services/festivalReviewedCorroboration.ts` (new private validator/types).
- `src/services/festivalReviewedCorroboration.test.ts` (new semantic/identity controls).
- `src/services/festivalLinkWorker.ts` (private receipt reads, acknowledgement,
  canonical versions, and existing transaction/job inventory fencing).
- `scripts/festival-link-worker.test.mjs` (three new transaction/inventory controls).

Models, prompts, extractor instructions/policy, capture format, registry,
membership resolver, publication planner and public contracts remain byte-identical.

## Interface and protections

The worker reads optional `festival_link_corroborations/{captureKey}` bundles and
their bounded `festival_website_evidence/{id}` references. Absent bundles preserve
the existing strict resolver. Malformed or disabled bundles hold the source.
A present receipt that fails validation holds that item and cannot fall through
to ordinary publication. Receipt and website document existence/versions join the
existing worker input fingerprint and transaction readback fence, including
previously absent documents.

Each proposed receipt pins the exact edition, original caption/ordered-gallery
fingerprint, capture key/policy, original activity plus independent verifier,
unmodified worker evidence fingerprint, source publisher URL and revision,
manual review and umbrella data/version, official URL, raw HTTP and derived-body
SHA256, explicit edition date header and ordered literal activity clock rows,
and canonical child path/full data/nanosecond version. HTTP text derivation is
deterministic and identical to the coordinator's saved capture normalization;
a valid raw body paired with unrelated programme text is rejected.

The validator rejects conflicting printed festival name/year/date/weekday or
clock evidence, mismatched header/row offsets, unrelated official URL, invalid
`asOf`, missing/duplicate/different-slot candidates, recurrence/expired/disabled
children, manual holds, removed current/manual membership and sticky publication
suppression. Original negative model verification is checked before any receipt;
the supplemental website cannot reverse it. Corroboration requires an existing
manual link and its existing reviewed official occurrence proof, so venue/date
coincidence alone grants no membership. The two acknowledgement statuses are
`corroborated` and `self_reference`; they never enter the link proposal list.

Actual Harvest gallery venue text is only `Founders’`; its original resolved
venue ID is blank. The private receipt preserves both. Its optional explicit
`venueBinding` is restricted to the exact reviewed single-venue programme,
official full venue header and reviewed venue alias, exact canonical venue
data/version, source publisher URL equal to canonical `facebookUrl`, and canonical
website origin equal to the official programme origin. A nonempty conflicting
source venue ID is never overridden. No public alias or source ownership is added.

## Exact private proposal and actual worker effect

Coordinator fresh read-only inventory:
`C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/oct17-corroboration-preflight/live-inventory.json`,
captured **2026-10-17 19:17:12.937 UTC**, 1,149 read documents / 145 regular-run
sources. It includes the already-applied Anchor private capture recovery.
Official Harvest HTTP receipt was captured at 19:12:25.878 UTC, status200,
raw HTML SHA256
`60decfa484f13a08bc6594534f9387ec38873df695efebc2caca51a7f9e21079`;
deterministic derived text SHA256
`04e5358423a2cee98ceaf7612717f0bbac331ccaec6a811f7eb4eabe93ad0abb`.

Own private proposal: `functions/tmp/oct17-festival-corroboration/proposal.json`.
It proposes exactly three private creates (all absent in the captured inventory):

1. `festival_website_evidence/01q4d8wzK8R8VH0revQX`, the saved official Harvest body.
2. `festival_link_corroborations/4a65b7a3f61f50846336731613aa93d421c8b2e966680a847e986833d990b49d`,
   three receipts for source `1725796586222521`.
3. `festival_link_corroborations/977a549220e75ac05e8a023916cd0eedb3aeae68a1c230282e6a86584d7935d7`,
   one self-reference receipt for source `1566791205488411`.

The three acknowledged existing children, under
`venues/slug_foundersfoodhall/events/`, are:

| Existing child | ID | Preserved clock |
| --- | --- | --- |
| Vintage 4.0 | `qBimPRIGiW8A8EqMHxYj` | 18:00–20:00 |
| Photo Booth | `oct16harvest_photobooth_20261017_1500` | 15:00–19:00 |
| Live Pumpkin Carving Contest | `oct16harvest_pumpkincarving_20261017_1600` | 16:00–19:00 |

The sixth source item is precisely the already-existing Harvest umbrella
`venues/slug_foundersfoodhall/events/01q4d8wzK8R8VH0revQX`; it is recognized as a
self-reference, never as an unrelated nonmember or a missing child. Salty Sailors
already has independent reviewed source membership and receives no new receipt.

Saved actual-source dry run: three Harvest acknowledgements, one self-reference,
two Harvest held items, Anchor22 held items (16 edition conflicts, four source
occurrence conflicts, two missing evidence), Pumpkin0 item holds. All three
editions remain `no_public_delta`. **Public additions0, removals0, source
provenance mutations0, capture mutations0, model calls0, event writes0.**
Outdoor Play Zone retains the separately reviewed printed18:00 versus website19:00
finish conflict. Firepits retains its distinct-occurrence identity hold. Their
existing resolver status remains `edition_conflict`; the private proposal names
the underlying manual dispositions explicitly and does not override either.

Anchor ticket/homepage corroboration is retained as investigation evidence only.
This initial interface deliberately requires the umbrella's exact official URL;
it does not broaden acceptance to historical ticket hosts, recreate absent films,
or relink expired Anchor/Pumpkin children.

## Validation and reproducibility

Final own assembly TypeScript build passed. Final own focused festival/backend
and worker-script suite: **199/199**, 16 test files, no failures or skips;
`functions/tmp/oct17-festival-corroboration/focused-qa.{json,log}`.
Full compiled backend run before the final disabled-site/bundle guard additions:
**997/997**, 138 test files, no failures or skips, 107,829ms;
`functions/tmp/oct17-festival-corroboration/full-qa.{json,log}`. Coordinator will
perform the final exact-patch full pass in its clean release assembly before
release; the earlier full count is not mislabeled as that final independent pass.

Final actual-source integration playback: **14/14** against the supplied fresh
inventory. It verifies replay idempotence; order-independent edition/member
results (report presentation is compared sorted by edition ID); exact source,
gallery, website, canonical clock/version, duplicate candidate, venue and
suppression drift; missing child and later recreation with a different version
remaining held; and retention of a negative independent verifier. Network and
database transactions throw in saved playback. Original captured documents are
deep-compared unchanged. Three sanitized worker tests additionally exercise
new receipt and changed website transaction fences and malformed/disabled bundles.

Safe reproduction tools are committed under
`release-patches/oct17-festival-corroboration-tools/`; copy them beside an own
`assembly/` built from the exact serving baseline plus the patch. `capture-readonly.mjs`
requires explicit `GATHR_SERVICE_ACCOUNT_PATH`, checks `gathr-migrated`, exposes
only reads, and runs the worker with `dryRun:true`. `prepare-proposal.mjs` accepts
the inventory path as argument and reads existing saved HTTP receipts; it does
not fetch, call models, apply writes, reset jobs, or replay parser rows.
`run-validation.mjs`, `--full`, and `--playback` save exact logs/counts. Private
receipt bodies, inventories and production captures remain ignored and uncommitted.

## Lifetime and remaining gates

Receipts acknowledge one exact reviewed state. `source.revision` participates in
the evidence fingerprint; normal new-run snapshots or metadata updates to the
source, venue, canonical child, manual review or umbrella can invalidate them even
when the human-readable activity seems unchanged. There is no auto-renewal.
Recreated children with new versions require new exact review. This is not general
automatic website discovery or a promise that the next regular run will pass.

The saved inventory is a timestamped read-only snapshot. Website receipts prove
the saved response, not continuing live website equality; an apply/release
preflight must refresh or revalidate the exact approved body and all pinned live
documents. Root owns the clean assembly review, final tests, deployment gate,
backup/exact private-create approval and independent post-apply worker verification.
No deployment, live write, new paid model request, parser replay, job reset,
map/emulator/OTA work or shared serving-assembly edit was performed by this task.

## Coordinator independent acceptance, October 17

The isolated task completed and its committed report/tools were reconciled into
the coordinator atde48e8a. Root independently reviewed the implementation,
identified additional printed-date/edition/body-derivation/first-party venue
controls, and reviewed their final tests. Its clean release was cloned directly
from serving938320d and committed as
`15d5c71f012c00a8723df46d035abd4180a117c1`. All four changed files match the
manifest byte for byte; both serving environment files are byte-identical.

Final root build passed. Final root **199/199 focused,14/14 actual-source playback
and997/997 compiled backend** checks passed, no failures/skips. The full final
run took81,832ms. Counts/logs are under
`functions/artifacts/oct17-festival-corroboration-release/`. The exact one-function
codebase-qualified Firebase deployment dry run exited0, Dry run complete.

Root's exact three-private-create plan passed fresh live preflight against17
read-set documents, idle parsers, the fully completed367-row regular run and no
checkpoint. No source/canonical/review/venue pin drift was bypassed. Fresh Cloud
readback confirmed all three parser functions remain ACTIVE at common hash
0c06b198eacb9cf32171e0d68fbea89e889a93c3 with latest-traffic configuration and
unchanged environments/secrets. No runtime deployment or private apply occurred.

Approval/apply gates are consolidated with the newly identified Curling
programme hold in `docs/oct17-remaining-batch-release-and-repair-approval-plan.md`.
That plan contains one function release plus11 exact document operations, full
backup locations and independent serving/API/worker verification. This acceptance
does not imply the batch is live or that a new regular parse has been audited.
