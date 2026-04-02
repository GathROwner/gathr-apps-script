# Tools

All new internal utilities should live under this folder.

Current tools:

- `recurrence-regression`
  Runs deterministic regression fixtures against the recurrence normalization guardrails in `functions/src/parsing/finalFormatter.ts`.
  Also includes a live wet-run verifier for deployed `processDataset` recurrence cases.
- `duplicate-check-review`
  Holds investigation notes and the proposed branch-first plan for duplicate detection hardening, including recurring special edge cases and safe `uniqueId` usage.
