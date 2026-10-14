# October 14 recurring-series hardening

Craig approved implementation, release and the two confirmed Be You copies.
Coordinator checkout: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`,
branch `codex/recurring-series-hardening-20261014`. The accepted patch `1060e54`
was cherry-picked as `e234234`; the issue chat's unrelated Daisy work was excluded.

## Prevention

- Recurring-only paginated venue catalog replaces the karaoke-only 251-record
  bypass. Daily, monthly and weekly programs remain discoverable after their
  parent base date leaves the ordinary 120-day window. Actual occurrence
  membership uses the persistence scheduler, including count, until and interval.
- Catalog loads share a 30-second cache, invalidate on writes and page at most
  1,200 recurring records. Dated history cannot consume that bound. Incomplete
  catalogs and ambiguous parents fail closed with source/venue/count logs.
- Whole finite series must agree on start, count, horizon and schedule before a
  cross-source merge. An overlapping first date cannot truncate an ongoing
  program into an old four-week parent. Existing exact-source correction rules
  remain separate. Room and age identities remain conservative.
- Covered external dated listings corroborate a known owner's series without
  replacing its caption, clocks or images. Fresh first-party, event-attributed
  media can replace a stale recurring gallery; mixed galleries cannot append.
  Reprocessing the same source still refreshes its own structured managed image.
- A retired historical source explicitly linked to a later canonical parent
  corroborates that parent on replay, rather than recreating its earlier copy.
  Exact venue, clock, schedule, labels, source link and lifecycle are required;
  this does not backdate the parent. The transient lookup decision is stripped
  before the merged event enters the current-run cache.
- Only plain Karaoke/Karaoke Night is treated as an equivalent short activity
  name. Sing-Along and named hosts are not silently aliased.

## Validation

TypeScript build and all **747 compiled backend tests pass**. The 77-test focused
selection/merge/structured-media set also passed before the final owner-URL control.
Eleven new shared-series tests include
old trivia/daily/monthly/custom schedules, finite counts/horizons, fortnightly
membership, room/age controls, stale owner text/posters, external source-only
updates, cache pagination/failure/invalidation, retired-source replay and distinct
Facebook `/p/` owner identities (never collapse all pages to the same `p` label).

The structured media control previously used different Facebook source IDs and
inconsistent finite counts while asserting a media-only refresh. It now explicitly
tests reprocessing the same source; separate lifecycle regressions reject
cross-source finite-count changes. The safety rule was not weakened to pass it.

Read-only captured comparison against exact accepted patch `1060e54`:
1,144 captured event documents, 1,093 venue children, nine directed pairs accepted
by the actual family predicate and exact clock. Four directed outcomes change:

- Kensington music-series pair has different additional-location labels
  (`Kensington Railyard` versus `Kensington Railyard, PEI`) and daily/weekly shapes;
  the conservative label guard prevents overwriting either identity.
- Brackley karaoke pair has four occurrences from October 3 versus three from
  October 10, both ending October 24. The lifecycle guard prevents cross-source
  count/start replacement. This is review evidence, not deletion authority.

The only active >120-day matched pair is Be You (126 days). No other venue has
that captured mechanism. This does not prove other duplicate mechanisms absent.
Actual Firestore `checkDuplicate` holds the two live Be You parents; production
query/index compatibility is verified. Captured selector playback preserves
sing-along and Friday, and a simulated repaired keeper prevents old-source replay.
No paid model calls or parser replay writes were needed.

Local evidence directory:
`functions/artifacts/recurring-series-hardening-oct14/`.
Build/full/focused logs, captured-comparison JSON, before function descriptions
and exact cleanup plans/backups stay local. Function descriptions contain private
environment values and must never be committed.

## Exact live repair and verification

Keeper: `venues/name_n2ivcu/events/NJ5X8fPIVOy405M9sfFS`, Karaoke Night,
Wednesday 20:00–00:00. Only proven source IDs/URLs are appended.
Delete only the confirmed copies:

- `venues/name_n2ivcu/events/Uo0EN3ofQfIFbxcYRYwy`
- `venues/name_n2ivcu/events/mB37Tk3gVTT0zvlkXiPg`

Wednesday Sing-Along `PBW360WVRvt9ijTQs9fS` and Friday Sing-Along
`skLvOjG88fMQAxcjUAU0` remain unchanged. Two Wednesday cards intentionally remain
pending clarification of the renamed-versus-distinct program; no end is borrowed
from the karaoke poster. No media is deleted, no engagement is transferred.

`firebase/repair-beyou-confirmed-copies-20261014.mjs` defaults to dry run, pins the
reviewed plan hash, checks all venue/root siblings and their versions, refuses an
active parser, backs up all documents, then applies the three exact operations in
one transaction. The fresh sibling/venue hashes must match at apply time. Verify
every remaining sibling unchanged, both deleted details 404, keeper fields and
the full paginated app feed. No other cleanup plan is included.

Release requires a fresh idle-parser preflight, narrow dry run/deploy of the three
parser functions and independent ACTIVE/source-hash/revision/100%-traffic/env
readback. Serving and cleanup results are appended after verification.
