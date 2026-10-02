# Luna calendar adjudication diagnostic, 2026-10-02

The broad production Luna switch remains off. This work did not deploy, write
Firestore, or change event/gallery payloads. Google Vision's Document Text
Detection API was enabled in the `gathr-migrated` project for this diagnostic;
the live parser does not call it. Eight OCR requests succeeded: the six saved
Cloud Run-style color WebPs and two manually selected contextual crops. The
Google response files are under `artifacts/luna-six-calendars-2026-10-02/photo-0N`.

## What the independent read established

The February Factory poster contains four distinct `Wing Night` cells, including
February 3. The initial Luna high Stage 3 output has only February 10, 17, and
24; a repeat full-band Luna read also omitted February 3. The offline OCR
source ledger finds the four word pairs at separate image coordinates and
anchors the first three to printed date digits; February 3 is absent from
Stage 3. A contextual Luna crop recovered the listing but misread neighboring
content, so it is not an automatic event payload.

The May Hunter poster's full-image and contextual OCR both read
`HEARTFAKERS`. Luna's Stage 3 and the expensive GPT-5.2 fallback both said
`Heartbreakers`; the fallback also borrowed the neighboring deal's 9 PM time
and misclassified the combined band title. The source does not print a start
time for the band performance. The correct OCR spelling is evidence of a name
dispute, not evidence for adding a 9 PM event.

The first repeated-phrase experiment falsely flagged May `Domestic Pitcher`:
it compared literal titles and band indices even though the poster has
Wednesday `Domestic Pitchers` listings and overlapping bands can attach a
correct event to the preceding analysis band. The revised ledger stems the
plural and compares date-anchored OCR occurrences against primary items across
the whole source image. In this six-poster diagnostic it reports only the
February 3 `Wing Night` candidate. This narrow detector needs source review;
zero reported candidates on another poster does not prove completeness.

The ledger reads `fullTextAnnotation` word boxes once, rather than counting
both it and the duplicate `textAnnotations` view. It records SHA-256 hashes of
the original attachment and color WebP, image dimensions, and the source
gallery index. Date assignment uses nearby printed digit boxes, while the
month/year comes from majority primary items and is explicitly **not**
independent proof. It never changes payloads. Run it with:

```powershell
node functions/scripts/luna-ocr-source-ledger.mjs
```

The result is `artifacts/luna-six-calendars-2026-10-02/ocr-source-ledger.json`.
Google OCR is also fallible: it read the February wing price as `7500` in a
contextual crop, and its reading order sometimes mixes adjacent columns.
Individual correct words may have low confidence, so a generic confidence
threshold would have removed the very `Wing Night` clues needed here.

## Parser hardening staged locally

- An inventory listing with no printed start time is now identified as
  `source_start_time_unprinted` and remains in the conflict record. A malformed
  nonempty time still gets `invalid_fields`. Neither becomes an addition.
- Unresolved date headings retain the full raw listing fields and original
  gallery source index for review.
- Audit-only Responses calls reject non-`completed` responses even when
  partial JSON exists. Per-frame outcomes distinguish empty, malformed,
  incomplete, and failed reads. Any empty or malformed frame blocks additions
  from all requested frames.
- The two exact-post source-name mismatch guards now hold the canary for source
  review instead of treating GPT-5.2 as a correctness oracle. Name conflicts
  take priority when a reviewed slot is also missing. This change is
  local and has not been deployed.

`npm run build` passes, and the targeted calendar reconciliation and Luna
safety suites pass 20/20. A local Responses API mock exercised seven calls
across five scenarios: complete inventory admitted one guarded addition;
empty, malformed, and incomplete reads each admitted none. Run it with
`node functions/scripts/luna-inventory-audit-mock.mjs` from `functions`.

The remaining gate for a wider Luna rollout is an unattended source
localization and dispute path that catches the missing February cell and the
May name conflict without adding the OCR's false words or inferred times.
