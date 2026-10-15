# L'Autre: restore the venue's dated programme poster

**COMPLETE: approved, applied and independently verified.** Craig approved the
exact reviewed restoration. Fresh source/audit/record/sibling/marker guards
matched; one atomic transaction applied at21:00UTC on October15.

- Full prewrite backup: `functions/artifacts/oct15-sequential-repairs/lautre/prewrite-2026-10-15T21-00-35-897Z.json`.
- Result: matching `applied-2026-10-15T21-00-35-897Z.json`.
- Read-only `independent-verification.json` passed at21:01UTC: exact delta,
  47 untouched references, unchanged sibling membership, both detail routes200,
  once in the complete993-event/10-page active feed, all11 gallery entries
  unchanged, all12 managed images200, exact restored poster bytes and marker262.
  No duplicate, media write/delete, source-array change or deployment.

This followed the verified Indigo category correction.

## Confirmed cause and source

Target: `venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo`,
**L'Autre (The Other), October16,20:00,The Tivoli Cinema**.

The October14 owner update from source `122232548528578108` selected a specific
programme poster. It explicitly prints Friday October16, L'Autre at8:00PM.
The coordinator downloaded and visually inspected that poster and the current
generic image. The October15 Downtown Charlottetown roundup overwrote the
programme poster with a generic “What's Happening?” scarecrow image.

Exact source/audit chain:

- Owner snapshot `parse_snapshots/11-wPIfOUWmVwQqpUGUQ3LF36BFDPWuOC_130_1791982660183`.
- Owner update `event_update_audits/xukMh49zSoikIwFa8PAT` selected the poster.
- Overwrite `event_update_audits/MegyqblVmVi8qMPi8Tfz` records the same canonical
  title/date/time, old owner poster and replacement generic image.
- Restorable managed poster:
  `https://storage.googleapis.com/gathr-uploaded-images/postimages/1791982587266-8cbjb2.webp`.

The poster remains in the eleven-image stored gallery and returns200. No
upload, image deletion, reparse or duplicate event is needed. Current title,
date/clocks, cinema category, venue, source arrays and description are outside
this repair. The film's existing description/director-source inconsistency and
inferred finish are not silently changed by a poster repair.

## Exact proposed delta

On the target only, set `image`, `imageUrl` and `relevantImageUrl` to the
source-verified poster. Update `imageProvenance` to designate that image as
non-fallback post media, record the manual restoration/audit reason and remove
the overwrite's stale selection timestamp. Retain the remaining provenance
entries and the complete `mediaUrls` array in its current order. No venue,
icon, source-array or event-identity changes. Root `updatedAt` is server-set.

Second exact target: `runtime_metadata/event_feed`, version **261 -> 262**
and server `updatedAt` only, in the same atomic transaction.

Fresh backup/plan pin target, venue, owner source, both audits, feed marker,
44 related event documents and the reviewed poster bytes:

- `functions/artifacts/oct15-sequential-repairs/lautre/plan-2026-10-15T20-57-37-424Z.json`
- `functions/artifacts/oct15-sequential-repairs/lautre/backup-2026-10-15T20-57-37-424Z.json`

Default-dry helper: `firebase/repair-lautre-poster-oct15.mjs`.
Independent read-only verifier: `firebase/verify-lautre-poster-oct15-readonly.mjs`.
Any target/source/audit/sibling/media/marker/version drift must abort. Fresh
prewrite backup and idle-parser checks precede the exact approved transaction.

## Prevention and validation

Owner-media protection is already included in the deployed October15 parser
hardening. Five existing owner-media/provenance tests pass. Actual saved
overwrite input replayed offline against the proposed restored live keeper
does not change any of six protected image/gallery/provenance/icon fields.
`actual-merge-playback.json` records this local result: zero network, paid model
or live writes. It is not a new production-run quality claim or source backfill.

Both repair/verifier syntax checks pass. Static inspection of the current iOS
Preview confirms the API image becomes the gallery hero and the complete source
gallery follows in order; no frontend release is required for this data repair.

After exact approval/apply, independently check the complete exact two-document
delta and all untouched references, unchanged sibling membership, both API
detail variants, once-only active-feed occurrence, unchanged eleven-image
gallery, all managed images including the generic image still200, exact poster
bytes and marker262. No automatic festival links or source-array changes.
