# October24 six-record data-only repair — applied and live verified

## Scope and status

The coordinator selected exactly six existing-record corrections from the completed October24 audit. This is a **new October24 packet**, not an October22/23 replay. **Corrected v2 applied at16:00:58.073820UTC /13:00:58Halifax after the36-check independent coordinator PASS. No deployment occurred.** The live parser baseline remains `af5d80435c14dd44cfa588fad1fabb3f8be9d306`, common hash `1adfb0a7af75586451bafc064461dca7ebd00af2`. Automatic-resolution/creation gates remain OFF.

Current v2 packet: `functions/artifacts/oct24-six-record-batch-v2/`. Original frozen packet and rejected execution receipts remain untouched under `functions/artifacts/oct24-six-record-batch/`. Frozen review entry point: `frozen-review-packet.json`. The new tracked helpers are under `firebase/`; no parser/runtime source changes or unchanged backend test suites.

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

`firebase/artifacts/oct24-six-record-batch-v2/preparation-backup-2026-10-24T15-57-20-982Z.json`

This contains the full typed capture and exact payload. `preparation-backup.json` records its hash. Apply will first save another full timestamped **fresh prewrite backup** after all transaction guards pass. Local apply-started and commit-response receipts prevent blind retries; an unknown outcome stops for reconciliation. A serving check is performed immediately before the transaction and must be younger than90seconds before commit.

Rollback shape passes: **seven writes**, restoring all six original typed event documents and advancing feed **401 → 402**. It retains all seven recovery archives. Pre-apply placeholder versions are explicitly non-executable; an after-apply read-only run must bind actual postcommit versions before rollback could be separately implemented/authorized. The rollback helper never commits. Recreated deleted documents receive new Firestore server create/update metadata; original server metadata remains recorded in archives.

## Independent review and completion gates

The freeze step records exact plan/payload/capture/source-evidence/helper/auth-helper/dry-run/rollback hashes and the committed helper revision. Apply defaults to a read-only transaction. `--apply` additionally requires the coordinator's independent PASS receipt matching every frozen hash, the exact packet hash, clean tracked helper checkout/commit, source/document/version/keeper/venue/feed/checkpoint guards and current accepted serving state. No review receipt is self-issued.

Completed read-only postflight checks all six exact canonical outcomes, seven complete typed archives, four protected records, six venues and all unchanged source siblings; ten exact public details (four404/six200); complete paginated active feed; all six affected venue feeds; feed401; idle/checkpoint/serving/gates; then actual-version seven-write rollback dry run without execution. No emulator/map or client release is involved.

Library relocation, monthly/finite-series changes, Soul Fit venue completion and broad publisher/postponement prevention remain deferred. **Withdrawals alone do not prevent next-run recreation.** Existing runtime tests/audit/media captures were reused; only the new repair helpers' syntax, payload invariants, fresh read-only guards and rollback shape were checked.

The coordinator inspected the exact v2 packet and issued the independent PASS, preserved byte-for-byte in v2 `independent-review.json`. Owner canonical/API/feed/rollback verification is complete; coordinator fresh live readback is the separate final independent check.


## Rejected first execution and corrected v2

The independently reviewed v1 commit request was rejected HTTP400 at15:55:22UTC. Seven archive `update.name` fields incorrectly contained HTTP endpoint URLs instead of Firestore `projects/.../documents/...` resource names. The specific server response body was not retained; static inspection establishes the invalid resource names. This was a helper wire-format defect, not target/source drift. No retry of v1 was made.

Fresh reconciliation at15:56:05UTC confirms all six original documents and server versions, four protected festival records, six venues, feed400, all82 source records and historical checkpoints unchanged; all seven planned archive paths absent. Thus known no execution is established. The failed apply marker, byte-for-byte independent receipt and full fresh prewrite backup `firebase/artifacts/oct24-six-record-batch/prewrite-backup-2026-10-24T15-55-22-448Z.json` remain intact. Its SHA256 is `4f0cd814ea132f2ee7676eef1512dd2880df6987115b69ddf04a1a54326f7018`. Reconciliation is `functions/artifacts/oct24-six-record-batch/repair-apply-rejected-reconciliation.json`.

V2 corrects only archive resource naming, adds local URL/segment/closed-path checks for all14 apply writes and all7 rollback writes, and uses a separate artifact/backup namespace. Event deltas and all seven typed archive snapshots are identical to v1; original/protected/source/venue/feed versions remain unchanged in a fresh capture. V2 read-only transaction and rollback shape pass. The new independent36-check receipt explicitly bound the prior rejection reconciliation and every v2 hash before the single corrected attempt. The original v1 PASS was superseded, not reused. No parser deployment or event scope change is included.

V2 plan SHA256: `f2094d67503355ea3c94f30473a0d84e6b4c8efac550b3610344d71dddbf2370`. V2 apply-helper SHA256: `1881fd0fce02843c1308a289a9f3a51993fd6c9a93d277c77b922e7edd3afd42`.

## Decisive completed execution receipts

- Atomic v2 commit: **2026-10-24T16:00:58.073820Z**, exactly14write results. Four withdrawals, two exact-field updates, seven complete typed archives; feed400→401. `repair-commit-response.json`, `repair-apply-result.json`, `repair-completion.json`.
- Fresh full prewrite backup: `C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/firebase/artifacts/oct24-six-record-batch-v2/prewrite-backup-2026-10-24T16-00-56-734Z.json`; SHA256 `3b33592c7d90cbdc2f6b239bf51e7b08b306f8957c3f0a7a5cc064d4ce606f14`. Original v1 failure/backup preserved unchanged.
- Ten exact public details pass: four withdrawals404, two updated originals200 and four proper festival records200. Cyrus originalOctober23 19:30 survives withisRecurringfalse/patternnone; no future copies remain in the active feed. U7October31 10:10–11:10 remains upcoming; absent description restored, other fields byte-equivalent.
- Complete public active-feed pagination: **11pages/1,000events**, nextPageToken exhausted; four withdrawals and expired Cyrus absent, upcomingU7 and all four festival controls present. All six affected venue feeds pass. Receipts: `repair-postflight-details.json`, `repair-postflight-active-feed.json`, `repair-postflight-venue-feeds.json`, `repair-live-postflight-result.json`.
- Seven typed archives exact. Four protected festival documents, six venue documents and **76unrelated source-sibling controls** unchanged in full fields and server versions. No contact, interaction, queue or media object writes.
- Actual postcommit-version rollback dry run passes: seven writes, restores six stored event originals, retains all seven archives and would advance401→402. **Not applied.** `repair-rollback-dry-run.json`.
- Fresh postflight serving remainsaf5d804/source1adfb0a7, all three ACTIVE/latest100%, environment hashes unchanged,gatesOFF. No active parser, historical checkpoints unchanged. No deployment/runtime change,paidcall,replay,new scrape,backend-suite repeat or emulator/map interaction.
- Larger prevention and deferred records remain open exactly as listed above. Withdrawing these copies does not prevent next-run recreation. Coordinator fresh live verification is pending after these owner receipts.
