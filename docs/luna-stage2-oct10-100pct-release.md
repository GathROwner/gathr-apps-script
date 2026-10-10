# Stage 2 Luna 100% release — October 10, 2026

Craig explicitly approved moving Stage 2 to 100% after the mixed-offer repairs
and full-cohort retest in `luna-stage2-oct10-specials-repair.md`.

## Configuration and scope

Set `LUNA_STAGE2_PILOT_SAMPLE_PERCENT=100` in the private deployment environment.
The pilot remains enabled. Every eligible Stage 1-passed source with stable
dataset/post identities now selects Luna with reasoning `none`; negative
classifications retain the Luna high review. Caption-only and usable complete
image galleries enter this allocation. Source availability holds, gallery limits
and explicit diagnostic model overrides retain their existing behavior.

Stage 1 and Stage 3 remain Luna high at 100%; Stage 4 remains Nano low; Stage 5
remains Luna none at 100%. No event mutations are part of this release.

## Baseline and release gates

Accepted checkout: `codex/luna-parser-live-merge` at `53679ba`, including repair
commit `e29b4e2`. Prior serving hash:
`614baaa2c6dced1d865f06a4b59d4874ba500dd3`.

The repaired comparison covered 90 evaluations across 86 rows and 85 unique
source identities, with no new eligibility holds, API errors, incomplete
responses or fallback. Its measured Stage 2 API cost was $0.084529 versus
$0.239678 for Mini, a 64.7% reduction. This is replay evidence, not tomorrow's
production billing result. The repair's full gates passed 586 compiled tests
and 66 script checks.

Fresh preflight at 17:52:50 UTC confirmed the October 10 regular dataset's
completed processing lock, processed marker and completed batch; no checkpoint
or active processing lock remained. This configuration release additionally
requires build and focused Stage 2 allocation/gallery/safeguard checks, narrow
Firebase deployment dry run, another no-active-parse preflight, and independent
readback of all three parser functions.

The October 11 audit will check actual model selection, rejection review,
source-grounded downstream inventory, holds, costs and latency. Its schedule
must still start at 11 a.m. Halifax, with no extra October 10 checks.

## Deployment evidence

Pending completion of the release gates and live readback.
