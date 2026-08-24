# Spatial Event Parser Stress Matrix

This matrix is the durable test contract for events that do not belong to one
ordinary venue. Recognition and publication are separate: the parser may
identify a route or several locations automatically, but it must not invent a
street order, coordinates, or a connecting line.

## Route cases

| Case | Expected parser result | Required safety behaviour |
|---|---|---|
| Official parade with ordered streets plus start and finish | `route`, high confidence, `official_full_route` | Preserve street order; geometry still needs map alignment and evidence review. |
| Run with confirmed start/turnaround/finish but no streets | `route`, `stops_only` | Show or queue points; do not draw straight chords. |
| Some official streets plus gaps | `route`, `official_partial_route` | Confirm named sections only; any connector must be labelled estimated/suggested. |
| Route-like title with no stops or streets | `route`, low confidence, `inferred` | Stay in review and draw no line. |
| Indoor treadmill/track event at one building | `single_location` | Resolve the durable venue; do not create a route. |
| Traffic or closure notice mentioning an event route | not a route event | Notice time cannot become event time and the notice cannot create a second occurrence. |
| Loop or out-and-back | `route` | Start and finish may share a point; no duplicate point is required. |
| Water parade | `route` | Do not street-route a water course; show supplied harbour points only when the path is unknown. |
| Trail event | `route` | Do not force street routing; geometry source must match the travel surface. |
| Province-only ride/run | `route`, review required | Never publish at a province centroid as if that were the course. |
| Private shared route event | private candidate only | Never weaken privacy or promote it publicly. |
| Public page has no route facts but private share text does | ordinary public candidate, not a public route | Private/share-only facts cannot strengthen the public spatial model. |
| Inline `Place A (start) / Place B (finish)` label | `route`, `stops_only` | Preserve both named points and roles; do not invent the path between them. |
| Road event where the official sequence has gaps | `route`, `official_partial_route` | Confirm only named sections; map-routed connectors remain visibly estimated. |
| Boat or trail route with road-looking nearby geography | `route` | Never use road routing for water/trail geometry without matching source evidence. |

## Multi-location cases

| Case | Expected parser result | Required safety behaviour |
|---|---|---|
| Busker festival at three official venues | `multi_location`, high confidence | Unordered points, no connecting line. |
| Event hub plus a confirmed crossing/impact point | `multi_location` unless a course is actually supplied | Location metadata cannot replace the event schedule. |
| Same program in three cities on three dates | `separate_occurrences` | Create/queue three occurrences, not one multi-location event. |
| Organizer/Page name mixed with real venues | `multi_location` using real places only | Organizer identity is not a map point. |
| Several rooms/stages inside one building | `single_location` | Use one venue plus sublocation metadata, not several map points. |
| Two aliases for the same address | one deduplicated point | Alias differences must not duplicate markers. |
| One confirmed and one TBC location | `multi_location`, partial | Preserve the possible point as review evidence; never silently claim it is confirmed. |
| Online plus one physical venue | hybrid review case | Preserve online access, but only the physical venue receives a map point. |
| Numbered poster schedule with times | event schedule plus spatial evidence | Times and item numbers must not become addresses or route stops. |
| Public image share, regular scraped post, structured Facebook Event, and private share | same spatial semantics | Keep each ingest path's provenance and trust/privacy boundary. |
| Multi-location event with one cancelled site | `multi_location` review update | Remove/disable only the cancelled point; do not delete the whole occurrence. |
| Same locations repeated across several days | one occurrence or series according to date evidence | Reuse points without merging distinct dates or schedules. |
| A festival with performances scheduled separately at each site | parent multi-location event plus site metadata | Do not draw a route; preserve each site's schedule without turning every room into a venue. |
| Multi-location event plus a separate parade/run component | distinct spatial occurrences | The festival area and route component must not overwrite or merge into each other. |
| Location aliases with different punctuation/abbreviations | deduplicated points after address/canonical checks | Text similarity alone is insufficient to merge genuinely different places. |

## Synthetic poster acceptance cases

Locally generated posters used for manual acceptance are deliberately marked
`TEST ONLY - PARSER QA`. They cover a confirmed start plus an ordered street
sequence, and an unordered arts/busker event with two confirmed locations plus
one weather-dependent possible location. These bitmap artifacts remain outside
the repository so they cannot be mistaken for application assets or production
event inputs.

The repeatable unit tests use the exact expected OCR facts rather than relying
on nondeterministic model wording. A deployed smoke test may send these through
the private-share path, but it must not promote them as public candidates.

## App interaction invariants

- Opening a multi-location event frames every point inside the unobstructed map
  area, including the right-side interest pills and the bottom summary card.
- A location or route-stop marker opens readable metadata without overlapping
  the route/area summary; the summary can reopen the event lightbox.
- Multi-location points never gain a connecting line merely because they are
  listed together.
- Route geometry distinguishes organizer-confirmed streets/stops from estimated
  or suggested map-aligned connectors.

## Publication invariant

- `areaData.locations` is unordered and cannot contain route/segment/order fields.
- `routeData` separates confirmed streets/stops from estimated connectors.
- Post-derived spatial candidates remain review-gated until points/geometry and
  source evidence are resolved.
- Structured data may only publish automatically when the existing title,
  date/time, location, jurisdiction, and privacy gates all pass.

## Ingest-path coverage

Every spatial classification change must be exercised at three layers:

1. deterministic classifier tests for exact extracted text and structured model evidence;
2. regular scraped-post and shared-event parser routing tests, including the public/private evidence boundary;
3. read-only live auditor checks for queue bypasses and invalid published map contracts.

An image-share smoke test is a fourth, nondeterministic acceptance layer. A
model/OCR success does not replace the deterministic tests, and a private test
share must never be treated as public publication evidence.
