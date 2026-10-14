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

## Verified release and approved repair

Runtime commit **`e026d19`** was narrowly dry-run/deployed to `gathr-migrated`,
codebase `gathr-functions`, with no active processing lock. Both commands used
only `processDataset,processDatasetResume,processDatasetSelectedRows` qualified
as `functions:gathr-functions:<name>`. No other function or SDK was deployed.
The CLI's existing outdated `firebase-functions` warning remains a separate,
deferred dependency upgrade.

Exact release commands, from this checkout's `functions/`:

```powershell
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --dry-run
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated
```

Build/test commands:

```powershell
npm run build
$tests = @(Get-ChildItem lib -Recurse -Filter '*.test.js' | ForEach-Object { $_.FullName })
node --test @tests
```

Independent function and Cloud Run readback at **22:02:26 UTC October 14**:

| Function | Serving revision | State / traffic |
|---|---|---|
| processDataset | `processdataset-00481-dax` | ACTIVE / 100% |
| processDatasetResume | `processdatasetresume-00445-hes` | ACTIVE / 100% |
| processDatasetSelectedRows | `processdatasetselectedrows-00437-waf` | ACTIVE / 100% |

Common source hash **`b08f69995f660b68ec851b648fff969b1c15e2df`**.
Every existing environment value is unchanged, including models, efforts and
allocation. Evidence: `serving-verified.json`, private before/after descriptions
and separate traffic readbacks in the local evidence directory. Independent
checker: `functions/scripts/recurring-series-serving-readback.cjs`.

The exact three-operation repair applied atomically at **22:02:34 UTC** after
a fresh idle-parser/sibling/version check. All nine originals and venue data
were backed up; seven children remain. Keeper content, schedule, poster and
engagement fields are unchanged; six untargeted siblings are unchanged. No
venue or media files were deleted.

Evidence under `functions/artifacts/recurring-series-hardening-oct14/`:

- Fresh reviewed plan: `beyou-plan-2026-10-14T22-02-18-224Z.json`.
- Immediate prewrite backup: `beyou-backup-2026-10-14T22-02-34-367Z.json`.
- Applied/verified result: `beyou-result-2026-10-14T22-02-34-367Z.json`.
- Independent API/replay result: `beyou-api-and-replay-verification.json`.

Verification at **22:02:45 UTC**: both deleted details return404, all three
protected series details return200. The full active app feed contains988 events
across10 pages, none from either deleted parent, and all three retained series.
Actual read-only `checkDuplicate` calls for the deleted historical and aggregate
sources both select `NJ5X8fPIVOy405M9sfFS`; the historical source uses explicit
provenance-only corroboration. These are selector checks, not paid model replays
or new writes. Both Wednesday cards intentionally remain until sing-along's
identity is clarified; Friday remains intact.

Both retained managed poster URLs independently return200 with `image/webp`.
The existing audit automation was updated to this accepted baseline, retaining
October15 checks beginning11 a.m. Halifax and its existing end/stop conditions.
No additional heartbeat was created. The issue chat received the integration
handoff; its unrelated Daisy changes remain isolated.

The captured Brackley/Kensington differences remain review observations only.
An unrelated active-feed observation, Broadway Babes at08:00, needs original
source/time-provenance review before any correction; it was not touched by this
duplicate repair. Other previously pending cleanup plans were not applied.
