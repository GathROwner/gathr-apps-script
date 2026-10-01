# Luna guarded release ledger — 2026-09-30

## Live state

- Scheduled parser: deployed in `gathr-migrated` from `codex/luna-parser-live-merge` at `bc25deb`. Exact Firebase target: `processDataset` (`northamerica-northeast2`), `processDatasetResume` and `processDatasetSelectedRows` (`northamerica-northeast1`), all in codebase `gathr-functions`.
- `LUNA_CANARY_ENABLED`, `LUNA_CANARY_POST_IDS`, and `LUNA_FOUR_BANDS_ENABLED` are absent from the deployed environment. The Luna path is off. No post was added to an allowlist.
- Private photo-share functions in `gathr-m1` were not deployed; the owner canary is off. The merged private-share candidate is in a separate `codex/luna-share-live-merge` checkout pending dense-calendar accuracy work.
- The `gathr-backend` image-upload configuration was repaired after CLI reauthentication and user approval. New Cloud Run revision `gathr-backend-00083-pnh` serves 100%; prior revision `gathr-backend-00082-mk5` remains the immediate traffic rollback. The application image and service identity were preserved. The existing storage key is mounted from Secret Manager secret `gathr-backend-storage-key` version 1 at `/etc/secrets/storage/key.json`. Both OCR and display upload/download/delete smoke tests passed. No parser Function was deployed during this backend repair.

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

- During Cloud Run configuration inspection, the existing `FIREBASE_CREDENTIALS` environment value was inadvertently printed into this private task's tool output. The credential value is not copied into this repository or the release artifacts. Rotate that credential through a planned backend configuration update; the approved storage-key repair did not change it.
- An October lineup snapshot appeared to have media metadata but its prior parse reported no usable image; do not select it without recovering and inspecting that image.
- The Seawalk Studio exact-post replay now returns the four flyer workshops and caption-only weekly BYOC through the real managed backend, matching the saved 5.2 snapshot on count and BYOC cadence. The local dry-write venue guard holds all four Seawalk workshops because the fuzzy matcher otherwise selects North Rustico Lions Club; only BYOC resolves safely. The guard is committed but not deployed. Keep post `1715992940535525` out of the allowlist until Seawalk Studio's venue is source-verified and the guarded parser code is deployed. See `luna-seawalk-pilot-gate-2026-09-30.md`.
- Exact-post candidate screening found the gallery post suitable for a controlled dry canary, but existing-event dedupe remains unverified. Founders retried legacy; Montague's schedule route generated 43 old OCR tiles despite a prepared Luna frame. A local fix preserves Luna's one preprocessed frame; its managed rerun verified zero tiles but yielded malformed event titles and was held. See `luna-first-canary-candidate-2026-09-30.md`. This fix has not been deployed.
- The current private-share parser contains extra classification and photo-safety logic compared with the first trial branch. After prompt hardening, two identical Luna high dry runs on the February Factory poster produced 49 and 48 dated private entries. The second combined two separate February 7 listings and misread a February 21 DJ. Luna xhigh on the earlier prompt cost more without restoring four missing Friday late-night entries. Keep `LUNA_SHARED_CALENDAR_CANARY_ENABLED` off until this path passes source-grounded repeatability checks. See `luna-share-live-baseline-gate-2026-09-30.md` in the share release checkout for all six scored runs.
- The four-band backend helper passed its three focused tests but remains undeployed. Reviewed crop coordinates and an authenticated Cloud Run deploy are still required before any four-band live pilot.
