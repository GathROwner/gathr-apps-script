# October 23 exact repair and narrow prevention — frozen for independent review

## Current checkpoint

The source audit is complete in [luna-oct23-production-audit.md](luna-oct23-production-audit.md). Its original ten-record recommendation has now become an implemented prevention candidate and an executable, guarded **twelve-event repair manifest** after Craig specifically authorized the two missing SeaWalk workshops. The original ten-record frozen packet is preserved under `functions/artifacts/oct23-small-batch/superseded-ten-record/`. No older applied repair helper was invoked.

**Not yet deployed or applied.** Independent review of this exact packet is required before the already-authorized narrow release/apply. No additional routine user approval is requested. Automatic venue-resolution gates stay OFF. The dirty main checkout is untouched.

## Committed code and baseline

- Isolated worktree `C:/Users/craig/.codex/worktrees/o23small`, branch `codex/oct23-range-and-fun-swim`, commit `af5d80435c14dd44cfa588fad1fabb3f8be9d306`.
- Fresh serving baseline captured October 23 at 15:38:35 UTC: all three parsers ACTIVE/latest 100%, common source hash `2db00247f0e2aa8e36942b52cda98838bc50e92c`, accepted source commit `72dc7ee702f1ef1450b74eb031ab2b3cec444f33`.
- All six checked functions preserve source/configuration/environment/secret bindings/IAM/trigger identity. No active parser; three historical canonical checkpoints remain unchanged, zero alternate checkpoints.
- Runtime changes are exactly `postParser.ts` (recognize `~` as an explicit range separator, including compact endpoints) and `familyFriendlyScoring.ts` (add recreational `fun swim`, scoring version v12). Two new regression files. No prompts, model/effort/cache/compact contracts, dependency configuration or resolver changes.
- Assembly starts from the independently verified immutable serving ZIP. **1,547 baseline files remain byte-identical**. Eighteen changed/added payload files are confined to the four reviewed sources and their compiler outputs. Ten of those are new test source/compiler files; no unrelated runtime file changes.

## Verification already complete

- Build passes. Six affected suites: **91/91**. One final compiled backend run: **1,167/1,167**, zero failures. No unchanged suite was rerun after the additional data-only SeaWalk scope.
- Offline playback of actual saved Stage 4 pottery clocks/flags plus same-source formatted metadata reproduces baseline 17:00–17:00 for all three occurrences; candidate keeps 10:00–17:00. The exact stored Friday Fun Swim object changes through the utility from 15/unlikely to 60/likely, with `family_activity`; no guessed score.
- Healthy controls preserve independent explicit clocks, unknown ends, compact clocks, overnight rollover, lane/adult/private restrictions, and separate existing pool intervals.
- Exact repair dry run passes inside a read-only Firestore transaction: ten existing records unchanged from audit; four explicit protected records, seven original venues, 32 original source-sibling records and 47 bounded global source queries; plus SeaWalk venue, four unchanged source sessions and three additional source queries. Both new IDs absent. Historical checkpoints unchanged. Feed **386→387**.
- Codebase-qualified three-parser Firebase dry run passes. No production deploy or public event write has started.
- Rollback shape passes: **13 writes**, restoring ten original events, deleting two recoveries and advancing feed **387→388**. It is deliberately non-executable until actual postcommit update versions are reread; post-apply rollback dry run will verify those exact versions. Archives are retained.

Receipts: `functions/artifacts/oct23-small-batch/test-results.json`, `baseline-saved-source-playback.json`, `candidate-saved-source-playback.json`, `release/parser/assembly-byte-verification.json`, `release/parser/dry-run-ok.json`, `repair-dry-run.json`, `repair-rollback-shape.json`.

## Exact event delta

The original ten paths and captured versions remain as listed in the audit and `repair-plan.json`:

- Three Robert McMillan Pottery starts 17:00→10:00; end 17:00/dates/source evidence/media unchanged. Only startTime and updatedAt are patched.
- Friday Fun Swim: utility-produced five family assessment fields, plus updatedAt; existing source-bound audience proof and all timing/content remain untouched. The content hash happens to be unchanged because content has not changed; the scoring version changes to v12.
- Recoverably withdraw Digital Health Week pinned to Town of Souris, two Explore Summerside duplicate publisher copies, and three superseded Brooke and Brad/Gypsy October occurrences. Do not infer a library, relocate records or copy old clocks to a postponed date.

Two additional exact creates, both **13:00–16:00, nonrecurring, at existing `venues/slug_seawalkstudio`**, 24 Harbourview Drive, North Rustico:

| Date/activity | New canonical path | Canonical uniqueId |
| --- | --- | --- |
| October 25, Felt Art — The Snazzy Sheep | `venues/slug_seawalkstudio/events/oct23_recovery_1857000b86a627ef6f19` | `122258865140861317_dd7640d29b6fe5ef` |
| November 22, Barn Quilts | `venues/slug_seawalkstudio/events/oct23_recovery_d8b692783b06687e01a9` | `122258865140861317_ddab171282a0691f` |

New titles/prices/descriptions/registration contacts come from the saved source items. Payloads were constructed locally using `preserveValidatedOccurrence`, `previewFullParserEventWritePayload`, the normal stable unique-ID builder and the existing write-provenance builder with create-write options. Exact venue/address matchers are injected from the freshly verified facility; all HTTP is forbidden during payload preparation. The two already managed images are the same ordered source gallery used by all four existing sessions; table image 1 remains primary. No image upload, paid lookup/model call or parser replay occurred. Frozen real timestamps replace helper test sentinels; no `serverTimestamp` string is published. Existing source provenance is not rewritten.

All seven validated source rows are retained in the evidence backup. Four published SeaWalk sessions stay byte-identical. November 28's Saturday-versus-Sunday conflict remains held and is not created.

Explicit protected festival parent, proper children/memberships and future Gypsy:

- `events/local_pumpkin_2026`
- `venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9`
- `venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13`
- `venues/slug_thescottmacaulayperformingartscentre/events/AhWckjkJAoW25VPREan9`

All eight involved venue documents and unrelated source siblings are protected; no contacts, interactions, existing provenance or media are changed/deleted.

## Complete write count and guard contract

**25 atomic writes** = four existing event updates + six existing event deletes + two event creates + ten complete typed event archives + one complete feed archive + one complete SeaWalk source/absence-evidence archive + one monotonic feed update. Thus **12 event actions, 12 archive documents and one feed mutation**. The source archive includes original workbook row, caption/shared text, ordered media/frame references, Stage 1 image analysis, all seven Stage 3/4 items, exact original venue/source siblings and the two original absent paths. Private audit evidence stays in the internal backup collection.

The default-dry helper binds exact plan/code/helper hashes, full typed originals, source/date/time/recurrence/update versions, all selected/protected venue documents, global source siblings, SeaWalk's complete bounded venue inventory, target absence, archive absence, parser idle, historical checkpoint versions and feed version. Apply uses a read-write transaction; source/query/document drift aborts. New targets are create-only. Existing targets use exact updateTime preconditions. Full prewrite backup under `firebase/artifacts/oct23-small-batch/` is automatic before commit. An apply-attempt or commit receipt prevents blind retries; unknown outcomes must be reconciled.

Serving must be independently reread by the narrow release controller immediately before repair; a completion receipt older than 90 seconds is rejected. The new helper never changes parser queue/checkpoints or automatic-resolution gates. Firestore canonical JSON normalization for empty arrays/maps and zero timestamp fractions is explicit, avoiding false postcommit failures while preserving original typed snapshots.

## Independent review and execution sequence

Entry point: `functions/artifacts/oct23-small-batch/frozen-review-packet.json`. The coordinator must inspect actual code diff, baseline reproduction and test logs, byte-preservation proof, exact typed payload, fresh guards and rollback shape. Its passing receipt is `independent-review.json` in that directory, with the packet's exact parserCommit, plan/helper/contract/source-guard/release-controller/frozen-candidate/rollback and SeaWalk evidence/builder hashes, plus `testsPassed` and `protectedFieldsVerified`. No such passing receipt is manufactured by preparation.

After review passes: narrow parser deploy, independent six-function ACTIVE/latest/config/common-parser-hash/serving-byte verification; fresh final serving readback; exact recoverable apply if all live transaction guards still pass; canonical/full archive/protected-record validation; exact detail responses, complete active feed and eight affected venue feeds; then actual-version rollback dry run. `live-postflight.cjs` performs read-only public/canonical verification. No UI or OTA release is involved.

## Prevention limits and deferred work

SeaWalk's proven caption-only `filterUnsupportedWorkshopBleed` false negative is **not claimed fixed**. The guard currently receives caption and generated/validated items, not independently bound gallery evidence. An exemption based only on a generated image index or self-supporting item would relax cross-post protections. Supplying/reliably binding independent source-gallery evidence is a separate bounded implementation decision; this slice restores only the two source-proven missing records. All seven source items remain inventoried.

Publisher fallback likewise spans enrichment/routing and is not expanded into a global writer fence. General postponement lifecycle, third SeaWalk conflict, gymnastics/Lunch Club recurrence, Spook Organa's held timing/venue, other held identities and clock conflicts, hours/Places and global-fence/metadata-only redesign remain deferred. These limitations do not block the authorized exact repairs.
