# Area participation versus festival programmes — October 16

## Confirmed case

`events/oct15_kensington_skeleton_week` is one Kensington Skeleton Selfie
Hunt, October 14–18. Its three reviewed, unordered participating points are
Kensington Heritage Library, Ruby's Counter, and Island Stone Pub. They have
no separate `linkedEventIds`.

The October 14 library source, stable ID `1434266702222333`, shares the
Chamber's instructions to visit participating skeleton displays, take a
selfie, and tag the business and organizer. The library confirms its own
participation. No separate performances, classes, session clocks, or
business opening hours are established by this source.

Read-only API verification on October 16 confirmed that the original
description, unknown-clock multi-day timing, and all three points survive
inside `metadata.areaData`. The app already reads top-level or metadata
area data. Private evidence: `functions/artifacts/kensington-participation-oct16/api-before.json`.

## Cause and boundary

The frontend `AreaLocationBrowser` labeled all area points as festival
locations and always displayed a linked programme section. This wrongly
suggested missing scheduled events for a participation activity.

The existing backend contract correctly permits reviewed area points with
no child event links. `areaEventPublication.ts` validates those points
without creating children. The automatic festival worker requires a
separately reviewed edition, approved source authority, and exact canonical
child evidence; a public area label is not registration or membership.
The Kensington hunt is not such a registered festival programme.

This correction requires no Firestore migration, parser deployment,
duplicate venue events, invented clocks, or festival-membership inference.

## Approved implementation scope

Craig approved showing participating hunt locations and useful instructions
instead of an empty festival programme, and applying the distinction to
future applicable events.

Use a conservative reusable presentation rule over existing public data:

- Explicit child links retain linked-activity behavior even when none are
  currently available. An expired/unavailable child is not proof of a hunt.
- Strong combined hunt/participation evidence can show participation details
  for the single multi-stop activity. A title keyword alone is insufficient.
- An unlinked real festival must retain an honest programme empty state.
- Other ambiguous area events use neutral location wording.
- Unknown access hours, date boundaries, source provenance, and point
  certainty remain authoritative. Do not substitute venue hours as exact
  activity clocks or change expiry/calendar semantics.
- Preserve the accepted cache-first app baseline `3f7659d` and all explicit
  membership, paging, availability, and retry controls.

Frontend owner: existing task `01a12ac6-42ef-7b30-842a-3131be446090`.
Accepted baseline: `3f7659d10bc6952d4004b2d507b999db3c87cbd7` in
`festival-browser-cache-first/GathR-upgrade-sdk54`.

## Completed iOS Preview release

- Isolated worktree: `area-hunt-presentation/GathR-upgrade-sdk54`, branch
  `codex/area-hunt-presentation-20261016`.
- Runtime implementation: `571ed2db8c7199f46c1ab88c2e9233e083d14702`.
- Exact published commit: `896f6a53600ddac69f503c89d307e4d75bdf2f8c`.
- iOS Preview, runtime `1.1.10`, group
  `a2233c4b-d417-40d6-ba6c-31871f66ed44`, update
  `01a144ee-6772-7448-bfa8-49054339dae9`; expected footer `OTA 01a144ee`.
- Independent coordinator EAS view/list confirms the exact commit, runtime,
  platform and newest iOS Preview update at 13:39 UTC October 16.
- Nine suites / 105 tests pass; TypeScript passes; lint has zero errors and
  213 existing warnings. Auth, Social and Mapbox release checks pass.
- Coordinator personally reviewed all eleven unedited Android native PNGs:
  hunts, neutral area, unlinked festival, cached programme opening/paging/back,
  truthful overview timing, long venue name and full instructions/scroll.
  This verifies shared JavaScript; current iPhone adoption remains unverified.
- All three temporary root/index/map entrypoints were restored with exact
  original hashes, the fixture module removed, and the release checkout clean.
- Published bundle is byte-identical to the reviewed export: 5,710,656 bytes,
  SHA256 `abae89ed036ee0c3be9c0ac34ca93b0fe4ff0f1eb80233e494d6edbf5bcb94f4`.
  2,498 modules / 2,454 mapped sources, seven independently matching source
  checks and zero QA/test imports; 111 media asset metadata entries / 112
  EAS iOS assets. Existing runtime fingerprint advisory is unchanged.
- No parser/API runtime, Firestore, venue, media, Android or Production
  modification was performed. Independent API reread retains all three
  points, zero child links and unchanged source description/date fields.

Frontend tracked evidence: `docs/qa/area-hunt-presentation-20261016/` in the
app worktree. Publication report: its ignored
`artifacts/area-hunt-presentation-20261016/RELEASE.md`.
Coordinator private evidence: `functions/artifacts/kensington-participation-oct16/`,
including API-before/unchanged checks, independent export review and
`frontend-parent-release-verified.json` with fresh EAS readbacks.

## Additional venue discovery proposal (not in this implementation)

Craig subsequently supplied venue-screen screenshots and suggested a link
back to the festival/hunt from a normal venue view. Preserve the current
implementation boundary; this is the next proposed UX investigation.

- An actual timed canonical child should remain a normal venue event and may
  show `Part of [festival]` with navigation to its exact parent overview.
- A participating hunt stop has no separate timed child. Show a distinct
  `Participating in [hunt]` association card/link at the venue, without
  creating per-stop event documents or inflating event/special counts.
- Use the public root's exact child IDs and confirmed point venue IDs as the
  reverse-membership source. Do not infer festival membership from same
  venue, date, similar titles, or map proximity.
- Preserve selected-date filters: Centre Belle-Alliance's one current-day
  event is consistent with a festival browser containing twelve upcoming
  activities across different dates. Do not inject all future festival
  children into today's venue list.
- Venue cards must handle specials-only venues, expiry, removed membership,
  unavailable children/roots, multiple parent programmes, cached opening,
  back navigation, and source certainty without changing counts or filters.

Read-only source review confirms the current `EventCallout` consumes each
venue's already projected events/specials and has no reverse area-membership
affordance. Reuse loaded roots for a future association index; rendering and
navigation need a separately validated additive app change.
