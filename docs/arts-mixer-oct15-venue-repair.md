# Arts Mixer: single-venue correction, October 15

## Confirmed cause

First-party source `1506646261500744` and its saved original poster explicitly
print October 15, Mavor's Lounge at Confederation Centre, 4–7 p.m. The source's
last paragraph describes partner Anchor Fest's October 14–18 downtown
programme. It does not give the mixer a second venue.

The October 9 review counted the lounge/host plus Charlottetown as two
locations. Current code discards a contextual city but then counts the original
model list again and restores multi-location classification. The local guard
prevents that resurrection; real multi-venue events, routes, explicit multiple
location cues and unresolved alias-list evidence retain their treatment.

The October 13 approved main-checkout helper
`firebase/apply-approved-location-queue-2026-10-13.js` resolved the venue but
`eventFromReview` hardcoded city scope, copied diagnostic public copy and lost
time flags. October 14 duplicate cleanup retained this source-verified record
and removed the inferred 18:00 child without correcting those fields. That
repair was incomplete.

Fresh Firestore/API reads show the correct venue/address and 16:00–19:00 clocks.
Accepted app `lib/api/firestoreEvents.ts` requires explicit time provenance to
confirm a legacy end; `utils/locationScope.ts` selects city-wide UI from scope.
Restoring the flags/scope fits the current app without an OTA. This is static
compatibility evidence, not a new device/rendered test.

## Exact live correction — APPROVED, NOT APPLIED

1. `events/location_4a23fba2153afb4b591c2675`: change `locationScope` to `venue`,
   precision to `exact`, room to `additionalLocation: Mavor’s Lounge`; clean
   description from the saved format snapshot plus named room/host; restore
   original explicit start/end `timeFlags` and `timeResolution.hoursUsed: false`.
2. `city_level_event_reviews/cityevt_1eacc2fb688bed5d5af74314`: add resolved venue
   `slug_confedcentre`, resolved scope `venue` and an accurate resolution note.
   Retain historical parser evidence.

Both get updated timestamps. Preserve event ID/path, venue, address, clocks,
source provenance and all media. No creation/deletion/replay is proposed.
Old child `venues/slug_confedcentre/events/tzoUblUahp59XP7sgK6H` stays absent.

Default-dry helper: `firebase/repair-arts-mixer-venue-oct15.mjs`.
Saved plan:
`functions/artifacts/arts-mixer-oct15/repair-plan-2026-10-15T12-45-24-503Z.json`.
Full backup:
`functions/artifacts/arts-mixer-oct15/repair-backup-2026-10-15T12-45-24-503Z.json`.
Apply pins input versions, source snapshot and same-day siblings; it refuses
live changes during an active parse. It verifies the exact delta plus API detail
and the paginated active feed. Craig approved these exact two targets and the
post-parse safeguard release with the direct reply "I approve" on October 15.
No repeated approval is needed.

## Local prevention / release boundary

Production code changed: `functions/src/parsing/spatialEventClassifier.ts` only.
Regressions: `spatialEventClassifier.test.ts` and
`processing/rowProcessor.spatialEventRouting.test.ts`.

- Build passed; 41 focused tests passed, including real multi-venue/route
  controls and the existing unresolved same-address alias hold.
- Full compiled backend suite: 834 passed, zero failures/skips.
- Captured source playback returns single-location/venue, no area-review
  reasons and ordinary venue routing.
- No paid API calls, live writes, replays or deployments.

Dataset `1YPf2cKvXfXl8L0HVL63VZ2zeTLEvWlit` is active during preparation.
Release must wait for full completion and use a clean exact serving baseline
with only this guard/tests, excluding festival shadow implementation. Follow
the deploy skill: idle preflight, build/tests, narrow dry run, three parser
targets and independent revision/traffic/hash/env readback.

Do not reuse the old location helper as a publication template. Verified venue
corrections need venue scope, source-clean public copy and explicit time
evidence. Other records created by that helper need separate review; no broad
cleanup is authorized here.

## Approval follow-up

The approval-turn live read found the same active dataset and unchanged current
listing/scope/source. Fresh function readback confirms processDataset ACTIVE on
processdataset-00484-cek at source hash
`544339ea554116d3e7880b151d9afaca775adb20`. No live repair or deployment was run.
The existing October 15 audit heartbeat was updated successfully with the exact
approved helper/plan and narrow release gates. Its 11 a.m. Halifax start,
schedule and end time are unchanged. It must complete this approved work after
idle/completion checks, or report a concrete blocker, before pausing.
