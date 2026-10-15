# Harvest: one reviewed consolidation batch

Status: prepared and tested; exact grouped live approval pending. No Harvest
event, venue metadata, feed marker or serving parser was changed by preparation.

## Proposed result

Twelve printed Chefs’ Harvest evenings at The Inn at Bay Fortune:
October 15/16/17,22/23/24,29/30/31 and November 5/6/7,2026.
All run **17:00–21:30**, **$305 plus tax per person**, including service.
Preserve three event IDs, add nine missing dated one-offs, delete five
overlapping parents and install a narrow replay fence. This is one approval
covering the code release and the exact nineteen-document transaction below.

The official [programme](https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/)
lists all twelve dates, four chef themes, dining clocks and price. The
[FAQ](https://innatbayfortune.com/faqs-2/) confirms the 2026 year and
Thursday/Friday/Saturday schedule. The 15:00 accommodation check-in is separate
from dining. Following-morning breakfast/foraging is for overnight guests.
Experimental Workshop is a reception within the same evening admission.
It is not an additional 15:00 event or an indefinite Sunday series.

## Exact event targets

All event paths below are under `venues/fb_100063617721610/events/`.
The full paths, payloads, patches, original versions and sibling/source data
are frozen in the linked local plan and backup.

| Action | Event ID | Advertised date / reason |
|---|---|---|
| Update keeper | `L5dAjm7VnQOOCMMze25W` | Oct15, Foraged Seven with Nick of North; keep correct clock, add programme price/link/source facts |
| Update keeper | `dQu2rri6uhLZ26JCE3bV` | Oct16, same opening theme; replace incorrect15:00–17:00 and wrong November primary poster |
| Update keeper | `e24xrgAQkIvU8fzXRcKD` | Oct17, same opening theme; same corrections |
| Create | `harvest_20261015_20261022_1700` | Oct22, South American with Chef Matt Pigeon |
| Create | `harvest_20261015_20261023_1700` | Oct23, South American with Chef Matt Pigeon |
| Create | `harvest_20261015_20261024_1700` | Oct24, South American with Chef Matt Pigeon |
| Create | `harvest_20261015_20261029_1700` | Oct29, Italian with Sous Chef Mackenzie Brown |
| Create | `harvest_20261015_20261030_1700` | Oct30, Italian with Sous Chef Mackenzie Brown |
| Create | `harvest_20261015_20261031_1700` | Oct31, Italian with Sous Chef Mackenzie Brown |
| Create | `harvest_20261015_20261105_1700` | Nov5, 90’s Inn Chef with Chef Michael Smith |
| Create | `harvest_20261015_20261106_1700` | Nov6, 90’s Inn Chef with Chef Michael Smith |
| Create | `harvest_20261015_20261107_1700` | Nov7, 90’s Inn Chef with Chef Michael Smith |
| Delete copy | `Dyji8HO9xPPeK7NHqLxZ` | Experimental Workshop parent, false15:00 clock and repeated component |
| Delete copy | `UBEBhqRCWGZiOcxcx1Ut` | Generic four-weekend parent overlaps dated programme |
| Delete copy | `USWHrsFHSqiYEEwysdue` | Generic programme, false Sept13 start / indefinite Sundays |
| Delete copy | `WxmxNCWEA4QmC5rkrezM` | Old Oct15 generic parent duplicates retained Oct15 keeper |
| Delete copy | `j8zJSMk065zZvbIbd1d4` | Generic fall-series parent overlaps dated programme |

Additional exact metadata targets:

- `venues/fb_100063617721610`: add only `reviewedOccurrenceRetirements`
  and updatedAt. Venue name, address, coordinates, profile and other fields
  remain unchanged.
- `runtime_metadata/event_feed`: version265→266 and updatedAt.

Keeper IDs, stored uniqueIds, original creation timestamps, social counts,
address/category fields and existing media are preserved. All twelve cards
use the current programme poster as primary. The Oct16/17 old primary was
independently viewed: it advertises Michael Smith / November5–7, so it cannot
remain the opening-weekend primary. Existing gallery files are retained;
no Storage objects are deleted or uploaded. New events do not copy another
occurrence’s social counts or creation/update timestamps.

Separate existing foraging/farm-tour records
`5vX5hheEeQZvGWW2MktD`, `BI5tR0hAivbQzolfh1La` and
`Xl1BWOTyBytkqqD9tQsL` are guarded unchanged. Their summer horizons and
morning-session timing are separate source-review observations.

## Backup and exact dry run

- Plan: `firebase/artifacts/harvest-series-oct15/plan-2026-10-15T22-32-33-869Z.json`.
- Full backup: same directory, `backup-2026-10-15T22-32-33-869Z.json`.
- Original ten source snapshots and eleven venue events:
  `functions/artifacts/oct15-sequential-repairs/next-batch/harvest-source-and-siblings.json`.
- Official HTML captures, reviewed poster bytes/hash and twelve media200
  checks are retained with the backup. No credentials are copied or logged.

Dry run verified 32 guarded references, eleven related existing events,
three keeper updates, nine creates, five deletes, one venue-policy update
and one marker update; **zero live writes**. A fresh complete prewrite backup
is mandatory. A changed target/source/venue/sibling/marker/poster or failed
official date/time/price check aborts rather than broadening the batch.
The transaction also rereads all locks and references before writing.

Default-dry helper: `firebase/repair-harvest-series-oct15.mjs`.
Pure exact specification: `firebase/harvest-oct15-spec.mjs`.
The apply command requires `--apply --plan=<the reviewed plan>`, the existing
main-checkout service-account path and a newly independently verified serving
hash. It refuses the unrepaired serving hash. No model calls, parser replay,
queue changes, map use, venue creation or automatic festival publication.

## Narrow prevention release

Candidate **6c5c46f**, branch `codex/harvest-retirement-20261015`, isolated
`C:\Users\craig\.codex\worktrees\arts-mixer-release\gathr-apps-script`.
Parent is exactly serving4c8d111. Only these runtime/test files change:

- `functions/src/services/reviewedOccurrenceRetirement.ts`
- `functions/src/services/reviewedOccurrenceRetirement.test.ts`
- `functions/src/services/firestoreService.ts`
- `functions/src/processing/rowProcessor.ts`
- `functions/src/types/index.ts`

Both parser write paths pass their already loaded venue into duplicate
checking. The guard suppresses only exact reviewed source/occurrence identities
without selecting a mutable keeper, so an old false parent cannot backdate,
retitle or repaint the canonical programme. The venue policy contains the five
legacy IDs plus current-generator reconstructions of their exact historical
facts: twelve distinct identities in total. Other activities from those posts
remain eligible. Malformed reviewed policy fails closed.

There are **no new Firestore lookups, caches or model requests** in the guard.
No prompt, model, allocation, reasoning, cache-layout, compact-response,
resume or other serving configuration changes. Coordinator-only festival
shadow additions are excluded. The separate shared-event promotion endpoint
is not redeployed by this parser-only release.

This is exact retired-identity protection, not a promise that all future
wording/date changes or new posts deduplicate perfectly. Current Stage3
extracted ten items; two opening-weekend dates already have retained records.
Some themed children still miss the website clock because enrichment matches
the whole title too strictly. This batch supplies independently verified clocks;
that enrichment limitation and the next full-run quality audit remain open.

## Validation and release gates

- TypeScript build passed.
- Eighteen focused tests passed, including the actual duplicate-service call
  without an initialized Admin database; it stops before any query.
- **832/832 full compiled backend tests passed.**
- `firebase/playback-harvest-oct15-readonly.mjs` passed: twelve canonical dates,
  nine current-generator create identities, all twelve legacy/reconstructed
  retirement checks through the actual duplicate service, twelve future-merge
  clock checks, three unrelated venue activities and five same-post healthy
  controls. No paid calls or network calls in playback.
- Qualified three-parser deployment dry-run evidence is in
  `functions/artifacts/oct15-sequential-repairs/next-batch/harvest-deploy-dry-run.txt`;
  it passed. Firebase reported the already known outdated `firebase-functions`
  package warning; no SDK/dependency upgrade is part of this release.

At22:30UTC all three parsers were independently ACTIVE/100%latest traffic at
hash`de8b283b5d93c7a569dc8bec95b4448fce196d73`, revisions00489-neb/
00453-vah/00445-ven. No active lock, completed October15 marker, final batch
completed and no checkpoint. Refresh this preflight immediately before release.

After approval: release only the three codebase-qualified parser targets;
independently verify common new hash, ACTIVE,100%latest traffic and identical
full function/runtime/environment/secret-binding fingerprints. Then apply
the exact transaction. Never deploy from the coordinator checkout.

Independent verifier `firebase/verify-harvest-series-oct15-readonly.mjs` is
prepared to check the exact nineteen-document delta, unchanged source/venue
fields and three other activities, twelve correct detail records, five404s,
complete active/history feeds without retired generated occurrences, one card
per advertised date, marker266 and all twelve retained images200. Active counts
respect elapsed Halifax dates; expiry alone is not an omission. Live verification
is **pending**, not implied by local playback or passing tests.
