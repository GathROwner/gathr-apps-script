# Bike-bus update: remove unsupported school/timing card, retain source

**Prepared, default dry run only. No live cleanup applied.** This follows the
completed L'Autre restoration and read-only A&W scope review.

## Source-grounded finding

Exact public target:
`venues/i3qvfV2bLwzx5LhJM1IB/events/DpmCz0FWEAR5t8HqczPP`.

Title **Bike bus - Pink route**, source `2040103623589693`, October15.
The source says the yellow route is cancelled this morning and invites people
to join the pink route. It supplies no clocks, stops, streets, route order or
original media. West Kent Home and School published the update; that publisher's
school address does not establish this route's physical itinerary.

The public card claims **10:17–23:00 at West Kent Elementary School**. Stored
time evidence explicitly says startFromPostTime=true and endFromHours=
category_default. Its image is venue-media fallback, not a source route map.
Read-only complete active-feed capture at21:04UTC finds this misleading card
still visible once. The qualifying morning activity remains in scope; no
replacement clocks or route geometry can be reconstructed from this source.

## Exact proposed action

Delete only the above unsupported public event document and atomically advance
`runtime_metadata/event_feed` from **262 -> 263**, updating its timestamp only.
No venue, media, other event, source snapshot or review-queue writes/deletes.
This does not cancel the actual activity or declare bike buses out of scope.

Retain the complete original source at
`parse_snapshots/1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit_221_1792070300114`, complete
prewrite backup and an honest route/unknown-clock candidate in the private
repair evidence. It is held for reliable route/time evidence; this plan does
not create a live review document or a replacement public pin. Do not describe
the school fallback image as an original route poster.

## Preparation, safeguards and evidence

Helper `firebase/repair-bikebus-false-pin-oct15.mjs` is default dry run and accepts
apply only with the exact reviewed plan. Read-only verifier:
`firebase/verify-bikebus-false-pin-oct15-readonly.mjs`.

- Plan: `functions/artifacts/oct15-sequential-repairs/bikebus/plan-2026-10-15T21-05-47-495Z.json`.
- Full backup: matching `backup-2026-10-15T21-05-47-495Z.json`.
- Fresh dry run verifies no active parser, exact title/source/date/unsupported
  clocks/type, one exact-source public document, two related venue/source event
  documents and source/venue/feed marker versions. Any drift aborts.
- `held-candidate-playback.json` replays the actual saved source offline through
  the existing time/spatial guards. Clocks clear, route scope survives, zero
  streets are invented, and route_candidate_requires_geometry_review blocks
  publication. No network/model/live calls occur in this playback.
- All three existing October15 spatial regression tests pass: multi-site offer,
  bike route and online-only session protection. Both new helper syntax checks
  pass. No new parser deployment is required by this cleanup.
- After exact approval, fresh full prewrite backup and transactional lock,
  source/venue/target/marker/sibling guards precede the two-document delta.
  Independently verify target absent, other references/venue/source unchanged,
  both API details404, all active-feed pages free of parent/generated copies,
  managed fallback/profile images still200, marker263 and retained candidate.

## Adjacent A&W finding, held separately

`venues/fb_100041851131270/events/r7Uc6ODtYLuFpGvZ56ic` is already expired
(October14 06:00–21:00) and absent from the same complete active feed. Its
caption explicitly applies the $9.99 offer to all PEI locations, with no offer
end date. Existing spatial protection recognizes multi-site scope. No historical
mutation or new current occurrence was made; ongoing offer dates/participating
locations need separate evidence rather than reviving an expired one-store card.
Read-only snapshot: `functions/artifacts/oct15-sequential-repairs/aw/readonly-inspection.json`.

Remaining Rodd Brudenell dinner/music clock ownership, online office pins,
specific-store venue identity and other recoveries stay separate in the queue.
