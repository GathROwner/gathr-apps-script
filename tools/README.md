# Tools

All new internal utilities should live under this folder.

Current tools:

- `recurrence-regression`
  Runs deterministic regression fixtures against the recurrence normalization guardrails in `functions/src/parsing/finalFormatter.ts`.
  Also includes explicit-time and holiday-weekend split regressions plus a live wet-run verifier for deployed `processDataset` recurrence cases.
  Contains `PENDING_PARSER_HARDENING.md` for unresolved live parser follow-ups that were cleaned operationally but not fully solved in normalization yet.
  The bucketed audit inside this tool reports parser-snapshot vs Firestore landing mismatches; those are investigation leads and not always direct live app issues.
- `duplicate-check-review`
  Holds investigation notes and the proposed branch-first plan for duplicate detection hardening, including recurring special edge cases and safe `uniqueId` usage.
- `venue-review`
  Reusable venue cleanup and rerun workflow for stale/bad event or special docs. It can discover matching live docs, discover likely source rows from `parse_snapshots`, back up and delete the bad docs, rerun the source rows through live `processDataset`, and write one consolidated report for review.
- `image-mismatch-review`
  Heuristic venue-level review for wrong canonical event images. It flags suspicious docs by looking for shared canonical image reuse across unrelated event families, mismatch between a live canonical image and the latest matching snapshot media set, and title vs snapshot OCR mismatch.
