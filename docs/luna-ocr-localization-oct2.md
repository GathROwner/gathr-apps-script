# Local OCR date anchors: saved-calendar diagnostic

2026-10-02. No new OCR/model calls, Firestore writes, uploads, deploys, or
parser payload changes. This is an offline experiment on the already frozen
phone-poster fixtures. Production Luna routing remains off.

`calendarSourceLocalization.ts` finds **candidate** date digits in Google
`fullTextAnnotation` word polygons. It accepts a local row only when at least
three consecutive digits progress left-to-right and at least two have a
roughly aligned `+7` counterpart in another row. Identical OCR duplicates
are folded; different digits at the same position remain conflicting. A
standalone price numeral preceded by `$` in the same OCR paragraph is excluded.
The method does not impose a seven-column grid on the whole poster.
The price check only covers that exact adjacent-token form. The first review
found two bugs: uncertain date positions could be assigned to a neighboring
supported cell, and week rows could corroborate dates in reverse order. Both
now have regression tests; conflicting digits block region expansion, and
`+7` labels must lie below their preceding week.

For an OCR phrase, the test associates its midpoint with a supported date
label below it only when exactly one candidate region contains the point.
The region is a geometric association aid, **not an observed cell boundary**.
Unmatched source readings, extra primary readings, and unresolved source
readings stay separate. A one-to-one comparison includes original gallery
index and date, so equal aggregate counts cannot hide a wrong date.

| Saved source | Source localization | Comparison with Luna Stage 3 |
| --- | --- | --- |
| Factory February | Four distinct `Wing Night` word pairs associated with printed days 3, 10, 17, 24 | Original 48-item run lacks February 3; 49-item equal-band repeat matches all four. |
| Hunter May | OCR `HEARTFAKERS` associated with printed day 30 | Luna's untimed Stage 3 title reads `HEARTBREAKERS`; source-name dispute remains for review. No time assigned to the band. |

The May name comparison was recomputed from the exact `equal-bands-r1` Stage 3
run and saved OCR image, then checked against the localized day. A full May
listing-coverage reconciliation was **not performed**; the selected name
phrase is not a complete source inventory.

On February, the taco-price `3` and decorative `28` were not supported as
date anchors. Six OCR digit readings at three conflicting positions were
preserved as conflicts, including `26/25` and `28/25`. The localizer supports
20 date labels on that poster, not every printed date. Across the six saved
photos, it supports 20–28 anchors per photo and leaves the others unresolved
or conflicting. Direct inspection of the original February and May photos
confirmed the two targeted source associations.

The runner checks the saved preprocessed image SHA-256 and dimensions against
the earlier source ledger. It uses `2026-02` and `2026-05` as reviewed fixture
assumptions from poster text and weekday alignment; no source posts were
recovered for these self-taken photos. The OCR geometry alone does not
establish the year. The two phrases
were deliberately selected for this diagnostic. **This is not a blind,
general listing-discovery test**, and a zero-dispute result is not publication
clearance. Fixed pixel thresholds assume this 2880×3840 image scale; halving
otherwise identical synthetic geometry failed the anchor rule. Word-midpoint
association needs
fresh-gallery validation, especially for stacked cells, nonuniform layouts,
later carousel images, and text crossing candidate boundaries.

After `npm run build` in `functions`, run:

```powershell
node --test lib/parsing/calendarSourceLocalization.test.js
node scripts/luna-ocr-localization-offline.mjs
```

The six focused tests cover price digits, conflicting/duplicate OCR reads,
unsupported geometry, an equal-total wrong-date plus cross-gallery case,
conflicting-cell barriers, and reversed week order.
The machine-readable result is
`artifacts/luna-six-calendars-2026-10-02/ocr-localization-offline.json`.

Next: test a newly recovered, unscored source gallery without hand-picking
the missing phrase. Preserve uncertain associations for review and verify
the complete dry-write path before any production switch.
