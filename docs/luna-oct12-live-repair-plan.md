# October 12 exact live repair plan — applied and verified

Craig approved this exact plan with “I approve” after the parser safeguards
were deployed and independently verified. Guarded script:
`firebase/repair-luna-oct12-integrity.mjs` (no arguments = dry run).

Final dry run completed October 12 at 16:08 UTC after verifying no active parser.
It reread all 14 targets, checked exact fingerprints and recurrence shape,
captured same-source siblings across the events collection group and related
venue/date records, and saved complete records before proposing changes.

Local full backup:
`functions/artifacts/luna-oct12-repair/live-backup-2026-10-12T16-08-40-469Z.json`.
Exact target/action/update-time plan:
`functions/artifacts/luna-oct12-repair/live-plan-2026-10-12T16-08-40-469Z.json`.

Apply requires the approved plan file, unchanged record hashes, exact Firestore
update timestamps, unchanged sibling/related-record hashes and no active parser.
The 14 operations are one guarded atomic batch. Record IDs, source IDs,
recurrence and media remain unless the approved action deletes the record.
No media or venue deletion is included. A delete retains its complete backup.

## Eleven updates

| Exact path | Proposed change | Evidence / limits |
|---|---|---|
| `venues/slug_chambersrestaurant/events/fNQMBf8SmZpyFTVyWZcW` | Oct 13 mac-and-cheese lunch: 17:00–21:00 → 11:00–13:30 | Original dated lunch poster plus current official lunch service hours |
| `venues/slug_chambersrestaurant/events/G4TX7ui4tdAmRJL0kIZY` | Oct 14 Swiss steak: 17:00–21:00 → 11:00–13:30 | Same |
| `venues/slug_chambersrestaurant/events/aR5TwlLPYwOsP8PBjNri` | Oct 15 seafood crepe: 17:00–21:00 → 11:00–13:30 | Same |
| `venues/slug_chambersrestaurant/events/1MAjyg2swS7g3jPZ3ebX` | Oct 16 pork schnitzel: 17:00–21:00 → 11:00–13:30 | Same |
| `venues/slug_citycinemachtown/events/fdb8VaM7ZGSbChf3jtYI` | Back In Black: Oct 19 → Oct 14, keep 19:30 | Printed card; separate row 85 Q&A/19:00 keeper remains unresolved and untouched |
| `venues/slug_thetivolicinema/events/ML7bTSmmRtAAPZy24OeR` | Back In Black: Oct 18 → Oct 14, keep 19:30 | Printed card's separate Tivoli line |
| `venues/slug_citycinemachtown/events/ffHWF306JJWirP4DaFMH` | A Long Winter: Oct 18 → Oct 16, keep 19:00 | Printed card |
| `venues/1ehK5wrBKC460QSpqUMq/events/ihXEVvVDroR8rqQll94j` | Volunteer help → Gatherings & Parties / event flags; clear unprinted 21:00 end | Original caption explicitly Monday morning at 10 a.m.; incidental turkey dinner is not the activity |
| `venues/DqhaDw4xcuBFIm6WCQSq/events/sjLQqSYJhqiUigyxcla9` | “Lunch with Nancy Taber & Katie Mac” → “Book Launch with Nancy Taber and Katie Mac”; correct category/type flags and source-supported book-launch description | Same publisher, authors, venue, Oct 16 19:00; preserve ID, stored end and media |
| `venues/slug_bostonpizzacharlottetown/events/UGPSmkwEFYiZzQc7eLX2` | Oct 20 offer start 11:00 → 20:00 | Same Trivia Tuesday block; existing inferred 21:00 closing end remains inferred, not printed |
| `venues/name_2lgcnn/events/Hzlbjr0vwVKvmfHlMK6C` | Coats for Kids → Gatherings & Parties / event flags | Correct clothing campaign; existing 08:00–21:00 hours remain venue-derived and unconfirmed |

Chambers' first-party page lists weekday lunch as **11 AM–1:30 PM** and dinner
as **5–9 PM**, directly explaining the wrong borrowed dinner period.
Source: [Chambers Restaurant & Bar](https://www.roddvacations.com/rodd-charlottetown/dining/chambers-restaurant-bar).

## Three removals

| Exact path | Reason |
|---|---|
| `venues/nvQTJXSbDsSfJTCxDKCH/events/pgViRsWspKTtSODqvrN6` | Hold genuine Oct 14 Knit and Crochet Socials pending AM/PM confirmation; current 01:30–03:30 is unsupported. This removes a wrong clock, not a determination that knitting is out of scope. |
| `venues/fb_100064116963888/events/HiLFpkYIw4nqzK2cpudo` | Expired Oct 11 “Weekend Brunch” incorrectly priced at $5. The $5 offers were drinks; no expired replacement is proposed. |
| `venues/fb_100041851131270/events/XbLA2IHZ9j2P90c6zaeU` | Ordinary limited-time burger advertisement, not an advertised deal. |

## Verification after approval

Fresh reread and backup → atomic guarded batch → verify every Firestore patch
or absence → inspect public event detail endpoints and the fully paginated
`includeExpired=false` app feed. Source/venue/media identities and recurrence
siblings are retained. Verify the four lunches survive with their correct
dates and midday service; verify no proposed film correction adds a document.

Prepared read-only API baseline: all 14 target detail endpoints returned 200;
the complete upcoming feed contained 981 unique IDs across 10 pages.
`functions/scripts/luna-oct12-live-repair-verify.mjs before|after <plan>` records
detail/field checks and checks deleted IDs against that paginated feed.

Do not broaden this plan to the disputed film cards, Q&A keeper, other untimed
dinners, inherited historical category issues, Olde Dublin's profile 404 or
general deduplication. Those remain explicitly separate observations.

## Approved apply and verification

Applied on October 12 using the exact 16:08:40 plan above. The script confirmed
no active parser and unchanged target hashes, precise update timestamps,
source siblings and related occurrences, then executed exactly **11 updates
and 3 deletions** in one guarded atomic batch. All 14 Firestore postconditions
passed. No media or venue documents were changed.

- Fresh complete prewrite backup:
  `functions/artifacts/luna-oct12-repair/live-backup-2026-10-12T16-28-44-613Z.json`
- Apply result:
  `functions/artifacts/luna-oct12-repair/live-result-2026-10-12T16-28-44-613Z.json`
- Apply console log:
  `functions/artifacts/luna-oct12-repair/apply-approved.txt`
- Public API verification at 16:29:14 UTC:
  `functions/artifacts/luna-oct12-repair/api-after.json`

Public verification passed 14/14: all updates return 200 with the requested
title/description/category/date/time/type fields; all three deletions return
404 and are absent from the complete upcoming feed. The feed was fully
paginated across 10 pages, containing 980 distinct IDs. Future updated records
remain in the feed. This count is a whole-feed snapshot, not an assumption
that three deletions must reduce the upcoming count by three; two removed
records were already expired.

No standalone expired-event feed probe was present in this checkout or the
main parser repository. The target-specific check above explicitly queried
each removed detail and the complete `includeExpired=false` feed.

Milton remains withheld pending AM/PM confirmation. Coats' inherited hours
and the separate film/Q&A conflict remain unresolved as described above;
the unreliable automated film experiment was not deployed.
