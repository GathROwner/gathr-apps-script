# Stage 1 Luna 100% release — October 9, 2026

## Authorization and baseline

Craig approved moving Stage 1 to 100% after the first production pilot audit found no confirmed useful post wrongly rejected among 85 Luna evaluations (37 accepted, 48 rejected). This is evidence for expansion, not a guarantee of perfect recall. The October 9 audit and six downstream repairs remain the accepted baseline.

Release checkout: `C:\Users\craig\.codex\worktrees\luna-pilot-release\gathr-apps-script`, branch `codex/luna-parser-live-merge`, HEAD `357d53f`, parser hardening `609cedf`. Pre-expansion live source hash: `cfa133001c0368bae01796af16081078352521e6`.

## Exact change

Set `LUNA_STAGE1_PILOT_SAMPLE_PERCENT=100` in this checkout's ignored `functions/.env`, deploying to `processDataset`, `processDatasetResume` and `processDatasetSelectedRows` only. The percentage is of actual eligible image-bearing Stage 1 evaluations. Text-only posts remain Mini. No parser TypeScript or model prompt changes are included in this expansion.

Preserve Stage 1 pilot enabled, Luna high, eligible image Stage 3 at 100% Luna high, Stage 2 Mini, image-ineligible Stage 3 GPT-5.2, Stage 4 Nano low, Stage 5 Nano medium and no legacy fallback.

## Validation and deployment

- TypeScript build passed.
- Both compiled Stage 1 allocation tests passed, including 100% selection for every eligible source in the 1,000-source control and exclusion of text-only/unidentified posts.
- The immediately preceding identical-code hardening release passed 567 backend tests, 40 Stage 1 evaluation tests and six original-source no-write API replays; those were not rerun solely for this percentage change.
- Firestore returned no running parser locks at 17:32:52 UTC and again immediately before deployment at 17:34:21 UTC.
- Exact three-function Firebase dry run succeeded. The existing outdated firebase-functions warning remains; dependencies were not upgraded.

```powershell
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run --non-interactive
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
```

The local ignored environment configuration and live function readback are the percentage authority; the tracked source commit alone does not carry this environment change. Private logs remain at `C:\Users\craig\.codex\luna-oct9-audit\stage1-100-*.log`.

The exact deployment completed successfully. Fresh readback verified all three functions ACTIVE with all traffic on their latest revisions and common source hash **`013c7457d17b150aa10da3d42d1c2e6219bdd9b7`**:

| Function | Revision |
| --- | --- |
| processDataset | processdataset-00460-keg |
| processDatasetResume | processdatasetresume-00424-kob |
| processDatasetSelectedRows | processdatasetselectedrows-00416-yel |

The full runtime environment comparison confirmed that **only** `LUNA_STAGE1_PILOT_SAMPLE_PERCENT` changed, from 50 to 100, on every function. Safe readback evidence is stored in `artifacts/luna-oct9-production-audit/stage1-100-readback.json`. Full private readbacks remain outside the repository. No event records or media were changed.

To undo this expansion if later evidence requires it, restore the percentage to 50 on all three functions using the same narrow deployment and readback gates; preserve parser hardening `609cedf`.

## Two-day follow-up

The existing heartbeat `luna-repaired-canary-next-full-run-audit` was reused for October 10 and 11, starting at 11 a.m. Halifax each day with hourly completion checks through 6 p.m. It must stay quiet until a new full regular dataset completes, audit each dataset once, and pause after both daily reports. It is bounded to those two days; any unfinished audit at the end must be reported rather than silently claiming success.

For both days, reconcile actual Stage 1 allocations/model calls and review every Luna rejection against source captions and ordered available galleries. Also review accepted posts, Stage 3 extraction, final writes/holds, the October 9 repairs, resume fencing, duplicates, provenance, latency and token cost. Full completion requires lock, processed marker, final batch and absent checkpoint. No live mutation or active-run traffic change is authorized by the audit schedule. Four false records from October 9 remain subject to their separate exact cleanup approval.
