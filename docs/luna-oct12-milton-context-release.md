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

Pending fresh no-active-parser preflight, narrow deploy dry run and deployment,
then independent source-hash/revision/traffic/environment readback.

Commands from `functions/`, project `gathr-migrated`, codebase `gathr-functions`:

```powershell
node artifacts/luna-oct12-milton/release-gates.cjs before
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
node artifacts/luna-oct12-milton/release-gates.cjs after
```

Live restoration is separate from code release and has already been verified
against Firestore and the public detail/upcoming API feed. No media was deleted.
