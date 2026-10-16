# Venue links back to festivals and participation activities — October 16

## Approval and accepted baseline

Craig accepted the hunt presentation update (`896f6a5`, iOS Preview
`01a144ee-6772-7448-bfa8-49054339dae9`) and then approved the rendered mockups:
“That looks great. Do it.” This authorizes the pictured additive frontend
implementation and the normal tested iOS Preview release workflow.

Approved visual reference:
`C:/Users/craig/.codex/visualizations/2026/09/29/01a0ea83-7031-7423-b853-966f2180d186/festival-membership-mockups-20261016/mockups.png`.
Its sibling HTML/README contain the precise placement and parent destinations.

1. An actual venue event gets a compact pale-gold `Part of` link beneath its
   time, naming and opening the exact existing parent festival.
2. A confirmed hunt stop gets a `Participating in` panel above its venue's
   content tabs. This remains visible for a specials-only venue and opens the
   existing hunt overview. It does not create another event or alter counts.

## Current public source contract

Read-only detail verification confirms:

- `events/local_pumpkin_2026`: October 15–31, two reviewed venue points and
  thirteen exact canonical child links. Centre Belle-Alliance has twelve
  upcoming entries across several dates.
- `venues/slug_centrebellealliance/events/oct14_repair_festival_20261016_1`:
  Murder Mystery Night (in French), October 16, 18:00–21:00, canonical venue
  `slug_centrebellealliance`; this is an explicit festival child.
- `events/oct15_kensington_skeleton_week`: October 14–18, three confirmed
  canonical venue stops and zero child links. Ruby's Counter is
  `ZDUj9euh7NVJ6INSlHM8`; the other stops are Kensington Heritage Library and
  Island Stone Pub. This is one source-supported participation activity.

The public detail API carries `areaData` inside `metadata`; the existing
normalizer reads that and the additive top-level shape. No backend schema
change, model call, inverse-membership backfill, or Firestore write is needed.
Private read-only before captures: `functions/artifacts/venue-parent-links-oct16/`.

## Implementation and safety boundaries

- Derive a shared reverse-membership index from already loaded public roots
  and authoritative current-version cache data. Normalize canonical IDs and
  verify child/point venue ownership. Do not infer from names, dates or nearby
  coordinates, and do not fetch entire programmes per render.
- Preserve ordinary selected-date filters: one event today is compatible with
  twelve upcoming festival entries. Never inject all future children into
  today's venue listings or count the hunt at every venue as a new event.
- Explicit source removal, newer root changes, cancellation, expiry and
  confirmed unavailability override older caches. Preserve future programmes
  when their valid upcoming children are being browsed.
- Preserve private/friend event isolation, point certainty, timing and family
  flags. Family labelling remains a separate future audit.
- Parent navigation reuses ready cached details, keeps selected venue/date/
  filters, and must not create recursive modal stacks or duplicate opens.
- Independently review real native screenshots of the approved components,
  navigation and long names. The standalone QA harness disables the map; no
  map gestures, data resets, APK replacement or production mutation is allowed.
- Release only from a clean committed descendant of the fresh iOS Preview
  baseline after source/export checks; independently read back publication.

Frontend owner: existing task `01a12ac6-42ef-7b30-842a-3131be446090`.
Coordinator independently reviews evidence here. Implementation/release
evidence is pending; this document does not claim publication.
