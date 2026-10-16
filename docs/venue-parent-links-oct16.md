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

## Completed implementation and iOS Preview release

Frontend owner: existing task `01a12ac6-42ef-7b30-842a-3131be446090`, now idle.
Its isolated checkout is
`C:/Users/craig/.codex/worktrees/area-membership-backlinks/GathR-upgrade-sdk54`,
branch `codex/area-membership-backlinks-20261016`.

- Functional commit: `70d969f72c3835a27cb4c5aada72a1fb44a6c4e0`.
- Clean release commit: `2d40cb7c7f1b69d50074fe0343a233f1c32eb787`, a verified
  descendant of accepted baseline `896f6a5`.
- iOS Preview update: `01a14538-c839-782f-a845-87e89f643ed9`.
- Group: `3b237578-33e4-49e6-9c85-191f1815391a`; runtime `1.1.10`.
- Expected phone footer: `Runtime 1.1.10 · OTA 01a14538`.

The reverse index uses the complete current public feed and current cache
generations. Exact child IDs plus point venue ownership produce `Part of`;
confirmed hunt stops produce `Participating in`, even above specials when
Events is disabled. Neither changes occurrence counts. Newer removals,
cancellations, expiry and confirmed 404/410 responses override stale copies.
The provider opens ready parent data synchronously, validates stale data once,
and preserves the original card on return. No parser/data migration is needed.

Validation: 139 tests across 12 suites, TypeScript, lint with zero errors,
Preview auth/social continuity and Mapbox preflight. The coordinator personally
reviewed all eight unedited Android shared-component native screenshots:
event row, each parent opening/return, specials-only hunt panel and both long
titles. This was a synthetic in-memory harness; no map was mounted or operated.
Temporary entry points were restored byte-for-byte and the fixture removed.

The coordinator independently recomputed the export hash, compared all ten
source-map contents with the reviewed files, verified accepted ancestry and
clean status, and found zero QA imports. Published bundle hash is
`f2cc5596fb537f742be836e07cca13b83f3af3e00689bf71786937076ceaf850`, byte-identical
to that reviewed export: 2,502 modules, 2,458 map sources, 111 media assets
(112 EAS iOS assets including the launch bundle). Fresh independent EAS
view/list readback confirms the exact update/commit as newest iOS Preview;
Android Preview remains unchanged.

The existing fingerprint advisory remains
`9ee0b973a2f53ed5647ccafe1599ef64f1580ffb`. After publication Craig confirmed
“Alright that's working” on his phone. This is direct user confirmation of the
released backlink behaviour; Android proof and EAS metadata alone did not
establish adoption. No gesture, family-label, backend or live-data changes
were included. An unrelated old-context gesture suggestion was caught during
coordination and produced no code changes.

Evidence: app `docs/qa/area-membership-backlinks-20261016/README.md` and
`export-check.json`; app `artifacts/area-membership-backlinks-20261016/RELEASE.md`;
coordinator private `functions/artifacts/venue-parent-links-oct16/`
`root-prepublish-review.json`, `root-published-view.json`,
`root-published-list.json` and `root-published-verification.json`.
