# October 17 Junior Curling sibling review

## Source and live proof

Read-only capture: `firebase/artifacts/oct17-curling-siblings/curling-live-readback.json`
at 2026-10-17T19:04:10Z. Source root `1732518712212204`, Montague Curling Club,
two original parse snapshots, five source siblings across the venue. All five
detail endpoints returned 200; the complete active feed contained 967 entries on
10 pages at 19:08:43Z. The October 17 registration was correctly expired; the
October 25 registration was present. All five retained managed images returned
200. No live mutation or paid model call occurred.

The original poster was downloaded and visually inspected. It explicitly names
children's Junior Curling, U9 Tuesday/Sunday and 10-and-over Thursday/Sunday
sessions. Its programme-start statement is **Gets under way Nov 2nd**; signup
opens October 3. The original caption separately gives October 17, 13:00–15:00
and October 25, 15:00–17:00 in-person registration. Registration dates must not be
treated as programme dates.

## Exact family-only batch, prepared but not applied

Parent prefix: `venues/1ehK5wrBKC460QSpqUMq/events/`.

| Parent | Listing | Old score | Current deployed v6 score |
|---|---|---:|---:|
| `OIRtvQql4zXietvUNQ2L` | U9 Sundays | 15 | 100 |
| `jW8Aw7dBxPi1Y9BBUEvR` | U9 Tuesdays | 15 | 100 |
| `c8LLevWr1BIaAxFyHscb` | October 17 registration | 15 | 70 |
| `xeMgDmynvM7nuYntOGtQ` | October 25 registration | 15 | 70 |

Update only the five `familyFriendly*` fields returned by the actual deployed
family-friendly-v6 scorer and `updatedAt`. Increment `runtime_metadata/event_feed`
302 to 303. Preserve the already repaired Thursday parent
`A3QGhNGCFKfVvEElf4WB` at 70. No source, timing, recurrence, venue, image or
engagement field is changed by this batch. Updating historical registration
metadata does not revive its expired occurrence.

Default-dry helper: `firebase/repair-oct17-curling-sibling-family.mjs`.
Its live dry run passed: five source siblings, nine pinned read-set documents,
zero active parser locks, feed 302, zero writes. It scans the complete events
collection group for source siblings and compares full document hashes plus
update versions. The transaction repeats all guards. Any drift aborts.

Exact private plan: `firebase/artifacts/oct17-curling-siblings/four-family-reviewed-plan.json`.
After approval, the helper requires `--apply` and writes complete timestamped
`four-family-prewrite-backup-<UTC>.json` and `four-family-result-<UTC>.json` in that
folder. Independent post-write verifier:
`firebase/verify-oct17-curling-siblings.mjs --after`; checks exact deltas, unchanged
controls, five detail endpoints, every active-feed page and retained media.

## Newly proven scheduling defect: not repaired by the family batch

Current recurring parents begin October 1/4/6. Current app-feed occurrences are:

- Thursday October 22, 15:30–16:30: `A3QGhNGCFKfVvEElf4WB_20261022`.
- Sunday October 18, 13:00–14:00: `OIRtvQql4zXietvUNQ2L_20261018`.
- Tuesday October 20, 15:30–16:30: `jW8Aw7dBxPi1Y9BBUEvR_20261020`.

These October programme occurrences conflict with the original November start.
The confirmed registration events are separate and must remain unchanged.

Current first-party registration pages explicitly name 2026/2027 but all three
give November 4, 2026–April 28, 2027 despite describing Tuesday/Thursday/Sunday
sessions. November 4 is Wednesday. Their bounds therefore cannot be treated as
exact first-session dates. The poster gives November 2 without a printed year.
The public club calendar contains the exact two registration sessions but no
Junior Curling weekly session entry resolving this conflict. Do not invent a
first occurrence or season horizon, copy the separate Learn to Curl programme,
or recreate the absent 10-and-over Sunday parent.

Sources checked October 17:

- [Official club site](https://montaguecurling.ca/).
- [Tuesday U9 registration](https://montague.curling.io/en/events/30555-tuesday-afternoon-u9-juniors).
- [Thursday 10+ registration](https://montague.curling.io/en/events/30556-thursday-afternoon-juniors-ages-10).
- [Sunday U9 registration](https://montague.curling.io/en/events/30558-sunday-afternoon-u9-juniors).
- [Club schedule](https://montaguecurling.ca/club-schedule/), public calendar
  `montaguecurlingclub@gmail.com`, saved locally as `club-calendar.ics`.

Recommendation: review a separate exact hold/removal batch for these three
programme parents until a first-party schedule establishes their first sessions.
Preserve both registration listings. A general parser hardening must distinguish
registration opening, in-person signup and programme commencement before
publishing weekly occurrences. No timing repair, hold write or parser deployment
has been performed as part of this review.
