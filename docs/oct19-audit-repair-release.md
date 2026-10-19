# October 19 audit prevention and exact recoverable repair

Status: **deployed and exact recoverable repair complete; canonical/detail/complete active-feed verification passed.** Implementation and repair receipts are linked below.

## Prevention release

Existing parser candidate `functions/artifacts/caption-provenance-oct19/parser-candidate`, branch `codex/caption-provenance-parser-oct19`, commits `116bfaed7edf756cba48f4c2ae0660c534008596` then `b269f626d32436c0ff942b7a9e71328cf9f0b460`, descended from accepted caption-provenance commit `90326cc173057a32f2f6a02a30103396a12b42f7`.

Build passed; final compiled backend suite **1,094/1,094**; **15/15** source-specific focused tests. Six actual saved Merchantman records select their exact reviewed keepers through the production recurring-family selector. Downstream regressions exercise completeness, category correction, compact identity binding and the actual venue-resolution entrypoint, with healthy and negative controls. No paid calls.

The 97-source comparison is specifically **retained Stage3 source-guard playback**, not an end-to-end parser replay: 92 unchanged, five reviewed sources changed (142/173/235/286/319). Both baseline and candidate blocked network, writes, credentials and child processes. Seven missing gallery references remain unavailable; historical model-usage gaps are not fabricated.

Only `processDataset`, `processDatasetResume`, `processDatasetSelectedRows` are proposed for deployment. Live environment/configuration/secret-binding/IAM, provenance source, separate resolver releases, gates OFF, absent allowlist and historical checkpoints are checked by the release controller. The frozen packet, patch, complete test receipts and dry-run receipt are under `functions/artifacts/luna-oct19-production-audit/`.

## Exact live repair scope

The machine-readable reviewed target list, original typed documents, intended patches and source rationale are in `firebase/artifacts/oct19-full-audit/repair-plan.json`. `firebase/repair-oct19-full-audit.cjs` is dry by default and requires that exact plan for apply. It checks all seven venue sibling inventories, canonical venue versions, every target version, active locks, unchanged historical checkpoints, fresh source-occurrence duplicates, expiry and source-media availability. It never deletes media.

- Merchantman: preserve six exact day/night offer keepers; consolidate today's six copies plus two proven older oyster copies (one per serving slot). Keep product/price/quantity/size and day/night identities separate. Night finish remains unknown rather than inventing 22:00 or using 21:00–21:00.
- Lennie Gallant: preserve the manually approved recovered keeper and consolidate the other exact November18 19:30 copy. Remove public review-debug prose; preserve source links and media, and do not invent a finish.
- Pancake Breakfast: restore `oct18audit_pancake_20261031_0930` to09:30–11:00; preserve identity/media/provenance.
- Bell Aliant: correct two leisure-pool family scores and create only the source-supported October19 17:30–19:00 interval if still unexpired and absent. Preserve all four lane slots, especially noon–13:00 and13:00–16:00.
- Milton: correct Exercise's category/flags and remove its unsupported default finish; withdraw the uncertain Christmas DecorOctober22 occurrence with its full original preserved. **No new Zumba**: October21 is already covered by `0gGOviSZCv9OE2KhpL3Z`.
- New Glasgow: one October25 16:00–19:00 Spooktacular Spaghetti Dinner Fundraiser at existing `fb_100057777755102`, supported by both caption channels and the original managed poster. Preserve original source IDs/links without manufacturing fresh typed-caption provenance. Ignore only the mistaken organizer-as-venue queue entry after the exact manual recovery, preserving its samples.
- MacPhee's Market: official store-owned address **175 Main Street, Souris, PE** only. No guessed coordinates/postal code or expired BBQ backfill.
- Feed metadata: fresh version326→327, guarded against drift.

There are26 canonical actions:14 updates (11 events, one venue, one queue entry, one feed marker), ten recoverable retirements (nine duplicate copies and one uncertain-date hold), and two new dated events. Every existing target receives a full typed before-image in a dedicated non-public repair archive, plus a timestamped local prewrite backup. This is50 atomic writes including24 archives. Rollback is dry by default, restores exact typed originals only if the post-repair state has not drifted, and advances rather than rewinds the feed version.

## Deliberately unresolved evidence

Eastern Kings' conflicting dates/unqualified AM/PM and away locations; Pints' undecided opening date; Milton legacy class-cycle/Yoga15-minute conflicts; seven unavailable image references. These stay held or explicitly unresolved. No broad replay, schedule work, new venue creation, checkpoint changes, gate changes or map interaction.


## Actual release and apply evidence

- Runtime commit **b269f626d32436c0ff942b7a9e71328cf9f0b460** (preceded by116bfae on the accepted90326cc provenance baseline). The116b-only release packet/dry-run are superseded, never deployed.
- Independent corrected-candidate review: `functions/artifacts/luna-oct19-production-audit/release/independent-review.json`.
- One codebase-qualified narrow deployment updated three parsers in `gathr-migrated / gathr-functions`: `processDataset`→`processdataset-00508-kul`, `processDatasetResume`→`processdatasetresume-00472-gef`, `processDatasetSelectedRows`→`processdatasetselectedrows-00464-wic`.
- All ACTIVE,100% latest traffic, common source **ce3ebb70913656bd000cea33a97822427b274a7b**.1,526 serving payload files including opaque environment match the frozen assembly; config/environment/secret/IAM fingerprints, resolver revisions, gatesOFF/absent allowlist and three historical checkpoints are preserved. Startup probes pass; no new startup errors. Exact receipt: `functions/artifacts/luna-oct19-production-audit/release/completion.json` and `release/parser/verified.json`.
- Final full suite1,094/1,094 and15/15 focused tests pass. Frozen source stayed unchanged. The independently rejected unknown-launch behavior was corrected before deployment; generated present tense, omitted future markers and invented dates cannot override the raw unknown-launch caption.
- **Atomic apply committed2026-10-19T20:20:02.818436Z (5:20:02 p.m. Halifax).**26 canonical actions:11 event updates, ten recoverable retirements (nine duplicates, one unsupported-date withdrawal), two new dated events, one address-only venue update, one mistaken-organizer queue finalization and one feed marker.24 complete typed original documents were archived in the same atomic commit:50 writes total. No media deleted.
- Exact final plan `firebase/artifacts/oct19-full-audit/repair-plan.json`; result `firebase/artifacts/oct19-full-audit/result.json`; prewrite backup `firebase/artifacts/oct19-full-audit/prewrite-backup-2026-10-19T20-20-01-669Z.json`. `result.json` enumerates all24 archive paths and all26 final document states. Feed326→327.
- Public verification completed20:22:13UTC:23 affected detail endpoints checked, all ten retired parents and generated copies absent from canonical inventory and the complete nine-page/878-item active feed;17 retained media URLs HEAD200;85 unrelated venue events byte/type/version unchanged. The three14:00–16:00 Merchantman keepers remain canonical/detail200 but today's ended slots are correctly absent from the active feed; exactly three21:00 night offers remain, with unknown finishes. Bell's new17:30–19:00 session and the October25 fundraiser each appear exactly once with family labels. Breakfast keeper09:30–11:00 and manual Lennie keeper19:30/unknown finish verify. No new Milton Zumba.
- `firebase/artifacts/oct19-full-audit/postflight-result.json`, `postflight-details.json`, `postflight-active-feed.json`, `postflight-media.json` contain the complete readbacks. Rollback was dry-run successfully: `rollback-2026-10-19T20-20-32-884Z.json`; no rollback was applied. The same helper's `--rollback --result=<exact result.json>` is dry by default; `--apply` requires unchanged exact post-state, preserves all archives, restores typed original fields and advances rather than rewinds feed version.
- Consolidated implementation receipt: `functions/artifacts/luna-oct19-production-audit/implementation-completion.json`.

### Resolved execution issues

The first repair submission was atomically rejectedHTTP400 because the helper supplied HTTP URLs rather than Firestore resource names. Before correcting/retrying, every one of26 targets was verified unchanged and all24 archive paths absent (`rejected-apply-no-write-verification.json`). Exact resource names are now asserted against before-images; commit error bodies are retained. The successful commit above was the first actual mutation. Transient read failures were followed by fresh read-only validation, never blind mutation retries. The initial postflight expectation incorrectly required already-ended daytime Happy Hours in the active feed; the corrected verification proves expiry plus all six preserved recurring/detail records. No further data edits were used to make that check pass.

The release does not retroactively change today's historical terminal error counts, reconstruct unavailable token splits or establish automatic resolver readiness. Missing galleries and the deliberately unresolved source/date/away-location evidence above remain explicit. No new paid model calls, broad replay, schedule change, traffic override, checkpoint mutation or map interaction.
