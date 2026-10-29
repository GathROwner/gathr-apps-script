# October 29: dated-offer availability release and repairs

The reviewed parser change is serving, and the exact five-offer data batch committed successfully. Native and public verification passed; the final independent post-apply receipt and authority closure are recorded in `functions/artifacts/oct28-repairs/offer-service-hours/`.

Craig approved the [single release/repair plan](oct28-offer-service-hours-approval-plan.md) with direct message `01a18748-a5a4-71a1-801e-fc966fb6c9a0`, “I approve”. No additional approval was needed for the report-shape metadata correction described below.

## Serving result

Reviewed commit `4a803f5df2078dbc66c046bd91eb85f49cb8cf68`, branch `codex/offer-service-hours-20261028`, was assembled from immutable serving commit `0e9403a1ab789ef61afa4a0777fa7bc180373abc`. The parked response-reuse checkout was not deployed. All three parser functions now serve common source hash **`7d0b1ba37f453531818cef3f82559ea1455bd970`**:

| Function | Region | Verified revision |
|---|---|---|
| processDataset | northamerica-northeast2 | processdataset-00518-hef |
| processDatasetResume | northamerica-northeast1 | processdatasetresume-00484-lat |
| processDatasetSelectedRows | northamerica-northeast1 | processdatasetselectedrows-00476-les |

All are ACTIVE/Ready,100% latest traffic,max20. The independent verifier checked actual uploaded and serving archive bytes:1,663 files match the reviewed package, with1,616 unchanged baseline files. Runtime, full configuration/environment, models/efforts, secrets bindings, IAM, triggers and entrypoints are unchanged. All three protected venue-resolver functions and task queues are unchanged. Startup probes passed with zero observed errors. Automatic venue resolution/creation and date-only publication gates remain OFF; response reuse remains parked OFF.

The actual official CLI commands were:

```powershell
node --require <offer-service-hours>/release-guard.cjs <firebase-tools>/lib/bin/firebase.js deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --config <offer-service-hours>/firebase.prebuilt.json --non-interactive --dry-run
node --require <offer-service-hours>/release-guard.cjs <firebase-tools>/lib/bin/firebase.js deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --config <offer-service-hours>/firebase.prebuilt.json --non-interactive
```

The dry run exited0 with exactly three updates, zero creates/deletes and zero configuration differences. The deployment exited2 because the SDK attempted two out-of-scope Cloud Tasks queue PATCH poststeps; both were blocked before forwarding. All three function updates were independently confirmed live, so deployment was not repeated. Actual commands and captures are in `actual-cli-dryrun.log`, `actual-cli-deploy.log`, `APPROVED_DEPLOYMENT_CAPTURE.json` and `OFFER_RELEASE_LIVE_VERIFIED.json`.

The CLI's unconditional Pub/Sub/Eventarc service-identity provisioning step was explicitly skipped for these existing-function-only updates. No API response was fabricated and no current identity-existence verification was claimed; a scoped IAM metadata GET returned403 and was not retried. All IAM/API-enablement/account provisioning mutations remained blocked. The server still enforced actual function-update permissions. The installed CLI callsites, exact project/services/prefix and caller were pinned and independently reviewed. Cloud Functions v2 supplies no server-side revision precondition here; each exact target was freshly reread for baseline revision/source/configuration immediately before its PATCH, in addition to single-writer/idle checks.

The existing outdated `firebase-functions` warning remains recorded; no dependency upgrade was mixed into this release. Build and66focused checks passed. The full compiled run had1,320passes and one stale baseline spatial-test expectation; the same failure reproduced on the immutable baseline, and the corrected test file passed2/2. Runtime files were unchanged after that full run. `VALIDATION_RECONCILIATION.json` preserves this distinction rather than claiming one entirely green full-suite execution. No paid parser replay or unchanged broad-suite repetition occurred.

## Applied data

One transaction committed at **2026-10-29T11:15:32.800639Z**,08:15Halifax, advancing feed **497→498**. Its nine writes created two missing canonical A&W branches and three branch-specific offers, updated two existing PonyBoat offers, created one private full-prestate archive and incremented the feed once.

| Offer | Live inferred availability |
|---|---|
| A&W Charlottetown,650UniversityAve,October31 | 06:00–02:00 next day |
| A&W Summerside,451GranvilleSt,October31 | 06:00–23:00 |
| A&W Stratford,2JubileeRd,October31 | 06:00–23:00 |
| PonyBoat Halloween drinks & treat bags,October30 | 12:00–02:00 next day |
| PonyBoat Halloween drinks & treat bags,October31 | 12:00–02:00 next day |

Both endpoints retain estimated availability provenance. These are not advertised promotion clocks. The A&W descriptions advise confirming availability, especially after midnight. October31 business-day continuation into November1 remains explicitly inferred; local02:00 after the DST transition is06:00UTC. The A&W children's invitation supports family score70. PonyBoat remains below the family threshold. Its kitchen hours and separate22:00 party do not supply these drink-offer clocks; the exact unrelated Saturday party ticket links were removed.

All original source identities and ordered galleries are preserved. Existing PonyBoat event IDs, parents, media and engagement are unchanged. New branch venues have no invented Facebook scrape pages or aliases. The A&W manual queue remains unchanged, and this batch does not enable automatic multi-branch intake or generic venue creation.

Before the write, the helper stopped without a transaction/attempt/commit because it expected a three-row verification report while the genuine report also included three protected resolver functions. The narrow fix selects the exact parser rows while retaining all serving checks. A separately reviewed metadata-only rebind preserved every target path, mask, typed payload, source/query guard and feed operation; only helper/digest bindings and archive plan-digest metadata changed. Final operational plan digest is `f8f0156cb864af1fc850896fc0a9a7b7cef7e1529bbc01243bf139082679291f`. Original packets/approval/review are retained as `*_BEFORE_RECEIPT_SHAPE_FIX.json`; `RECEIPT_SHAPE_REBIND.json` records the known-unexecuted block. One actual transaction committed; no rollback or blind retry occurred.

## Verification and recovery evidence

`COMMIT.json` preserves the commit response and exact writes. `PREWRITE_BACKUP_1793272529849.json` holds the fresh full native typed beforestates and query evidence. The create-only private archive is `event_repair_archives/O28_OFFER_SERVICE_HOURS_20261028`; its16native prestates are stored losslessly as typed-field JSON strings and round-trip verified, avoiding excess nested-map depth.

`NATIVE_VERIFIED.json` checks17complete native documents/versions and15scoped after-queries, including exact branch/source identities, source snapshots, protected records and unmasked media/engagement. Parser-idle checks covered342terminal locks and a transactional active-status predicate before the commit. Full completion proof and absence of matching checkpoints remained guarded.

All five public details return200. The complete eight-page active-window feed has745rows, up from742: exactly three new A&W IDs, both corrected PonyBoat IDs,740unrelated rows unchanged and zero removals. Four canonical venue groups contain the correct offers. The API exposes the timing contract under `metadata.timing`, which the existing app normalizer already supports; the read-only verifier was adjusted to that existing contract and reused its first saved response. No repeat apply, app OTA, emulator/map action or phone-adoption claim was involved. The app receives feed498 on refresh.

Independent release evidence: `RELEASE_INDEPENDENT_POSTREVIEW.json`, SHA256`7159702a0c1f366f9de5e6ad85729525bcca2a1ee567e232d233327bc2c2e4d4`. Final post-apply evidence, root hash reconciliation and consumed authorities are recorded by `INDEPENDENT_POSTAPPLY.json`, `ROOT_EVIDENCE_RECHECK.json`, `AUTHORITY_CLOSED.json`, `RELEASE_AUTHORITY_CLOSED.json` and `COMPLETION.json`.
