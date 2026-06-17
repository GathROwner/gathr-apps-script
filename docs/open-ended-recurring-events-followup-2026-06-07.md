# Open-Ended Recurring Events Follow-Up

Date: 2026-06-07

## Context

During Firestore stale recurring event cleanup, several lifecycle-less recurring docs were reviewed where the source clearly describes a recurring or standing event, but does not provide a reliable end date.

These are not the same as parser mistakes where a one-off event became weekly. They are valid open-ended recurring items, such as standing food specials, weekly draws, recurring classes, and venue programs.

Examples from the June 7 cleanup pass:

- Red Shores / O'Brien's 3 Course Menu Special
- Landmark Thursday $25 2-course lunch
- PEI Humane Society Gold Rush weekly draws
- Buenos Island Studio Sass Class and Movin and Groovin
- Credit Union Place FitStop class
- Charlottetown Yoga Space Carrie yoga class

## Why This Matters

These are the kind of events the freshness wait from `lastSeenAt` was meant to handle. The user intent was described during cleanup as a 30-day wait. On 2026-06-07, `functions/src/triggers/scheduledCleanup.ts` was updated so scheduled cleanup uses `staleRecurringDays: 30` instead of the previous 90-day setting.

If a recurring event has no `recurrenceUntilDate`, the app should not assume it is valid forever. But it also should not disappear immediately just because the source post did not include an end date. The current stale cleanup approach uses source freshness as the practical lifecycle signal: keep it while it has been seen recently, then suppress or remove it after the grace window expires.

## Follow-Up Question

At some point, review how the app and backend should treat open-ended recurring docs:

- Should open-ended recurring docs be shown only while `lastSeenAt` is within the freshness window?
- Should that freshness window remain 30 days for every open-ended recurring event, or eventually become configurable by event/source type?
- Should the app hide these automatically after the freshness window without a fresh sighting, even if the backend cleanup has not removed them yet?
- Should the backend write a lifecycle/suppression field when an open-ended recurring event ages out, instead of relying only on deletion?
- Should the app distinguish "standing recurring special/class" from "dated event series" in the UI or sort logic?
- Should parser output explicitly tag these as open-ended recurring so cleanup can handle them separately from malformed lifecycle-less docs?

## Current Cleanup Rule Of Thumb

- Do not invent a `recurrenceUntilDate` when the source does not show an end date.
- Do not mark these non-recurring if the source clearly says every week, every Thursday, Saturdays, weekly draws, or similar.
- Keep them as recurring while recently seen.
- Let the 30-day `lastSeenAt` grace window decide when they become stale, unless the source later provides an explicit end date.
