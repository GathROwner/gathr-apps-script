# Stage 1 local evaluation harness

This harness compares Stage 1 decisions and per-image descriptions on a frozen Oct. 8, 2026 source set. It does not process posts through later stages, read or write Firebase, mutate venues, or change release routing.

The original production prompt, schema, normalization, local calendar overrides, output limits, and image-error/no-image fallback remain the baseline. The compact arms use the same accept/reject policy and response schema; they shorten image-description instructions and use Responses Structured Outputs. This separates the model comparison (`mini-current` vs. `luna-current`) from the compact-prompt/structured-output comparison within each model family.

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

The final two commands are offline unless `--execute` is added. Paid API execution is intentionally outside this local implementation; the coordinator owns the approved replay command and credential use.

For an approved local replay, add `--execute` to the chosen command and set `OPENAI_API_KEY` in the process environment. The runner does not load `.env` files. It fixes the API base URL to `https://api.openai.com/v1`, disables SDK retries (`maxRetries: 0`), and uses a 60-second request timeout so every request is visible to the budget and JSONL log.

## JSONL, retries, and resume

The output file appends one `case_result` record per case/variant/image-set, plus a `run_summary`. A `request_attempt` record is flushed after each logical request attempt (including a budget stop before transport) and contains visible model output, request kind, image count, response status and ID, incomplete reason, latency, input/cached/output/reasoning tokens, and its estimated cost reservation. The case result includes all attempts, the normalized result, source-truth score, current-mini parity, image coverage/semantic checks, historical observation, and gallery counts.

When reusing the same JSONL file, completed and inconclusive case/variant pairs are skipped. Failed and budget-stopped pairs can be resumed. The budget includes earlier recorded attempts, including attempts that completed before an interrupted run. `--rerun` runs completed pairs again; their recorded cost remains part of the same file’s cumulative cap. `--output -` streams JSONL records to stdout; progress messages go to stderr for Cloud Run log collection.

## Estimated spend guard

The default stop is `$1.00`; `--max-estimated-usd` accepts a smaller positive limit and refuses values above `$1.00`. Before each API request, the runner reserves the model’s maximum output tokens and 25,000 input tokens per attached image, plus a conservative text-token estimate. It preflights every initial, output-limit retry, and no-image fallback request. It then replaces the reservation with a usage-based estimate when token usage is returned. Unknown-cost network failures retain their reservation.

The usage record includes reasoning tokens separately; they are already part of output-token billing and are not added a second time. The reserve is a spend guard, not an invoice guarantee: provider-side image tokenization and cache-write billing may vary. GPT-6 Luna’s estimate reserves uncached input at the published cache-write rate where usage details do not distinguish writes. Rates are pinned to Standard API pricing on 2026-10-08: [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) and [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

| Model | Input / 1M tokens | Cached input / 1M | Cache write / 1M | Output / 1M |
| --- | ---: | ---: | ---: | ---: |
| GPT-5 mini | $0.25 | $0.025 | — | $2.00 |
| GPT-6 Luna | $0.10 | $0.01 | $0.125 | $0.50 |

## Local tests

`npm run test:stage1-evaluation` builds the functions TypeScript and runs twelve mocked/offline checks. They cover production request-shape parity, compact Structured Outputs, production normalization and local gates, hash/path/gallery validation, per-image semantic association including ordinal dates, clock punctuation, possessives, plural forms, source-visible cue requirements and swapped descriptions, dense-layout flags, image-error/truncation/no-image fallback visibility, spend-stop behavior, JSONL resume and usage estimates, and the client’s retry/timeout settings. The fake transport is local; tests make no network calls.

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
