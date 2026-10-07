# October 7 Luna Stage 3 full eligible rollout

Craig authorized promotion to 100% if the October 7 full-run audit found only minor Luna issues. The full regular dataset and selected-source review are recorded in `docs/luna-stage3-oct7-75pct-production-audit.md`. The observed errors were repaired in parser commit `7f0fdab`; unresolved online venue and untimed-special holds remain downstream, with no fabricated live replacement.

Preflight: no active or processing Firestore locks at 17:33:56 UTC. `npm run build` passed. The complete compiled backend suite passed 540/540 tests. The codebase-qualified three-function Firebase dry run succeeded, followed by a narrow production deploy to `gathr-migrated` / `gathr-functions`.

Production readback found all three functions ACTIVE on source hash `e3016b715a4d88487232e7ed8578636cccfd6111`, each serving 100% traffic:

- `processDataset`: `processdataset-00455-hem` in `northamerica-northeast2`.
- `processDatasetResume`: `processdatasetresume-00419-pir` in `northamerica-northeast1`.
- `processDatasetSelectedRows`: `processdatasetselectedrows-00411-qog` in `northamerica-northeast1`.

All three have `LUNA_CANARY_ENABLED=true`, `LUNA_CANARY_STAGE3_ONLY=true`, `LUNA_CANARY_STAGE3_REASONING_EFFORT=high`, `LUNA_CANARY_SAMPLE_PERCENT=100`, an empty `LUNA_CANARY_EXCLUDED_POST_IDS`, and `LUNA_CANARY_LEGACY_FALLBACK_ENABLED=false`. Stages 1–2 remain GPT-5 mini and Stages 4–5 GPT-5 nano. `STAGE3_MODEL_OVERRIDE=gpt-5.2` remains as the route for text-only or other ineligible posts; 100% here means all eligible image posts passing Stage 2, not every scraped row.

Craig approved the exact eight false event IDs listed in the October 7 audit. The guarded deletion used `functions/artifacts/luna-oct7-full-audit/live-cleanup-manifest-2026-10-07T17-20-01-983Z.json`; all eight were absent on Firestore readback and returned HTTP 404 from app detail endpoints. The paginated app feed (`includeExpired=false`, eight pages for October 7–18) contained none of them, while the correct Eastern Kings October 18 ice slot `BTl9t3Rd8KSEdrn4y8ND` remained in the feed and returned HTTP 200. An `includeExpired=true` October 6–18 feed check also found only that keeper among the nine checked IDs. Source and venue media were untouched.

The next regular full parse will provide production proof for the all-eligible setting. The existing audit heartbeat was updated to begin no earlier than 11 a.m. Halifax time and inspect that next completed full dataset, with no map interaction.

Firebase reported the repository's existing outdated `firebase-functions` package warning during deployment. No dependency was changed in this parser release.
