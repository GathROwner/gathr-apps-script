# API midnight expiry fix — October 16

## Current status: tested and committed; deployment awaiting CLI sign-in

Craig approved the proposed midnight API fix with "Ok do it" after the
festival source-context release. Scope is Cloud Run `gathr-backend` only,
project `gathr-migrated`, region `northamerica-northeast1`. No Firestore writes,
parser/model/prompt changes, festival publication, OTA or map interaction.

Clean isolated source:
`C:\Users\craig\.codex\worktrees\date-only-delivery-api\gathr-backend`

Branch `codex/api-midnight-clock-20261016`, exact release commit
`9fb9d829d4c51aa066287b3e0d23baa4e74f9b6d`, descended from accepted API
`6e9fe169c9a67df8e85917d7be6a4b61925f4240`.

Only runtime delta: remove `hour12:false` from `getNowInTimezoneSnapshot`,
retaining explicit `hourCycle:'h23'`. Node20/ICU77.1 prioritizes the former and
emits `24:24` at local00:24, incorrectly expiring later same-day events.
No changes to stored clocks, recurrence, date-only capability or image guards.

## Evidence

`functions/artifacts/api-midnight-oct16/` contains:

- `immutable-baseline-reproduction.json`: exact old source on Node20.20.0,
  frozen03:24UTC, returns24:24 and falsely expires tonight's synthetic event;
  fixed source returns00:24 and retains it.
- `tests-node20.txt`, `tests-node22.txt`: all62 API checks pass on each runtime.
  New regressions cover midnight/hour boundaries, year boundaries, summer and
  winter offsets, DST, overnight/unknown/explicit-midnight ends, other zones,
  global/venue feed visibility and recurring/capability behavior.
- `before-records-feed.json`: fresh04:13UTC/01:13Halifax read-only preflight,
  no active parser locks, all36 protected versions and15 activity documents
  unchanged,17manual Anchor links retained, feed marker268 unchanged.
  All15 activity targets appear once in the complete1,003-event/11-page feed.
  Murder Mystery Night detail and venue feed both retain October16 18:00–21:00.
  This is natural post01:00 visibility, not evidence of an API deployment.
- `verify-readonly.cjs`: bounded read-only independent post-release verifier.

Live `/api/release` still reported accepted6e9fe16 and
`gathr-backend-00085-tts` at preflight. Google CLI configuration readback failed
with an expired interactive account requiring reauthentication. `gcloud auth
login` opened the browser and is awaiting completion; Craig was asked through
the asynchronous input panel. Do not claim deployment or change credentials.

## Remaining authorized steps

After sign-in, capture fresh service configuration by piping `gcloud run
services describe ... --format=json` directly into
`firebase/capture-api-serving-config-hashes.mjs` with the dedicated artifact
output. Never persist or print raw service environment/credentials. Require
the accepted6e9fe16/00085 baseline,100% latest traffic, and unchanged14-entry
environment/runtime fingerprint against the previous approved API release.

Recheck idle locks and exact live baseline before release. From the clean
committed API checkout run `scripts/deploy-cloud-run.ps1`; retain its build
transcript outside the source export. Independently verify the exact9fb9d82
commit, new ACTIVE/latest revision,100% traffic and preserved configuration
hashes, then run the dedicated verifier with `after`. Its existing credential
path is supplied only via `ANCHOR_CREDENTIAL_PATH`, never copied or printed.
Update this document with actual release/build/readback evidence.

Rollback target, if required, is immutable6e9fe16, preserving accepted
date-only delivery. Pumpkin overview publication remains a separate later
reviewed data plan; this fix neither creates nor approves an overview.
