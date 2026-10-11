# October 11 parser integrity repair

## Scope and baseline

Craig accepted the October 11 audit recommendations and authorized code fixes. Implementation is isolated on `codex/luna-oct11-integrity-repair`, starting from exact serving commit `27bf96e` and hash `e9088ec76a2c08f342bad92b9a7d40d1d7623e9a`. It excludes the coordination checkout's deferred Stage 4 model experiment and guard.

Stages 1/3 remain Luna high, Stage 2 Luna none with high negative review, Stage 4 Nano low, and Stage 5 Luna none. Allocation, reasoning, caching requests, worker fencing and unavailable-source holds are unchanged. The Stage 4 duplicate instruction now explicitly distinguishes recurrence weekdays.

## Mechanisms repaired

1. **Community Cup session identity:** known development-session clocks and explicit U-age groups must agree across normal, exact-ID and recurring-family matching. A defensive merge guard prevents updates even if a caller bypasses a selector.
2. **Occurrence versus series:** a different source's one-off mention cannot clear an established recurring lifecycle. A recurrence source ID records which post established that lifecycle, so an older calendar reparse cannot erase a series added by a newer post. Same-source corrections and independently verified current dated meal-window replacement remain supported.
3. **End evidence and chronology:** implied/semantic/none flags are not explicit evidence. Unknown legacy ends survive new defaults; equal-strength defaults cannot move a stable end arbitrarily. A replacement overnight end updates the date and clock together on the keeper's occurrence anchor.
4. **Category semantics:** civic meetings, literary conversations and food-donation drives remain activities. A generic `live` keyword no longer means music. Canonical categories are already case-insensitive; the audit's earlier casing explanation was incorrect. Weak canonical categories no longer increment unknown-label accounting.
5. **Closure filtering:** a source-matched, separately timed meal survives a closure notice on another day. Ordinary dishes mentioned in a closure-only post remain rejected.
6. **Weekly siblings:** a shared placeholder anchor is adjusted only with corroborating weekly sibling patterns and explicit “every/each weekday” evidence. An explicit month/day description is not moved. Distinct weekly siblings are protected against an erroneous duplicate rejection.
7. **Public markets:** dated, timed vendor/farmers/craft/flea markets survive the operating-hours filter; plain market-store hours remain rejected.

## Validation

Captured source fixture: `functions/src/processing/__fixtures__/oct11-integrity-repair.json`, from completed dataset `1w9joG-FJhXFTLKes7T4836iykHoPMZYU`. It includes eight source rows and four before/incoming/after write audits.

The final complete backend run passed 604/604 tests, including the recurrence-source ownership regression. All 72 Stage 2/4/5 request/selection checks passed. The healthy current “Two Can Dine” family-replacement control exposed an overly broad first draft and passed after narrowing the recurrence guard.

Seven actual Stage 4/5 API dry runs used Nano low and Luna none: 14/14 HTTP 200 completed responses, zero Stage 5 reasoning tokens, no errors, no live writes. Inputs: 19 occurrences. Outputs: 13 records representing the same 19 occurrences, because nine camp dates are represented by three bounded weekly parents.

| Row | Source | Stage 4 | Final records | Verified result |
| --- | --- | ---: | ---: | --- |
| 66 | Local Pub brunch | 2 | 2 | Saturday Oct 10 and Sunday Oct 11, 10:00–14:00 |
| 120 | Tipsy buffet | 1 | 1 | Oct 11 16:30–18:30 survives Monday closure |
| 234 | Community Cup | 9 | 3 | U9 16:20, U11 17:30, U13 18:40; 3 Tuesdays each, through Oct 27 |
| 277 | Emily St John Mandel | 1 | 1 | Literary activity, Oct 22 19:00; ticket URL preserved; no printed end invented by Stage 5 |
| 313 | Stratford council | 1 | 1 | Civic activity, Oct 14 16:30; no printed end invented by Stage 5 |
| 315 | Stratford food drive | 1 | 1 | Community activity, Oct 17 09:00–14:00; spatial review remains required |
| 332 | Island Hill Farm | 4 | 4 | Two farm visits plus two vendor-market sessions |

These are frozen-source downstream replays, not another whole-run audit or timing guarantee. Stage 5.5 may still apply the existing marked end-time defaults; this release does not remove that policy. The merge preserves stronger existing ends.

Evidence: `functions/artifacts/luna-oct11-integrity-repair/` (tests, API raw responses/usage, serving readbacks, preflight, exact data plan and backup).

## Live records

Code deployment does not repair existing documents. The event-integrity skill requires approval of the exact saved data plan before applying it. The default invocation of `functions/scripts/oct11-integrity-live-repair.cjs` only reads and backs up data.

The plan repairs seven existing documents and creates one U9 parent. No deletes. It restores Baba's weekly lifecycle; identifies the existing U11/U13 slots; restores the author's prior 21:00 end on Oct 22; removes council's unsupported 01:00 end; and corrects only the held food-drive category. The author's restored 21:00 end is prior data, not newly confirmed by the source. Council and U9 have no printed end, so their repair supplies none.

Existing buffet, Sunday brunch and Sunday market records already cover the surviving offers. They must not be duplicated. The food drive stays held for separate location occurrences. Another pre-existing author duplicate and the NHL typo duplicate remain in the deferred broad deduplication work.

Application uses fresh native update-time and full-document fingerprint guards, an atomic transaction, a second U9-slot check, prewrite backup and postwrite field checks. Afterwards verify the app detail API and paginated feed, including unchanged healthy controls.

## Release

Deployed parser repair `4b8b00c`, with packaging exclusion `49193d1`, from this isolated release branch. Local `artifacts/` is excluded from function uploads. The narrow final dry run and actual deployment succeeded in project `gathr-migrated`, codebase `gathr-functions`, using:

```powershell
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run --non-interactive
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
```

Fresh preflight at 15:11 UTC found no active processing locks, the processed marker present, completed final batch and no checkpoint. Independent function and Cloud Run readback at 15:15:31 UTC verified:

| Function | Serving revision | State | Traffic |
| --- | --- | --- | ---: |
| processDataset | processdataset-00467-noz | ACTIVE | 100% |
| processDatasetResume | processdatasetresume-00431-mas | ACTIVE | 100% |
| processDatasetSelectedRows | processdatasetselectedrows-00423-daj | ACTIVE | 100% |

Common serving source hash: `551a5ee79e21b5d374c455c220417ad046659b00`. Every Luna allocation, model and reasoning key matched the pre-release readback. Build, 604 backend tests, 72 request checks and seven actual downstream API replays passed. The existing outdated `firebase-functions` warning remains; no dependency upgrade was included.

The October 11 audit heartbeat is confirmed PAUSED. Existing live record corrections remain pending exact approval of `docs/luna-oct11-live-repair-plan.md`; no live event mutations were applied during this release. Use this release branch as the accepted baseline for further parser work; the coordinator checkout still contains a deferred Stage 4 experiment that is not serving.
