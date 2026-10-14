# October 14 location/source follow-up handoff

Craig approved this handoff; it was sent to **Review GathR location queues**
on October14 at approximately18:01 UTC. No further venue or event mutations
are authorized by this document. Use that task's
exact-target approval/backup gates for any live repair.

Source post: Carrefour ISJ `1539985468169427`, row168. The verified source ID
is retained in each frozen item/writer preview. Caption links to
[the organizer's 2026 program](https://www.belle-alliance.ca/festival-de-la-citrouille)
and its [original bilingual PDF](https://www.belle-alliance.ca/_files/ugd/b35d6e_752ed570d7a946c8af80537fffa039e7.pdf).
The parser's small Facebook-image extraction is unreliable; do not use its frozen
21-item identities as publication evidence. The full original was rendered and
visually reviewed with the PDF skill, then reread by Luna high and passed through
actual Stage4 Nano low / Stage5 Luna none. All31 supplied occurrences survived.
Only the separately reviewed 13 known-venue public activities enter this task's
live repair plan. Avoid duplicating them in any follow-up.

## Existing Ghostwalk with wrong location

`venues/slug_harbourfronttheatre/events/pZJuPZ8TpO1MYUgCndDD`
is currently titled Summerside Historic Ghostwalk, October15 18:30, at
Harbourfront Theatre. The original program identifies departure from MacNaught
History Centre and Archives,75 Spring Street, Summerside. Existing venue:
`slug_macnaughthistorycentrearchives`. Tours depart every10 minutes18:30–20:00,
approximately one hour each. Trace the existing record and its source before
deciding whether to move/update/merge; do not create a second Ghostwalk blindly.

## Museum activities requiring a real venue resolution

Night at the Acadian Museum, Miscouche: October22 and23, half-hour experiences
starting18:00 through20:30. Both dated organizer registration pages and the
original program confirm the activity. The exact Acadian Museum venue was not
found in the read-only venue scan. Preserve the twelve bookable slots in the
review evidence; verify the last-slot end and organizer page's booking-window
semantics before choosing a publication shape. Do not substitute Centre
Belle-Alliance, the publisher Carrefour ISJ, or an unrelated Acadian centre.

## Area activity

Witches on Water Street, October31 12:00–14:00, Summerside. The program describes
a booth on Water Street between Granville and Central. Preserve an appropriate
area/city identity; do not invent a venue or use the publisher's address.

## Source conflicts/access questions retained here

- Kool Breeze corn-maze discount: the brochure shows18:30 but its registration
  page startsOctober15 09:00 and the offer runsOctober15–31. This is a source
  semantics conflict, not authority to create a daily18:30 slot.
- Music at Summerset Manor/Wedgewood: no confirmed general-public attendance
  evidence in the supplied brochure. Keep this access question visible.
- School/daycare pumpkin carving is explicitly for students/staff and has no
  printed public start time. It is excluded from the public recovery batch.

Local evidence is under `functions/artifacts/luna-oct14-repair/`, including
festival-source.pdf, festival-source-en.png, festival-original-stage3.json,
festival-original-stage4.json, festival-original-formatted.json,
festival-details.json and festival-venue-evidence.json. The task's separate
live repair plan contains the exact13 festival create paths to preserve.

## Completed read-only investigation and independent review

The requested location-task handoff completed on October14. Its report is at
`C:\Users\craig\Dev\gathr-apps-script\firebase\artifacts\oct14-location-followup\location-followup-report-2026-10-14.md`.
The originating task independently reread the live Ghostwalk, MacNaught venue,
Water Street event and published city review, then scanned venue and event
records for relevant identities. Readback evidence:
`functions/artifacts/luna-oct14-repair/location-followup-independent-readback.json`.

- Ghostwalk remains one record under Harbourfront, October15 18:30–23:00.
  The organizer page independently confirms departures from MacNaught,
  75 Spring Street, every10 minutes18:30–20:00. MacNaught already exists.
  A future repair must preserve the event identity/media and reconcile its
  nested document path with venue binding. Do not assume changing venueId
  alone implements a safe move. The proposed21:00 finish is derived from
  the final departure plus approximately one-hour duration, not a printed
  exact event end. Retain the tourism source's conflicting departure claim.
- No matching Acadian Museum venue or museum event was found in the fresh
  scan. The organizer page independently confirms23 Main Dr E, Miscouche
  and half-hour experiences starting18:00 through20:30. Two dated cards
  with the schedule preserved are reasonable;21:00 is duration-derived.
  Distinguish the published six-start schedule from currently available
  ticket types: the live October22 page presently exposes four ticket types,
  so do not claim all six departures remain purchasable. A verified venue
  and an exact guarded publication plan remain required.
- Water Street already has sole keeper
  `events/area_b485660f4ff8a25e33dd83bb`, October31 12:00–14:00,
  venueId null, locationScope/mapMode area. Its description covers the street
  closure from Granville to Queen. The program's Granville-to-Central booth
  is supporting activity context; do not create a duplicate or point venue.

No additional live mutations were made. These recommendations are separate
from the applied26-record batch and require concrete guarded plans before
any additional live repair approval.
