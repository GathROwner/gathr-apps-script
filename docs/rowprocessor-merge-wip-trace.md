# rowProcessor merge WIP trace

This note records the origin of the current local-only `rowProcessor.ts` merge work in `codex/write-path-consistency`.

## Current local state

As of 2026-04-21, the active local-only merge work is:

- `functions/src/processing/rowProcessor.ts`
- `functions/src/processing/rowProcessor.currentFamilyShapeMerge.test.ts`

The current workspace does **not** contain the earlier Elvis-specific start-time repair test file:

- `functions/src/processing/rowProcessor.startTimeMerge.test.ts` is absent

The current `rowProcessor.ts` diff is narrowed to the `Two Can Dine` / authoritative-current-family-shape merge experiment.

## Source chat

The work came from the long-lived Codex thread:

- thread name: `Build duplicate family scan`
- session id: `019d9d4e-ca0b-7983-9149-0a9a1e2c2cbd`
- session log:
  - `C:\Users\craig\.codex\sessions\2026\04\17\rollout-2026-04-17T18-17-59-019d9d4e-ca0b-7983-9149-0a9a1e2c2cbd.jsonl`

That chat had multiple phases:

1. duplicate-family discovery tooling
2. Elvis start-time merge repair
3. `Two Can Dine` authoritative-current-family-shape merge work
4. later venue-sweep manual cleanup only

The same chat was later explicitly redirected away from parser/write-path work on 2026-04-19:

- see session log lines around `4571`
- user instruction included: `Do not do parser/write-path work`

## Current diff mapping

The current dirty `rowProcessor.ts` hunks map to the `Two Can Dine` phase, not to the later venue-sweep phase.

### Hunk A: merge hook in `buildDuplicateEventUpdates()`

Current local lines:

- `functions/src/processing/rowProcessor.ts:2113`

Behavior:

- calls `shouldPromoteAuthoritativeCurrentFamilyShape(existing, incoming)`
- if true, promotes:
  - `eventName`
  - `name`
  - `description`
  - `startDate`
  - `endDate`

Origin:

- this is the `Two Can Dine` keeper-shape preservation hook from the later April 18 work in the `Build duplicate family scan` thread

### Hunk B: authoritative-current-family-shape helpers

Current local lines:

- `functions/src/processing/rowProcessor.ts:2919`
- `functions/src/processing/rowProcessor.ts:3009`

Helpers currently present:

- `AUTHORITATIVE_FAMILY_SHAPE_STOP_WORDS`
- `getAuthoritativeFamilyTitleTokens(...)`
- `isOrderedTokenSubsequence(...)`
- `hasTightAuthoritativeFamilyTitleMatch(...)`
- `getDuplicateMergeContentBucket(...)`
- `sourceTimestampIsNotOlder(...)`
- `shouldPromoteAuthoritativeCurrentFamilyShape(...)`

Origin:

- same April 18 `Two Can Dine` phase in the `Build duplicate family scan` thread
- this logic was added to preserve a newer canonical family shape when the incoming doc represented the same family but a more authoritative current form

### Companion test file

Current local file:

- `functions/src/processing/rowProcessor.currentFamilyShapeMerge.test.ts`

Origin:

- same `Two Can Dine` phase
- positive case covers a newer `Two Can Dine` family shape replacing the older recurring keeper shape
- negative cases cover:
  - similar but different family
  - older incoming family shape

## What is no longer in the current workspace diff

The earlier Elvis start-time repair experiment was part of the same long-lived chat, but it is **not** part of the current narrowed `rowProcessor.ts` diff.

That earlier phase added:

- `LEGACY_START_TIME_REPAIR_MAX_DELTA_MINUTES`
- `hasStructuredStartTimeProvenance(...)`
- `hasExactStartTimeRepairFamilyMatch(...)`
- `hasSmallLegacyStartTimeDelta(...)`
- `shouldReplaceLegacyStartTimeWithoutProvenance(...)`
- the start-time repair branch inside `shouldReplaceTimeField(...)`
- `functions/src/processing/rowProcessor.startTimeMerge.test.ts`

Those were present earlier in the same session log during the Elvis phase, but they are not in the current local `rowProcessor.ts` diff now.

## Practical interpretation

The current dirtiness in `rowProcessor.ts` is best understood as:

- an uncommitted local `Two Can Dine` merge-preservation experiment
- not a venue-sweep artifact
- not from the current tracing chat
- not the earlier Elvis start-time repair branch anymore

## Handling note

If this patch is resumed later, treat it as:

- local-only
- not part of the current live baseline
- something that should be validated in isolation before any deploy

If this patch is accepted later, `rowProcessor.currentFamilyShapeMerge.test.ts` should be committed with it as the matching regression coverage.
