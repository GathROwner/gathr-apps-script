# October24 six-record data-only repair — prepared for independent review

## Scope and status

The coordinator selected exactly six existing-record corrections from the completed October24 audit. This is a **new October24 packet**, not an October22/23 replay. **Nothing is applied and no deployment is selected.** The live parser baseline remains `af5d80435c14dd44cfa588fad1fabb3f8be9d306`, common hash `1adfb0a7af75586451bafc064461dca7ebd00af2`. Automatic-resolution/creation gates remain OFF.

Local packet: `functions/artifacts/oct24-six-record-batch/`. Review entry point after freeze: `frozen-review-packet.json`. The new tracked helpers are under `firebase/`; no parser/runtime source changes or unchanged backend test suites.

## Exact event delta

| Target | Action |
| --- | --- |
| `venues/slug_exploresummerside/events/2keLVPPhiuAKJhG7TxIE` | Archive and withdraw Halloween Storytime wrong-publisher duplicate. |
| `venues/slug_exploresummerside/events/HEITPkLJY5IXxfdH3pWL` | Archive and withdraw Little Chefs and Pumpkins wrong-publisher duplicate. |
| `venues/slug_exploresummerside/events/Us7PRw49hcAglw5UQ6ak` | Archive and withdraw BAIE in Concert wrong-publisher duplicate. |
| `venues/slug_centralcoastalpei/events/sTy6hOqvqdwXmFMx1lN4` | Archive and withdraw Wicked Spirits unsupported publisher location/midnight session. No guessed relocation. |
| `venues/slug_harbourfronttheatre/events/rJGyg5P64BZhfzpUHmRt` | Change **only** `isRecurring: "Yes" → "No"` and `recurringPattern: "daily" → "none"`. Preserve original October23 19:30 occurrence, default end flags, source/media/provenance and every other field. |
| `venues/slug_easternkingssportsplex/events/IxudtQq6NXuCm7npZ6LF` | Delete **only** the `description` field containing the unrelated U9 timing diagnostic. Original supported U7 description was absent (Stage3/4/final empty); restore that absence. Preserve October31 10:10–11:10, title, media/source/provenance and every other field. No U9 time change. |

Both updated events retain their existing stored `updatedAt` field because the selected scope permits only the exact fields above. Firestore server updateTime changes on commit and the feed version invalidates client data. U7's family-content hash is intentionally preserved under description-only scope; normal future scoring may recompute it. No invented replacement description is published.

Cyrus has `sourceOccurrenceCount:1`, which is preserved, and no additional recurring days/sequence/interval/count/horizon/source/original-parent fields in the captured record. Global source and unique-ID queries find exactly one persisted Cyrus record, the selected parent. Its future repetitions are materialized from the daily flags; postflight requires the now-expired October23 one-off and all ID-linked future copies absent from the complete active feed. Any new lifecycle field or additional persisted source sibling aborts.

## Protected records and fresh evidence

Full typed originals, create/update versions and all source identities are frozen for six targets; full protected documents and six venue documents are also frozen. The four protected festival records are:

- `events/local_pumpkin_2026`
- `venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13` — October31 10:00–12:30.
- `venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9` — October28 17:00–20:00.
- `venues/slug_centrebellealliance/events/oct14_repair_festival_20261024_6` — October24 18:30–20:30.

All event/venue fields, interaction counts and protected server versions must remain unchanged. No helper writes interaction subcollections, contacts, venue documents, queues, checkpoints or media objects; event deletions do not delete subcollections or media. Twenty-five bounded global queries cover primary/secondary source IDs, source-root unique-ID prefixes and exact unique IDs, capturing **82 related records**. Future apply rechecks query membership and full typed versions inside its transaction. Protected records with legacy missing source IDs remain directly fenced; no provenance is backfilled.

Fresh preparation readback confirms all three parsers ACTIVE/latest100%, accepted revisions `processdataset-00512-wid`, `processdatasetresume-00476-zur`, `processdatasetselectedrows-00468-xak`, matching baseline environment hashes, gates false/allowlist absent. No active parser; three historical checkpoints unchanged; zero alternate processing checkpoints. The read-only transaction dry run passed against all document/query/checkpoint/archive-absence guards. It creates no production writes.

## Write count, backup and rollback

**14 atomic writes** = six full typed event archives + four event deletes + two event updates + one full typed feed archive + one feed update **400 → 401**. Seven archives use create-only preconditions. Every event/feed mutation uses the exact captured updateTime. All unrelated fields survive byte-equivalent canonical Firestore JSON normalization (empty arrays/maps and zero timestamp fractions); no synthesized server-timestamp sentinel enters a public document.

Preparation backup (not an apply receipt):

`firebase/artifacts/oct24-six-record-batch/preparation-backup-2026-10-24T15-49-44-129Z.json`

This contains the full typed capture and exact payload. `preparation-backup.json` records its hash. Apply will first save another full timestamped **fresh prewrite backup** after all transaction guards pass. Local apply-started and commit-response receipts prevent blind retries; an unknown outcome stops for reconciliation. A serving check is performed immediately before the transaction and must be younger than90seconds before commit.

Rollback shape passes: **seven writes**, restoring all six original typed event documents and advancing feed **401 → 402**. It retains all seven recovery archives. Pre-apply placeholder versions are explicitly non-executable; an after-apply read-only run must bind actual postcommit versions before rollback could be separately implemented/authorized. The rollback helper never commits. Recreated deleted documents receive new Firestore server create/update metadata; original server metadata remains recorded in archives.

## Independent review and completion gates

The freeze step records exact plan/payload/capture/source-evidence/helper/auth-helper/dry-run/rollback hashes and the committed helper revision. Apply defaults to a read-only transaction. `--apply` additionally requires the coordinator's independent PASS receipt matching every frozen hash, the exact packet hash, clean tracked helper checkout/commit, source/document/version/keeper/venue/feed/checkpoint guards and current accepted serving state. No review receipt is self-issued.

After apply, read-only postflight must check all six exact canonical outcomes, seven complete typed archives, four protected records, six venues and all unchanged source siblings; ten exact public details (four404/six200); complete paginated active feed; all six affected venue feeds; feed401; idle/checkpoint/serving/gates; then actual-version seven-write rollback dry run without execution. No emulator/map or client release is involved.

Library relocation, monthly/finite-series changes, Soul Fit venue completion and broad publisher/postponement prevention remain deferred. **Withdrawals alone do not prevent next-run recreation.** Existing runtime tests/audit/media captures were reused; only the new repair helpers' syntax, payload invariants, fresh read-only guards and rollback shape were checked.

The coordinator must inspect `frozen-review-packet.json` before apply. This document records readiness for review, not completion of the live repair.

Frozen plan SHA256: `4cb1d914a94aaef25b8cbb2633646350837afc3d2ae7f07104f93bb690ec8bfb`. Apply-helper SHA256: `6288647da9e7e2e0dc9f0024fada8bd758607743b67f79cf4de28eb92bdd7deb`. The packet binds all other helper, source, baseline, payload and check receipts.
