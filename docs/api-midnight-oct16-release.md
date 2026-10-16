# API midnight expiry fix — October 16

## Current status: deployed and independently verified

Completed at06:13UTC October16 after Craig confirmed CLI sign-in.
Cloud Build `adcadc0d-123c-4a62-9e09-74e987ba788c` succeeded; exact clean API
commit `9fb9d829d4c51aa066287b3e0d23baa4e74f9b6d` is serving at
`gathr-backend-00086-h5g`, Ready/Active,100% latest traffic. Immutable digest:
`sha256:5718c759eedd70cd6fbc7661ad0ee128d96625859b19922fdd74d58b3ff40323`.

All14 environment definitions, full runtime configuration hash
`516b97d64d4e4913a1cf738cd597e011a515e7d60a8ef02b5e2a3eca432a17bc`
and runtime annotation hash match the accepted pre-release baseline.
Independent post-release `/api/release` confirms the exact source, clean
build provenance and new revision. The complete capable active feed contains
1,001 entries across11 pages; all15 checked activities occur exactly once.
Murder Mystery Night detail and venue feed retain October16 18:00–21:00.
All15 activity documents and31 surviving protected records are unchanged;
17stored manual festival links and feed marker268 are preserved. No writes
were made to Firestore, parsers, model settings or festival publication.

The earlier36-record baseline crossed the scheduled03:00Halifax cleanup
while authentication was pending. Before deployment, five October15 records
were already absent: Arts Mixer, two Guild conference/comedy events, Tivoli
Altered States and Trailside Captains of Everything. Saved inventory confirms
all five ended October15;06:00UTC cleanup logs report83 expired records deleted
with no errors. This is consistent with scheduled cleanup, not an API release
effect. The exact five absences were reconciled in a fresh preflight; all31
remaining hashes/versions matched. No missing records were recreated, and
the post-release check requires the same five absences and31 unchanged pins.

Release evidence under `functions/artifacts/api-midnight-oct16/`:
`deploy.txt`, `build-status.json`, `build-log.txt`, `config-before.json`,
`config-after.json`, `revision-after.json`, `idle-preflight.json`,
`before-records-feed.json`, `after-records-feed.json`,
`preflight-cleanup-reconciliation.json` and `cleanup-logs.json`.
Frozen Node20 baseline proof remains the midnight-specific validation;
these live checks occurred after01:00 and are not presented as a live
midnight observation.

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

At the initial preflight, live `/api/release` still reported accepted6e9fe16 and
`gathr-backend-00085-tts` at preflight. Google CLI configuration readback failed
with an expired interactive account requiring reauthentication. `gcloud auth
login` opened the browser; Craig subsequently completed authentication.
The release and verification above are now complete.

## Release procedure used

After sign-in, captured fresh service configuration by piping `gcloud run
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
Actual release/build/readback evidence is recorded above.

Rollback target, if required, is immutable6e9fe16, preserving accepted
date-only delivery. Pumpkin overview publication remains a separate later
reviewed data plan; this fix neither creates nor approves an overview.
