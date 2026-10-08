# Stage 1 dry-run screen — October 8, 2026

## Status

The local and isolated Cloud Run paths are wired and tested. Production Stage 1 remains GPT-5 mini; production Stage 3 remains Luna high on 100% of eligible image posts. No events or venues were written. This is a screening result, not a production model-change approval.

## Local measured results

12 source-reviewed cases, four configurations, first four gallery images in production attachment order. All 48 comparisons completed; 51 actual API attempts included three output-limit retries. Every completed result retained one populated description and relevance entry per attached image. No no-image fallback, request failure, unresolved spend reservation, or final inconclusive result occurred.

| Configuration | Correct source decisions | Estimated API cost | Mean request time per case, including retries | Retries |
|---|---:|---:|---:|---:|
| mini-current | 9/12 | $0.04633 | 14.67 sec | 2 |
| mini-compact-structured | 8/12 | $0.03732 | 10.83 sec | 1 |
| luna-current | 10/12 | $0.00653 | 4.76 sec | 0 |
| luna-compact-structured | 11/12 | $0.00483 | 5.34 sec | 0 |

Compact Luna reduced estimated token cost by 89.6% against current mini on these same 12 posts. Rates are USD; estimates include cached input and billed output/reasoning. Luna uncached input is conservatively priced at its cache-write rate where usage does not distinguish writes. Cloud build/hosting cost is excluded. This small, deliberately challenging source set is not representative of the whole scrape; do not extrapolate the accuracy or savings as a release guarantee. The compact arms change both prompt verbosity and response format, so their separate effects were not isolated.

## Concrete findings

- Both Luna configurations correctly rejected the council nominations notice (row 48), ordinary Toby's farm stock/pickup (124), and ordinary Holman's flavor list (339). Current mini accepted 48 and 124; compact mini also incorrectly accepted 339.
- All four configurations incorrectly accepted the Christmas-decoration retail sale (236). This is a Stage 1 false positive; downstream production filtering remains in place. No live listing was created by this screen.
- Current-prompt Luna incorrectly rejected the legitimate October 5–9 Kensington Fall Dessert Trail (150) as ordinary featured menu items. Compact Luna accepted it. Compact Luna accepted all eight positive cases.
- On PowerSkating (287), both Luna configurations recognized the schedule grid and multiple sessions but returned recommendsTiling=false and hasDenseText=false. They read the dates accurately in the current-prompt descriptions, but routing and inventory audit rely on these signals; a later-stage dry replay is required before a Stage 1 rollout. Compact descriptions intentionally do not fully transcribe the 20 dates.
- Short-description cue checks are advisory. Original scores are retained; separate offline rescoring corrects harmless ordinal/plural/time spelling differences and source cues that had demanded caption-derived identities. Manual review found the flagged photos and posters corresponded to their source indexes. Image descriptions should not have to guess a drink's identity or a venue name absent from the image.

## Hosted proof

Cloud Run Job: stage1-dryrun-20261008, project gathr-migrated, region northamerica-northeast1. Execution stage1-dryrun-20261008-w4zr9 completed successfully with one task, zero task retries, in 3m14.05s.

Initial tested container digest: sha256:95c38c637d8a885d1f1cee6ebc6c18961003fdf028d9802249b4e14742e36070.

Hosted smoke: PowerSkating row 287 and full five-image galleries 65 and 62, each across all four configurations. All 12 comparisons completed, all 12 accept decisions matched source truth, all image counts/indexes were preserved. 15 API attempts included three mini output-limit retries; Luna had none. Estimated API cost: $0.0396785. Every configuration described Harbourfront image 4's printed October 19 7:00 pm correctly, rather than copying the caption's 7:30 pm.

Runtime bundle imports only OpenAI and local Stage 1/logger/type modules. The dedicated account stage1-dryrun-20261008@gathr-migrated.iam.gserviceaccount.com has no project IAM binding and only secret-specific Secret Manager access to the existing API key. The bundle contains no Firebase client, parser entry point, event writer, .env, or credential file. The job is manually executed and has no scheduler.

Total estimated API cost for both screens: $0.1346873. Raw local JSONL, hosted logs/JSONL, execution metadata, bundle hashes, scorer derivatives, IAM readback, and production before/after evidence are saved in this directory.

Latest scorer/fixture bundle was deployed after the paid screen, with no prompt/model change. A hosted offline preflight (execution stage1-dryrun-20261008-qrkm4) completed successfully in 8.02 seconds, validated all 12 cases/27 images and the 48-request plan, and emitted no API attempt records. Its digest is sha256:39da6121bd20dce173261ad1db514fa0472398aba8ec97c513cc164144df328c. The original paid screen digest and raw outputs remain preserved. Twelve offline regression tests pass. The reproducible bundle builder and manual hosted commands are documented in stage1-local-evaluation.md.

## Production continuity

All three parser functions were read back ACTIVE with source hash 6ec1fb03acc847610ed2dd5f3ef8ae2cf4e42b10 and 100% traffic on processdataset-00457-yuh, processdatasetresume-00421-tab, processdatasetselectedrows-00413-yey. Before/after model settings and traffic match. Tomorrow's regular parser baseline is unchanged.

## Recommended next step

Finish tomorrow's Stage 3 full-run audit, then feed compact Luna's saved Stage 1 results through later-stage dry replays. Check PowerSkating routing/date completeness, all gallery hero-image indexes, food-deal acceptance, and retail rejection before considering a Stage 1 canary. Keep Stage 4/5 optimization separate.
