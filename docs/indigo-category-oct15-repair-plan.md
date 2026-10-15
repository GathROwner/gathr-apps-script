# Indigo Thriller Book Club: exact category repair

Prepared October15 after the user confirmed the corrected audition on iPhone.
**COMPLETE: exactly approved, applied and independently verified.**
Craig approved the reviewed plan with “I approve”. At20:54UTC the transaction
updated the category/internal type and feed marker260->261 only. Fresh prewrite
backup and exact apply evidence are in the same directory:

- `prewrite-2026-10-15T20-54-14-786Z.json`
- `applied-2026-10-15T20-54-14-786Z.json`
- `independent-verification.json`

Independent verification passed exact delta,16 untouched references, unchanged
sibling membership, both default/capable details200, one entry in the complete
active feed(1,004 events/11 pages) and full history feed(1,123/12 pages), no copied
session, both managed images200 and marker261. No deployment or media writes.

The prevention is already serving as part of
October15 hardening (`8a9a03b`, retained by subsequent parser releases). This
plan requires no deployment, parser/model change or reparse.

## Source and current state

Source `1686018636743347`, row312, is Indigo Charlottetown's announcement of
the Thriller Book Club discussion of *No Rest for the Wicked*. The saved
original caption explicitly describes a book discussion. The independently
viewed original managed poster prints **October15,2026,6–7 p.m.,Indigo
Charlottetown**. This is a book discussion, with no music performance evidence.
Live date/clocks, existing venue and original poster are correct.

Exact live target:
`venues/jY4hgzi01XJTh33vzH8j/events/vGzlY5BUkEthCbw9ZITj`.

Change `category: Live Music` to **Gatherings & Parties**, and `eventType:
live_music` to **gatherings_parties**, matching the ordinary parser's category
normalization. Preserve ID/title/description/date/clocks/venue/flags/recurrence/
source/media/social counts and every other event field, apart from `updatedAt`.

Second exact target: `runtime_metadata/event_feed`, version **260 -> 261**
and its server timestamp only, in the same atomic transaction. This lets the
normal app polling notice the category correction.

## Guarded preparation and backup

Default-dry helper: `firebase/repair-indigo-category-oct15.mjs`.
Independent read-only verifier: `firebase/verify-indigo-category-oct15-readonly.mjs`.

Fresh dry run at20:52UTC found no active parser, the exact unchanged target,
source/venue/feed marker and15 related venue/source events. Complete backup and
plan pin document versions, all sibling payloads, exact poster bytes and marker:

- `functions/artifacts/oct15-sequential-repairs/indigo/plan-2026-10-15T20-52-15-647Z.json`
- `functions/artifacts/oct15-sequential-repairs/indigo/backup-2026-10-15T20-52-15-647Z.json`

Both helpers pass syntax checks. Both existing category regressions pass:
Thriller Book Club -> Gatherings & Parties; an actual live-music performance at
a book club retains Live Music. No added API/model calls or synthetic quality
claim. The poster is available and locally reviewed; no upload is needed.

After exact approval, apply only this reviewed plan. Fresh prewrite backup,
transactional idle-parser/source/venue/marker/sibling/version guards must match;
abort on drift. Independently verify exact two-document delta, untouched
references and sibling membership, default/capable detail, complete app feed
and current visibility, no copied session, original/profile images200, and
API feed marker261 after its bounded cache expires. No new event or deletion.

Keep subsequent L'Autre image and other spatial/activity issues separate.
