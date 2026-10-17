# October 17 remaining batch: release and exact repairs

## Short approval summary

**October17 execution update:** Craig approved this batch. Curling applied and
was independently verified at feed303. The single linker release is ACTIVE at
`scheduledfestivallinker-00008-noh`/hash95fe0fddd0a1a438bb41c0312eaee2d13b06fef9,
with independent configuration/traffic/archive proof. All three private creates
applied exactly, but final worker acceptance found an offline timestamp rounding
error in three receipt fingerprints. The guard holds those proofs safely.
See `docs/oct17-remaining-batch-applied-and-verification.md` for actual results,
the acceptance exception and the separately prepared one-document correction.
The following sections retain the original reviewed plan as historical evidence.

One combined approval covers **one backend function release and eleven document
operations**, in the verified sequence below:

- Hold three Junior Curling programme listings currently generating October
  sessions before the advertised November commencement. Preserve their complete
  originals privately while the contradictory first-party start dates are resolved.
- Preserve both in-person signup listings and refresh their family metadata.
- Release the tested private festival corroboration guard, then save four exact
  reviewed proofs in three private documents. It recognizes three existing Harvest
  members and the overview itself. It adds no public links or activities.

Kay's joint stop and Coats distribution retain their existing location holds.
The next full-run audit plan is prepared; fresh run evidence is still required.

**Current state when prepared:** nothing in this new batch has been applied or
deployed. Feed302; serving linker hash24edc95235106a71b30b2712d06b504d9d3bd2e1.
The GathR event-integrity-repair skill requires exact approval for these newly
identified removals and private production creates. This combined plan supersedes
the earlier family-only draft and includes the Curling approval request already
presented. Do not apply both Curling helpers.

## 1. Exact Curling correction: eight operations

Full event prefix: `venues/1ehK5wrBKC460QSpqUMq/events/`.

| Action | Exact target | Meaning |
|---|---|---|
| Delete public parent | `A3QGhNGCFKfVvEElf4WB` | 10+ Thursdays, premature October22 occurrence |
| Delete public parent | `OIRtvQql4zXietvUNQ2L` | U9 Sundays, premature October18 occurrence |
| Delete public parent | `jW8Aw7dBxPi1Y9BBUEvR` | U9 Tuesdays, premature October20 occurrence |
| Create private hold | `event_integrity_holds/oct17_curling_programme_start_1732518712212204` | All three complete originals and conflict evidence |
| Update venue policy only | `venues/1ehK5wrBKC460QSpqUMq` | Existing parser's exact-ID hold contract for those three identities |
| Update family metadata only | `c8LLevWr1BIaAxFyHscb` | October17 signup remains13–15; v6 score70; expired occurrence stays expired |
| Update family metadata only | `xeMgDmynvM7nuYntOGtQ` | October25 signup remains15–17; v6 score70 |
| Increment feed version | `runtime_metadata/event_feed` | 302→303 |

Sources, exact timing conflict, full paths and proof:
`docs/oct17-curling-sibling-review.md`. No replacement November date is guessed.
The exact-ID hold is supported by the already deployed parser; it does not claim
a general programme-commencement extraction repair.

Guarded helper: `firebase/repair-oct17-curling-season-hold.mjs` (default dry).
Private exact plan: `firebase/artifacts/oct17-curling-siblings/season-hold-reviewed-plan.json`.
SHA256: `cdab71efa08edd76e657c192179f255b10b44f1db31c1ccc207fadb0f1481ea0`.
Its live dry run passed full hashes/update versions, all five cross-venue source
siblings, ten read-set documents, absent hold destination, feed302 and idle parsers.

After approval, `--apply` creates a complete timestamped backup and separate
result under `firebase/artifacts/oct17-curling-siblings/`, repeats all guards in
one transaction, and checks exact deltas. Run
`firebase/verify-oct17-curling-season-hold.mjs` independently: three details404,
two signup details200, complete active-feed/source scans, absent generated copies,
future signup once, expired signup absent, and every retained image200.

## 2. Narrow backend release

Release **only** `gathr-functions:scheduledFestivalLinker` in `gathr-migrated`,
northamerica-northeast1. Root clean release:
`functions/artifacts/oct17-festival-corroboration-release/assembly`, commit
`15d5c71`, descended directly from immutable serving commit
`938320ddce85c331d5361f22b5e0ed77abc2f91d`. The four changed files match the
independently reviewed manifest byte for byte. All other source, model, prompt,
extractor, capture, registry and resolver contracts are preserved, as are both
serving environment files.

Patch SHA256:
`c8b65d6d2f95866d37c829e111748c378beac12755df1be1e4b74956b9c7ee22`.
Coordinator implementation handoff: `de48e8a`, cherry-picked from isolated task
commit66f0044365848e61a1c45133347a5fe31c35110b after independent review.

Root's final exact release passed:

- TypeScript build.
- **199/199** focused checks; zero failures/skips.
- **14/14** actual145-source playback checks; zero failures/skips.
- **997/997** compiled backend checks; zero failures/skips;81,832ms.

Logs/counts are under `functions/artifacts/oct17-festival-corroboration-release/`.
The codebase-qualified deployment dry run is recorded in `firebase-dry-run.log`;
it exited0 with **Dry run complete**. The pre-existing outdated firebase-functions
warning remains; no dependency upgrade was added to this narrow release.

Both serving environment files were independently compared byte-identical.
Fresh Cloud readback also confirmed all three parsers ACTIVE at the accepted
common hash, allTrafficOnLatest=true, and unchanged environment/secret bindings.
The latest Curling live dry run still passed all eight operations at feed302.

Before actual deployment, recheck idle parsers and unchanged serving baseline.
Deploy the committed tested assembly with the exact narrow target, then verify
ACTIVE/latest100% traffic, expected source identity and preserved environment,
secrets, scheduler and runtime configuration. Independently reread all three
parser functions to prove they remain at their common accepted source hash
`0c06b198eacb9cf32171e0d68fbea89e889a93c3`. No parser deployment is included.

## 3. Exact private festival proof batch: three creates

1. `festival_website_evidence/01q4d8wzK8R8VH0revQX`.
2. `festival_link_corroborations/4a65b7a3f61f50846336731613aa93d421c8b2e966680a847e986833d990b49d`.
3. `festival_link_corroborations/977a549220e75ac05e8a023916cd0eedb3aeae68a1c230282e6a86584d7935d7`.

These save the reviewed first-party Harvest response and three existing-member
acknowledgements (Vintage4.0, Photo Booth, Live Pumpkin Carving Contest) plus one
exact umbrella self-reference. The original partial venue literal “Founders’”
and blank original venue ID remain unchanged; private proof pins the exact
business page, official website, canonical venue and manually reviewed programme.

Private plan: `firebase/artifacts/oct17-festival-corroboration/private-reviewed-plan.json`.
SHA256: `74b8002f0468282c227a8b0fb27834d1b3328eaaea6da2e7dec6c56745aadc47`.
Default-dry `firebase/repair-oct17-festival-private-corroboration.mjs` passed:
seventeen read-set documents, four receipts, idle parser, complete367-row regular
run, no checkpoint, full source/canonical/review/venue pins, absent destinations
and zero writes. It accepts only the three create paths and that exact plan hash.
It does not increment the feed; feed303 from the approved Curling batch is allowed.

After approval and verified release, use `--apply` with the exact plan/SHA. The
helper writes a full prewrite backup/result under
`firebase/artifacts/oct17-festival-corroboration/`, creates all three documents in
one guarded transaction, then verifies every intended delta and unchanged
read-set control. No public event, venue, source capture, source ownership or
media field is changed by this private batch.

Independent verifier: `firebase/verify-oct17-festival-private-corroboration.mjs`.
It requires an applied result, checks three exact creates/public preservation,
and runs the actual new worker read-only:145sources, zero gaps/unconfirmed/paid
calls/public writes, three acknowledgements, one self-reference, two Harvest
holds,22 Anchor holds, no new links. The original negative verifier, clock,
missing/expired child, manual suppression and duplicate protections remain.

## Limits, failure handling and tomorrow

The receipts are bound to the reviewed source and database versions. Ordinary
new snapshots or metadata changes may invalidate them; no automatic renewal or
general website discovery is claimed. Tomorrow's run is still a separate live
quality check. See `docs/oct18-next-full-run-audit-plan.md`.

Source/document/version/sibling/active-parser drift aborts the relevant step;
do not relax guards or rewrite evidence to get green counts. Record exact apply
and independent serving/API/worker evidence before reporting completion. No
media deletion, broad cleanup, replay, queue/job reset or new monitor is included.
