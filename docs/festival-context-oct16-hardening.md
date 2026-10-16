# Festival shared-source hardening — October 16, 2026

Craig approved fixing the historical source-binding issues and rerunning the
saved rows. His correction is preserved: higher resolution is an explicit
fallback after source-quality failure, not a new default for every parser image.

## Implementation and release

Coordinator commits `0286645` and `9180673`; isolated worker release `5210194`,
on `codex/festival-source-context-20261016`, descended from the exact serving
worker baseline `8cbf065`. Only ten reviewed runtime/test files were overlaid.
The coordinator's historical audit runners were excluded from that assembly.

- Exact source offsets bind English/French image date headings and caption
  paragraphs to their own activity rows. Repeated rows retain distinct offsets.
- Model quotes that prepend a shared date while skipping earlier activities are
  rebound to an actual contiguous source span. No invented row text is accepted.
- A directly following literal `Location:`/`Lieu:` line can complete the same
  row; another activity's venue/clock, another image/date, ambiguous duplicate,
  malformed heading or an unsupported range cannot grant a link.
- Source proofs survive worker/publication validation and private provenance.
- Prior approved captures/negative decisions remain on their original keys,
  pinned to exact original source/edition/policy. They are revalidated without
  copying, rewriting or new paid work. Newer decisions override legacy fallback;
  creation/revocation during publication aborts the transaction.

Isolated release build, **934/934 compiled backend tests** and **105/105 focused
scope/evidence/worker checks** passed. The qualified function-only dry run passed.
No package/SDK upgrade, Stage 1–5 model/prompt/configuration change or mobile OTA.
Firebase's existing outdated-SDK warning remains unrelated to this release.

Serving, post-deployment preservation and actual worker evidence are recorded
under `functions/artifacts/festival-context-oct15/release-*.json`. The only
release target is `functions:gathr-functions:scheduledFestivalLinker` in
`gathr-migrated`; no active parser existed at preflight.

Deployment is COMPLETE. Independent ACTIVE/100%-latest readback verifies
`scheduledfestivallinker-00003-jeg`, hash
`a9c5992b246afc7f5213fd1a72d3fe15e9c3e22b`, with publication mode and complete
function/runtime/secret/scheduler configuration preserved. All three parser
revisions and source hash `4382eb69612394a7dac62c6dcc80465cb562f2c0` are unchanged.
At 03:24:49 UTC the new revision completed an actual worker invocation with
zero public additions and zero model calls. Readback retains four eligible
already linked matches, five holds, one reviewed nonmember and no capture gaps.

## Historical and fresh replays

Original row captures and every response/error are retained locally. This work
ran festival evidence/linking tests; it did not replay the five-stage endpoint
into public event writes or rescrape the source.

| Test | Result |
|---|---|
| Offline raw-response playback, Harvest | Both bands now pass the shared-caption checks; previously both held |
| Offline raw-response playback, Pumpkin | All 40 date-heading holds clear; the independent review's three negatives remain held |
| Fresh Harvest calls | Two activities source-verified: Salty Sailors 15:00–17:00, Vintage 4.0 18:00–20:00; missing printed year/normalized date are preserved |
| Fresh Pumpkin, combined posters | Hit the 12,000-token response limit; no partial result accepted |
| Explicit one-image recovery at 12,000 | Also exhausted the budget; 10,946 tokens were reasoning; no partial result accepted |
| One-image recovery at 24,000 | Recovered a completed French transcription; exposed prepended-date/noncontiguous model quotes, now deterministically rebound |
| Final bounded recovery | Both posters captured and independently checked: 41 bilingual source entries, 39 verified, two holds |

The final recovery reused that completed French response offline, then made
three fresh calls (French verification, English extraction and verification).
It preserved both original gallery indices and exactly one caption document.
The separately recorded first response's historical usage is not charged twice,
and its offline playback is not new API latency evidence.

Both original thumbnails were **590x382**. A prior actual `source_incomplete`
failure identified unreadable small text. The opt-in helper recovered the same
two Facebook asset paths at **2048x1325**, checking actual dimensions, aspect
ratio, hashes and source order. No upscaling or unrelated image substitution.
The ordinary parser already selects the largest advertised variant among
supplied images; that preprocessing behavior was not changed.

The bounded per-image/output-budget recovery is an **explicit diagnostic tool**,
not a new automatic retry loop in the scheduled worker. Production default
evidence-call budget remains 12,000; incomplete responses continue to hold.

## Remaining source and publication limits

- French ghostwalk: the model's activity quote omits the departure-location
  sentence. It remains held; a tour's starting point is not silently treated
  as its entire event venue.
- English Halloween parade: the model omitted the poster's 09:00–12:00 window.
  Independent verification rejects it. The already reviewed live parade remains
  correct and is not removed or overwritten.
- English museum row covers October 22/23 but emitted only October 22. The
  French pass retains both dates. This is a reported language-pass inventory
  gap, not authority to synthesize an additional live event or translate/rematch
  a canonical record automatically.
- Bilingual entries are not 41 unique publishable events. Private school items,
  unknown locations, missing clocks and unsupported daily expansions still hold.
- Pumpkin and Harvest are not registered reviewed area editions. This release
  does not create an overview, invent venue points, alter source ownership or
  publish a new festival. A reviewed Pumpkin overview/link plan is still needed
  to expose the new example on the phone, reusing the existing 13 activity IDs.

The fresh current-Anchor worker dry run finds 144 saved sources, four existing
eligible matches, five conservative holds, one reviewed nonmember, no source
capture gaps, no new model work and no public additions. Its 17 human links
remain protected. That zero-delta result is not a newly created phone example.

## Evidence

`functions/artifacts/festival-context-oct15/`:

- `offline/summary.json`
- `fresh-harvest/1723566179778895.json`
- `fresh-pumpkin/1539985468169427.json` (failed combined call and source-resolution proof)
- `fresh-pumpkin-bounded/1539985468169427.json` (failed 12,000-token recovery)
- `fresh-pumpkin-bounded24k/1539985468169427.json` (completed French raw response)
- `fresh-pumpkin-context-final/1539985468169427.json`
- `paid-call-reconciliation.json`: **eight new calls**, 40,240 input and
  59,477 output tokens; 551,029 ms summed API latency. This includes failed
  attempts and is not a five-stage parse timing or invoice calculation.
- `anchor-current-worker-dryrun.json`
- `release-before.json`: 36 protected documents, 17 manual links, marker 268;
  parser revisions/hash unchanged and no active processing locks.
- `release-after.json`, `serving-worker-after.json`, `new-worker-logs.json`:
  independent deployed source/configuration and actual new-revision execution.
- `live-worker-and-feed-verified.json`: all 36 protected document versions and
  all 15 pre-existing Pumpkin/music records unchanged; 16 detail requests200;
  no duplicates. The active-feed check explicitly fails for one same-day event,
  as diagnosed below; it is not reported as an entirely passing feed.

Release transcripts and test output are in the isolated release's
`functions/artifacts/festival-context-release-*.txt`.

## Separate API midnight defect — subsequently corrected

Follow-up: Craig approved the narrow API repair. It is now deployed and
verified at `gathr-backend-00086-h5g`,100% traffic, clean source `9fb9d82`.
See `docs/api-midnight-oct16-release.md` for Node20/22 regression evidence,
unchanged runtime configuration, successful full-feed verification and the
five expired October15 records reconciled before release. The diagnosis
below describes the original finding; the API is no longer on00085.

The final complete capable feed contained 833 entries across nine pages, with
14 of the 15 retained activity targets present once. The October16 18:00–21:00
Murder Mystery Night (`venues/slug_centrebellealliance/events/oct14_repair_festival_20261016_1`)
was absent with `includeExpired=false`, but its detail returned200 and the venue
feed with `includeExpired=true` included it. Its Firestore data is unchanged.

The API remains on exact clean commit `6e9fe169c9a67df8e85917d7be6a4b61925f4240`,
revision `gathr-backend-00085-tts`; no API deployment was performed. Its Docker
runtime is Node20. Reproduction using an existing local Node20.20.0/ICU77.1
runtime and that exact `firestoreService.js`, frozen at03:24UTC/00:24Halifax,
returns `2026-10-16T24:24:00`. The expiry comparator therefore incorrectly
reports the synthetic 18:00–21:00 event expired. The formatter combines
`hour12:false` with `hourCycle:'h23'`; on this runtime the former selects h24.
Omitting `hour12` produces `00:24:00` and the correct unexpired result. Node22
does not reproduce the same formatter behavior, explaining why normal local
tests can miss it.

Evidence: `midnight-runtime-reproduction.json`, `feed-observations.json` and
`live-worker-and-feed-verified.json`. This is an API clock/filtering defect,
not an event-data deletion or the newly released festival worker. It can hide
same-day events during the midnight hour and deserves the next narrow API fix
with Node20 midnight/closing-time/DST regression controls, before claiming a
new festival publication's active-feed checks all pass. No workaround changes
to event dates, clocks, recurrence, or live records were made.
