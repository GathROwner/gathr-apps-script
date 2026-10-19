# October 19 caption provenance groundwork

Status: deployed and verified on October 19, 2026, after independent final delta clearance. Both automatic gates remain OFF.

## Purpose and boundary

Authenticated Google Drive ingestion retains verbatim outer and shared captions separately from media text. Each channel records its original column/index, text, UTF-16 length, UTF-8 byte count, completeness and SHA-256. Capture metadata binds the original file hash, worksheet/source row, final parser row and source ID. The parser's existing combined input is unchanged.

Private process-local buffer/capture branding prevents caller JSON, copied buffers and local reconstruction from claiming fresh ingestion. All seven row snapshot paths discard supplied provenance and ask the trusted ingestion adapter for writer metadata. Both resolver evidence consumers use the same validator, and provenance participates in recovery fencing.

This uses the existing authenticated ingestion and trusted server snapshot-writer boundary. Hashes check consistency; they do not authenticate arbitrary JSON. Privileged Firestore snapshot writers/admins can forge an entire consistent snapshot. There is no HMAC, new credential, signing key or secret repurposing.

## Exact candidates and proposed scope

| Functions | Immutable serving parent | Clean candidate |
| --- | --- | --- |
| processDataset, processDatasetResume, processDatasetSelectedRows | `1c48a0bfe5fc38f7d202747110dd87e057485125` | `90326cc173057a32f2f6a02a30103396a12b42f7` |
| scheduledUnknownVenueResolver | `19b561181ab49f3ae8d8442297d7681c4739af4b` | `6c372b133b13cddd41b37d474906b009f341b999` |
| processUnrecognizedVenues | `4fecc8e0bf1f269298ba570cff54673a49c61eb2` | `2ac3be5cefd62d5302f6935c5411fced8125950f` |

`finalizeUnrecognizedVenueTrigger` stays on its separate serving baseline. It is neither the changed row snapshot writer nor a changed caption evidence consumer. No coordinator festival additions are included.

Runtime file union: `types/index.ts`, `services/driveService.ts`, `processing/rowProcessor.ts`, `services/venueSuggestionEvidence.ts`, `services/automaticExistingRecovery.ts`. Each candidate changes only its relevant three runtime files plus tests.

## Validation and actual source coverage

- Parser: TypeScript build, 16 focused tests, 1,079 full compiled backend tests.
- Scheduled resolver: TypeScript build, 112 focused tests, 506 full compiled backend tests.
- Manual resolver: TypeScript build, 112 focused tests, 506 full compiled backend tests.
- Offline suites block credential reads, external network and business subprocesses; all pass with zero skips/failures. Final source manifests are frozen.
- Retained original XLSX SHA-256 `167aed3ad32505fce5d7db80f61ba5f0b0da0b460dd0e17bc8cb5b69f014ec9d`: all 348 parsed raw rows and combined inputs match serving code with the existing fallback-ID clock frozen only for comparison.
- The original October 19 denominator remains **4 reviews / 4 occurrences / 0 ready plans**. All four retained source captures lack typed provenance and remain held. The separately labelled local reconstructions remain negative controls. The earlier bounded planner capture has three review documents and is not substituted for that denominator.
- No genuine historical positives, yield or recall are established by synthetic trusted-writer protocol fixtures.

Fresh readback at `2026-10-19T14:32:38.969Z` confirmed all six functions ACTIVE/latest traffic, exact serving source/configuration/environment/secret-binding/IAM hashes unchanged, both automatic gates OFF, allowlists absent, zero active parser locks and the same three historical checkpoints.

## Limits and release procedure

Legacy/mixed snapshots, direct local parsing, reconstructed virtual Apify workbooks, missing stable IDs, truncated snapshots and provenance packets above 128,000 UTF-8 bytes do not become fresh caption evidence. No caption recovery by stripping OCR markers or guessing source ownership is used. Strict venue, date, both-clock, expiry, media, manual-decision, inventory, worker-fencing and checkpoint guards remain.

Release separately from each immutable serving baseline: prepare exact assemblies with unchanged opaque environment; build and verify every frozen file; independently review exact commits; fresh idle/source/configuration checks; codebase-qualified narrow dry run/apply; independent ACTIVE/latest-traffic/hash/configuration/IAM readback and complete deployed source archive comparison. Verify the three parsers share one source hash and finalizer stays unchanged.

No gate enablement, event repair, provenance backfill, checkpoint retirement, row replay, paid call or new observer is part of this release.

## Local evidence

- `functions/artifacts/caption-provenance-oct19/frozen-candidates.json`
- `functions/artifacts/caption-provenance-oct19/{parser,scheduled,manual}-review.patch`
- `functions/artifacts/caption-provenance-oct19/{parser,scheduled,manual}-{focused,full}-result.json`
- `functions/artifacts/caption-provenance-oct19/offline-playback-result.json`
- `functions/artifacts/caption-provenance-oct19/serving-before.json`
- `functions/artifacts/caption-provenance-oct19/release/` for assembly/dry-run/apply/verification receipts when produced.

## Completed release

Verified at `2026-10-19T14:45:30.891Z` in project `gathr-migrated`, codebase `gathr-functions`. All five functions are ACTIVE, latest-ready, with 100% latest traffic.

| Function | Serving revision | Source hash |
| --- | --- | --- |
| processDataset | `processdataset-00507-mog` | `df28d94839b6b87753805c08443d86da7a190ab8` |
| processDatasetResume | `processdatasetresume-00471-kah` | `df28d94839b6b87753805c08443d86da7a190ab8` |
| processDatasetSelectedRows | `processdatasetselectedrows-00463-yir` | `df28d94839b6b87753805c08443d86da7a190ab8` |
| scheduledUnknownVenueResolver | `scheduledunknownvenueresolver-00245-yeq` | `775f5b992297efd7aca0d186e79623392bce7198` |
| processUnrecognizedVenues | `processunrecognizedvenues-00244-dof` | `0db3944f1d6b0417a1f5b87c187b08aba6e9367e` |

Each assembly had a successful codebase-qualified dry run and apply. Exact commands are recorded in `release/{parser,scheduled,manual}/{dry-run,apply}-started.json`; each uses only its named function group, never a full codebase deploy. The parser assembly serves all three parsers; each resolver retains its distinct baseline assembly.

Deployed archive verification matched all 1,516 expected parser files and all 648 expected files for each resolver, including opaque environment. Every startup probe passed; the bounded new-revision logs contained zero errors. This is startup/deployment evidence, not proof of a new business-source ingestion or production yield.

Per-function runtime, configuration, actual environment/model settings, secret bindings, IAM and trigger hashes match the pre-release baseline. The finalizer remains `finalizeunrecognizedvenuetrigger-00237-zac` on source hash `ce7fd5e79c509337426be51eb7d2281146ecf56e`. There were zero active parser locks and all three historical checkpoint paths/update times were unchanged.

No event/review/venue/media mutation, source-provenance backfill, checkpoint write, pilot, row replay, gate change, new observer, paid call, credential change or secret-value read was performed by this work. The original 4/4/0 denominator remains. The existing Firebase SDK version notice was the only release warning; dependencies were preserved.

Independent delta clearance: `C:/Users/craig/Documents/Codex/2026-10-18/task/independent-caption-provenance-final-review.json`, recorded with its hash in `release/independent-review.json`. Final independent deployment readback and queue-owner handoff are performed by the originating coordinator.

Next evidence: observe a genuinely new authenticated ordinary ingestion and its stored typed channels under the existing observer. Do not backfill retained captures or enable recovery/creation gates. Existing source, candidate, occurrence and publication holds still require their independent proof; this groundwork does not turn the four historical holds into ready plans.
