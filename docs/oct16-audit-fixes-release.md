# October 16 audit fixes: approved production batch

Current follow-up status: Craig subsequently authorized fixing Al Tuck's remaining
gap. Source releasee6c8d04, a new passing cloud dry run and exact one-source normal
recovery are complete. Current parser hash10b3d3af4e8c9e4f2d9883b4194298a25e48d5c2;
event `venues/slug_trailsidemusichall/events/i4JaLxkbHfhNkL1q6L7D` is API/feed/media
verified. See `docs/altuck-oct16-recovery-release.md`. The failed first-run account
below is historical; its proposed broad ticket-path diagnosis was refined by
finding and repairing the existing exact Locarius helper. No general ticket
allowlist expansion was needed.

Craig approved `docs/oct16-audit-fixes-approval-plan.md` as one combined batch.
The six narrow releases and the exact23-document repair are complete. Al Tuck's
one-source cloud dry run completed but failed the approved publication gate;
no normal recovery was dispatched. It remains held for the specific follow-up
below. Do not describe all eight groups as fully resolved.

## Serving release

Implementation: clean `codex/oct16-eight-group-prevention`, worktree
`C:/Users/craig/.codex/worktrees/a2af/gathr-apps-script`, commit
`796b66659e04e6cccc84f25f95e22fd24fb289b0`. Parser baseline8e366b3 includes the
accepted city/venue and doors-versus-performance safeguards. Each resolver and
the festival worker was assembled separately from its own immutable serving
archive; their unrelated baseline changes were preserved.

All deployments used only `functions:gathr-functions:<name>` in project
`gathr-migrated`, after their qualified dry runs, builds and tests. Fresh idle
parser-lock checks preceded every deployment. Independent function and Cloud Run
readbacks confirm ACTIVE,100% latest traffic and preserved service/environment/
secret/trigger configuration:

| Function | Revision | Source hash |
| --- | --- | --- |
| processDataset | processdataset-00495-hid | 918f9c77b08e7b94a81373983864bb93f60dd508 |
| processDatasetResume | processdatasetresume-00459-zur | 918f9c77b08e7b94a81373983864bb93f60dd508 |
| processDatasetSelectedRows | processdatasetselectedrows-00451-kez | 918f9c77b08e7b94a81373983864bb93f60dd508 |
| scheduledUnknownVenueResolver | scheduledunknownvenueresolver-00242-kih | 30136174906426f5740a3f05ea20f84ac6b76cfb |
| processUnrecognizedVenues | processunrecognizedvenues-00241-qus | d3b0a5a151f797d6aac322dc26a930c8ae5e0364 |
| scheduledFestivalLinker | scheduledfestivallinker-00005-bay | 63607e9458047a742d0990ab56a703ebb680434f |

Models/efforts, compact contracts, caching configuration, secrets and existing
festival publish mode are preserved. No client/OTA or finalizer release occurred.
Normal scheduled festival publication must still acquire and validate its own
source evidence; the earlier synthetic eight-link proposal is not a live result.

Private evidence: coordinator `functions/artifacts/oct16-audit-fix-coordination/`:
`six-function-release-verified.json`, the six `release-post-*` and
`release-service-*` readbacks, individual release verification files, deployment
logs, preapproval comparisons and source-assembly manifests. Source archive
bucket/object/generation identities are retained in the verification files.

## Exact23-document repair

Applied the approved20:40 plan with canonical SHA256
`fbbd413c27fd128f2c6db8dcb6872232ac7f8d67d1f86e5d9a96184eefa43717`.
Fresh target/source/sibling/review checks and the atomic transaction passed;
17 updates,4 creates and2 deletes were followed by exact postcondition checks.
Feed metadata advanced284→285. No broader cleanup, venue/media deletion or
new public area geometry was performed.

Complete application backup and result in implementation checkout:

- `firebase/artifacts/oct16-eight-group/prewrite-backup-2026-10-16T21-06-29-634Z.json`
- `firebase/artifacts/oct16-eight-group/applied-2026-10-16T21-06-29-634Z.json`

The approved plan lists every path/field. Public corrections cover Montague's
item-specific rallies/drop-ins and six-session Learn to Curl course; Be You's
midnight end; Ruby's$16 board; craft-fair/chorus categories; Belly Dance's
55-minute ongoing Friday classes; and exact venue scope/source-clean descriptions
for Two Pianos and Mayoral Candidates. Three missing dated curling occurrences
were created. Only the two false post-time Cinema/Inn parents were deleted.
ADL/Witches/Three Oaks received their exact queue/review dispositions; Witches
remains a private unordered area hold.

API verification passed30 detail checks, the complete998-event/10-page active
feed and33 retained managed-image checks. Both deleted parents and generated
copies are absent. The corrected expired Be You and Ruby records remain available
by detail and correctly omit from the active feed. All11 protected Inn evenings,
Belly's unproved aggregator copy and Harvest remain. At transaction verification,
all17 Anchor and13 Pumpkin links and their complete roots were unchanged.

The API exposes the curling course parent with18:15–20:00, Thursday recurrence,
six occurrences and December17 horizon. It does not return six pre-expanded
course instances in the general feed; no claim of six API instances is made.
Private evidence: `repair-api-verified.json` and `repair-active-feed.json` in
coordinator evidence. The verifier accounts for API boolean normalization and
explicitly expired corrected records; no additional data changes were made to
satisfy verification.

## Al Tuck recovery

Only source1559528609526804, row220, dataset
`1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw` is authorized. Descriptor SHA256
`f6e6347266e1a6ed7fc70b2d005aa092396e6878f508d207e8d8f03ea2400cee`.
Original workbook bytes were freshly downloaded and matched; caption snapshot,
venue version, ticket and ordered available original-image bytes were pinned,
with no canonical/source sibling. Full pre-dispatch backup was saved.

The existing service account lacks `cloudtasks.tasks.create`; its initial enqueue
was denied and the exact deterministic task ID was independently NOT_FOUND. The
same one-source dry run was subsequently enqueued with the existing signed-in
CLI account, using the deployed function's existing runtime identity for OIDC.
No IAM, queue configuration, secret or credential change was made. One local CLI
command-name error created no task. Successful task:
`oct16-altuck-dry-reviewed-v1`, enqueued21:12:10UTC; run
`72f9aa80-2c51-4040-bc26-41dcbe1c90df`.

### Actual cloud result: held, not recovered

The dry run completed21:12:46UTC, with exactly source1559528609526804/row220,
one diagnostic snapshot, zero creates/updates/duplicates and no unknown queue
items. Independent full before/after inventories show **zero event, queue or
city-review changes**. The original source snapshot and Trailside venue versions
are unchanged; the original processed marker remains unchanged; no checkpoint
exists. Final idle-lock readback at21:16:21UTC found no active parser.

Stage1 correctly accepted the future announcement and explicitly said the bare
URL number is not year authority. Stage3 nevertheless produced2025-10-28 with
no show time, explaining that the URL's25 was a year. Stage4 correctly rejected
that malformed extracted date as past. Stage5 was not reached. Thus the deployed
Stage1 guard is effective here, while the complete source-to-publication fix is
**not yet effective**. No publication, guessed2026 fallback, forced time or
second cloud generation/replay was attempted.

Fresh snapshot:
`parse_snapshots/1_afb_0HkeOiHbp3s7lofsgKdtNbyKGCw_220_1792185166544`.
Private artifacts: `altuck-dry-prewrite-backup.json`, `altuck-dry-dispatch.json`,
`altuck-dry-logs.json`, `altuck-status.json`, `altuck-dry-verified.json` and
`altuck-dry-cost.json`. The verifier explicitly records `verified:false` because
the approved one-event gate failed; its zero public/queue/review deltas passed.

Four actual cloud calls: Stage1/2/3 Luna and Stage4 Nano;22,127 input and2,366
output tokens,1,289 cached reads and11,576 API-reported cache writes, complete
write coverage. EstimatedUSD0.00335069 using the existing accounting module;
23.648s model API time,28.382s parser time and31.547s task duration. This is
separate from the11 local evaluation calls and normal scheduled worker costs.
Two automatic temporary-OCR cleanup attempts received403 from the existing
managed-post-image deletion guard. No cleanup permission or media deletion was
added; source/display images remain retained.

### Narrow next implementation

The actual trace identifies three connected gaps:

1. `functions/src/parsing/eventExtractor.ts`: Stage3 lacks the new Stage1 rule
   separating bare URL price-like tokens from source-proven years. Add the rule
   plus explicit source-year provenance/uncertainty handling. Preserve plainly
   printed2025 as a real expired-year control; never substitute the post year
   solely to pass validation.
2. `functions/src/parsing/types.ts` and `ticketLinkEnricher.ts`: both configured
   and fallback ticket-domain lists contain only Ticketpro. Stage3.7 therefore
   logged `no_ticket_urls`,0 attempted URLs for the exact Locarius link. A narrowly
   trusted Locarius path must verify the exact occurrence/title/month/day/venue
   from the specific first-party page. The existing enricher only fills missing
   dates; adding a domain alone would not replace the nonempty erroneous2025 date.
   Handle specifically unsupported URL-derived year evidence before enrichment,
   retaining a hold when no independent date proof exists.
3. `websiteDetailEnricher.ts` correctly refused to match2025 to current2026:
   `no_high_confidence_time_matches`,42 candidates,0 applied. Keep that general
   date-conflict safeguard. Successful direct source verification must preserve
   performance20:00, doors18:30 only in description, unknown finish, exact Trailside
   identity and original managed media. Do not promote the ticket JSON-LD duration
   into an advertised finish.

Add an anonymized fixture reproducing this actual Stage3 output and the real
production ticket-domain configuration. Test the full extraction→ticket→secondary
validation route with saved, scrubbed first-party responses and zero paid calls,
plus explicit-old-year, missing-first-party-proof, wrong-title/venue, price-token
and doors-only controls. The previous prompt/unit evaluation did not cover this
complete cloud route; do not call it end-to-end success. A later reviewed release
and newly bounded dry run are required before Al Tuck's recovery can proceed.

Normal selected-row tasks replace the dataset's terminal lock identity with their
own run/source while retaining the full-run processed marker; their lock is not
new full-parse evidence. The original full-run lock/marker/batch/checkpoint state
is preserved in the backup. No manual lock restoration or full-run replay is
authorized.

## Validation and remaining holds

Parser:912 full compiled checks,42 focused and113 script checks passed. Worker:
946 compiled and18 scripts passed. Both resolver focused20-check suites passed;
their full suites each retain the same two expired September fixture failures
as their unchanged immutable baselines,392/394. An older compact equality fixture
also fails identically on accepted parser8e366b3. Existing Firebase SDK age warning
remains; no dependency upgrade is included. Eleven local paid validation calls
cost an estimatedUSD0.01362435; cloud recovery usage is accounted separately.

Still held: Al Tuck's remaining Stage3/ticket-route gap; Cinema's conflicting advertised dates; Belly aggregator identity;
Witches public geometry; Three Oaks exact venue identity; Harvest programme-child
design. Family-label research/backfill remains separate. No map interaction,
client publication or broad historical replay occurred.
