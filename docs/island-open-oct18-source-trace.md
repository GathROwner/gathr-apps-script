# Island Open: October 18 app report

Status: **complete** — exact live correction and prevention release independently
verified. Craig
approved the documented one-parent removal and parser prevention with “ok fix it.”
No paid model replay is used.

The [PEI Golf Association's 2026 tournament calendar](https://www.peiga.ca/tournament-calendar/)
lists the Island Open at Belvedere for August 22–23, 2026. The user-visible listing
is `venues/AX91tBWrMCXUPA8BaV8Y/events/OnQLdajlap31rbezoZFI`.
It was created and last updated August 21 at 15:25:25 UTC; today's parse did not
modify it. Its stored August 23 date is materialized into current Sundays because
`isRecurring=Yes` and `recurringPattern=weekly_sunday` have no finite horizon.

Original source `1672217161571283`, posted August 20 at 20:24:44 UTC, says this
weekend and this Sunday. It advertises the 71st tournament and reviews historical
champions, without claiming weekly recurrence or printing a start time. The saved
August 21 format-stage snapshot already contains the false recurrence and 20:24
clock. `timeResolution.startFromPostTime=true` and start evidence explicitly record
the timestamp fallback. The 23:00 end came from a category default and is publicly
marked unknown. There is no evidence for either public exact clock.

Saved snapshot:
`parse_snapshots/1CoeW0QgjoJoM68V42YCNFOOHi4hH1Vua_357_1787325925903`.
Fresh full target/venue/sibling/source/snapshot readback is saved privately at
`firebase/artifacts/island-open-oct18/live-trace.json`. Exactly one canonical parent
matches this source across the complete event inventory; no active parser lock was
present. No event update audit matched this ID. A collection-group array-contains
query lacked an index, so the complete bounded inventory was filtered locally;
no index was created.

The exact deployed parser assembly at common source hash
`9087534a20b0bea00fa3c4e2af5e6586f41cc074` was tested offline through
`applyRecurrenceNormalizationForRegression`, once with its saved item description
and once with the full original caption. The saved item remains unbounded
`true/weekly_sunday`; the full caption remains marked recurring but receives
`totalOccurrences=1` and `recurrenceUntilDate=2026-08-23`. That finite full-caption
result would not justify a new October occurrence. The actual persisted August
parent lacks that horizon and has never been refreshed. This distinguishes the
surviving short-item normalization weakness from the fuller source's existing
finite-date protection. These are offline normalization tests, not paid end-to-end
extraction. `hasRecurringCue` treats singular `weekend` as recurrence evidence,
including the bounded phrase `this weekend`.

## Approved correction and prevention

- Remove the one confirmed false recurring Island Open parent after exact version,
  full-body and source-sibling checks, with a complete timestamped prewrite backup.
  Preserve the venue, source snapshot and every media object. Advance the feed
  atomically and verify detail 404 plus absence of all generated occurrences across
  the complete active app feed.
- Distinguish bounded relative weekend/Sunday advertisements from repeated weekends
  in recurrence normalization. Reproduce this exact source and preserve explicit
  weekly/each-weekend activities, finite date inventories and real series controls.
- Check the sports-event timestamp fallback separately; no clock is supported here.
  Do not remove intended food-offer date/time behavior through a blanket fallback ban.
- Build and test on the exact fresh serving baseline; any narrow production release
  must retain all accepted October 18 source, family and festival protections.

Two other Belvedere parents have separately reviewed finite-weekend evidence:
`tUv7AmMHnPS30LCqVAvX` (Two-Ball Matches, September 19) and
`wpI7jjHQcP1JHUeb9rCr` (Singles Matches, September 20), source
`1699120275547638`. Its September17 source explicitly advertises two days of match
play this weekend, Saturday10:00 and Sunday09:00. Snapshot
`parse_snapshots/1MsKXtkrOlDOrrroIoDZD3Hh2nbtXOEbe_214_1789741406586` confirms the
September19–20 dates and false weekly flags. These are confirmed separate historical
cleanup candidates; neither is included in Craig's exact one-parent approval here.
Source and proposal-only plan are saved privately as `related-matchplay-source.json`
and `related-matchplay-proposed-plan.json` in this case's artifact folder. Their
advertised starts are supported and must not be replaced with post timestamps.
Today's Tough Person tournament and October23 Golf Foundation Draw are separate
nonrecurring records. All four siblings remain unchanged in this repair.

## Exact correction evidence

Guarded dry run confirmed one exact source parent, five venue siblings, no active
parser and no checkpoint. The full-body/version/source/sibling checks passed again
in the transaction. The one event was removed at18:01 UTC and feed315→316 advanced
atomically. The parent venue, four other events and source snapshot retain exact
versions and bodies. No media object was changed or deleted.

Full fresh backup:
`firebase/artifacts/island-open-oct18/predelete-backup-2026-10-18T18-01-35-838Z.json`.
Applied result: `applied-2026-10-18T18-01-35-838Z.json` in the same folder,
`exactDeltaVerified=true`. Default-dry helper: `firebase/repair-island-open-oct18.mjs`.
Do not reapply the completed helper.

Independent API verification at18:01:52 UTC: target detail404, zero parent/generated
source copies across all nine pages/899 active events, all four other venue-event
details200 and the original managed poster200. Result:
`firebase/artifacts/island-open-oct18/api-verified.json`, with complete feed saved
beside it. The smaller feed count reflects the current active window; the atomic
repair changed exactly the approved parent and feed document.

## Prevention implementation

Clean serving-baseline assembly:
`functions/artifacts/island-open-oct18-release/assembly`.
The freshly pinned source archive generation1792342885983408 has SHA256
`5e2eb1edeaac784b8bad47e66f97c1783ba52fcac9bd0c646a50eab244de5161`.
All412 source/script files were compared byte-for-byte. Release parent
`1c8a34b302a85ce54985802358b284930daf53b7` is the accepted October18 parser release;
assembly baseline `83412f4bbf33f249ba8be469c01bce962c5ff635` restores only immutable
serving line endings lost in clone checkout. No semantic baseline changes.

Reviewed release commit `1f347717c84f230f508619aa912c4c6a9b7f2605` changes two runtime
files and adds one regression file (126 inserted lines). The final formatter
demotes a bounded relative weekly advertisement when neither repeated cadence
nor a multi-occurrence lifecycle supports it. Explicit weekly/each-weekend/plural
weekday cadence and genuine finite series remain supported. A one-occurrence
finite window also becomes an actual one-off.

The completeness guard discards a marked post-time fallback for a non-special
Sports item without an explicit advertised start. It then uses the existing hold
path; no start or finish is invented. Advertised sports clocks and the existing
same-day food-offer timestamp contract remain supported. The global date-only
switch, all models/efforts, prompts, cache/compact contracts and the separate
festival worker stay outside this change.

Build, **39 focused checks and all1,024 compiled backend tests pass**. The release
runner hashes every source, compiled, script and package file after those gates.
A local deployment configuration reuses this exact tested payload, omitting only
the redundant local predeploy compiler invocation; both CLI phases verify the clean
commit and the payload manifest. The serving runtime configuration is preserved.
The codebase-qualified three-parser dry run passed, followed by fresh baseline/idle
proof and the same narrow real deploy. No broad functions deploy was used.

Independent readback at18:12 UTC /15:12 Halifax confirms all three ACTIVE, latest100%,
common source hash `9b22abc40f77aca1dafb2bb7a549fb88f6f82afa`:

| Function | Verified revision |
|---|---|
|processDataset|processdataset-00504-riy|
|processDatasetResume|processdatasetresume-00468-wuk|
|processDatasetSelectedRows|processdatasetselectedrows-00460-lih|

Configuration/environment/secret hashes match the fresh serving baseline. All1,486
source/compiled/script files in the freshly downloaded serving archive match the clean
release assembly exactly; archive SHA256
`691fb7b2d7f22611766f669737a07a80b1df8f9ae118556079d69f83526348da`.
Evidence: `functions/artifacts/island-open-oct18-release/verified.json`, with pinned
before/after function/service metadata, tested-payload manifest, test logs and
qualified dry-run/apply results beside it. The Firebase CLI reported the existing
outdated `firebase-functions` dependency warning; no dependency upgrade was included.

Independent readback also confirms city finalization, both shared-event publishing
functions and `scheduledFestivalLinker` retain their exact previously verified
revisions/source hashes and100% latest traffic. The worker remains
`scheduledfestivallinker-00010-rof`, hash `9af99e18ea53be3bdb50be0ec3ab1016e6201dc9`.
No active parser or checkpoint remains. No paid model invocation, scrape, queue
replay, map interaction or frontend release occurred for this repair.

Source-based old/new playback is saved at
`firebase/artifacts/island-open-oct18/normalization-playback.json`; both source
variants become false/none with the candidate. Durable source/test patch:
`docs/patches/island-open-oct18-prevention.patch`.
