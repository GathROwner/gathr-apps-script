# OCR caption boundary release and five CFCY review links — October 18, 2026

## Completed result

Craig approved the tested OCR safeguard and the five exact food-drive recoveries in the originating chat ("Yes you may"). Both actions are complete. Automatic unknown-venue resolution and creation remain off. No new venues, model replay, email, token, media action or scheduler change occurred.

The five events were **already present**, created October17 at18:17:48.530UTC. They retain their correct venue identities, clocks, provenance, media, recurrence and original IDs. The October18 action reused those existing records and resolved their stale area reviews by adding exact target links. **Zero event or venue writes, creations or deletions; five review-only updates.**

Private evidence root: `functions/artifacts/ocr-caption-fooddrive-oct18/`.

## Narrow parser release

Approved source commit: `559a0ed116e5e2b39aa2410ac95aba215954a15d`, based on the exact serving source baseline `1f347717c84f230f508619aa912c4c6a9b7f2605` / Firebase hash `9b22abc40f77aca1dafb2bb7a549fb88f6f82afa`.

Frozen reviewed candidate remains untouched in `functions/artifacts/retained-location-regressions-oct18/current-candidate`. The clean release assembly is `functions/artifacts/ocr-caption-fooddrive-oct18/release/assembly`, branch `codex/ocr-caption-release-oct18`, at the same commit. All459 reviewed tracked files match. Fresh source-object metadata matches the retained immutable archive MD5; the deployment environment file retains its exact bytes.

The sole runtime change is in `parsing/occurrenceSourceOwnership.ts`: `captionOnly()` now strips `OCR TEXT:` at the beginning of an empty-caption input as well as after a newline. This prevents OCR-only dates/programme wording from claiming original-caption ownership. Two focused TypeScript boundary tests and the retained-source harness cover it. It does not add another dated-stop splitting rule and is not a demonstrated email-reduction mechanism.

The exact candidate passed build, all1,026 compiled tests across154 files, and23 retained-source/control checks, independently reviewed. The release assembly was rebuilt and reran23 retained checks plus8 occurrence-ownership tests, zero failures/skips. Live package bytes were subsequently compared with the exact tested assembly.

The codebase-qualified dry run passed before the real deployment. The exact approved targets were:

```text
functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows
```

Command: `firebase deploy --config <evidence-root>/release/firebase.prebuilt.json --only <exact-targets-above> --project gathr-migrated --non-interactive`, first with `--dry-run`, then without it. The packaging config points only at the committed assembly and reuses its hashed, built/tested output; no broader functions deploy or traffic-only command was used.

Deployment completed at **23:00:54.209UTC /20:00:54 Halifax**. Fresh Cloud Functions, Cloud Run traffic, IAM and archive readbacks prove:

| Function | Active latest revision | Common Firebase source hash |
| --- | --- | --- |
| processDataset, northamerica-northeast2 | processdataset-00505-xeh | 0fdf11b55618540c09d43b53ea1cae9463d19b63 |
| processDatasetResume, northamerica-northeast1 | processdatasetresume-00469-lay | 0fdf11b55618540c09d43b53ea1cae9463d19b63 |
| processDatasetSelectedRows, northamerica-northeast1 | processdatasetselectedrows-00461-fus | 0fdf11b55618540c09d43b53ea1cae9463d19b63 |

All three are ACTIVE with100% latest traffic and identical source-package MD5s. All1,493 included source/compiled/script/package/environment files in the downloaded serving archive match the tested assembly byte-for-byte. Archive SHA256: `aca02619825f7e9ef3980ca0ca54e3cbac025d8729f13a0dbad75e6500c88f34`.

All three startup TCP probes passed; twelve observed new-revision log entries contained zero ERROR-or-higher entries. No public parser health invocation was made. Initial log pagination was continued to completion rather than mistaking a page token for a runtime failure.

Configuration, environment/model/prompt/cache/compact contracts, secret bindings and Cloud Run IAM policies match fresh predeployment hashes. Both separate resolver revisions/source hashes are unchanged: `scheduledunknownvenueresolver-00243-rek` / `57eee386d0270dda44c00ca167be4c1eda06c3ea`, and `processunrecognizedvenues-00242-siv` / `eff38f8bef686f069e94daf7837158a065ac8bf5`. Their automatic resolution/create gates remain false. All parser locks are terminal and there are no checkpoints.

Non-blocking CLI warning: the existing `firebase-functions` dependency is outdated. No dependency upgrade was included.

## Exact five review-only changes

All occurrences are `Island Wide Food Drive`, source `1735968125204476`, dataset `1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g`, row27. The original retained snapshot is `parse_snapshots/1JFQdQB-pAXdAb0usJhNFf5mrWnWyBd7g_27_1792240925261`.

| Source-local occurrence | Review retained and resolved | Existing event reused, unchanged |
| --- | --- | --- |
| Oct20,12:00–16:00, Connor & Kennedy's No Frills | `city_level_event_reviews/cityevt_9820171506b137a15f9312eb` | `venues/place_d5c0c0e38cd71fdd/events/oct17_recovery_e91580a39c6b3b45bc86` |
| Oct22,16:00–19:00, Haunted Mansion | `city_level_event_reviews/cityevt_1d8f8c8689925f63d077c957` | `venues/place_ae278e31081b5555/events/oct17_recovery_ceccf3059aa60dbaf8f3` |
| Oct27,12:00–16:00, Summerside Butcher's Shop | `city_level_event_reviews/cityevt_be9a2226db0c5993d474880c` | `venues/place_f12b183ec2b477d2/events/oct17_recovery_9fa4d871c66cda23f10b` |
| Nov3,12:00–16:00, Brown's Volkswagen | `city_level_event_reviews/cityevt_176747b0b70f4f7fd35d8684` | `venues/place_933863c47c88487a/events/oct17_recovery_673e6cdcf93898b6bb94` |
| Nov5,12:00–16:00, Highland Bottle & Metal /HBM | `city_level_event_reviews/cityevt_54ceb3e3eb3abf94c3399853` | `venues/place_b6bbbbce247714b6/events/oct17_recovery_0d83005538a02348633b` |

Normal Firebase CLI sign-in was used for field-projected Firestore REST queries and guarded transactions. No service-account credential file was read. Complete venue identity checks examined all566 root venue documents using ten identity/address fields; full duplicate checks examined1,056 event documents across the collection group using identity/source/date/time fields. Complete responses remained in RAM; only matching/source-related candidates and counts/hashes were persisted. This is distinct from the bridge's separate intake check.

Each source item binds uniquely to its printed date, time and named stop. All five canonical identities are unique within the complete projected catalog. Source IDs/URLs, nonrecurring flags, explicit time flags, exact canonical coordinates, original managed post image and image provenance match the retained source and existing records. Exactly one existing occurrence per approved date/time is present across venues; no duplicates or conflicts were found.

**Before resolving any review**, five event detail endpoints returned200 and the complete Preview feed contained each event exactly once (nine pages/840 then-active events). Public API fields are normalized (`title`, `imageUrl`); exact private provenance was checked in Firestore because the API omits sourceUniqueIds. Collector assertions were adjusted to the observed API contract, without relaxing stored-source checks.

Default-dry helper: `firebase/repair-cfcy-five-existing-oct18.cjs`. It hardcodes these five review/event pairs, requires `--apply --plan=<evidence-root>/repair/review-link-dry-run.json`, and has an exclusive attempt marker that prevents repeating an uncertain or completed apply. Do not rerun the completed apply.

Complete timestamped backup: `repair/prewrite-backup-2026-10-18T22-59-27-879Z.json`. Fresh complete per-target precommit backups are also linked in `repair/applied-result.json`. The concrete dry-run plan was shown before apply. Each individual transaction repeated the source, full-catalog uniqueness, cross-venue duplicate and exact review/event/venue version checks before its one review update. Conflicting individual targets would have remained held; all five passed.

Changed review fields only: status=`published_as_venue_event`, locationReviewStatus=`approved`, published event ID/path, resolved venue ID, resolution timestamps/operator and source/target/API-verification metadata. Original descriptions, area classification evidence, review reasons, media/source identities and other history fields remain intact. Event/venue records were not rewritten, and no feed revision was advanced.

Final verification: **five review updates; all five event and venue bodies/versions unchanged; source snapshot and feed versions unchanged; zero duplicate approved occurrences**. Five detail200 responses and complete nine-page Preview traversal (835 then-active events) again show every target once. The active count changed with the time-dependent expiry window; the full event inventory remains1,056 and this operation deleted nothing.

Kay's remaining area review, Linkletter/Village Pottery venue-intake records and Tignish source hold retain their statuses and captured timestamps. The older SDK capture rounded timestamps to milliseconds, so final protected-record comparison explicitly uses that SDK precision; exact REST server timestamps are recorded. This representation difference caused an initial verification assertion, not a detected live change. No protected record was written.

## Evidence and limits

Release: `release/before.json`, `check.json`, `after.json`, `assembly-proof.json`, `tested-payload.json`, dry-run/apply receipts and logs, `verified.json`, and `after-serving.zip`.

Repair: `repair/preflight.json`, `review-link-dry-run.json`, complete backups, `api-before-review-resolution.json`, `apply-attempt.json`, `applied-result.json`, `api-after-review-resolution.json`, and `final-verified.json`.

The retained regression comparison is not model regeneration: the six CFCY Stage3/4 items lack saved model spatial fields; the other three reviewed sources retain them. The harness explicitly uses saved post-format outputs because raw Stage5 provider output is unavailable. No claim of universal model/OCR accuracy or reduced email counts follows from this narrow safeguard. No manual venue intake, Tignish repair, broad replay, image fetch/deletion, automatic gate enabling, permission/env change or email/token action occurred.
