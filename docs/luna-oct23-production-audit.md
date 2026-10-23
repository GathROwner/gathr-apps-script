# October 23, 2026 source-to-output parser audit

## Outcome and execution checkpoint

The regular run completed, but its published results have confirmed semantic defects. Dataset `1sc2srxE0po5eBYWax3itwhPfaYvsjYY6`, run `22592cf8-cb6e-4c2f-a2f9-2111f3cb619a`, is the sole subject of this audit. This report consolidates retained evidence; it does not repeat the audit or any test suite.

**The next small proposal concerns exactly ten existing event records: three start-time corrections, one family-assessment recomputation and six recoverable withdrawals. It is not an executable repair plan. No October 23 prevention changes, deployment or repairs have been prepared/applied by this audit.** Automatic-resolution gates remain subject to the existing OFF policy; this audit made no gate changes. No new venue, alias, merge, scrape, paid model call or map interaction occurred.

The October 22 release/repair is already complete. Its receipts are historical baseline evidence, not a package to deploy or apply again. Before any October 23 mutation, select the small slice, prepare committed code and focused evidence where needed, freeze fresh exact target/protected-record fingerprints and complete typed backups, then independently review that package. Current authorization does not make the recommendations below a frozen apply manifest.

## Completion, source coverage and accounting

The retained completion receipt establishes completed `processing_locks`, `processed_datasets`, final batch **376/376**, and absence of both matching checkpoint forms. Start **12:39:28.426 UTC**, finish **14:12:02.154 UTC**: **09:39–11:12 Halifax, 92m33.728s**, reported error count zero. This is completion proof, not semantic correctness.

| Evidence | Actual coverage |
| --- | --- |
| Original workbook | 376 rows; 215 scraper placeholders/errors; 161 actual post rows, 159 distinct source IDs |
| Captions/shared captions | All 161 reviewed, with independent per-source notes |
| Saved snapshots | 153; Stage 1 passed 82 and rejected 71 |
| Posts without snapshots | Seven geographic exclusions and one no-text exclusion, separately traced in execution logs |
| Source images | 242 ordered references: 239 available, three unavailable |
| Retained full-frame alternatives | Seven selectively attempted from existing workbook URLs; six available, one unavailable |
| Visual review | All twelve labelled contact sheets, plus enlarged originals for material findings; 239 distinct available image hashes including alternatives |
| Videos | 34 thumbnail references; no full video or audio review |
| Writes | 98 creations and 80 update operations; 59 distinct updated records, including three created earlier in this run |
| Distinct written records | 154, all captured canonically and all detail responses HTTP 200 |
| Extra source-matched record | One older Lunch Club keeper not written today |
| Location queue | Eleven source-matched review documents containing twelve current-dataset samples |

The 21 repeated update operations are not by themselves evidence of replay failure: different source posts/roundups can update one keeper. Exact source queries were bounded to this workbook's 159 source IDs. Creation attribution reconciles all 98 records; no missing written record remains. There is one unresolved disposition difference: **193 final candidates versus 178 write operations, twelve unknown candidates and two duplicate dispositions leaves one nonwrite disposition not independently attributed**. Do not turn these different grains into a fabricated exact reconciliation.

Twenty-five captions and 37 image hashes exactly match retained prior evidence. Original source material and ordered galleries were used, rather than trusting accepted/rejected labels. Contact sheets are screening evidence, not perfect small-print OCR. Three raw image failures and the row 132 alternative failure were not repeatedly retried. Dense findings use enlarged originals. Full-video content and unavailable media remain coverage gaps. No complete active-catalog scan was repeated here.

One geographic exclusion deserves an unresolved note: row 251 Island Chef explicitly mentions 62 Queen Street, downtown Charlottetown, despite the coordinate exclusion. The retained still is food imagery and the full video was not reviewed; no eligible event or alternate venue has been established. This does not authorize recovery or coordinate repair.

### Runtime and usage evidence

Creation logs for this run identify `processdatasetresume-00475-vap`, parser source hash `2db00247f0e2aa8e36942b52cda98838bc50e92c`, corresponding to recorded immutable release commit `72dc7ee702f1ef1450b74eb031ab2b3cec444f33`. This audit did not repeat October 22's three-function ACTIVE/traffic/environment verification. Fresh serving/idle readback is a prerequisite for a new release, not a fact inferred from old deployment receipts.

| Recorded stage | Calls | Input tokens | Output tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| Stage 1 | 163 | 1,480,379 | 121,305 | 1,601,684 |
| Stage 2 | 101 | 764,743 | 19,452 | 784,195 |
| Stage 3 | 94 | 890,185 | 126,996 | 1,017,181 |
| Stage 4 | 89 | 319,777 | 65,439 | 385,216 |
| Stage 5 | 84 | 237,313 | 68,541 | 305,854 |
| OCR debug | 3 | 12,216 | 3,095 | 15,311 |
| Total | **534** | **3,704,613** | **404,828** | **4,109,441** |

Recorded cached input: 831,804 tokens; cache writes: 931,306. Actual models: `gpt-6-luna` 445 calls/3,724,225 tokens, `gpt-5-nano` 89 calls/385,216 tokens at Stage 4. These are recorded usage totals, not numbers of posts or retries. Invoice dollars and complete per-call retry/stage-latency distributions were not independently verified. No price-table estimate is presented as actual cost. The audit made zero paid calls. Overall run latency is established above; the retained SeaWalk formatting call is 14,891 ms, not a representative stage average. No prompt/model/effort/cache/compact configuration change was made.

## Confirmed findings

### O23-01: pottery closing time overwrites a correct opening time

Row 295, source `1681840813855740`, first-party poster/video still explicitly prints **Friday to Sunday 10–5 pm**. Stages 3 and 4 correctly retain 10:00–17:00 for October 23, 24 and 25. The final records and API instead contain 17:00–17:00. Exact Stage 5.6 logs say `Recovered explicit start time` with start 17:00 and evidence `10~5pm` three times.

Correct only the three start clocks to 10:00, preserving end 17:00, dates, identities, media and provenance. Prevention belongs in explicit-start recovery in `postParser.ts::enforceDateTimeCompleteness`: recognize the range without extracting its closing half as an opening and preserve supported positive intervals. Add the source-shaped tilde-range case with healthy single-clock/unknown-end controls. The Meta AI summary screenshot in another gallery is not treated as source authority. This source repeats yesterday's finding; its evidence was reused.

### O23-02: publisher fallback creates unsupported attendee pins

Row 22, source `1538679354953308`, advertises Digital Health Week November 19, 10:00–12:00 **at select libraries**, without naming the attendee library. Stages 3/4 identify multiple/unspecified locations, but the writer publishes at Town of Souris. Hold/withdraw that listing recoverably; do not guess Souris Library or substitute a city pin.

Row 109, source `1812505513672406`, produces Little Chefs and Pumpkins October 28 at 17:00 and Halloween Storytime October 31 at 10:00. Their final descriptions identify Centre Belle-Alliance and J.-Henri-Blanchard Library respectively, but blank venue fields fall back to Explore Summerside. Exact canonical festival children already exist at their proper venues. These two newly publisher-pinned copies are confirmed duplicates. Withdraw only those copies; preserve the existing parent, children and reviewed festival memberships.

Narrow prevention must preserve item-local attendee evidence through enrichment, formatting and persistence, withholding an unsupported aggregator/publisher pin. An event publisher that truly hosts an event must remain a healthy control. This does not require a global automatic-resolution redesign.

### O23-03: explicit postponements leave superseded shows live

Row 184, source `1766677878799697`, explicitly postpones Gypsy from October 24 to **March 27, 2027 at 19:30**. The correct future record exists and must be preserved. Row 185, source `1766671322133686`, postpones Brooke and Brad from October 23 to **February 6, 2027**, with no new clock; that proposed future occurrence correctly stays held for timing.

Three exact old occurrences still return HTTP 200: Brooke and Brad October 23 19:30–21:30; Gypsy October 24 19:30–21:30; an imported copy of that October 24 Gypsy show at 00:00–02:00. Recoverably withdraw those three, not other shows. Do not transfer an old show clock to the new Brooke and Brad date. General cancellation/postponement lifecycle automation is a larger separate task, not silently included in this small repair.

### O23-04: caption-only bleed guard discards image-supported workshops

Row 116, source `122258865140861317`, has two original SeaWalk posters containing seven workshop rows. Stages 3/4 and the formatter model retain all seven. `finalFormatter.ts::filterUnsupportedWorkshopBleed` then checks caption token support and explicitly logs dropping Felt Art/The Snazzy Sheep, Barn Quilts and Learn to Loom Knit for zero caption support. The images contain those titles: this is a deterministic false negative after extraction, not simply an OCR miss.

Two missing sessions are unambiguous: **Felt Art October 25, 13:00–16:00** and **Barn Quilts November 22, 13:00–16:00**, at the printed SeaWalk address. Scoped current records contain neither. The third row's November 28 date conflicts with the poster's Sunday wording, and its clocks were held; it stays separate. Prevention should count supported image/item evidence while retaining genuine cross-post bleed controls. The two new-record recoveries require a separate exact reviewed slice; they are not part of the ten existing-record proposal.

### O23-05: bounded weekly gymnastics programme becomes one day

Row 23, source `1538616744959569`, advertises **seven weeks of Wednesday-evening gymnastics starting November 4**, two age groups at 17:30–18:30 and 18:30–19:30, Pavillon de l'Est. Two correctly family-labelled records are saved only for the first date. Stage 3 reasoning demands literal “Every Wednesday” instead of recognizing this bounded programme.

Affected records: `venues/1LlciWbHBnu0RkjQCFA1/events/5jLaZMkPDLG1Lf8iQzwa` and `venues/1LlciWbHBnu0RkjQCFA1/events/uq1LU3ED2a8W0E8OCNmH`. Review bounded-session interpretation and exceptions separately; do not create infinite recurrence or claim every future holiday/exception has been verified. The older Lunch Club daily-versus-Monday/Wednesday/Thursday issue repeats an unchanged source/keeper and was not written today; it remains tracked rather than being re-audited or included here.

### O23-06: public Fun Swim misses the family rule alias

Row 332, source `1540738121407439`, retains thirteen Bell Aliant swim/fitness windows, including distinct consecutive lane sessions and separate leisure intervals. Those sessions must stay separate. Friday Fun Swim, **12:00–16:00, $4.50**, is public recreational swimming but remains score 15/unlikely. The existing scoring rule covers public/open/recreational/free swim, toddler/leisure and slides, but omits “fun swim.”

Add the narrow alias and recompute this record with the reviewed scoring utility; do not invent a manual numeric score. Preserve adult/private/lane-swim negative controls and all source timing. This is a bounded gap in the accepted family criterion, not a repeat of the broader family audit.

## Exact first proposal: ten existing records

All paths below are Firestore document paths. Full current names, dates/clocks and captured `updateTime` values are in `functions/artifacts/luna-oct23-production-audit/proposed-next-small-batch.json`. Those captured versions are audit evidence; they must be reread and frozen before any apply.

| Action | Exact path |
| --- | --- |
| Pottery October 23 start → 10:00 | `venues/FYlk4v0MPOrrIz1IJMg7/events/sXB2qnKjNp7sk0K1HhCX` |
| Pottery October 24 start → 10:00 | `venues/FYlk4v0MPOrrIz1IJMg7/events/8ndfTnc5dbpU1ZLUDoTP` |
| Pottery October 25 start → 10:00 | `venues/FYlk4v0MPOrrIz1IJMg7/events/fOB27Fz3ic2FXw6qHueV` |
| Fun Swim family recomputation | `venues/slug_bellaliantcentre/events/Z654SBHsiJtEQ1bE1brV` |
| Recoverable withdrawal: unspecified library pinned to Town | `venues/fb_100064337752910/events/GtcZxs0QAlScNDs2jE6a` |
| Recoverable withdrawal: Little Chefs publisher duplicate | `venues/slug_exploresummerside/events/bvYH6p8A7Axqb6KMZjop` |
| Recoverable withdrawal: Storytime publisher duplicate | `venues/slug_exploresummerside/events/CIYSv85cpGTo2Y38iio5` |
| Recoverable withdrawal: postponed Brooke and Brad | `venues/slug_thescottmacaulayperformingartscentre/events/THykYxXOBsqHvohYu1bI` |
| Recoverable withdrawal: postponed Gypsy | `venues/slug_thescottmacaulayperformingartscentre/events/VnBLwaGlcXtpIcx5TBP3` |
| Recoverable withdrawal: imported postponed Gypsy copy | `venues/slug_thescottmacaulayperformingartscentre/events/fb_193cc964f6ee` |

Explicitly protected: `events/local_pumpkin_2026`; `venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9` (October 28 17:00–20:00); `venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13` (October 31 10:00–12:30); `venues/slug_thescottmacaulayperformingartscentre/events/AhWckjkJAoW25VPREan9` (future Gypsy). No media deletion or interaction/provenance rewrite is proposed.

Use strict source/date/venue/version/sibling checks, complete typed prewrite archives, a single guarded atomic batch and a recoverable rollback payload with a monotonic feed version. The final executable write count and feed version are not yet determined. After apply, verify every exact delta, protected records, detail responses and the complete active feed. Deployment does not itself correct existing records.

## Five source/location leads

| Lead | Source-grounded disposition |
| --- | --- |
| Blank Canvas | Rows 137 and 323 distinguish Watercolour October 22 13:30 from Oil Pastel October 23 18:30. Current queue identity remains held; exact older binding does not authorize new aliases or merges. The existing Oil Pastel record was read; no current Watercolour record is claimed. |
| Cornwall | Row 254 separates children's activity 16:00–17:30 behind Westwood School/Meadowbank Road from Haunted Woods 18:15–20:00 at Hyde Park Trail. Two held locations, not an invented shared route. |
| Spook Organa | Row 222 caption and poster explicitly identify St. Peter's, All Souls Lane, Charlottetown. Queue's “caption attendee location not explicit” assessment contradicts source text. Candidate location identity is still unverified; no live event. Concert starts 19:00, doors 18:30, printed one-hour duration supports 20:00; proposed 01:00 end is wrong. Preserve the hold, correct reasoning/timing in a separately reviewed resolver slice. |
| UPEISU/The Quad | Row 191 Smash the Stigma October 29 19:00–21:00 identifies The Quad. No validated exact venue candidate; keep held rather than invent a campus venue. |
| Witches on Water Street | Row 227 Art Buds table October 31 12:00–14:00 lacks independently established exact attendee site. Event name alone is not a venue; keep held. |

All current source samples and queue paths are in `location-candidate-dispositions.json`. These are original-source decisions, not email-based venue resolutions. Resolver serving source is separate from the parser baseline; this audit does not claim a traced resolver-code cause or authorize new automatic resolution.

## Other retained holds and follow-ups

- **Pints Halloween clock conflict:** `venues/sJQHqeQVXehTHcFarwc6/events/uCcuAi8BLer2EsHKiC6Q` stores 18:30–22:30 while its enriched description/time flags and current full poster say 19:30–22:30. The update patched end/time flags without start. Confirmed inconsistent merge; retain the source-priority hold before choosing an exact clock.
- **Pints beverage offer:** `venues/sJQHqeQVXehTHcFarwc6/events/E6BpyTjXVlmsi24QYxZm` uses post time as its 17:50 opening. Publication time is not offer availability. Do not substitute a timezone-converted post clock; broader hours/Places work remains deferred.
- **Indigo midnight release:** date-boundary interpretation remains held; no speculative date correction.
- **Ruby's soup:** an older daily Loaded Potato keeper is again enriched by a dated Turkey Vegetable source. This is the known occurrence/recurring merge issue; quick-serve alternatives are present in current descriptions and are not reported missing.
- **Alberton programme:** same previously reviewed gallery/source still fails to yield the later library programme. Gallery-order redesign remains paused; no claim that today's code solved it.
- **No-clock invitations/deals:** dining, corn maze, PD camps, Stars on Ice, Brett Kissel and the food-truck discount must not receive guessed clocks. Montague poker registration is not automatically the play start. A Belvedere draw notice alone does not establish a physical attendee invitation.
- The October 22 RCMP/masthead fixes are part of the recorded serving baseline, but those exact sources are absent today. Today's run is not claimed as a fresh production reproduction of them.

## Evidence and remaining execution work

Evidence root: `functions/artifacts/luna-oct23-production-audit/` in this checkout.

- `audit-completion.json`, `completion.json`, `write-reconciliation.json`: completion and operation grain.
- `source-first-review-inventory.json`, `source-posts.json`, `ledger.json`, `contact-index.json`, `media-manifest.json`, `additional-full-frame-capture.json`: source decisions and actual media coverage.
- `focused-row-295-logs.json`, `focused-row-116-logs.json`, `focused-row-273-logs.json`: exact clock/filter/merge evidence.
- `focused-source-controls.json`, `pumpkin-source-controls.json`, `postponed-occurrence-details.json`: exact existing controls and three stale-show API responses.
- `proposed-next-small-batch.json`: ten recommendations, explicitly not an apply plan.
- `location-candidate-dispositions.json`, `usage-summary.json`, `evidence-fingerprints.json`: held-source decisions, recorded usage and retained file hashes.

**Report status:** complete from retained evidence; semantic pass false. **Release status:** no October 23 release package yet, so independent code/apply review and deployment cannot proceed. Next concrete step is selection/preparation of the genuinely small source-backed slice above, followed by independent review. Two SeaWalk recoveries, bounded gymnastics recurrence and the remaining conflicts stay explicit follow-ups. No unchanged tests were repeated; no live writes or deployments occurred during this report completion.
