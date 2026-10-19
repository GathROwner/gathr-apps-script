# Structured event description end times — October 19, 2026

**The narrow prevention fix is deployed and verified. No existing event was repaired.**

## Defect and behavior

Source `870787649453729`, snapshot `parse_snapshots/1M-RyrP8cK0nnVTZD0y90kATsiL4jfMMK_0_1792400519898`, advertises the October25 Scholastic Chess Tournament from12:45–4p.m. at Birchwood Intermediate School. Its structured `When:` contains only12:45. The deterministic adapter previously examined `When:` and `Duration:` but ignored the description-only end. Retained format already had a blank end and recorded zero model calls. Before this release, Firestore `events/location_44dfa10df1b155cb33c36d35` and its public detail200 response both had blank endTime.

The fallback now accepts one explicit description range whose date, optional year/weekday, and start agree with the structured local occurrence. The retained, unmodified source resolves October25/16:00 with explicit `descriptionRange` provenance. It does not take doors, check-in, registration or deadline clocks; conflicting dates/starts, multiple ranges, ambiguous meridiems, unsupported timezone suffixes, DST ambiguity/nonexistent times and inferred overnight endings hold. Range tails are limited to end-of-text, a verified AST/ADT marker, or `at` the captured attendee location. Existing `When:` and `Duration:` handling retains precedence. Poster validation holds conflicting explicit description/poster ends.

## Exact release and validation

- Clean candidate branch: `codex/chess-description-end-oct19`.
- Frozen commit: `1c48a0bfe5fc38f7d202747110dd87e057485125`, descended from the verified immutable serving baseline `559a0ed116e5e2b39aa2410ac95aba215954a15d`.
- Production source changes: `src/processing/rowProcessor.ts`, the additive provenance type in `src/parsing/types.ts`, and the explicit-description conflict comparison/type in `src/parsing/structuredLocationValidation.ts`. Two focused regression files and the retained JSON source fixture complete the six-file source delta. No prompt/model/cache/queue configuration or dependency upgrade was included.
- Build: `node node_modules/typescript/bin/tsc` passed. **100 focused checks and1,068 full compiled tests across155 files passed**, zero failures/skips; source/compiled/package hashes stayed unchanged during validation. Paid calls were blocked and credentials excluded from test processes.
- Independent guarded review confirmed all1,501 frozen file hashes, the exact retained source positive, and nine added date/timezone/header negative controls. The latter are deterministic boundary controls, not independent production positives. Compiled rowProcessor SHA256: `bc230b3ca97513e9745b21456df75e489c684f1ad4b89fad75d64d391ba0cc74`.

Fresh preflight independently pinned all three actual serving functions. Their immutable packages and user environments matched; each function's distinct settings and IAM were preserved. The old source hash was `0fdf11b55618540c09d43b53ea1cae9463d19b63`. The tested baseline archive MD5 matched all three serving generations. No dirty main-checkout source was used.

CLI project/codebase: `gathr-migrated` / `gathr-functions`. The following exact target/configuration passed dry run, then apply (the actual CLI entrypoint was the installed firebase-tools Node binary):

```powershell
firebase deploy --config C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\chess-endtime-oct19\firebase.prebuilt.json --only functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows --project gathr-migrated --non-interactive --dry-run
firebase deploy --config C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\chess-endtime-oct19\firebase.prebuilt.json --only functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows --project gathr-migrated --non-interactive
```

## Verified serving identities

All three are ACTIVE/Ready on100% latest traffic and common source hash **`cc1a55eed5f9e305772c8965a1e29aea46c1ba2e`**:

| Function | Revision | Immutable source generation |
| --- | --- | --- |
| `processDataset` | `processdataset-00506-jup` | `1792405745407798` |
| `processDatasetResume` | `processdatasetresume-00470-kuc` | `1792405745805778` |
| `processDatasetSelectedRows` | `processdatasetselectedrows-00462-voc` | `1792405784091995` |

Fresh readback at `2026-10-19T10:30:27.671Z` confirmed exact configuration/environment/secret-binding/IAM/trigger fingerprints unchanged. All three source packages have identical MD5 `DjRLqJa0FDpUzZ8l4/orKQ==` and size6,178,177bytes. The immutable downloaded package SHA256 is `9c19bcf9c158dbd332a7cf8cbeab10291ae6634e4deb826fcabd0c8ff255a1bd`; its1,501 source/compiled/build/environment files match the frozen payload byte for byte, with no unexpected runtime/build files. Each new revision had a successful startup probe and four observed log entries, zero errors. The CLI's existing outdated firebase-functions warning remains; the reviewed lockfile was preserved.

## Preserved state and remaining limit

Fresh preflight/readback found329 parser locks with zero nonterminal locks. The exact three historical canonical checkpoints remain at their original versions; alternate checkpoints remain empty. All three resolver/finalizer revisions and their source/configuration/environment/secret/IAM fingerprints are unchanged. **Both automatic switches remain OFF everywhere, with allowlists absent.** No schedule, queue, checkpoint, email, credential, replay or live event mutation was initiated by this release.

Code deployment does not repair `events/location_44dfa10df1b155cb33c36d35`; its last direct read still showed the missing end, and this release did not write it. Any direct correction is a separate reviewed action. This Facebook Events fixture is labelled structured integration evidence; the ordinary unknown-venue recovery-positive count remains **zero**. The existing queue owner alone observes the ordinary posts run; no new monitor was installed.

Evidence root: `functions/artifacts/chess-endtime-oct19/`. Diagnosis: `assessment.md`, `source-only.private.json`, `bounded-root-venue.json`, `public-detail.json`, `pure-playback.json`. Release: `release/before.json`, `validation.json`, `frozen.json`, `independent-review.json`, `dry-run-ok.json`, `apply-ok.json`, `verified.json`, command logs and `serving-source.zip`. Private environment files remain untracked. The owner returns idle after the handoff; no additional source search or backlog review is implied.

## Independent post-deploy confirmation

The coordinator independently downloaded all three immutable archives and matched all **1,500 non-environment source/build files in each**, with no omitted candidate files. The one environment member remained opaque to that independent check; fresh live environment/configuration/secret/IAM fingerprints were preserved. All three revisions had 100% latest-ready traffic, both switches OFF and no allowlist. Independent health readback was one complete page: four INFO entries, a successful startup probe and zero errors per revision, with no runtime function invocation.

Independent receipts: `C:/Users/craig/Documents/Codex/2026-10-18/task/independent-parser-endtime-deployed-payloads.json` and `independent-parser-endtime-live/{before,after,health}.json`, checked at approximately 10:31 UTC. The coordinator delivered the information-only handoff to the existing queue owner. No additional deployment, testing, event repair or monitor is needed for this scoped release.
