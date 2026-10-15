# October 15 completed full-run festival shadow test

## Decision

**Keep automatic publication OFF.** The framework ran against today's new,
proven-complete regular dataset. It produced zero eligible new links, explicit
holds/pending outcomes and three remaining evidence gaps. This is a completed
audit of an incomplete linking candidate set, not a successful rollout.
The accepted Anchor event's eight points and seventeen manually verified
child links remain intact. No frontend/OTA, public event/review/venue/media
mutation or parser replay was performed by the shadow test.

## Inputs and execution

Dataset `1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit`, run
`d65bfa80-4e89-458d-9bf1-03a2e6371756`, completed13:57:45 UTC. Completed lock,
marker,final372/372 batch and absent checkpoint gate passed before paid work.

Fresh reviewed registry: one Anchor2026 edition, eight verified venue IDs,
explicit first-party programme binding and no unknown registry entries.
The runner inspected144 unique saved source snapshots and253 canonical event
records in the edition date window. Seven candidate posts received source
capture, in bounded3/3/1 invocations. Venue/date proximity triggers inspection
only; it does not establish festival membership.

| Source / row | Source gallery | Result |
|---|---:|---|
|1564814712352727 /21, Downtown|1|8 transcribed festival-named activities,2 row-scope holds|
|1649327733870808 /181, City Cinema|3|A Long Winter membership caption; clock/year/venue context incomplete|
|1648311017305813 /182, City Cinema|1|No qualifying explicit festival activity captured|
|1648299067307008 /183, City Cinema|1|No qualifying explicit festival activity captured|
|1512241067607930 /338, Confederation Centre|3|Source-completeness failure retained; not retried|
|1561342776030307 /307, PetSmart|1|No qualifying festival activity captured|
|1434266702222333 /178, library service|3|No qualifying explicit festival activity captured|

All source captions and ordered galleries were submitted without truncating
the original lists. No selected gallery has more than four images in this
candidate set; the historical Tivoli five-image control remains separately
documented and must not be described as newly exercised today.

Six captures complete, one remains source-incomplete. Candidate capture errors
are not automatically production parser errors or missed festival events.
Zero activities from unrelated source captures do not authorize any deletion.

## Matching outcome and adjudication

Nine transcribed activity claims: two unconfirmed repeated conference rows,
seven matcher outcomes. Zero eligible links; five held outcomes and two pending
missing-child outcomes. The three capture gaps are the source-incomplete post
plus the two conference row scopes. No source remains unattempted after the
bounded final batch; no repeated retry of cached errors was performed.

- Three exact legacy candidates lack the new source-ID ownership proof:
  Trailside `J1TauchdK3akdCxHuasT`, Guild `mgXvpu5EB2N7eqnyeHa3`, and the new
  Pressure Points21:00 candidate `VtmHIyg7T7V4Tb0sC3Fo`. A source-ID-looking
  uniqueId prefix is deliberately insufficient. The last is independently a
  source conflict against the official18:00 programme; **do not weaken ownership
  checks to approve it**.
- Beer Garden's unverified/conflicting venue identity remains held. It must
  not be invented or assigned from nearby venue coordinates.
- Two missing exact canonical matches remain pending, not newly created.
  Title-prefix/director/programme and source-clock differences need explicit
  source-grounded reconciliation, not broad fuzzy equivalence.
- City Cinema's A Long Winter caption establishes membership but does not
  supply all required clock/year/venue evidence in its captured scope. Its
  existing manually linked canonical activity remains; this shadow hold is
  not proof that the live film is absent.
- The conference row text repeats verbatim under October15 and16. The current
  caption-scope expander refuses ambiguous identical row text, even though an
  independent model finds both dated headings plausible. Model agreement must
  not override that deterministic hold. Future evidence should pin literal
  date-header positions plus row occurrences, not concatenate invented text.

Existing human decisions are protected. The test proposes no additions or
removals, and no source/venue backfill was silently written to make counts pass.

## Cost, caching and durable execution

Nine new paid Responses calls, including independent verification where
activity claims existed. API-reported totals:18,112 input,18,085 cache-write,
zero cached-read,11,199 output,7,012 reasoning tokens; summed paid API time
136.946 seconds. Estimated local standard USD token cost **$0.007863**,
separate from the production parse's$0.412348. No cached-write input was charged
twice. Model response retrieval/offline playback is not additional generation.

The only remote mutations were claims/results in one deterministic
`festival_link_shadow_jobs` dataset document. Three bounded claims completed
held. Unit controls for worker generations,stale commit rejection,lease expiry,
input fingerprints,monotonic completion and missing-child later arrival remain
the previously validated eight job tests and forty-one matcher tests.
Real-world stale-worker takeover was not forced in this audit.

A fourth **local-only** pass reused all source captures with max-sources0,
no API key and no persisted job claim. It reproduced the same input fingerprint,
outcomes and gaps with zero new paid calls and zero public writes. This is
cache/idempotence evidence, not new API quality or latency evidence.

## Next implementation work

1. Retain unambiguous literal row positions/date-heading scope, including
   repeated identical activities on different dates. Preserve negative controls
   for cross-card/year/clock contamination.
2. Preserve original shared image venue/edition/date headings as explicit
   evidence documents. Do not manufacture quotes from Stage3 summaries.
3. Persist verified canonical source provenance through normal duplicate/link
   paths. Historical backfill is a separately guarded exact repair; a uniqueId
   prefix alone must not grant authority. Also reject known occurrence conflicts
   before a weaker source's newly created matching record can qualify.
4. Test the complete source/canonical inventory again. Only then implement the
   separate machine-publication path with pinned references/revisions, durable
   worker fencing,idempotent updates and protected manual decisions. It must
   not manufacture human approval records. No such public writer is deployed.

Artifacts: `functions/artifacts/festival-linker-oct15/oct15-registry.json` and
`functions/artifacts/festival-linker-oct15/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit-shadow/`:
completion,raw evidence/cache/report,coverage and usage summaries,paid-batch3
report and `cache-replay-verified.json`.

## Follow-up decision review requested by Craig

Rechecked the saved October 15 captions, captured activity evidence, canonical
records and exact matcher outcomes. This is adjudication of the completed run,
not a new production parse or an additional paid model experiment.

| Activity | Source/canonical comparison | Decision |
|---|---|---|
| Guild conference, October 15 and 16 | Two literal identical rows beneath different dated headings; both canonical occurrences exist | Current capture hold is overly conservative. Retain document offsets and governing heading per occurrence, then retest both dates independently. |
| Trailside Captains + Nick; Guild Britt Campbell comedy | Exact named, dated, timed venue matches exist; both are already manually linked | Membership evidence is useful, but the new source-ownership contract is unsatisfied. Preserve existing links and fix durable provenance through the normal write/merge path; do not infer authorization from uniqueId prefixes. |
| Jim Queen | Aggregator 21:00; saved first-party canonical 21:30 | Correct to withhold an automatic link to a different occurrence time. This is not a missing film. |
| Pressure Points | Aggregator and new copy 21:00; saved first-party canonical 18:00 | Hold is necessary, but its current missing-ownership reason is not a sufficient conflict safeguard. A future provenance fix must still reject the conflicting copy. |
| L'Autre (The Other) | Canonical exists at the same venue/date/20:00, but the activity title includes an extra ANCHOR Fest prefix | Pending exact match is not a missing live screening. Test a narrowly evidenced programme-prefix/alias rule; do not add a duplicate or use broad fuzzy matching. |
| A Long Winter | Caption explicitly says ANCHOR Fest presents the film and has an exact ticket URL; source omits year/clock/venue; a same-day 19:00 canonical exists | Evidence supports membership, but current matcher cannot establish the full occurrence identity. Test exact ticket identity and separately verified canonical scheduling rather than borrowing clocks from unrelated text. |
| Beer Garden | Venue identity still unverified/conflicting | Keep held until the location workflow verifies the venue. |
| Other candidate posts | PetSmart/library sources do not explicitly establish Anchor membership; two cinema posts show branding without an activity; one capture is incomplete | No automatic links justified from these captures. Do not equate a source-capture gap with a confirmed missing festival event. |

The Arts Mixer classifier correction separately passes venue routing while real
multi-venue festivals remain unordered area points. This does not establish
that the wider publication pipeline preserves every spatial classification:
the October 15 all-PEI A&W offer, bike-bus route and online sessions still show
downstream scope loss; the Kensington multi-site activity disappears without
clocks. Those need separate publication-path hardening.

Reran the two compiled spatial suites, festival matcher/job suites and source
extractor suite: **99 passed, zero failed/skipped**. These controls do not turn
the zero-link real-source shadow into a rollout pass. No fresh paid calls,
public writes, production replays or deployments were performed in this review.
Automatic linking remains unfinished and OFF.
