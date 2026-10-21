# Soft Internet Theory timing trace — October 21, 2026

Latest status: the label-only option below was superseded by Craig's selected-weekday instruction and subsequent minimum-functional-fix authorization. Source-explicit consumer candidate `add2c0d` is implemented/tested/exported for publiciOS79/Production/runtime1.1.20. Exact event repair remains dry-run only and Production approval/independent review are pending. See the superseding checkpoint in `visiting-hours-oct21-implementation-plan.md`; original diagnosis/evidence below remains unchanged.

## Exact identity and current state

Parent visually identified the screenshot; this Windows task did not inspect its pixels. Exact canonical record: `venues/slug_ccoagallery/events/XDJ0vlTopBBg3rEibyOj`, SOFT INTERNET THEORY, Confederation Centre Art Gallery, 145 Richmond Street, Charlottetown.

Fresh exact Firestore read: updateTime `2026-10-15T23:38:14.146878Z`. Dates October 3, 2026–January 24, 2027; both legacy clocks blank; isRecurring No / recurringPattern none. Timing v2 is multi_day, both endpoints unknown with null clocks, using source_dated_activity_unknown_clock / date-only-activity-v1. timeResolution reason is reviewed_exhibition_date_range. Both source IDs remain 1729449245853296 and 1512241067607930.

Fresh app-compatible detail request with `?dateOnlyActivities=v1` returns HTTP 200 and those same fields and visiting-hours description. A preliminary request without that required capability returns 404, consistent with the older-client compatibility guard; it is not evidence the event is missing. No feed or catalog scan was performed.

Local receipts: `firebase/artifacts/soft-internet-oct21/event-read.json`, `api-detail.json` (without capability), `api-capability-detail.json` (actual app contract), `official-source.html`, `official-source-fetch.json`. Read-only capture helper: `firebase/trace-soft-internet-oct21.cjs`.

## Source and before/after history

`firebase/artifacts/six-groups-oct15/capture.json` retains source row 200 / 1729449245853296 (ccoagallery) and row 338 / 1512241067607930 (ConfedCentre). Both original captions explicitly announce this exhibition now on view and advertise off-season gallery access Tuesday–Saturday 10 a.m.–5 p.m., Sunday 1–5 p.m., closed Monday, admission by donation. These are visitor hours for this exhibition context, not unrelated general building or box-office hours.

The pre-repair canonical record in capture.documents[70] was incorrectly limited to October 14, 10:00–17:00, nonrecurring. The October 15 plan deliberately restored the full exhibition interval, cleared both clocks and retained the weekday hours in the description. Applied receipt `firebase/artifacts/six-groups-oct15/applied-2026-10-15T23-38-00-778Z.json`, appliedAt 2026-10-15T23:38:14.013Z, change 13; feed 266→267. The exact same unknown timing contract remains live today. This predates e92b492 and is not explained by that later end-only safeguard.

The first-party page `https://confederationcentre.com/exhibition/soft-internet-theory/` was freshly fetched HTTP 200. It still prints From October 3, 2026 / Until January 24, 2027 and separately identifies Art Gallery hours Tuesday–Saturday 10–5, Sunday 1–5, Monday closed. It also contains distinct building, box-office and pedway hours; those must not be substituted. Holiday changes remain caveated. This trace checked caption and HTML evidence; no new image/video interpretation is claimed.

Separate October 1 opening records `DkVuLLqIxjIReRGX06cR` and `7YRHUI1zLLMaouW2k65c` were not read or changed; their opening-session clocks must not be overwritten by exhibit access hours.

## Actual UI path and cause

Inspected accepted app checkout `carousel-boundaries/GathR-upgrade-sdk54`, HEAD 0f570dfc349bd812ced6df38242068df04687814 (not a claim of current installed OTA identity).

- `lib/api/firestoreEvents.ts` normalizeFirestoreTiming preserves v2 endpoint/status metadata. Actual detail fetch declares dateOnlyActivities=v1.
- `utils/eventTiming.ts:367` getDateOnlyScheduleRange accepts this exact unknown-clock date-range contract, while rejecting records with actual clocks, all-day/until-close, recurrence or invalid/stale contracts.
- `utils/eventTiming.ts:713` returns Time not provided; badge path around 638 returns TIMES UNKNOWN; disclosure around 765 says no start/end was provided.
- The start-only path around 743 retains Starts/Started when an actual start exists. This event has no start clock in stored/API data to display.

The root cause is the October 15 representation decision: real weekday visiting hours were retained only as descriptive prose, while the structured contract classifies the exhibit as having no clocks. The UI follows that contract. No evidence supports blaming yesterday's hasUnadvertisedCalendarEnd change or a failure to choose among multiple clocks.

## Representation and smallest safe next step

The existing EventTiming type has two endpoints plus optional estimated end/discovery cutoff. It has no weekday visiting-hours intervals or closures. A multi_day or availability_window label alone cannot represent Tuesday–Saturday 10–5, Sunday 1–5 and Monday closure safely.

A small presentation correction can say **See visiting hours** instead of Time not provided and avoid the misleading TIMES UNKNOWN badge, but it needs affirmative source-backed visiting-hours metadata; do not infer it from title, venue category or arbitrary description regex, and do not change every date-only event. Existing timeResolution.reason proves this reviewed exhibition class but does not itself encode the verified weekday schedule. Keep the actual schedule clearly visible in the description and source link. Preserve date-only discovery semantics until weekday eligibility is explicitly implemented.

Before implementing, settle whether this step is only that bounded presentation correction or real per-weekday scheduling. Showing today's hours, opening/closing/Now filters or hiding Mondays requires a versioned source-backed visiting-hours contract carried through parser/API/cache/UI, local weekday/DST handling and exceptions. That is a larger schedule-capability change and should be reviewed explicitly before coding. Do not fake it with one continuous 10–5 clock, mark all day, or generate daily child events without a deliberate design.

Regression requirements: this exact exhibit and source evidence; Tue–Sat 10–5 vs Sun 1–5 vs Monday closed; holiday caveat; original date range/source/media/ID; ordinary unknown-clock date-only events unchanged; start-only events unchanged; explicit ranges/overnight/duration/to-close preserved; any visiting-hours UI metadata survives API normalization/cache. Per-day status/filter tests are required only if that larger behavior is implemented. Existing test files: utils/__tests__/dateOnlyActivity-test.ts, utils/__tests__/eventTiming-test.ts, lib/api/__tests__/dateOnlyCapability-test.ts and component timing summary/badge tests. Parser controls: sourceAuditOct20.test.ts, buenosScheduleTiming.test.ts and ticketApiStartRole.test.ts at e92b492.

No production mutation, tests, code changes, deployment, paid replay, map interaction or unrelated opening-record repair occurred. This is the requested exact-identity/history checkpoint before choosing representation scope.

## Existing-contract investigation and bounded implementation proposal

An additional exact read of `venues/slug_ccoagallery` found `operatingHoursJson` / `operatingHoursParsed` with hoursSource Google Places. They match the Centre's broader building hours (Monday 08:00–18:00, Tuesday–Thursday 08:00–20:30, Friday–Saturday 08:00–18:00, Sunday 08:00–17:00), not the gallery hours advertised in both original captions and the Art Gallery section of the primary page. Thus the existing venue hours must not drive this exhibition. Receipt: `firebase/artifacts/soft-internet-oct21/venue-read.private.json`; contacts were neither printed nor changed. The malformed hoursFetchedAt value is unrelated retained data, not a repair target here.

Existing frontend FirestoreVenue types support operatingHoursJson/Parsed, but normalized Event does not carry those hours, event venueInfo omits them, and no visiting-hours/timing-note-specific contract was found in the inspected timing/event/API surfaces. The current EventTimingPoint already supports free-string sourceType, evidence, sourceUrl and observedAt; API timing is carried as a v2 object and normalization spreads point fields. These existing provenance-note slots can carry an affirmative display note without adding weekday scheduling or altering any clock, recurrence, estimate or eligibility semantics.

**Proposed exact data delta (not applied):** amend only `timing.schedule.start` on `XDJ0vlTopBBg3rEibyOj` with sourceType `reviewed_visiting_hours`, evidence `Tuesday–Saturday 10 a.m.–5 p.m.; Sunday 1–5 p.m.; closed Mondays. Check the gallery for holiday-hour changes.`, sourceUrl `https://confederationcentre.com/exhibition/soft-internet-theory/`, and observedAt from this verified primary-source capture. Retain its localDate/localTime/timeZone/status and every other existing timing field, record field, source/media/history/ID. Before any apply: exact version/body reread, complete typed backup and reviewed delta; advance feed monotonically using its fresh version. No venue-hours update is proposed.

**Proposed frontend predicate (not implemented):** first require a valid `getDateOnlyScheduleRange(event, timing)` result. Then require schedule.start.sourceType exactly `reviewed_visiting_hours`, nonempty bounded evidence, an HTTPS sourceUrl, and a valid observedAt. No title/description/category inference, no broad venue-hours fallback, no event-ID allowlist. This marker is an explicit reviewed display assertion only; it does not prove today's opening status or promise unchanged hours throughout the exhibition.

For that predicate only, return `See visiting hours` from the shared time-range text path; replace TIMES UNKNOWN with a compact VISITING / HOURS informational badge; use the verified evidence plus a holiday-change caveat in the existing timing disclosure. The description/source link already carries the explicit hours. Ordinary unknown-clock date-only contracts keep Time not provided / TIMES UNKNOWN. This is an honest distinction between a known visitor-hours note and unknown session clocks, without repurposing date_range_overview or implying a separate event programme. Never use point.localTime or point.at for this note.

**Target tests before release:**

- `utils/__tests__/dateOnlyActivity-test.ts`: exact captured exhibit through API normalization, affirmative marker/text/badge/disclosure; missing/wrong marker, blank evidence, invalid source/observedAt remain ordinary unknown; supported printed starts/ends must bypass the date-only override; recurrence/all-day/overview/invalidated date-only contracts retain existing guards.
- `utils/__tests__/eventTiming-test.ts`: start-only Starts/Started, explicit end, source-duration, estimates, overnight and until-close controls unchanged; schedule-state/Today/Now/expiry results identical before/after this note.
- `components/common/__tests__/EventTimingSummaryText-test.tsx` and `EventTimingBadge-test.tsx`: visible text/accessibility/information interaction and three weekday/closure statements in disclosure; ordinary unknown badge unchanged.
- `lib/api/__tests__/firestoreTimingFields-test.ts` plus existing date-only cache/normalization fixtures: optional point provenance survives metadata fallback and persistence, no legacy clock is introduced. Capability guard tests remain intact.

Bounded scope is one exact metadata repair plus a shared frontend presentation helper and tests, followed by screenshot review and compatible Preview release checks. Rough effort: one small implementation/review cycle, approximately 1–2 hours including visual and release verification, conditional on the release environment. No backend/parser release, new weekday schema or recurrence architecture is required for this proposal. Automatically displaying daily hours/Now status, holiday overrides or Monday exclusion is explicitly a separate larger scope to review before implementation. No tests were run and no code/data/release changes were made during this investigation.
