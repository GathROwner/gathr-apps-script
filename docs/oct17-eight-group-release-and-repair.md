# October 17 audit fixes: release and exact repair

## Result

Craig approved all eight recommendations in the originating chat. The scoped parser
and festival prevention releases are deployed and independently verified. The
confirmed data repair is applied, backed up and verified through Firestore, event
details and the complete current Preview feed. Source gaps remain held; no guessed
venue, clock, edition, programme child or recurrence horizon was published.

Coordinator: `codex/shared-offer-origin-20261014`, audit commit `a8dfbf5`.
Original audit: [October 17 production audit](luna-oct17-production-audit.md).
Private release evidence: `functions/artifacts/oct17-eight-group-release/`.

## Eight group outcomes

| Group | Implemented and verified | Remaining source boundary |
| --- | --- | --- |
| 1. Session collisions | Programme guards cover broad/exact/defensive merge paths; two missing skating classes restored; Eptek Group 2 description/provenance corrected, family100 preserved with refreshed evidence. Saved-source playback keeps26/26 classes and both correct Eptek slots. | Restored classes retain October17 and their original clocks; expired ones are absent from the active feed. |
| 2. Duplicate pairs | Exact comedy and NHL copies deleted; canonical first-party keepers retain descriptions, clocks, adult/doors evidence, media and engagement. Source IDs/URLs are unioned and precise venue retirement policies prevent recreation from the reviewed sources. | Venue documents remain independent. Unseen posts are not declared equivalent from venue/time alone. |
| 3. Categories | Royalty Artisan Market and Sterling Farmers Market are public Gatherings & Parties events; Y's Club Free Swim is Sports. Separate soup and other pool windows remain unchanged. | No broad food/menu policy change. |
| 4. Family wording | Family-v6 recognizes Family/Public Skate, child age colon/yr notation and friends-and-family invitations; three missed scores corrected to85/80/85. Beneficiary campaign names alone cannot prove child participation. | Junior Curling's pre-existing stored15 versus v5/v6 calculated70 is unchanged outside this batch. |
| 5. Location ownership | Dated venue-specific visits defeat umbrella/global area classification. Collection-only evidence holds before Stage4/formatting/venue lookup. Unsupported Coats café parent retired into private evidence. | Six CFCY visits and Stratford Sobeys lack existing canonical identities; their seven review records remain held. No city-review schema was changed into an invented venue scope. |
| 6. Recurrence ownership | Actual captured Nano one-off correction is accepted; alternative daily-depot leakage cannot return after formatting. My First Sports corrected to weekly Saturday,11:00–12:00 from October24. | No invented count/end date. Sobeys queue has no recurrence fields to rewrite; recovery requires the corrected one-off source and venue proof. |
| 7. Source clocks | The actual Moth Lane conflict holds before validation; historical October16 parent retired into private evidence and exact source policy. Doors and show starts remain distinct. | No redating or image/caption priority. This is a narrow advertised-start guard, not universal OCR conflict resolution. |
| 8. Festival evidence | Literal shared-caption context carries separate offsets, preserves row-specific title/clock, rejects competing context and retains independent verification. All nine legitimate excerpts revalidate. Failed future captures retain bounded private response diagnostics. Worker re-evaluates held jobs under a new validation generation while reusing source captures. | Anchor source1650364973767084 remains incomplete. Harvest's six outcomes lack sufficient edition evidence. No invented year, child or link; existing Anchor17/Pumpkin13/Harvest4 remain. |

## Source and serving continuity

Each release was assembled from its own freshly verified, generation-pinned serving
archive. Parser baseline hash `3136192244fb564f412541a6d76af37689d7ac0c`, resume
archive generation1792234585676757; worker baseline hash
`d06f641c15bc120ba6087d447e492ad7d3e34cfb`, generation1792191833470867.
No coordinator-only experiments were mixed into either runtime.

Isolated implementation tasks, all handed back idle and independently checked:

- Session identity: task `01a14a82-d0ae-76f0-8ab1-44f921bdcc04`, checkout `c0ca`,
  commits `0fe09bd` and payload follow-up `0c5739a`.
- Category/family: task `01a14a83-bb7c-7ca3-8305-1693492d53b2`, checkout `2f89`.
  Sandbox Git-index staging was blocked; coordinator committed the exact reviewed
  six files as `7882c52` after handback, without another user approval request.
- Location/recurrence/clocks: task `01a14a87-a42d-7261-8f6b-e7c42619ba9e`, checkout
  `0561`, commit `61f556f`.

`wait_threads` returned a host-tool error; monitoring used `read_thread` status and
final handoffs, then actual Git/code/test/artifact checks. No duplicate task was
created. No task independently deployed or mutated live data.

Exact parser assembly commit `fe2aa981034bf37354001ae1b3a7b56431efaec6`;
worker assembly `938320ddce85c331d5361f22b5e0ed77abc2f91d`. Reconstructable code
patches are committed under `release-patches/oct17-parser-quality.patch` and
`release-patches/oct17-festival-shared-caption.patch`; runtime credentials/env
and production evidence are excluded.

All functions are ACTIVE/latest100%, independently read back:

| Function | Revision | Firebase source hash |
| --- | --- | --- |
| processDataset | `processdataset-00501-lel` | `0c06b198eacb9cf32171e0d68fbea89e889a93c3` |
| processDatasetResume | `processdatasetresume-00465-tub` | same |
| processDatasetSelectedRows | `processdatasetselectedrows-00457-muz` | same |
| scheduledFestivalLinker | `scheduledfestivallinker-00007-nov` | `24edc95235106a71b30b2712d06b504d9d3bd2e1` |

Environment variables, secret bindings, memory, CPU, timeout, instance settings,
concurrency, ingress, service accounts and triggers match fresh predeploy readbacks.
No prompt, model, effort, cache-layout, compact-schema, queue, traffic-split or
date-only switch experiment was performed. No mobile release or map interaction.

Both codebase-qualified dry runs passed. Actual commands used the same narrow
targets and project `gathr-migrated`:

```powershell
firebase deploy --only "functions:gathr-functions:scheduledFestivalLinker" --project gathr-migrated
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
```

The worker's first CLI discovery attempt exceeded the local10-second limit.
Retry used `FUNCTIONS_DISCOVERY_TIMEOUT=120` for CLI discovery only; serving
timeouts/configuration were unchanged. The existing outdated firebase-functions
warning remains; no dependency upgrade was mixed into the fixes.

## Verification and known historical fixture

- Final parser build,24 new focused checks, **972/972 compiled backend tests**.
- Final worker build,75 focused checks, **950/950 compiled backend tests**.
- Actual saved-source parser playback:26/26 skating sessions; correct Eptek pairing;
  six specific CFCY venues held; original Nano correction accepted; weekly Saturday
  retained without horizon; collection-parent and material-clock conflicts held.
- Category/family playback:five targets,nine market/pool controls,61 surviving
  reviewed family controls unchanged relative to accepted-v5 calculation.
- Compact script:35/36 on both untouched serving baseline and final parser. The
  one frozen October11 legacy-off fixture predates accepted `weekly_custom` prompt
  wording. Actual baseline/current request hashes both
  `05a5f0c655e2c3d8a15b49ad1ce7b08030db45150aa1918226674748412a92a1`;
  old fixture `b718d2f56c1cdc0df42ecba27d986265c2a45a39508050b3e76e45d41780958d`.
  No assertion, prompt or frozen fixture was weakened or changed. This pre-existing
  fixture failure is disclosed separately from the passing full compiled suites.

## Applied repair: exact21 operations

Reviewed plan:
`firebase/artifacts/oct17-eight-group/reviewed-plan-2026-10-17T16-15-54-096Z.json`.
SHA256 `cf5fef8632a58f943d7b78cd38a0827a3733a58f2d16f33d4077520b2587d383`.
Four creates (two events/two private holds),13 updates (eight events/four venue
policy arrays/feed metadata),four event-only deletes. No storage/media deletion.

| Action | Exact public event path |
| --- | --- |
| Restore CanSkate12:15–13:00 | `venues/LglliE42SPFssmoU01su/events/oct17_restore_1733964295400114_fe14ea52014e1ad1` |
| Restore Star1-2 13:15–14:15 | `venues/LglliE42SPFssmoU01su/events/oct17_restore_1733964295400114_df3cb6b28175abf5` |
| Correct Group2 description/provenance and refresh family evidence | `venues/slug_eptek.centre/events/nOz8TgJISaSmdkMUVNzY` |
| Retain comedy keeper; source union | `venues/V7zQ5unfTY1GtNKUvR7c/events/bDdUKS57VSPMil4oKqqp` |
| Delete comedy copy | `venues/DZ4nQZQnOKCkTotuKYVv/events/pXeHp206JhwAKXZfgoE3` |
| Retain named NHL keeper; source union | `venues/slug_foundersfoodhall/events/sf9FKqC2RWLXStUj7Lwn` |
| Delete generic NHL copy | `venues/slug_foundersfoodhall/events/Nqq3FWCRRCBudDP1FYYh` |
| Category/flags/family85 | `venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ` |
| Market category/flags | `venues/qUg3AMPeXX9URM0UrXEA/events/4ZxbxygV32qUmnT7Pbt7` |
| Sports category | `venues/slug_bellaliantcentre/events/jjOj9C8U4xuOe87fdmGV` |
| Family85 | `venues/LglliE42SPFssmoU01su/events/MaC5HZv3CVQR5M6koJCO` |
| Family80 and weekly Saturday | `venues/slug_cornwallciviccentre/events/NvtBo0lQs208nlxrHSYH` |
| Retire unsupported Coats café parent | `venues/RJ9iYyEWcYUr91hcGSeL/events/2DjVdRAtNrcyKPPgjjQU` |
| Retire historical Wing Night conflict | `venues/slug_mothlanebrewing/events/dqtPfabTkUTz0dn2pHVW` |

Policy-only updates: `venues/DZ4nQZQnOKCkTotuKYVv`,
`venues/slug_foundersfoodhall`, `venues/RJ9iYyEWcYUr91hcGSeL`,
`venues/slug_mothlanebrewing`. Private create-only holds:
`event_integrity_holds/oct17_coats_distribution_1118550040924946` and
`event_integrity_holds/oct17_mothlane_clock_1720610070064632`.
`runtime_metadata/event_feed` advanced **299→300** once.

Restores use a field allowlist and initialize app participation state without
copying another event's users. Facebook likes3/shares2/reactions1 come directly
from this exact source's original XLSX, independently verified; they are not
borrowed app engagement. Eptek's source-supported score100 is retained with v6
hash/evidence; its clocks, eight Sundays and December6 horizon remain unchanged.

The default-dry helper verifies a pinned plan digest, hardcoded target/action
allowlist, full read-set hashes,88 exact source siblings,12 immutable source
snapshots, completed run/marker/final batch and absence of direct/queried checkpoints.
It rereads these atomically before writes. Full backup preceded the transaction:

- `firebase/artifacts/oct17-eight-group/prewrite-backup-2026-10-17T16-24-31-152Z.json`
- `firebase/artifacts/oct17-eight-group/applied-2026-10-17T16-24-31-152Z.json`

Independent16:31:41 UTC readback confirms **all21 exact deltas,101 untouched
read-set documents unchanged,86 exact final source siblings,all four actual
retirement/hold guards effective,no active parser lock and no matching checkpoint**.
API verification:10 surviving details200,four deleted404; complete Preview
`dateOnlyActivities=v1` feed **1,014 entries/11 pages**, all retired parents and
generated copies absent; **33/33 managed media URLs200**. CanSkate and Sterling
are correctly absent from that afternoon active feed after their printed finishes.
No dates were shifted to make them appear current.

## Remaining evidence and next-run limit

The normal festival worker re-evaluated the repaired inventory and reached held
generation10 with **zero paid sources and zero public event writes/additions**.
It no longer reports the nine excerpts as cross-card failures. Anchor still has
the one incomplete capture; Harvest has six `edition_conflict` outcomes. Original
cached errors were not repeatedly retried and missing years were not invented.

The six CFCY review records and Sobeys queue remain unchanged and private, as
required by their unresolved canonical identities. A fresh broad name/alias scan
also finds no No Frills/Haunted Mansion/Butcher Shop/Kay's/Browns/Sobeys identity;
the Home Hardware in Souris cannot stand in for HBM Summerside. New venue creation
or first-party festival-source recovery needs its own verified evidence; it is
not hidden inside a green publication count.

No new real model calls, source-row replays, broad cleanup or device-adoption
claim was made. The next regular full run has not yet executed these releases;
the present proof is compiled tests, original-source playback, fresh serving
readback and the applied/API-verified exact repair. No new monitor was created.
