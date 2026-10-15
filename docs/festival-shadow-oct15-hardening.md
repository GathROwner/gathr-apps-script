# October 15 festival shadow: literal occurrence binding and authority

Automatic publication remains **OFF and unimplemented**. This change improves
shadow evidence and conflict detection. It makes no event, venue, review, queue,
media or shadow-job writes, makes no paid API calls and deploys nothing.

Worktree: `C:\Users\craig\.codex\worktrees\festival-linker-shadow\gathr-apps-script`,
branch `codex/festival-linker-shadow`, accepted matcher baseline `f226e7c`.
Commit `29db867` imports the coordinator's four already-accepted shadow tooling
files unchanged so the subsequent fix is a minimal diff against those files.
The coordinator already has that tooling: integrate the **subsequent hardening
commit**, not the import commit. The coordinator and release checkouts were
read-only throughout.

**Literal occurrence scope.** `festivalCaptionScope.ts` finds every literal
caption-row occurrence, then selects exactly one with the claimed governing
date heading. Identical conference rows beneath October15 and16 now have
different original document/heading/row offsets. Two identical rows beneath
the same date remain ambiguous. Positions are UTF-16 offsets, including emoji
and CRLF; they are never guessed byte offsets or synthesized quoted text.

The matcher receives the original `source.documents` and `captionScope`. It
checks the full source text against the document list, exact substrings and
line boundaries, and the nearest governing date heading. It rejects swapped
offsets, another document/card, another row's clock/venue, conflicting printed
year/weekday and a header whose actual date differs from the claimed occurrence.
Yearless heading interpretation uses only the already-bound edition year.
Legacy repeated-row evidence without offsets stays held. Private proposal
provenance retains the scope offsets and original documents.

**Narrow title identity.** Only the exact ANCHOR Fest prefix and leading
Short/Shorts Program/Programme spellings are normalized, along with the existing
punctuation/case/director-suffix rules. Remaining title words must agree. There
is no fuzzy matching, arbitrary subtitle removal, performer-name inference or
cross-festival alias. Original quoted title and canonical title remain separate
in the proposal. L'Autre at20:00 is recognized as an existing canonical screening,
not a missing child.

The shared reference validator has an explicit shadow-only alias opt-in.
Existing manual/public callers remain strict by default, verified by a negative
control. This does not implement or validate an automatic public writer.

**Authority precedes ownership.** The read-only registry bootstrap includes
previously reviewed official occurrence proofs from the existing published
review, restricted to its already-bound official source URLs. The matcher
revalidates the exact canonical path, identity, date, clock, venue and literal
proof against supplied snapshots. Missing/changed/inactive/noncanonical
references hold. A matching `sourceUniqueIds` value is ingestion ownership,
not scheduling authority.

The reviewed Pressure Points18:00 occurrence therefore blocks the21:00 copy
even if that wrong copy is supplied with exact source ownership. Without an
authority catalogue, conflicting sibling clocks conservatively hold rather
than selecting the matching bad copy. Two independently source-verified
showings may coexist. Jim Queen21:00 remains a conflict with the21:30 canonical.
The exact `sourceUniqueIds` requirement is unchanged; `uniqueId` prefixes and
matching publishers cannot satisfy it.

**Captured-source playback, not new API evidence.** Local playback uses the
seven saved October15 captures, all253 canonical records in the edition date
window, the cached original captions/galleries, and the exact cached reviewed
registry/review revision. It verifies the old matcher source against `f226e7c`
and reproduces the original result before applying the changes. Nine stored
Responses payloads are injected through a stub; there is no network generation
or Firestore access. Original confirmation responses are replayed, not new
independent model verification. New latency is null; no new API quality, latency
or cost claim is made.

| Outcome | Original | Hardened, no backfill |
|---|---:|---:|
| Eligible links |0|0|
| Held outcomes |5|9|
| Pending missing children |2|0|
| Capture gaps |3|1|

The two conference capture gaps are resolved by literal offsets; their missing
ownership now appears as explicit matcher holds. Jim Queen and L'Autre cease
being mislabeled missing films. Remaining holds: five ownership gaps (both
conference dates, Captains+Nick, Britt Campbell comedy, L'Autre), Jim Queen
clock conflict, Pressure Points authoritative clock conflict, Beer Garden's
unverified venue, and A Long Winter's incomplete occurrence facts. The single
capture gap is source `1512241067607930` marked source_incomplete. It was not
retried. Unrelated sources still yield no festival activities.

The validator policy hash changes to `caption-occurrence-offsets-v3`, invalidating
old derived scopes. Offline playback writes seven replacement cache entries
under new keys in this worktree's ignored evidence directory, preserving the
unreadable-source error. Original coordinator caches are unchanged. Build
before using the extractor, which imports the compiled pure scope helper.

**Exact read-only provenance proposal.** Four original October15 update audits
explicitly identify row21's source ID `1564814712352727`, incoming date/start,
canonical target path and before/after fields. They prove the source association
while also showing it was not appended to `sourceUniqueIds`. The original
caption provides each named festival activity beneath its literal date heading.
Only this single array-union field is proposed:

| Canonical target | Date/start |
|---|---|
|`venues/slug_trailsidemusichall/events/J1TauchdK3akdCxHuasT`|Oct15 20:00|
|`venues/slug_theguildpei/events/mgXvpu5EB2N7eqnyeHa3`|Oct15 21:00|
|`venues/slug_theguildpei/events/80rdBjhcuZ0U4udVx0a2`|Oct15 09:00|
|`venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo`|Oct16 20:00|

`provenance-backfill-proposal.json` contains exact audit paths, cached target
revisions/fingerprints, source excerpts/offsets and proposed deltas. It has no
apply operation and is not a fresh live dry run. Future application requires
fresh target/audit/source/sibling rereads, no-active-parse checks, full prewrite
backup, exact authorization and coordinator ownership. Do not change clocks,
titles, media or manual links as part of it.

The new Oct16 conference target
`venues/slug_theguildpei/events/K9PPYdCJcBg4KZn53nGu` has no corresponding update
audit; it remains held pending separately pinned creation/source provenance or
normal guarded re-ingestion. Its ID-looking prefix alone cannot authorize a
backfill. The21:00 Pressure Points copy is explicitly excluded. Applying the
four proposed deltas **in memory only** yields four eligible proposals
and still leaves five holds plus the capture gap. This is not rollout readiness.

**Publication gate.** Independently review/integrate the hardening commit;
refresh the read-only registry and canonical references; resolve approved
provenance, venue, clock and source-completeness gaps without invented facts;
retest the complete real-source inventory. Only after quality acceptance should
the separate public writer be implemented and validated with pinned reference
revisions, durable worker fencing, idempotence, protected manual decisions and
source-proof revalidation. No human approvals may be fabricated. Existing eight
Anchor points and17 manually verified links remain untouched.

Evidence is local under `functions/tmp/festival-shadow-hardening-oct15/`:
`playback.mjs`, `before.json`, `after.json`, `report.json`,
`registry-offline-reviewed-authorities.json`, `evidence/`,
`provenance-backfill-proposal.json`, focused/full test logs. These are private
source/data artifacts and are not committed. Final TypeScript build passed;
48 matcher,4 scope and10 extractor tests passed (62 focused total). All834
compiled backend tests passed, zero failed/skipped. The original823 backend
checks remain covered; the11 added compiled checks cover the new boundaries.
