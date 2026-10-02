# Saved-image OCR name dispute diagnostic

2026-10-02. This is a zero-provider-call test on the six already scored phone
calendars, not a live parser route. The `gathr-migrated` Vision API had been
enabled for the earlier OCR diagnostic; this run reused its saved responses.
It made no Firestore writes, uploads, deployment, or event changes.

The new pure function in `calendarNameDisputes.ts` compares a Luna Stage 3
title with OCR words inside the title's analysis-frame region on the **same
original gallery image**. It requires at least two other shared title words
before flagging one similar but differing word. It returns the raw model/OCR
words, OCR polygon and confidence, frame and gallery indexes. It never chooses
a spelling or invents a start time. The runner verifies the saved color WebP
SHA-256 and OCR dimensions against the earlier source ledger.

The diagnostic scanned seven saved results across the six photos. It flagged
one disagreement: May 30, Luna `HEARTBREAKERS` versus OCR `HEARTFAKERS`,
anchored by `THE`, `Tom`, `Petty`, and `Tribute` in the same source band. Direct
inspection of the original photo confirms **THE HEARTFAKERS**. The poster
does not print a time for this performance; the adjacent 9 PM is for a food
deal. There were no other name flags. That is an observed result on this small
set, not a false-positive-rate estimate or a proof that other names are right.

The February 3 Wing Night omission is a separate **coverage** dispute found
by the existing repeated-phrase source ledger. This name comparator does not
detect it. The original February Stage 3 has three Wing Night dates, while
the repeat/equal-band output has four. No dated event was added by this test.

Run after `npm run build` in `functions`:

```powershell
node scripts/luna-spatial-name-dispute-diagnostic.mjs
```

Saved result:
`artifacts/luna-six-calendars-2026-10-02/spatial-name-dispute-diagnostic.json`.

Important limit: matching is within a band, not a proven calendar cell. A
same-name recurrence elsewhere in that band could create a misleading
association. It also requires a similar word and two anchors, so unique OCR
text, severe transcription errors, and wholly missed listings can go
unreported. A zero-dispute result must **never** be treated as publication
clearance. The next gate is source-cell/date localization and an unattended
coverage check on a genuinely new gallery, with uncertain evidence held for
review. Keep the broad Luna switch off until that gate is demonstrated.
