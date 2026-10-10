# October 10 Stage 2 mixed-offer repair

Craig approved fixing and retesting the two findings from the full Stage 2
evaluation. This release repairs classification and formatting; Stage 2's
allocation stays at 50%. Stage 5's accepted 100% Luna-none release is preserved.
No live event records are written, deleted, or replayed by these tests.

## Changes

- Explicit classifier instructions preserve separately advertised dated meals
  and daily/evening food or drink features without requiring a discount, price,
  or printed serving start. Entertainment does not hide a concurrent offer.
- Conservative caption evidence recognizes local dated serving statements and
  time-limited cocktail features. It does not use a distant music date to turn
  an ordinary menu into a special. Existing inventory/month-long-menu guards
  remain. A single ticket including dinner and entertainment is one activity.
- Small schedules (one to five estimated items) with food-special evidence use
  mixed extraction; dense calendars/schedules retain their inventory routes.
- An aligned validated cocktail special remains a Drink Special even when its
  description mentions trivia. Trivia, workshops, tastings, and competitions
  are not converted merely because refreshments are mentioned.

## Real source retests

Old Triangle row 35 / `1737936975008400`: fresh raw Luna classification now
reports both flags and mixed content. Three downstream replays retain Kelley
Mooney October 9 at 20:00, Marc Coughlin October 10 at 20:00, Irish Music Session
October 11 at 14:00, and the **October 11 two-course turkey dinner as a food
special**, $24.95 plus tax. The untimed dinner uses frozen venue hours under
the existing hours policy; 11:00 is not a newly discovered printed serving time.

Local Pub row 53 / `1128140023071506`: fresh raw Luna classification now retains
both trivia and Warren Grove Sour Smash. Three downstream replays retain trivia
October 9 at 19:00 and the cocktail **as a Drink Special, not a trivia event**.
Its untimed serving start likewise comes from frozen hours, not the caption.

The first repair rehearsal revealed a risk of separating the food included in
Albert & Crown's ticketed dinner concert (row 97). The final prompt explicitly
distinguishes separately available offers from included food. The original
poster was visually inspected: November 14, 2026, 18:00–21:00, $40 per ticket.
The final classification and downstream replay produce exactly one dinner/music
event, with the printed date/time and no separate meal listing.

## Full-cohort regression evidence

Repeat every Stage 2 evaluation from completed October 10 dataset
`1a8FFxUSkseWH6poV4-Htdhv4BRUSNlZl`: **90 evaluations, 86 rows, 85 unique source
post IDs**, using the same frozen preprocessed galleries as the earlier paired
audit. The final repair has 98 Luna requests (90 none, eight high reviews), zero
errors, zero incomplete responses, and zero classifier fallbacks. No confidence
gate changes: row 195 remains the sole held source row.

The two intended final route changes are rows 35 and 53 to mixed content.
Other changes were inspected: row 136 goes from mixed to food-only and retains
both Thanksgiving meal options and their October 11–12 ranges before venue-hour
resolution; row 291 goes to schedule and retains all three adult/youth painting
classes with their printed starts and finite source schedule metadata.

Nine fresh live API policy controls pass: ordinary monthly menu, ordinary soup
restock, monthly cocktail feature, ordinary menu beside music, cocktail workshop,
special guest, public studio tour, dated unpriced meal beside music, and bundled
dinner/show admission. Rejected controls retain low confidence; activities stay
activities; only the separate dated meal creates the mixed special route.

There are **16 downstream dry replays** across the repair rehearsal, repeat,
and final policy passes. Besides the two targets, they preserve Coach's two
dinner dates, the carrot deal, the October 11 turkey dinner, the cake/toddy offer,
the October 9 roast-beef dinner, and the $1.49 bread offer. The final pass also
checks the bundled show, Thanksgiving meal date range, fitness source, and
three-class painting schedule. Some untimed fixture outputs remain held when an
exact canonical venue-hours lookup is unavailable. These are not proof of a
production write or newly printed serving hours.

Local dry-run venue matching now permits a unique frozen venue name before its
`| city` suffix. It rejects ambiguous matches. This fixes the prior harness
limitation for Coach's and Old Triangle; it does not change production venue
matching or use external enrichment. Website/ticket calls and writers are
disabled. Raw API output remains separate from deterministic repairs.

Final full-cohort Stage 2 token estimate: **$0.084529**, versus today's Mini
**$0.239678** (64.7% lower). Summed API time **335.442 s**, versus **443.258 s**
(24.3% lower). These are measured Stage 2 cohort results, excluding preprocessing,
not guarantees of whole-parse savings or an invoice.

Build passes. All **586 compiled backend tests** and **66 Stage 2 safeguard,
allocation, gallery and Stage 5 effort script checks** pass. The final category
suite also passes all 18 checks, including explicit food/event flags.

## Release gate

Fresh read-only preflight at 17:43 UTC confirms completed processing lock,
processed marker, final batch, no checkpoint and no active parser workers.
All three production functions are ACTIVE on the accepted Stage 5 release hash
`957b8bb84d3c2dd0237729e271666d39dc1dc1f4`; Stage 2 is 50%, Stage 5 is 100%.
No accepted release is replaced with an older checkout.

The narrowly targeted deployment dry run succeeds for `processDataset`,
`processDatasetResume`, and `processDatasetSelectedRows` in `gathr-migrated`,
codebase `gathr-functions`. Deploy these fixes with the existing allocation,
then independently verify ACTIVE state, latest traffic, common source hash and
all model settings. An outdated firebase-functions SDK warning remains; the
agreed SDK upgrade deferral is preserved.

A 100% Stage 2 rollout is now supportable from this dry-run evidence, subject
to Craig's rollout decision and the next full production audit. This repair
does not itself increase the percentage or repair older live records.

## Saved evidence

- `artifacts/luna-oct10-production-audit/stage2-specials-repair-summary.json`
- `artifacts/luna-oct10-production-audit/stage2-specials-repair-downstream-ledger.json`
- Private raw classifier responses, images, downstream stage objects, tests and
  deployment logs: `C:\Users\craig\.codex\luna-oct10-audit\stage2-specials-repair-*`.
  The original pre-repair evidence remains available separately.
