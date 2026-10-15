# Auditions: exact compatibility release and live repair decision

Craig approved this exact scoped package on October 15. Execution is sequential.
The API, both Preview releases and exact live data repair are COMPLETE and
independently verified. Craig subsequently confirmed iPhone adoption and opened
the corrected listing; Android adoption remains unverified.
Harvest's earlier single-record correction is complete and separate.

## Execution evidence (October 15)

- Craig's subsequent Profile screenshot shows Preview/runtime1.1.10/OTA
  `01a14132`, matching the published iOS update. After checking the October26
  audition, he replied “Ok, yes I see that. Continue.” This is direct user
  confirmation of iPhone adoption and the corrected listing, separate from
  the earlier synthetic Android component renders and EAS publication evidence.

- Cloud Build `ccf56609-fe46-4f3f-9136-ab97e318c78a` succeeded for exact
  `6e9fe169c9a67df8e85917d7be6a4b61925f4240`. Cloud Run revision
  `gathr-backend-00085-tts` is Ready, with 100% latest traffic. Independent
  `/api/release` confirms that clean source commit.
- Before/after runtime, annotation and all fourteen environment-definition
  fingerprints match. Ordinary active feed, detail and managed-image checks
  passed. Read-only preflight found zero active parser locks, completed dataset,
  completed final batch and no checkpoint.
- Private evidence: `functions/artifacts/oct15-sequential-repairs/` files
  `api-approved-deploy.txt`, `api-config-hashes-approved-before.json`,
  `api-config-hashes-approved-after.json`, `api-release-approved-after.json`
  and `api-approved-independent-smoke.json`.
- iOS Preview is released from exact `7473c3e`, runtime `1.1.10`: group
  `948ec492-513f-4a93-a3be-7980f3213ed4`, update
  `01a14132-e6b0-7ab4-acbb-efdf2fab2977`. Parent independently queried EAS
  view/list and confirmed newest iOS Preview, exact commit/platform/runtime.
  Frontend export proof confirms byte-identical tested Hermes bundle, 2,495
  modules and 112 EAS iOS assets, with no runtime fixtures. Preview channel
  mapping is active. Device adoption is unverified; existing fingerprint
  advisory remains. Evidence: `ios-preview-independent-*` in the private
  coordinator artifacts and the iOS checkout's ignored release directory.
- Android Preview is released from exact `4e44138`, runtime `1.1.10`: group
  `be292299-63ce-4715-a19d-128f5bd530c8`, update
  `01a14138-f9fa-74c4-b3d9-27f6081aa8d0`. Parent independently queried EAS
  view/list and confirmed newest Android Preview and exact source/runtime.
  Published Hermes is byte-identical to the tested export: 2,727 modules,
  128 EAS Android assets, no runtime fixtures. Staging configuration and active
  Preview mapping were preserved. Existing fingerprint advisory remains;
  installed-device adoption is unverified. Both frontend checkouts remain clean
  at their approved commits, and the frontend owner completed idle.
- Fresh source/record/version/sibling and idle-parser checks matched the exact
  reviewed plan. At 20:22 UTC one atomic transaction updated only the audition
  and `runtime_metadata/event_feed` (259 -> 260). The original poster is primary,
  both exact clocks are unknown, source date is October 26, and evening wording
  remains. No media upload/delete or new event.
- Apply evidence: `functions/artifacts/oct15-sequential-repairs/auditions/`
  `prewrite-2026-10-15T20-22-20-646Z.json` and
  `applied-2026-10-15T20-22-20-646Z.json`. Independent verifier passed at
  20:23 UTC: exact delta, 22 unchanged references, unchanged sibling membership,
  default detail404/feed absent, capable detail200/feed once, 1,007 default and
  1,008 capable events across eleven pages each, identical unrelated public
  responses, feed marker260 and all three existing managed images200. See
  `independent-verification.json`. No parser deploy or global gate change.

## Proposed sequence, one step at a time

1. Release only Cloud Run API service **gathr-backend**, project
   **gathr-migrated**, region **northamerica-northeast1**, exact candidate
   `6e9fe169c9a67df8e85917d7be6a4b61925f4240` in the isolated
   `date-only-delivery-api/gathr-backend` checkout. Runtime code is `8ce4bf3`;
   its later commit changes documentation only. The current immutable baseline
   is `13c8d52`, revision `gathr-backend-00084-66r`, 100% traffic. Preserve all
   fourteen environment definitions and the runtime configuration; secret-safe
   fingerprints are saved for independent comparison. Preserve upload/profile
   deletion guards. No Firebase parser deploy is in this plan.
2. Publish **iOS Preview only**, runtime **1.1.10**, candidate
   `7473c3e17b607a3c82595ee0b71b60331144bf97`, descended from the current
   `3d2f4f7` iOS Preview release. Its two runtime changes declare supported
   requests and isolate persisted feed/detail caches. All current iOS UI remains.
3. Publish **Android Preview only**, runtime **1.1.10**, candidate
   `4e44138af0d52324bf369957fc02910295b9142d`, descended from the current
   `8ce23bf` Android Preview release. It ports only the reviewed unknown-time
   handling, recurrence string normalization, detail timing preservation,
   capability requests and separate cache generations. Preserve the Android
   UI, native configuration and dependencies. No Production OTA/native build.
4. After independent release readbacks, update exactly
   `venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo` and the feed-change
   marker described below in one guarded transaction.

Recheck all serving baselines immediately before release. Drift requires
reconciliation and verification, not publishing stale source over accepted work.
The frontend coordinator owns the two Preview releases if approved; the parent
coordinator owns the API and live data. No concurrent ownership of a release.

## User-visible behavior and delivery tradeoff

The official audition page and original poster support **October 26, evening**;
individual appointments are communicated separately. They do not support the
existing October 26 08:00 to October 27 01:00 span. The proposed correction
keeps October 26, clears both unsupported clocks, preserves the existing evening
description, restores the original poster and sets the exact reviewed v2
unknown-clock contract. It never claims an all-day/Now window or a timed calendar
entry. Existing title, ID/path, venue, category, source identity and other media
are preserved. No upload or deletion.

Supported clients explicitly request `dateOnlyActivities=v1`. The API returns
the intact reviewed unknown-time contract only to those clients. **Unsupported
older/Production app versions temporarily omit this newly marked listing.**
Their detail request returns the normal 404. Ordinary timed/recurring/area and
legacy untimed records retain existing behavior. Separate cache generations
prevent old bundles hydrating newly marked data after an OTA rollback. No account
storage is wiped. OTA publication is not proof a phone has adopted the update.

The global parser date-only publication flag remains **OFF**; this first exact
manual correction is not permission to publish all held activities. Source,
price, horizon and duplicate conflicts remain review requirements.

## Exact data plan and backup

Helper: `firebase/repair-auditions-date-only-oct15.mjs` (default dry run).
Independent verifier: `firebase/verify-auditions-date-only-oct15-readonly.mjs`.

Latest reviewed plan, superseding the earlier source-only/marker-only variants:

- `functions/artifacts/oct15-sequential-repairs/auditions/plan-2026-10-15T19-49-35-137Z.json`
- `functions/artifacts/oct15-sequential-repairs/auditions/backup-2026-10-15T19-49-35-137Z.json`

Second exact target: **`runtime_metadata/event_feed`**. Increment current guarded
version **259 -> 260**, update its timestamp, preserve every other field. This
lets normal app feed polling detect this and the preceding manual recoveries.
It is not an event create, parser replay or queue operation.

Fresh target/venue/source/sibling/marker rereads and exact versions must match;
the normalized official-page text and original poster bytes are fingerprinted.
A repeat official fetch matched the reviewed text fingerprint. Any drift aborts.
Fresh full prewrite backup and transactional idle-parser/reference/query checks
are required. Apply also requires the exact approved API commit to be serving.

## Completed validation and independent review

- API: 55 checks in seven files passed; feed/detail/venue routes, malformed
  capability/contract, ordinary controls and bounded pagination. All 1,133
  current stored-record projections match the serving baseline; zero existing
  records would be newly excluded. This is read-only capture/offline playback.
- Actual proposed auditions payload plays back as default-excluded/v1-allowed,
  with unknown clocks, October 26 dates, legacy No normalized false and the
  original poster. No paid calls or live mutations in these tests.
- Android: 136 tests / 14 suites, TypeScript, zero-error lint (219 existing
  warnings), environment/Mapbox/Social/ancestry preflight. Final local export
  2,727 modules / 2,669 mapped sources / 5,962,824-byte Hermes bundle.
- iOS: 38 tests / five suites, one existing opt-in skip, TypeScript, zero-error
  lint (213 existing warnings), preserved account/native-shell/App Check/Social/
  Mapbox preflight. Final local export 2,495 modules / 2,451 mapped sources /
  5,680,484-byte Hermes bundle.
- Both exports contain zero runtime fixture/test sources and match all eleven
  inspected source files. Temporary Android routes were restored byte-for-byte.
  Final documentation-only heads match the validated runtime trees exactly.
- The frontend task completed idle with both candidates frozen. Its final iOS
  `7473c3e` changes README spacing only after the inspected `1368b6a`; parent
  independently confirmed its runtime still exactly matches validated `8df8c25`.
- Parent independently inspected five real Android native shared-component
  screenshots: Today/Tomorrow, disclosure/calendar guard, auditions, bounded
  date range and healthy timed/overnight controls. This is synthetic component
  evidence, not full iOS rendering or installed-device adoption.

Frontend evidence is committed in each candidate's `docs/qa/` directory. All
deploy checkouts are clean; private captures/credentials are not packaged.

## Post-release and post-write verification

Use the existing guarded Cloud Run and platform-specific OTA workflows. Verify
exact API `/api/release`, latest ready revision, 100% traffic and preserved
configuration fingerprints. Verify each EAS platform/runtime/commit/group and
latest target mapping independently. Preserve prior releases for recovery.

After the exact data transaction, independently verify event/marker delta,
untouched source/venue/siblings, all existing images, unknown clocks, source
date and original-poster provenance. Paginate both complete active feeds:
unsupported count zero; capable count one. Verify unsupported detail 404,
capable detail 200, no same-source occurrence duplicate and refreshed feed
version after its bounded API cache expires.

Do not roll the API back first while newly marked records remain published;
that would expose them to unsupported clients. Client rollback is protected by
separate caches and the retained API guard. Any required record restoration or
holding action needs its own exact reviewed delta, never fabricated clocks.

## Remaining work after this issue

Continue the recorded sequential list: exact category/media/spatial corrections
and source-grounded activity recoveries, broader date-only acceptance/Production
delivery, automatic festival shadow/publication gates, profile review, missing
index and remaining duplicate clusters. This plan does not claim those complete.
