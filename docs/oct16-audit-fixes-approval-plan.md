# October 16 audit fixes: one combined production approval

Status: implementation and independent release preparation complete; awaiting this exact combined production approval. No deployment, live record mutation or replay has occurred.

## Requested batch

1. Deploy the tested prevention changes to the three parser functions, the festival worker, and both venue resolvers, each from its own appropriate serving baseline. Existing stage models, effort, cache layout, compact contract, secrets and user configuration are preserved. No client/OTA or finalizer release.
2. Apply the exact **23-document repair** below atomically: **17 updates, 4 creates, 2 deletes**. This includes 10 retained public-event corrections, three missing dated curling occurrences, two false post-time deletions, paired city reviews, four queue dispositions, one held private area review and one feed-version increment.
3. Reprocess **only Al Tuck source `1559528609526804`** from October16 dataset `1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw`, first as a cloud dry run. Apply only if the result is one October28,2026 performance at existing Trailside Music Hall,20:00, with doors18:30 in the description and no source-proven finish. Source/workbook/venue/gallery and duplicate checks must remain identical. No broad replay.

The event-integrity repair skill requires the exact targets, backup and verification plan to be reviewed before production changes. This is one combined approval for those sequential steps; a source/record/configuration drift stops the affected step.

## Exact repair

Full reviewed plan: `C:/Users/craig/.codex/worktrees/a2af/gathr-apps-script/firebase/artifacts/oct16-eight-group/repair-plan-2026-10-16T20-40-30-941Z.json`.

Canonical plan SHA256: `fbbd413c27fd128f2c6db8dcb6872232ac7f8d67d1f86e5d9a96184eefa43717`.

Full preparation backup: matching `prewrite-backup-2026-10-16T20-40-30-941Z.json`. The guarded helper saves another fresh full prewrite backup at application, refuses drift, and rereads the exact delta. Source images, venue documents and untargeted events remain preserved.

| Action | Listing or record | Exact path | Changed fields or purpose |
| --- | --- | --- | --- |
| update | Membership Rally | `venues/1ehK5wrBKC460QSpqUMq/events/v08itQxkWgTVRQ3Uvm4z` | isRecurring, recurringPattern, totalOccurrences, recurrenceUntilDate, recurringDaysOfWeek, recurringWeekdaySequence |
| update | Try Curling/ Drop In Ice Times | `venues/1ehK5wrBKC460QSpqUMq/events/dVOV8QMohPKYBp2OGp02` | isRecurring, recurringPattern, totalOccurrences, recurrenceUntilDate, recurringDaysOfWeek, recurringWeekdaySequence |
| update | Learn to Curl | `venues/1ehK5wrBKC460QSpqUMq/events/yjd37dklHpKmS4uIcL1C` | startTime, endTime, endDate, totalOccurrences, recurrenceUntilDate, timeFlags, timeResolution |
| update | Open Mic, Open Dance Floor and Sing Along!! | `venues/name_n2ivcu/events/s6fa06YUzIT8i8hfL0kK` | startTime, endTime, endDate, timeFlags, timeResolution |
| update | $18 Kitchen Feature — Meatloaf Sandwich | `venues/ZDUj9euh7NVJ6INSlHM8/events/Hsy0at1WEYoq2Nh4qKYg` | eventName, name, price, ticketPrice, reviewedSourcePrice |
| update | Christmas Craft Fair | `venues/slug_koolbreezefarms/events/cityrecovered_01bdb05e9cfe396610c2202e` | category, eventType, isEvent, isFoodSpecial, reviewedCategory |
| update | Men of the Deeps: 60 Years of Song & Story — Diamond Sunset Anniversary Tour | `venues/slug_sobeyfamilytheatre/events/ZPFgcUjzYQ9BI7a5oe52` | category, eventType, isEvent, isFoodSpecial |
| update | Belly Dance Fridays | `venues/0F6W6IBgJqlKQ8AmaTGC/events/QqkS6gWBGaW3soS96iqm` | endTime, isRecurring, recurringPattern, totalOccurrences, recurrenceUntilDate, timeFlags, timeResolution |
| update | Two Pianos, No Rodeo: Bob Wiseman and Mike Boguski | `events/location_6113f49ab46fd8e8731a06c8` | locationScope, locationPrecision, mapMode, endTime, timeFlags, timeResolution, description |
| update | Mix & Mingle with Charlottetown’s Mayoral Candidates | `events/location_e6d499b424052528b5ddfb05` | locationScope, locationPrecision, mapMode, description |
| update | Two Pianos, No Rodeo: Bob Wiseman and Mike Boguski | `city_level_event_reviews/cityevt_61337127d2ee83a70669d556` | resolvedVenueId, resolvedLocationScope, descriptionPreview, endTime, priorInferredPublicEndTime, resolutionNotes |
| update | Mix & Mingle with Charlottetown’s Mayoral Candidates | `city_level_event_reviews/cityevt_3fec0d16907daa5d90dc760c` | resolvedVenueId, resolvedLocationScope, descriptionPreview, resolutionNotes |
| create | Membership Rally | `venues/1ehK5wrBKC460QSpqUMq/events/oct16repair_membership_20261025_1500` | one dated occurrence |
| create | Try Curling/ Drop In Ice Times | `venues/1ehK5wrBKC460QSpqUMq/events/oct16repair_trycurling_20261029_1800` | one dated occurrence |
| create | Try Curling/ Drop In Ice Times | `venues/1ehK5wrBKC460QSpqUMq/events/oct16repair_trycurling_20261030_1800` | one dated occurrence |
| delete | A Long Winter | `venues/slug_citycinemachtown/events/rf7Ftmb7ExLB1YsviCPC` | false post-time occurrence; retain all media |
| delete | CHEFS' HARVEST: The Foraged Seven with Nick of North | `venues/fb_100063617721610/events/zHLjrYAlkafP2wpFbvqq` | false post-time occurrence; retain all media |
| update | Summerside Library ADL Room (ADL Room downstairs) | `unrecognized_venues/uv_6dff1d3b4fb1d0171a3bd356` | status, resolvedVenueId, resolvedBy, resolutionAction, resolutionNotes, replaySuppressedReason |
| update | Water Street, Downtown Summerside | `unrecognized_venues/uv_9d7236d76e3fa026338f30c4` | status, resolutionAction, resolvedReviewPath, resolutionNotes |
| update | Three Oaks High School | `unrecognized_venues/uv_60a1010e8ac654a577acc5a1` | sampleEvents, cityHint, status, resolutionNotes |
| update | Three Oaks High School | `unrecognized_venues/uv_aaaae7e3e6332d5f6f538272` | status, cityHint, canonicalQueuePath, resolutionAction, resolutionNotes |
| create | Witches on Water Street | `city_level_event_reviews/cityevt_99344972a03c76a3cacf36e1` | held area review |
| update | App feed version | `runtime_metadata/event_feed` | version |

The official club calendar confirms Learn to Curl six Thursdays Nov12–Dec17,18:15–20:00. Be You remains18:00–00:00 overnight. Ruby becomes$16. Belly Dance keeps19:00–19:55. Two Pianos retains19:30 with unknown finish; Mayoral Candidates retains19:00–21:00. The two root IDs stay the same and become exact venue scope.

## Source holds

- Belly Dance probable duplicate: no deletion without instructor/room identity proof.
- A Long Winter: conflicting ticket dates; remove only the confirmed false post-time copy, preserve separately sourced records.
- Witches: private unordered area review only; distinguish three AT hosts from BY/FROM providers. No road point, invented bookshop coordinates, public recovery or per-stop copies.
- Three Oaks: retain both source-date samples in one manual review; no venue creation or event replay.
- Harvest: preserve the existing correct parent/programme. Separate programme children require a further design, not this JSON guard.

## Festival worker behavior

The worker is already in publish mode. This release preserves normal scheduled source-verified linking and all manual ownership decisions. A declared synthetic local read-only test proposes eight additional existing Anchor events, while preserving17 Anchor and13 Pumpkin links. That test is not a production capture and will never be persisted or used to force publication. Normal scheduled execution must obtain its own valid source evidence; no eight-link outcome is promised and no manual festival publication is included in the23-document batch.

## Verification and release evidence

Implementation task: `01a14637-2ddc-7900-abe0-33873decd655`, completed and independently reviewed. Isolated branch `codex/oct16-eight-group-prevention` in worktree `a2af`, based on accepted parser8e366b3. Final implementation/review commit: `796b66659e04e6cccc84f25f95e22fd24fb289b0` (implementation6d586b9, handoffddb906f, coordinator796b666).

All four codebase-qualified deployment dry runs passed: three parsers together, festival worker, scheduled venue resolver and manual venue resolver. Each separate function uses its own immutable serving assembly. Initial resolver discovery timeouts were resolved with the established local `FUNCTIONS_DISCOVERY_TIMEOUT=60`; the worker's adjacent manifest naming collision was corrected without changing its runtime source or broadening the deployment target. Logs are the four `dry-run-*-final.txt` files in coordinator evidence.

Independent fresh readback at20:47UTC confirms all six serving functions remain ACTIVE on their recorded baselines with100% latest traffic, unchanged configuration and secret bindings. The parser is idle. Firebase's actual environment loader confirms candidate user values match serving values exactly:71 per parser,2 worker and57 per resolver. The existing outdated Firebase SDK warning remains; no dependency upgrade is included.

Parser:912 full backend,42 focused and113 relevant script checks pass. Worker:946 compiled and18 script checks pass. Resolver focused checks:20 each pass. Both full resolver suites have392/394 passing; the same two expired September fixtures fail on both unchanged immutable baselines. One older compact request-equality fixture also fails identically on accepted8e366b3. Those known fixture failures are retained explicitly.

Independent rebuild and42 focused parser checks pass; three guarded repair-helper checks pass, including source links and the canonical area-review identity. The original20:24 preapproval plan is superseded by20:40; no plan has been approved or applied.

Eleven paid validation calls cost an estimatedUS$0.01362435; offline playback and two Responses retrievals are recorded separately. Independent source/venue readbacks, candidate matching and archive/source diffs are saved in coordinator `functions/artifacts/oct16-audit-fix-coordination/`.

Before execution: fresh idle-lock, serving-source/latest-traffic/configuration/secret checks; committed exact release; build, focused tests and codebase-qualified dry runs. After deployment: independent ACTIVE/latest100%/source/env/secret readback. After repair/recovery: every detail, complete paginated active feed, expired-copy absence, recurrence dates and retained media; verify11 protected Inn evenings and17/13 festival memberships. Existing user storage and device adoption are not changed by this backend batch.

## Concurrent Apify pilot boundary

Craig asked the coordinator to inspect `Audit GathR Apify spend and optimization…`, task `01a145c6-7181-7b22-94f3-8c739506a0c0`. Its current recorded edits are confined to its scratch directory under `Documents/Codex/2026-10-16/gathr-apify-usage-audit-20261016`. Its pilot copies the immutable morning parser00457 source that actually processed today's dataset; it does not use this pending release as the comparison baseline. Our branch/HEAD/reflog are unchanged and clean, and the fresh six-function readback confirms no serving overlap. No code from that pilot is part of this batch.
