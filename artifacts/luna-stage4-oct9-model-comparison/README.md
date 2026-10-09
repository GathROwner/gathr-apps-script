# Frozen Stage 4 model comparison

See `../../docs/luna-stage4-oct9-model-comparison.md` for findings and limitations.

- `cohort.json`: 21 frozen cases, original expected labels and provenance.
- `adjudications.json`: independent label correction without changing captured cohort hashes.
- `results/`: 100 runs, 108 Responses calls, raw text/parsed output, final guarded output, actual usage and request hashes. No credentials or images.
- `summary.json`: per-arm metrics, paired hashes and individual raw/final checks.
- `logs/`: proof of the existing prose override reversing correct rejections.
- `tests.log`: 26 focused tests; build also passed before the API experiment.

## Reproduce

From the accepted worktree, build `functions` with `npm run build`. From `functions` in PowerShell, enumerate the existing validator tests and run them with the request tests:

```powershell
$validatorTests = @(Get-ChildItem lib/parsing/secondaryValidator.*.test.js | Select-Object -ExpandProperty FullName)
node --test @validatorTests scripts/stage4-reasoning.test.mjs
```

Set `OPENAI_API_KEY` using an existing authorized secret without printing it. Set `AUDIT_INPUT` to this folder's absolute `cohort.json` path and `AUDIT_OUTPUT` to a fresh private results directory. Run from the repository root:

```powershell
node functions/scripts/stage4-model-audit.mjs pool-15 nano-low 1
node functions/scripts/stage4-model-audit.mjs pool-15 luna-none 1
node functions/scripts/stage4-model-audit.mjs pool-15 luna-low 1
node functions/scripts/stage4-model-audit.mjs pool-15 luna-medium 1
```

Run each of the 21 case IDs with those four arms. Repeat `powerskate-20`, `mixed-menu-and-activities`, `market-and-unscheduled-classes` and `marathon-untimed` with final argument `2`. Requests incur API cost. The harness blocks other fetch endpoints and invokes only Stage 4; it does not call the writer or cloud queue. Actual times vary.

For offline reanalysis, set `AUDIT_DIRECTORY` to this artifact folder and run `node functions/scripts/stage4-model-audit-report.cjs` from the repository root. It requires frozen input hashes and paired prompts to match and overwrites `summary.json`. Raw positional field checks are not interpreted when response count differs.
