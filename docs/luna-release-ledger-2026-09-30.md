# Luna guarded release ledger — 2026-09-30

## Live state

- Scheduled parser: deployed in `gathr-migrated` from `codex/luna-parser-live-merge` at `bc25deb`. Exact Firebase target: `processDataset` (`northamerica-northeast2`), `processDatasetResume` and `processDatasetSelectedRows` (`northamerica-northeast1`), all in codebase `gathr-functions`.
- `LUNA_CANARY_ENABLED`, `LUNA_CANARY_POST_IDS`, and `LUNA_FOUR_BANDS_ENABLED` are absent from the deployed environment. The Luna path is off. No post was added to an allowlist.
- Private photo-share functions in `gathr-m1` were not deployed; the owner canary is off. The merged private-share candidate is in a separate `codex/luna-share-live-merge` checkout pending dense-calendar accuracy work.
- `gathr-backend` was not deployed. Cloud Run CLI reauthentication is required; its live revision remains `gathr-backend-00082-mk5`.

## Parser release evidence

- The pre-release parser source from the active Function source generation was downloaded and committed as `1437b32` before cherry-picking the tested Luna change. The live source differed from the earlier trial branch, so this merge preserved the deployed baseline.
- The first merge commit was `0720438`, followed by Stage 3 duplicate-declaration repair `d4a8460` and a runtime Responses-routing repair `bc25deb`. The last repair replaced a stale `isGpt5Model` reference with `usesResponsesApi`; both the selected Luna route and unselected legacy route then completed a local five-stage dry smoke test with one event each.
- `npm run build` and 35 focused parser tests passed. The final narrow Firebase dry run passed, then the three-function deployment completed. The Firebase CLI warned that the repository's `firebase-functions` package is outdated.
- A live check found no active `processing_locks` before deployment. The September 30 large parse lock had completed at 14:06 UTC.

## Revision backup and rollback

| Function | Previous Cloud Run revision | Current Cloud Run revision | Previous source generation | Current source generation |
| --- | --- | --- | --- | --- |
| `processDataset` | `processdataset-00421-daq` | `processdataset-00423-wol` | `1790605848136634` | `1790805222581779` |
| `processDatasetResume` | `processdatasetresume-00385-far` | `processdatasetresume-00387-vux` | `1790605848668238` | `1790805222981856` |
| `processDatasetSelectedRows` | `processdatasetselectedrows-00265-rub` | `processdatasetselectedrows-00267-mex` | `1790605897434490` | `1790805260866434` |

The original source ZIP is retained under `C:\Users\craig\.codex\worktrees\luna-pilot-release\predeploy-sources\parser-1790605848136634.zip`. The original source is also checkpointed in Git commit `1437b32` in this release worktree, which is the durable code rollback point. The three previous Cloud Run revisions remain the immediate traffic rollback targets.

If a pilot causes trouble, remove its exact ID from `LUNA_CANARY_POST_IDS` or set `LUNA_CANARY_ENABLED=false` and redeploy the same three-function target. To undo the code change, build and narrowly redeploy commit `1437b32` with the preserved `.env`. Confirm the three Function states and their source generations afterward. A code rollback does not undo Firestore events already written by a pilot; inspect parse snapshots and candidate writes before any data correction.

## Open gates

- An October lineup snapshot appeared to have media metadata but its prior parse reported no usable image; do not select it without recovering and inspecting that image.
- A source-verified Seawalk Studio post was subsequently identified, but the Luna full-route dry run omitted its fifth, caption-only recurring event while the saved GPT-5.2 result retained it. Keep post `1715992940535525` out of the allowlist pending the correction in `luna-seawalk-pilot-gate-2026-09-30.md`.
- The current private-share parser contains extra classification and photo-safety logic compared with the first trial branch. After prompt hardening, two identical Luna high dry runs on the February Factory poster produced 49 and 48 dated private entries. The second combined two separate February 7 listings and misread a February 21 DJ. Luna xhigh on the earlier prompt cost more without restoring four missing Friday late-night entries. Keep `LUNA_SHARED_CALENDAR_CANARY_ENABLED` off until this path passes source-grounded repeatability checks. See `luna-share-live-baseline-gate-2026-09-30.md` in the share release checkout for all six scored runs.
- The four-band backend helper passed its three focused tests but remains undeployed. Reviewed crop coordinates and an authenticated Cloud Run deploy are still required before any four-band live pilot.
