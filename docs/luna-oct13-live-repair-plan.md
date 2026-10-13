# October 13 exact live integrity repair plan

Status: **19 approved mutations APPLIED and verified.** Craig explicitly approved this exact repair batch on October 13. Applied at approximately 16:01 UTC after a fresh dry run found identical targets, source siblings and related occurrences. No active parser was present.

## Scope

**19 paths: 11 updates, 6 deletions, 2 creates**, one guarded atomic Firestore batch.
No venue or media deletions. Current source siblings and related occurrences are backed up; update-time, complete target-data and sibling guards abort on drift. Creates require absent paths, no exact source-ID record and no equivalent dated activity.

Backup: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\luna-oct13-repair\live-backup-2026-10-13T15-55-19-263Z.json`

Exact machine plan: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\luna-oct13-repair\live-plan-2026-10-13T15-55-19-263Z.json`

| Action | Event / current date | Exact path | Intended change |
|---|---|---|---|
| delete | Screamplay! and Evil Dead II / 2026-10-19 21:10 | `venues/slug_thetivolicinema/events/B0lJFx0bZMZBWrSWu95U` | Remove composite Screamplay/Evil Dead listing; preserve existing correct screenings |
| delete | Screamplay! and Evil Dead II / 2026-10-20 21:10 | `venues/slug_thetivolicinema/events/NiPGGgJyAfDuvFMxWuVA` | Remove composite Screamplay/Evil Dead listing; preserve existing correct screenings |
| delete | Back In Black / 2026-10-18 19:30 | `venues/slug_citycinemachtown/events/PARn8DD5TTQUgPqAgKjs` | Back in Black source card says Oct14, not this Oct18 duplicate; preserve Oct14 records pending time/QA review |
| delete | A Long Winter / 2026-10-16 19:00 | `venues/slug_thetivolicinema/events/e26D8wbYhP2Z27GVXSbA` | A Long Winter card and current program name City Cinema, not Tivoli |
| delete | Milton Community Hall event (title not visible) / 2026-11-13 19:00 | `venues/nvQTJXSbDsSfJTCxDKCH/events/OAIV0bPdyNQWoCodVhj6` | Cropped source has no readable activity identity; remove manufactured generic event |
| delete | Milton Community Hall event (title not visible) / 2026-11-14 14:00 | `venues/nvQTJXSbDsSfJTCxDKCH/events/oKOqmdzrGjOJKk9dAXpN` | Cropped source has no readable activity identity; remove manufactured generic event |
| update | In The Heart of The South / 2026-10-18 18:00 | `venues/slug_citycinemachtown/events/ViG0wijW2HqYwhWYdATH` | Printed card and current official program agree Oct16 18:00 |
| update | L'Autre (The Other) / 2026-10-18 20:00 | `venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo` | Current official program and ticket agree Oct16 20:00; old card says Oct18 |
| update | Violinist James Ernes: 50th Birthday Recital Tour / 2026-10-13 19:30 | `venues/slug_sobeyfamilytheatre/events/xNXoeY9sf8n3R7MZfC1s` | Violin recital was correctly classified before cinema venue prior overwrote it |
| update | Leisure and Toddler Pools Open / 2026-10-13 05:30 | `venues/slug_bellaliantcentre/events/akgpr4MJcK4dVN43obb1` | Public leisure/toddler pool access is a sports activity |
| update | Leisure and Toddler Pools Open / 2026-10-13 20:00 | `venues/slug_bellaliantcentre/events/n03e77KuehV7mYNFOwfO` | Public leisure/toddler pool access is a sports activity |
| update | Walking Track / 2026-10-19 08:00 | `venues/slug_easternkingssportsplex/events/QIGk3HATuvKTvgOVlRWm` | Printed seasonal walking access is Mon-Fri08:00-15:00 fromOct19; no invented season end |
| update | Jake Vaadeland and the Sturgeon River Boys / 2026-11-04 18:30 | `venues/slug_trailsidemusichall/events/SB4isg36YH4uFsV1jJUq` | Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description |
| update | Life in the Fast Lane: A Night of the Eagles / 2026-10-29 18:30 | `venues/slug_trailsidemusichall/events/PnGBYC08PbZd1J0OS1Nz` | Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description |
| update | Life in the Fast Lane: A Night of the Eagles / 2026-10-30 18:30 | `venues/slug_trailsidemusichall/events/spQAzzFJu7YJ5KjagTLG` | Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description |
| update | Life in the Fast Lane: A Night of the Eagles / 2026-10-31 18:30 | `venues/slug_trailsidemusichall/events/zJx5OJ2vwHTYYgFsbOAZ` | Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description |
| update | Zumba Adult Fitness Class / 2026-10-07 17:30 | `venues/nvQTJXSbDsSfJTCxDKCH/events/0gGOviSZCv9OE2KhpL3Z` | Separate source-confirmed Oct14 one-hour class; retain original17:30-19:30 for Oct21/28 only |
| create | Beginner WaterColour Course (Session 1) / 2026-10-13 18:30 | `venues/name_6387om/events/oct13_repair_watercolour_20261013` | Add only confirmed Oct13 watercolour Session1 at18:30; retain marked inferred20:30 end; do not invent later sessions |
| create | ZUMBA® adult fitness class with Natalia / 2026-10-14 17:30 | `venues/nvQTJXSbDsSfJTCxDKCH/events/oct13_repair_zumba_20261014` | Add only printed Oct14 Zumba17:30-18:30, one-off |

Write-preview validation preserved original source venue aliases in the create
payload signatures and retained their managed media. Watercolour keeps the exact
source occurrence ID captured by today's writer; Zumba's corrected one-hour end
derives its new occurrence ID through the normal writer. The two create payloads
retain source pricing, including the printed $7 Zumba fee. Counts/paths and
intended activities are unchanged. Latest dry-run/backup paths above supersede
earlier drafts.

## Evidence and boundaries

- Film evidence: [official ANCHOR program](https://www.anchorfest.ca/film) and [L'Autre ticket](https://locarius.io/events/5011/lautre-the-other). In the Heart of the South is October 16 at City Cinema; L'Autre's current program/ticket agree on October 16 at Tivoli. The unsupported October 18 Back in Black and Tivoli A Long Winter records are removed without creating replacements.
- Preserve the already-correct Evil Dead October 19/20 19:15 screenings and existing Screamplay screenings. Delete only the two newly composite Screamplay/Evil Dead records; broad historic cinema deduplication is deferred.
- Hold the existing City Cinema Back in Black 19:00/19:30 pair and A Long Winter October 15/16 conflict. Do not delete a genuine film/Q&A combination or choose between internally inconsistent ticket dates automatically.
- Zumba: the October 14 poster explicitly says 17:30 and one hour. Move the older weekly parent's remaining anchor to October 21, retain its previous two-hour clock for October 21/28, and add October 14 as one one-hour occurrence. Do not infer one-hour duration for future weeks.
- Watercolour: add only the printed October 13 Session 1 at 18:30. The 20:30 end remains explicitly marked as the pre-existing duration default, not printed evidence. Do not create hypothetical later sessions.
- Walking track: Monday-Friday 08:00-15:00 from October 19; no invented season end.
- Trailside: direct source-linked Locarius event timestamps resolve all four performances at 20:00 Halifax on their respective dates. Conversion uses the event-date offset, including the November DST transition. Jake is independently corroborated at [Tourism PEI](https://www.tourismpei.com/what-to-do/events/jake-vaadeland-the-sturgeon-river-boys). Preserve door-time wording and existing end-time provenance; bind each Eagles date to its own source ticket URL.
- Cropped Milton poster records have visible dates/times but no captured activity identity. Delete only the two manufactured generic listings; retain full backups for restoration when a complete source is found.
- Dunes' bad queued dinner payload is NOT in this event batch. Its venue resolution belongs to the location-queue task. A source-evidence handoff is prepared; do not finalize the stale payload as-is.
- Already expired private rental is not included in this cleanup. Existing avatar plans remain separate and unapplied.

## Applied result and verification

One atomic Firestore batch completed: **11 updates, 6 deletes, 2 creates**.
Fresh prewrite backup: `functions/artifacts/luna-oct13-repair/live-backup-2026-10-13T16-00-56-317Z.json`.
Result: `functions/artifacts/luna-oct13-repair/live-result-2026-10-13T16-00-56-317Z.json`.
Verification: `functions/artifacts/luna-oct13-repair/live-api-verification.json`,
checked 2026-10-13T16:04:00.054Z. All 19 Firestore postconditions passed;
all 13 retained/new detail endpoints returned 200 and appeared in the upcoming
feed; all six deleted details returned 404 and were absent. The entire feed
contained 1,009 occurrences over 11 pages. All 42 backed-up, untargeted source
and related sibling documents were unchanged, including correct cinema keepers.
Updates changed only the approved fields. Managed media and venues were untouched.

Confirmed corrected October 14 Zumba 17:30-18:30/$7, watercolour October 13
18:30-20:30 (end explicitly inferred), weekday walking/Sports configuration,
recital/pool categories, film dates and four Trailside 20:00 starts with exact
per-date ticketLink/ticketsBuyUrl metadata. The feed returns the next recurrence,
not all future instances: October 21/28 Zumba and Monday-Friday walking are
verified through returned parent configuration, not claimed as individually
returned future occurrences.

### Additional Zumba sibling: separately approved and APPLIED

The final feed check found a second older parent that the reviewed batch missed:
`venues/nvQTJXSbDsSfJTCxDKCH/events/0niGreSHiC7mgtbxUksA`, title **ZUMBA**,
source ID `1922694639184538_1c89602b9be3537c`. It starts October 7 at
17:30-19:30 with four weekly Wednesday occurrences and currently generates an
additional October 14 listing ending 19:30. This predated the repair and was
preserved unchanged as an untargeted sibling. The batch's intended overall
no-duplicate Zumba outcome initially remained incomplete despite all 19 approved
document changes passing. The separately approved follow-up below resolved it.

Propose updating **only** `totalOccurrences: 1` and
`recurrenceUntilDate: "2026-10-07"` on that older parent. This retains its
historical October 7 record/media, removes its future generated duplicates and
leaves the new October 14 one-hour class plus the corrected October 21/28 parent.
No event, venue or media deletion is proposed.

Guarded dry run: `firebase/repair-luna-oct13-zumba-sibling.mjs` (default read-only).
Exact machine plan:
`functions/artifacts/luna-oct13-repair/zumba-sibling-plan-2026-10-13T16-04-48-479Z.json`.
Full backup:
`functions/artifacts/luna-oct13-repair/zumba-sibling-backup-2026-10-13T16-04-48-479Z.json`.
Craig explicitly approved this additional target ("I approve your request").
A fresh read-only dry run at 21:24 UTC found the target/update time and both
keepers identical to the reviewed plan; no active parser was present. Applied
the two approved fields at approximately 2026-10-13T21:24:30Z with a guarded
atomic update. All other target fields and both complete keeper documents were
verified unchanged.

Fresh backup: `functions/artifacts/luna-oct13-repair/zumba-sibling-backup-2026-10-13T21-24-28-372Z.json`.
Result: `functions/artifacts/luna-oct13-repair/zumba-sibling-result-2026-10-13T21-24-28-372Z.json`.
Public API verification: `functions/artifacts/luna-oct13-repair/zumba-sibling-api-verification.json`,
checked 2026-10-13T21:24:52.570Z. All three details returned 200; the historical
October 7 record remains, with no upcoming feed occurrence. Full feed pagination
(963 occurrences, 10 pages) confirms exactly one October 14 Zumba at 17:30-18:30,
$7, and the October 21 parent at 17:30-19:30 retains two occurrences ending
October 28. The feed returns the next recurrence; October 28 is verified through
the unchanged parent configuration, not claimed as a separately returned instance.
No venue/media changes or parser deployment were needed.

## Original execution instructions

From the repository root, set GATHR_SERVICE_ACCOUNT_PATH to the existing credential without copying it. Run `node firebase/repair-luna-oct13-integrity.mjs --apply --plan=<exact machine plan above>`. The helper creates a fresh backup and refuses an active parser, target/source drift or duplicate create.

After applying: re-read all 19 paths; check every detail endpoint (200/404 as appropriate); paginate the full upcoming API feed; verify Zumba October 14/21/28 without duplicates, the restored watercolour session, weekday walking access and per-date ticket metadata. Recheck preserved cinema and prior-repair controls. Code deployment does not itself apply this plan.
