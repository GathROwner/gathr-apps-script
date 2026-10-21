# October 21 reviewed parser release and exact repair — complete

Craig authorized independent review, deployment and recoverable repair of the prepared batch. Completed October21 at **13:43 Halifax /16:43 UTC**. No repeat audit, fresh scrape, paid model replay, app release, automatic-resolution activation or broad cleanup occurred.

## Review and final source

Fresh reviewer `/root/independent_oct21_review` found two material issues before live action: the broadened Daily Soup guard suppressed real explicit recurrence, and rebuilding keeper provenance converted three original Firestore timestamps into strings. Both were corrected and re-reviewed; final review PASS, with root hash/source/manifest sanity checks.

Final parser commit **`c5e2f2644ec9558b55be19b36e342fa06d93a48a`**, branch `codex/oct21-source-audit-guards`, checkout `C:/Users/craig/.codex/worktrees/o21guard`; immutable baseline `e92b4924d348068ec17277a66d301c64db04b4bd`. It includes reviewed parent `d8267e1b05dcad86d9814c2524491f8d4f05be24` and the narrow explicit-cadence correction.

Build and27 affected regression cases pass after the review correction. The earlier52 focused/1,121 full passing receipts belong to d8267e1 and were reviewed/reused; unchanged suites were not rerun or relabeled as a fresh full run on c5e2f26. Exact three-keeper typed-provenance checks pass, including unauthorized-primary negatives. Source fixtures retain actual Cornwall processing through the real write preview, healthy weekly/daily soup and separate lesson/bundle controls. Stage1 prompt clarification was not paid-model re-evaluated.

## Narrow deployment and independent live readback

Project `gathr-migrated`, codebase `gathr-functions`, only:

| Function | Verified revision |
| --- | --- |
| processDataset | processdataset-00510-wub |
| processDatasetResume | processdatasetresume-00474-qav |
| processDatasetSelectedRows | processdatasetselectedrows-00466-qac |

All ACTIVE, ready,100% latest traffic, common source hash **`8c014dae9dbbc3a36c4f76746fdd65883c965aee`**. All three startup probes passed; zero new runtime errors in the retained revision health readback. The serving archive matches1,548 expected payload/environment files. Fresh immutable-source comparison proves only the eight reviewed runtime files change semantically;33 otherwise identical files retain the original serving newline bytes. Environment/model/effort/cache/compact, secret binding, IAM, runtime and trigger fingerprints match the previous serving release.

Qualified commands, through the guarded release controller and frozen config:

```powershell
firebase deploy --config functions/artifacts/luna-oct21-production-audit/release/parser/firebase.prebuilt.json --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive --dry-run
firebase deploy --config functions/artifacts/luna-oct21-production-audit/release/parser/firebase.prebuilt.json --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --non-interactive
```

The real controller uses the absolute config path and the assembly cwd; exact arguments/timestamps/logs are retained. Scheduled/manual resolver and finalizer revisions/source hashes are unchanged. Both automatic-resolution/creation gates remain OFF, allowlist absent. No active parser lock; the same three historic checkpoints and zero alternate checkpoints remain unchanged.

## Exact atomic repair

Unchanged approved semantic plan SHA256 **`5960061950bfdfa3753bc95821599bbb986accaad00092016f330245267229be`**. Fresh full-record, version, sibling and feed checks passed immediately before apply. Commit time **`2026-10-21T16:43:13.999125Z`**;42 atomic writes:12 updates, eight archive-and-delete actions,20 full typed event archives, one typed feed archive and feed update **358→359**.

Updates: dated Beef Chili soup recurrence; two Leisure and Toddler Pools family scores; Cornwall Meet the artists unsupported end; Boston apps/pitcher categories, Holiday Sale & Social, contractor information night and Seniors Café cooking demonstration categories; Royalty market, luncheon and Darcy trivia keeper source/secondary-media membership. Keeper primary media, primary provenance, clocks and counters remain unchanged. Original provenance timestamp types and all existing media entries are preserved.

Removed from publication: duplicate Royalty/luncheon/Darcy copies; wrong CrapaudOct27 occurrence; non-food seniors front-store discount; unconfirmed Blair Witch screening; CITY CINEMA masthead; source-conflicting Travis listing. Film/Travis remain recoverable held evidence, with no inferred source priority. Correct CrapaudOct31 and KinkoraOct27, Second Sundays, pharmacy clinic and legacy soup parent remain protected. No media objects were deleted.

Exact20 paths, patches and reasons: `functions/artifacts/luna-oct21-production-audit/repair-plan.json`. Complete actual precommit backup:

`firebase/artifacts/oct21-source-audit/prewrite-backup-2026-10-21T16-43-11-040Z.json`

The commit response, original review capture and earlier timestamped preflight backup are also retained.21 private recovery archives were verified, including the full typed feed snapshot. A guarded read-only rollback validation passes for20 restored documents plus a monotonic359→360 feed update; **rollback was not applied**.

## Live verification

- All20 exact canonical outcomes and20 complete typed event archives match the reviewed delta.
- All20 detail endpoints pass:12 retained records return200 and eight retired records404.
- Complete947-event active feed paginated; retired parents/instances absent, dated soup no longer materializes, and every future repaired target is present.
- All14 affected venue feeds fully checked.
- All14 venue/contact documents and31 unrelated sibling documents unchanged.
- Five distinct affected primary/secondary media URLs return200.
- Fresh post-repair serving/configuration/gate/checkpoint readback passes.

Receipts under `functions/artifacts/luna-oct21-production-audit/`: `independent-review.json`, `repair-typed-update-verification.json`, `immutable-baseline-comparison.json`, `release/parser/verified.json`, `release/completion.json`, `repair-commit-response.json`, `repair-apply-result.json`, `repair-live-postflight-result.json`, `repair-rollback-dry-run.json`, `release-and-repair-completion.json`.

This completes the authorized prepared batch. Protected manual location decisions, separate location-owner holds, wider cross-gallery/source-identity prevention and generalized automatic visiting-hours/Places extraction retain their separately documented scopes. Phone adoption was not tested; no client code changed. Original audit coverage/accounting/log limitations remain in `docs/luna-oct21-production-audit.md` and are not expanded by this execution.
