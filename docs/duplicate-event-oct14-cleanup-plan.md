# October 14 duplicate cleanup approval plan

Prepared after inspecting original posters and the official Souris show page. No cleanup has been applied. Exactly seven duplicate documents would be deleted, six approved root keepers retained and linked to all known sources. Only the two empty SoulCave keeper images gain their original managed poster; both keep unknown finish times. Other keeper titles/clocks/venues/images remain unchanged. All media files remain.

Official show source: [Two Pianos](https://www.sourisshowhall.com/shows/two-pianos,-no-rodeo). Source poster captures and exact planned field deltas are local under functions/artifacts/dedup-oct14/.

## Barktoberfest

Keep: `events/location_d7292c941e3f11df913f0bd8`

Original poster confirms October25 noon–2 at Anne Chocolates15MilkyWay.

Delete only:

- `venues/slug_anneofgreengableschocolatesmilkyway/events/cityrecovered_3a02256ea2b4f400e62c2dc6`
- `venues/slug_anneofgreengableschocolatesmilkyway/events/cityrecovered_eff63944185c5f241d559a0a`

## SoulCave Box Fit

Keep: `events/location_c10f7b1aef7167f167281c72`

Original October calendar confirms Oct24 09:30 BoxFit. No printed end; preserve approved keeper unknown end and add the original poster.

Delete only:

- `venues/slug_soulfitpei/events/4zWs98Zyuc0FTSUa9TDt`

## SoulCave Box Fit

Keep: `events/location_ce94aea496625652b8e0e260`

Original October calendar confirms Oct31 09:30 BoxFit. No printed end; preserve approved keeper unknown end and add the original poster.

Delete only:

- `venues/slug_soulfitpei/events/Pj3vM2yI9ccyBmCUdRlw`

## Two Pianos, No Rodeo: Bob Wiseman and Mike Boguski

Keep: `events/location_6113f49ab46fd8e8731a06c8`

Official show page confirms October24 19:30 and identical show/ticket URL. Preserve approved keeper; child23:00 is flagged category-default.

Delete only:

- `venues/slug_sourisshowhall/events/dWiTlkUDO2X7MzJ3uVWK`

## Mix & Mingle with Charlottetown’s Mayoral Candidates

Keep: `events/location_e6d499b424052528b5ddfb05`

Original UPEISU poster confirms October19 19–21 at Fox&Crow.

Delete only:

- `venues/fb_100052099464909/events/J6dKfINcR8jN49Xa8gBP`

## arts mixers

Keep: `events/location_4a23fba2153afb4b591c2675`

First-party ArtsMixers poster explicitly prints October15 MavorsLounge4–7p.m.; child18:00 is an inferred duration-default, not a second session.

Delete only:

- `venues/slug_confedcentre/events/tzoUblUahp59XP7sgK6H`

## Apply boundary

Exact live approval is still required. Default-dry helper must reread all13 paths, validate source/date/start fingerprints, snapshot update times and related venue/date siblings, save full backup, abort on drift or active parse, then commit only the approved delta atomically. Verify all paths, every keeper and deleted ID through details and the paginated app feed.

Helper `firebase/repair-oct14-confirmed-duplicates.mjs` has passed its fresh
default dry run with zero writes. Exact machine plan:
`functions/artifacts/dedup-oct14/cleanup-plan-2026-10-14T19-13-38-179Z.json`.
Full backup:
`functions/artifacts/dedup-oct14/cleanup-backup-2026-10-14T19-13-38-179Z.json`.
It pins the reviewed target-file hash, all13 target versions/content hashes
and venue/date sibling hash. Apply requires this saved plan and aborts on drift.

Older recurring families, stale Watercolour, Ann Cleeves venue disagreement, Back in Black and Ireland clock conflicts remain outside this batch. No automatic deletion of all34 audit pairs.

## Completed approved cleanup

Craig approved finishing the duplicate work in the coordinator on October14,
turn `01a13cbe-d1e9-7f21-a0b6-9643d84aba18`. The fresh dry run matched the
original reviewed13 target versions/content and related-sibling hash exactly.
No active parser existed. At23:29:17 UTC, the guarded helper atomically deleted
the seven listed copies and applied only the six listed keeper patches.

- Immediate full backup: `functions/artifacts/dedup-oct14/cleanup-backup-2026-10-14T23-29-17-740Z.json`.
- Apply result: `functions/artifacts/dedup-oct14/cleanup-result-2026-10-14T23-29-17-740Z.json`.
- Independent verification: `functions/artifacts/dedup-oct14/cleanup-api-verified.json`.

At23:29:58 UTC, all seven deleted details return404 and all six keeper details
return200. Every keeper appears exactly once in the956-event active feed across
10 fully paginated pages; no deleted parent or generated occurrence appears.
Full document comparison verifies only the approved keeper patches/updatedAt
changed. Five untargeted related siblings are unchanged. All21 referenced
managed image URLs return200. No venue, media, or review queue was changed.

The Be You and Daisy prevention/approved cleanups are also complete in their
separate release records. Unresolved renamed-series/source-clock/venue conflicts
remain explicitly held; this completion does not authorize speculative merging.
