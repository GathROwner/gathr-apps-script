# Inn corrections and automatic festival linking — one approval batch

Status: **prepared; no live changes or deployment applied by this plan.**

## Short decision

1. Preserve the Inn's two genuine weekly tours, finish their advertised season
   on October 10 and clear their invented finish times. Keep the verified 16:00 starts.
2. Remove the separate October 16 15:00–21:00 foraging card. Its caption and
   independently viewed poster say **morning**, with no exact start. Retain a
   private recovery hold; do not publish an invented morning clock.
3. Bootstrap the festival worker with six validated historical captures and
   one exact reviewed nonmembership decision for **Soft Internet Theory**.
   This excludes only festival membership, not the exhibition from GathR.
4. Release the separate bounded festival worker in shadow mode, verify its
   first result, then enable source-verified additions only if the gates below
   still pass. All 17 existing manual Anchor links remain protected.

The event-integrity repair skill requires this exact live-target approval.
This single approval covers the listed corrections, private bootstrap and
conditional narrow releases. Unexpected source/target/configuration drift aborts.

## Exact public and venue targets

All three listings are under `venues/fb_100063617721610/events/`:

| ID | Action |
|---|---|
| `5vX5hheEeQZvGWW2MktD` | Forager Tour: preserve weekly Saturday/16:00/ID/media; set recurrenceUntilDate 2026-10-10; clear unadvertised 23:00 finish; correct end-time evidence |
| `BI5tR0hAivbQzolfh1La` | Sunday Farm Tour: preserve weekly Sunday/16:00/ID/media; set recurrenceUntilDate 2026-10-10 (last Sunday October 4); clear unadvertised 17:00 finish; correct end-time evidence |
| `Xl1BWOTyBytkqqD9tQsL` | Delete only the false October 16 15:00–21:00 standalone guided-foraging representation |

Additional exact targets:

- `venues/fb_100063617721610`: add only `reviewedOccurrenceConstraints`.
  Existing Harvest retirement policy, venue fields and profile stay unchanged.
- `parser_integrity_holds/inn_guest_foraging_1693177699479471`: create private
  hold preserving the removed original event, exact source and missing-time reason.
- `runtime_metadata/event_feed`: 267 → 268, plus timestamp, atomically with repair.

All 12 corrected Harvest evenings, all media and every other venue/event stay
unchanged. Full source/target/venue/sibling backups and version guards are in:

- `firebase/artifacts/inn-legacy-oct15/backup-2026-10-16T01-08-56-546Z.json`
- `firebase/artifacts/inn-legacy-oct15/plan-2026-10-16T01-08-56-546Z.json`

Official evidence: [Inn FAQ](https://innatbayfortune.com/faqs-2/),
[Harvest programme](https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/).
All eight retained managed gallery images returned 200 and were viewed. The
original snapshots supplied five URLs each; four retained images per post do
not imply that all ten original CDN images are still available.

## Parser prevention and release

Coordinator guard commit `19cded8`; isolated release `372be0c` on
`codex/inn-season-guard-20261015` in the existing `arts-mixer-release` checkout.
Baseline `ac0e59b` is independently serving at source hash
`8073c2d8a8520e8362a71df53c76b718751fabfb`, all three ACTIVE/100% latest.

Only four files change: `reviewedOccurrenceConstraints.ts`, its focused test,
the `VenueData` field and the early duplicate-selection guard. Exact reviewed
identities hold before database lookup; new source IDs and other activities
remain eligible. An old unbounded tour cannot lengthen the reviewed season,
and the exact false-clock guest card cannot recreate itself. This is bounded
historical replay protection, not a claim that every future lodging caption
has been exhaustively tested. Existing stage and website clock safeguards remain.

Release gates: idle lock → committed baseline/diff → build/full suite → qualified
three-parser dry run → narrow deploy → independent ACTIVE/traffic/hash/full
configuration readback → approved data transaction. All model, prompt, cache,
effort, allocation and global date-only settings remain unchanged.

## Festival private bootstrap

Exact seven create paths, payloads, source fingerprints and authority versions:

`functions/artifacts/festival-linker-oct15/seed-plan-2026-10-16T01-19-51-395Z.json`.

- Six `festival_link_captures/<captureKey>` documents reuse validated original
  responses, preserving usage and historical/offline labels, without new paid calls.
- One `festival_link_source_decisions/<captureKey>` document accounts for source
  `1512241067607930` as the independently reviewed separate exhibition.

The decision is tied to its exact caption, ordered image URLs, source ID,
edition, evidence policy and capture key. It cannot exclude changed sources.
Its source capture remains incomplete; we do not relabel it complete or erase
the unreadable wall-text limitation. Revoking the decision fences publication.

The original unapproved live dry run remains **held** with one source gap. The
separate proposed-decision dry run is explicitly local-only, not an applied
approval. Existing four eligible links are already manual; today's public delta
is zero. Five clock/venue/provenance holds remain conservative outcomes.

## Automatic worker and limits

New function only: `scheduledFestivalLinker`, northeast1, five-minute quiet
backend schedule, one instance, 540-second invocation, ten-minute fenced lease.
It is an application worker, not a Codex heartbeat or user messaging schedule.

- Requires processed marker, completed matching lock/final batch and no checkpoint;
  skips any active parser. Reads the latest completed regular run only.
- Uses only already reviewed/published festival editions and verified existing points.
- At most one source capture per invocation, including independent verification;
  durable cached errors hold without automatic repeated API retries.
- Rechecks exact versions, canonical-query membership, source/review/venue/job
  ownership and active locks in the publication transaction.
- Adds only exact canonical children proved by original source evidence. Missing
  children can qualify after later arrival; location/date proximity cannot qualify.
- Never changes child events, creates venues, changes clocks or fakes human approval.
- Preserves manual links/point metadata. Human removals of machine links are sticky.
- Add-only first release: no automatic removals. Stale or conflicting children hold.
- Private source evidence/proofs never enter public descriptions or areaData.
- Feed marker changes only for a real public link addition.

Release assembly must start from the freshly verified serving baseline, preserve
unrelated source/configuration and include only the reviewed festival modules,
their extraction script and required pure area-reference/title helpers. Do not
deploy the coordinator checkout wholesale. Deploy only the new function; the
three parser functions remain at their separately verified guard release.

Activation gates: approved internal bootstrap → isolated committed build/tests
→ new-function-only dry run/deploy with `FESTIVAL_LINKER_MODE=shadow` → fresh
live worker result with zero unreviewed capture gaps, four existing links and
all 17 manual links preserved → enable **only that function** to `publish`.
If the result drifts, remain shadow/off and report; this approval does not
authorize inventing provenance, clocks, venues or festival membership.

Coverage is source-contract-specific. Shared image-only programme headings,
missing original galleries, absent source ownership and conflicting official
clocks are still explicit holds, not universal automatic-linking coverage.
No mobile release is required; the accepted app already consumes these links.

## Verification after approval

- Exact changed document fields and 12 unchanged Harvest siblings; private hold;
  retained source image hashes and 200 responses.
- All three original detail endpoints, complete capable/default/history feeds,
  recurrence materializations and marker 268; no guessed-time replacement.
- Seven exact private bootstrap documents; six source/edition/policy hashes;
  incomplete exhibition capture still recorded separately from the decision.
- First actual festival job/lease/cache/proof state, all 17 manual links, exact
  new additions if any, API details/full feed and source-grounded membership.
- Automatic publication stays off until conditional activation gates pass.

Tests and fresh reports are recorded in `docs/festival-linker-oct15-publication.md`.

Coordinator build,925 compiled tests and10 actual-worker controls passed.
The isolated Inn build,851 compiled tests and codebase-qualified three-parser
Firebase dry run passed. No real deployment occurred. The separate festival
release is committed as `1da0d91` in the managed `festival-publication-release`
checkout, based on exact guard release372be0c. Its model/prompt/configuration/
dependency source directories have zero diff from that baseline. It adds only
the reviewed worker, extractor/matcher dependencies, tests and default-strict
optional area-title helper. Only the new function is a festival deploy target.
