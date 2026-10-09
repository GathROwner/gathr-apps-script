# Frozen Stage 5 comparison, October 9

Read `docs/luna-stage5-oct9-model-comparison.md` for scope, findings and limitations.

- `cohort.json`: identical frozen inputs for each arm, with source references.
- `results/*.json`: 52 formatter runs, raw Responses outputs, actual usage, requested effort and prompt/schema hashes. These are local outputs, not live writes.
- `summary.json`: derived metrics, field checks, raw output checks and paired request checks.
- `build.log`, `tests.log`: successful build and 87 focused regression tests.

## Recompute without API calls

From the repository root in PowerShell:

```powershell
$env:AUDIT_DIRECTORY = Join-Path (Get-Location) 'artifacts/luna-stage5-oct9-model-comparison'
node functions/scripts/stage5-model-audit-report.cjs
```

This regenerates only `summary.json`. It asserts identical initial prompt/schema hashes in paired arms. Historical captures match requests to usage through token counts; future captures include response IDs for direct matching.

## Repeat one API comparison

Build `functions` first. Reuse the authorized API key through `OPENAI_API_KEY`; do not write it into this folder. Use a separate output directory to retain these original results. Example from repository root:

```powershell
$env:AUDIT_INPUT = Join-Path (Get-Location) 'artifacts/luna-stage5-oct9-model-comparison/cohort.json'
$env:AUDIT_OUTPUT = Join-Path (Get-Location) 'artifacts/stage5-new-replay/results'
node functions/scripts/stage5-model-audit.mjs powerskate-20 luna-none 1
```

Arms: `nano-medium`, `luna-none`, `luna-low`, `luna-medium`. Other case IDs are in `cohort.json`. Run each arm as a separate process because reasoning is configured through an environment variable. The harness blocks network requests other than the OpenAI Responses endpoint and invokes no live writer.

## Focused request/regression tests

From `functions`, after building:

```powershell
$formatterTests = @(Get-ChildItem -Path 'lib/parsing/finalFormatter.*.test.js' | ForEach-Object FullName)
node --test @formatterTests scripts/stage5-reasoning.test.mjs
```
