# Luna Stage 3 live canary — October 3, 2026

## Release state

- Project/codebase: `gathr-migrated` / `gathr-functions`.
- Source: `codex/luna-parser-live-merge` at `031119f` for the parser code.
- Deployed functions: `processDataset` (northamerica-northeast2), `processDatasetResume` and `processDatasetSelectedRows` (northamerica-northeast1).
- Serving revisions after Stage 5 hardening: `processdataset-00436-gev`, `processdatasetresume-00400-wiq`, `processdatasetselectedrows-00392-qub`; each received 100% traffic immediately after deployment.
- Initial canary revisions before Stage 5 hardening: `processdataset-00435-bog`, `processdatasetresume-00399-haz`, `processdatasetselectedrows-00391-goq`.
- Before deployment: `processdataset-00434-giw`, `processdatasetresume-00398-nam`, `processdatasetselectedrows-00390-rsz`.
- No active/processing/paused `processing_locks` were found immediately before deployment.
- `npm run build`, 14 focused tests, a full 42-item dry run, and the narrow Firebase dry run passed. Firebase warned that `firebase-functions` is outdated; both narrow deploys completed successfully.

## Routing

`LUNA_CANARY_ENABLED=true`, `LUNA_CANARY_SAMPLE_PERCENT=17`, `LUNA_CANARY_STAGE3_ONLY=true`, `LUNA_CANARY_STAGE3_REASONING_EFFORT=high`, and `LUNA_CANARY_LEGACY_FALLBACK_ENABLED=false`. The reviewed Downtown Charlottetown post `1551794836988048` is excluded. The SHA-256 post ID sample is stable and capped by code at 20%; at the recent 175 raw / 152 eligible row size, 17% should yield roughly 20–30 parser attempts, but the exact count depends on the next dataset. Posts outside the sample retain the existing route. The canary keeps GPT-5 mini for Stages 1–2 and GPT-5 nano for Stages 4–5. Luna high substitutes for GPT-5.2 at Stage 3 and its OCR debug read; no GPT-5.2 retry runs for selected posts.

`functions/.env.pre-luna-canary-20261003` is an ignored local copy of the prior environment file and contains credentials. Do not publish it. The other 56 existing environment variables matched the deployed `processDataset` values before the six canary values were appended.

## Known hold and acceptance

The October 2 dry-run comparison covered 87 comparable posts: 182 saved listings versus 188 Stage 3 substitution listings, with 37 versus 36 positive posts. These totals are not a recall score. A repeat of the dense Downtown Charlottetown caption found seven Stage 4 title/date/time slots missing after the unchanged single-call nano Stage 5, offset by seven extra/repeated slots. This post remains excluded from the first production sample. Do not expand the switch from this count comparison alone.

Before the next large parse, Stage 5 was hardened **only for Luna-selected posts**: inventories larger than nine are formatted in nine-item GPT-5 nano batches, then recombined before global recurrence handling. A source-identity check holds a canary if formatted calendar/schedule titles, dates, or unambiguous start times drift from Stage 4. Minor spelling differences of up to two edits in longer names do not trigger the structural guard. A nine-item nano diagnostic preserved all nine source slots. The full Downtown dry run then preserved all 42 Stage 4 title/date/time slots with zero missing or extra slots; the previous single-call run had seven missing and seven extra. Stage 5 used 20,882 input and 28,086 output tokens across five nano calls versus 11,685 and 21,203 in one call; Stage 5 time was about 200 seconds versus 137 seconds. The full dry run took about 427 seconds, under the 540-second function timeout. Artifacts are in `artifacts/luna-oct2-cohort/stage3-swap-downtown-chunked/`. The source itself still has separate extraction questions, including an apparent 2 a.m. tour time, so this result proves Stage 5 preservation, not complete post accuracy.

After the next completed regular parse, identify every selected post from the stable hash and the parser logs/snapshots. Review original captions and ordered source galleries for every positive or failed canary. Compare source-grounded title/date/time/venue inventory, duplicates, image provenance, held posts, and per-stage usage. A material wrong date, missed listing, duplicate, gallery attribution error, or bad write stops the canary pending repair. One-off wording differences can be recorded without blocking the whole trial.

## Rollback

Fast traffic rollback, if a run is affected:

```powershell
gcloud run services update-traffic processdataset --region=northamerica-northeast2 --project=gathr-migrated --to-revisions=processdataset-00434-giw=100
gcloud run services update-traffic processdatasetresume --region=northamerica-northeast1 --project=gathr-migrated --to-revisions=processdatasetresume-00398-nam=100
gcloud run services update-traffic processdatasetselectedrows --region=northamerica-northeast1 --project=gathr-migrated --to-revisions=processdatasetselectedrows-00390-rsz=100
```

For a durable code/config rollback, restore the ignored pre-canary `.env` copy (or set `LUNA_CANARY_ENABLED=false`), then run the same three-function narrow Firebase dry run and deployment. Confirm new serving revisions and env values afterwards. Do not revert unrelated dirty files in this worktree.

If only the new Stage 5 batching needs to be withdrawn while retaining the initial canary, route the three services to `processdataset-00435-bog`, `processdatasetresume-00399-haz`, and `processdatasetselectedrows-00391-goq` respectively. The original pre-canary revisions above disable the entire Luna rollout.
