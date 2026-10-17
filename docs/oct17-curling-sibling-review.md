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

## Initial family-only draft, superseded; not applied

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

## Combined correction ready for one approval

The family-only draft is superseded by this eight-operation plan. Do not apply
both helpers: they share feed-version preconditions and incompatible dispositions.

1. Remove exactly the three prematurely active programme parents
   `A3QGhNGCFKfVvEElf4WB`, `OIRtvQql4zXietvUNQ2L`, `jW8Aw7dBxPi1Y9BBUEvR`
   under the full parent prefix above.
2. Create `event_integrity_holds/oct17_curling_programme_start_1732518712212204`
   retaining all three complete original events, snapshot hashes and source
   conflict evidence. No replacement date is invented.
3. Update only `reviewedOccurrenceConstraints` on
   `venues/1ehK5wrBKC460QSpqUMq` with the serving parser's existing exact-ID hold
   contract for those three identities. Existing rules remain; the two signup
   identities pass the actual serving classifier unchanged. This prevents exact
   old identities from being recreated; it is not a general programme-start
   extraction fix and does not promise to block every newly generated identity.
4. Refresh only family metadata on the October 17 and October 25 registration
   parents `c8LLevWr1BIaAxFyHscb` and `xeMgDmynvM7nuYntOGtQ` to v6 score70.
   Their exact dates, clocks, expiry, sources and all media remain unchanged.
5. Advance `runtime_metadata/event_feed` from302 to303.

Default-dry `firebase/repair-oct17-curling-season-hold.mjs` passed fresh live
preconditions for all eight operations: five exact source parents across the
complete collection group, ten read-set documents, no active parser, feed302,
absent hold destination and full hash/update-version guards. Actual compiled
serving-classifier playback holds all three programme identities and leaves
both registration identities alone. No new parser runtime/deploy is needed for
this data batch. No writes have occurred.

Private plan: `firebase/artifacts/oct17-curling-siblings/season-hold-reviewed-plan.json`.
Apply requires `--apply`, repeats all transaction guards, and first writes
complete `season-hold-prewrite-backup-<UTC>.json` plus a separate result receipt.
Independent verifier: `firebase/verify-oct17-curling-season-hold.mjs`; requires
an applied result, verifies all eight exact deltas and untouched snapshots,
three details404, both signup details200, absence of deleted parents/generated
occurrences from every active-feed page and complete source catalog, future
signup exactly once, expired signup absent, and all retained images200.

This exact deletion/hold batch needs the event-integrity skill's reviewed
production-data approval because the newly established schedule conflict was
not included in Craig's earlier score-refresh approval.
