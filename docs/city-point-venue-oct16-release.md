# October 16 named venue and show/doors safeguards

Status: all three parsers and the finalizer released and independently verified ACTIVE with100% latest traffic. Historical data repair is prepared but not applied.

## Reviewed release

- Parser commit: `8e366b33e217bca3e36b29e8b3d19abfacd4172e`, isolated `8101` worktree, based on serving `bbea8ac`.
- Finalizer commit: `b4bc732e41ad9e322bc8bc7959f14b6d7c7c6257`, isolated `city-point-finalizer` worktree, based on its separately verified serving `98c5eab`.
- Only processDataset, processDatasetResume, processDatasetSelectedRows and finalizeCityLevelEventReviewTrigger are authorized deployment targets, each from its appropriate assembly.
- Root independently reviewed the implementation, original source responses, offline playback, baseline preservation, clean commits and qualified dry-run results before dispatch.

The structured Facebook shortcut now checks explicit venue/address and original poster evidence before treating a location as city-wide. Exact venue identity wins over city context; unresolved identity and genuine clock conflicts hold. Postal abbreviations and repeated numbered addresses no longer create false multiple locations. Different venues, addresses, rooms, cities and routes retain their separation.

The actual activity/performance start belongs in the app time row. Doors opening belongs in the description. Ireland's reviewed show is 19:30–22:00 with doors at18:30; its distinct structured19:00 start remains a conflict. Doors-only evidence never invents a show start. Retired venue redirects and human decisions remain protected.

## Validation

- Parser: build,91 focused and893 full compiled tests passed, including the actual shortcut/resolver/publication path and stale-worker zero-write control.
- Finalizer: build,48 focused and332 full compiled tests passed.
- Both codebase-qualified narrow Firebase dry runs completed.
- Four paid original-image validation calls completed with zero errors/retries:12,909 input and2,152 output tokens, including1,816 reasoning tokens. All temporary analysis uploads were removed.
- Offline playback reused saved responses/inventory with zero additional paid calls and zero live writes. Beaconsfield's structured metadata in the paid control was explicitly synthetic; the original source was an ordinary page post.
- All five global stage modules, existing stage models/efforts, prompt caching and compact contracts remain unchanged. Separate assemblies preserve71 parser and57 finalizer user environment values and existing secret bindings.
- Root fresh predeployment readback confirmed all four expected ACTIVE baselines and identical parser environment values. Root lock check at17:54:31UTC found zero active parser locks; executor performs a second fresh check at dispatch.

Private evidence is in the parser task's `functions/artifacts/city-point-hardening-oct16/`, the finalizer assembly's `functions/artifacts/city-point-finalizer-oct16/`, and coordinator `functions/artifacts/city-point-audit-oct16/`. Tests and deployment do not constitute a production parse replay.

## Historical data repair remains separate

The exact37-document plan is [city-point-venue-oct16-repair-approval-plan.md](city-point-venue-oct16-repair-approval-plan.md). It removes12 duplicate copies, updates11 retained events and13 reviews, and advances one feed marker. All12 Beaconsfield dates remain; Ireland retains its verified venue/show clock/poster and doors description. No venue/media deletion, new date, family-label change or replay is included. Exact batch approval is pending. No live event/review repair has occurred.

Existing outdated firebase-functions warning remains; no dependency upgrade is included.

## Independent serving verification

The three parsers are ACTIVE at common source hash `35bb203d979f3aaa914acb6abac2d9bd85b72712`:

| Function | Latest revision | Verified latest traffic |
| --- | --- | --- |
| processDataset | `processdataset-00494-cij` |100% |
| processDatasetResume | `processdatasetresume-00458-hic` |100% |
| processDatasetSelectedRows | `processdatasetselectedrows-00450-ruz` |100% |

Root independently fetched each function and Cloud Run service after deployment. Latest-ready revisions agree, all71 user environment values equal the root's fresh predeployment readback, and all secret bindings are unchanged. Evidence: coordinator `functions/artifacts/city-point-audit-oct16/root-parser-release-verified.json` and corresponding root pre/post snapshots. No active parse was stopped, replayed or recovered.

The separately assembled finalizer is ACTIVE at `finalizecityleveleventreviewtrigger-00078-pey`, source hash `7b08128c3da8555b5c70a1526280166503092f23`,100% latest traffic. Root independently fetched its function and Cloud Run service and verified all57 user environment values and every secret binding against its fresh predeployment baseline. Evidence: `functions/artifacts/city-point-audit-oct16/root-finalizer-release-verified.json`. Executor's postdeployment lock check at18:09:02UTC still found zero active parser locks.

Exact executed release commands (project `gathr-migrated`, codebase `gathr-functions`), after their successful dry runs:

```text
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
firebase deploy --only "functions:gathr-functions:finalizeCityLevelEventReviewTrigger" --project gathr-migrated --non-interactive
```

Each command ran from its respective assembly's functions directory. No other functions or live event/review documents were modified. This release has not yet been exercised by a subsequent production full parse.
