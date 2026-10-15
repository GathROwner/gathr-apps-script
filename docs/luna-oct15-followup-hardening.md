# October 15 post-parse hardening

Craig approved working through the completed October 15 audit recommendations.
Coordinator owns this parser release and exact data-repair approvals. The existing
frontend coordinator owns its separate UI checkout; the existing investigation
task owns festival shadow changes in its separate checkout. Neither may deploy
these parser targets or mutate live events.

## Release baseline and scope

Worktree: `C:/Users/craig/.codex/worktrees/arts-mixer-release/gathr-apps-script`.
Branch: `codex/oct15-postparse-hardening`, descended from the exact accepted
Arts Mixer release `2dbd81c`. Fresh readback of all three parsers confirms ACTIVE
on source hash `608dca297a322ff2d5ced72337b5cd60dbedc9b9` before this release.
The October 15 dataset is complete372/372, marker present, checkpoint absent,
no active parser lock. No festival shadow modules enter this release.

## Implemented prevention, in separate commits

- `e8f3b28`: strip site navigation, footer and labelled hours popups before
  extracting detail-page dates/clocks. Audition content says evening; building
  hours8–18 are unrelated. Actual article-header clocks remain supported.
- `13f530f`: KEPT plus `none`/empty correction reason is a no-change placeholder;
  retain source recurrence. Explained unsupported changes still hold. Both saved
  FiN responses now preserve both weekly Thursday offers.
- `6dcc964`: output-token exhaustion uses the existing bounded batch recovery,
  with one fresh single-item retry and at most8,000 output tokens for that retry.
  Incomplete output never publishes; prompt/content failures remain terminal.
- `1c10477`, `d15c017`: protect exact first-party film occurrences from conflicting
  aggregator times regardless of disagreement size; normalize only printed
  Short/Shorts Programme prefixes. Generic Trivia requires exact venue/date/start,
  compatible finish/room, same owner page and the same printed host. Different
  surnames, themes, dates, rooms and clocks remain independent.
- Exact ingested source IDs/URLs now persist on ordinary writes and compatible
  occurrence merges. No historical source-ID backfill or event-ID prefix trust.
  Aggregator corroboration cannot repaint existing managed programme posters.
- `fb1dc47`: a selected original image cannot be replaced by a generic website
  image hint merely because the page has an OpenGraph image.
- `5bb7766`, `78ace41`, `de7d52d`: preserve dated source spatial evidence through
  formatting; recognize explicit all-brand PEI locations and bike-bus route
  structure. No invented streets/points. A validated online-only occurrence
  holds before physical matching/geocoding; normal snapshots retain the source.
  This prevents a false office pin/platform unknown-venue email, but does not
  implement a public online-event experience.
- `8a9a03b`: a source-grounded book discussion is not Live Music merely because
  its novel/title says Thriller. Explicit music performances remain music.

## Date-only activities: implemented, publication gated

`dateOnlyActivity.ts` produces v2 unknown endpoints with explicit validated
dates and a discovery-only23:59 cutoff. No claimed all-day/open/close/now period.
Ambiguous meridiem, invalid dates, unvalidated content and recurring parents
cannot enter this initial path. Missing future offer-end dates are not invented.

`PARSER_DATE_ONLY_PUBLICATION_ENABLED` defaults OFF. While off, bounded
`stage56HeldItems` preserves the otherwise dropped formatted candidates in the
normal parse snapshot. A retained candidate is not a newly published listing.
The frontend compatibility review found misleading Started/start-time disclosure
and calendar-noon defaults; its matching UI fix requires rendered verification
before this gate is enabled. No source-unavailable holds are relaxed.

Offline saved-source playback preserves all16 supplied items from rows48,201,
269,325 with explicit opt-in, and retains all16 as held candidates with the gate
off. These counts are formatting inventory, not sixteen missing live activities:
Ruby's eggroll already exists and cross-posts/older programmes need deduplication.
The Mill River source proves a starting date, not an indefinite booking horizon.

## Verification and evidence

`functions/scripts/oct15-hardening-playback.mjs` denies real network access.
It reuses both captured Taco responses and the original looping karaoke failure.
The fresh karaoke success is simulated to verify recovery/identity/cap behavior;
it does not prove live model recovery quality or API latency. No paid calls.

Artifacts are private/untracked under `functions/artifacts/oct15-hardening/` and
the corresponding `oct15-hardening-*.txt` files. Build/focused/full test evidence
and independent ACTIVE/hash/traffic/env readback are required before reporting
this release live. All five model/effort allocations, prompts and cache layouts
are preserved; the only response-budget change is bounded Stage5 recovery.

The historical standalone compact harness has one stale October11 disabled-path
request-body expectation (the accepted weekly_custom instructions were added
later). Its other35 tests passed. The compiled full backend suite is the serving
release gate; do not silently call the historical body expectation passed.

## Verified serving release

Runtime commit `4ba56dd` was narrowly deployed after an idle-lock check,
build, 805 passing compiled backend tests, 20 focused checks, saved-source
offline playback, and a codebase-qualified three-parser dry run.
Independent readback at 2026-10-15T15:46:48Z confirms all three ACTIVE at
source hash `faaa9ed0ccd092a50cd50007fae2fb038d584aae`, with 100% latest traffic:
`processdataset-00486-fof`, `processdatasetresume-00450-zas`, and
`processdatasetselectedrows-00442-fiz`. Full environment and secret bindings
were compared with pre-deploy captures and preserved. Date-only publication
remains OFF. Evidence: `functions/artifacts/oct15-hardening/serving-verified.json`.

The later helper-only commit `a00f05c` is not an additional runtime deployment.
Clock/poster preparation and its default-dry apply verifier passed with zero
live writes. Exact plan: `firebase/artifacts/oct15-hardening/time-plan-2026-10-15T15-50-42-195Z.json`.
It contains only auditions `bqk2pKnr1HHZQvhaz6Qo` and Chefs' Harvest
`L5dAjm7VnQOOCMMze25W`, with seven guarded target/source/sibling references.
The auditions poster was independently retrieved and visually confirmed.
These two corrections still require exact approval and compatible-client
rollout; publishing an iOS Preview alone does not update older/other clients.

## Exact live correction plans

`firebase/repair-oct15-two-duplicates.mjs` defaults to dry run. Exact two deletions:

| Delete | Preserve |
|---|---|
| `venues/slug_thetivolicinema/events/VtmHIyg7T7V4Tb0sC3Fo` — Pressure Points, October16 21:00 | `venues/slug_thetivolicinema/events/nepcYF8RIzLrzPKBXjWX` — source-supported18:00 |
| `venues/sJQHqeQVXehTHcFarwc6/events/Ez7t4IXyxsxjRisCtHnC` — General Trivia, October16 18:30 | `venues/sJQHqeQVXehTHcFarwc6/events/oXz81O57WSQ1D4nGMkn6` — existing same-host session |

Fresh dry run saved full targets, keepers, venues, source snapshots and same-day
siblings in `firebase/artifacts/oct15-hardening/duplicate-backup-2026-10-15T15-32-48-951Z.json`.
Plan: `duplicate-plan-2026-10-15T15-32-48-951Z.json`. Exact deletion approval was
requested; no apply has occurred. Transactional version/source/sibling guards,
fresh prewrite backup and full API-feed verification are mandatory. No media
or venue deletion. Do not mistake prevention deployment for corrected live data.

Remaining exact data plans include unsupported audition/Feast/bike-bus clocks,
current offer recovery and category/media corrections. Source price$6 versus
printed$6.50 requires source correction; these guards are not a general OCR-price
accuracy fix. Online publication, indefinite availability, unresolved venue
identities and the earlier17-item APM recovery retain their separate source and
approval requirements. The festival shadow task must report real outcomes and
remaining provenance/coverage gaps before any public writer is considered.

## Audit-backed historical source associations

`firebase/prepare-oct15-festival-provenance.mjs` has no apply operation.
Fresh read-only preparation at 16:00:45 UTC verified four canonical paths and
their exact update audits, original source snapshot, venues and same-day
siblings (16 guarded references). Plan and full backup are in
`firebase/artifacts/oct15-hardening/festival-provenance-plan-2026-10-15T16-00-45-395Z.json`
and its matching backup. The proposed delta adds source ID `1564814712352727`
only to `sourceUniqueIds` on Captains/Nick, Britt Campbell, October15 conference
and L'Autre. No clock/title/media/manual-link changes and no public link writer
are included. No live writes occurred; this proposal is not approval or apply.

## Coordinated shadow reconciliation and remaining sequence

The accepted festival shadow hardening `97187be` was independently inspected
and integrated as `59d8ae2`; its tooling-import commit was excluded because the
coordinator already had those files. Independent matcher/scope/public-reference/
extractor tests passed 76/76. The integrated coordinator build passed and all
856 compiled backend tests passed. This combined checkout contains unshipped
shadow code; it is NOT the parser serving package. The initial serving release
was `4ba56dd`; the subsequent narrow FiN guard release is recorded below.

Cached seven-source playback now resolves both conference date scopes and
L'Autre identity, reducing capture gaps from three to one. It correctly holds
the known Pressure Points clock conflict before source-ownership checks.
Current result: zero eligible, nine holds, zero missing-child pending outcomes,
one capture gap. Four in-memory audit-backed provenance additions yield four
eligible proposals; no such live additions or public links have been applied.
The remaining source/clock/venue/ownership gaps and separate public writer are
unfinished. See `docs/festival-shadow-oct15-hardening.md` for exact boundaries.

| Concern | Prevention status | Live recovery / next gate |
|---|---|---|
| Website clocks and generic images | Serving | Exact auditions/Harvest correction prepared, not applied; requires compatible display and exact approval |
| Pressure Points and Pints East copies | Serving | Exact approved two-record deletion complete; independent Firestore/detail/full-feed/media verification passed |
| FiN compact recurrence placeholder | Serving; both saved responses pass; category cutoff bounded by verified closing | Fish-only exact recovery prepared; Chicken choice retained as qualified context, separate untimed parent held |
| Ruby, Harvest later dates, Trailside, other date-only activities | Held evidence retained | Date-only publication OFF; source price and duplicate conflicts require reviewed recovery |
| Source provenance / festival offsets, titles and authority | Provenance serving; matcher shadow only | Four exact source-array additions prepared, not applied; automatic writer still OFF |
| Spatial scope and online-only office pins | Serving defensive guards | Existing A&W/bike-bus/online records require separate exact review; public online contract not implemented |
| Book discussion category and displaced programme image | Serving | Existing Indigo category and L'Autre image correction need exact reviewed plans |
| Earlier APM17 recovery | Prior venue guards retained | Exact approved17 creates complete October15; detail/full-feed/source/image checks passed |
| Andersons Creek identity, indefinite package horizon | Unresolved source/location evidence | Do not invent venues or booking end dates |

The initial prevention follow-up made no live document changes. The subsequent
explicitly approved two-record cleanup is recorded below; other historical
recovery plans remain unapplied.

## Client safeguard: iOS Preview published

The existing frontend coordinator corrected real saved `isRecurring: "No"`
handling before publication. Independent coordinator rerun passed29 tests in
three feed/detail/calendar suites (one existing opt-in benchmark skipped).
The frontend release gate passed283 tests in31 suites, TypeScript/lint,
auth/Social/Mapbox checks. Four genuine native shared-component screenshots
were independently reviewed; they do not prove full iOS device adoption.

Independent EAS list and view confirm latest iOS Preview, runtime1.1.10,
group `1957e06c-b340-4601-b573-bc55e256cf20`, update
`01a14050-6df8-7a58-8190-591bfa23002c`, release commit
`3d2f4f729242b0a306a1917b053a6576a22deaed`. The five relevant runtime files
match corrected source `f43affc` exactly and the published commit descends
from accepted festival Preview `9c653f0`. Production/Android were not released.
iPhone adoption is unverified. Keep global date-only publication OFF until
the remaining consuming-client rollout/delivery decision is made.

## October15 exact two-record cleanup applied

Craig approved the concrete first cleanup batch with "Okay do it" after the
two titles/keeper decisions and exact targets were presented. Fresh preflight
at16:56:23 UTC found no active parser, completed marker/final batch372 and no
checkpoint. Fresh dry-run snapshot hash matched the original reviewed plan
`duplicate-plan-2026-10-15T15-32-48-951Z.json` exactly; no drift was bypassed.

One transaction deleted only:
- `venues/slug_thetivolicinema/events/VtmHIyg7T7V4Tb0sC3Fo` (October16 21:00 Pressure Points copy).
- `venues/sJQHqeQVXehTHcFarwc6/events/Ez7t4IXyxsxjRisCtHnC` (October16 18:30 General Trivia copy).

Prewrite backup: release checkout `firebase/artifacts/oct15-hardening/duplicate-prewrite-2026-10-15T16-56-38-929Z.json`.
Apply result: matching `duplicate-applied-2026-10-15T16-56-38-929Z.json`, completed16:56:50 UTC.
Both deleted details returned404; both keepers returned200. Independent verification
at16:57:29 checked all guarded references: nine untouched records unchanged,
both keepers present exactly once and both copies/generated IDs absent in the
complete1,026-event/11-page feed. All four managed primary images still return200.
No venue/media deletion, reparse, queue mutation or new deployment occurred.
Independent artifact: `duplicate-independent-verification.json` in that same
release-checkout artifact folder. Live data recovery for every other row remains
separate; this result does not authorize additional deletions or writes.

### Subsequent approved APM recovery complete

Craig then approved the exact17 APM targets. One guarded transaction created
all16 printed boys' evaluation sessions and the October15 18:00 volunteer
meeting with unknown finish. Independent verifier checked17 exact Firestore
payloads/details,12 untouched guarded references, each target once in the
complete1,038-event/11-page feed, no duplicated exact source identities and
both managed posters200. See `docs/oct14-followup-live-approval-plan.md` for
the exact paths, original approved plan, fresh prewrite/result files and the
helper serialization/verifier field corrections completed before final success.
Only these17 creates were authorized/applied; FiN/date-only/spatial/media and
festival provenance recovery remain separate pending work.

## Subsequent FiN source-specific review and closing guard

Actual offline resolver playback after the compact fix found an unsupported
21:00 category-default Chicken cutoff at a venue whose verified2026 close is
20:00. Narrow release `2ce92a7` bounds only unconfirmed special category-default
cutoffs by verified closing, retaining uncertainty. Explicit source clocks,
other categories, overnight spans and unverified-hour controls are preserved.
20 focused checks and all809 release backend tests passed. Fresh idle-lock
preflight, narrow dry run and deploy completed. All three independently ACTIVE
at100% latest traffic and common hash `c8f778d960e9fd45d2efd5624d0b5b3b1411fb84`:
`processdataset-00487-tes`, `processdatasetresume-00451-jan`,
`processdatasetselectedrows-00443-kas`. Full environment/secret/resource/security
settings match pre-deploy captures; global date-only publication remains OFF.

FiN's actual poster says Fish Tacos$7 each, all day. Its current first-party
Fall2026 contact section says7am–8pm. An exact Fish-only weekly recovery is
prepared, using existing venue-hours/closing semantics and preserving Chicken
as unpriced caption context without inventing separate serving times. No FiN
event or poster upload has occurred; exact-target approval is requested.
See `docs/fin-tacos-oct15-recovery.md` for source proof, legacy/current app
compatibility limits, exact create path, media plan and fresh backup.
