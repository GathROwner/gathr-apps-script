# Stage 2 Luna model audit — October 9, 2026

## Recommendation

There is a measured cost benefit, but Stage 2 should remain Mini for the next regular parse while we complete the already approved Stage 1/3 comparison. Prepare a later **Luna high Stage 2 pilot** after correcting its activity definition and shared food-signal safeguard. Do not deploy a model-name-only substitution: the current classifier hardcodes GPT-6 reasoning to `none`; high was evaluated through an audit-only transport override.

Production was unchanged. The baseline checkout was `codex/luna-parser-live-merge`, commit `3d38654`. Only a local audit runner, documentation, and evidence were added. No events, venue records, media, traffic, scheduled jobs, or parser environment were modified.

## What Stage 2 does

`contentClassifier.ts` chooses EVENT, FOOD_SPECIAL, MIXED_EVENTS_AND_SPECIALS, CALENDAR, or SCHEDULE. It estimates item count and returns confidence. Confidence below 0.6 can stop the post. `stage2Routing.ts` then applies the existing structural scores and guards; that effective route selects Stage 3 extraction and can enable calendar inventory checking. Stage 2 does not assign the final app category.

## Production cost baseline

Fresh read-only Firestore checks confirmed completed locks, processed markers, terminal batch states, and absent checkpoints. For the three most recent runs, non-dry full-parser snapshot counts reconcile exactly with the completed run's snapshot-write counter:

| Regular dataset | Rows | Snapshots | Stage 2 calls | Stage 2 USD |
| --- | ---: | ---: | ---: | ---: |
| October 7 | 377 | 158 | 90 | $0.225427 |
| October 8 | 368 | 148 | 79 | $0.209366 |
| October 9 | 385 | 164 | 85 | $0.233572 |

October 9 logs independently identify all 85 classifier calls as GPT-5 mini. Six calls exceed the 79 source-post evaluations because galleries can cause a refresh. Recorded call latency totals 447 seconds, median 5.014 seconds, p95 7.229 seconds, maximum 12.930 seconds. This sum is API call time, not an independent measurement of whole-run wall time.

October 5/6 were also collected for context, but their snapshot counts do not reconcile with the final counter; October 6's current lock has also been superseded. Their preliminary snapshot cost totals are excluded from the clean three-run comparison above. Snapshot usage is recorded token cost, not an invoice reconciliation or proof that failed requests without usage were free.

## Paired API experiment

98 frozen public posts: 78 with images and 20 caption-only. This includes 77 October 9 Stage 2 posts, 13 additional accepted caption-only cases from October 5–8, and eight source-reviewed October 8 fixtures. October 9 rows 222 and 224 were excluded because their captured images were unavailable; no text-only substitution was used.

Each source used the same caption, ordered image bytes, classification prompt/schema, and frozen Stage 1 structural evidence in all arms. All 98 prompt hashes matched across arms. We called the compiled production classifier and score router. Mini retained its existing default reasoning and 1,500-output-token ceiling. Both Luna arms retained the classifier's 6,000 ceiling; the high arm changed reasoning only at the local HTTP boundary. Arm order rotated between posts, with four concurrent audit jobs.

| Arm | Calls | Token cost USD | Median seconds | p95 seconds | Sum of call seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5 mini, current | 98 | $0.141527 | 4.346 | 6.805 | 433.532 |
| Luna, no reasoning | 98 | $0.023560 | 2.566 | 3.733 | 269.762 |
| Luna high | 98 | $0.035624 | 4.082 | 7.532 | 458.678 |

All **294 responses completed with HTTP 200**, usable classifications, one request per arm, and no classifier error fallback. Luna high saved **74.83%** in this paired test; no-reasoning saved **83.35%**. High had a slightly better median but **5.8% more summed call time**, so this experiment does not establish a high-effort speed benefit. No-reasoning reduced summed call time by 37.8%, but had more problematic activity routing.

Costs use actual returned input, cached-input, cache-write, and output token usage. Standard short-context rates per million tokens: Mini $0.25 input / $0.025 cached / $2 output; Luna $0.10 input / $0.01 cached / $0.125 cache write / $0.50 output. Sources: [Mini model documentation](https://developers.openai.com/api/docs/models/gpt-5-mini) and [Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

These are local API replay costs. The replay uses captured original color images, while production uses preprocessed images and may classify the first four and then refresh the full gallery. It is a fair model comparison on identical frozen inputs, **not a measured production cost after migration**. The production image token totals are materially larger; do not multiply the replay saving percentage into a guaranteed daily bill. Standard API token estimates also exclude scraping, Cloud Run, storage, and network charges.

## Routing and source findings

Against the fresh Mini arm, Luna high changed seven effective routes and four confidence-gate outcomes, affecting 11 posts. No-reasoning changed 11 routes and four gate outcomes, affecting 14 posts. Label disagreement is not itself an extraction error.

- **Seaside clinic, October 9 row 213:** no-reasoning declared `hasEvents=false`. The existing food guard matched `Main` in `51 Main Street`, converted the route to FOOD_SPECIAL, and boosted confidence to 0.78. Mini and high retained an event-capable mixed route. This is a shared safeguard defect exposed by the substitution, not evidence that the clinic is a food special.
- **Robert McMillan Pottery, row 274:** no-reasoning also declared no event, while the source explicitly invites visitors to a studio tour Saturday/Sunday 10–5. General `special` wording in a gift-shopping passage triggered food routing. Mini/high kept an event-capable route. Public and bookable activities must remain in scope.
- **Nature Space, row 352:** both Luna arms described a Halloween lodging offer and amenities as non-entertainment; generic price/special cues then produced FOOD_SPECIAL. Treat as a scope/routing review, not proof of a food offer or a confirmed missing live listing.
- **Red Sands draw, row 73:** Mini counted 72 participant entries and its route resolved to CALENDAR. Both Luna arms recognized one golf tournament. A draw table is not 72 separate events. The downstream replays produced one candidate and both were held in Stage 4; no false participant listings were written.
- **PEI Marathon, row 51:** Mini/none chose EVENT; high chose CALENDAR for the two-day, 12-activity poster. Both tested downstream routes reached source-review holds rather than publishable final output. High's extra raw candidate is not counted as a quality improvement.
- **Seaside dated clinic plus apple arrival, row 214:** both Luna arms chose EVENT and correctly did not treat ordinary apple stock arrival as a special. Both tested routes retained the clinic and did not create an apple-stock listing.
- **Ruby's closure notice, row 342:** both Luna arms fell below the confidence threshold; Mini classified the operating closure as SCHEDULE at 0.9. This is a useful rejection difference, not a missed activity.
- High's other additional low-confidence cases were the Downtown kids-guide promotion, Royalty Crossing clothing sale, and Pearl foot-care advertisement. Pearl was already held by production Mini at 0.35, despite the fresh Mini replay accepting it; this demonstrates sampling variation and an imperfect taxonomy. Do not claim a new confirmed missed bookable activity from this result alone.
- **APM four open-ice slots and PowerSkating's 20 printed dates** received different EVENT/CALENDAR/SCHEDULE labels. Their downstream inventories were checked separately; route parity alone cannot certify completeness.

## Downstream checks and limits

The audit injected the captured Stage 2 classifications into the compiled parser, froze Stage 1 evidence, and ran actual Luna high Stage 3 plus unchanged Nano low/medium Stages 4/5. Image upload/delete and website/ticket/calendar enrichment were disabled. This stops before the Firestore writer; image-provenance persistence and live deduplication are not certified by these tests.

The clinic and pottery routes recovered the same listing counts through existing fallback extraction despite the incorrect FOOD_SPECIAL classification. Therefore these are **routing risks and unnecessary work, not confirmed omissions** in these replays. The mixed clinic route used three Stage 3 calls and the food-only route used two; the dated clinic EVENT route used one rather than two. This illustrates why classifier latency alone does not determine whole-pipeline speed.

All **16 downstream replays across seven sources completed**:

| Source | Frozen Stage 2 arms | Final inventory |
| --- | --- | --- |
| Seaside walk-in clinic | Mini / none / high | One clinic in each; source time conflict described below |
| Seaside dated clinic + apple arrival | Mini / none | One clinic in each; no apple-stock listing |
| Robert McMillan studio tour | Mini / none | Two weekend visits in each |
| PEI Marathon | Mini / high | Both held; 12 versus 13 raw candidates is not a quality win |
| Red Sands draw | Mini / high | One raw tournament in each; both held in Stage 4 |
| PowerSkating printed table | Mini / none / high | Exactly 20 distinct 07:00–08:00 dated one-offs in each; no November 7/8 or weekly parents |
| APM open ice | Mini / high | Exact four source date/time slots in each: Oct 8 18:20, Oct 10 09:20 and 18:40, Oct 12 18:20 |

The sparse schedule and open-ice inventories were checked programmatically against their source dates/times, not just counted. Stage 4/5 model usage remained Nano. These limited downstream checks do not certify all 98 source inventories or imply that every changed route would be safe in production.

The clinic poster itself prints `9:00 PM–4:00 PM`, while its caption says `9 AM–4 PM`. One fresh Stage 3 replay followed the erroneous poster and returned 21:00; the other routes returned 09:00. This is source conflict/downstream model variation, not a demonstrated Stage 2 time-extraction error. No live record was changed.

This is a model/routing comparison, not a complete independent audit of every event in every source. No formal Facebook Event with structured UTC metadata appeared in the 98-post cohort. The eight October 8 fixtures use fixed structural annotations rather than newly generated Stage 1 responses. Unavailable-media cases, exact production preprocessing, and the formal Facebook Event path need coverage before release.

## Proposed sequence

1. Preserve tomorrow's approved Stage 1/3 baseline and collect its real cost/quality results.
2. In local Stage 2 experiments, explicitly include public recreation, bookable activities, clinics, tours, and classes in EVENT. Stage 1 already decides whether content qualifies; a poor fit to an entertainment-only label should not silently discard a useful post.
3. Narrow the shared food guard so addresses, generic gifts/services, and unrelated prices do not manufacture food-special routing. Preserve advertised unpriced daily food/drink specials and genuine event-plus-special posts.
4. Make Stage 2 reasoning configurable and repeat the guarded routing/inventory tests, including exact production preprocessing and formal Facebook Event metadata. High is the safer starting model arm from this experiment; low effort can be evaluated later.
5. If the safeguards and source inventories pass, prepare a bounded Stage 2 pilot and compare whole-pipeline calls, holds, output, latency, and per-post cost. Do not change Stages 4/5 in that pilot.

Evidence: [audit summary](../artifacts/luna-stage2-oct9-audit/summary.json), [98-post classification ledger](../artifacts/luna-stage2-oct9-audit/classification-ledger.json), and `functions/scripts/stage2-model-audit.mjs`. Private source captures, raw API diagnostics, and no-write downstream results are outside the repository under `C:\Users\craig\.codex\luna-stage2-20261009`; credentials are not included in the saved audit artifacts.
