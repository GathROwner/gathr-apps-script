# Stage 1 local evaluation harness

The coordinator completed paid local and hosted screens. See [October 8 results](stage1-oct8-dryrun-results.md). The production Stage 1 prompt and decision path remain unchanged. The Stage 2 routing resolver was extracted for exact offline comparison, and evaluation-only Stage 1 overrides are guarded by dry-run/local-image checks.

This harness compares Stage 1 decisions and per-image descriptions on a frozen Oct. 8, 2026 source set. It does not process posts through later stages, read or write Firebase, mutate venues, or change release routing.

The original production prompt, schema, normalization, local calendar overrides, output limits, and image-error/no-image fallback remain the baseline. `compact-v2` through `compact-v10` are separate policy candidates added for evaluation; each prompt remains frozen after its run. They return the same response schema using the normal JSON response path. A failed image request can use the existing caption-only fallback, but that pair is marked inconclusive and is not scored as an image pass. The original 12-case fixture is a regression screen; the four-day cohort and source reviews are documented separately below.

## Frozen source set

`test/fixtures/stage1-oct8/manifest.json` contains 12 source cases and 27 local JPEG copies with SHA-256 hashes. The fixture files were copied from `luna-oct8-full-audit`; the source artifacts were left untouched.

| Source rows | Expected source truth | Main reason |
| --- | --- | --- |
| 48, 236, 124, 339 | Reject | Election administration, retail holiday merchandise, ordinary market stock, or ordinary ice-cream flavor availability |
| 118, 212, 329, 343 | Accept | Advertised food deal, dated concert, pancake fundraiser, or timed community event |
| 287, 65, 62, 150 | Accept | Dense PowerSkate schedule, dated activities, theatre calendar gallery, or date-limited dessert trail |

Rows 48 and 236 are flagged as known historical GPT-5 mini false accepts. That historic observation is separate from fresh scoring: a candidate that correctly rejects either case matches source truth even if it disagrees with the old mini result. Historical raw Stage 1 JSON was not retained, so the manifest labels downstream progression as context rather than presenting it as a raw Stage 1 response.

The manifest records the full gallery count and per-image source cues. The association check evaluates the description for each image index against that image’s cue groups and against neighboring-image cues that must not appear. Before matching, it normalizes ordinal date suffixes, common clock punctuation, possessive apostrophes, and regular plural forms. It catches swapped, nonempty descriptions and the Harbourfront Oct. 19 poster time contamination (the image says 7:00 PM; the caption says 7:30 PM). Cue matching is an advisory phrase check, not a semantic classifier: paraphrases can miss a cue, so inspect descriptions alongside the stored source image when a check fails.

## Image sets and variants

`--image-set initial` attaches the first four images in source order, matching the production initial image limit. `--image-set full` attaches all available source-gallery images up to 16. Each result records both selected and source gallery counts, selected indexes, and expected image-analysis coverage. The five-image rows 65 and 62 need `full` to assess their last image.

The default arms are:

| Variant | Model | Prompt and output format |
| --- | --- | --- |
| `mini-current` | `gpt-5-mini` | Existing production prompt and schema hint |
| `mini-compact-structured` | `gpt-5-mini` | Compact instructions, same decision policy/schema, Responses JSON Schema output |
| `luna-current` | `gpt-6-luna` | Existing production prompt and schema hint |

Add `--include-compact-luna` to include `luna-compact-structured`. The runner compares each candidate with the fresh `mini-current` decision in a separate parity field and scores decisions independently against `sourceTruth.expectedDecision`.

Use `--variants mini-compact-v2,luna-compact-v2`, `--variants mini-compact-v3,luna-compact-v3`, `--variants mini-compact-v4,luna-compact-v4`, or `--variants mini-compact-v5,luna-compact-v5` to select a compact policy pair. The defaults remain unchanged. V2 explicitly includes bookable/public activities, open recreation, daily food/drink offers, and organized public food trails while excluding election procedure and ordinary retail/menu marketing. V3 adds public meetings and farm/attraction access, food drives and free visitor offers, self-guided trails, and explicit limits for rotating menus, past-only recaps, and broadcast-only airtime. V4 clarifies that named public activities and trails qualify without complete schedules, distinguishes dated recreation access from ordinary business hours, rejects purchase invitations as evidence of a food special, and requires its decision fields and reason to agree. V5 explicitly accepts unpriced daily specials and admission offers, public museum/heritage visitor access, named activities with missing details, and in-person food giveaways while excluding ordinary stock, month-long featured menus, non-food retail discounts, personal past outings, and online engagement contests. None of the prompts contains cohort row text or IDs.

For a controlled reasoning-effort comparison, `luna-compact-v5-low` and `luna-compact-v5-high` use the exact same frozen `compact-v5` prompt and JSON response format as `luna-compact-v5`, while requesting GPT-6 reasoning effort `low` or `high` instead of the baseline `none`. Select the arms explicitly with `--variants luna-compact-v5,luna-compact-v5-low,luna-compact-v5-high`; variant IDs keep their JSONL resume keys separate. These are evaluation-only settings. The live/default GPT-6 Stage 1 path continues to request `none`.

## Local commands

Run from the `functions` directory in PowerShell. The offline preflight reads the fixture and hashes, reports the variants and estimated budget, and makes no API request. It does not need `OPENAI_API_KEY`.

```powershell
npm ci --no-audit --no-fund
npm run build
npm run test:stage1-evaluation

node scripts/stage1-evaluation-runner.mjs `
  --manifest test/fixtures/stage1-oct8/manifest.json `
  --output artifacts/stage1-oct8-initial.jsonl `
  --image-set initial `
  --include-compact-luna `
  --max-estimated-usd 1

node scripts/stage1-evaluation-runner.mjs `
  --manifest test/fixtures/stage1-oct8/manifest.json `
  --output artifacts/stage1-oct8-full.jsonl `
  --image-set full `
  --include-compact-luna `
  --max-estimated-usd 1
```

The final two commands are offline unless `--execute` is added. The evaluator supports paid requests only when that flag is present; the coordinator owns credential use and the approved run scope.

For an approved local replay, add `--execute` to the chosen command and set `OPENAI_API_KEY` in the process environment. The runner does not load `.env` files. It fixes the API base URL to `https://api.openai.com/v1`, disables SDK retries (`maxRetries: 0`), and uses a 60-second request timeout so every request is visible to the budget and JSONL log.

For the coordinator's 49-case regression manifest, the v3 preflight is:

```powershell
node scripts/stage1-evaluation-runner.mjs `
  --manifest C:\Users\craig\.codex\stage1-evaluation-20261008\cohort\manifest-repair-regressions.json `
  --variants luna-compact-v3 `
  --image-set full `
  --concurrency 3 `
  --max-estimated-usd 10 `
  --output C:\Users\craig\.codex\stage1-evaluation-20261008\luna-compact-v3-regressions.jsonl
```

This selects 49 requests and 72 images. The five-image Harbourfront case `oct8-row-62` is separately preflighted against `manifest-full-galleries.json`; it selects all five source images. Both commands remain offline without `--execute`. Change the variant to `luna-compact-v5` and use a separate output file to plan the next prompt version.

The `run_started`, `request_reserved`, `request_attempt`, `case_result`, and `run_summary` records include the SHA-256 of the compiled `lib/parsing/contentValidator.js`. Each case result, request record, and preflight plan also includes a SHA-256 of the exact effective prompt text, including the appended schema instruction when applicable. The plan, run records, and request attempts explicitly record `requestedReasoningEffort` so `none`, `low`, `high`, and non-GPT-6 requests remain distinguishable. These fields support reproducibility without copying source posts into logs.

## Downstream routing replay

`stage1-candidate-downstream-replay.mjs` takes completed, accepted Stage 1 records and runs the real parser's Stage 2–5 path so the candidate image descriptions and layout flags can be checked downstream. It requires `--execute`, explicit case IDs (no more than 50), selected variants, and an image set. It reads local media from the frozen manifest and appends route snapshots, downstream items, and actual model usage to a separate JSONL output. Keep the output outside the manifest's source root.

The adapter requires `DRY_RUN=true`, `PARSER_DRY_RUN_LOCAL_IMAGES=true`, an OpenAI key, and unset image upload/delete URLs. Image cases use the exact source post ID for the Stage 3 Luna canary with the full saved gallery, high reasoning effort, original image detail, and legacy fallback disabled. Text-only cases bypass Luna and retain GPT-5.2 Stage 3 with the current default reasoning setting. Stage 2 remains Mini; Stages 4 and 5 remain Nano, with Stage 5 batch size 9. The adapter does not write to Firestore, Storage, venues, or release channels.

`stage2-route-comparison.mjs` can recompute route decisions and dense-frame selections from downstream JSONL snapshots using the same exported production resolver and selector. It reports whether each recomputed route matches the route actually captured during replay.

## JSONL, retries, and resume

The output file appends one `case_result` record per case/variant/image-set, plus a `run_summary`. A `request_attempt` record is flushed after each logical request attempt (including a budget stop before transport) and contains visible model output, request kind, image count, response status and ID, incomplete reason, latency, input/cached/output/reasoning tokens, and its estimated cost reservation. The case result includes all attempts, the normalized result, source-truth score, current-mini parity, image coverage/semantic checks, historical observation, and gallery counts.

When reusing the same JSONL file, completed and inconclusive case/variant pairs are skipped. Failed and budget-stopped pairs can be resumed. The budget includes earlier recorded attempts, including attempts that completed before an interrupted run. `--rerun` runs completed pairs again; their recorded cost remains part of the same file’s cumulative cap. `--output -` streams JSONL records to stdout; progress messages go to stderr for Cloud Run log collection.

## Estimated spend guard

The default stop is `$1.00`; `--max-estimated-usd` accepts a positive limit up to the hard `$10.00` ceiling. Before each API request, the runner reserves the model’s maximum output tokens and 25,000 input tokens per attached image, plus a conservative text-token estimate. It preflights every initial, output-limit retry, and no-image fallback request. It then replaces the reservation with a usage-based estimate when token usage is returned. Unknown-cost network failures retain their reservation.

The usage record includes reasoning tokens separately; they are already part of output-token billing and are not added a second time. The reserve is a spend guard, not an invoice guarantee: provider-side image tokenization and cache-write billing may vary. GPT-6 Luna’s estimate reserves uncached input at the published cache-write rate where usage details do not distinguish writes. Rates are pinned to Standard API pricing on 2026-10-08: [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

| Model | Input / 1M tokens | Cached input / 1M | Cache write / 1M | Output / 1M |
| --- | ---: | ---: | ---: | ---: |
| GPT-5 mini | $0.25 | $0.025 | — | $2.00 |
| GPT-6 Luna | $0.10 | $0.01 | $0.125 | $0.50 |

## Local tests

`npm run test:stage1-evaluation` builds the functions TypeScript and runs 40 mocked/offline checks. They cover production request-shape parity, v2–v10 prompt selection and policy fixtures, frozen v3–v5 prompt snapshots, actual transport/preflight fingerprint equality for initial and full galleries, the unchanged GPT-6 default and low/high-effort evaluation arms, five-image 400-rejection handling, production normalization and local gates, hash/path/gallery validation, per-image semantic association, dense-layout flags, image-error/truncation/no-image fallback visibility, spend-stop behavior, JSONL resume and usage estimates, the client’s retry/timeout settings, and offline local-gate replay. The fake transport is local; tests make no network calls. `node --test lib/parsing/stage2Routing.test.js` runs the three production-route parity tests.

## Four-day candidate and local-gate experiment

The final evaluation arm is `luna-compact-v10-high-menu-guard`: compact V10 prompt, Luna high, existing image detail and output budget, plus the evaluation-only `source-menu-guards` policy. Production continues using its original prompt and gates. This policy requires public program language before an `/events/` URL can rescue a model rejection; an image plus a raffle ticket URL alone cannot force acceptance. It also rejects bare dated menu headings when neither the caption nor per-image analysis provides independent offer/schedule evidence. The final policy does not impose a photo-recap rejection because independent review exposed valid mixed-activity counterexamples to that rule. The original V10 high and intermediate mixed-offers arms remain frozen for reproducible replay. Strong text calendars and accepted mixed food/activity posts retain their existing handling. These guards partly consume model-produced image descriptions and layout flags; they are not an independent OCR ground-truth verifier.

Run a frozen cohort explicitly, with the paid-call cap:

```powershell
node scripts/stage1-evaluation-runner.mjs --execute --manifest C:\path\manifest-labelled.json --variants luna-compact-v10-high-menu-guard --image-set initial --concurrency 3 --max-estimated-usd 5 --output C:\path\cohort-v10-mixed.jsonl
```

The manifest and output paths must differ and the output must be outside the source-media root. Use `--image-set full` for the separate gallery completeness audit. Caption-only fallback after a failed image request is inconclusive; it is not a successful visual result.

For a no-call counterfactual on saved model responses:

```powershell
node scripts/stage1-local-gate-audit.mjs C:\path\manifest-labelled.json C:\path\cohort-v8-high.jsonl C:\path\gate-audit.json source-menu-guards
```

This writes a separate sidecar containing input hashes, replayed decisions and skipped records. It validates that the legacy-gate reconstruction matches the saved result before applying the candidate gate. Original model outputs, billing records and source labels are preserved. The `parsed` field on an attempt is a boolean success indicator; the audit parses `visibleOutput` and fails closed on unavailable JSON.

See `stage1-oct5-8-comprehensive-evaluation.md` for cohort exclusions, source adjudications, cost limits and the rollout recommendation. Prior V6/V7 runner prompt fingerprints were reconstructed in an external sidecar after a metadata resolver omission was discovered; raw responses and actual model calls were not changed. V8 onward uses the shared prompt resolver and tested attachment count. Reused holdout cases are confirmation tests after their first evaluation, not additional blind validation.

## Minimal Cloud Run module bundle

The coordinator can package the read-only runner without the Firebase/Admin SDK. Runtime files are:

```text
scripts/stage1-evaluation-runner.mjs
scripts/stage1-evaluation-lib.mjs
test/fixtures/stage1-oct8/manifest.json
test/fixtures/stage1-oct8/images/*.jpg
lib/parsing/contentValidator.js
lib/parsing/runtimeConfig.js
lib/parsing/types.js
lib/utils/logger.js
```

`contentValidator.js` imports `openai`, `types.js`, `runtimeConfig.js`, and `logger.js`. Use a job-local `package.json` containing `{"private":true,"type":"commonjs","dependencies":{"openai":"4.104.0"}}`, then install its runtime dependencies with `npm install --omit=dev --no-audit --no-fund`. Do not copy the functions package’s Firebase dependencies, `lib/index.js`, Firebase credentials, `.env` files, or any Firebase data code.

After the coordinator approves the model replay and supplies its secret-backed environment, the container entry point is:

```text
node scripts/stage1-evaluation-runner.mjs --execute --manifest test/fixtures/stage1-oct8/manifest.json --image-set full --include-compact-luna --max-estimated-usd 1 --output -
```

The full gallery plan covers all 27 images across 12 cases and four arms. Its offline first-attempt estimate is about `$0.696`; retries can use the remainder up to the `$1.00` cap. The runner itself has no Firebase API import or venue-write capability; the service account and secret binding remain Cloud Run configuration owned by the coordinator.

## Reproducible hosted bundle and manual execution

From `functions`, build the TypeScript, then package an empty directory:

```powershell
npm run build
node scripts/stage1-build-dryrun-bundle.mjs C:\Users\craig\.codex\stage1-evaluation-next-bundle
```

The builder copies only the allowlisted Stage 1 modules, runner, validated frozen images, and a pinned minimal OpenAI dependency lock. It refuses to overwrite a nonempty directory. Its default hosted smoke manifest selects rows 287, 65 and 62 with full galleries and all four arms; the complete 12-case manifest is also bundled.

The existing manually invoked job is `stage1-dryrun-20261008`, project `gathr-migrated`, region `northamerica-northeast1`. It has no scheduler, one task, zero task retries, a 20-minute execution limit, and a dedicated service account with only secret-specific access to the existing OpenAI credential. It contains no event writer or Firebase client.

To rebuild that isolated job, run from the new bundle directory:

```powershell
gcloud run jobs deploy stage1-dryrun-20261008 --source=. --project=gathr-migrated --region=northamerica-northeast1 --service-account=stage1-dryrun-20261008@gathr-migrated.iam.gserviceaccount.com --set-secrets=OPENAI_API_KEY=OPENAI_API_KEY:latest --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=20m --cpu=1 --memory=512Mi --quiet
```

When another paid smoke test is wanted, execute it explicitly:

```powershell
gcloud run jobs execute stage1-dryrun-20261008 --project=gathr-migrated --region=northamerica-northeast1 --async
```

For a hosted offline preflight, override the image's CMD with arguments that omit `--execute`:

```powershell
gcloud run jobs execute stage1-dryrun-20261008 --project=gathr-migrated --region=northamerica-northeast1 --args="node,scripts/stage1-evaluation-runner.mjs,--image-set,full,--include-compact-luna,--output,-" --async
```

Use the returned execution name to inspect completion and collect Cloud Logging records. A successful job exit alone is not quality evidence: inspect its `case_result`, `request_attempt`, and `run_summary` records, source images, and held/incomplete status. The October 8 paid execution remains pinned to its recorded image digest; later fixture/scorer repairs do not alter its raw outputs.
