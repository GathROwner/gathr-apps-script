# October 11 compact Stage 4 validation release

## Authorization and production baseline

Craig approved fixing the experiment's inconsistencies and deploying when ready.
Worktree: `luna-accounting-release/gathr-apps-script`, branch
`codex/luna-oct11-integrity-repair`. The production parent is the accepted Stage
2 cache release, including all accepted Stage 1 and Stage 5 changes. Independent
before readback found all three parser functions ACTIVE, 100% latest traffic,
common hash `0678cc45a38a27c4ad4a04a7f947241106a41eb9`. The read-only run gate
found no active processing locks, the October 11 processed marker, completed
final batch, and no checkpoint. The gate will be repeated immediately before
deployment. No historical event mutation is part of this release.

## Changes

- Stage 4 remains GPT-5 Nano low. The compact response supplies one decision per
  stable source index and echoes its exact title/date/start/venue. The runtime
  reconstructs original items, preserving descriptions, prices, links, image
  indices and spatial metadata. Only supported recurrence corrections are allowed.
- The response schema restricts copied fields and IDs to supplied values; the
  runtime still verifies their exact association, counts and uniqueness.
- One bounded retry supplies the failed contract type and exact source bindings.
  Each attempt has a 90-second SDK timeout and zero SDK retries. Unresolved
  failures hold the whole post, retain evidence and skip Stage 5. There is no
  alternate-model or raw-item fail-open path for compact validation.
- A genuine specifically dated activity may proceed with unknown clock time.
  It is marked `_stage4NeedsTimeEnrichment`. Formatting cannot invent clocks for
  those items; existing enrichment and final completeness gates remain in force.
  Passing Stage 4 does not mean an untimed item has become a publishable listing.
- Product-flavour line-ups without public participation and submission deadlines
  without activity sessions remain excluded. A genuine public tasting/judging
  session or class with registration details remains eligible.
- Annual single-date activities cannot become daily without affirmative series
  evidence. Explicit daily/multi-date series are preserved.
- Fully identical timed one-offs within a post are deduplicated, including across
  batch boundaries. Different dates, times, prices, descriptions, images, links,
  audiences or recurrence remain separate. Broad dedup work remains deferred.

No Stage 3/4 cache experiment is enabled. Models, efforts, allocations and Stage
1/2/5 cache layouts remain unchanged. The only new environment setting is
`STAGE4_COMPACT_VALIDATION_ENABLED=true`.

## Validation and evidence

The final release cohort contains all 135 saved post-day cases / 425 candidates
from October 10 and 11. Available galleries and original captions were reviewed
in the earlier audits; this experiment starts from frozen Stage 3 items. It does
not claim fresh visual verification of expired galleries or bypass upstream
unavailable-image holds. Every retained source field and inventory difference
is checked against the frozen records and reviewed controls.

Preliminary passes exposed and retained evidence of venue-copy failures,
inconsistent flavour-stock rejection, and a daily annual-event error. Those
passes are not the release result. The final source-restricted schema, explicit
retry bindings, inventory/deadline checks and annual guard address them.

Final build, focused tests, paid cohort comparison, source-preservation gate,
Stage 5 compatibility controls, release commit and deployment readback are
recorded below after completion. Artifacts are local under
`functions/artifacts/stage4-compact-oct11/final-release-api` and
`functions/artifacts/stage4-compact-release`; raw sources/credentials are not
uploaded as documentation.

### Completed Stage 4 result

| Measurement | Legacy response | Compact response |
|---|---:|---:|
| Saved post-day cases / candidates | 135 / 425 | 135 / 425 |
| Paid calls | 142 | 142 |
| Estimated USD | 0.09933791 | 0.06294517 |
| Summed actual API seconds | 1,146.318 | 530.073 |
| Total output tokens (including reasoning) | 201,711 | 98,330 |
| Reasoning tokens | 46,528 | 57,472 |
| p95 call seconds | 20.419 | 7.832 |
| Fail-open fallbacks | 4 | 0 |
| Unresolved contract holds | 0 | 0 |

The compact paid pass had no retry, incomplete response or HTTP failure.
Measured estimated cost reduction is **36.64%**; cache-neutral estimated cost
reduction is **36.91%**. Summed API time is **53.76% lower**. These are Stage 4
replay measurements, not a whole-run promise or invoice reconciliation.

Final deterministic guards were then verified by exact-request playback of
those 142 saved responses: 135 cases, zero new API calls. The same source/rule
requests matched exactly. Playback timings and zero replay cost are not used
as API performance evidence. It retained 409 candidates versus legacy 350;
136 retained candidates still need time enrichment. These are validation-stage
counts, not live write counts or confirmed newly recovered PEI listings.
Additional candidates include genuine untimed activities, out-of-region tour
dates, and sources whose galleries are now unavailable. Existing downstream
regional, source-availability and time-completeness gates remain decisive.

Every retained original title, description, date/time, venue, price, ticket URL,
image index and spatial field passed the source check, with the accepted Sunday
sibling date alignment explicitly allowed. Supported recurrence differences
are the three separately dated Thanksgiving slide sessions becoming one-offs,
the two annual weigh-offs becoming one-offs, and the printed plural Thursday
trivia series becoming weekly Thursday. No other original field was rewritten.

Reviewed inventory controls preserve all 13 marathon candidates, Toby's nine
weekend activities in both days, six Bell Aliant public windows, the dated
Scarecrow activity, Milton's show and FireWorks Feast. They exclude the three
pool closures, undated putting/farm visit, flavour-stock promotion and a lone
submission cutoff. Ordinary menu launch announcements remain excluded; public
menu-launch parties/tastings and specifically advertised daily specials remain
eligible. A registration deadline in a real event's description does not remove
that event. An exactly identical Got Blues occurrence is kept once.

The production marker also prevents the two existing publication-time fallbacks
from inventing a start for a compact-marked non-special event. Genuine linked-page
or explicit source times still pass the completeness check. The compiled
regression suite passed **165/165** tests, including source binding, recovery,
rollback request equivalence, formatting guards and venue resolution.

Thirteen paid Stage 5 compatibility controls preserved **75 supplied occurrences**,
including expanded finite weekly series, all checked dates/times/venues/links/image
indices, and 15 priced occurrences. They made 18 calls, estimated USD 0.02272459,
with no final inventory or field error and no live writes. One nine-item Toby's
call returned malformed JSON after 107.141 seconds and 18,878 output tokens,
despite completed status and zero reasoning tokens. Existing bounded recovery
split it into five/four items and preserved all nine. This is an observed Stage
5 latency/output-format outlier, not Stage 4 speed evidence or a reason to raise
the output cap. A single focused repeat is retained separately.

## Deployment commands and gates

Project `gathr-migrated`, codebase `gathr-functions`; only the three parser targets:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated --dry-run
firebase deploy --only "functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows" --project gathr-migrated
```

TypeScript build and the 165-test compiled regression suite passed before release.
Firebase's predeploy runs the standard `npm run build` again. The separate read-only
Firestore preflight and independent Functions/Cloud Run readback must pass; the
post-readback requires every prior parser setting unchanged except the compact
flag, all three ACTIVE on one hash, and 100% traffic on their latest revisions.

## Rollback

Set `STAGE4_COMPACT_VALIDATION_ENABLED=false` and narrowly redeploy all three
parser functions. Explicit false restores the original Stage 4 request and
legacy handling; the 56 frozen October 11 legacy requests are byte-equivalent
in the regression suite. The pending-time formatter protection applies only
to compact-marked items. Existing live records are not rewritten by rollback.
The before readback also records the prior serving revisions for emergency
traffic restoration after checking active run state.
