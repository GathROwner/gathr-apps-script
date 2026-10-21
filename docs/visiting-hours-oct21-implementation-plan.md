# Visiting hours: parser, API and selected-date app behavior

## Current release checkpoint — October 21, 13:13 UTC

Craig explicitly approved iOS Production/runtime1.1.20 publication with the individually accepted frontend changes held during build79 review. The minimum source-explicit app fix and those exact carry-forwards are now published at `20f046e651cfecd015a20514b29f05c403dd99d0`: group `a25db47f-bc74-4733-bfb8-e7b7002d6661`, iOS update `01a15e97-50ba-7bd2-99cc-52955c8ba393`. Independent combined review passed 141 checks. Thirty relevant suites/266 tests passed before the final explicit-timezone guard; its two focused suites/28 cases passed afterward, including five added cases (271 unique cases overall). TypeScript passes, lint has zero errors/216 warnings. The clean Production export contains 2,476 source-map sources and all37 changed runtime modules with exact source matches; no QA imports ship. The actual delivered manifest's bundle hash equals the reviewed 5,778,088-byte export SHA256 `cb41a160cdce58ece2eb5b3f30a22e307ba0ff20131fbe561fd78b8b93ab7e72`. EAS list/view and fresh runtime1.1.20 Production manifest independently agree. Android and native build configuration/dependencies are unchanged; no new native build. Device adoption is not yet verified.

The exact gallery event repair is **not applied**. A fresh default-dry prewrite check aborted before writes because regular dataset `12JeGpiiUUUPe-fLKJdqOax9-hpfKFuw2`, run `011bd5a6-7d1a-4a2b-ac70-20846d2fc53c`, is active. At13:11UTC the matching batch was processing row116/371 with a checkpoint. Do not stop/replay it or use the old idle snapshot. After natural completion, prove the completed lock/processed marker/final batch and absent matching checkpoint, refresh the exact event/feed/idle plan if needed, and obtain the revised independent data receipt before the existing guarded apply. No old data-review receipt is reused.

Live event `venues/slug_ccoagallery/events/XDJ0vlTopBBg3rEibyOj` remains unchanged, so hours will not appear merely from adopting this OTA. The pending exact delta remains source-backed `timing.visitingHours` plus updatedAt, a fresh monotonic feed version, and complete atomic archives; all other event fields, the gallery venue and both opening sessions stay protected. Production delivery receipt: `functions/artifacts/visiting-hours-oct21/production-release-verification.json`; current state: `completion.json` in the same directory. Data artifacts/helper are in `firebase/artifacts/soft-internet-oct21/` and `firebase/repair-soft-internet-visiting-oct21.cjs`.

Six rendered artifacts were independently inspected, including current actual timing/contact components and unchanged accepted ad/list/hero/version-notice evidence. The complete retained hero artifact was used because its committed comparison image was an incomplete crop. RN Web/layout evidence is not native iOS adoption or native-ad playback proof; the earlier split-portrait native callout observation remains open. Automatic source extraction, Google fallback integration and dated exceptions remain outside this smallest slice. Automatic venue reuse/creation and both minimum-version policies remain OFF; the existing resolver service master switch is intentionally ON and unchanged. Earlier pending-authorization/source-only text below is historical.

## Superseding minimum-slice checkpoint

Craig subsequently authorized the smallest functional fix through the coordinating chat. The broader 2–3 day architecture below is retained as planning history, not the current execution scope. A source-explicit first-case consumer is implemented in isolated app commit `add2c0de924822a6d00771da92f10b5b1c7208f1`, from public iOS79's exact source `6c773c3a13663c950e73438fd7447b613e81ffa8`. It uses optional timing.visitingHours metadata already passed by the API, with exact facility/range/source guards, selected weekday display, closed-day filtering, future-only Now suppression and cache transitions. No parser/API/Google-provider change is needed for the verified gallery case. It does not claim automatic generalized extraction or dated-exception scheduling.

Twelve relevant suites / 117 tests pass, TypeScript passes, lint has zero errors (216 warnings: 215 baseline plus one import-position warning in the existing EventCallout import block). An iOS Production/runtime1.1.20 export passed; all12changed runtime source modules match bundle source-map content and no QA modules ship. Four actual shared RN-component cases were rendered through RN Web and inspected; native iOS appearance/adoption is not proven. Code/review evidence: `functions/artifacts/visiting-hours-oct21/review-ready.json` and `production-export-verification.json`; app implementation note: `C:/Windows/System32/GathR-Project/vh21/docs/visiting-hours-oct21.md`.

Exact metadata repair is prepared and dry-run verified, not applied: `firebase/artifacts/soft-internet-oct21/visiting-review-ready.json`, one existing event plus feed342→343, two complete typed archives and two canonical actions. Source/gallery/opening-record/version/idle guards remain strict. Production publication approval is pending in the coordinating chat; no publish/apply has occurred. Independent frozen-plan/code review and that approval must pass before the documented release-then-repair sequence. Preview/runtime1.1.10 would not reach publiciOS79 and is not substituted.

October 21, 2026. Craig agreed that hours should be stored and the app should display the hours for the date viewed/filtered. He also agreed to exact-facility Google Places fallback after explicit activity and official facility sources. This supersedes the earlier label-only proposal in `soft-internet-oct21-timing-diagnosis.md` as the intended direction. This document is the requested scope/estimate checkpoint before implementing a new schedule contract. No implementation, tests, deployment or live mutation is claimed.

## Confirmed motivating example

`venues/slug_ccoagallery/events/XDJ0vlTopBBg3rEibyOj`, SOFT INTERNET THEORY. Exhibit interval October 3, 2026–January 24, 2027. Captions 1729449245853296 and 1512241067607930 plus freshly retrieved primary exhibition page prove Tuesday–Saturday 10–17, Sunday 13–17, Monday closed, admission by donation, holiday-change caveat. The October 15 repair intentionally cleared legacy clocks and kept these hours only in prose. Current canonical/API body still matches that repair. Parent verified screenshot pixels; this Windows task used the authoritative transcription and independently checked original caption/history/live fields.

The exact gallery venue's stored Google Places hours match broader Centre building hours, not the gallery; those values are not usable fallback for this case. No correction to that venue document is included here. Separate opening-session records and all event identity, source, media, contacts and interaction history are protected.

## Contract: one optional additive visitor schedule

Proposed field `visitingSchedule` version 1, separate from the existing timing-v2 start/end contract. Legacy overall dates stay the exhibit validity interval and legacy clocks remain blank. No dated child events or recurring parents are created.

Required core:

- `version: 1`, `kind: 'visitor_access'`, IANA `timeZone`.
- Inclusive activity `startDate` / `endDate`, agreeing with the canonical exhibition dates.
- Exact `facility` identity: canonical venue ID plus supported subfacility label; Google place ID only if its identity actually agrees. Parent-building equivalence is not inferred from matching coordinates/address alone.
- `weekly`: named weekday map. Each entry has `state: 'open' | 'closed' | 'unknown'` and an array of interval objects `{ open: 'HH:mm', close: 'HH:mm', endDayOffset: 0 | 1 }`. Use multiple intervals for split hours. A closed day is explicit; absent/unknown days are never fabricated as closed. A supported 24-hour interval is represented deliberately, not by replacing a missing close with 23:59.
- Optional date-keyed exceptions, each with explicit open/closed/unknown state and intervals. Unknown exceptional hours suspend confident opening/status claims for that date. Do not invent holiday closures from a generic caveat.
- Evidence per rule/exception (or an inherited source record with an explicit reference): source kind, URL/post ID, exact supporting text, facility identity, capture/check time, applicable period, and source revision. Preserve superseded evidence in audit artifacts rather than silently replacing reviewed manual decisions.
- A revision/fingerprint for caching and merge drift checks. No current timezone offset substituted for an IANA timezone or future DST handling.

Use a small pure validator and evaluator with mirrored fixtures across backend/client; avoid turning the legacy OperatingHours converter into a silent universal scheduling engine. Invalid/incomplete/conflicting schedules fail back to unknown and source disclosure, without replacing printed event clocks. This field applies only when evidence establishes visiting/admission availability during facility hours; ordinary performances, classes and appointments keep their actual starts and ends.

## Source selection and Google fallback

1. Explicit activity/exhibition visiting schedule and dated source exceptions.
2. Official exact facility/subfacility visiting hours, when the source establishes that the activity is available during those hours.
3. Exact-facility Google Places regular hours, with identity proof, capture/refresh metadata and source attribution; current dated hours/exception coverage applied only to their returned date interval.

Conflicting explicit sources remain a hold/unknown rather than choosing whichever is convenient or newer without identity/effectivity proof. A source exception may supersede a baseline only within its supported date range. A generic holiday-change caveat remains visible and does not imply every future holiday was checked.

Current code findings at parser candidate e92b492: `src/services/placesService.ts:getPlaceDetails` requests currentOpeningHours only, discards date/exception identity and converts to one open/close pair per weekday. `convertToOperatingHours` overwrites split periods and marks missing days closed, and supplies 23:59 for absent close. `src/parsing/venueResolver.ts:getVenueOperatingHours` uses the existing cache/Places path. Keep that established legacy behavior intact outside this task; add a lossless, narrowly used visiting-hours adapter and exact-facility guard rather than silently altering every existing resolver consumer.

Google primary reference (checked October 21): https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places#openinghours. currentOpeningHours covers the next seven days including today, incorporating special hours and possibly truncated boundaries; regularOpeningHours is the typical schedule. Do not persist a current holiday week as the recurring template for months. Preserve split intervals, cross-day endpoints, explicit period dates and exceptional-day coverage. Missing fields mean unknown; array ordering is not weekday identity. Use the existing secret and bounded cache/memo path; no repeated lookup per app card, rendered view, or cached failure. No fresh paid Google call was made in this preparation.

## Parser and persistence work

- Add optional structured visiting-hours extraction for source-supported visitor activities, carrying source text and facility scope through validation/formatting/persistence. Normal event clocks remain event clocks; the current end-only guard remains unchanged.
- Preserve extractor evidence through Stage4/Stage5; validate full range, weekday coverage and source-local facility before publication. Never promote building hours into gallery/pool hours by borrowing an outer venue context.
- Exact-facility official/Places enrichment only for eligible missing hours, with source priority and memoized bounded lookup. Conflicts/uncertain facility matches remain unknown/held.
- Merge/update paths must preserve a reviewed schedule unless compatible, more authoritative source proof supports an exact change. Add source-order/replay idempotence controls and no new public duplicates.
- Keep overall date range separate from visitor intervals, and retain original source IDs/media. Reuse accepted models; any extraction-schema/prompt delta is explicit and reviewed with source fixtures, not hidden inside a deployment assembly.

## API, client compatibility and cache

- API validates/exposes visitingSchedule in the canonical public projection and detail metadata; old timing-v2/legacy fields stay unchanged. Public feed/detail must not expire a months-long activity at one day's close.
- Verify the latest immutable gathr-backend baseline and current owners before edits; October 15 API candidate paths/releases in old docs are historical, not authority to roll back current source. API source checkout has not yet been established or changed in this scoped preparation.
- Treat weekday-aware delivery as a capability, proposed `visitingHours=v1`. Preserve existing dateOnlyActivities=v1 behavior. Unsupported clients must not acquire false Now/closed-day claims; choose and test exact omission/legacy fallback policy in the frozen compatibility plan before production data is marked. Marked records should be omitted from clients unable to handle their eligibility if a legacy fallback would show false Monday availability.
- Add schema validation, normalization, cache generation/revision handling and app persistence support. Invalid/unknown contract versions use an honest fallback; do not delete source records or infer times.

## App day selection and eligibility

The current app has distinct Today/Tomorrow/Now and Upcoming any/weekend/next7/custom date-window paths. `utils/mapEventFilters.ts`, `utils/upcomingDateWindow.ts`, `utils/eventTiming.ts`, `utils/eventExpiry.ts`, `utils/eventScheduleStateCache.ts` and list/card/lightbox presentation must agree on one resolved schedule context.

- Today and Now use the activity timezone's current local date. Tomorrow advances a calendar date, not 24 elapsed hours. Specific custom date uses that date even while the device is on another day/timezone.
- A single selected date displays that day's visitor intervals. No matched interval means explicitly closed when supported, otherwise hours unknown. Suppress unknown-times badge when verified applicable hours exist.
- A multi-date range displays a compact weekly summary plus exception disclosure; include the exhibit only if some supported open interval overlaps the selected window. Unrestricted Upcoming must find the next future visitor interval even when the exhibit has an old overall start date. Today after close is not future-only: preserve existing Today discoverability until local midnight unless a separate product decision changes that behavior.
- Now requires current local time inside a supported interval, including carry-over from yesterday for overnight intervals. Mondays closed do not match Monday Today/Tomorrow/custom-date results; the details remain accessible from saved/direct links with a closed-day explanation.
- Before/after activity range, weekday closure, known dated exception and overnight carry-over boundaries all participate. The exhibit is fully expired only after its supported final availability/range, not after today's close or on an intervening Monday.
- Cache keys include schedule revision, timezone, selected date/window and relevant transition. DST/local-midnight and interval transitions invalidate correctly; no source fetch or schedule parsing per carousel card render.
- Counts, search/list/carousels and lightboxes use the same date resolution. Calendar export represents the selected visit interval with the correct date/timezone; it must not create one continuous months-long appointment or use today's hours for a Sunday export.

## Proof before release

Use exact retained gallery captions and primary HTML fixtures, with dated deterministic clocks. Healthy controls include: Tue–Sat 10–17; Sunday 13–17; Monday closed; split midday closure; explicit date exception; unknown exceptional hours; overnight interval; DST switch; first/last activity day; stale/partial Google current-hours coverage; regular versus current snapshot; missing/empty provider fields; wrong parent-building place match; explicit performance/class starts; ordinary date-only unknowns; printed duration/end/to-close and existing pool/calendar fixtures; source-order/replay stability and protected manual schedules.

Add pure contract/provider tests, parser metadata/merge tests and actual saved-source playback; API feed/detail/capability/pagination tests; app normalization/cache/filter/count/render/calendar tests. Run build, focused and required full suites on frozen candidates. Inspect actual screenshot renders for Wednesday, Sunday, closed Monday and a multi-date window, then validate the Events-tab/card/lightbox surfaces without assuming map interaction authorization. Preserve all previously accepted UX changes and independent platform baselines. No release without visual acceptance.

## Rollout and exact first repair

One reviewed batch, executed in dependency order:

1. Freeze contract/source precedence/compatibility plan and regression fixtures.
2. Implement backward-compatible API and app support; independently test and review rendered UI. Publish the approved compatible Preview update through established release gates and verify adoption evidence honestly.
3. Assemble the three-parser candidate from a freshly verified serving baseline with only reviewed changes. Preserve unrelated resolvers, prompts/models/config outside the explicit extraction delta, checkpoints, queues and feature gates. Follow deployment skill, idle parser gate, exact committed release, qualified dry run and independent common-hash/latest traffic readback.
4. Fresh-read the exact Soft Internet Theory record and related protected identity; full typed backup; exact reviewed visitingSchedule-only repair plus monotonic feed marker. Preserve both blank legacy clocks, overall dates, media/provenance/history and opening-session siblings. Verify detail, bounded venue/date feed and app behavior, including Sunday and Monday cases.
5. Enable automatic visitor-schedule persistence only after source playback, client capability compatibility and deployed path gates pass. No broad migration/replay of historical exhibitions or venue-hours cleanup is bundled. Record rollback for exact data and each release; never downgrade newer independent work.

## Scope estimate and current checkpoint

This is a coordinated parser/API/app feature, not the earlier 1–2 hour presentation patch. Planning estimate: 2–3 working days for contract/evaluator/provider + parser propagation, API/client eligibility/display/cache, regression fixtures, rendered review and controlled release/repair. Confidence depends on fresh serving/API/frontend baselines and test/release availability; report a concrete discovered complication before expanding scope. No new paid scrape/model/Places calls are required for initial fixture-driven implementation; bounded production lookup integration can use the existing configured provider when testing fallback is actually needed.

Current state: exact diagnosis and this implementation plan only, owned docs checkout codex/shared-offer-origin-20261014. Runtime parser candidate remains e92b492; frontend checkout was read-only and remains unmodified by this task. Main Apps Script dirty work is untouched. No schedule schema/code/data/release changes were made. Parent must receive this broader scope checkpoint before implementation; existing daily-parser audits/repairs and gates are not reopened.
