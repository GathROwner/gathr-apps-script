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

## Exact live correction — APPROVED AND VERIFIED

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

## Completed after full parse, October 15

The regular run finished at13:57:45 UTC with all372 rows, completed lock/marker/
final batch and no checkpoint. No active parser remained before repair/deploy.

The first saved-plan apply safely aborted before writing because the untouched
venue reference had refreshed its Facebook image CDN hostname and updatedAt.
Both target documents, source snapshot, occurrence siblings and every proposed
mutation were identical to the approved plan. A field-by-field comparison also
proved every other venue field and the underlying source-image path unchanged.
The fresh dry run pinned that harmless reference refresh without broadening the
approved actions; evidence is `fresh-plan-approval-continuity.json`.

Exactly the two approved documents were changed after backup
`functions/artifacts/arts-mixer-oct15/repair-backup-2026-10-15T14-05-55-882Z.json`.
The transaction succeeded, then its local verifier failed serializing the
intentionally absent old child. The serializer was corrected; no apply was
repeated. Independent read-only verification checks the entire approved delta
and all untouched backup references. API detail and the complete11-page,
1,038-event feed show one venue-scoped mixer, explicit16–19 time provenance,
clean description and unchanged media. Old child remains absent. Final evidence:
`repair-applied-verified.json` and `repair-independent-verified.json` in that
directory. No app code/OTA or map interaction was needed.

The clean release checkout is
`C:/Users/craig/.codex/worktrees/arts-mixer-release/gathr-apps-script`, branch
`codex/arts-mixer-venue-release-20261015`, commit
`2dbd81cf0ea6cfb702c3700211dc1ae972d925ae`. Its219 baseline source files match the
immutable serving archive and commit e0f9255. Only the classifier guard and two
regression files were added; all festival shadow additions were excluded.
Build and785 full backend tests passed, followed by the exact three-function
codebase-qualified dry run and deploy. Firebase reported its existing SDK-age
warning; no SDK update was included.

Independent function/Cloud Run readback verifies ACTIVE,100% latest traffic,
all71 user environment values and secret bindings preserved:

| Function | Revision | Common source hash |
|---|---|---|
| processDataset | processdataset-00485-koj | 608dca297a322ff2d5ced72337b5cd60dbedc9b9 |
| processDatasetResume | processdatasetresume-00449-yej | 608dca297a322ff2d5ced72337b5cd60dbedc9b9 |
| processDatasetSelectedRows | processdatasetselectedrows-00441-dok | 608dca297a322ff2d5ced72337b5cd60dbedc9b9 |

Release logs and `serving-verified.json` are local in the release checkout's
`functions/artifacts/arts-mixer-release/`. This release happened after the run;
today's production quality measurements belong to the earlier544339 hash.
