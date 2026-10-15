# October 15 reviewed batch: Trailside timing and four source links

**Prepared; not applied or deployed. One approval covers this exact batch.**
Craig requested short grouped approvals. This batch has one narrow parser
release, one new public listing, four source-only updates and one feed marker.
The event-integrity and deployment skills require approval of these concrete
live targets; approval to prepare the batch was not treated as an unspecified
live-write authorization.

## Short summary

1. Fix ticket-API event starts being incorrectly discarded because the ticket
   URL contains a separately labelled doors time. Also prevent ISO dates and
   numeric URL fragments in provenance from becoming clocks during a later merge.
   Model/prompt/traffic settings
   and all prior accepted repairs stay at their current baseline.
2. Recover Daniel James McFadyen at Trailside on November19,2026,20:00,$25.
   Doors18:30 remains separate; exact finish stays unknown. Use the existing
   venue/profile and the exact ticket event's verified artist image and URL.
3. Add the audit-proven Downtown source ID to four existing festival listings.
   Their schedules,titles,venues,media and public festival links stay unchanged.
   Automatic festival publication remains OFF.

## Exact live delta

| Action | Exact path | Scope |
|---|---|---|
| Create | `venues/slug_trailsidemusichall/events/oct15_mcfadyen_20261119_2000` | November19,20:00,start-only Live Music,$25,ticket URL/image |
| Update | `venues/slug_trailsidemusichall/events/J1TauchdK3akdCxHuasT` | Captains of Everything + Nick Doneff; add source1564814712352727 |
| Update | `venues/slug_theguildpei/events/mgXvpu5EB2N7eqnyeHa3` | Britt Campbell comedy; same source addition |
| Update | `venues/slug_theguildpei/events/80rdBjhcuZ0U4udVx0a2` | October15 conference; same source addition |
| Update | `venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo` | October16 L'Autre; same source addition; restored poster preserved |
| Metadata | `runtime_metadata/event_feed` |264->265 and updatedAt |

Only `sourceUniqueIds` and updatedAt change on the four existing events.
The full new-show payload is in the frozen plan. No deletion, upload, venue
mutation, other event repair or automatic festival membership change.

Authoritative default-dry helper: `firebase/repair-oct15-reviewed-batch.mjs`.
The earlier21:44 draft omitted the existing profile field and is superseded.
The21:54 fresh dry run matches the21:45 snapshot hash exactly. The only
reviewed live plan is the refreshed capture:

- `firebase/artifacts/oct15-reviewed-batch/plan-2026-10-15T21-54-55-119Z.json`
- Matching full `backup-2026-10-15T21-54-55-119Z.json`.

Dry run: one create,four source-only updates,feed265,eighteen guarded
references and eighteen related existing events; zero live writes.
Fresh prewrite backup and transactional source/target/venue/audit/sibling/marker
guards are mandatory. Changed source, ticket timestamp, poster bytes, sibling
set or marker aborts; no automatic broadening or bypass. A retry cannot create
another copy because the target is fixed and must be absent.

## Evidence and prevention

Original source1558539286292403,row269 explicitly names the performer,Trailside
and November19. The venue's current
[ticket API](https://trailside.ca/api/events/locarius) contains exactly the
[matching ticket event](https://locarius.io/events/4932/daniel-james-mcfadyen-november-19th-25-doors-630-pm).
Its UTC instant2026-11-20T00:00:24.039Z and printed local November19,20:00
agree in America/Halifax. The title separately labels doors18:30 and$25.
The numeric25 in its slug is a ticket price, not a2025 year inference.
The exact artist image was downloaded and independently viewed; both it and
the existing managed Trailside profile return200. No YouTube thumbnail is
substituted as event primary imagery.

Saved-source playback reproduces the previous `doors_without_showtime` hold.
The candidate preserves the independently agreeing ticket API performance
start through source reconciliation and clears only that obsolete doors hold.
Same-as-doors starts, conflicting/missing/invalid UTC/local proof, invalid
doors clocks, wrong dates/performers and independent source holds remain
protected. No new network discovery, paid model call or inferred end time.

The added future-merge playback initially caught a second reproducible defect:
the evidence date2026-11-19 was interpreted as an11–19 clock range, replacing
20:00 with11:00. The reviewed merge guard removes source URLs and ISO calendar
dates/timestamps before parsing printed clock ranges. Corroborated printed ranges
still protect the correct evening time against incoming meridiem errors. This is required before
publishing the new start-only show; the failed intermediate playback is not
reported as a passed gate.

The four source additions are supported by original caption lines, exact
matching event date/start/title/venue and pinned event-update audit records.
No alias, fuzzy match or uniqueId-prefix-only ownership inference is used.
Full-source capture includes the original Downtown caption line for L'Autre.

## Release and verification

Candidate checkout: `C:/Users/craig/.codex/worktrees/arts-mixer-release/gathr-apps-script`,
branch `codex/trailside-performance-start-20261015`, descended from the exact
currently serving Rodd release731bafc. Only websiteDetailEnricher.ts,
rowProcessor.ts and their two focused regression files differ. Exact reviewed
release commit is `4c8d1117dd37835124c67992f1ff84485fa06b44`.

Validation: build passes,38 focused checks and825 full compiled backend tests
pass. The original saved-source playback now retains20:00,unknown finish and
no obsolete doors hold. Production stored-unique-ID generation matches the
planned new record; offline future cross-source title/merge playback preserves
date,start,unknown finish,price,ticket URL and image. These are local/offline
checks with zero paid calls, not a fresh model extraction or next-run audit.
Evidence is in `functions/artifacts/oct15-sequential-repairs/next-batch/`:
`ticket-role-build.txt`, `ticket-role-focused.txt`, `ticket-role-full-tests.txt`,
`actual-source-playback.json` and `ticket-role-deploy-dry-run.txt`.

Fresh serving baseline: all three parsers ACTIVE,100%latest traffic,hash
`15a93b64dc5ce4d892adfe5b52d3d46c0ff9ad06`, revisions00488-vud/00452-pog/00444-kaj.
Readback fingerprints full function/runtime/environment/secret configuration;
raw secrets are not saved. At21:46UTC, dataset completed372,no checkpoint and
no active parser lock. Refresh this preflight immediately before deployment.

After approval: narrow codebase-qualified three-parser deploy from the isolated
functions directory; independent common-new-hash/ACTIVE/latest100% and identical
full configuration readback; then exact batch transaction. Neither the
coordinator's unshipped festival modules nor any other function/API/OTA ships.

Independent `firebase/verify-oct15-reviewed-batch-readonly.mjs` checks every
changed/untouched backed-up reference, exact sibling delta,new show details,
unchanged four existing details,full active/history feeds with one McFadyen
show,unknown finish,$25,correct ticket metadata,retained images200 and marker265.
The complete before payloads support an exact rollback plan if needed; rollback
would require its own reviewed delta and must not delete media.

## Held outside this batch

Harvest's missing dates overlap older generic/recurring/component cards.
Original poster,current official itinerary and ten historical source snapshots
are captured. Prepare one canonical twelve-date programme consolidation;
do not merely add nine cards alongside old weekly copies. Uncertain Ruby
offer clocks/old prices,Mill River horizon,online office pins and Blank Canvas
identity remain separate evidence/compatibility work. No broad cleanup is
approved by this batch.
