# Milton knitting hold review — October 12

Craig requested a review and a hold/no-hold decision after the approved
14-record repair. The initial review was read-only; Craig subsequently approved
the restoration and narrow context guard described below.

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

## Approved restoration and prevention follow-up

At 17:05 UTC October 12 the original record was restored with a create-only
precondition, after a fresh same-source/date sibling scan found no competing
knitting occurrence. Source, venue, media, createdAt and one-off lifecycle were
preserved. Start/end are now 13:30–15:30, marked `implied` with the source
reasoning and older-calendar discrepancy. The erroneous ambiguity-only public
description was cleared. No other live record was changed.

- Helper: `firebase/restore-milton-oct14-2026.mjs`.
- Approved plan: `functions/artifacts/luna-oct12-milton/restore-plan-2026-10-12T17-05-13-573Z.json`.
- Fresh prewrite backup: `functions/artifacts/luna-oct12-milton/restore-backup-2026-10-12T17-05-37-998Z.json`.
- Firestore result: `functions/artifacts/luna-oct12-milton/restore-result-2026-10-12T17-05-37-998Z.json`.
- Public verification at 17:06:37 UTC: detail HTTP 200, exact date/clocks, and
  exactly one target ID in the 974-event fully paginated upcoming feed.
  Evidence: `functions/artifacts/luna-oct12-milton/public-verification.json`.

The narrow parser guard resolves an explicitly ambiguous bare range only when
the same calendar day and image contain printed AM/PM anchors before and after
it in chronological extraction order, with one possible interval between them.
It records inference metadata and preserves it through formatting. Isolated,
cross-image, cross-date, contradictory and insufficiently anchored clocks remain
held; explicit AM/PM and 24-hour clocks are unchanged. This is a source-layout
guard, not an external-calendar lookup or a general afternoon assumption.

Validation: build passed, focused tests 30/30, full compiled backend 631/631.
Captured October 12 cohort playback changed only the Milton knitting range.
A fresh paid three-item Wednesday replay kept all three items through Stage 4
Nano low (7.926 s) and Stage 5 Luna none (5.550 s); knitting retained October 14
13:30–15:30 with implied flags. Both responses completed; no retry or fallback.
Evidence: `functions/artifacts/luna-oct12-milton/api-replay.json`.
Release status is recorded in `luna-oct12-milton-context-release.md`.
