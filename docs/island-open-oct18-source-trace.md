# Island Open: October 18 app report

Status: confirmed historical false recurrence; diagnosis complete. No live change,
parser deployment or paid replay performed for this report.

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
and once with the full original caption. Both retain `true/weekly_sunday`.
This reproduces a surviving normalization weakness; it is not a paid end-to-end
extraction test. `hasRecurringCue` currently treats singular `weekend` as recurrence
evidence, including the bounded phrase `this weekend`.

## Proposed correction and prevention

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

Two other Belvedere parents are review candidates with similar finite-weekend prose:
`tUv7AmMHnPS30LCqVAvX` (Two-Ball Matches, September 19) and
`wpI7jjHQcP1JHUeb9rCr` (Singles Matches, September 20), source
`1699120275547638`. Their original snapshot and complete timing/lifecycle evidence
must be reviewed before including them in a repair batch. Today's Tough Person
tournament and October 23 Golf Foundation Draw are separate nonrecurring records.
No sibling is implicitly included in the primary target's proposed correction.
