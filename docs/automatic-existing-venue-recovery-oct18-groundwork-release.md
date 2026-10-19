# Existing-venue recovery groundwork — approved release, October 18, 2026

**All three approved functions are deployed and verified. Automatic existing-venue recovery and automatic venue creation remain OFF on every function; their allowlists remain absent.**

Craig authorized the three-function groundwork with both automatic switches off: “Yes you can deploy the groundwork and anything else you need.” The coordinating task forwarded that exact approval. Deployment order was manual finalizer, manual resolver, then scheduled resolver, each with a separate immutable serving baseline and separate narrow dry run.

## Verified serving releases

| Function | Frozen source commit | Serving revision | Source hash |
| --- | --- | --- | --- |
| `finalizeUnrecognizedVenueTrigger` | `48e10b636650466c19ee7d0ca789069866e491f8` | `finalizeunrecognizedvenuetrigger-00237-zac` | `ce7fd5e79c509337426be51eb7d2281146ecf56e` |
| `processUnrecognizedVenues` | `4fecc8e0bf1f269298ba570cff54673a49c61eb2` | `processunrecognizedvenues-00243-fug` | `d9f91bd1fbcc110dee4353c43320dbfd61d8cf47` |
| `scheduledUnknownVenueResolver` | `19b561181ab49f3ae8d8442297d7681c4739af4b` | `scheduledunknownvenueresolver-00244-nob` | `174896f1b104d1de761e27221b0fbcf085324d82` |

Each function is ACTIVE, Ready, with 100% latest-revision traffic. Exact user environment, secret bindings, IAM, memory/concurrency/timeouts/ingress and trigger fingerprints match the fresh pre-deployment baseline. The existing scheduled resolver remains ENABLED at `every 5 minutes`, UTC; its complete configuration fingerprint is unchanged. No traffic was adjusted manually.

## Build, source and health evidence

| Function | Reviewed payload files | Focused / full frozen tests | Rebuild | Startup health |
| --- | --- | --- | --- | --- |
| `finalizeUnrecognizedVenueTrigger` | 570 | 22 / 324 | passed; hashes unchanged | probe passed; 0 errors in 4 observed entries |
| `processUnrecognizedVenues` | 634 | 106 / 495 | passed; hashes unchanged | probe passed; 0 errors in 4 observed entries |
| `scheduledUnknownVenueResolver` | 634 | 106 / 495 | passed; hashes unchanged | probe passed; 0 errors in 4 observed entries |

The frozen full suites had already passed independently; they were not redundantly rerun. Every deployment assembly was rebuilt and checked against the frozen source/compiled/package hash inventory. Each immutable deployed source ZIP was downloaded by generation, archive MD5 checked, and its runtime/build files compared byte for byte, including package lock and the opaque deployment environment file. No dependency upgrade or secret-value read was performed. The shared admission protocol remains identical across all three reviewed variants.

The first finalizer dry run discovered no endpoints because a sibling receipt named `assembly.json` shadowed the `assembly/` directory in Node resolution. That attempt did not deploy. Renaming the receipt to `assembly-receipt.json` fixed discovery without changing application files or target scope. Its original attempt log is retained. Health-log pagination was followed through to completion; an initial partial page was not treated as a completed inventory.

Evidence: `functions/artifacts/automatic-existing-recovery-oct18/deploy-groundwork-oct18/release-result.json`, per-function `assembly-receipt.json`, `dry-run-ok.json`, `apply-ok.json`, `verified.json`, immutable `serving-source.zip` and exact command logs. Raw environment values were neither printed nor committed; local opaque dotenv files remain excluded from Git.

The CLI printed its existing outdated `firebase-functions` dependency warning. The reviewed dependency versions and lockfiles were preserved; no upgrade was mixed into this release. A temporary readback HTTP 429 and network failure were followed by successful fresh verification; neither caused a repeat deployment.

Every CLI operation used `--project gathr-migrated`, its separate `--config <handler>/firebase.prebuilt.json`, and exactly one `--only functions:gathr-functions:<handler>` target. A successful `--dry-run` preceded each apply. No whole-codebase or main-parser deploy was used.

## Preserved state and remaining gates

Fresh checks before each operation and the final readback found zero nonterminal parser locks. The three known historical canonical checkpoints remain present at exactly their pinned versions; the alternate checkpoint collection remains empty. All three main parser revisions, source hashes, configuration, environments, secret bindings, IAM and triggers remain unchanged.

This release initiated no recovery/pilot call, replay, checkpoint retirement, event/review/venue repair, email, new credential flow or monitor. It made no model/provider calls. Existing schedules were preserved.

Automatic admission remains blocked pending several source-complete ordinary recovery positives, an explicit decision about the three historical checkpoints, and separately reviewed one-record pilot authorization. Current reviewed ordinary eligible count remains zero; deployment does not supply missing source IDs, clocks or provenance. Do not manufacture positives, bypass the global checkpoint guard or delete history. The finalizer HTTP timeout is 180 seconds; draining HTTP calls does not establish completion of queued tasks or reconcile uncertain manual outcomes.

Safest rollback keeps the shared admission code and durable receipts while gates remain OFF. Gate removal or lease expiry does not cancel admitted work. Do not revert to the unfenced finalizer or reset uncertain receipts without exact reconciliation. Startup health and byte equality establish this release, not live end-to-end automatic recovery performance.

## Independent combined review and subsequent read-only preparation

The coordinator independently checked all three immutable deployed archives: 635/635/571 runtime/build files matched the scheduled/manual/finalizer frozen candidates respectively, with no omitted candidate files. Independent serving metadata, configuration/environment/secret/IAM fingerprints, latest-ready 100% traffic, OFF gates, absent allowlists, scheduler configuration and complete bounded startup-log checks all passed at `2026-10-19T01:10:58.421Z`. The independent receipts and their SHA256 fingerprints are linked in `release-result.json`.

After the deployment report, read-only checkpoint preparation captured complete backups of exactly three historical checkpoints and their three related batch documents at server readTime `2026-10-19T01:11:19.149049Z`. All six versions still match the reviewed historical proposal; matching locks remain missing/completed/failed, all direct/field-matched processed markers are absent, and the complete bounded global inventory contains 328 locks with zero nonterminal locks, three canonical checkpoints and zero alternate checkpoints.

The metadata-only preflight is `functions/artifacts/automatic-existing-recovery-oct18/checkpoint-diagnosis/full-backup-preflight.json`. Complete private wire documents are retained under `firebase/artifacts/automatic-existing-checkpoint-retirement-oct18/`; backup SHA256 is `913332862ce4fcc66b20e1f224584cb67bbec849e2844707808a7dd46f737516`. Per-document full-body hashes, update times and the exact six proposed actions are recorded in the preflight. **Nothing was deleted, updated, marked processed, resumed or exempted.** This prepares evidence for a separate abandonment decision; it does not authorize or implement that decision. Earlier event samples remain limited samples, not proof that these old runs wrote no events.
