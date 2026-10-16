# October 16 audit fixes: independent source verification

This supplements `luna-oct16-production-audit.md`; it does not rewrite what was
known during that audit. Craig authorized fixing all eight groups after the
audit. Source research and implementation are now in progress; no production
change is implied by a confirmed source.

Coordinator: `codex/shared-offer-origin-20261014`, audit commit `d9af0a3`.
Implementation task: **GathR October 16 audit fixes — all eight…**,
`01a14637-2ddc-7900-abe0-33873decd655`, isolated `a2af/gathr-apps-script`,
starting from accepted serving parser commit `8e366b3`. It owns implementation,
tests and guarded plan preparation; coordinator owns independent review and
production release/mutation targets. No concurrent release owner.

Private evidence: `functions/artifacts/oct16-audit-fix-coordination/`.
All research in this document used read-only public HTTP, existing source
images and Firestore. No new generation calls or data writes by the coordinator.
Implementation task's bounded model evaluation must be accounted separately.

## Al Tuck: date and show start confirmed

Direct public HTTP succeeded where the earlier web fetch had not. The original
[ticket URL](https://locarius.io/events/5139/al-tuck-october-28th-25-doors-630-pm)
explicitly advertises October28,2026,20:00 at Trailside Music Hall,155 Kent St,
Charlottetown. The title uses25 as a dollar price and18:30 as doors opening.
The printed show clock agrees with UTC23:00 in its event metadata after Halifax
conversion. The page's AST abbreviation should not independently redefine the
Halifax time zone. A finish appears only in metadata, not a printed show-end
statement; do not manufacture an advertised finish.

This is now a confirmed bad Stage1 expiry rejection. Recovery may be prepared
with original source `1559528609526804`, exact existing Trailside venue and
ticket identity, subject to fresh sibling/media/expiry and approval checks.
Do not fix it by globally converting two-digit URL tokens into years or prices.

Evidence: `altuck-ticket.html`, `altuck-ticket.txt`, `first-party-results.json`.

## Learn to Curl: administrative clock distinguished from real sessions

The [programme page](https://montague.curling.io/en/programs/828-learn-to-curl)
really displays08:06 for course start/end and registration start/end. The
initial audit's unverified website attribution is therefore refined: this was
real copied metadata, not a proved invented digit sequence.

The current [league entry](https://montague.curling.io/en/events/30631-learn-to-curl)
matches the November12–December17 course and gives dates without class clocks.
A separate Thursday social league has18:15/20:00 draws; those alone cannot
supply a clock for a different programme.

The [official club schedule](https://montaguecurling.ca/club-schedule/) embeds
the club's public Google calendar. Its
[public calendar export](https://calendar.google.com/calendar/ical/montaguecurlingclub%40gmail.com/public/basic.ics)
contains the exact Learn to Curl entry, last modified October13:

- Starts November12 at18:15, ends20:00, `America/Halifax`.
- Weekly Thursdays, count6: November12,19,26; December3,10,17.
- Exact title and course start/end dates agree with the current league and
  source caption; this is not borrowed from the separate social league.
- Two membership rallies agree with October17 13–15 and October25 15–17.
- Three independent try-curling sessions agree with October28/29/30 18–20.

Use source-role/date/identity validation to prefer the actual session evidence
over registration metadata. Never blacklist08:06 or substitute an ordinary
venue opening hour. A verified official-calendar source can support a guarded
repair; reusable discovery/enrichment needs its own tested bounded contract.

Evidence: `curling-course.html/.txt`, `curling-detail-0/1/2/3.html/.txt`,
`curling-schedule.html/.txt`, `curling-current-public-sessions.json`.
The full public ICS also contains unrelated club bookings and contact details;
keep it private, do not commit it or use those bookings as publication candidates.

## ADL Room: exact existing library parent confirmed

The original October15 planning-session poster explicitly gives57 Central
Street, Summerside, and the downstairs ADL Room. Existing
`venues/KeaYNQ0m7AfE583KyS5R` is Summerside Rotary Library at that address.
Official PEI government [room context](https://www.princeedwardisland.ca/en/news/public-libraries-hosting-virtual-health-care-workshops)
also names that library's ADL Room; its older date is corroboration, while the
current poster supplies the relevant address.

Stage3 already captured the confirmed address inside `spatial.locations`;
the formatted event lost it. Preserve exact source spatial/address identity
through formatting/resolution. Do not solve it with a bare-room fuzzy alias.
The original session is past; a queue disposition or historical repair is not
authority to create a new upcoming activity.

Evidence: source `1537416011758103`, original audit image
`source-images/03f01c08e83c77522e32.img`, ledger259 and fresh queue/venue readback.

## Witches: participant locations versus contributing businesses

Both original posters are the same activity lineup for October31 12–14.
Actual activity locations use “at”: Daisy-Mae Bookshop, Summerside Rotary
Library and Holman's Ice Cream Parlour. Art Buds, Most Wanted Pawn, Famous
Peppers and Kool Breeze Farms are named as providers with “by” or “from”.
Those words do not establish that people should visit those businesses.

Known exact venues include the library and `slug_holmansicecream`, both with
existing coordinates, and `slug_daisymaebookshop` at250 Water Street. The
bookshop's canonical coordinates/Place identity are missing; do not invent a
point. Keep it as source-supported participation context until deliberately
verified. Do not confuse Holman's Gardens or The Holman Grand Hotel with the
ice cream parlour. Locations are unordered; do not create a route or duplicate
per-stop events. Any public recovery still requires the exact reviewed plan.

Evidence: audit images `f590fdf8a095d1e7478f.img` and
`9d49da31d096d5642c31.img`; sources `1730474092415686` / `1708152184652928`.

## Two Pianos: venue and start confirmed; finish remains unknown

The [official hall site](https://sourisshowhall.com/) links the
[specific ticket page](https://locarius.io/events/4541/two-pianos-no-rodeo),
which confirms October24,2026,19:30 at Souris Show Hall,5 Church Avenue.
Metadata has the same start and end; it does not substantiate21:30 or01:00.
The legacy city root has no timing flags, so its21:30 must not be presented as
a source-proven finish. Prepare source-clean venue scope and honest unknown-end
metadata without changing the event ID or discarding its retained media.

Evidence: `souris-home.html`, `twopianos-ticket.html/.txt`, fresh root/review data.

## Belly Dance: deletion still requires identity proof

The first-party poster proves19:00,55-minute ongoing Friday classes with Alika
at135 Great George Street, second floor, and all levels welcome. The existing
studio identity and its website corroborate Side Door at that address. Its
class-registration page is empty and cannot prove exclusivity.

The aggregator names a beginner class at the same venue/date/start but gives
no instructor/room. Historical Autumn2026 OCR suggests separate18:00/19:00
levels, but that original could not be downloaded and has no managed image in
its saved snapshot. OCR alone is not independent confirmation. Keep the
probable duplicate deletion held until exact identity is proved; first-party
duration/recurrence can be repaired separately. Do not turn this into a global
class-title alias or merge legitimate parallel classes.

Evidence: `studio-source-history.json`, `studio-autumn-manifest.json`,
`studio-home.html/.txt`, `studio-registration.html`, `studio-events-page.json`.

## Fresh target state and production boundary

At19:40:50UTC, all23 selected event/venue/queue/edition/feed documents existed,
their three related city reviews were captured, and no parser lock was active.
Full target versions/data: `live-source-readback.json`. This is a preparation
snapshot; the eventual guarded helper must reread, back up and abort on drift.
The event-integrity skill requires exact reviewed actions/paths/backup/verification
before production mutation. Combine confirmed corrections and narrow releases
into one short approval batch; preserve unresolved identities as explicit holds.
