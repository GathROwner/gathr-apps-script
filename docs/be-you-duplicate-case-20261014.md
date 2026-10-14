# Be You duplicate case — October 14, 2026

Case ledger: BEYOU-001, received four original phone screenshots. All four were
visually inspected, as were the managed original posters/collage. Status:
**local prevention validated; deployment and live cleanup remain coordinator-owned**.

## Workspace and serving baseline

Isolated checkout: `C:\Users\craig\.codex\worktrees\ca1c\gathr-apps-script`.
Branch: `codex/be-you-duplicate-investigation`, starting from exact accepted
`a93d9f31c104e03ba820b8164391056919433a33`. No other checkout was edited.
Dependencies are a read-only-use junction to the coordinator's existing
`functions/node_modules`; compiled output belongs to this checkout.

Fresh function describes confirm all three parsers ACTIVE, latest traffic,
hash `4f54118bd8f92b0cbd2b0456e3172f345809dd26`: `processdataset-00480-cuw`,
`processdatasetresume-00444-mak`, `processdatasetselectedrows-00436-ciy`.
Evidence: local `functions/artifacts/be-you-oct14/*-live.json`.

Latest completed regular full dataset, independently separated from local
playback: `11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC`, October14 14:12:53 UTC
(11:12:53 Atlantic), 370 rows, zero errors, 85 creates/32 updates. Its lock and
final batch are completed; no matching checkpoint or active processing lock.
Evidence: `regular-run-baseline.json`. This full run predates the deployed
October14 duplicate guard and does not measure that guard's effectiveness.

## Four cards, four documents

Venue: **Be You, 119 Grafton St, Charlottetown**, `venues/name_n2ivcu`.
All IDs below are children of `venues/name_n2ivcu/events/`; all nine current
venue events were captured. No matching top-level root event was found.
The complete paths and documents are in `capture.json` and `summary.json`.

| Card | Parent/document ID | API occurrence ID on October14 | Stored source identity | Source and schedule |
|---|---|---|---|---|
| 1 Sing-Along Night | `PBW360WVRvt9ijTQs9fS` | `PBW360WVRvt9ijTQs9fS_20261014` | `122204115074910683_4785436c123ed433` | Owner post Oct7 00:41:35 UTC (Oct6 Atlantic). Poster explicitly every Wednesday **and Friday**, 20:00, 19+, no finish. Wednesday parent created Oct8, base Oct7, `weekly_wednesday`. Stored 01:00 is marked category-default/unsupported; screenshot correctly shows end unknown. |
| 2 Karaoke Night ✨ | `Uo0EN3ofQfIFbxcYRYwy` | `Uo0EN3ofQfIFbxcYRYwy_20261014` | `1563147748686067_1` | Originally a structured Facebook event for May27 20:00, with “Tomorrow…weekly karaoke…8 PM–12 AM.” Same-ID owner-post parsing added Wednesday recurrence. Eleven retained update audits show later source enrichment without changing the original title/description/base date. Current source timestamp Sept16; gallery mixes the selected karaoke poster with unrelated promotions. |
| 3 Karaoke Night | `NJ5X8fPIVOy405M9sfFS` | `NJ5X8fPIVOy405M9sfFS_20261014` | `122202851828910683_c6a2578c31e84265` | Owner post Sept30 23:55:05 UTC, “Tonight!…Come sing your heart out!” plus the Wednesday 20:00–00:00 poster. Created Oct1, base Sept30, `weekly_wednesday`. Both clocks explicit, one correctly selected poster. |
| 4 Karaoke | `mB37Tk3gVTT0zvlkXiPg` | `mB37Tk3gVTT0zvlkXiPg` | `1562661692568029_72f05ef2d5d4041b` | Downtown Charlottetown Inc. Oct13 post explicitly lists **Wednesday Oct14 20:00 Be You: Karaoke**. One-off, unknown finish. Oct14 source `1563713265796205` updated its generic promotional gallery; an audit preserves that second post URL. The Olde Dublin collage is source-wide promotion, not Be You's poster. |

Friday is a separate supported parent:
`venues/name_n2ivcu/events/skLvOjG88fMQAxcjUAU0`, source
`122204115074910683_fce5877b5390fd69`, base Oct9, `weekly_friday`.
It materializes as `skLvOjG88fMQAxcjUAU0_20261016`. Both saved Oct7/Oct8
format snapshots split the same owner poster into Wednesday and Friday.

The phone screenshots do not establish their capture date merely through
“Today.” The current API independently reproduces all four Oct14 occurrence
IDs at 20:00. Nine details returned 200; ten fully paginated feed pages
contained 997 events. These are read-time recurrence occurrences, not four
materialized child documents or a UI-only duplicate. See `api.json`.

## Demonstrated code paths and limits

1. `firestoreService.checkDuplicate` queries same-date children, then a
   recurring-family candidate window of incoming base date minus120/plus21 days.
   May27 is **126 days before Sept30**. The actual family predicate accepts the
   two karaoke parents when supplied together (anchor score1), but the query
   excludes the older keeper. This explains the fresh September parent without
   treating its new source hash as the underlying failure. Source-captured
   playback proves both facts.
2. `recurringFamilyFallback.computeFamilyAnchorScore` requires at least two
   meaningful shared words for a contained/subsequence name. “Karaoke” versus
   “Karaoke Night” receives score0, so the dated aggregator item becomes another
   document even though the standing Wednesday occurrence covers it. Its exact
   source ID only finds/re-enriches the aggregator child on later runs.
3. `rowProcessor.buildDuplicateEventUpdates` historically preserved the May
   description because a later short caption was not judged richer, while
   `mergeDuplicateMediaUrls` accumulated media across posts. Audits explicitly
   show successive gallery growth, changed primaries and retained “Tomorrow.”
   The current three-image gallery is smaller than some older audit galleries;
   the retained evidence does not identify every intervening trim. Do not invent
   that history. A similar dated aggregator merge added another collage to card4.
4. Sing-along has no strong title-family anchor with karaoke and uses Live Music
   rather than Karaoke. Its new poster/date supports a real Wednesday/Friday
   series. A caption “Singalong tonight” previously parsed to the karaoke poster,
   but that is evidence of old parser/media behavior, not definitive proof the
   owner intended both branded activities as one series. Automatic aliasing or
   silently imposing the older midnight finish on the new poster is excluded.

Exact saved parse snapshot IDs, captions, ordered galleries, source timestamps,
format outputs and 57 venue update audits are retained locally in `history.json`.
The relevant ten snapshots are available, including original May event input,
Sept30 owner input, both Oct7/8 formats and Oct13 aggregate. Historical writer
deployment hashes and deleted intermediate documents are not fully reconstructed.

## Local prevention

`standingKaraokeOccurrence.ts` deliberately recognizes only unqualified
Karaoke/Karaoke Night with category Karaoke. It requires canonical venue, exact
clock, actual weekly occurrence membership, compatible room/age labels and
count/until/interval. Different branded programs/hosts and custom Wednesday+
Friday schedules are excluded. A bounded251-document venue query runs before
exact-source shortcuts, so an old active parent can be found and an existing
dated copy cannot bypass it. Multiple keepers, conflicting explicit finishes
or query overflow hold. No ranking guess selects a keeper from the live pair.

A covered dated listing can append only source IDs/URLs. It stays inspectable
through the existing update-audit path, without changing content, recurrence,
clocks, engagement or poster. Defensive duplicate merging repeats the same
checks. A newer owner-selected, event-attributed poster replaces the historical
gallery with that single image; source-wide galleries and unattributed/fallback
images cannot append or repaint, including source-wide shared thumbnails. Older
recurring captions cannot overwrite newer content; a fresh owner recurrence can
replace stale “Tomorrow” wording with durable schedule prose. Shared guard
callers lacking canonical IDs retain their previous behavior. Holds explicitly
log overflow versus multiple-parent/printed-end conflict, source ID and counts.

Validation: TypeScript build;18 new focused checks; all736 compiled backend
tests pass. Controls cover Friday, starts, rooms, venues, hosts/branded events,
age groups, finite/fortnightly series, explicit midnight conflicts, missing IDs,
source-only corroboration, stale posters and mixed galleries. Existing swim,
bookable-session, bounded-class, cinema and approved-root controls also pass.
Actual `checkDuplicate` read-only production selection holds the two existing
parents. Captured playback selects the old parent for the Sept30 source, matches
the aggregate against a unique canonical parent, and leaves both sing-along
and Friday unchanged. No paid calls, parser replay writes or live mutations.

## Same-mechanism scan

All1,144 current event documents were scanned. Five plain karaoke records,
two standing karaoke parents, three connected overlap edges, one three-document
cluster, all at Be You. No other venue qualifies. A separate same-venue,
exact-clock, >120-day scan using the existing actual recurring-family predicate
also finds only the Be You parent pair. These limits do not claim that other
duplicate mechanisms are absent. Evidence: `playback-and-scan.json`.

## Conservative proposed live delta — not applied

Keep `venues/name_n2ivcu/events/NJ5X8fPIVOy405M9sfFS`, its owner-selected poster,
Wednesday cadence and explicit 20:00–00:00. Append the four proven original/
aggregate source roots and available original URLs. Delete only:

- `venues/name_n2ivcu/events/Uo0EN3ofQfIFbxcYRYwy`
- `venues/name_n2ivcu/events/mB37Tk3gVTT0zvlkXiPg`

Retain Wednesday sing-along `PBW360WVRvt9ijTQs9fS` and Friday
`skLvOjG88fMQAxcjUAU0`. This intentionally leaves **two Wednesday cards**
pending source identity clarification; it does not assert all four are one.
No engagement counters or unrelated images are transferred; no media files
are deleted.

Read-only planner: `firebase/plan-be-you-repair-readonly.mjs`. Its default dry
run passed with zero writes, checking all nine sibling versions, exact target
fingerprints, top-level peers and no active parser. It refuses `--apply` because
the coordinator owns application. Complete documents/venue and exact guards:

- `firebase/artifacts/be-you-oct14/backup-2026-10-14T21-19-47-399Z.json`
- `firebase/artifacts/be-you-oct14/plan-2026-10-14T21-19-47-399Z.json`

Coordinator must independently review source equivalence and the patch, obtain
the exact required live-data approval, reread all guards, refresh the backup,
apply atomically and verify kept/deleted details plus full paginated feed.
Deployment alone will not repair any current card. Existing seven-copy cleanup,
APM/Ghostwalk/Museum plans and other release targets were untouched.

Open: whether the newer sing-along is the renamed/replacement Wednesday karaoke
series, a distinct activity, or a temporary overlap. Retain Friday regardless;
do not infer an end from the older poster. Further informal submissions can be
added as new ledger cases in this chat.
