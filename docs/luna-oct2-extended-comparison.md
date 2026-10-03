# October 2 Luna-only parser audit

> Scope correction (October 2): this run changed **all five model stages** to
> Luna. It measured an all-Luna pipeline, not the intended drop-in replacement
> of GPT-5.2 at Stage 3 while keeping GPT-5 mini and nano. Its quality and
> cost totals must not be presented as the Stage 3 substitution result. The
> separately recorded Stage 3-only rerun supersedes this release assessment.

## What was tested

The completed October 2 large parse is dataset `1OmFzDG0kWiY-k8C-8G6-oGlTBxE3B0cq` (384 source rows, 175 saved parse snapshots). Of those, 152 snapshots had source images. The first comparison selected 40 by fixed SHA-256 ranking plus eight high-output rows. One of the 48 source galleries was unavailable. Its guarded route used an older-model retry on 27 of the 47 accessible posts, so that first comparison cannot measure Luna alone.

The follow-up ran the **next 40 SHA-256-ranked posts**, with zero overlap with the first 48, through Luna high with the legacy retry disabled in the local dry-run process. All 40 completed; no legacy model calls or replay errors occurred. We also reran the 27 earlier fallback posts with the same local setting. The other 20 accessible first-cohort posts had already stayed on Luna. Together these are 87 distinct, accessible posts evaluated through Luna only. The first cohort's eight dense rows remain included; the sample is not a random estimate of every future post.

Each replay used the saved caption and ordered source gallery, with the Cloud Run Sharp image preprocessing and a mocked source-image upload. `parsePostData` was called without an event writer. Counts below are parser listings before occurrence expansion, downstream deduplication, or Firestore writes. Saved production outputs are a useful comparison, but they contain errors too; they are not human ground truth.

## Results

| Cohort | Posts | Saved listings | Luna-only listings | Saved posts with listings | Luna posts with listings | Luna API cost upper estimate |
|---|---:|---:|---:|---:|---:|---:|
| First cohort posts already on Luna | 20 | 157 | 168 | 19 | 20 | US$0.1706 |
| Earlier fallback posts rerun without fallback | 27 | 5 | 1 | 4 | 1 | US$0.0449 |
| Next 40 distinct posts without fallback | 40 | 20 | 17 | 14 | 11 | US$0.1012 |
| **All distinct Luna-only posts** | **87** | **182** | **186** | **37** | **32** | **US$0.3167** |

The 40 new posts produced 17 listings versus 20 saved, on 11 posts versus 14 saved. Across the 87 Luna-only posts, a small overall listing gain masks **five fewer posts with any listing**. This is a genuine coverage warning, even though several saved listings were erroneous. The 27 fallback posts are particularly informative: with retry disabled, three previously positive posts became empty.

The earlier guarded route produced 173 candidate listings versus 162 saved on 47 accessible posts, with 27 posts invoking older models. Its US$0.4451 estimate covers both Luna and older-model calls. The six corrected-mock reruns are recorded separately; they are not added to the distinct-post totals.

## Source checks that explain the counts

- **Row 185, Karaoke on the Deck:** the flyer advertises October 3, 10, 17, and 24, 4–7 pm. Luna produced no listing after a `caption_only_weekly_source_mismatch` hold. This is a real miss.
- **Row 298, Chefs’ Harvest Dining Series:** the flyer advertises a Thursday–Saturday series from October 15 to November 7 without a time. Luna produced no listing after Stage 4. The saved parser listed it with an inferred 15:00–17:00 window, so the old output was not fully faithful either. The series still needs a product treatment for unknown time.
- **Row 195, U-pick pumpkins:** one no-fallback Luna rerun returned a valid consolidated daily activity; another returned zero after Stage 4. This demonstrates variation that a single pass does not capture.
- **Row 325, PeriMenoPass classes:** both routes emitted three recurring class listings, but Luna used October 1 as the start date for Monday, Wednesday, and Friday patterns. The downstream recurrence normalizer needs a dry-write check before calling these dates wrong in Firestore.
- **Row 175, Andy Hay past visit, and row 273, ordinary baking products:** the saved parser made listings from past/promotional or ordinary product content. Luna correctly returned zero. These explain two apparent candidate misses that should not be repaired.
- **Row 272, The Sheepdogs:** Luna recovered the October 22 concert from the caption where the saved parser returned zero. Its inferred 01:00 end time deserves the ordinary end-time check.
- **Rows 91 and 327:** Luna omitted a nomination deadline and recurring farmers-market hours that the saved parser included. Whether those belong as event listings is a product decision, not a model spelling defect.
- **Earlier dense-post review:** Luna recovered valid entries the saved route missed but omitted the October 3 Got Blues Matinee on Downtown Charlottetown row 34. Row 302 still has an ambiguous “at 4” converted to 04:00, and row 337 still categorizes a Sunday admission offer as a food special at the post timestamp.

The workbook records every attempted replay, all saved and candidate listings, model calls, cost estimates, fallback status, and these source checks. Raw per-row outputs and source images are in `artifacts/luna-oct2-cohort/` for deeper review.

## Cost and fallback meaning

The estimate uses the October 2 standard API list rate of US$0.10 per million Luna input tokens and US$0.50 per million output tokens, pricing every input token as uncached. It is an upper estimate for measured model calls, excluding storage and other vendors. Saved production snapshots do not contain enough complete call-level token usage for an exact same-row percentage saving.

The TypeScript build passed after adding the local fallback switch. A read-only Firestore count found zero venue `operatingHoursUpdatedAt` changes since 21:20 UTC, covering these replays; the dry-run parser path did not call an event writer.

Here, **legacy safety fallback** means that a Luna canary failure at a validation stage can retry the same post through the existing parser's GPT-5 mini, GPT-5 nano, and sometimes GPT-5.2 route. That protects coverage, but the result and cost then belong to a mixed pipeline. The local `LUNA_CANARY_LEGACY_FALLBACK_ENABLED=false` setting makes a failed Luna post return a held, empty result; it does not fabricate success. The setting defaults to true. Production configuration was not changed for this evaluation.

## Release implication

The additional test supports Luna's strong low-cost performance on dense schedules, but it does **not** support turning the legacy fallback off for every production post yet. In this sample, turning it off exposed at least the real Karaoke miss, the unknown-time dining-series hold, and the variable U-pick result. Focus the next hardening pass on those concrete holds and the date/time checks. Then repeat the same 87-post no-fallback replay and compare positive-post coverage as well as listing counts. A monitored selected-post rollout can use the new switch after that review; the default remains rollback-ready.

Per-row machine-readable results are in [`additional/score.csv`](../artifacts/luna-oct2-cohort/additional/score.csv) and [`first48-no-fallback/score.csv`](../artifacts/luna-oct2-cohort/first48-no-fallback/score.csv). Their manifests record source IDs and selection. The audit workbook is in `outputs/01a0ea83-7031-7423-b853-966f2180d186/luna-oct2-parser-audit.xlsx`.
