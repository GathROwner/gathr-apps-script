# Reviewed multi-location festival publication

## Problem and resulting behavior

Anchor Fest was an approved top-level area umbrella with no `areaData`. Its
named locations survived only in truncated review prose, which was copied to
the public description. The publisher understood a centroid but had no typed
path for reviewed unordered points or existing component-event links. A
component's opening clock also became the multi-day umbrella's clock.

The publisher now accepts explicitly reviewed `manual.areaData` and private
`manual.areaEventLinks`, validates canonical venue coordinates and exact child
occurrence identity, and carries the public points into the event. It keeps
one umbrella and references existing canonical events; it never creates child
events, geocodes names, draws a connector, orders points, or infers membership
from other events at the same venue.

## Additive public contract

Existing version-1 area data and unlinked points remain compatible. Each point
may additionally contain `venueId?: string` and `linkedEventIds?: string[]`.
Links require a confirmed canonical venue. The Anchor preview derives stable
point IDs from venue identity, independent of labels or list position. Duplicate
venue aliases and linked IDs are rejected. Legacy points without venue IDs
continue to be accepted. Route fields and ordered/connecting geometry are
rejected from area data.

```ts
areaData: {
  version: 1,
  status: 'verified' | 'partial',
  sourceUrl?: string,
  sourceLabel?: string,
  verifiedAt?: string,
  locations: [{
    id: string, label: string,
    coordinates: { latitude: number, longitude: number },
    certainty: 'confirmed' | 'approximate',
    venueId?: string,
    linkedEventIds?: string[],
    address?: string, description?: string,
    timeLabel?: string, sourceLabel?: string
  }]
}
```

The authenticated finalizer already forwards `body.manual` without dropping
these fields. Private link evidence pins `eventPath`, `eventName`, `venueId`,
`startDate`, `startTime`, `festivalName`, source URL/text and verbatim activity,
date, clock and venue excerpts. The excerpts must bind the claimed activity,
date/clock and reviewed point label; the saved fingerprint must match the
current non-recurring canonical document. A director/cast suffix after an em
dash does not change a film's programme heading. No fuzzy child lookup occurs.

Missing child documents block approval. On a subsequent refresh, a deleted
child is omitted and the area becomes partial, retaining point identities and
coordinates. Cancelled, renamed, relocated or date/clock-shifted children cause
the refresh to hold before the public write. No other ID is substituted.
The frontend must also tolerate 404/cancelled details between publication and
opening a link. This is not a new child-event deletion or synchronization job.

Private evidence stays on the review/finalization document. Public area data
uses an explicit allowlist, including nested coordinates, and its complete map
is replaced on write to avoid retaining unknown older keys. New queued review
records retain full public descriptions separately from preview text; observed
location names and review reasons remain structured review fields. The legacy
generated audit suffix is stripped before publication. Reviewed manual fields,
including intentionally empty clocks, survive later source refreshes and
partial re-approval.

Known multi-location records cannot publish using only an area centroid. This
includes older named-list reviews missing `spatialEvidence`. A city/address
string or a single venue with parent-complex context does not require extra
pins. Existing city/province behavior and the route review gate stay intact.

## Anchor evidence and exact repair preview

Read-only source recovery inspected the original umbrella caption, the
Confederation Centre Arts Mixer caption, the Downtown daily programme and
Tivoli source workbook, plus the official film, music, comedy and industry
sections and their relevant ticket pages. The original umbrella states
October14–18 with no clocks. The preview clears the unsupported umbrella
19:00/23:00 clocks and retains its dates and identity.

The local reviewed specification contains eight canonical location points and
17 explicitly verified existing child occurrences. The locations are City
Cinema, Tivoli, The Arts Guild/The Guild, Trailside, Mavor's Lounge within the
Confederation Centre, the Comedy Cave within the Factory, Beaconsfield Carriage
House within its historic-house complex, and Dali Café. Empty child lists are
intentional where the programme confirms a location but no safe current
canonical child exists. Coordinates come exclusively from the existing venues.

Tivoli, Trailside and Dali have identical saved coordinates at155KentStreet.
They remain distinct venue identities; no offsets or new geocoding were added.
Frontend work must present co-located locations without inventing spatial
separation. Arts Guild/The Guild names share one canonical point. Factory is
the Comedy Cave's parent, not another festival point.

Beer Garden is privately held because its ticket page says190KentStreet while
the saved venue says185KentStreet. Back in Black clock/venue conflicts, Jim
Queen's source-clock disagreement, duplicate Snake identity, A Long Winter's
date disagreement, the City/Tivoli Captain Newfoundland venue disagreement,
and the contradictory Unholy Night encore date remain held. The confirmed
Saturday initial Unholy Night showing is distinct from the held encore.
Unrelated venue activities are excluded. No missing programme events are
invented. The `partial` status reports those limits honestly.

`firebase/repair-anchor-area-20261014.mjs` is default-dry and hardcodes exactly
the umbrella and review targets. It accepts the ignored reviewed specification,
backs up full targets/references, records old/new fields and exact IDs, checks
live versions/content, canonical child siblings and active-parser locks, and
requires the exact saved plan for an atomic apply. It updates only those two
documents and `updatedAt`; reference documents, media and venues are read-only.
Coordinator owns any approval, integration, deployment and live application.

Local evidence is under `functions/tmp/anchor-backend-oct14/`: `capture.json`,
`source-rows.json`, recovered workbooks, `reviewed-spec.json`, repair dry-run
output, timestamped full backup/plan and test logs. Production captions/IDs and
private review evidence are not test fixtures.

## API ownership and release targets

The separate API checkout's `backend/services/firestoreService.js` mapper
returns the persisted document as `metadata:data`. The accepted app's
`lib/api/firestoreEvents.ts` normalizes
`fsEvent.areaData ?? fsEvent.metadata?.areaData`. Existing API metadata therefore
carries this additive contract; no API repository change or deployment is
needed. The frontend's raw detail reconstruction also needs metadata fallback,
as independently identified by the coordinator. This checkout changes no app
files and performs no map interaction or emulator testing.

Minimum core writer targets requiring the new code:

- `processDataset` (northamerica-northeast2), `processDatasetSelectedRows` and
  `processDatasetResume` (northamerica-northeast1), verified again by the
  coordinator's live release preflight.
- `finalizeCityLevelEventReviewTrigger` (northamerica-northeast2), the normal
  authenticated manual publication path.

To cover every current queue/refresh writer also release:

- `processSharedEventPublicCandidates` (northamerica-northeast2).
- `scheduledSharedEventPublicCandidateProcessor` (northamerica-northeast1).

Both shared-promotion functions queue reviews; an existing published review can
refresh there. They need independently verified serving-baseline assemblies
before release, not a blind overwrite from the parser checkout. Resolver and
venue-backfill services have no direct city-publication calls; their selected
row replays are covered by `processDatasetSelectedRows`. Preserve their separate
serving source baselines. `replayStage45FromSnapshot` only saves snapshots and
returns replayed events; it does not publish event documents. No full-functions
deploy is appropriate.

## Verification

Final TypeScript build passed. All775 compiled backend tests passed (zero
failures/skips), as did14 Firebase area-contract/spatial-auditor checks. The
initial focused run passed41 tests; subsequent source-venue binding and merged
re-approval preservation fixes are included in the final775-test run. All17
linked details returned200 and matched the reviewed venue/date/start through
the live app API. The old Cornfest detail probe returned404, so API propagation
is established from the static mapper and accepted frontend fallback, not a
claimed healthy live Cornfest response. Logs are in the local evidence.
Focused coverage includes malformed/ambiguous points, exact source-bound child
identity, stable IDs and deleted/changed/cancelled children, private/public
separation, legacy single-venue/address context, city and route controls,
reviewed refresh preservation and unspecified umbrella clocks. Firebase area
contract and spatial-auditor controls are included.

No deployment, production write/replay, new venue or event, media deletion,
emulator run, or map test was performed. This is a backend implementation and
data-repair preview; the frontend interaction is not visually verified here.
