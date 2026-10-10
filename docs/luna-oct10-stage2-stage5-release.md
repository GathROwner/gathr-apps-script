# October 10 Stage 2 and Stage 5 pilots

Craig authorized proceeding after the regular 100% Stage 1/3 audit. The run is
complete; release preflight found no active processing lock. Preserve all
accepted parser changes in `codex/luna-parser-live-merge`.

## Configuration

| Stage | Selected | Unselected |
|---|---|---|
| 1 | 100% eligible caption/image Luna high | Existing unavailable-source holds |
| 2 | 50% eligible source identities: Luna none, high review of negatives | Mini |
| 3 | 100% eligible caption/image Luna high | Existing unavailable-source behavior; no legacy fallback |
| 4 | Nano low | Nano low |
| 5 | 50% eligible source identities: Luna none | Nano medium |

Stage 2/5 use separate dataset/source-post hashes. Retries and row order cannot
change model allocation. Selection means a deterministic approximate share,
not an exact half of a small cohort. Selected Stage 5 uses an explicit per-call
effort override so the existing Nano medium environment cannot override none.
No Stage 4 model change is included.

The only new runtime switches are:
`LUNA_STAGE2_PILOT_ENABLED=true`, `LUNA_STAGE2_PILOT_SAMPLE_PERCENT=50`,
`LUNA_STAGE5_PILOT_ENABLED=true`, `LUNA_STAGE5_PILOT_SAMPLE_PERCENT=50`.
Stage 1/3 remain at 100%, text-only enabled, exclusions empty, fallback false.

## Evidence and scope

- October 9 Stage 2 readiness: 119 paired cases and 30 five-stage dry replays.
- October 10: 12 corrected current-source classifier pairs, six downstream
  extraction comparisons, and a tested strong-calendar routing guard.
- Stage 5: all 69 current Stage 4-positive sources / 221 supplied occurrences,
  with raw-response checks, bounded recovery and field/recurrence verification.
- Five fresh matched Stage 5 sources: 74.1% less elapsed time and 62.4% less
  token cost than Nano medium. These are cohort results, not a whole-run promise.
- Build and 583 compiled tests pass, plus 53 pilot script checks, seven Stage 5
  reasoning/override checks and 26 focused route/website/spatial checks.

Code also addresses the source-grounded October 10 audit findings listed in
`luna-oct10-production-audit.md`. No live event record is repaired by this
release; exact target review/approval remains separate. Calendar inventory
latency/title omissions and broad deduplication remain explicit open work.

## Release gate

Narrow dry-run and real deployment target only `processDataset`,
`processDatasetResume`, and `processDatasetSelectedRows` in `gathr-migrated`.
Verify ACTIVE state, latest traffic, common source hash and every model switch
after deployment. Next full regular run must reconcile actual Stage 2/5 model
calls, negative reviews, holds, counts, fields, final writes and cost before
any expansion. Keep the October 11 audit schedule; do not re-audit October 10.

Deployment readback will be appended after the three functions finish updating.

## Verified production release

Parser commit: `49892e6` on `codex/luna-parser-live-merge`.
Deployment completed October 10 after the completed regular parse. Fresh
preflight at 15:20 UTC found no active processing locks, no checkpoint, and
matching completed lock, processed marker and final batch state.

Both narrow dry run and real deployment succeeded for exactly the three
parser functions in `gathr-migrated` / `gathr-functions`. The first dry run's
local 10-second discovery timeout was resolved by setting only the CLI's
`FUNCTIONS_DISCOVERY_TIMEOUT=60`; production runtime limits were not changed.
Firebase reports the existing outdated firebase-functions SDK warning; SDK
upgrades remain deferred as agreed.

Live readback independently confirms all three functions ACTIVE, latest
revision traffic enabled, and common source hash:
`82460dd101d04389e3588f4faeccb9f48466c2c4`.

| Function | Serving revision |
|---|---|
| processDataset | processdataset-00462-mos |
| processDatasetResume | processdatasetresume-00426-ler |
| processDatasetSelectedRows | processdatasetselectedrows-00418-cuy |

All three readbacks confirm Stage 1/3 at 100%, Stage 2/5 pilots at 50%,
text-only enabled, no exclusions, legacy fallback false, and unchanged
Stage 4 Nano low. Static Stage 5 Nano medium remains the unselected default;
selected calls explicitly override the model and effort to Luna none.
Sanitized readback: `artifacts/luna-oct10-production-audit/release-readback.json`.

The existing audit heartbeat now runs only October 11, starting at 11 a.m.
Halifax. It excludes the completed October 10 audit and must pause after
October 11's audit/decision (or report the outstanding work and pause at
that day's final check). Live event corrections have not been applied by
this deployment.
