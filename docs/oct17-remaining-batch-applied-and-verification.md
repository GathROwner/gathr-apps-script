# October 17 approved remaining batch: results and verification exception

## Completed and independently verified

Craig approved the exact combined plan in
`docs/oct17-remaining-batch-release-and-repair-approval-plan.md`.

The eight-operation Curling correction applied19:40:35 UTC, feed302→303.
Independent proof at19:40:57 confirms all eight deltas, two unchanged snapshots,
three retired details404, both signup details200, no retired/generated copies,
expired signup absent, future signup exactly once in963entries/10pages, and all
five managed images200. Complete backup/result stamp:
`firebase/artifacts/oct17-curling-siblings/*2026-10-17T19-40-35-075Z.json`.

Only `functions:gathr-functions:scheduledFestivalLinker` was deployed to
`gathr-migrated` from clean tested assembly15d5c71. Independent19:44:38 UTC readback:
ACTIVE `scheduledfestivallinker-00008-noh`, latest100%, source hash
`95fe0fddd0a1a438bb41c0312eaee2d13b06fef9`. Environment, secrets, runtime and
scheduler are identical to the previous serving baseline. All three parsers
remain ACTIVE at common0c06b198eacb9cf32171e0d68fbea89e889a93c3 with their accepted
revisions and full configuration preserved. The immutable deployed source archive
generation1792266163589230 matches1,410 source/compiled/script/package files in
the tested assembly, with identical inventories. Archive SHA256:
`799ab8e2865255d2c9441618fe8438ca849dfcfa1756c5b609be7d55b2c830e2`.
Proofs: `functions/artifacts/oct17-festival-corroboration-release/independent-serving-verification.json`
and `independent-source-archive-verification.json` in that directory.
Deployment passed; the existing firebase-functions7.2.5 warning remains.

The exact three private creates applied19:44:52 UTC with four receipts, zero
public writes and feed303 unchanged. All17 read-set documents match their exact
approved delta or unchanged controls. Backup/result stamp:
`firebase/artifacts/oct17-festival-corroboration/*2026-10-17T19-44-52-407Z.json`.

## Independent worker acceptance failed; no green claim

The actual live-database read-only worker covers145sources with no gaps,
unconfirmed items, paid sources, public additions/removals or writes. It accepts
the umbrella self-reference, but holds all three existing-member receipts as
`invalid_reviewed_corroboration`. Harvest therefore has five holds, not the
expected two. Anchor's22 original holds remain. Existing public links are intact.
The first independent acceptance assertion failed0versus3; this batch is not
fully accepted. Raw report:
`firebase/artifacts/oct17-festival-corroboration/private-worker-readonly-report.json`.

Root cause is the offline FrozenDatabase adapter's date conversion. It used
`new Date(seconds*1000+nanoseconds/1e6)`, which truncates fractional milliseconds.
The installed Firestore SDK Timestamp.toDate rounds to milliseconds. Source
1725796586222521 is exactly the same pinned document/version, but its revision
string is12:51:14.759Z live versus12:51:14.758Z in the offline proposal. A recursive
comparison of all three evidence objects finds that one field as the only delta.
All source/capture/activity/verifier/edition/review/umbrella guards pass; only the
evidence fingerprint fails. The production guard is correctly failing closed.
The deployed code and actual capture/source fields do not need changing.

The local adapter now uses the actual installed Firestore Timestamp for document
versions and nested timestamps. Corrected independent playback passes14/14 again,
recorded separately under `functions/artifacts/oct17-festival-corroboration-release/timestamp-correction-tools/`;
the original approved proposal/logs are preserved. No serving assembly was edited.

## Exact prepared correction; awaiting new private-update approval

Update only the `receipts` array of
`festival_link_corroborations/4a65b7a3f61f50846336731613aa93d421c8b2e966680a847e986833d990b49d`:
replace precisely the three `evidenceFingerprint` strings with SDK-consistent
hashes. Every other receipt field, timestamp pin and document remains identical.
No source, capture, public event, link, venue, media, feed or serving code changes.

Default-dry helper `firebase/repair-oct17-festival-timestamp-correction.mjs`
pins all17 actual post-apply documents and repeats idle-parser/checkpoint guards.
Its19:48:38 UTC live read-only overlay verifies the actual released worker:
145sources,3corroborated,1self-reference,2Harvest holds,22Anchor holds, zero
gaps/unconfirmed/public writes/paid sources. This is a local overlay, not live
acceptance. Result: `firebase/artifacts/oct17-festival-corroboration/timestamp-correction-dry-run.json`.

Exact plan: `firebase/artifacts/oct17-festival-corroboration/timestamp-correction-reviewed-plan.json`.
SHA256 `b9af6c359a53b001ed8705e24307f6204ed83e3059ffa5c3e0b88905e5723e44`.
After exact approval, `--apply --sha256=<above>` performs one guarded update,
creates a full backup/result, verifies16 unchanged read-set controls, and runs
the real worker read-only without overlay. It cannot silently repin changed data.

The event-integrity-repair skill's exact production-data boundary requires this
new update approval: the previously approved private batch allowed three creates,
not a subsequent fingerprint rewrite. No correction was applied while preparing
this report. No rollback, extra deployment, job reset, replay or paid call occurred.

Kay's and Coats remain held for location proof; Curling's actual first November
session remains unresolved. A fresh regular parse must still be audited separately.
