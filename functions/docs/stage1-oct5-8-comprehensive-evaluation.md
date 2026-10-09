# Stage 1 Luna evaluation across October 5–8

Evaluation date: October 8 Halifax time, extending into October 9 UTC. Production Stage 1 remains GPT-5 mini. All new prompt and gate policies are evaluation-only; this work does not authorize a parser deployment or Firestore writes.

## Purpose and decision boundary

Replace the expensive Stage 1 visual eligibility/layout call with Luna high while retaining useful public activities and food offers. Stage 1 identifies eligibility and image/layout signals; it does not establish final occurrence dates, times, recurrence, venue matching, or event writes. Uncertain schedule details can proceed to later validation. The goal is a practical release candidate, not a claim that every later model call is perfect.

Qualifying scope follows Craig's instructions: all public/bookable/family activities, including recreation access, tours, classes, farms, museums, crafting/game spaces, and actually offered leisure experiences. Daily/date-specific prepared meal features and food/drink deals qualify even when unpriced. An ordinary month-long menu feature, retail restock, nonfood discount, administrative campaign, or remote-only prize draw does not qualify on its own. Mixed posts qualify only for their useful portion.

## Evidence and denominator

Raw, hashed source manifests, ordered source images, model responses, request usage, reviews, and runtime readbacks are retained under:

`C:\Users\craig\.codex\stage1-evaluation-20261008`

The completed regular datasets are:

| Parse | Dataset | Scraped rows |
| --- | --- | ---: |
| October 5 | `1SqTJqEcU5Er6RqAErHDOtB4ptdiXniVM` | 351 |
| October 6 | `1IcZOB0T9oxC1hugFaR0QbSD4nD_25t9I` | 376 |
| October 7 | `1eREpzt2nL6mpIX9St-GoKOvTDrdX4WwU` | 377 |
| October 8 | `1kIx_zGW7BZMf8F55eCYTQYOeYuFq-VLv` | 368 |

Completion was checked using the processing lock, processed marker, final batch state and absent checkpoint. This is not a selected-row or partial-run sample.

Across 1,472 scraped rows, 582 latest regular-parse snapshots were available. The image cohort started with 558 appearances, deduplicated to 551 source/day appearances, then excluded 29 with incomplete source media. The resulting cohort is **522 image-post appearances / 474 distinct source post IDs**, not 1,472 independently tested posts. Historical rejection or progression is context, not truth.

Additional tests cover 33 complete galleries / 165 images, 24 actual text-only posts, the original 12-case / 27-image regression set, and 48 matched fresh Mini controls. The 49 repair regressions are already included in the 522; they are not extra independent cases. Gallery/text/hosted cases overlap the main cohort and must not be added to inflate the unique denominator.

### Truth and review limitations

The immutable original cohort has 410 binary labels and 112 review cases. Development contained 418 cases and the initial untouched source-ID holdout contained 104, with zero source-ID overlap. V5 high was evaluated on that untouched holdout; V6–V10 reuse it as confirmation after learning from errors. The final result is therefore retrospective confirmation, not a second independent blind validation.

An independent read-only task reviewed original captions and ordered images for 90 development review cases and 22 holdout review cases. Root separately inspected disputed source evidence, preserving original labels and writing adjudication sidecars. Corrections include actual student food deals, an explicit squash discount, pottery tours/demonstrations, a future author event, Thanksgiving dinner, public crafting/games, and the dining portion of a quantified discount card. Ambiguous salon, accommodation, date-conflict, or activity-vs-stock cases remain visible and are not counted as proven misses or successes.

`v10-review.json` retains original-label, adjudicated-label and clear-source-review scores separately. `stage1-final-evidence.json` records the matched quality/cost comparison and downstream inventories. Original model JSONLs and source labels are not rewritten.

## Candidate and repairs

The final candidate is `luna-compact-v10-high-menu-guard`, using the normal response schema, existing image detail/output budget, high reasoning and `source-menu-guards` only through the evaluation entry point.

| Exposed weakness | Candidate treatment |
| --- | --- |
| Public ongoing games/crafting, orchard visitors or leisure rejected for missing formal schedules | Preserve an actually offered activity; later stages resolve dates/availability. |
| Food discounts hidden among ordinary photos or a retrospective caption | Inspect each attachment and keep only the explicit food offer. |
| Named daily prepared meal rejected without the literal word “special” | Accept a concrete meal-of-the-day offer, including bilingual invitations. |
| Date tables treated as one program rather than many printed sessions | Explicit grid/multiple-occurrence flags and exact attachment count. |
| Remote raffle forced through by an `/events/` URL and an image | Require public program language before a link can rescue a model rejection. |
| Bare “Today's Menu” photo producing ordinary menu events | Narrow caption/image-evidence guard; explicit specials or independent activities remain eligible. |
| Past-only photo recap treated as a new event | Model eligibility and later validation handle it; a forced regex rejection was removed after independent review found valid mixed-activity counterexamples. |
| Performance photo credits, awareness labels or advocacy signatures mistaken for events | Require an actual current attendance/participation offer. |

The frozen `luna-compact-v10-high` run uses the first offer-guard policy. A focused mixed-recap regression exposed that explicit current offers without a booking verb could be rejected. A second independent counterexample showed that extending that keyword list still risks useful-post loss. The final source-menu-guards policy therefore removes forced photo-recap rejection entirely. Its effect on the completed raw cohort is recorded in separate no-call counterfactual sidecars; new hosted calls pin the final compiled module.

The menu guard uses caption text and model-produced image descriptions/layout flags. They are deterministic code over those inputs, not an independent OCR verifier. No source IDs or business names are hardcoded in the candidate prompt/gates.

Earlier V6/V7 runner metadata used the wrong prompt resolver for fingerprint reporting. Actual transport used the frozen candidate prompts. A separate `prompt-fingerprint-corrections-v6-v7.json` reconstructs 1,182 fingerprints; raw calls, response content and usage remain unchanged. V8 onward uses the shared resolver and tested actual attachment count.

## Final results

The frozen V10 high run completed **522/522** calls, covering **861 initially attached images**, with no request errors, inconclusive responses, budget stops, or missing image-analysis entries. No-call replay through the final `source-menu-guards` policy reproduced the recorded baseline and changed **zero decisions** across all 522 initial cases, 33 full-gallery cases and 24 text cases. The final source review separately retains the two Nature Space appearances as uncertain accommodation/activity scope questions, as advised by the independent final reviewer; their original review labels and earlier reviewer-reject observations remain preserved.

| Check | Completed | Source judgment | Estimated token cost |
| --- | ---: | --- | ---: |
| Four-day initial-image cohort | 522/522 | 489/490 clear cases; one false accept, zero confirmed false rejects; 32 uncertain | $0.39735426 |
| Original regression fixtures | 12/12 | 12/12 correct; all 27 image entries populated | $0.01121900 |
| Complete source galleries | 33/33 | 30/30 clear cases correct; three uncertain; all 165 image entries populated | $0.04135940 |
| Actual text-only posts | 24/24 | 21/21 clear cases correct; three uncertain | $0.01074894 |
| Final hosted runtime regression | 22/22 | 22/22 correct; all 42 image entries populated | $0.00949318 |

The original immutable binary labels score **400/410**, with nine accepts originally labeled reject and one rejection originally labeled accept. Source adjudications explain real advertised discounts/activities among those disagreements. The remaining original-label false rejection is October 8 row 26: “Hope to see everyone for wings 4pm–9pm tonight,” with an ordinary wings photograph but no explicit special/deal wording. It remains a possible daily-feature miss versus ordinary menu availability, not evidence of a proven perfect classifier. Its source and decision remain available for review. The 32 uncertain appearances are neither scored successes nor silently treated as confirmed non-events.

The one clear false accept is October 7 row 207: a past automobile-maintenance recap with a community-complex sign in the background. Luna treated the incidental “PICKLEBALL” sign as a current public activity. See the dedicated downstream replay below. Nature Space's seasonal retreat invitation is not counted as a confirmed false accept or confirmed event without settling accommodation-versus-independently-bookable activity scope.

The initial/full-gallery comparison differs only for the uncertain Nature Space October 7 appearance; no clear source decision regresses between the first-four-image and full-gallery tests. Populated image entries prove attachment coverage, not perfect OCR. Some literal semantic-cue assertions differ because of paraphrases or omitted venue/address words; they remain advisory findings rather than being rewritten to make scores perfect.

| Parse | Tested appearances | Accept | Reject |
| --- | ---: | ---: | ---: |
| October 5 | 108 | 53 | 55 |
| October 6 | 140 | 78 | 62 |
| October 7 | 143 | 63 | 80 |
| October 8 | 131 | 57 | 74 |

### Matched cost and quality

Forty-eight distinct source posts were replayed fresh through both the accepted Mini baseline and the candidate. On the same 47 clear source judgments, Mini is **44/47**, with three false accepts and no false rejects; Luna is **47/47**, with no confirmed errors. One source is uncertain and unscored on both sides. The control is balanced by day and label; it is not a production-frequency weighting.

| Matched 48 | Input tokens | Cached input tokens | Output tokens, including reasoning | Reasoning tokens | Estimated cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| GPT-5 mini baseline | 102,516 | 6,272 | 50,482 | 24,512 | $0.12518180 |
| Luna high candidate | 191,700 | 27,161 | 24,858 | 8,106 | $0.03326799 |

This is **73.4% lower estimated Stage 1 token cost**, not the early small-screen 90% estimate and not a 73.4% reduction in the whole parser bill. A hypothetical all-input-uncached scenario gives approximately **71.3%** savings for these same token counts. The candidate includes model, prompt and eligibility-gate differences, rather than a pure model-name-only experiment. Output limits remain the established per-model budgets (Mini 2,000, Luna 6,000).

Costs use SDK-reported usage and pinned conservative Standard API rates: Mini input/cache/output $0.25/$0.025/$2.00 per million; Luna uncached input conservatively reserved at $0.125, cache $0.01, output $0.50. Output cost already includes reasoning tokens; it is not billed again. These are reproducible estimates, not invoice totals or guarantees for a future production mix. Stage 1 Luna median call time is **5.691 s**, p95 **11.381 s**; the matched Mini median is 8.861 s, p95 12.725 s. These figures do not resolve Nano Stage 4/5 latency.

## What “downstream” means, with concrete evidence

The no-write replay retains Mini in Stage 2, Luna high in eligible Stage 3, Nano low in Stage 4 and Nano medium in Stage 5, with nine-item formatting batches. An explicit saved Stage 1 validation override is allowed only under dry-run/local-image guards. No Firebase writer is called. Final replay events are **candidate payloads**, not evidence of a live Firestore write or app-visible duplicate.

### PowerSkating date table

The source has exactly 20 Saturday/Sunday one-offs, 7–8 a.m.; it skips November 7/8 and December 26. V6 and V7 replays preserved all 20. One V8 replay extracted 28 because Stage 3 repeated eight existing occurrences; Stage 5 additionally moved a date. An identical V8 repeat preserved all 20. Routing comparison showed the same calendar flags and whole-image route; this was not an added Stage 1 crop.

Most importantly, `downstream-production-v9.jsonl` has 20 correct Stage 3 items. Closer field-level inspection during pilot preparation found that its 20 Stage 4 items (all recurrence `none`) already contained date and age-group mutations: an invented December 26, missing October 25/November 15, and misassigned U9/U11 entries. Stage 5 then introduced `weekly_saturday` and further changes; recurring-series collapse reduced the final payload to 10. The repair therefore protects both the Stage 4 source inventory and the Stage 5 occurrence fields. Its console contains an invented December 26 in the collapse sequence. This is an existing formatter/recurrence invariant risk, not evidence that a useful post should be rejected at Stage 1. A targeted repair should bind formatted output to each validated source identity/date/time/recurrence before recurrence collapse; broader duplicate cleanup remains separate work.

### Mixed Summerside gallery

There are four source-grounded timed activities: three Art Buds sessions and a Keyhole show. Yoga notices lack source times and are held later. One V7 replay produced the correct four; V8/V9 also produced three ordinary waffle/month-long-menu candidates. Stage 1 must accept the post because it contains real activities. Its boolean decision cannot prevent every ordinary item in a mixed gallery from being extracted by later stages.

### Harbourfront and source conflict

The ten-item inventory survives later replays, including three caption-only entries with image index `-1`. A prior paired replay chose the caption's 7:30 p.m. for Relive while its poster says 7 p.m.; later replays chose 7 p.m. A source conflict must be reported/resolved at extraction/time validation, not turned into a Stage 1 eligibility rejection.

### Pure menu and pure recap

For October 5 row 278, Stage 3 initially found no specials, then the generic same-Luna fallback extracted 14 ordinary menu items that survived later formatting. The new Stage 1 guard rejects this post; the guarded replay has zero Stage 2–5 calls and zero candidate payloads. This was not a GPT-5.2 legacy fallback.

October 6 row 322's retrospective Fall Fest photos initially passed Stage 1; later stages held its candidate for missing final details and produced zero final events. The final policy leaves that decision to the model and later validation, preserving current activity offers mixed with retrospective text. The actual frozen V10 model rejects this source independently; removing the forced recap guard changes none of the 522 saved decisions.

### Incidental sign and item-evidence safety gap

`downstream-incidental-sign-v10.jsonl` replays October 7 row 207. A closer log review during pilot preparation corrected the initial diagnosis: there was **no generic retry** in this replay. Stage 3 initially found multiple items. The caption-based guard held the October 3 maintenance recap, while a separate September 25 Mary Walsh Cavendish Lit Fest item advertised on the background sign survived. Its date appeared in the extracted image description rather than in the caption that the guard inspected. That item reached final formatting. The replay took 70.6 seconds and called no writer.

The pilot repair checks each item's extracted source evidence as well as the caption, applies the guard after enrichment on every extraction attempt, and prevents fallback after a source hold. Mixed posts retain unaffected items. It also records held items for review. A recorded skip reason alone never proves that every item was held. See `docs/stage1-50pct-pilot-2026-10-08.md` for focused tests and release status.

## Validation and production isolation

The TypeScript build, 40 offline mocked evaluator checks and three Stage 2 routing checks pass. A 960-case old/current routing-resolver comparison agrees exactly. Tests cover unchanged production transport/defaults, source/gallery hashes, fallback visibility, budget stops, response metadata, candidate fingerprint equality, local-gate replay and protected input paths.

Hosted smoke uses only the manually invoked Cloud Run job `stage1-dryrun-20261008` in `northamerica-northeast1`, project `gathr-migrated`. The bundle contains allowlisted validator/runtime/types/logger modules, the runner, frozen images and OpenAI 4.104.0; it has no Firebase client or event writer. Its dedicated service account has no project-wide role, only access to the existing OpenAI secret; one task, no task retries, no scheduler, twenty-minute limit. A successful job exit is not the score: inspect every case, coverage and usage record.

The final menu-guard execution is `stage1-dryrun-20261008-gw954`, completed successfully in 62.05 seconds: 22/22 correct decisions, all 42 image entries, 22 requests, no errors/inconclusive responses/budget stop. Its compiled validator hash is `559b817e6e3c365c89f3b5e7e1f05a4f497170d9dd3d0a9a45eb7a40df22f885`, matching the final local build. The earlier frozen V10 full-cohort module hash is `bef27dc46f2a08affad2c27c9999b1f5765e3f76c363833420f0e34184075aaa`. No-call sidecars explicitly bridge the differing local policies; they are not represented as 522 additional paid final-policy API calls.

Fresh production function readback during this work still shows Mini Stage 1 and the accepted 100% eligible-image Luna Stage 3 configuration. Revisions: `processdataset-00457-yuh`, `processdatasetresume-00421-tab`, `processdatasetselectedrows-00413-yey`, all ACTIVE. No production parser, traffic, map, media or live event records were changed.

## Rollout gates

Keep the agreed wet baseline until the Stage 3 transition/full-run audit is accepted. Then release only the Stage 1 model/prompt/gate change through the normal parser gates, starting with a useful-post sample and comparing accepted/rejected source inventories, ordered-gallery coverage, downstream routing and actual stage usage. Retain the Mini baseline for explicit comparison/rollback; do not silently call it as a fallback and then count that result as Luna-only success.

A clean controlled regular run with no confirmed useful-post loss supports moving Stage 1 to 100% within days. The retrospective evidence supports a **50% Stage 1 pilot**, followed by 100% after a clean normal-run source review. Before that release, preserve recent-past safety holds through generic retries and protect validated dates/recurrence from Stage 5 mutation. A few harmless eligibility false passes need not delay it indefinitely if later stages demonstrably hold them, but the two concrete downstream failures above must not be described as a fully green pipeline. This report prepares the candidate and the release gates; it does not record a live Stage 1 rollout approval.
