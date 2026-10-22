# October22 small source guards and exact recoverable repair — blocked before release

## Prepared implementation and independent review

Craig authorized independent review, narrow deployment and the exact recoverable repairs if review passes. The completed October22 source-to-output audit was not repeated. Automatic-resolution gates remain OFF; no deploy, event/feed/archive write, queue change, scrape or paid model call occurred in this continuation.

Candidate `72dc7ee702f1ef1450b74eb031ab2b3cec444f33`, branch `codex/oct22-small-source-guards`, checkout `C:/Users/craig/.codex/worktrees/o22small`; immutable accepted baseline `c5e2f2644ec9558b55be19b36e342fa06d93a48a`. Only three production files change: `eventExtractor.ts`, `sourcePublicationPolicy.ts`, `postParser.ts`. Separate tests and a saved-source fixture are included.

The OCR guard rejects a bare known venue masthead as an activity, retaining healthy named screenings and concurrent distinct activities. Explicit undisclosed attendee venues require original-source plus item-local withholding evidence; publisher-office fallback cannot override the hold. Saved replay retains held evidence before validation/media preparation on all-held input and rechecks saved Stage4. Independent review found a mixed-item ownership collision in the initial implementation; the corrected version uses stable source indices plus occurrence identity, with only unambiguous legacy unindexed fallback.

Build and **20 affected tests pass**. One final compiled backend run after that ownership correction passes **1,139 tests, zero failures/skips**, with exact receipts retained. The earlier failed live tests were enrichment mock-shape errors and were corrected. OCR reproduction uses a reconstruction from the retained poster and exact saved items; the original paid OCR response is unavailable. No paid response playback is claimed.

## Exact batch and frozen evidence

Artifacts: `functions/artifacts/oct22-small-batch/`.

Frozen plan SHA256 `38e796be8c3dc5abcaf0fc93238da25066f5d403d66325ae7ce8f289d009491b`.

Repair helper SHA256 `61892db873fd12099a5efe8894b2abaf808e9b07c6e47de73bd5f1b80a85fabf`. The plan also binds the separate global source guard's hash; the helper checks that dependency before invoking it and requires a matching successful frozen source capture.

Exact public withdrawals:

- `venues/slug_citycinemachtown/events/u1tYDY5oORcQWo2TGQgQ`: CITY CINEMA masthead phantom, Nov15 16:00.
- `venues/slug_rcmpgrcpei/events/blGN5zztgqkkzPkABp6s`: RCMP session1, Oct30 09:30, attendee venue withheld.
- `venues/slug_rcmpgrcpei/events/E0YfIMoFyyB0kR1KJMdK`: RCMP session2, Oct30 13:00, attendee venue withheld.

Protected valid Second Sundays: `venues/slug_citycinemachtown/events/ix08EbRws1fZnNR5OMMY`, Nov15 16:00. No relocation or source-wide removal. RCMP originals retain inferred end clocks only inside complete recovery snapshots; only starts are source supported.

Expected atomic batch: three complete typed event archives, three event deletes, one complete typed feed archive and version/update-time-only feed update, **8 writes /4 archives**, captured feed **372→373**. Zero venue/contact/media/provenance/queue writes. Full target/keeper/venue/sibling/version checks passed in the retained earlier dry run; complete typed rollback shape is three exists:false restores plus a monotonic feed increment, **4 writes**, never applied. Those receipts and their preceding plan are preserved under `superseded-before-global-source-guard/`; they do not claim the newly required global provenance check passed.

## Release blocker and required next steps

The required exact-source sibling check across the `events` collection group cannot complete. Queries for sources `1655600776576837` and `1572718361567136` need missing indexes:

- `sourceUniqueIds`: COLLECTION_GROUP / CONTAINS.
- `sourceUniqueId`: COLLECTION_GROUP / ASCENDING.

Firestore returns HTTP400 FAILED_PRECONDITION. Existing primary `uniqueId` queries work, but cannot detect a record elsewhere containing the source only in secondary provenance. A venue-only or primary-ID-only substitute is insufficient. No broad scan, index deployment or relaxed guard was performed. The helper explicitly aborts before authentication/mutation without the successful global source capture. Independent code/typed-write semantic review passes; **release and apply remain blocked**.

Next: authorize/prepare only these two query indexes while preserving existing index settings, wait for readiness, rerun only the two-source bounded sibling preflight, bind its exact capture hash in the plan and re-freeze/review. Then fresh idle/serving/configuration/source/keeper/feed guards, qualified three-parser dry run and deploy, independent ACTIVE/latest/common-hash/environment/gates readback, exact8-write apply, canonical/full-typed archive/detail404/keeper200/full active and two venue-feed verification, and live4-write rollback eligibility. Do not repeat the completed audit or unchanged tests. No live success is claimed by this preparation.
