# Al Tuck October16 prevention release and recovery

Status: **complete**. Craig authorized fixing the remaining gap after the first
guarded dry run failed. The tested follow-up is deployed and the same one-source
normal recovery created exactly one verified event. The first failed dry run is
retained as history; its rejection was never used as publication approval.

## Root cause and implementation

Stage3 treated a bare URL25 as2025. The previous report identified the general
Ticketpro-only allowlist, but source review found an existing, separate exact
Locarius helper immediately before that general path. It discarded two-letter
Al, counted the source venue in the title match and required the wrong extracted
date to already agree with the independent ticket timestamp. The general ticket
allowlist did not need changing.

Source release commit **e6c8d04c30ff8f6dc4292cb02fa805883d438dfa**, clean isolated
branch `codex/oct16-eight-group-prevention`, worktree
`C:/Users/craig/.codex/worktrees/a2af/gathr-apps-script`, descended from accepted
796b666. Only these production modules changed:

- `functions/src/parsing/eventExtractor.ts`: two event/fallback prompt rules reject
  bare URL tokens as year proof and distinguish doors from performance starts.
- `functions/src/parsing/linkedPerformanceTime.ts`: retain short performer names;
  remove a matching known-venue suffix before title checking; resolve an explicitly
  URL-derived bad year only from the exact scheduled ticket occurrence with matching
  title/month/day/venue and complete text-free source-image evidence. Printed full
  years, conflicting sources, uncertain galleries and unavailable pages remain held.
- `functions/src/parsing/postParser.ts`: pass existing venue and complete Stage1
  gallery evidence into that source verifier.

No current-year fallback, bootstrap, general fuzzy venue match, redirect discovery,
ticket price/image substitution or JSON-LD finish inference was added. All earlier
accepted parser safeguards remain. Models/efforts,71 user variables per parser,
secrets and cache/compact request layouts are preserved. The two reviewed Stage3
prompt instructions intentionally change prompt content. No worker/resolver,
finalizer, client/OTA or map changes were made in this follow-up.

## Tests and release

`npm run build` passed;25 focused checks passed:

```powershell
node --test lib/parsing/linkedPerformanceTime.test.js lib/parsing/linkedPerformanceTime.urlYear.test.js lib/parsing/sourceTimeConstraints.test.js lib/parsing/oct16SourceIntegrity.test.js
```

All916 compiled backend tests passed, collected using `rg --files lib` filtered
for `.test.js` and run with `node --test @testFiles`. New fixtures are anonymized;
they exercise actual production ticket configuration, wrong/explicit-old-year,
venue/title/date/status conflicts, image completeness, duplicates, unavailable
sources, doors and unknown-finish preservation. Actual saved source-response
playback passed with zero paid calls or live writes. Fresh first-party readback
also confirmed October28,2026 at20:00, doors18:30, at Trailside.

From the implementation `functions/` directory, project `gathr-migrated`,
`FUNCTIONS_DISCOVERY_TIMEOUT=60`:

```powershell
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --dry-run --non-interactive
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --non-interactive
```

Both commands passed; fresh idle locks preceded release. The existing Firebase
SDK age warning remains; no dependency update was included. Independent function
and Cloud Run readbacks verify ACTIVE,100% latest traffic, one source hash and
unchanged service/environment/secrets/trigger configuration:

| Function | Latest revision | Source hash |
| --- | --- | --- |
| processDataset | processdataset-00496-deb | 10b3d3af4e8c9e4f2d9883b4194298a25e48d5c2 |
| processDatasetResume | processdatasetresume-00460-cat | 10b3d3af4e8c9e4f2d9883b4194298a25e48d5c2 |
| processDatasetSelectedRows | processdatasetselectedrows-00452-jov | 10b3d3af4e8c9e4f2d9883b4194298a25e48d5c2 |

The dedicated evidence folder below retains source archive generations and all
pre/post function and service readbacks.

## Guarded cloud dry run and normal recovery

Only source **1559528609526804**, row220 of
`1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw`, was processed. The original recovery descriptor
SHA256 remains `f6e6347266e1a6ed7fc70b2d005aa092396e6878f508d207e8d8f03ea2400cee`.
Original source/venue versions, local evidence hashes, fresh Drive workbook bytes
and absence of a canonical/source sibling were verified before both tasks. Fresh
full before-state backups precede dispatch. Existing signed-in CLI credentials
enqueue normal Cloud Tasks with the existing runtime service account for OIDC;
no IAM, queue or credential changes.

| Step | Task | Run | Completion |
| --- | --- | --- | --- |
| dry run | oct16-altuck-dry-reviewed-v2 | 6aa1369c-8c30-4721-9d53-d1c08a50cef6 | 21:36:57UTC |
| normal recovery | oct16-altuck-apply-reviewed-v2 | f53c59b4-aa7d-40e0-8c91-4e92945a6497 | 21:40:20UTC |

The dry run returned exactly one Live Music event: Trailside, October28,2026,
20:00, with18:30 doors in description, unknown finish, original managed image and
original ticket URL. Complete before/after inventories prove **zero event, venue,
queue or review changes**. Its selected source and no-duplicate/media/timing gates
passed before the normal recovery was dispatched.

Recovery created exactly:

`venues/slug_trailsidemusichall/events/i4JaLxkbHfhNkL1q6L7D`

Al Tuck live at the Trailside; October28,2026,20:00; doors18:30 in description;
unknown end, Live Music, nonrecurring. Exactly one source-bound event exists;
zero duplicates, existing-event updates, unknown-venue items or broad replay.
Firestore omits the unknown `endTime` field; explicit metadata is
`timeFlags.end.source=none`, and the API returns an empty end time. No data edit
was made merely to change that existing representation.

Full before/after comparison proves **one event create and zero other event,
venue, queue or review changes**. Original source snapshot and full-run processed
marker are unchanged. No checkpoint exists. Final parser-lock readback at21:42UTC
found no active parser. Selected-row lock identities remain diagnostic selected
runs, not new full-parse evidence; no lock restoration was performed.

Live API detail passed with correct clocks/venue/doors. The complete **994-event,
10-page active feed** includes the new parent exactly once and only one source
identity match. Managed image returns200 and was independently compared with the
saved original portrait. Original source provenance is post media, nonfallback;
ticket URL remains the exact Locarius occurrence. This verifies backend publication,
not adoption on Craig's phone. The earlier23-document repair was not reapplied.

## Cost and evidence

This follow-up made10 actual model calls: five per cloud task. Both use Luna for
Stages1/2/3/5 and Nano for Stage4; actual Stage5 diagnostics confirm Luna with zero
reasoning tokens. No Nano Stage5 call. Local fixture/saved-source playback made
zero paid calls.

| Step | Input | Output | Cached reads | Cache writes | API latency | Estimated USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dry | 24,784 | 2,547 | 4,671 | 10,044 | 26.381s | 0.00337341 |
| recovery | 24,818 | 2,328 | 14,715 | 0 | 32.244s | 0.00211810 |

Total estimatedUSD0.00549151 using the existing ordinary/read/write/output
accounting module, with complete API cache-write coverage. The earlier failed
four-call dry run and earlier eleven local validation calls remain separately
accounted in the previous release report. This is an estimate, not an invoice.

Private coordinator evidence:
`functions/artifacts/oct16-audit-fix-coordination/altuck-followup/`.
Key files: `release-verified-processDataset-processDatasetResume-processDatasetSelectedRows.json`,
`altuck-dry-prewrite-backup.json`, `altuck-dry-verified.json`,
`altuck-apply-prewrite-backup.json`, `recovery-verified.json`,
`recovery-active-feed.json`, `completion-accounting.json`, `final-locks.json`,
dispatch receipts, original-media checks and actual cloud logs. Source playback
and parser test/build logs are retained in their respective coordinator and
implementation artifact directories.

The separately held Cinema dates, Belly identity, Witches geometry, Three Oaks
identity and Harvest programme-child design remain outside this source recovery.
