# Luna calendar inventory reconciliation: targeted offline replay

2026-10-02. Branch `codex/luna-parser-live-merge`, committed baseline `83b5110`.
This replay made no API calls, Firestore writes, deployments, or production flag changes.

The test feeds short source listings transcribed from the six photographed
calendar fixtures into the **current compiled** `reconcileCalendarInventory`
and `buildGuardedCalendarInventoryAdditions` functions. The primary items are
saved Stage 3 output from the current Luna high dry runs. Run it with:

```powershell
node functions/scripts/luna-six-calendar-reconciliation-offline.mjs
```

| Source discrepancy | Primary Stage 3 | Current reconciliation | Auto addition |
| --- | ---: | --- | --- |
| Photo 06, February 3 Wing Night missing while Taco Tuesday occupies 4 PM | 48 items | `same_slot_different_title` | No |
| Photo 06 repeat, Wing Night present | 49 items | Matched | No |
| Photo 03 repeat, June 6 Bingo and DJ combined; DJ has no printed time | 40 items | Bingo: `same_slot_different_title`; DJ: `source_start_time_unprinted` | No |
| Photo 04, May 30 printed HeartFakers differs from extraction; performance time unprinted | 62 items | `source_start_time_unprinted` | No |

This confirms that a separate listing can be **flagged** even when its date and
time are already occupied by another extracted item. The current rule cannot
automatically add such an item, split a merged title, or compare an untimed
name. Holding these disputes is safer than applying a guessed correction.

This replay does **not** establish that a new blind Luna read will discover the
missing listing, that its name will be accurate, or that the automatic crop
path will include the relevant row. The manually transcribed input is a test
oracle, not production evidence.

## Fresh blind Luna high reads

After CLI sign-in, the existing Secret Manager key was loaded into a single
child process at a time. These calls used the current `auditCalendarInventory`
prompt through Responses with `detail: original`. The prompt was not shown
the missing title or expected spelling. No image uploads or Firestore writes
occurred. Costs use actual reported tokens at the recorded Luna rates.

| Source image | Read | Actual cost | Outcome |
| --- | --- | ---: | --- |
| Photo 06 February, first band | Full band | $0.0039912 | Omitted February 3 Wing Night again. Eleven of twelve output listings had bare numeric date headings the current resolver could not anchor. |
| Photo 03 June, first band | Full band | $0.0029882 | Omitted the visible June 6 Bingo/DJ cell at the bottom edge. Six bare numeric date headings were unresolved; the two Shawn Hogan times lacked AM/PM and were invalid. |
| Photo 03 June, overlapping second band | Full band | $0.0042247 | Exhausted the 8,000 output-token cap without an events array. This is an incomplete read, not a clean inventory. |
| Photo 04 May, third band | Full band | $0.0026965 | Wrong band for the May 30 question; excluded from name assessment. Seven bare dates unresolved. |
| Photo 04 May, fourth band | Full band | $0.0034536 | Included May 30 but still read `Heartbreakers`; all seven bare dates unresolved. |
| Photo 06 February 3 | Contextual cell crop | $0.0028093 | Recovered `75¢ Wing Night` at 4 PM without a name hint, but garbled a neighboring date and Donairs name. Four bare or garbled dates unresolved. |
| Photo 04 May 29–30 | Contextual cell crop | $0.0014722 | Still read `Heartbreakers` and borrowed the neighboring food deal's 9 PM time for the bands. |

Total measured incremental API cost for these seven diagnostic calls:
**$0.0216357**. The May third-band call was a mistaken selection, and the June
second-band call returned no usable inventory. They remain in the cost total
because they were billed. The contextual crops were manually selected by date;
this does not validate automatic source localization.

The current audit's numeric-date resolver and output-token exhaustion are
independent implementation issues. Fixing them will not by itself recover an
item a second Luna read also omits or correct a spelling two reads both change.
No candidate additions were applied. The next design needs source-positioned
dispute detection, a one-to-one listing ledger that permits unprinted times,
and independent text evidence for disputed names. Any unresolved discrepancy
must hold the affected poster rather than replace its primary extraction.

Paid read artifacts are the `inventory-selected-band-*.json` and
`contextual-cell-*-audit.json` files under the relevant photo directories.

The independent Astra review also confirmed that the Photo 04 GPT-5.2 fallback
payload still says `Heartbreakers`, treats the combined band title as a `Food
Special`, and assigns the adjacent deal's 9 PM time. This shows that the
fallback is not a correctness oracle for this fixture. The saved payload is
`artifacts/luna-six-calendars-2026-10-02/photo-04/luna-high-reviewed-oct2-current.json`.

Machine-readable results: `artifacts/luna-six-calendars-2026-10-02/reconciliation-offline-2026-10-02.json`.
