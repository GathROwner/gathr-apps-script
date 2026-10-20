# October 20 audit: verified release and exact repair

Completed October 20, 2026. Dataset `1IwZa8Q4SbsP745o5H_jVlIb11xXYnTST`, regular full run `88a0dae3-b010-4ec8-b31d-b54eb1cd7329`. The source audit preceded implementation: 370 input rows, 147 saved decisions, 270 available original/gallery images reviewed, 162 affected canonical parents attributed. Six original image references remain unavailable; the final 12 minutes of detailed execution logs remain unavailable after bounded HTTP429 retries. Durable full-run completion is proven; complete retry/fencing chronology is not claimed. No paid audit scrape/model replay was performed.

## Parser release

Runtime commit **`e92b4924d348068ec17277a66d301c64db04b4bd`**, branch `codex/caption-provenance-parser-oct19`, in the existing `functions/artifacts/caption-provenance-oct19/parser-candidate` package. Its reviewed parent is `1af916041edb83753cb7f01ff3380ff0befe9c52`, descended from immutable serving baseline `b269f626d32436c0ff942b7a9e71328cf9f0b460`.

Build, **35 focused / 1,112 full compiled backend tests**, saved-source output playback, clean source manifests, narrow deployment dry run and final independent review passed. Initial failing review and test receipts are preserved separately. The four legacy tests that demanded generated two-hour ends from start-only source fixtures were explicitly reclassified; printed ranges, source-proven durations, overnight controls, ordinary event defaults and specials retain their existing behavior. See `functions/artifacts/luna-oct20-production-audit/independent-review-corrections.md` for exact scope.

Deployment used only:

```text
firebase deploy --only functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows --project gathr-migrated --non-interactive
```

The frozen assembly/configuration was passed through `release-control.cjs apply parser`; no full-codebase deployment occurred.

|Function|Verified revision|State / traffic|
|---|---|---|
|processDataset|processdataset-00509-xat|ACTIVE / 100% latest|
|processDatasetResume|processdatasetresume-00473-veb|ACTIVE / 100% latest|
|processDatasetSelectedRows|processdatasetselectedrows-00465-nop|ACTIVE / 100% latest|

All share source hash **`7abb5795a9ef13d2f4d2d1d49749c5159eaf8775`**. Serving-source archive verification matched all 1,540 frozen payload files plus the preserved environment file. Runtime/configuration/environment/model/prompt/secret-binding/IAM/trigger fingerprints match the prior baseline. Each revision passed its startup probe with no new runtime errors. Separate scheduled/manual resolver and finalizer revisions remain unchanged. Both automatic recovery/creation gates remain OFF, allowlist absent. No parser lock was active; three historical checkpoints and zero alternate checkpoints remain unchanged after repair.

The CLI repeated its existing `firebase-functions` package-version warning. No dependency upgrade was included in this narrow release.

## Exact live repair

The independently reviewed **same 55 actions** committed atomically at **2026-10-20 16:17:49.086740 UTC / 1:17 p.m. Halifax**:

- 16 recoverable withdrawals: wrong-host farm/Scream Park listings, organizer judging, retail-story hours, a continuous movie-run record, conflicting Strut occurrence and duplicate venue-heading listing.
- 31 updates: exact library end uncertainty/family/category fields, eight source-proven 30-minute speaker sessions, categories, luncheon meridiem, bounded Tiny Tot series, Adult Improv end, retained overview evidence, three exact queue dispositions and the feed marker.
- 8 source-backed creations: Coraline at Marc’s Lounge, two Havenwood performances, and five missing Adult Improv class dates.

There were **102 atomic writes: 55 canonical actions plus 47 complete original-document archives**. No media was deleted. All canonical mutations and original archive fields were read back exactly. Feed version **340 → 341**. No venue/contact writes, ignored-history reopening, replay, OTA, map interaction, traffic intervention or checkpoint change occurred.

The repair helper validates exact target bodies/versions, venue siblings and source snapshots, source proof hashes, parser inactivity, historical checkpoints and a bounded current occurrence inventory. Its duplicate guard retains destination-venue same-source/date/clock checks and adds exact normalized same-item identity across other venues. Unrelated roundup items elsewhere do not conflict. Seven focused guard cases pass; no fuzzy rematching was added.

## User-visible and preservation checks

- Complete paginated active feed saved: **963 events**; **51 affected detail statuses** verified. All 16 retired parents and stored/public instances are absent. All eight new events appear exactly once at their reviewed venues.
- Seven library parents retain unknown ends. Eight speakers use source-proven 30-minute slots. Luncheon is October21, 11:30–13:30. Coraline and two Havenwood starts are exact, with unadvertised ends left blank. Six Adult Improv dates are 18:30–20:00, with December11 excluded. One Mall overview is retained.
- **12 unique affected media URLs** return HEAD200. All 17 complete venue documents, including contact fields, are unchanged. Three protected manual/history/route-hold documents, 17 source snapshots and 123 unrelated venue events are unchanged.
- The exact rollback **dry run passed for all 55 actions**. No rollback was applied. It fails closed on post-repair target or checkpoint drift.

### Tiny Tot contract clarification

The first postflight assertion expected all six dates in the unfiltered feed and failed. That assumption was incorrect; the receipt remains preserved. The API returns one current/next occurrence per recurring parent. Source lifecycle fields survive under `event.metadata` even when top-level aliases are absent.

Seven bounded detail reads prove all six Saturday occurrence IDs from November7 through December12 return **200, 09:00–10:00** with `totalOccurrences:6` and `recurrenceUntilDate:2026-12-12`; **December19 returns404**. Backend source `backend/services/firestoreService.js` in the retained `date-only-delivery-api/gathr-backend` checkout reads lifecycle from metadata in `materializeRecurringEvent` (line1131), applies it to dated details (line1196), and enforces the boundary/count (lines563/570).

The accepted app source lineage reads `recurrenceUntilDate` from the top-level field or metadata at `lib/api/firestoreEvents.ts:426`. Offline execution of that actual expression and `utils/eventSeries.ts` produces a weekly Saturday label through December12. This is contract/source verification, not a device-adoption claim. No second repair or new recurrence implementation was needed. The existing complete feed/details were reused for remaining checks; no second complete feed scan occurred.

## Evidence and recovery

Paths below are relative to this repository:

- Completion marker: `functions/artifacts/luna-oct20-production-audit/implementation-completion.json`; same-run audit marker: `audit-status.json` in that directory.
- Release/final independent review: `functions/artifacts/luna-oct20-production-audit/release/completion.json`, `release/parser/verified.json`, `release/independent-review.json`.
- Exact plan: `firebase/artifacts/oct20-full-audit/repair-plan.json`, SHA256 **`6f7654ebe185fb69f1638a4b6f52a6248104dfbfe1a67e852773a08c9af9d34b`**.
- Full prewrite backup: `firebase/artifacts/oct20-full-audit/prewrite-backup-2026-10-20T16-17-46-953Z.json`.
- Applied delta/archives: `firebase/artifacts/oct20-full-audit/result.json`, `commit-response.json`.
- Postflight: `firebase/artifacts/oct20-full-audit/postflight-result.json`, `postflight-details.json`, `postflight-active-feed.json`, `postflight-media.json`, `tinytot-app-contract.json`.
- Tiny Tot seven-read proof: `functions/artifacts/luna-oct20-production-audit/tinytot-public-contract.json`. Initial failed assertion: `firebase/artifacts/oct20-full-audit/postflight-error.json`.
- Rollback dry receipt: `firebase/artifacts/oct20-full-audit/rollback-2026-10-20T16-26-48-986Z.json`.

Rollback remains dry by default:

```text
node firebase/repair-oct20-full-audit.cjs --rollback --result=<absolute-path-to-result.json>
```

## Separate followups retained

Conflicting farm/Strut source clocks remain held; TorchRun geometry remains held. IslandChef’s inconsistent stored coordinates need a separately verified location repair. Broader finite-series/weekly-drink extraction requires a bounded followup rather than a new engine within this batch. The protected legacy LindyHop shape and RubySoup history remain unchanged. These limitations are not claimed solved by the completed release/repair. The next regular parser run will provide fresh production evidence for prevention; no paid replay or additional monitor was started.


## Final independent confirmation

Final independent verification at13:29Halifax confirms `complete_deployed_applied_and_verified`:29frozen,203applied/saved-public and28final checks passed. No execution blocker or pending approved apply remains. The retained source/legacy followups above remain separate. Receipt: `functions/artifacts/luna-oct20-production-audit/final-independent-verification.json`, SHA256 `1434e5cdd588235cd1c17b752952782a44a73e3195f3da3fd76bc17f7cc7fb78`. No additional scan, tests, deployment or mutation was performed for this documentation closeout.


## Source-semantic audit scope qualification

The release and55-action repair are complete; this does not establish exhaustive source recall. The retained evidence contains76individual downstream source notes and71generic Stage1rejection notes; review booleans are assigned programmatically.37model-identified multi-event posts have specific notes, but no independent expected-activity census for every source is established.214scraperempty/unavailable rows,9separate geography decisions,6unavailable image references and full-video coverage limit conclusions.8missing event documents plus5later TinyTot dates were restored; not all potential/legacy misses were resolved. Saved RoyaltyCrossing91/92 identity inconsistency remains a possible duplicate requiring source verification, not an applied target. Exact counts, source paths and future false-positive/false-negative audit standard: `docs/oct20-source-semantic-coverage.md`. This clarification used existing evidence only.
