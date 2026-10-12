# Milton calendar context guard — October 12, 2026

Craig approved restoring the reviewed October 14 knitting social and updating
the strict meridiem hold to accept corroborated calendar context. Exact source
and live repair evidence: `luna-oct12-milton-hold-review.md`.

## Scope and verification

- Resolve only an explicitly ambiguous range uniquely bracketed by printed
  clocks in the same chronological calendar day/image; keep implied flags.
- Preserve the resolved date/range through final formatting.
- Preserve isolated ambiguity holds, explicit clocks, recurrence, model settings,
  allocations and cache/request baselines.
- Build passed; 30/30 focused and 631/631 compiled backend tests passed.
- Captured October 12 playback changed only the corroborated Milton interval.
- Actual API replay: all three Wednesday activities survive Nano low Stage 4
  and Luna none Stage 5; knitting remains 13:30–15:30, October 14. Two completed
  calls, no retries or fallback. Transport/usage evidence in
  `functions/artifacts/luna-oct12-milton/api-replay.json`.

## Release

Source commit: `18e6aa2` on `codex/luna-oct11-integrity-repair`.

Fresh preflight at 17:09:40 UTC proved October 12 processed, final batch
completed, no checkpoint and no active processing lock. Before-release readback
verified all three functions ACTIVE on `f67316274c8329b66bd307152e012f7d20d1bc02`
with latest 100% traffic at `processdataset-00472-ziq`,
`processdatasetresume-00436-yeb` and `processdatasetselectedrows-00428-wiv`.
Narrow deploy dry run and actual deployment passed. Independent final readback
verified all three functions ACTIVE on common source hash
`539278f36f5a501c465f2fe1489f6eda34e8f617`, each with 100% traffic on its latest
revision and exactly unchanged model/effort/allocation environment values:

| Function | Serving revision |
| --- | --- |
| processDataset | `processdataset-00473-kib` |
| processDatasetResume | `processdatasetresume-00437-cuw` |
| processDatasetSelectedRows | `processdatasetselectedrows-00429-rim` |

Post-deploy Firestore preflight at 17:14:44 UTC again confirmed no active parser,
processed marker present, final batch completed and no checkpoint. Evidence is
under `functions/artifacts/luna-oct12-milton/`: `deploy-dry-run.txt`, `deploy.txt`,
`serving-before.json`, `serving-after.json` and `preflight-after.json`.

Rollback reference: preceding source commit `34c7755` and the three baseline
revisions above. A rollback requires the usual current-run and release gates;
it would not undo the separately approved live restoration.

Firebase reported the existing outdated `firebase-functions` dependency warning.
No SDK upgrade is included in this source-timing repair.

Commands from `functions/`, project `gathr-migrated`, codebase `gathr-functions`:

```powershell
node artifacts/luna-oct12-milton/release-gates.cjs before
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
node artifacts/luna-oct12-milton/release-gates.cjs after
```

Live restoration is separate from code release and has already been verified
against Firestore and the public detail/upcoming API feed. No media was deleted.
