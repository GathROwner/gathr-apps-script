# Automatic festival linking correction — October 16

## Status

**Approved, deployed and published October16 at11:30–11:31UTC.** The actual
worker generated13 links from an empty reviewed schedule; repeat evaluation
adds zero. The existing13 child records, both venues and media were preserved.
Craig correctly challenged the earlier completion claim: extraction success and
an Anchor result with zero additions had not proved a new automatic schedule.

## Actual old-row reproduction and corrections

The unchanged October14 source1539985468169427, original ordered gallery and
current13 canonical activities were replayed through the actual linking code.
The initial matcher produced zero links from41 bilingual entries. The model's
caption schedule sentence lacked the printed year/case used by the matcher,
and a year-first poster title did not contain the required word "Programme".

The candidate now:

- Binds the literal current-edition poster heading to a validated row on the
  same image. It does not borrow another image, biography, year or heading.
- Registers an exact reviewed programme source/fingerprint independently of
  manual child links. Publisher/query-string and gallery drift fail closed.
- Accepts only explicitly saved, measured larger Facebook variants after the
  prior unreadable-thumbnail failure. Original gallery identity/cache keys
  remain unchanged; there is no automatic download/retry loop or larger-image
  default. Asset/path, crop, dimensions, order and hashes are guarded.
- Reports independently unconfirmed rows separately from missing source
  captures. Incomplete originals still block publication.
- Treats a generic ticket homepage as navigation; specific ticket conflicts
  still hold. Exact interior corridor/lobby/foyer wording can bind its known
  parent venue; bare rooms, roads and fuzzy nearby names cannot.
- Stops an unrelated multi-location art-workshop post from becoming an evidence
  gap for every festival. Explicit edition and existing venue/date discovery
  paths remain intact.
- Preserves machine-owned links during source refresh using their private
  ownership proofs. Removed/suppressed links stay removed, expired children
  prune, occurrence drift holds. Existing area writes use update-time guards
  so a racing worker/human change cannot be overwritten silently.

All Stage1–5 prompts, models, allocations, cache/accounting contracts and
queues remain unchanged. Publisher/worker releases must each use their own
fresh immutable serving baseline; no whole-codebase deployment.

## Evidence

`functions/artifacts/pumpkin-overview-oct16/`:

- `automatic-matcher-before.json`: zero eligible links before correction.
- `actual-worker-offline.json`: actual worker, real saved source/canonical data,
  explicitly synthetic completion envelope and proposed local edition.
  Zero manually seeded child links;13 generated links; repeat zero additions;
  later library arrival adds only that child; refresh retains all13.
- `actual-worker-readonly.json`: actual worker reads the real completed
  October14 dataset, lock/marker/batch/checkpoint,151 unique source posts,
  and fresh canonical records. Only the proposed edition/review and validated
  saved capture are overlaid locally. It proposes all13 additions, with zero
  source gaps, zero paid calls and zero live writes. This is a dry run, not a
  production publication or a reparse into child records.
- The French ghostwalk quote remains unconfirmed and unlinked; there is no
  corresponding retained canonical child in the13-target inventory.
- `parade-reverified-capture.json` and `parade-verifier-raw.json`: literal
  "between9a.m.and12p.m." repaired the empty proposed start to09:00, followed
  by one actual independent Luna-high verification against both original
  higher-resolution images. Accepted;6,815 input,1,094 output tokens (970
  reasoning),18,235ms. Historical responses remain unchanged and are not
  recharged. The existing correct live parade record was not modified.
- `serving-before.json`: seven target functions ACTIVE/100% latest, configuration
  fingerprints and immutable source archive generations. ZIPs under
  `serving-archives/` are private build inputs, never committed.
- `reviewed-bootstrap-latest.json`: exact proposed empty-schedule bootstrap,
  full backup, current references and expected13 machine-generated additions.

Coordinator build and **955 compiled tests +39 script tests passed**. Release
assemblies still require their own build/tests and qualified dry runs before
the final approval batch is presented.

## Reviewed live batch (subsequently applied; results below)

Create the reviewed edition `events/local_pumpkin_2026`, private review
`city_level_event_reviews/local_pumpkin_review_2026`, and exact validated source
capture `festival_link_captures/c6a3729f47a2ea158ab01830a3bcccf42db58313e54e556894aa7dd6b3f4086f`.
The historical opaque edition ID is retained so the original model capture is
not falsely relabeled as another edition. Public title is **Summerside Pumpkin
Festival2026**, October15–31; clocks remain unspecified using the accepted
date-range discovery contract. Two existing venue points have **empty child
lists** at bootstrap. No new venue, media, child event or guessed hours.

Advance `runtime_metadata/event_feed`268→269 at bootstrap, then run the
automatic worker against completed dataset11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC.
Its guarded publication should add the13 exact existing IDs listed in the
saved plan and advance269→270. Private ownership/job records are under
`festival_link_publications/local_pumpkin_2026` and
`festival_link_jobs/3c87d2d27c14493f962efbc662e80fc718c56c2759c59c04c2722117071c5c1b`.
Any target/source/configuration/version drift aborts for review. Existing13
activities and media remain untouched; this is automatic linking, not manual
schedule population.

Exact backup and plan:

- `functions/artifacts/pumpkin-overview-oct16/bootstrap-backup-2026-10-16T09-53-01-759Z.json`
- `functions/artifacts/pumpkin-overview-oct16/bootstrap-plan-2026-10-16T09-53-01-759Z.json`

The event-integrity repair skill required exact live-target approval. Craig's
reply, **I approve**, authorized this combined plan; the approval is recorded in
`functions/artifacts/pumpkin-overview-oct16/approval-oct16.json`.

## Final combined approval plan

This supersedes the preliminary 09:53 plan above. Frozen data plan:
`functions/artifacts/pumpkin-overview-oct16/bootstrap-plan-2026-10-16T10-17-46-925Z.json`.
SHA256 of canonical plan JSON:
`28b596a141e11e621b02125c5e186fdfc6b928f63167c6f694156865958a6bf9`.
Full backup: matching `bootstrap-backup-2026-10-16T10-17-46-925Z.json`.
Relevant inventory guards cover both existing venue inventories and Pumpkin
titles in the edition window; unrelated venues cannot invalidate this bootstrap.
The actual worker still transaction-fences the complete canonical query against
new ambiguity or changed documents.

One approval covers these sequential actions:

1. Release refresh preservation to the three parsers, review finalizer and two
   shared publishers, each from its own immutable serving archive. Release the
   separate automatic linker. No Stage 1–5 request, model, effort, allocation,
   queue or SDK change. Live parser locks must be terminal before release.
2. Create exactly the public edition, private review and validated capture
   paths listed above, with **zero** child links; advance feed268→269.
3. Run the actual released worker, targeting only this edition and the completed
   October14 dataset. It must propose exactly the13 IDs below before publishing.
   Its atomic public delta is the edition's area links and feed269→270; its
   private writes are the named ownership/job records. No existing child,
   venue, source snapshot or media is changed.
4. Independently verify ACTIVE/latest/configuration readback for all7 functions,
   all protected document versions, source/private-data separation, repeat zero
   additions, festival detail and all13 child details, plus the complete capable
   active feed. No client release or map/emulator interaction is needed.

| Release checkout | Exact candidate | Gates |
| --- | --- | --- |
| festival-auto-worker | 99ced66 (full SHA in assembly-worker.json) | Build;946 compiled tests;41 script checks; qualified worker dry run |
| festival-refresh-parser | bbea8ac9df5666d2e6c929a7c72afbcdd368a2aa | Build;856 compiled tests; qualified three-parser dry run |
| festival-refresh-finalizer | 98c5eabdc9c475e1196fb30c53e40d266a3bf105 | Build;328 compiled tests; qualified finalizer dry run |
| festival-refresh-shared | d344468320bbb1534726e1e4602f691e58a428f1 | Build;375 compiled tests; qualified two-publisher dry run |

The shared suite initially had two expired September fixtures. Their clocks
are now fixed to August23; no runtime behavior was changed for those failures.
The worker also removes redundant per-document child pins:441 current
candidates exceeded the old400-reference fence despite the full transactional
query already fencing them. A450-unrelated-event regression now passes while
the new-ambiguity/changed-inventory abort regression remains intact.

Historical replay is deliberately targeted with `editionId`; the scheduler's
default still examines all reviewed editions. Targeting cannot bypass the full
dataset, reviewed-source, active-parser or publication gates. Fresh playback
of the **exact serialized bootstrap payload**, not just a synthetic draft,
reads151 real source snapshots and proposes13 links, zero gaps and no paid
calls/writes. Unconfirmed past French ghostwalk and unmatched programme entries
are not invented as new children. This is13 existing activity links, not a claim
that all41 bilingual entries are distinct publishable events.

Exact existing child IDs (first12 at Centre Belle-Alliance, last at the library):

```text
oct14_repair_festival_20261016_1
oct14_repair_festival_20261017_2
oct14_repair_festival_20261019_3
oct14_repair_festival_20261020_4
oct14_repair_festival_20261021_5
oct14_repair_festival_20261024_6
oct14_repair_festival_20261026_7
oct14_repair_festival_20261027_8
oct14_repair_festival_20261028_9
oct14_repair_festival_20261029_10
oct14_repair_festival_20261030_11
oct14_repair_festival_20261030_12
oct14_repair_festival_20261031_13
```

Guarded helper `firebase/apply-pumpkin-automatic-links-oct16.mjs` is default dry
and has passed fresh preflight. It requires the exact frozen plan/hash, clean
committed worker checkout, fresh independent serving readback and unchanged
target/source/related versions; a prewrite backup precedes an atomic bootstrap.
After approval, run from this coordinator with the existing main credential
path in `ANCHOR_CREDENTIAL_PATH`:

```text
node firebase/apply-pumpkin-automatic-links-oct16.mjs --apply --plan=functions/artifacts/pumpkin-overview-oct16/bootstrap-plan-2026-10-16T10-17-46-925Z.json
```

Any drift, unexpected addition, active parser or verification failure stops the
batch. Do not broaden targets or regenerate an approved plan silently. Existing
SDK-version warnings were left unchanged; upgrading dependencies is deferred.

## Completed execution and independent verification

All four qualified deployment commands completed successfully in project
`gathr-migrated`, codebase `gathr-functions`, from the exact candidate checkouts
listed above. The parser was idle at preflight and final readback. All7 functions
are ACTIVE,100% latest traffic; user environment, secret bindings and runtime
configuration are preserved. The separate midnight API release is untouched.

| Function | Latest revision | Serving source hash |
| --- | --- | --- |
| processDataset | processdataset-00493-pog | ccae940c2d876badd058c446071d54a5cf0cb12d |
| processDatasetResume | processdatasetresume-00457-vaz | ccae940c2d876badd058c446071d54a5cf0cb12d |
| processDatasetSelectedRows | processdatasetselectedrows-00449-kit | ccae940c2d876badd058c446071d54a5cf0cb12d |
| finalizeCityLevelEventReviewTrigger | finalizecityleveleventreviewtrigger-00077-bof | f028e8ea9a912dc8002f8f61870e787af725e36c |
| processSharedEventPublicCandidates | processsharedeventpubliccandidates-00046-fax | 36074fe277460d63a75e11d8eb1b4ed217087468 |
| scheduledSharedEventPublicCandidateProcessor | scheduledsharedeventpubliccandidateprocessor-00048-lin | 44184fae3e30aa764191e01dfe20e9cdd58358b3 |
| scheduledFestivalLinker | scheduledfestivallinker-00004-wul | f84328f133a8410265e2011bde5cbb35c4a474f0 |

The first apply attempt stopped **before Firestore mutation** because Cloud Run
reordered the worker's literal environment entries. Readback of immutable old
revision00003 matched the original pinned runtime hash exactly. Full old/new
runtime comparison, normalizing only environment-array order, proved every
value/secret/setting identical. The verifier now permits only that proven case,
rejecting duplicate keys, order-dependent expansion, or any changed setting.
The original baseline and approved data plan were not regenerated or relaxed.
Evidence: `worker-runtime-comparison.json`, `serving-after.json`.

The approved helper then completed against the **unchanged exact frozen plan**:

- Bootstrap created the3 approved documents with zero child links, then the
  released worker added exactly13 existing IDs to the public edition and saved
  private ownership proofs/job state. Feed268→269→270.
- Worker read151 unique historical sources, made one public edition update,
  zero new model calls and zero child/venue/media changes. Repeat dry evaluation
  returns completed with zero additions.18 protected documents retain their
  exact versions/content. Created review/capture payloads and all other public
  root fields match the approved plan.
- Festival detail and all13 child detail endpoints returned200. The complete
  capable active-feed pagination returned1000 records across11 requests;
  the root and each of13 children occur exactly once, with all13 area links.
- Separate Firestore/API readback at11:31:58UTC confirms manual child links0,
  machine ownership13, public links13, feed270 and no active parser locks.

Exact local evidence under `functions/artifacts/pumpkin-overview-oct16/`:

- `prewrite-backup-2026-10-16T11-30-48-870Z.json`
- `post-bootstrap-proposal-2026-10-16T11-30-48-870Z.json`
- `worker-applied-2026-10-16T11-30-48-870Z.json`
- `applied-2026-10-16T11-30-48-870Z.json`
- `api-verified-2026-10-16T11-30-48-870Z.json`
- `independent-post-publication-readback.json`
- Four `*-release-deploy.txt` logs and `serving-after.json`.

Decision: retain automatic add-only linking for reviewed editions and all source,
completeness, ambiguity, manual-removal and parser/worker fencing safeguards.
This does not authorize invented missing programme occurrences, new venue points
or unreviewed festival discovery. Existing iOS festival flow needs no new OTA;
search **Summerside Pumpkin Festival2026** and open its Event Info schedule.
API/feed availability is verified; adoption on Craig's phone is not yet observed.
