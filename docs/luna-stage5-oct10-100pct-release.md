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

Released from parser commit `0733972`, including the aquatic category safeguard
from `51927bb`. Build passed, all 584 compiled backend tests passed, and all
eight model/effort checks passed, including the global Luna-none default without
a per-post override.

A second fresh preflight at 15:56:44 UTC confirmed the October 10 dataset's
completed lock, processed marker and final batch, no checkpoint, and no active
parser locks. No live event records were changed by this release.

Both the narrow dry run and actual deployment completed successfully for project
`gathr-migrated`, codebase `gathr-functions`, from this worktree's `functions`
directory:

```powershell
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --non-interactive --dry-run
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --non-interactive
```

Independent Google Cloud function readback verified:

| Function | Serving revision | State | All traffic on latest |
|---|---|---|---|
| processDataset | processdataset-00463-loy | ACTIVE | true |
| processDatasetResume | processdatasetresume-00427-lah | ACTIVE | true |
| processDatasetSelectedRows | processdatasetselectedrows-00419-jat | ACTIVE | true |

All three share source hash
`957b8bb84d3c2dd0237729e271666d39dc1dc1f4` and the intended model settings:
Stage 5 enabled at 100%, default `gpt-6-luna` / `none`; Stage 2 remains 50%;
Stage 1 and eligible Stage 3 remain 100% Luna; Stage 4 remains Nano low;
text-only handling remains enabled, legacy fallback disabled, and excluded
post IDs empty. Sanitized readback and the no-active-parse preflight are saved
in `artifacts/luna-oct10-production-audit/`.

The CLI warned that `firebase-functions` is outdated. Updating dependencies
remains deferred as agreed; it did not block either deployment command.

Updated the existing October 11 heartbeat to audit the full Stage 5 rollout,
actual model/effort usage, completeness, timing and cost. Its first check remains
11 a.m. Halifax on October 11, with no additional October 10 checks, and it must
pause after the October 11 audit and decision are recorded.
