# GathR parser model and cost reference

Recorded October 9, 2026. All costs are **USD OpenAI API token estimates**, excluding scraping, Cloud Run, storage, Firestore, transfer and tax. Keep the model choice, reasoning effort and safeguards together when incorporating a change.

## Models and implementation status

| Stage and job | Legacy model | Recommended model and effort | Recorded status and next gate |
| --- | --- | --- | --- |
| 1 Content eligibility and image signals | GPT-5 mini | GPT-6 Luna high with compact prompt and current eligibility guards | Released at 100% for eligible image and caption-only posts; audit next two regular full runs |
| 2 Classify and route content | GPT-5 mini | GPT-6 Luna none initially, with one high review of negative results | Prepared locally; 50% pilot after Stage 1/3 full-run audit, then review before 100% |
| 3 Extract events and specials | GPT-5.2 | GPT-6 Luna high | Released at 100% for eligible image and caption-only posts; continue inventory and write audit |
| 4 Validate extracted items and recurrence | GPT-5 nano low | **Retain GPT-5 nano low for now**; Luna none is the leading quality challenger | Fix prose contradiction override before a Stage 4 pilot; Luna did not reduce Stage 4 cost |
| 5 Format final records and assign categories | GPT-5 nano medium | GPT-6 Luna none | Local comparison completed; strengthen small-post completion and reconstructed price/link preservation, then shadow test before rollout |

Status comes from the October 9 release records and local comparisons. The next full-run audit must verify actual model calls and live configuration. Exceptional image-ineligible inputs can still use existing legacy handling; image failures are not treated as caption-only posts. Selected Luna posts have no legacy GPT-5.2 fallback.

## Published token rates

Standard short-context API rates per **one million tokens**, verified October 9. Reasoning tokens contribute to billed output usage, so identical per-token prices do not imply identical costs at different reasoning efforts.

| Model | Input | Cached input read | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) | $0.25 | $0.025 | Not separately listed | $2.00 |
| [GPT-5.2](https://developers.openai.com/api/docs/models/gpt-5.2) | $1.75 | $0.175 | Not separately listed | $14.00 |
| [GPT-5 nano](https://developers.openai.com/api/docs/models/gpt-5-nano) | $0.05 | $0.005 | Not separately listed | $0.40 |
| [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) | $0.10 | $0.01 | $0.125 | $0.50 |

Luna none, low, medium and high have the same listed rates; their token consumption and latency differ. Long contexts, other service tiers and regional processing can change these rates. The comparisons below use the recorded standard-rate assumptions.

## Workload cost comparisons

**Compare costs within a row. Do not add these rows:** they use different cohorts and dates, and are not full-parse daily totals. Recorded usage estimates are not invoices or guarantees for future runs.

| Stage | Evidence workload | Legacy cost | Recommended approach cost | Difference |
| --- | --- | ---: | ---: | --- |
| 1 | 48 matched posts, original Mini versus compact Luna high | $0.125182 | $0.033268 | 73.4% lower reported estimate |
| 2 | 119 paired production-preprocessed cases; candidate includes 16 high reviews | $0.282025 | $0.092576 | 67.2% lower with recorded caching; 73.1% lower without cache effects |
| 3 | October 2 Stage 3-only substitution, 88 attempted posts | Not reconstructable from legacy snapshots | At most $0.123737 for Luna Stage 3 | No measured paired legacy saving available for this cohort |
| 4 | 25 validator runs, 170 input occurrences per arm | $0.031051 | $0.031051 baseline retained | No model change recommended yet |
| 5 | 13 formatter runs, 104 input occurrences per arm | $0.057857 | $0.021351 | 63.1% lower with recorded caching; 61.8% lower without cache effects |

Stage 1's larger matched high-effort comparison replaces the initial 12-case approximately 90% saving as the planning reference. It changes the prompt and policy alongside the model. Its saved cost estimator conservatively charged Luna non-read input at the cache-write rate when writes were not separately identified; it is a reported estimate rather than an invoice reconciliation. Its conservative uncached comparison is 71.3% lower. The complete new Stage 1 image/text daily cost awaits the next regular-run audit.

Stage 2's production-preprocessed comparison supersedes the earlier original-color-image estimate of 80–90% savings. An approximately 50/50 mixture would save about 36.5% of Stage 2 token cost under the cache-neutral scenario, not 36.5% of the whole parser bill.

For Stage 3, applying GPT-5.2 rates to the **Luna cohort's token counts** gives $2.777661 versus $0.123737 on Luna, or 95.5% less. This is only a token-price illustration: it is not actual GPT-5.2 spend or a measured savings percentage. Historical GPT-5.2 tiling and model output can consume different token counts. Keep this illustration separate from measured comparisons.

## Stage 4 and 5 reasoning alternatives

These retain each stage's existing prompt, batching and guards. The Stage 4 and Stage 5 cohorts differ, so compare alternatives within each stage only. Sum of run times includes batching and existing recovery; it is not whole-parse elapsed time.

| Stage | Model and effort | Cohort cost | Change versus that stage's Nano baseline | Summed run time |
| --- | --- | ---: | --- | ---: |
| 4 | Nano low | $0.031051 | Baseline | 322.2 s |
| 4 | Luna none | $0.035437 | 14.1% more | 292.8 s |
| 4 | Luna low | $0.033790 | 8.8% more | 300.9 s |
| 4 | Luna medium | $0.037072 | 19.4% more | 348.2 s |
| 5 | Nano medium | $0.057857 | Baseline | 568.8 s |
| 5 | Luna none | $0.021351 | 63.1% less | 166.9 s |
| 5 | Luna low | $0.025355 | 56.2% less | 218.7 s |
| 5 | Luna medium | $0.028433 | 50.9% less | 231.6 s |

Stage 4 Luna none needed no count/JSON fallback and had fewer checked final decision errors; medium omitted three valid advertised PowerSkating sessions on one pass. The existing guard reverses some correct rejections by matching “valid event” within “not a valid event.” That guard affects Nano and Luna and requires a separate fix.

Stage 5 Luna none retained the checked fields in the comparison. Low required a missing-item retry; medium exposed a missing-item reconstruction that lost the supplied wings price. Preserve raw-versus-repaired evidence and strengthen those shared safeguards before a live formatter pilot.

## Sources for future updates

- [Stage 1 100% release](luna-stage1-100pct-oct9-release.md) and [image/text routing release](luna-text-only-oct9-evaluation-and-release.md).
- Stage 1 matched comparison: `C:\Users\craig\.codex\stage1-evaluation-20261008\stage1-final-evidence.json`, candidate `luna-compact-v10-high-menu-guard`; a sanitized cost extract and source hash are retained in the reference JSON below.
- [Stage 2 production-preprocessed pilot readiness](luna-stage2-oct9-release-readiness.md).
- [Stage 3-only substitution comparison and cost limits](luna-oct2-stage3-swap-comparison.md).
- [Stage 4 comparison](luna-stage4-oct9-model-comparison.md) and [Stage 5 comparison](luna-stage5-oct9-model-comparison.md).
- [October 8 actual stage cost report](luna-oct8-stage-cost-report.md), retained as the historical daily baseline. Do not describe its partially migrated Stage 3 as a fully legacy run.
- [Machine-readable reference](../artifacts/luna-model-cost-reference-2026-10-09/reference.json) preserves exact values, cohorts and source paths.

Update this reference after a completed regular-run audit with new production cost and model-allocation evidence. Keep local tests, modeled scenarios and actual production workloads distinct. Creating this reference makes no deployment or live data change.
