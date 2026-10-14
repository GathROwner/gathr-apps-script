# October 14 venue-resolution guards — local implementation

Craig approved implementation and local testing of the three reviewed guards.
No production deployment, replay, venue creation or live-event mutation is
included. Branch: `codex/venue-resolution-guards-20261014`, based on accepted
commit `02ce812`, which contains all prior October14 parser and live-repair work.
The dirty main checkout was preserved.

## Source checks

Reviewed original captions, ordered source images, parse snapshots and logs for:

- APM Centre row266: the poster prints16 boys' evaluation sessions at APM Rink.
  Their stored dates and starts/ends agree with the original table, including
  the70-minute October23 U15 Group1 session17:10–18:20.
- APM Centre row267: the poster explicitly says Board Room, APM Centre,
  October15 at18:00. Its23:00 stored end is an existing inferred category
  fallback, not a printed finish. This location repair does not validate that
  inferred end as source-explicit or alter duration policy.
- Luka Hall row142: gallery image0 explicitly locates all three showcases
  in Hamilton, Ontario; image1 identifies the artist's New Glasgow, PEI origin.
  It does not establish a local occurrence. All three were queued, not written.
- Town of Souris row78: the poster and caption identify Connolly Park and
  Souris Town Hall. The town's official plan independently confirms Connolly
  Park in Souris. The saved road suggestion has Google type `route`.

Original local evidence: `functions/artifacts/luna-oct14-production-audit/`.
Approved location-owner backup/report remain in the main checkout's
`firebase/artifacts/location-queue-2026-10-14-{backup,report}.json`.
No production records or credentials are committed as fixtures.

## Implementation

1. `services/venueIdentity.ts` recognizes a full room/rink label through a
   verified stored alias or all distinctive parent-name tokens, corroborated
   by exact source-page identity or an exact event address. Short identifiers
   such as APM remain meaningful. Generic shared words and partial parent
   names do not qualify. Extra independent location tokens, contradictory
   addresses and relocation wording prevent the new shortcut.
   `processing/rowProcessor.ts` checks this before destructive room expansion
   and preserves an exact independently recorded sub-venue. Room wording
   remains in additionalLocation.
2. `services/eventIngestJurisdictions.ts` adds deterministic occurrence-local
   coverage checks, using existing configured ingest regions. Explicit event
   province/address/location labels and role-qualified event descriptions can
   stop out-of-region occurrences. Artist origins, ticket outlets, organizers
   and story settings are excluded. Conflicting event regions hold; missing
   evidence remains unknown. This is deliberately conservative, not a general
   natural-language geocoder. No prompt/model/config changes are introduced.
   The writer checks before lookup, queue creation or publication, and checks
   the resolved venue coordinates before any write. Unknown-review intake has
   the same defensive evidence check. Full5stage posts no longer queue a
   publisher as a venue before their actual event locations are extracted;
   unresolved event venues still queue normally. Legacy/source-submission
   discovery is preserved. Parse snapshots include locationCoverageHolds.
3. `services/unknownVenueResolver.ts` drops geographic-only Google candidates
   for named venues before details/website enrichment. A road is not a park
   match. Actual Places scores are preserved rather than raised to a0.70
   display floor. Existing verified-identity boosts and manual-review gates
   remain. This does not change Connolly Park's hold or create a venue.

## Verification

- TypeScript build passed.
- Focused suites:52 passed,0 failed.
- Complete compiled backend suite:706 passed,0 failed.
-28 new regression cases use synthetic source IDs, page URLs and addresses.
- Real captured local previews: all17 APM items resolve to the existing APM
  venue and retain their source dates, starts/ends, poster and room label.
  These are writer previews, not paid API re-extractions or publication.
- Captured comparison:360 available formatted items across October12–14.
  Only the three source-confirmed Hamilton showcases receive new region holds;
  no new coverage hold appears in the October12/13 captured cohorts.
  This measures saved formatted output, not every scraped/rejected post.
- Connolly Park remains an unresolved Souris identity; its saved road candidate
  fails the compatibility check. No park coordinates/address were invented.
- Integration controls prove each foreign occurrence stops before venue
  lookup, worker/write work or queue access. Direct unknown-intake calls also
  return before Firestore. Other tests protect mixed galleries, PEI city/area/
  route events, independent sub-venues, conflicting addresses and biography/
  ticketing/story context.

Evidence under `functions/artifacts/venue-resolution-oct14/`:
`build.txt`, `focused-tests.txt`, `full-tests.txt`, `captured-check.cjs`,
`captured-check.json`, `captured-check.txt`. Generated captured data stays local.

Commands, from functions:

```powershell
npm run build
node --test lib/services/venueIdentity.test.js lib/services/eventIngestJurisdictions.test.js lib/processing/rowProcessor.stageVenueResolution.test.js lib/processing/rowProcessor.venueQueuePolicy.test.js
$venueGuardTests = @(rg --files lib -g '*.test.js')
node --test @venueGuardTests
```

## Release / data boundary

Local implementation is complete. Deployment still needs approval and the
normal narrow release preflight, including the latest serving-source readback
and no active parse. The shared unknown resolver has its own serving baseline;
reconcile with its owner before deploying its function targets, rather than
releasing an older checkout over unrelated resolution fixes.

No migration is required. Preserve the manually added APM aliases and all
resolved/ignored queue statuses. No held items were published. Any recovery
of17 APM items requires a separate exact, source-checked approval (including
acknowledging the boardroom's inferred end). Connolly Park's verified venue
creation remains with the location-resolution owner. Rollback is a revert of
this isolated local change; no live data rollback is needed.
