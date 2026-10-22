# October 22 regular parse — source-to-output accuracy audit

## Scope and result

**Completed read-only review; NOT a clean semantic pass.** This is the October 22 audit, not a repeat of the completed October 21 release/repair. No production writes, repair, deployment, paid replay, new scrape, model invocation, gate change, map interaction, unchanged test suite or new task occurred during this audit.

- Dataset: `10i5p3EGVPCEYvVUx2aZdx-Dq7kHSaa0a` (`APIFY Dataset.xlsx`, original Drive workbook).
- Run: `72047e56-f51c-4c1d-b2b2-f84a4ec86621`.
- Started 2026-10-22 12:39:38.662 UTC; finished 14:11:42.104 UTC (09:39–11:11 Halifax; 92m03s).
- Completion receipt supplied and read: completed lock, processed marker, final batch 378/378, zero matching checkpoints, zero processing errors. Receipt retained as `completion.json` below.
- This audit is under `functions/artifacts/luna-oct22-production-audit/` in this checkout. The raw workbook, captions, snapshots, exact write audits, original-image capture, source inventory, current canonical records and API receipts are retained locally.

## Coverage and reconciliation

All **378 raw rows** were classified: 214 scraper result rows (196 `no_items`, 18 `not_available`) and **164 actual posts**. All 164 retained original captions/shared captions were read. Eight real posts did not reach a snapshot: exact execution logs establish seven outside-region exclusions and one `No text content` exclusion (Sport PEI row50). Do not count those eight as model rejections. The two Club posts are outside the configured PEI coverage; their advertised food/live music was not silently lost in a PEI extraction stage.

There are **156 parse snapshots**, including 67 Stage1 rejections. Available galleries were inspected in source order: **221 original media references attempted once, 198 available references, 196 distinct image byte sequences**; nine labelled contact sheets were reviewed, with larger originals opened for City Cinema, Alberton programmes, Milton calendar, Tyne Valley schedule, Stratford public viewing and pottery hours. Twenty-three original references timed out and were not retried; affected rows are recorded in `media-manifest.json`. Of 25 video-thumbnail references, 22 were available. **No full video/audio content was reviewed.** Contact-sheet review is visual screening, not a claim that every small-print glyph was independently transcribed. Dense-source findings below use enlarged originals. No 100% recall claim is made for unavailable or illegible source content.

The final snapshot outputs contain 141 candidates: 134 write operations, four unknown-venue candidates (two Blank Canvas, Park Royal, Spring Park), two explicit outside-PEI exclusions and one duplicate disposition. Final saved counters: 80 creations (67 standard/13 food), 54 updates (51 standard/3 food), 63 processed rows, 222 invalid, 93 skipped, zero errors. Row counts and event/write counts have different grains.

Exact run-context creation logs identify **all 80 created paths**; all 54 update audits identify their exact paths. Three records were created and later updated in this run: Powering Up, Lennie Gallant, and Milton Knit and Crochet. Therefore 134 operations reconcile to **131 distinct canonical records**. All 131 were read and their exact detail endpoints returned **200**. No whole-catalog integrity scan was performed. Initial source-array queries attributed 78 creations; the two remaining paths (Souris DanceFit and No Frills food drive) were resolved using bounded execution logs, not a broad collection-group rescan. API availability does not mean semantic correctness.

`rowIndex` is the **zero-based data-row index** in this dataset. Excel row = rowIndex +2. The contract was verified against source IDs before review. References below use parser rowIndex.

## Confirmed findings requiring prevention or a narrowly reviewed repair

### O22-01 — previously withdrawn listings can reappear under a new ID

- Row81, source `1655600776576837`: `venues/slug_citycinemachtown/events/u1tYDY5oORcQWo2TGQgQ`, **CITY CINEMA**, Nov15 16:00, was newly created. The same source/clock masthead defect was withdrawn October21 under ID `HcJlxMBla2nhONQPrGqE`. Enlarged original shows the venue masthead, not an additional screening. The valid Second Sundays record `ix08EbRws1fZnNR5OMMY` remains separate and correct. Retained extraction identifies the phantom addition as `calendar_ocr_explicit_date_line`.
- Row56, source `1571848758315989`: `venues/fb_100064116963888/events/OItrM0fMVPrXqThlD1KL`, **Travis & Guest**, Oct22 23:00, was newly created from the next roundup. The October21 reviewed withdrawal `qhXnXOeCkgLb5OZe7xnT` explicitly held the same occurrence because roundup23:00 conflicts with host22:00. A new source post is not proof that the conflict was resolved.
- Recommendation: carry reviewed occurrence decisions by exact occurrence/source identity into later ingest; reject mastheads before publication. Preserve the conflicting Travis evidence and do not silently select a source priority. Do not apply the old repair helper against new IDs.

### O22-02 — explicit pottery visitor hours become three zero-length closing-time events

Row333, source `1681840813855740`. The enlarged source says **Open Friday to Sunday 10–5 pm**. Stage3 and Stage4 both retain 10:00–17:00 on Oct23/24/25, but final output, Firestore and API all expose **17:00–17:00**:

- `venues/FYlk4v0MPOrrIz1IJMg7/events/sXB2qnKjNp7sk0K1HhCX` (Oct23)
- `venues/FYlk4v0MPOrrIz1IJMg7/events/8ndfTnc5dbpU1ZLUDoTP` (Oct24)
- `venues/FYlk4v0MPOrrIz1IJMg7/events/fOB27Fz3ic2FXw6qHueV` (Oct25)

The first retained corruption is after Stage4. Preserve explicit source hours through enrichment; validate a positive interval. The eventual general visiting-hours design must preserve weekday access windows and provenance. Ordinary retail hours alone still do not qualify as an event.

### O22-03 — weekend farm access loses Saturday and Sunday

Row275, source `1154578167296136`: caption explicitly advertises public **Friday through Sunday, 10:00–16:00**, with a Sunday family rate. Only `venues/4OcLMCRKRGoKO5eQncLi/events/zbX4EILZ0z0r1YPZGoCU` (Friday Oct23) is stored. Three retained Stage3 items have Friday's date, although their extraction reasons separately say Friday, Saturday and Sunday; Stage4 reduces them to one. Two source-supported access dates are missing. The first retained error is already in Stage3 artifacts; these artifacts do not prove whether the model or a Stage3 normalizer introduced it. Undated fibre/baking/sketching classes must not inherit farm opening hours.

### O22-04 — source weekday and bounded class recurrence are lost

- Row54, source `1692718596197215`: the Lunch Club poster explicitly says **Monday, Wednesday, Thursday, 11:30–15:00**. Stored `venues/fb_100063772711403/events/38fkpG7szUVeiDMUBKvv` remains `daily` with empty weekday list. “Daily Soup” is one menu option, not daily evidence for the whole lunch offer. Use the supported weekday set, not every day.
- Row37, source `1537458655075378`: caption says **new six-week Community DanceFit programme beginning Thursday October29, drop-ins welcome any week**; poster says Thursdays17:00. Stored `venues/jKNyzLJF1EIY1Gjj0orZ/events/V6kdMOJsRu7IpryH74zz` is only Oct29, nonrecurring. Expected bounded weekly sequence is Oct29, Nov5/12/19/26, Dec3, subject to the usual no-exception source check. Do not invent the advertised end clock: current19:00 is a duration fallback.
- Row217, source `1938178004302868`: “Wednesday afternoons1–3” is treated as one past nonrecurring date because the extraction reason demands the literal word every/weekly. This is stronger repeated-participation wording than a branded weekday title. It also conflicts with calendar row216's1:30–3:30; retain that conflict rather than selecting a clock silently. Existing `venues/nvQTJXSbDsSfJTCxDKCH/events/LaUuR6rU7QWuJAsIuwJ8` remains13:30–15:30 after the13:00–15:00 incoming update.

### O22-05 — date-specific soup still enriches an unrelated old daily keeper; quick-serve offer omitted

Row326, source `122318473616189551`, explicitly says today's soup is **turkey vegetable**. The enlarged board also advertises **$10 Quickserve: Burrito Bowl / Beef Stroganoff**, and a separate $16 Donair feature. Stage3 incorrectly marks the specific soup daily and extracts only soup + Donair. The soup update lands on `venues/ZDUj9euh7NVJ6INSlHM8/events/GIfuShM3AoAY3YogdQHb`, a daily parent dated Aug24 whose public description is still **Loaded Potato Soup**, while its primary media and source membership now include the turkey board. This is not repaired by yesterday's correction to the separate Beef Chili document. The $10 quick-serve choice is absent from extraction. Preserve the generic daily keeper; do not overwrite its occurrence identity or restore expired offers merely to improve recall counts.

### O22-06 — Stage1 sees four gallery images and misses the fifth programme flyer

Row164, source `1441461821502821`: the caption thanks people for last week's Potato Derby. Gallery image5 is a separate **November Programs / Alberton Public Library** flyer. Enlarged original advertises Ukulele Christmas (Nov6/13/20,10:00–10:30), Alberton Book Club (Nov25,19:00), Read/Sing/Play (Wednesdays13:00, ages0–5), and Saturday Fun (Saturdays11:00). Snapshot rowMeta retains five media URLs, but Stage1 retains only four image analyses, all Potato Derby photographs. It rejects the post as a retrospective before Stage3. The immutable serving source in `o21guard/src/parsing/postParser.ts` caps initial analysis at four images until Stage3 quota selection; full-gallery restoration is after successful Stages1/2. Thus a later valid flyer cannot rescue this negative. This is a source-completeness/validation-order defect, not proof the model saw and misunderstood the flyer. These four public programme families were missed. Evaluate retained gallery completeness before final negative validation; do not attach the Potato Derby caption as their description. Do not change the image budget or pilot gates during this audit.

### O22-07 — one Mitch Gallant show becomes two promotional-fragment events

Row292, source `1558070783015053`: complete original shared caption advertises one **Mitch Gallant** performance at North Rustico Lions Club, Oct24 20:00, cover by donation. Two new documents are published:

- `venues/xwgolurdQ6Y2X3xUL57K/events/RcnjSMiVeZd6saHnkTAH` — LIVE MUSIC ALERT!
- `venues/xwgolurdQ6Y2X3xUL57K/events/kmIEoY7Fuiso8XZjOB8m` — Cover By Donation to support live music in our community

The headline and admission sentence are not two activities. Both retained Stage3 items have extractionReason `poster_theme_dates`; investigate that reconciliation path before blaming the model alone. Bind the performer/activity before creating candidates. The original remote poster was unavailable to this capture; the complete retained original caption independently proves the finding. Any later merge must preserve both records/media until an exact keeper plan is reviewed.

### O22-08 — undisclosed attendee location becomes the RCMP office

Row253, source `1572718361567136`: two fitness assessment exposure sessions Oct30 09:30/13:00 are genuine advertised activities, but source explicitly says **location details will be provided upon registration**. Both are published at `slug_rcmpgrcpei`:

- `venues/slug_rcmpgrcpei/events/blGN5zztgqkkzPkABp6s`
- `venues/slug_rcmpgrcpei/events/E0YfIMoFyyB0kR1KJMdK`

Publisher identity is not an attendee venue. Preserve both sessions and their explicit start times; hold physical resolution until the attendance location is known. Generic sports photographs supply no venue proof. Current two-hour ends are inferred, not advertised.

### O22-09 — golf accommodation package becomes a dated Food Special

Row87, source `1519605406866161`: the source offers one night + golf round/cart/range balls for $149+HST per person, with no food inclusion or advertised session date/clock. `venues/fb_100064501492346/events/TxhVQkisZjPKoDBa02GE` is **Food Special**, Oct21 18:00–21:00. The bookable golf activity is eligible for consideration; the food classification and invented single-evening session are not source-supported. Resolve availability/dates honestly rather than converting a package into a dinner special.

### O22-10 — schedule labels still require public-participation review

- Bell Aliant row126 says **all pools CLOSED for swimming lessons,16:00–20:00**, but new `venues/slug_bellaliantcentre/events/hlsb12eB9pFVsvWR5cS0` publishes a Swimming Lessons activity. A closure notice does not independently invite lesson participation. Verify enrollment/public access before retaining it as discoverable participation.
- Tyne Valley row272's **Free Adult/PreK Skate** is published as `Food Special`: `venues/LglliE42SPFssmoU01su/events/daxDFzgb50Cdynl7HSpj`. The source is unambiguously a10:30–11:30 public skate, so the food classification is wrong. Three Minor Hockey rows identify team slots, not opponent fixtures; the Western Rebels row similarly repeats a group name. Do not assume those are public games. Men's Rec explicitly lists opposing teams and should be evaluated separately.
- Milton row216's **Rehearsal - Christmas Concert** (`venues/nvQTJXSbDsSfJTCxDKCH/events/2EcemtREQyRFPPzaaKFl`) is not automatically a public concert. A Celebration of Life likewise needs an open-public-invitation check. These are review candidates, not approved deletes.

### O22-11 — older explicit clocks survive conflicting new sources without an actionable hold

Milton row216 prints a **19:00 Oct22 book launch**. Incoming update is19:00, but `venues/nvQTJXSbDsSfJTCxDKCH/events/k5ADTLGlWlPpTB5RlLXF` and API remain18:00–20:00. The audit records media/sourceTimestamp changes only. Do not automatically choose newer or older clocks; retain the exact two source versions and expose the conflict. The knitting conflict in O22-04 is another concrete case. ACOTAR row338's00:00–23:00 was already present before this run; this run refreshed media/source membership without changing those clocks. It is a semantic-midnight/unknown-end review lead, **not a new October22 clock regression**.

## Holds and reused work — keep distinct from confirmed extraction failures

1. **Blank Canvas:** reuse the location owner's completed focused result. The complete roundup binds Watercolour Oct22 13:30 and Oil Pastel Oct23 18:30 correctly; direct-source events already exist under `name_6387om`. This audit did not repeat that focused check or merge venue identities. Same identity evidence does not grant merge authority.
2. **Park Royal / Spring Park:** originals explicitly say “Location: Park Royal United” (row196;Oct28 18:00–20:00) and “at Spring Park United Church in Charlottetown” (row250;Nov8 16:00–18:30). Final extraction correctly retains those venues/dates/times, and both candidates remain in exact `unrecognized_venues` records `uv_d6aaa9ecf45f411a3fe03504` / `uv_5638a143a6b900960a155804`. The allegation that a technical assessment said no attendee statement is a lead from the handoff; this audit did not capture that assessment artifact. Venue identity, queue adjudication and any alias/creation decision stay with the location owner. No speculative alias, merge or auto-create is recommended from a shortened preview.
3. **Baba's:** reuse `C:/Users/craig/Documents/Codex/2026-10-22/task/babas-bounded-evidence.json` and `babas-calendar-source.json`. Exact current reread confirms old Oct8 Jazz Messengers parent `SgBnm02p6Vfbtc67H8lC` still weekly Thursday, Rebekah Brown `sq3h8iB9cmWCFeFGNWGB` remains Oct22 nonrecurring, and Ryan Whitty/Chris Martell `5O3Tc8hYGEWKis5VT4O2` remains Oct22 nonrecurring with today's roundup newly linked. The old recurring parent is a legacy specificity problem; the distinct lineups remain unresolved. Shared Chris Martell alone does not prove identity. No merge/removal authority.
4. **35 Stage5/6 holds** are retained, not 35 proven parser mistakes. Examples: eight date-only City Cinema titles lack clocks; Johnny Reid, Brett Kissel, Cornwall December exhibition and craft-fair dates lack clocks; current gallery Deployment lacks a visitor-hours contract. Do not infer showtimes or activate the date-only switch.
5. **Stratford row301:** source clearly invites public viewing Oct23–31 and separately prints private judging6–10pm. Parser separates them correctly, holds judging as organizer-only, then holds public viewing under `dated_activity_without_clock`. The row-level skip summary mentions judging and obscures the later public candidate. This is a diagnostics/policy-design issue, not evidence that public viewing was classified as private. The date-only and automatic-resolution gates remain OFF.
6. Source-unavailable/general teasers remain held. No guessed title, time, location or source priority was used to turn them into successful counts.

## Healthy controls observed

Correct public/activity rejections include outages, seasonal closing/gift-card notices, ordinary stock/retail sales, hiring notices, online voting/contests, broadcast-only features and obvious recaps. Explicit out-of-region offers were excluded. Bell Aliant's three Lane Swim windows remain separate, including consecutive05:30–07:15 and07:15–16:00; all pool/leisure windows retain their source clocks. Leisure/Toddler pool and public-skate family scoring remains v11 and appropriately positive. The December18/19 JP Cormier & Dave Gunning shows start at the source **19:00 show time**, with17:00 doors/17:30 dinner distinguished in the description. Carr's Nov14/15 fair sessions retain different source hours. DownStreet Bachata retains Oct23 18:00–19:30. Milton's corrected First Aid and Christmas Decor workshops remain November12, not October12. No new area-event blanket-pin conversion or automatic publication was made by this audit.

## Runtime, usage and limits

Fresh October22 readback retained with the prior-batch continuation confirms the three parsers ACTIVE,100% latest traffic, common source hash `8c014dae9dbbc3a36c4f76746fdd65883c965aee`, revisions `processdataset-00510-wub`, `processdatasetresume-00474-qav`, `processdatasetselectedrows-00466-qac`; environment hashes unchanged. Resolver/finalizer revisions remain unchanged and automatic existing-venue resolution/creation gates remain false with allowlist absent. This readback was reused, not rerun for this audit. The actual run creation logs independently carry the same runtime hash. No claim that the parent request authorized a new deployment.

Retained snapshot usage: **542 calls,3,364,026 input tokens,355,551 output tokens,3,719,577 total**,791,559 cached input tokens and914,950 cache-write tokens. Recorded model totals:451 `gpt-6-luna` calls and91 `gpt-5-nano` calls. Stage counts:160/101/102/91/85 for Stages1–5 plus3 OCR-debug calls. These are recorded usage totals including retries/auxiliary work, not378 independent paid post parses. This semantic audit did not obtain a fresh billing invoice or calculate dollar costs; `usage-by-stage.json` retains the component counts. The bounded write logs are not a complete per-stage latency/retry trace. End-to-end runtime is92m03s. No paid replay was performed to evaluate proposed fixes.

## Recommended next work

Prepare a bounded prevention-and-repair proposal in this order: (1) prevent occurrence-level review decisions and phantom titles from being bypassed, (2) preserve explicit clocks/weekday sets/bounded occurrences through normalization, (3) separate specific food features from generic recurring keepers and stop non-food/slot classification errors, (4) evaluate independent gallery announcements, (5) hold undisclosed attendee locations and surface source clock conflicts. Review new source fixtures plus healthy controls before any release. Prepare an exact recoverable batch only after source/identity conflicts have been adjudicated; do not replay October21's already-applied helper.

General visiting-hours/Places extraction, date-only publication and automatic venue resolution remain separate gated work. This document records findings and recommendations; it is **not an apply plan or a new repair/deployment authorization**.
