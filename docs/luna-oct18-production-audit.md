# October 18 full-run audit and confirmed repairs

Status: **complete** — full-run audit, confirmed event corrections, parser and
publisher prevention, festival publication and worker completion follow-up are
independently verified. Craig's current instruction authorizes these fixes.
Ambiguous evidence stays held.

## Completion and coverage

Dataset `1Nwf4lh-reDH0alm37Lvkqu61Shv_mwer`, run
`23cfe6d4-18e5-4ba2-bfa7-1ba3017cc213`, completed October18 at
13:33:55UTC /10:33:55Halifax. Duration54m42s. Completed processing lock,
processed marker, final batch351/351, no direct or queried matching
`processing_checkpoints`, no active parser. All351 rows started exactly once;
359 saved checkpoints never regressed. Nine resume completions retained the same
run identity. No manual replay, stop or queue recovery was needed.

Input351 rows:38 processed,63 skipped,250 invalid; duplicate1 is a subset.
61 creates (50 events/11 specials),49 update operations affecting103 distinct
parents.101 saved decisions were reviewed, including45 Stage1 rejections and
all56 remaining captions, extracted items, holds and available ordered galleries.
188/193 original image references were available; five unavailable references
belong to held/rejected Sauna/Ria Mae sources. No result reliant on an unavailable
poster was invented. All1194 managed image URLs in the complete inventory returned200;
all103 written parents returned200 before repairs. Eleven standard read-only audit
scripts completed. Historical audit candidates were separated from today's writes.

The run used the pre-pool runtime `processdatasetresume-00465-tub`, not the
subsequently released pool guard. Fresh pre-release readback confirmed all six
publishing functions ACTIVE/latest100%; three parsers share source hash
`9c1f3208397eff88eb1d9432059001015afea848`. Poolv7 remains the release baseline.
Resolvers and the separate festival worker were read back independently.

## Model usage and operational observations

Actual344 timed model calls match344 snapshot usage records. Stage1 Luna106,
Stage2 Luna65, Stage3 Luna56 plus3 calendar-inventory calls, Stage4 Nano57,
Stage5 Luna57. Runtime pilot selection was101/101 Stage1,56/56 Stage2,
55/55 Stage3,50/50 Stage5. Override environment names alone do not describe the
actual selected models. No model, effort, prompt, cache-layout, compact-response,
pilot percentage, queue or parser checkpoint setting is changed by this repair.

| Stage | Calls | Input | Cached input | Cache write | Output | Estimated USD |
|---|---:|---:|---:|---:|---:|---:|
|1|106|985507|352316|6911|81287|0.107659|
|2|65|464653|81207|2578|11002|0.044722|
|3 including inventory|59|562784|0|562607|85955|0.113321|
|4|57|202040|12544|0|36627|0.024188|
|5|57|155839|85140|16001|41886|0.029264|

Estimated total **US$0.319154** from recorded usage and the established accounting
rates; this is not an invoice. All344 calls report cache-write accounting. Summed
model latency45m45s; complete parse timing50m43s, with orchestration/resume time
accounting for the remaining wall time. Stage1 sum13m58s, Stage2 2m59s,
Stage3 16m32s, Stage4 3m18s, Stage5 6m09s. These are summed timings, not additive
independent wall-clock segments. Stage3 maximum116s, model-call maximum91s.

Two compact validation attempts failed source/count checks and retried; no hard
parser errors or repeated row starts. Four exact-post calendar canaries, two
yearless past dates, one ambiguous approved occurrence and one unreadable identity
remained held. Seven off-region matches were rejected.32 protected profile-image
cleanup403 attempts were harmless to public media; the candidate now excludes
profile paths from the post-image deletion request selector. No profile deletion
permission was expanded and no existing media is deleted by this audit.

## Confirmed repair batch

Exact paths, complete fingerprints, source-snapshot pins and sibling inventory:
`firebase/artifacts/oct18-audit-fixes/reviewed-plan.json`. Default-dry helper:
`firebase/repair-oct18-audit.mjs`. Full timestamped prewrite backup is required
before apply. The atomic document batch advances feed313→314 if unchanged.

| Finding | Source | Decision / prevention |
|---|---|---|
|Coach's breakfast incorrectly became Sports|1785814723547515|Preserve dated serving08–14 as Food Special; item activity wins over incidental marathon wording.|
|Hunter's finite weekend brunch omitted Sunday; explicit finish lost|1568198158660735|Restore SundayOct18 11–15 and explicit finish flags. Keep two finite dates, no invented weekly lifecycle. Saturday source expands forward only; do not recreate an already-past Saturday from a Sunday post.|
|Creative Kids retained September copy|1436879098627760|Refresh October writing/drawing/story theme. Preserve canonical ID, Wednesday15:30–16:30, gradesK–6 and weekly lifecycle; newer same-publisher programme copy can replace stale longer monthly text.|
|Ann Cleeves conversation categorised as a class; old review notes public|1693893912330623|Gatherings & Parties; clean source-supported description. Delta identity is already reconciled despite its historical `slug_thecorkandcast` ID; do not rename or move it again.|
|Country concert poster repainted by generic CP24 video frame|1736217035175926|Restore the visually verified older November12 19:30 George Canyon/Aaron Pritchett poster. Preserve gallery/source links; selected generic-frame evidence cannot repaint a managed poster.|
|Public recreational skates lack family suitability|1675642774023107 /1675221594065225|Score60/likely under scoped v8 public-skate rule. Adult/senior/private/fitness/lessons/hockey/movie controls remain excluded. Existing pool guards remain.|
|Montague pancake breakfast omitted by event-only route|1752343520229723|Recover Oct31 09:30–11 at existing Montague Curling Club. The adjacent untimed Halloween Hustle stays held; breakfast clocks never transfer to it. Junior Curling is the host, not audience proof.|
|Dinner-theatre run became one21-day event|1766365078822804|Remove public continuous span and preserve a private source hold. November28–December19 is an advertising run without an exact performance-date inventory. Preserve18:30 show/18:00 doors evidence privately; no daily performances or first-night occurrence is guessed.|
|Two expired Harvest umbrella copies recreated|1726828796119300 /1726639906138189|Remove exact Oct17 copies; retain exact source/date/name retirement constraints. Do not resurrect the expired reviewed root or disputed children. First-party overall15–20 range must not become vendor hours11–20.|
|Memorial Hall concert room unresolved|1515144087317628|Recover Rising Stars Dec5 11:30 and Heaven and Nature Sing Dec19 15:00 at ConfedCentre/Memorial Hall; preserve unknown finishes. Add full parent-qualified room alias and resolve the exact two-sample queue item. No global bare-room alias or university venue is adopted.|

Memorial Hall evidence: [Rising Stars](https://confederationcentre.com/event/rising-stars/),
[Heaven and Nature Sing](https://confederationcentre.com/event/heaven-and-nature-sing/).
Harvest overall and component clocks were reread on the
[first-party programme](https://foundersfoodhall.com/events/harvest-fest-2/?occurrence=2026-10-17).
The source posters and caption versions remain the audit evidence when versions
conflict; this is not a universal website-over-poster precedence rule.

Current batch: seven public-parent updates, four public-parent creates, three
public-parent deletes, two narrow venue metadata updates, one exact unknown-queue
resolution, one private hold, plus feed version. No venue deletion. The pancake
source graphic is restored byte-for-byte from the saved original into one dedicated
new managed JPEG, with saved SHA256 and a public readback; the parse had removed its
temporary upload after holding all output. No API key or paid parser replay is needed.

## Festival audit and prevention

Fresh actual-worker read-only inventory:101 sources/990 documents; no paid calls,
no writes. Serving worker `scheduledfestivallinker-00008-noh`, hash
`95fe0fddd0a1a438bb41c0312eaee2d13b06fef9`. Anchor initially23 edition holds,
one independently unconfirmed presenter-versus-organizer item; Pumpkin no new delta.
The regular worker correctly waited through11 active-parser polls, then captured
four sources and finished without public event writes. This is not a clean linking pass.

New source1567815368719328 explicitly prefixes seven films with ANCHOR Fest under
SundayOctober18,2026. The capture shortens eventText to the bare film title; the
adapter then misses its supported literal festival prefix. The fix retains the
literal row substring, never synthesizing a title/year. Same-image DAY4 poster
headings may use their immediately following full date heading, with strict offsets,
source ownership and wrong-year/other-image controls. Unregistered programmes and
unchanged old relative-date Cinema sources remain held. Canonical provenance,
manual suppressions, exact clocks, points and edition matching remain mandatory.

The worker's initial and transactional completion fences now also inspect the
actual `processing_checkpoints` collection, including matching fileId documents,
while retaining the legacy checkpoint check. Dry-run reports expose the pure
proposal privately for exact audit/review. No source capture is rewritten to make
an outcome pass. Candidate source, replay and release evidence follows below.

## Release / apply evidence

### Parser and publishing functions

Build, 99 focused tests and all 1,010 compiled parser tests passed. The three
other publishing assemblies each passed their 46 focused checks. Each deployment
used a committed clean assembly from that function's own immutable serving archive,
a codebase-qualified dry run, fresh idle proof and independent serving readback.
All six functions are ACTIVE with 100% latest traffic; environment, secrets and
configuration hashes are preserved. The deployed source/compiled archives were
compared byte-for-byte with the exact release assemblies.

| Function | Verified revision | Source hash |
|---|---|---|
|processDataset|processdataset-00503-ruv|9087534a20b0bea00fa3c4e2af5e6586f41cc074|
|processDatasetResume|processdatasetresume-00467-cim|9087534a20b0bea00fa3c4e2af5e6586f41cc074|
|processDatasetSelectedRows|processdatasetselectedrows-00459-haz|9087534a20b0bea00fa3c4e2af5e6586f41cc074|
|finalizeCityLevelEventReviewTrigger|finalizecityleveleventreviewtrigger-00081-ves|65f01c4cd20214e5bf6d62cabd28a7d3cdf468e8|
|processSharedEventPublicCandidates|processsharedeventpubliccandidates-00049-qec|62188bd1552d3fe3661eae329e02fdcd46c1668e|
|scheduledSharedEventPublicCandidateProcessor|scheduledsharedeventpubliccandidateprocessor-00051-qet|fb890226e06e9ed5d9324ba7099cb21e6433aa85|

Assembly commits: parser `1c8a34b302a85ce54985802358b284930daf53b7`,
city finalizer `f0a5a9bbd66a742686087c6e9550a368056d1992`,
direct shared publisher `c9e1ae4fe38a3641d826a438a029eef91edd2d4b`,
scheduled shared publisher `197c659bc07dbe693251804b0b421856adec2fef`.
The shared publishers retain their own earlier family policy baseline, with the
reviewed aquatics/skate additions; parser policy was not copied over them wholesale.
Actual stage reasoning remains Stage1 none/high recheck, Stage2 none/high negative
recheck, Stage3 high, Stage4 low, Stage5 none. Request modules, prompts, cache and
compact contracts are unchanged by these releases.

Evidence: `functions/artifacts/oct18-audit-fixes/release/verified.json` and
the source archives, test logs and qualified dry-run/apply results beside it.
Durable source patches are under `docs/patches/oct18-*.patch`; they apply to
their recorded functions-root serving baselines, not the coordinator's older source.

### Exact event-data correction

Applied at 17:13:39 UTC after fresh full-run completion/idle checks. Automatic full
backup: `firebase/artifacts/oct18-audit-fixes/prewrite-backup-2026-10-18T17-13-39-759Z.json`.
Result: `applied-2026-10-18T17-13-39-759Z.json` in that folder, with
`exactDeltaVerified: true`. All 18 planned document changes plus feed 313→314
committed atomically. The original source JPEG upload was independently hash-verified;
no existing source, gallery, venue document or media object was deleted.

Independent API verification passed at 17:15 UTC: all 11 retained/new target details
returned 200, all three deleted target details returned 404, and all four recovered
events appeared exactly once across the complete 10-page/908-event active feed.
Expired target updates are verified by detail rather than requiring them to reappear
in the active feed. All three deleted parents and their materialized copies remain
absent. Fourteen target managed images returned 200. Earlier Daisy, Be You and
seven-copy cleanup controls remain absent; three Bell Aliant pool labels remain 60
and Lane Swim remains 15.
Evidence: `firebase/artifacts/oct18-audit-fixes/api-after-verified.json` with
saved detail and complete-feed responses. Do not reapply the completed repair helper.

### Festival source coverage and first publication

The reviewed candidate inventory after the event correction contains 101 sources
and 991 documents. Five Anchor activities are eligible: four missing memberships
and one already linked. Eighteen activities remain held: 12 lack registered source
programme ownership, four older relative-date items lack supported edition evidence,
and two The Snake occurrences conflict with canonical clocks. One further presenter
role remains unconfirmed. Pumpkin proposes no new delta. No guard was relaxed to
force a link, and neither venue/date proximity nor an invented title/year is proof.

Initial worker release `d9619578f6a83e7b86b82087dceeaa0138d39a2c` was independently
verified ACTIVE/latest100% at `scheduledfestivallinker-00009-tiy`, hash
`6c9acd8064dadc78e87f3c175e35dd99bd2dea2d`, with preserved configuration and
1,419 exact deployed code files. Build, 148 focused checks, all 999 compiled worker
tests and five read-only saved-source playback tests passed. The existing scheduler
configuration and five-minute schedule were preserved.

The normal worker published four source-proven Anchor memberships:

| Activity | Venue / October18 time | Canonical child ID |
|---|---|---|
|Purgatory|Tivoli, 14:00|6jnJDvVa88NAjhSxFTc5|
|Short Program: Absurdities|Tivoli, 16:30|DVKFvUQEAMC6rzVcsLDz|
|Castration Movie|Tivoli, 21:30|ZQMZNY0JUq1RPfqLhmDu|
|All About the Money|City Cinema, 16:30|vuKXYSXmuJ7h04QXOarO|

The Anchor root `events/area_7ebb4bc0846d26c4470e6842` moved from 17 to 21 linked
activities, retaining all eight location points and all previous memberships. Feed
314→315. The fifth eligible activity, Rite of Passage at 19:00, was already linked.
No child event, capture cache, provenance or protected manual decision was rewritten.

### Worker completion follow-up

Live verification caught a partial-completion bug after the correct first publication:
the canonical child collection-group query also included the registered Anchor root.
Its own update then looked like external canonical drift during the Pumpkin check.
The job became retryable after publishing the four links; this was not reported as
a completed audit.

The narrow follow-up separates registered parent authorities from canonical children,
pins every registered parent and review, and refreshes only the exact parent version
that this worker just committed after checking its complete expected body. Real child
changes, unexpected parent changes and competing workers still abort. Worker input
policy v4 causes normal versioned reevaluation; no job reset, capture-policy change,
new key, parser replay or parser deployment is involved.

Follow-up assembly commit `387c15c693646b552ffee0021bcf93f92de3dbda` changes only
`src/services/festivalLinkWorker.ts` (18 insertions, five deletions). Build, 148 focused
checks, all 999 compiled worker tests and four actual-worker transaction playback
tests passed. Playback reproduces the old failure, completes both editions with
exactly four links, proves repeat-run idempotence, and rejects real canonical-child
or other registered-parent drift. These are offline tests with network access forbidden,
not paid model calls or live public writes. Durable test:
`firebase/oct18-festival-transaction-playback.test.mjs`.

Follow-up release independently verified ACTIVE/latest100% at
`scheduledfestivallinker-00010-rof`, source hash
`9af99e18ea53be3bdb50be0ec3ab1016e6201dc9`. All 1,419 serving source/compiled
files match the clean committed assembly. Configuration, environment and secrets
remain unchanged. Evidence:
`functions/artifacts/oct18-audit-fixes/festival-followup-release/verified.json`.

The existing scheduler was invoked once against this verified revision. Its schedule,
target, authentication, retry policy and deadline remain unchanged. Fresh generation9
completed at **17:33:45 UTC**, after the follow-up invocation, with both Anchor and
Pumpkin `ready/no_public_delta`, zero gaps, zero public event writes and zero paid
captures. This fresh completion, rather than the older generation8 retry recovery,
is the follow-up's live proof. Four cached captures retain exact data and nanosecond
versions. The four reviewed publication proofs match the source-based proposal.

Final verification at 17:34 UTC confirmed the Anchor parent and all four child
details return 200, 17→21 memberships with no removals and eight unchanged locations,
and exactly one parent/each linked child in all 10 pages/907 active events. The sole
feed difference is Tyne Valley's 13:15–14:30 ice-rental slot, which expired between
the two checks; no extra deletion was performed. Feed remains315. Evidence:
`firebase/artifacts/oct18-audit-fixes/festival-applied-verified.json` and its saved
complete feed. Independent final readback also confirms all six parser/publishing
revisions, traffic, source/configuration/environment/secret hashes remain unchanged
since their verified release: `release/final-readback.json`.

The regular morning worker used seven paid evidence calls for four captures:
16,932 input, 14,695 output and 16,119 cache-write tokens; summed latency 141.759s;
estimated US$0.009443675. All audit and repair playback used zero paid model calls.
The publication invocation reused unchanged response captures and required none.

## Decision and next check

All confirmed corrections from this batch are applied. No additional mutation is
justified for the held dinner-theatre dates, conflicting film clocks, unregistered
programme ownership, unreadable sources or other unresolved attendee locations.
Existing closed human decisions and retired-source controls remain protected.
The next regular full-run audit should check the new v8 activity labels, finite
weekend meal coverage, recurring monthly description refresh, source poster protection,
expired-copy suppression and multi-edition festival completion. No additional
scrape, paid parser replay, map interaction or monitor was started for this audit.

Private audit artifacts: `functions/artifacts/luna-oct18-production-audit/`.
Parser/publisher assemblies: `functions/artifacts/oct18-audit-fixes/release/`.
Worker assembly: `functions/artifacts/oct18-audit-fixes/festival-release/assembly/`.
Each starts from its own freshly verified immutable serving archive. Coordinator
source includes other local work and is not the deployment payload.
