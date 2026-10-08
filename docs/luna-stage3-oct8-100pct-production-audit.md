# October 8 regular parse: 100% eligible-image Luna Stage 3 audit

## Run and route proof

The regular dataset `1kIx_zGW7BZMf8F55eCYTQYOeYuFq-VLv` (run `1181c2ba-7cd1-496a-b2c7-e7dda681d072`) completed October 8 at 15:29:28 UTC. Firestore has a completed processing lock, a processed-dataset marker, final batch state `completed` at row 368/368, and no checkpoint. This excludes selected-row and dry runs. The final stats are 54 processed posts, 94 skipped, 220 invalid rows, 5 duplicates, 0 errors, 80 new events, and 43 event updates. These run-level write counts are not a Luna-only denominator.

The eligible cohort counter is 66 and the selected counter is 66. Selection logs identify 66 distinct posts. Sixty-five snapshots contain actual `gpt-6-luna` calls, with no `gpt-5.2` call in any of those 65 snapshots. The other selected post, Downtown Charlottetown row 81/source `1557721099728755`, took the existing anchored-text Stage 3 route and produced 39 payload items without a Luna call. Thus 100% selection did not mean 66 Luna vision calls. Eleven `gpt-5.2` calls appear in other snapshots; the deployment retains it for image-ineligible Stage 3 posts. All three parser functions were read back ACTIVE on source hash `f08f2814c7d3ace967cd248d612093473bc9f785`, with Luna Stage 3 only, high effort, sample percent 100, no exclusions, and legacy fallback disabled. Stages 1–2 remain GPT-5 mini, Stages 4–5 GPT-5 nano.

Across all 148 parse snapshots, model usage was: mini 266 calls, 2,123,737 input and 325,762 output tokens; Luna 98 calls, 893,904 input and 107,654 output tokens; nano 141 calls, 387,313 input and 450,975 output tokens; GPT-5.2 11 calls, 17,218 input and 4,482 output tokens. These are token counts, not a bill or a per-stage cost estimate.

## Source review and confirmed defects

I reviewed captions and the ordered 117-image galleries of the 65 posts that called Luna. The audit captured 109 images. Eight source URLs were expired/unavailable (rows 37, 185, 186 twice, 187 twice, 269, 270); conclusions depending on those visual details are limited to the available captions. `functions/artifacts/luna-oct8-full-audit/summary.json`, `ledger.json`, `live.json`, `all-image-fetch.json`, the contact sheets, and focused Cloud Logs contain the evidence. A matching source-ID prefix is evidence of a live record tied to that source; a zero match does not by itself prove the event is absent under another source.

| Row / source | Source-grounded observation | Saved result / layer |
| --- | --- | --- |
| 287 / `1723226023140608` | The PowerSkating flyer lists **10 exact Saturdays** for U9–U11 and **10 exact Sundays** for U13–U15, each with a gap before November 14/15. | Stage 4 received 5 then 15 candidate items; Stage 5 returned 20 items. Four final payload fragments collapsed to two live parent events: `N1zwOCv81EGSbomyQZlC` weekly Saturday, 9 occurrences, and `vnYpnIqiI9jmHmqee19m` weekly Sunday, 8 occurrences. Neither live record stores skipped dates. A simple weekly sequence would include unadvertised November 7/8 and omit advertised dates near the end (Saturday December 19/January 2; Sunday December 13/20/January 3). This is a **recurrence normalization/write defect after Luna read the grid**, not a missing-image OCR failure. |
| 16 / `1558017193012165` | Hunter’s flyer/caption advertise Thursday trivia and Brad & Isaac, Friday Griff & Guest, Saturday Gin N Tonic, Sunday music trivia. | Luna supplied only 2 items to Stage 4; final payload has Brad & Isaac and Sunday trivia. Thursday trivia and Brad & Isaac already exist from another source, but the venue inventory contains **no Friday Griff & Guest or Saturday Gin N Tonic** listings. This is an actual Stage 3 inventory omission on a simple four-day flyer. |
| 212 / `1552488536897478` | Trailside caption says “TONIGHT,” Thursday October 8; flyer explicitly prints `08 OCTOBER 2026`. | Stage 3 source-date guard held it as “Yearless source date shortly before post date” and produced no payload. The source is not yearless. Venue inventory did not show this show. This is a false safety hold, separate from Luna’s text recognition. |
| 226 / `1768194508647508` | Evermoore’s October 7 post says trivia is **tonight**, Wednesday October 7 at 8 p.m., moved from its normal Thursday slot for this week only; flyer also says “this week only.” | The same recent-past yearless-date guard held the one-off Wednesday session without a payload. The source publication date and “tonight” resolve the year. This is a second false hold; confirm whether an older listing already covered Wednesday before a live replay. |
| 48 / `1523609006460343` | Town of Souris post is an administrative municipal nomination notice. | Final/live record `OXNqzwt90jRPs1VhIgA6` advertises “Final-day council nomination submissions” as a public gathering. The Stage 4 call received three candidates, so the classifier/final filter failed to reject the notice. |
| 236 / `1710132027779560` | PEI Co. Store post is 25% off Christmas decorations, a retail promotion with no food or scheduled public activity. | Live `oQNkGHY7Wqz0DgqnsZN5` is falsely categorized as a Food Special. |
| 268 / `1688030250002146` | Tignish Co-op announces a newly stocked $9.99 lattice pie, without a deal or day-specific special. | Live `HvwY2fIDPevrMDktcXw4` is an ordinary product presented as Food Special. |
| 192 / `1131897499367282` | Tipsy Farmers lists eight Grab ’n Go fridge menu items, a separate soup of the day, and two all-day sandwich specials. | Seven ordinary fridge items reached live Food Special records (one of the eight was not written). Soup of the day and the two all-day specials do qualify under Craig’s rule. The ordinary menu list should not have become seven listings. See the ledger for exact record paths. |
| 279 / `1525967399551178` | Bell Aliant caption advertises public skate and swimming windows but also says all pools **closed** 4–8 p.m. | Nine useful activities survived, but live record `3sSaAmoHi35ivs1YKhW9` turns the closure into a “Workshops & Classes” event. Bookable/open swimming remains in scope; the closure is not an activity. |
| 266 / `1688522943286210` | Tignish pasta-sale shelf tag says “Weekly Special” and “Exp Oct 14, 2026.” | Live `CSOQnZG8ZvlGGrJRuRl3` has `weekly_thursday` recurrence and no end date or occurrence cap. The fixed shelf-tag expiry should bound the sale. |
| 269 / `1923706769083325` | Milton Hall caption says gardening is **across the road** while the hall is closed. | Live gardening event `LXzgLCsGD8JKFZIPKtb0` uses the hall address. Its two source images were expired, so the exact alternate venue needs confirmation before repair. |

The seven ordinary fridge records are in `live.json` row 192. All cited live IDs were read from Firestore during this audit. No live record was edited or deleted.

## Other quality observations and limits

- Explore Summerside row 65: the five-image post includes three dated, bookable Smooth Yoga sessions (October 12, 13, 15). Stage 4 received eight items, Stage 5 received four, and the final payload retained only art/theatre entries. The image gives dates and venue but no start times; the booking link could supply them. These activities need source enrichment/review rather than invented times.
- Harbourfront row 62: the ten-event inventory survived the payload, but several live stage shows were labeled `Cinema` in that candidate payload. Most matched earlier venue records with better categories, so the run did not overwrite all of them. This is a downstream classification risk, not a Luna inventory miss.
- PEERS Alliance row 343: the flyer explicitly gives 1 p.m. restorative healing and 3 p.m. community time. The two starts are correct; both saved 11 p.m. end times appear to be generic fallback values, since the source supplies no end time.
- Bookmark row 310: a source-backed October 8, 11 a.m. author event reached final formatting but has no source-ID-linked live record. Determine whether venue matching, deduplication, or an existing other-source record accounts for it before calling it a lost write.
- Sport PEI row 74: an online webinar was extracted but has no source-ID-linked live record, consistent with the known virtual-venue hold. The unknown-venue workflow owns resolution.
- Harbourfront live venue inventory shows most October shows already present under older source IDs, so the difference between its 10 payload items and one source-ID-linked new record is not itself an omission.
- For PowerSkating, the registered activities and all other bookable family activities remain in scope. Repair must represent the exact published dates rather than suppress the series.

## Decision and next work

The 100% eligible-image routing operated, and the run completed without parser errors or resume stalls. Luna extracted useful dense content, including the PowerSkating dates at least through the Stage 4/5 handoff. **This is not yet a clean quality pass**: one simple music flyer lost two performances, and the recurrence writer saved a materially incorrect calendar; the false live administrative/retail/closure entries show that later gates also need repair. Keep the Stage 3 transition and the Stage 4/5 cost/latency discussion separate. First implement focused fixes, run exact-source no-write tests and a guarded replay, then review the next full parse before treating 100% as a settled rollout. Do not alter the GathR map. Any cleanup of the listed live records requires the exact backup/readback/approval process.

## October 8 repair follow-up

The confirmed defects above were subsequently addressed in parser commit
`0319ef9`, deployed on the three parser functions with source hash
`6ec1fb03acc847610ed2dd5f3ef8ae2cf4e42b10`. After Craig approved four
exact, backed-up plans, the live repair removed 11 false listings and two
incorrect weekly PowerSkating parents, changed the Tignish deal to a one-off,
and added 20 printed PowerSkating sessions, Hunter's two missing shows, and
Trailside's October 8 show. Firestore postconditions and the public app API
were verified. The full target list, result artifacts, and the unresolved
Hunter's Friday source conflict are in
`docs/luna-stage3-oct8-live-repair-plan.md`. This follow-up does not change the
historical October 8 audit counts. The next regular full run must establish
whether the code repairs prevent recurrence.
