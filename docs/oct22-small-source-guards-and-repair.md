# October22 small source guards and exact recoverable repair — complete

## Final release and repair verification

Completed October22 at **13:38 Halifax /16:38UTC** after the coordinator's39-check independent refreshed manifest PASS. Final code **72dc7ee702f1ef1450b74eb031ab2b3cec444f33**, exact plan SHA **015a923aa59637fafd116d5201ee3a13afb3f8182c8dcde25121d238562a446c**, helper SHA **463ead98233680232e67022f1503de5044b7b6440cf2becfe18ac130032d513e**. The existing20focused/1,139compiled-backend passing results and both code reviews were reused; no audit/test/paid-call/scrape repeat.

Qualified three-parser dry run and deployment pass in project `gathr-migrated`, codebase `gathr-functions`. All three functions are ACTIVE, ready and100%latest traffic at common source hash **2db00247f0e2aa8e36942b52cda98838bc50e92c**:

| Function | Verified revision |
| --- | --- |
| processDataset | processdataset-00511-sif |
| processDatasetResume | processdatasetresume-00475-vap |
| processDatasetSelectedRows | processdatasetselectedrows-00467-yot |

Exact1,555-file serving payload/environment comparison passes; startup probes pass for all three, zero new runtime errors in retained health logs. Source/config/environment/model/effort/prompt/cache/compact/secret-binding/IAM/runtime/trigger fingerprints match the accepted serving baseline except the reviewed three-file runtime delta. Resolver/finalizer source/revisions are unchanged. No active parser lock; historical checkpoints unchanged. Both automatic-resolution/creation gates remain OFF and the allowlist absent.

Both approved index operations are now **SUCCESSFUL/done**, with READY entries, six existing index definitions preserved and zero duplicate operations. The earlier finalizing receipt below is historical; frozen preflight captures were preserved. Completion receipt: `index-operation-completion.json`.

All apply-time full record/version/keeper/venue/global-source/sibling/feed/idle guards passed. Atomic repair commit **2026-10-22T16:38:23.854093Z** contains exactly8write results: three full typed event archives, three approved withdrawals, one full typed feed archive and feed **372→373**. Original inferred RCMP ends are preserved only in recovery snapshots, not endorsed as supported clocks. No venues, contacts, media objects, provenance, queues or other events changed.

Postflight verifies all three canonical absences and full typed archives, the typed feed archive and exact feed metadata delta, protected Second Sundays' unchanged full document, both venue documents and seven unrelated sibling records unchanged. Three retired details return404; Second Sundays returns200. The complete959-event active feed (10pages) and both affected venue feeds (CityCinema6 /RCMP1) exclude retired parents/instances and retain the keeper. Six bounded post-repair source queries find only protected Second Sundays, with no unexpected secondary-source sibling.

The live drift-guarded rollback dry run passes: exactly three complete typed restores with exists:false and monotonic feed373→374, four writes, all archives retained. **Rollback was not applied.** Full prewrite backup path/hash and all exact receipts are in `functions/artifacts/oct22-small-batch/release-and-repair-completion.json`; completion fingerprint is stored separately. Actual backup is under `firebase/artifacts/oct22-small-batch/`. Release logs preserve exact qualified commands/config/arguments; only processDataset, processDatasetResume and processDatasetSelectedRows were targeted. The existing outdated firebase-functions warning was retained, without unrelated dependency changes.

This completes only the approved small batch. Original cinema OCR response remains unavailable, so reconstruction stays labelled. No new regular parse was run after release and no device adoption claim is made. Automatic resolution remains OFF; broader hours/Places, fifth-image coverage, generalized resurrection fences and ambiguous deferred cases are outside this slice.

## Earlier checkpoint after approved index provisioning

Craig explicitly approved only the two missing query indexes and continuation of the existing small batch on October22 at16:22:54UTC. Both approved field updates were submitted once, each preserving its three existing COLLECTION indexes and adding only the requested COLLECTION_GROUP index. Both fields now report READY; all six preserved definitions and unchanged TTL settings were verified. The long-running administrative receipts still report PROCESSING while the index fields are READY and all required queries work; this finalization state is retained honestly in `index-readiness.json`, not treated as another operation or retried.

Fresh serving/idle preflight passes at16:27:05UTC: all six serving source/environment baselines match, three parsers ACTIVE/latest100% on source8c014dae9dbbc3a36c4f76746fdd65883c965aee, no active parser locks, same three exact target versions, protected Second Sundays unchanged, two venue collections unchanged, feed372. Six bounded global source-specific queries pass and find exactly the four approved source records, with zero unexpected siblings. No broad scan occurred.

Refreshed frozen plan SHA256 **`015a923aa59637fafd116d5201ee3a13afb3f8182c8dcde25121d238562a446c`**; helper SHA256 **`463ead98233680232e67022f1503de5044b7b6440cf2becfe18ac130032d513e`**. The source guard bytes remain unchanged; exact fresh source capture, refreshed preflight and index-readiness hashes are bound into the plan. A current dry run passes with exactly8writes/4archives/feed372→373;4-write rollback shape passes without apply. Earlier plan hashes/captures/reviews are preserved under the two superseded directories. Code remains72dc7ee;20focused/1,139compiled-backend results and both code reviews are reused, with no test/audit repeat.

**Coordinator final independent manifest review is pending.** No parser deployment or live event/archive/feed/venue/media/queue mutation occurred. Only the two authorized index configurations changed. Automatic-resolution gates remain OFF. Exact review checkpoint: `functions/artifacts/oct22-small-batch/final-manifest-checkpoint.json`; current dry run: `repair-dry-run.json`; index/operation evidence: `index-readiness.json`. After manifest PASS, the already authorized release/apply/verification sequence below may proceed with fresh guards; no routine approval is needed.

## Earlier preparation and missing-index blocker history

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
