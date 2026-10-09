# Caption-only Luna routing — October 9, 2026

Craig approved testing recent text-only posts and moving them to Luna if source-grounded checks passed. This adds caption-only sources to the accepted 100% Stage 1 and Stage 3 Luna rollout. Release checkout: `codex/luna-parser-live-merge` in `C:\Users\craig\.codex\worktrees\luna-pilot-release\gathr-apps-script`. Parser commit: `318326c`; accepted preceding baseline: `69e4f48`, including October 9 hardening `609cedf`.

## Routing and boundaries

- New opt-in environment flag: `LUNA_TEXT_ONLY_ENABLED=true` on the three parser functions. Stage 1 and Stage 3 percentages remain 100%; Luna effort remains high.
- Caption-only means no original post media and no shared-post thumbnails. Profile pictures and venue fallback media are not source evidence. Failed, expired, partially prepared or oversized source galleries do not silently become text-only posts; existing image checks remain.
- Stage 1 allocation counters now include caption-only evaluations. Stage 3 eligibility includes caption-only sources passing Stages 1–2, alongside usable image galleries. Source identity selection remains stable across resumes and retries.
- Stage 2 remains GPT-5 mini; Stages 4 and 5 remain GPT-5 nano, low/medium. No GPT-5.2 legacy fallback is enabled. The existing image-ineligible route is preserved for unavailable or invalid image inputs; it is not the caption-only route.
- Snapshots/logs record `inputKind: text_only` for Stage 1 and `stage3InputKind: text_only` for Stage 3. Existing Luna integrity checks and bounded downstream batches remain in effect.

## Evidence

Collected 36 non-dry-run text-only snapshots from the completed regular October 5–9 datasets. These represent 30 distinct source-ID/caption/timestamp cases, not 36 independent posts. Original captions and stored prior outputs were reviewed. Local replays do not invoke the Firestore event writer. Current website, ticket-page and calendar-link enrichment was disabled so the comparison stayed grounded in the captured caption; venue-hours matching was not supplied.

- Standalone Stage 1: 36 completed Luna high responses, 23 accepted and 13 rejected after local gates. No confirmed useful rejection remained after clarification. One brief `#farmdays ... Having a lot of fun and activities` caption remains ambiguous without a schedule or clear invitation; do not claim perfect recall from this sample.
- Full five-stage replay: all 30 cases completed. Five affected cases were replayed again after focused repairs. The merged reviewed results produced 40 formatted items from 17 posts; 13 posts were rejected or held. Actual usage confirms Luna in Stages 1/3, Mini in Stage 2, Nano in Stages 4/5.
- Five API boundary controls passed: ordinary restaurant reservations, generic salon booking and product pickup rejected; public museum booking and a dated public clinic accepted.
- An additional no-quota replay exercised the selected-row text routing with the clinic and recreation booking slot.
- TypeScript build passed; 573 backend tests and 40 Stage 1 evaluation tests passed on the final code. The new tests cover opt-in/stable selection, attachment failures, unchanged image prompts, public booking rules and protection of a timed single-date caption from theme remapping.
- Sanitized case ledger: `artifacts/luna-text-only-oct9/evaluation-summary.json`. Raw source/replay data and private function readbacks remain outside the repository at `C:\Users\craig\.codex\luna-textonly-20261009`.

## Focused repairs and observed outcomes

| Source | Initial problem | Final replay |
| --- | --- | --- |
| Eastern Kings, Oct 9 row 223 | Stage 1/3 sometimes omitted an explicitly bookable recreation slot because no sport was repeated | Bookable Time Slot, October 11 at 13:50; no sport or end time invented by Stage 3 |
| Seaside, Oct 9 row 214 | Short clinic wording treated as routine appointment availability | Rxtra Care Clinic, October 8, 11:00–16:00; apple stock arrival excluded |
| North Rustico, Oct 8 rows 262/263 | Umbrella date remapping replaced the performer title and turned trivia into a special | Jacob Hemphill Duo with Em Peters, October 10 at 20:00; Trivia Night, October 9 at 19:30, event/category preserved |
| Montague, Oct 9 row 285 | Only printed time was registration; Stage 3 left the start blank and Stage 4 held it | Poker registration/check-in, October 8 at 18:30; description identifies what that time means |

The text-only Stage 1 clarification and Stage 3 access rule are excluded from image-bearing prompts. Theme-remapping protection applies only to a caption-only timed item with exactly one matching explicit date; multi-date themes and the accepted image behavior remain available.

Other reviewed results: Albert & Crown retains all four Wednesday specials and three Thursday/Friday/Saturday performances with their own times; APM retains all four printed ice slots; Ruby retains explicit roast-dinner 15:00–18:00; Farmers Bank retains ten weekday access dates through October 16. Closures, bus delays, job advertisements, birthday greetings and stock notices produced no final listings. The existing local calendar override still passes Ruby's closure at Stage 1; Stage 3 correctly returns no items. That is not evidence that Luna's raw response approved the closure.

## Remaining limits

Existing hours/category end-time defaults still run downstream and can supply an end when Stage 3 leaves it blank. Examples include the bookable slot ending at 23:00 and a concert ending at 01:00. Those are inherited downstream defaults, not source-printed times or a newly solved issue. Missing venue-hours inputs also explain replay differences in special start times. Curling registration without a schedule and an ice-season opening without a time remain held with external enrichment disabled. This evaluation does not authorize live event changes or claim every historical baseline item was correct.

## Deployment

Preflight at 18:24:18 UTC found no running parser locks. Fresh readback confirmed all three functions ACTIVE on the accepted common source hash `013c7457d17b150aa10da3d42d1c2e6219bdd9b7` with latest-revision traffic and the existing model settings.

Deploy only these functions in project `gathr-migrated`, codebase `gathr-functions`:

```powershell
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run --non-interactive
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
```

Release readback and exact revisions will be recorded after successful deployment. Full environment comparison must show only the new text-only flag, preserving the previous model and worker settings. The pre-existing outdated `firebase-functions` warning is outside this release.

Rollback for text-only routing: set `LUNA_TEXT_ONLY_ENABLED=false` on all three functions through the same release gates. Preserve the accepted 100% image routing and prior parser repairs.

## Follow-up

Reuse the existing October 10–11 heartbeat starting at 11 a.m. Halifax, with no checks today or overnight. Both daily audits must reconcile text/image allocation counters against actual calls, review rejections and final writes, and inspect these caption-only cases alongside all prior quality and resume checks. Pause after both daily audits. No live record mutations or map interactions are part of this release.
