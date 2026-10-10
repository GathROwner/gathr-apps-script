# Stage 5 Luna-none 100% release — October 10

Craig approved: “I agree wire in 100% for stage 5 tomorrow.”

## Intended configuration

| Stage | Production model allocation |
|---|---|
| 1 | Luna high, 100% eligible caption-only and image evaluations |
| 2 | Luna none with high negative review, 50%; Mini otherwise |
| 3 | Luna high, 100% eligible caption-only and image posts; preserve source holds |
| 4 | Nano low |
| 5 | Luna none, 100% of posts reaching final formatting |

Stage 5 uses `LUNA_STAGE5_PILOT_ENABLED=true` and
`LUNA_STAGE5_PILOT_SAMPLE_PERCENT=100`. Its default is also
`STAGE5_MODEL_OVERRIDE=gpt-6-luna` with
`STAGE5_RESPONSES_REASONING_EFFORT=none`, so missing allocation metadata cannot
silently send production formatting back to Nano. Diagnostic calls that
explicitly request another model remain possible for controlled comparisons.

Stage 5's allocation depends on having validated Stage 4 text items, not on
original-image availability. This does not weaken upstream image/source holds.
Selected calls retain nine-item batches, concurrency two, bounded split/retry
recovery and strict source-identity/completeness checks. The tested aquatic
activity category safeguard is included. Stage 2 stays at 50%.

## Evidence and gates

Read `luna-stage5-oct10-100pct-evaluation.md` for two complete no-write replays
of all 69 Stage 5 source posts, retaining all 221 supplied occurrences. The
second pass verified the production effort override with zero reasoning
tokens; its aggregate time was 7.34 minutes versus today's 34.26 minutes and
estimated token cost was $0.054156 versus $0.184466. These are cohort
measurements, not a guarantee of total parse duration.

The existing complete October 10 parse is unchanged. Fresh read-only preflight
at 15:52 UTC found completed lock, processed marker and final batch, no
checkpoint, and no active parser locks. Live event corrections remain
separate, approval-gated work.

Build, full compiled tests and the default-model/effort script checks must pass
before deployment. Deploy only `processDataset`, `processDatasetResume` and
`processDatasetSelectedRows` in `gathr-migrated`, codebase `gathr-functions`,
using the established narrow dry run before the real command. Verify all three
ACTIVE, common source hash, latest revision traffic and expected environment.

The existing October 11 audit starts at 11 a.m. Halifax, checks actual Stage 5
Luna-none calls and cost as well as Stage 2's 50% cohort, and pauses once the
audit and rollout decision are recorded. It must not repeat October 10.

## Deployment evidence

To be appended after verified release.
