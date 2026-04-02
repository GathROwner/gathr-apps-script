# File `12DvqvGpvHToTqW1v9MRP70wzhhOydEQE` Recurrence Audit Summary

Source audit JSON:
- `tools/recurrence-regression/results/12DvqvGpvHToTqW1v9MRP70wzhhOydEQE-bucketed-recurrence-audit-2026-04-02T18-45-43-448Z.json`

## Topline

- `201` rows had usable final snapshots for comparison.
- `19` recurring families were correctly collapsed in the finished parse output and showed no family-level divergence in Firestore.
- `18` recurring-looking families still stayed split in the finished parse output.
- Raw snapshot-vs-Firestore divergence was `184` families, but that is too noisy to use directly for recurrence decisions.
- Narrowing to recurrence-related divergence gives `53` families.
- `4` divergence families were touched after the batch by manual wet-run work and should be excluded from parse-behavior conclusions.

## Bucket 1: Correctly Collapsed

The current recurrence work is clearly taking effect in some areas. Clean collapsed families include:

- row `1`: `Wednesday Night Wing Night (Dine In) - Breaded wings`
- row `31`: `Easter Turkey Dinner Special (with choice of pie)`
- row `78`: `Friday Special: 3 Course Menu Special`
- row `78`: `Monday Special: 2 for 1 Fish & Chips`
- row `94`: `Gold Rush Draw`
- row `180`: `All Day Special - Mexi Fries`
- row `180`: `Burger Love Entry - Barnyard Boss`
- row `180`: multiple `GnG Fresh Fridge` items
- row `210`: `Spring 2 Swimming Lessons Registration Opens`
- row `242`: `Karaoke Night`
- row `279`: `Good Friday Open Hours`
- row `279`: `Easter Monday Open Hours`
- row `319`: `Friday Special - 3 Course Menu Special`
- row `319`: `Monday Special - 2 for 1 Fish & Chips`
- row `353`: `Pop Punk Dance Party`

The strongest concentration of clean collapsed output was:

- `slug_tipsyfarmers`: `7` families
- `fb_100052606604879`: `4` families

## Bucket 2: Recurring-Looking Groups Still Split

This is the real miss bucket for the finished parse.

- `18` split families remained.
- They are concentrated entirely in two venues:
  - `name_6387om`: `9`
  - `slug_soulfitpei`: `9`

Rows and families:

- row `349`
  - `Loose Watercolour Course (with Dave Wilson)` stayed as `3` one-offs on `2026-04-06`, `2026-04-13`, `2026-04-20`
- row `350`
  - `Loose Watercolour w/ Dave (Session 1 of 3)` stayed split across `3` dates
  - `Adult Beginner Drawing (Session 2 of 6)` stayed split across `4` dates
  - `Kids Beginner Acrylic Painting (Session 1 of 4)` stayed split across `3` dates
  - `Adult Beginner Acrylic Painting (Session 3 of 4)` stayed split across `2` dates
- row `351`
  - `Adult Beginner Drawing` stayed split across `5` dates
  - `Adult Watercolour w/ Dave Wilson` stayed split across `3` dates
  - `Kids Beginner Acrylic Painting` stayed split across `3` dates
  - `Adult Beginner Acrylic Painting` stayed split across `3` dates
- row `356`
  - `SoulCave Box Fit` stayed split across `5` dates
  - `Rebound Fit` stayed split across `4` dates
  - `Reiki treatments` stayed split twice across `2` dates
- row `357`
  - another `SoulCave Box Fit` split family
  - another `Rebound Fit` split family
  - another `SoulCave Box Fit` split family
  - two more `Reiki treatments` split families

Interpretation:

- The remaining split misses are not spread randomly across the file.
- They are clustered in a few multi-class posters.
- In many of these rows, Stage 5 no longer retains enough explicit date-list or weekday evidence to safely infer recurrence, which means this now looks more like an upstream extraction/evidence-preservation problem than just another narrow Stage 5 collapse rule.

## Bucket 3: Snapshot Output vs Firestore Write Divergence

Raw divergence across all families was `184`, but most of that is not directly useful for recurrence work.

When narrowed to recurrence-related cases, the counts are:

- `53` recurrence-related divergence families
- `20` `missing_in_firestore`
- `20` `time_set_mismatch`
- `7` `recurring_pattern_mismatch`
- `5` `recurrence_shape_mismatch`
- `6` `doc_count_mismatch`
- `1` `snapshot_split_but_firestore_collapsed`

Representative examples:

- row `1`
  - `Wednesday Night Wing Night (Dine In) - Boneless & Plain wings`
  - present in snapshot as `weekly_wednesday`
  - missing in Firestore
- row `94`
  - `Future Elites: Mark Arendz`
  - present in snapshot as `weekly_friday`
  - missing in Firestore
- row `2`
  - `PEI Burger Love 2026`
  - snapshot time `11:30|21:00`
  - Firestore time `11:00|21:00`
- row `24`
  - `Value Menu / $15 Menu`
  - snapshot time `11:30|21:00`
  - Firestore time `11:00|21:00`
- row `119`
  - `$1 from each burger sold supports Anderson House`
  - snapshot shaped as one-off with long date span
  - Firestore stored as recurring-like with `isRecurring=true` and `recurrenceUntilDate`

## Post-Batch Touched Families

The following should not be treated as evidence of the finished parse behavior because they were modified during later wet-run work:

- row `349`: `Adult Drawing for Beginners`
- row `349`: `Cocktails & Crafts`
- row `349`: `Easter Needle Felting Workshop`
- row `349`: `Loose Watercolour Course (with Dave Wilson)`

## Practical Read

- The recurrence fixes are clearly working for a meaningful set of recurring specials and recurring schedules.
- The remaining split-series misses are highly clustered and likely need deeper evidence preservation from earlier parse stages, not just another small Stage 5 heuristic.
- The write-layer still shows a separate class of issues, especially small time normalization drift and some snapshot-to-Firestore family mismatches.
