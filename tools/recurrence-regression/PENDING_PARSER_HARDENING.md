# Pending Parser Hardening

These items were cleaned in live Firestore, but the wet-run/parser behavior was not fully corrected yet. Keep this note until a future parse proves they are no longer recurring operationally.

## Open Items

- `The Fox & Crow` `Late Night Study`
  The parser now preserves the explicit `12:00 AM` end time, but the live rerun still kept the one-off `endDate` on the same calendar day. Live data was patched to roll the end date to the next day (`2026-04-15`).
  If this repeats, harden the post-parse date correction so explicit midnight end times automatically advance the end date for one-off events.

- `95.1 FM CFCY` `Country Top 40 with Fitz`
  Weekly schedule rows such as `SATURDAYS 2-6` and `SUNDAYS 12-4` still produced unstable live keeper shapes on rerun. The active live docs were patched to the correct same-day windows, but the source family still has old duplicate variants and the parser/write path remains too loose for these bare weekday-range broadcast posts.
  If this comes back, inspect the explicit time-range recovery and same-family merge rules before doing another cleanup.

- `The Club | Sydney NS` weekly schedule board
  The mixed weekly board row (`Trivia`, `Cold stream bucket special`, `Dan McCarthy`, `Open Mic`) still produced inconsistent keeper behavior:
  - a stale `Cold stream bucket special` doc with the wrong base span
  - a malformed `Open-Mic` doc with the wrong end date
  Better live docs existed and the bad keepers were removed, but the row remains a good hardening case for multi-program weekly posters with several sibling recurring items.

- `Harbourfront Theatre` `The Comic Strippers` image retention / promotion
  The current live keeper can carry a clearly wrong canonical image even when the parsed text is correct for the event. In the Apr 1 and Apr 2 source rows, the OCR/text is explicitly for `The Comic Strippers`, but the preserved `mediaUrls` are unrelated Harbourfront assets (for example, a Barra MacNeils poster).
  A merge-side promotion hardening was deployed so a newer duplicate post with a different managed image can now replace the canonical image even when description/time do not materially change. That closes one gap.
  The remaining upstream gap is media preservation: this case suggests the correct poster text can survive into OCR while the retained display URLs are still wrong. If this repeats, inspect the parser image handoff, not just duplicate merge.
  A separate cleanup task remains for data hygiene: once canonical image promotion works, old unrelated managed images can still remain in `mediaUrls`. That does not affect the app if it uses the canonical image fields, but it is worth pruning in a future cleanup/hardening pass so image-selection bugs cannot resurface from stale extra media.
  Artifact: [harbourfront-comic-strippers-apr1-rerun-venue-review-2026-04-06T16-39-40-585Z.json](C:/Users/craig/Dev/gathr-apps-script/tools/venue-review/results/harbourfront-comic-strippers-apr1-rerun-venue-review-2026-04-06T16-39-40-585Z.json)

- `Summerside Waterfront Cafe & Training Center` rotating weekly specials menu replacement
  The current menu-image case study behaved correctly enough for now: after a full venue reset and rerun, Waterfront came back with `10` clean weekday recurring specials instead of dozens of stale duplicates.
  The likely future issue is replacement, not extraction. If next week's menu changes item names, the parser will probably create new weekday recurring docs while the old recurring docs linger, because there is not yet a `this week's menu replaced last week's menu` retirement rule.
  Current observed behavior:
  - Monday-Friday pairs were modeled as recurring weekly specials
  - `Chef's Choice Saturday & Sunday` was dropped, which is acceptable for now because it lacked a valid price
  Do not implement a replacement rule yet. First watch the next real weekly menu update and confirm whether stale weekday recurring specials accumulate.
  Candidate future approach if this becomes a repeated issue:
  - detect full menu-family replacement posts for the same venue
  - retire prior weekday-special docs in that family when a new weekly menu lands
  Artifact: [waterfront-menu-case-study-report-2026-04-06.json](C:/Users/craig/Dev/gathr-apps-script/tools/recurrence-regression/results/waterfront-menu-case-study-report-2026-04-06.json)

- `PonyBoat Social Club` `Pop Punk Dance Party`
  The row is an explicit dated overnight one-off (`Friday, April 4 • 11pm–2am`), but Stage 5 still came back as `weekly_friday` during live wet reruns.
  Live doc was patched to one-off on April 5, 2026.
  Artifact: [pony-pop-punk-postfix-2026-04-05T17-29-21-273Z.json](C:/Users/craig/Dev/gathr-apps-script/tools/recurrence-regression/results/pony-pop-punk-postfix-2026-04-05T17-29-21-273Z.json)

- `Red Shores` `Barry O'Brien`
  The monthly entertainment calendar row partially improved on rerun, but the Barry entry still landed with the wrong date span and required a live patch.
  This likely needs stronger handling for multi-performer calendar posters that mix `Friday & Saturday evenings` series language with specific dated performer rows.
  Artifact: [apr5-remaining-four-wet-rerun-2026-04-05T17-21-12-566Z.json](C:/Users/craig/Dev/gathr-apps-script/tools/recurrence-regression/results/apr5-remaining-four-wet-rerun-2026-04-05T17-21-12-566Z.json)

## Context

- Apr 5 final integrity scan was clean after live cleanup:
  [tmp_recurrence_integrity_report_2026-04-05.json](C:/Users/craig/Dev/gathr-apps-script/firebase/tmp_recurrence_integrity_report_2026-04-05.json)
- The goal is not to reopen this immediately.
- Revisit only if future daily parses recreate the same shapes.

## Suggested Next Check

If tomorrow's parse or a later parse shows similar issues again:

1. rerun the exact source row through `processDataset` with `parserMode: full5stage`
2. compare the latest `parse_snapshots` output to the live Firestore doc
3. add a deterministic fixture before changing `finalFormatter.ts`
