# October 11 Stage 1 cache release

## Authorization and scope

Craig approved implementing the tested Stage 1 static-prefix cache recommendation, followed by similar audits of Stages 2-5. Starting accepted baseline: `d9f2a14` on `codex/luna-oct11-integrity-repair`. Prior serving hash: `551a5ee79e21b5d374c455c220417ad046659b00`. Only Stage 1 request construction changes in this release. Model allocations, reasoning, qualification rules, schemas, image order/detail/bytes, output limits, retries, worker fencing and live records remain unchanged.

`stage1PromptCache.ts` builds the exact two text blocks tested in `luna-stage1-oct11-cache-experiment.md`. It applies only to Luna's compact-v10, non-structured-output request. Other models, older evaluation variants and structured requests retain their original handling. Unknown prompt shapes return to the unchanged request layout. The changing attachment-count line and source fields follow the explicit static boundary; source images follow in their original order. Request cache mode is explicit, TTL 30m.

## Validation

- Build passed; 607/607 backend tests and 112/112 request/evaluation checks passed.
- Offline request-builder comparison: 101/101 sources exactly match the experimentally tested candidate request, including roles, rules/schema text, all source fields, images, reasoning and token limit.
- Six actual API controls: rows 37 (caption-only), 64 (HarvestFest), 66 (brunch), 277 (author/ticket link), 292 (Souris tour list), 332 (farm visit/market). All completed; no missing image analyses, output-limit retry or no-image fallback. Decisions matched the preceding full experiment. Inspect `builder-api-check.json` for every result, raw response and usage.
- An initial check made three live calls and stopped when brunch was accepted instead of the earlier fresh rejection. That is the source-correct decision and further evidence of the already recorded shared qualification variability. The harness had incorrectly required exact fresh-response parity; it now requires exact request equality and reports live decision differences for review. Initial raw responses were not saved before that assertion, so those three calls lack complete cost evidence. The complete repeat's six calls are retained. No qualification rule was changed to hide this issue.
- The first fingerprint test exposed the evaluation preflight's assumption that only one input text block exists. Preflight hashing and the test now cover both real blocks. Other model/variant fingerprints are unchanged.

Fresh function/traffic readback proved all three functions ACTIVE at the prior common hash with 100% traffic on latest revisions. Firestore preflight found no active locks, a completed processed marker and final batch, and no checkpoint. Evidence is under ignored `functions/artifacts/luna-stage1-cache-release/`; the readback helper saves only parser flags and serving metadata.

## Deployment

Pending narrow dry-run deployment, actual deployment and independent post-deploy readback. Stages 2-5 caching experiments are separate, not included in this runtime release.
