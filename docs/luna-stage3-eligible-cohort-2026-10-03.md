# Luna Stage 3 eligible-cohort allocation — October 3, 2026

## Reason for change

The existing `LUNA_CANARY_SAMPLE_PERCENT=17` hashes every post ID before Stage 1. That gives each ID an independent 17% chance, but many sampled rows never reach Stage 3. In the October 3 full dataset, 26 IDs were selected and only 12 reached Luna. The completed-run audit is in `luna-stage3-oct3-production-audit.md`.

The new regular full-dataset route allocates the 17% canary **after Stage 2 has passed**. It counts posts with a usable, preprocessed image gallery of at most eight source images, excluding the configured post IDs. Text-only posts are outside this Luna image canary. The selected count is therefore a share of Stage-3-ready image posts, not of all scraped rows, and actual Luna calls may still be lower if a later image or source-identity guard holds a selected post.

## Allocation and continuity

- Each eligible post gets the next ordinal in the dataset. One position is selected in each approximately five-to-six-post window. The position is deterministic from the dataset ID and window index, so source-order patterns do not always choose the same position. This selects exactly 17 of 100 eligible posts, with a one-post tail variation for shorter datasets.
- `lunaStage3EligibleCount` and `lunaStage3SelectedCount` live in the existing batch statistics, which are saved to the Firestore checkpoint and restored on resume. A new dataset starts both at zero.
- Direct parser calls and selected-row replays retain the existing post-ID hash or explicit allowlist. They do not consume the full-dataset quota.
- Stage 1 and Stage 2 remain on GPT-5 mini. A selected post switches Stage 3 to GPT-6 Luna high; Stages 4 and 5 remain on GPT-5 nano. The legacy Stage 3 route stays GPT-5.2 for unselected posts. The configured Luna legacy fallback remains disabled.
- Because selection now happens after Stage 2, a selected post with more than four gallery frames has its ordered full gallery restored and receives a mini Stage 1/2 refresh on those images before Luna Stage 3. Existing image provenance and source-identity holds remain in force.

## Local verification

- TypeScript build passed. Focused quota and safety tests passed 12/12, including deterministic 17/100 and 170/1000 allocation and checkpoint continuation through 90 eligible posts.
- The Oct 3 CBA post was run through the exact-post managed dry-run harness with forced late quota selection: mini in Stages 1–2, Luna in Stage 3, nano in Stages 4–5, no GPT-5.2 fallback, and no Firestore write. Evidence: `artifacts/luna-oct3-canary-audit/row-166-eligible-quota-r2.json`.
- The same post with forced nonselection used mini in Stages 1–2 and GPT-5.2 in Stage 3. Evidence: `artifacts/luna-oct3-canary-audit/row-166-eligible-quota-unselected.json`. The model output varied and contained no Stage 3 item in this replay, so this test proves routing only.
- A read-only Firestore processing-lock check at 2026-10-03T20:57:47Z found zero active or processing runs.

## Release and rollback

Deploy only `processDataset`, `processDatasetResume`, and `processDatasetSelectedRows` after the narrow Firebase dry run. Preserve the prior serving revisions `processdataset-00438-jon`, `processdatasetresume-00402-cop`, and `processdatasetselectedrows-00394-sah` for immediate traffic rollback. For a safe operational stop, set `LUNA_CANARY_ENABLED=false` on all three services; this sends Stage 3 through the existing GPT-5.2 route while retaining the code. Any deployment during an active full parse must be deferred.

The next newly completed regular full dataset is required to measure actual eligible and selected counts, Luna calls, holds, writes, provenance, and cost. Do not treat local dry runs as production evidence.
