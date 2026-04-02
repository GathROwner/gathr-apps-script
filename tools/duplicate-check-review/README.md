# Duplicate Check Review

This folder holds investigation notes for the next duplicate-check branch.

The current recurrence work is already live. This note is intentionally separate so the duplicate work can start later on a fresh branch after recurrence stability is confirmed.

## Current Findings

### Red Shores `Meal & Deal`

Live Firestore shows multiple records for the same recurring Thursday special:

- `venues/fb_100052606604879/events/lSfFgJA9xmqrQgheT02N`
- `venues/fb_100052606604879/events/PurWRNYAqFwUImRvp197`
- `venues/fb_100052606604879/events/MkMtQUrrOPpBGTl2emcG`

The first two are the clearest duplicate pair:

- same `uniqueId`: `1614826196947585_3`
- same `startDate`: `2026-03-26`
- same `startTime/endTime`: `11:00-21:00`
- same `recurringPattern`: `weekly_thursday`
- almost identical description

The third doc is the same recurring family with a different base anchor date:

- `MkMtQUrrOPpBGTl2emcG`
- `startDate`: `2026-02-26`
- same Thursday recurrence and same time window
- richer title and description

There is also a lower-confidence related doc:

- `venues/fb_100052606604879/events/U6CYUMAbXOuHAohpAAv2`
- same broad concept, but `18:00-21:00` instead of `11:00-21:00`
- should not be auto-merged without stronger evidence

### Greco Pizza `Ultimate Hockey Night Meal Deal`

Live Firestore shows at least one same-source duplicate pair:

- `venues/slug_grecopizzasherwood/events/FTo21ImdVT5RgDbq9KIY`
- `venues/slug_grecopizzasherwood/events/yOUfIfULvXAZyhKy1LsE`

Both share:

- same `uniqueId`: `1430325735555816_1`
- same `startDate`
- same `startTime/endTime`
- same description

## Why They Slipped Through

### 1. Duplicate lookup only checks the exact incoming `startDate`

Current duplicate lookup in `functions/src/services/firestoreService.ts` loads Firestore candidates with:

- `startDate: event.startDate`
- `endDate: event.startDate`

That means recurring reposts with a shifted base anchor date are never even compared.

### 2. Matcher hard-requires exact `startDate`

`functions/src/utils/similarity.ts` exits early if:

- `newData.startDate !== existingData.startDate`

So even semantically identical recurring specials are rejected when the base occurrence moved.

### 3. `uniqueId` is generated but not used as a dedupe signal

`rowProcessor.ts` generates per-item `uniqueId` values such as:

- `${row.uniqueId}_${item._pipelineIndex}`

This is good because it prevents one post from collapsing all extracted items into one ID.

But `checkDuplicate()` does not currently use `uniqueId` at all.

That is why the Red Shores same-source pair can coexist even though the IDs match exactly.

### 4. Name-first matching is too strict for recurring specials

The current matcher still misses cases like:

- `Thursday - Meal & Deal`
- `Meal & Deal`

even when time, recurrence, and description are effectively the same.

## Important Constraint About `uniqueId`

`uniqueId` should **not** become the only duplicate key.

Reason:

- it is derived from the source row/post plus a per-item pipeline index
- one source post can legitimately produce multiple different events
- the same post can mention multiple sub-venue events on the same day
- the same post can mention multiple items across the week or month

So the safe rule is:

- treat `uniqueId` as a **strong same-source signal**
- do not treat it as universal proof that every matching row/post item must collapse

In practice, that means `uniqueId` should be used as a high-priority gate, but still checked together with event shape.

## Suggested Fix Shape

### Phase 1: exact-source idempotency

Add a fast path in `checkDuplicate()`:

- if `uniqueId` matches
- and venue matches
- and date/time shape is compatible

then treat as a duplicate immediately.

Compatibility should still protect against accidental collapse of distinct items from the same post:

- same `startDate`, or same recurring family
- same `startTime/endTime`, or both lack times
- same event type when present

This catches the obvious same-source rerun case without making `uniqueId` the sole key.

### Phase 2: recurring-family fallback

For recurring-like items only:

- if the exact-date lookup misses
- fetch a small candidate set of same-venue recurring docs
- compare same recurrence pattern
- compare same time window
- compare title/description token overlap

This is what catches:

- reposted weekly specials
- shifted recurring anchor dates
- same special with slightly different titles

### Phase 3: keep time-drift protection

Do not auto-merge when the time window changes materially.

Examples like:

- `11:00-21:00`
- `18:00-21:00`

should remain outside automatic collapse unless there is much stronger evidence.

## Local-Only Prototype Result

The local investigation artifact is:

- `functions/tmp/duplicate-review-redshores-greco-2026-04-02.json`

That prototype showed:

- current matcher misses the Red Shores same-source pair
- current matcher misses the Red Shores shifted-anchor recurring pair
- current matcher already catches the Greco pair
- a safe two-layer approach would catch the Red Shores duplicates
- that same approach would still avoid auto-merging the lower-confidence Red Shores time-drift case

## Recommended Branch Plan

When recurrence stability is confirmed and a new branch is created:

1. Add `uniqueId`-aware same-source checks to `checkDuplicate()`
2. Add a recurring-family fallback candidate pass for recurring items
3. Add regression fixtures for:
   - Red Shores same-source same-`uniqueId` pair
   - Red Shores shifted-anchor recurring pair
   - Greco same-source pair
   - a negative case like the Red Shores time-drift variant
4. Run local-only verification first
5. Wet-test against a small known set before any production deploy

## Status

No duplicate-check source code changes were implemented from this note.

This document is a design record only, intended for the future duplicate branch.
