# October 11 Stage 5 cache and safeguard release

## Authorization and scope

Craig approved fixing the findings from the full Stage 5 cache validation and then deploying. Starting checkout: `f96500e`, branch `codex/luna-oct11-integrity-repair`, worktree `luna-accounting-release`. Fresh readback found all three parsers ACTIVE on accepted Stage 1 cache source hash `c6f04a6761d3129fc2b0399f3a77d84ad9a9afd7`, all traffic on latest revisions. This release changes only Stage 5 runtime behavior; model allocation/effort, prompts for Stages 1–4, output limits, batch sizes, worker fencing and source holds are preserved. No live event repair is part of this deployment.

## Changes

- `stage5PromptCache.ts` constructs the exact static/dynamic text split tested in the full comparison. Luna Responses requests use an explicit static breakpoint and 30-minute TTL. Rules, indexed source items, schema and roles are preserved. Other models and unknown/malformed prompt shapes retain their original request construction.
- `preserveValidatedOccurrence` repairs a blank or same-day closing date when the validated source explicitly supplies both clocks and the closing clock is earlier. It handles calendar rollovers without inferring a duration. Existing later end dates and explicit source multi-day spans are preserved; recurrence bounds remain separate.
- Public medical/pharmacy care clinics and produce weigh-offs use Gatherings & Parties, retain event flags, and do not become educational classes or sports contests. Sports clinics, medical education and actual squash matches remain controls. Rules use activity evidence rather than source IDs or venue-specific exceptions.

## Verification

- TypeScript build passed. **615/615 backend tests**, including eight new cache/safeguard tests; **8/8 Stage 5 model/reasoning request tests** passed.
- Full saved-response playback: **43 paired posts, 98 builder checks, 119 represented occurrences per arm**, zero API calls. Each original request matches the preceding paid comparison's hash; the production cache builder matches the independent experiment transformation. Source fields and recurrence multiplicity match earlier outputs except the reviewed date/category corrections. All supplied links, prices, explicit image indices and venues survive.
- Fresh API controls under both layouts: rows 22, 48, 212, 229, 234 and 285. **Six paired posts, 20 actual calls, 47 final records representing 53 supplied occurrences per arm**, with zero malformed/incomplete responses, identity failures or additional retries. Source dates/clocks, links/prices, supplied image indices and venues pass the retained checks. Both overnight cases close October 11 at 02:00; both category cases are Gatherings & Parties with event flags. Zero reasoning tokens. Estimated combined control cost: **USD 0.01644701**.
- The initial local playback stopped because the earlier offline stub did not capture every real nine-item batch. The release checker now reconstructs each actual source batch and verifies its original hash against the paid cohort before using it. The complete repeated playback passes. That failed local check made no API calls and caused no deployment.
- Final read-only release preflight at 2026-10-11T17:05:54.767Z: no active parser locks, today's processed marker present, final batch completed and no checkpoint. A fresh independent function/traffic readback immediately before deployment again found the expected common baseline hash and latest traffic.

The preceding full comparison found 29.8% lower estimated cost on 28 previously untested posts, with essentially unchanged summed call time. That remains experiment evidence, not a guaranteed whole-run speed/cost result. Cache accounting remains unchanged and distinguishes explicit writes/zeros from missing historical usage.

## Release status

The exact narrow dry run succeeded for `functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows`, project `gathr-migrated`. Its first attempt hit Firebase's 10-second local source-discovery limit. Retrying with the established `FUNCTIONS_DISCOVERY_TIMEOUT=60` passed. The existing outdated `firebase-functions` SDK warning was retained; no dependency update was bundled.

Released source commit: **`6c8b430`**. Both commands ran from the isolated worktree's `functions/` directory:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
```

Actual deployment succeeded for exactly those three functions. Independent Firebase function and Cloud Run traffic readback at **2026-10-11T17:12:22.213Z** verified all ACTIVE at common source hash **`3a97d4348ad1907befbedd9adf45878f577ad426`**:

| Function | Serving revision | Latest traffic |
| --- | --- | ---: |
| processDataset | processdataset-00469-faf | 100% |
| processDatasetResume | processdatasetresume-00433-mos | 100% |
| processDatasetSelectedRows | processdatasetselectedrows-00425-bop | 100% |

The independent checker compared each function's model, reasoning, allocation and Luna flags to its fresh pre-deploy record and found no changes. Stage 5 remains Luna none at 100%. Stages 1–4 retain their accepted settings. The deployed request builder and safeguards passed the retained local/API checks; a subsequent regular production parse is still needed to measure live cache savings. No historical event documents were rewritten.

Evidence under ignored `functions/artifacts/luna-stage5-cache-release/`: `serving-before.json`, `serving-after.json`, `preflight.json`, `dryrun.log`, `dryrun-60s.log`, `deploy.log`, `playback-verified-results.jsonl`, `playback-verified-summary.json`, `api-results.jsonl`, `api-summary.json`. Build/test logs are in the parent `functions/artifacts/` directory. Raw historical comparison evidence and limitations remain in [the full validation](luna-stage5-oct11-cache-full-validation.md).
