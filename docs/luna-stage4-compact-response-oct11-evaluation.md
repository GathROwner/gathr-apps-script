# Compact Stage 4 responses — October 11, 2026

## Decision

**Implemented locally, tested, and held disabled. Do not deploy or enable yet.**

Craig authorized this experiment with “Okay give it a shot.” The smaller contract
has a useful measured gain, and the source-binding and failure controls passed.
However, the frozen comparison still exposes inconsistent treatment of genuine
activities without printed clock times. Enabling this version could discard
valid family activities before time enrichment. Resolve that policy conflict
and repeat the affected controls before recommending a production release.

Production was not deployed or reconfigured. No queue, traffic, event, venue or
media was changed. Stage 4 caching remains held. Accepted Stage 1, 2 and 5 caching
work remains in the baseline. These are replay findings, not a new live-parse audit.

## Baseline and experiment

- Checkout: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script`.
- Branch: `codex/luna-oct11-integrity-repair`; starting HEAD `deeff0d`.
- Frozen October 10 cohort: 82 posts / 254 Stage 3 candidates.
- Frozen October 11 cohort: 53 posts / 171 Stage 3 candidates.
- Total: **135 post-day cases / 425 candidates**, including repeated sources on
  different days. These are not 135 independent unique social posts.
- Same Nano model, low effort, 32,000 output cap, complete input evidence and
  validation rules, 15-item batching, and concurrency two. No cache layout/key
  experiment, model switch or effort change.
- Stage 4 receives extracted text records, not images. Source review here uses
  captured captions and extraction evidence; it does not establish new visual
  transcription accuracy or repair Stage 3 omissions.
- API harnesses allow only the Responses endpoint and import no live writer.

The initial compact prototype used IDs alone. A marathon response returned all
13 IDs but attached the timed decisions to IDs 6/8 instead of 7/9. Thus complete
ID coverage alone does **not** prove correct semantic association. The final
contract also requires an exact echo of name/date/startTime/venue for each ID,
checks it against the original, and reconstructs output from original records.
The sample decision was removed from the output instructions to avoid copying
an example reason instead of evaluating the source.

The echo is a cross-check, not proof that every model judgment is correct.

## Measured final contract

The unchanged baseline was measured in the first paired run. After the identity
repair, the final contract was rerun over every case. This second comparison is
sequential against the retained baseline, not simultaneous randomization. Input
data, model/effort and upstream validation rules remain fixed.

| Measurement | Current full-record response | Compact response |
|---|---:|---:|
| Source cases | 135 | 135 |
| API calls, including retries | 142 | 145 |
| Input tokens | 395,995 | 437,711 |
| Cached input tokens | 25,472 | 18,688 |
| Output tokens, including reasoning | 201,711 | 103,640 |
| Reasoning tokens | 46,528 | 63,232 |
| Visible response characters | 612,043 | 129,689 |
| Estimated USD | $0.099338 | $0.062501 |
| Cache-neutral estimated USD | $0.100484 | $0.063342 |
| Summed API time | 1,146.318 s | 573.126 s |
| Median API call | 4.911 s | 3.323 s |
| 95th percentile API call | 20.419 s | 8.309 s |
| Unresolved compact holds | N/A | 0 |
| Legacy raw-input fallbacks | 4 | 0 |

Measured reductions: **37.08% estimated cost**, **50.00% summed API time**, and
**48.62% output tokens**. Input rose 10.53%; schema/identity controls and retries
have a cost. Reasoning increased even though total output fell. Cache-neutral
savings were 36.96%, so the cost result is not driven by greater cache hits.

These figures cover Stage 4 API work over two frozen days. They are not a promise
of a 50% faster whole parser. Absolute savings at this sample volume are about
**$0.03684 USD across both days**. Estimates use the retained standard Nano rates
($0.05 ordinary input, $0.005 cached reads, $0.40 output per million tokens),
explicit zero reported cache writes, and API usage; they are not invoices.

Three compact requests required the one allowed retry:

- October 10 row 166: an extra repeated pool decision failed exact coverage.
- October 10 row 299: a response invented a venue in the identity echo when the
  original venue field was empty.
- October 11 row 319: the same venue-echo failure.

All recovered; no incomplete API response or HTTP error occurred in this final
run. The baseline had count fallbacks at October 10 rows 32, 35 and 291, and
October 11 row 292. A fallback keeping raw candidates is not successful validation.

## Final runtime and source preservation

An exact duplicate guard was added after the paid run. It removes only fully
identical, timed, dated one-off records within the same post, excluding pipeline
index/count from the comparison. Different descriptions/audiences, dates,
times, prices, links, images or recurrence remain separate. It also works across
batch boundaries. This implements the existing true-duplicate rule; broader
cross-post/venue deduplication remains deferred.

The complete **145 saved API responses** were then played through the final
validator. Each request had to match its saved request exactly, and no response
could remain unmatched. That playback used **zero paid calls** and supplies no
additional API timing evidence. It changed only the exact Got Blues duplicate
in October 10 row 31, reducing compact kept candidates from 313 to **312**.
The baseline returned 350. The count difference is not a quality grade.

Every retained compact field was compared with its original frozen source.
Only four meaningful changes were found:

1. Two Pumpkin Weigh-Off sources: erroneous `daily` recurrence became `none` for
   an explicitly dated annual event.
2. Student Discount: `none` became `weekly_wednesday`, supported by the supplied
   “Wednesdays” source wording. No clock time was invented.
3. October 11 row 66's Sunday sibling date moved from October 10 to October 11
   through the already accepted deterministic weekly-sibling alignment. The
   baseline made the same alignment.

Titles, descriptions, prices, links, venue fields, image indices, time flags and
spatial metadata otherwise remained unchanged. Unlike a full-record response,
the model cannot rewrite those fields through this contract.

## Review of every final difference

Full records, source IDs, captions, decisions and field diffs are retained in
`functions/artifacts/stage4-compact-oct11/verified-api/final-comparison.json`.

| Case | Review |
|---|---|
| Oct 10 row 32, PEI Marathon | Baseline returned only two decisions, then failed open to all 13 candidates. Compact correctly associates the supplied timed Kids Fox Trot and Team Relay with IDs 7/9, but rejects 11 untimed race candidates. These are genuine activities needing time evidence; this is an unresolved inventory gate, not evidence they are out of scope. |
| Oct 10 row 37, Toby's | Compact rejects nine dated maze/slide/fun-park activities for missing clock times. They are valid family activities. Baseline kept them here but rejected the same source in the October 11 replay. This inconsistency blocks rollout. |
| Oct 10 row 166, Bell Aliant | Compact excludes three explicit pool-closure entries and retains all six public access windows. Baseline incorrectly kept the closures. |
| Oct 10 row 207, Tivoli | Compact rejects three untimed “Hope” candidates. Baseline kept them and shortened another description. Compact preserves the full original description. Original title/time transcription remains separate Stage 3 work; this is not a confirmed missing live screening claim. |
| Oct 10 row 234, Scarecrow Festival | Compact retains the dated public display/activity; baseline rejects it for lacking a clock time. Supports separating activity existence from time completeness. |
| Oct 10 row 270, indoor putting | Both raw model decisions reject an undated/untimed candidate, but legacy prose matching reverses its rejection. The activity itself is in scope; date/time handling needs review before a safe listing. |
| Oct 10 row 272, Holman's | Both raw decisions reject the untimed flavour-competition candidate; legacy prose matching reverses its rejection. Scope and timing are not established by the final kept count alone. |
| Oct 10 row 284, NAIG | Compact keeps the explicitly dated Manitoba games; baseline rejects missing clock time. The original Winnipeg venue is preserved. Regional eligibility must remain enforced downstream; this is not evidence a PEI event should be written. |
| Oct 10 row 314, Milton | Compact keeps the real October 17 Elvis performance with its unknown time; baseline rejects missing clock time. Time enrichment remains necessary. |
| Oct 11 row 22, Downtown | Compact excludes the exact duplicate Got Blues Matinee. Distinct shows/dates remain. |
| Oct 11 row 27, Inn at Bay Fortune | Both raw decisions reject untimed FireWorks Feast; legacy prose matching reverses the rejection. The real event needs time evidence; do not classify it as invalid content solely for this reason. |
| Oct 11 row 32, Student Discount | Compact preserves the exact extraction wording and adds source-supported Wednesday recurrence. Baseline changes wording and leaves it one-off. Existing venue/source restrictions still apply. |
| Oct 11 row 165, petting farm | Both raw decisions reject missing date/time; legacy prose reverses rejection. The actual activity is in New Brunswick. Do not confuse a valid family activity with a safe dated PEI listing. |
| Oct 11 row 285, Pumpkin Weigh-Off | Compact correctly removes erroneous daily recurrence from the annual October 10 event; baseline leaves daily. |
| Oct 11 row 292, Souris | Baseline's invalid decision count triggers raw fallback to all 11 tour candidates. Compact retains the sole supplied timed Souris candidate. Other frozen candidates carry incorrect Souris venue attribution from Stage 3 and/or lack times; compact does not repair those source errors or establish that every tour stop should be discarded. |

Most differences concern incomplete timing or legacy fallback/prose behavior,
not lost URLs or mutated event records. The next focused repair should distinguish
**genuine activity needing enrichment** from **content that does not qualify**,
and verify that unresolved timing reaches an explicit hold rather than an
invented date/time or silent omission. Test it in both contracts to isolate policy
from output size. Do not relax regional restrictions, ordinary-product/menu
exclusions, unknown-date holds, or source-availability guards.

## Verification and downstream compatibility

- Final TypeScript build passed.
- **48 focused checks passed**, including existing Stage 4 policy/recurrence
  tests and artifact-size tests.
- Missing/repeated/foreign/string IDs, shifted identity echoes, injected item
  fields/date corrections, malformed JSON, incomplete API results and HTTP 429
  exercise bounded recovery or whole-post holds.
- One failed batch cannot leak a successful sibling into Stage 5.
- Replay consumer stops before Stage 5/alternate-model work; hold reason and
  original Stage 3 evidence survive row snapshot merge and 240 KB size bounding.
- All **56 October 11 legacy request bodies** match their frozen baseline exactly
  with the switch off. All 142 frozen baseline batches retain identical input
  evidence and validation rules in the compact transformation.
- Direct Stage 5 compatibility controls: **8 posts / 59 supplied occurrences**,
  11 real Luna-none calls, estimated **$0.011406 USD**, zero checked differences
  in expanded occurrence inventory, title/date/start/end time, venue, ticket
  links and source-image indices. This includes painting classes, a dense
  schedule, meals, camp sessions, trivia and family/vendor activities.
- A saved-output check independently preserved all **20 priced occurrences**.
- These Stage 5 controls import the formatter directly; they do not simulate
  Firestore venue enrichment or prove actual live writes.

All paid work in this experiment: first seven-post smoke $0.010731, initial
135-case paired run $0.148323, repaired 135-case compact run $0.062501, and
Stage 5 controls $0.011406: approximately **$0.232960 USD** total. Offline request
capture, tests and response playback add no API usage.

## Switch and rollback

`STAGE4_COMPACT_VALIDATION_ENABLED` enables the path only for exact string
`true`; absent/false keeps the old path. Explicit local
`stage4CompactValidation: false` overrides the environment. No enabling flag was
added to environment files. A future release must verify all three parsers and
its live source hash through the established release gates.

Compact batches have at most two API attempts, each with a 90-second SDK timeout
and SDK automatic retries disabled. Unresolved failures hold the whole post,
record `stage4ValidationHold`, preserve Stage 3 evidence, and never pass raw items
through as if validated. Only source-supported recurrence corrections are allowed.

Turning the switch off restores the original request/output path without reverting
accepted model or caching releases. Reverting this experiment's commit is the
code rollback. Neither action would undo live records written by a future release;
those would require separate guarded repair. No such live records were written here.

## Reproduction

Run from `functions`, with the authorized API key supplied privately only for
`--execute` commands. Fresh labels refuse overwriting earlier paid results.

```powershell
node scripts/stage4-compact-evaluation.mjs --label=new-comparison --execute
node scripts/stage4-compact-evaluation.mjs --label=new-compact --arm=compact --execute
node scripts/stage4-compact-evaluation.mjs --label=new-playback --arm=compact --playback=artifacts/stage4-compact-oct11/verified-api
node scripts/stage4-compact-report.mjs artifacts/stage4-compact-oct11/verified-api artifacts/stage4-compact-oct11/full-api --runtime=artifacts/stage4-compact-oct11/final-playback-offline
node scripts/stage4-compact-downstream.mjs artifacts/stage4-compact-oct11/verified-api --verify-saved
```

Evidence root: `functions/artifacts/stage4-compact-oct11/`. Raw request/response
files, exact frozen cohorts, summaries, comparison JSON, downstream outputs and
the build/test logs are saved locally. No claim is made that these artifacts
were uploaded or committed with the runtime code.
