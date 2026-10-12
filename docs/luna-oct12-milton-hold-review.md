# Milton knitting hold review — October 12

Craig requested a review and a hold/no-hold decision after the approved
14-record repair. This review made no live event or parser changes.

## Decision

Lift the AM/PM hold. The initial decision was too literal about the absence
of printed meridiem and did not give enough weight to the original layout.
Recommended one-off occurrence: **October 14, 2026, 13:30–15:30**, Milton
Community Hall, Knit and Crochet Socials. PM is inferred from source context
and corroborated by the organizer's explicitly afternoon calendar, rather
than claimed to be printed beside the time on the flyer.

## Evidence

- Source post `1927464192040916`, published October 11 at 21:25:19 UTC,
  contains the October 12–18 flyer. Its Wednesday October 14 cell reads,
  top to bottom: 9 a.m. Seniors Fitness with Michele; 1:30–3:30 Knit and
  Crochet Socials; 5:30 p.m. Zumba. An afternoon knitting interval fits this
  chronological sequence; 01:30–03:30 does not.
- Original managed image downloaded and visually inspected:
  `functions/artifacts/luna-oct12-repair/milton-original.webp`.
  Source: https://storage.googleapis.com/gathr-uploaded-images/postimages/1791811206002-528sue.webp
- The hall links its public Google calendar from
  https://miltoncommunityhall.ca/index.php?id=calendar . Its downloaded public
  ICS has a CONFIRMED event titled `Knit and Crochet Socials - FCC Room`:
  `DTSTART;TZID=America/Halifax:20261014T130000` and
  `DTEND;TZID=America/Halifax:20261014T150000`, with weekly recurrence.
  Created August 27 at 17:26:11 UTC; last modified August 27 at 17:26:39 UTC.
  Captured as `functions/artifacts/luna-oct12-repair/milton-public-calendar.ics`.
- https://miltonvalepark.com/october-1-2026/ also describes Wednesday knitting
  socials as 1–3 p.m. This supports afternoon meridiem, but conflicts by
  30 minutes with the newer source flyer. Do not present it as confirmation
  of exactly 13:30–15:30.

The newer dated flyer is the preferred occurrence-specific clock evidence.
Keep its half-hour difference from the older website/calendar explicit;
do not silently replace the flyer time with the older 13:00–15:00 slot or
import the calendar's open-ended recurrence into this one-off extraction.

## Operational status

The approved cleanup removed
`venues/nvQTJXSbDsSfJTCxDKCH/events/pgViRsWspKTtSODqvrN6`, whose unsupported
clock was 01:30–03:30. This review recommends restoration at the corrected
afternoon time, after an exact restoration plan, fresh source/date sibling
check and approval under the event-integrity skill. No restoration occurred
in this review. The deployed strict ambiguity guard remains unchanged; a
future repair must allow sufficiently corroborated context without guessing
PM for every unlabeled clock.
