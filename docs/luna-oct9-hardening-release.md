# October 9 focused hardening release

Baseline: `2eb6fcb` / parser `977a72a`, source hash `76ac783b8f752d5d211c247972e3012840fb8eba`, branch `codex/luna-parser-live-merge`, isolated release checkout `C:\Users\craig\.codex\worktrees\luna-pilot-release\gathr-apps-script`.

Scope: the source-backed fixes in [the production audit](luna-oct9-production-audit.md). Stage 1 stays 50%, Stage 3 stays 100% eligible image posts. Models, reasoning effort, resume fencing, batching and map behavior remain as before.

## Validation completed before release

- TypeScript build successful.
- Fresh compiled suite: **567 passed, zero failed**.
- Stage 1 evaluation suite: **40 passed, zero failed**.
- Final original-source API replay results are saved in `artifacts/luna-oct9-production-audit/replay-results.json`, with the corresponding full replay evidence. No upload or live writer was called.

| Row | Final result | Runtime |
| --- | --- | --- |
| 335 bread deal | One qualifying $1.49 bread offer; ordinary products excluded; Friday 09:00–17:00 | 85.869 s |
| 198 public pool | 13 items: prior five plus all eight caption access windows; Fun Swim 12:00–16:00 | 192.460 s |
| 287 weekend market | October 10 and 11, each 10:00–16:00; no Thursday fallback | 106.252 s |
| 51 registration deadline | No false deadline listing; races without source times remain held | 125.418 s |
| 175 ship calls | No logistics listings | 16.563 s |
| 274 public tours | October 10 and 11, each 10:00–17:00 | 109.489 s |

These results come from the last relevant successful replay for each case. Earlier runs exposed the title-suffix, tour-hours and between/and resolver bugs and are not represented as successful tests. The final ISO-date parser addition was tested offline; none of these six source captions use an ISO header.

No running Firestore processing lock was present at 16:54:47 UTC. Recheck immediately before live deployment. Firebase's exact three-function dry run passed; it reported an outdated `firebase-functions` package warning. Dependency upgrades are deliberately separate from this parser release.

## Deployment gate

Run from this checkout's `functions` directory:

```powershell
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run --non-interactive
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
```

After success, record parser commit, all three revisions, common source hash, ACTIVE state, traffic and exact environment readback below. Parser prevention does not repair existing event records; their guarded cleanup requires approval of the new exact targets.

## Rollout decision

Continue Stage 1 at 50% and Stage 3 at 100%. Do not expand Stage 1 based only on this first live pilot. Record the completed audit, pause its existing heartbeat, and retain the identified downstream timing/source-enrichment work as explicit follow-up.
