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
Baseline worktree: `festival-browser-cache-first/GathR-upgrade-sdk54`.
Release boundary: tested, visually reviewed iOS Preview only; no Android or
Production publication in this batch. Runtime and evidence will be recorded
after independent coordinator review.
