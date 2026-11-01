# November 1 audit corrections and prevention release

Completed and independently live verified November 1, 2026, at 19:50 UTC
(15:50 Halifax). Originating task `01a0ea83-7031-7423-b853-966f2180d186`
was the sole production writer and deployer. Actual user authority is retained
in `C:/Users/craig/Documents/Codex/2026-11-01/remediation/ACTUAL_USER_AUTHORITY.json`.

## Corrections now live

| Source finding | Result |
| --- | --- |
| Tivoli poster | Big Sleep: Nov16 at19:15; Heathers: Nov15 at15:20; Dead Zone: Nov20 at21:30. Existing IDs, sources and media retained. |
| Your Mother Your Mother Your Mother | Existing Nov1 17:00 showing now ends on its own date with unknown finish. Four valid Nov2–5 showings remain separate. |
| Eastern Kings Sportsplex celebration | Keeper `D2zbLES0A0w36ANjrJtN` retains12:30–14:30, scoped family evidence, all six sources, seven event images and coupon/disco details. Only `xHB67O8I6FqElzfjBKVF` and `jbN7U1QPhlQOXihlHvuh` were removed. Their old links return404. No media deleted. |
| Christmas Blitz | Nov6 remains; missing Nov7 and Nov8 occurrences restored, each10:00–17:00 at the existing pottery venue. |
| Stella Maris | Nov14 19:30 at existing Harmony House restored, unknown finish. Roving Picture Shows author identity remains separate from attendee venue. |
| Ontario Longo's | One queue record covering four explicitly Ontario samples marked ignored. Original samples/suggestions archived and preserved; no venue, alias, event or replay created. |

The event transaction committed once at `2026-11-01T19:21:14.780653Z`:
five masked updates, two exact removals, three create-only events, ten archives,
one feed increment:21 writes, feed553→554. The separate queue transaction committed
two writes at `2026-11-01T19:14:00.041373Z`, without a feed write. Recovery was
validated but not executed and requires separate authorization.

Exact paths/masks and private receipts:

- `C:/Users/craig/Documents/Codex/2026-11-01/repairs-prepared/EXACT_CHANGES.json`
- `C:/Users/craig/Documents/Codex/2026-11-01/remediation/DATA_REPAIRS_COMPLETION.json`
- `firebase/artifacts/nov01-combined/` and `firebase/artifacts/nov01-ontario-queue/`
  contain ignored complete typed backups and receipts.

Native verification covered177 exact afterstates, ten archives and157 protected
records. Independent reference readback passed. Public verification covered14
details, both404 removals and all eight discovery-feed pages (749 rows).
All exact event/feed/release reservations were released after verification.

## Why these failures happened

Source facts weakened between extraction, validation, formatting and merging:
an explicit title duration was missed; three copies of Friday replaced a finite
Friday–Sunday inventory; a canonical locality suffix blocked a quoted host;
formatting discarded Ontario branch addresses; age divisions were not universally
protected; and fresh daily screenings did not narrow an older continuous span.

The14 reviewed runtime modules now preserve item-local duration/location proof,
corroborate finite dates before deduplication, protect U-age identities in both
selection and defensive merge, hold contradictory clocks, distinguish attendee
wording from sponsor mentions, and retain formatter-omitted end-only evidence
privately. Recaps cannot borrow future opening hours. Carried internal region
proof is cleared and independently rebuilt; description-only overnight context
is honored. No extra model pass or provider change was introduced.

Detailed first-failure mapping and healthy controls are in
[nov1-parser-prevention.md](nov1-parser-prevention.md). Existing PQ mechanisms are
updated in [the weakness registry](parser-quality-weakness-registry.md).

## Release and verification

Runtime source commit: `9f06bce6836f285f1425ec4dfec5239c7dd4a27c`.
Coordinator branch: `codex/nov01-audit-remediation-coordinator`.
Project/codebase: `gathr-migrated` / `gathr-functions`.

| Function | Region | Verified serving revision |
| --- | --- | --- |
| processDataset | northamerica-northeast2 | processdataset-00521-luy |
| processDatasetResume | northamerica-northeast1 | processdatasetresume-00487-bij |
| processDatasetSelectedRows | northamerica-northeast1 | processdatasetselectedrows-00479-lux |

All three serve source hash `d372c293e89fa408409dbc0e15f4ec3afee1994c` at100%
traffic, Ready/ACTIVE, with successful startup probes and no observed startup
errors. The actual serving archive SHA256 is
`290c6da2a5d80b542827c248aa2abf74a657673675495ce74b64053a90d31384`.
All1,688 files match the independently reviewed manifest:14 modules/70 overlays,
1,618 unchanged accepted members, and unchanged entrypoints.59 tracked video
repository paths are unchanged; the separate video worker was not deployed.

Build,35 focused tests and1,373 complete compiled backend tests pass with no
failures, skips or source/compiled drift. Earlier failed tests and the blocked
2bb candidate are retained; a passing suite did not override independent review.
Only new runtime fixes caused full-suite reruns. No paid model calls, parser
replays or new scrapes were run for this work.

The actual official CLI dry run passed with exactly three updates, no uploads
or mutations. The one guarded deployment exited2 only because it blocked two
incidental CloudTasks PATCH poststeps after successful function updates. There
was no retry or broader deploy. Independent live reads prove both queues are
unchanged and all three functions serve the reviewed code. The prebuilt local
package has no node_modules, so the CLI's local dependency warning is retained;
the reviewed function manifest and successful cloud build/startup supply the
runtime evidence.

Private release evidence is retained at
`C:/Users/craig/Documents/Codex/2026-11-01/remediation/parser-release/`:
`SOURCE_VALIDATION.json`, `APPROVED_DRY_RUN_CAPTURE.json`,
`APPROVED_DEPLOYMENT_CAPTURE.json`, `NOV01_RELEASE_LIVE_VERIFIED.json`,
`RELEASE_POSTREVIEW.json` and `DEPLOYMENT_COMMAND.json`.
Settings, secrets, IAM, queues and three protected resolver revisions are
unchanged; venue automatic-resolution gates remainOFF, response reuse remains
PARKED_OFF, video review configuration is unchanged and feed remains554.

## Limits retained

No finish was invented for U18 or the morning hockey source typo, and the family
skate source conflict was not silently rewritten. KACC venue intake, other
ambiguous source holds and expired Halloween examples were not broadened into
live repairs. Same venue/time alone still does not justify automatic merging.
Dense-poster confident pixel misreads remain possible: literal block/header
prompts and uncertainty holds are hardening, not independent visual proof.
No fresh paid parse was triggered to certify future extraction. Backend details
and discovery were verified; no device adoption or UI test is claimed.
