# Deferred proposal: smaller Stage 4 validation responses

Recorded at Craig's request on October 11, 2026. **Proposal only: no implementation, API tests or deployment authorized by the request to record and explain it.** Stage 4 cache optimization will not proceed.

## Idea in plain language

Stage 3 has already produced an event record containing its title, date, times, venue, description, prices, links and source-image metadata. Today Stage 4 receives that record, decides whether it should pass, and writes the entire record back again alongside its decision and explanations.

Instead, Stage 4 could return a small answer referencing the original item:

```json
{
  "sourceItemIndex": 1,
  "decision": "KEPT",
  "corrections": {},
  "reasonCode": "VALID_DATED_EVENT"
}
```

This is an illustrative future contract, not the current parser schema. The index must uniquely identify an original item within its source post across all batches. Code would retrieve that original record and preserve it. A rejected item would be excluded; a permitted correction would be validated and applied to that specific record. The model still performs the same validation judgment and sees the same evidence.

## Why it might help

- Fewer generated tokens: the model no longer copies long descriptions, URLs and metadata just to say an item is valid.
- Potentially lower cost and faster responses. This requires measurement; no saving or speed percentage is established yet.
- Fewer accidental changes to dates, times, venue, prices, URLs, image attribution and spatial metadata while copying records.
- Explicit decision/reason codes could replace the current fragile search for phrases such as `valid event` inside explanations. This requires its own tested correction, not an automatic change of validation policy.

The October 11 Stage 4 audit measured 80.6% of production Stage 4 cost in output. Complete item objects accounted for about 65% of normalized response JSON characters in the baseline replay. That is not a measured 65% token/cost saving; reasoning and other output would remain. Stage 4's total production cost that day was only about USD 0.039, so whole-parser financial savings would be limited at that volume.

## Conditions for a future experiment

1. Inventory legitimate corrections currently made by Stage 4 before defining a narrow correction whitelist. Preserve intended recurrence and other validated behavior; do not silently remove useful corrections.
2. Keep model, reasoning effort, input evidence, validation rules and batching fixed initially. Isolate the smaller output contract from caching or model experiments.
3. Require exactly one decision per supplied source item, with unique indices belonging to the current post and batch. Check missing, repeated and foreign indices before applying decisions.
4. Preserve original fields unless a specifically allowed, source-supported correction passes validation. Never treat free-form explanation text as authority to override a structured decision.
5. Define and test safe recovery for malformed, incomplete or mismatched responses; do not equate passing through unvalidated raw input with successful validation.
6. Compare current versus compact output over the full frozen cohort and repeat known failure cases. Assess inventory, dates/times, recurrence, prices, venue, links, images, spatial fields, duplicates, errors, reasoning/output tokens, actual total cost and API duration.
7. Proceed to a release recommendation only if quality is preserved and the measured improvement is worthwhile. Existing live records would require separate repair review.

Evidence: [Stage 4 cache-layout audit](luna-stage4-oct11-cache-layout-evaluation.md), baseline audit commit `c05aa8e`. Do not mistake this deferred idea for a production change or a decision to change Nano's reasoning setting.
