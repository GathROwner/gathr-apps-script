# October 15 remaining repairs: reviewed batches

Craig initially authorized working through the remaining list one issue at a time.
His later instruction supersedes the one-approval-per-issue workflow: prepare
related fixes together, present a short summary and one exact approval request
per reviewed batch, then apply and verify each included change in order. Finish
the already-approved Rodd package first. Ambiguous candidates stay held and do
not delay the source-proven subset. This changes approval grouping, not the
requirement for exact targets, fresh backups, drift guards and verification.
No broad sweep or unrelated release is implied. The coordinator owns
the backend checkout and all live data/release targets. The frontend coordinator
has a read-only compatibility/delivery review for the first clock corrections.

## 1. Existing listing correction: Harvest first

Fresh official evidence changes the earlier proposed unknown-time plan.
[Chefs’ Harvest's dedicated programme](https://innatbayfortune.com/special-events-offerings/chefs-harvest-dining-series/)
prints the named dining series as **5:00–9:30 PM**, separate from check-in,
breakfast and the later optional Fire Bar. Its October 15–17 block names Forager
Nick of North. The [current FAQ](https://innatbayfortune.com/faqs-2/) explicitly
identifies the October 15–November 7 series as 2026. Original October 15 source
`1727757279354846` identifies tonight's same programme and existing venue.
This supports a normal timed correction; a date-only contract is unnecessary.

Exact target:
`venues/fb_100063617721610/events/L5dAjm7VnQOOCMMze25W`.

Proposed delta: start `12:30` -> `17:00`, finish `21:00` -> `21:30`;
source-explicit time flags; remove post-timestamp/category-default resolution.
ID, date, title, venue, category, price, description, links, source identity,
all media and event siblings remain unchanged. No later-date creates or paid
model calls are in this first plan.

Default-dry helper: `firebase/repair-harvest-clock-oct15.mjs`.
Independent verifier: `firebase/verify-harvest-clock-oct15-readonly.mjs`.
Fresh dry run found the target unchanged, no active parser, three guarded
target/venue/source references and eleven related venue/source events.
Plan and full backup:

- `functions/artifacts/oct15-sequential-repairs/harvest/plan-2026-10-15T19-17-33-669Z.json`
- `functions/artifacts/oct15-sequential-repairs/harvest/backup-2026-10-15T19-17-33-669Z.json`

Craig approved the exact request with “Okay continue”. One guarded transaction
applied the correction at 19:21 UTC, after unchanged target/source/venue/sibling
checks and fresh official evidence. Independent read-only verification at
19:21:38 UTC passed exact delta, twelve untouched references, unchanged sibling
membership, detail 200 and one entry in the complete 1,023-event/11-page active
feed. All six existing managed images return 200; no duplicate session found.
Backup/apply/independent artifacts are in the same directory:

- `prewrite-2026-10-15T19-21-07-929Z.json`
- `applied-2026-10-15T19-21-07-929Z.json`
- `independent-verification.json`

Do not use the older two-target unknown-clock plan for Harvest; it is superseded
by this explicitly timed correction, and its old fingerprints now fail closed.

## 2. Auditions and honest unknown-time publication

**COMPLETE as of October 15 20:23 UTC.** The preparatory narrative below is
historical and superseded by Craig's exact approval and verified execution in
`docs/auditions-oct15-release-and-repair-approval-plan.md`. API `6e9fe16` is live
at `gathr-backend-00085-tts`, with preserved configuration. Both approved Preview
platforms are published and independently read back; device adoption is not
claimed. The exact audition is now October26/unknown clocks/original poster,
and feed marker is260. Independent full-feed checks show default absent,
capable once, 22 untargeted references unchanged and all three images200.
Global parser date-only publication remains OFF; Production compatibility and
broader enablement remain separate subsequent work.

Auditions source/poster and the freshly read official page support October 26
evening with individually communicated appointments, not 08:00–01:00. Original
poster was downloaded and independently viewed again. Date-only UI fix is
published to iOS Preview only; production/Android/older-client compatibility
and delivery need a concrete decision before unknown-time data publication.
The existing frontend coordinator's read-only review is complete. Fresh EAS
readback reports iOS Preview `3d2f4f7`, Android Preview `8ce23bf`, iOS Production
`b5d58df` and Android Production `25a157d`, all runtime 1.1.10. Independently
inspected source confirms Android Preview lacks the exact date-only policy,
and both Production trees lack `utils/eventTiming.ts` entirely. Current Preview
source includes the policy recognition and calendar guard. Its focused rerun
passed 29 tests in three suites, one existing opt-in skip; this is not device
adoption. No additional frontend edits or releases occurred.

The next delivery proposal is Android Preview validation, then minimal separate
Production compatibility backports preserving each platform's accepted baseline.
Neither a wholesale Preview-to-Production replacement nor a two-commit blind
cherry-pick is acceptable. Older installed clients also lack capability-based
delivery, so OTA publication alone cannot establish compatibility for everyone.
This delivery decision must be addressed before unknown-time public mutations.
Global date-only parser gate remains OFF. Do not substitute a guessed evening
time or claim an uploaded OTA proves adoption.

The frontend coordinator now owns preparation/testing of a minimal Android
Preview candidate from its own current serving baseline, without publishing or
touching Production/backend data. It must return a committed candidate and real
rendered evidence. No overlapping checkout or release ownership is authorized.

### Compatibility delivery candidate and exact auditions plan

An isolated API candidate began at `a7552a0`; the reviewed pagination follow-up
is `8ce4bf3`, and latest documentation-only commit is
`6e9fe169c9a67df8e85917d7be6a4b61925f4240`, in
`C:/Users/craig/.codex/worktrees/date-only-delivery-api/gathr-backend`, descended
from independently verified serving commit `13c8d52` / revision
`gathr-backend-00084-66r`. Explicit request query `dateOnlyActivities=v1` declares
support; older clients receive none of this newly marked policy, while capable
clients receive valid reviewed contracts. Ordinary timed/recurring/area/legacy
contracts remain unchanged. All feed/detail/venue-with-events paths and bounded
pagination are covered. Malformed marked records fail closed for both clients.
This is compatibility handling, not source approval or authentication.

All 55 backend checks passed. A read-only capture of all 1,133 stored events
projects identically through serving and candidate source; zero current records
would be newly excluded. Actual proposed auditions payload is also verified
offline: default excluded, v1 allowed, unknown clocks and original poster.
No API deployment or live data changes occurred. See the API checkout's
`docs/date-only-delivery-2026-10-15.md` for release/rollback gates and limitations.

The frontend coordinator is preparing the minimum Android Preview compatibility
port and a separate iOS Preview capability-only candidate, with request tests
and Android shared-component screenshots. Production bundles remain unchanged.
Neither candidate is authorized to publish yet. Compatible clients temporarily
see marked activities that old clients cannot safely render; this delivery
tradeoff must be part of the exact release decision.

Independent review additionally required capability-specific persisted feed and
detail cache generations. Otherwise rolling an OTA back could let an old bundle
hydrate newly cached date-only records, bypassing the request-only guard. The
frontend coordinator is adding separate keys in both candidates without wiping
account/user storage. Clean platform-specific exports and fixture-free release
trees are also required before requesting the release decision.

The coordinator independently viewed Android native shared-component screenshots
01–05: Today/Tomorrow labels, unknown badge/disclosure, calendar guard, October 26
auditions, bounded offer date range and timed/overnight controls are readable and
retain their expected semantics. These are synthetic component renders, not a
full app feed/lightbox or iOS device adoption test.

Fresh API serving configuration was captured as fingerprints only: all fourteen
environment definitions and the full runtime spec are hashed, not copied or
printed. The baseline remains `gathr-backend-00084-66r`; no inline credentials
entered artifacts or either deploy checkout. Preserve these settings and the
existing profile-image deletion guard during any approved API release.

Next exact event target is only
`venues/slug_confedcentre/events/bqk2pKnr1HHZQvhaz6Qo`: restore the original
poster, replace invented October 26 08:00–October 27 01:00 with October 26
unknown-clock timing, preserve the existing source's “evening” wording and
individually communicated appointments. The repair also increments only
`runtime_metadata/event_feed.version` and its timestamp atomically so cached
clients can detect a changed feed. It preserves all other feed-marker fields.

The initial source-only dry plan is superseded by the feed-marker-aware plan:

- `functions/artifacts/oct15-sequential-repairs/auditions/plan-2026-10-15T19-49-35-137Z.json`
- matching full `backup-2026-10-15T19-49-35-137Z.json`

Current guarded marker is 259; proposed version 260. Any drift aborts.
Default-dry helper `firebase/repair-auditions-date-only-oct15.mjs` refuses apply
without exact reviewed plan and the expected approved delivery API commit live.
Verifier checks exact event/marker delta, unchanged references/media, default
404/feed exclusion, capable detail 200/full feed once, and refreshed API marker.
No new upload, event, venue change, global parser enablement or invented clock.

Final normalized official-page text is now fingerprinted too; a repeat fresh
fetch matches. The older 19:35 marker plan is superseded by this stronger exact
source-content plan. Full Preview/API/data release decision and completed
validation are in `docs/auditions-oct15-release-and-repair-approval-plan.md`.

## Subsequent queue (start after the current issue is resolved or explicitly held)

Craig confirmed the iPhone Preview update and corrected audition listing, then
instructed continuation. Next exact issue: Indigo Thriller Book Club category.
The live record and original poster were independently reviewed; category-only
dry run/backups are ready. See `docs/indigo-category-oct15-repair-plan.md`.
Craig approved the exact Indigo correction. It was applied and independently
verified at20:54UTC: one category/type correction, marker261,16 unchanged
references, both detail routes200, full active/history feed once and both
images200. Next is the separate L'Autre programme-poster restoration review.

L'Autre review is now complete: original owner poster/overwrite pixels and exact
audit chain verified. Default-dry exact restoration and full backup are ready;
five protection tests and actual offline overwrite replay pass. Craig approved
the exact plan; restoration is complete at21:00UTC and independently verified
at21:01UTC:47 untouched references, both details200, full active feed once,
eleven-image gallery unchanged, all12 images200 and marker262. See
`docs/lautre-poster-oct15-repair-plan.md`. Next is A&W's province-wide offer scope.

A&W read-only review confirms its October14 card is expired and absent from the
complete active feed. No current offer horizon is printed; it remains held for
source-supported ongoing dates/location coverage, without a historical mutation
or invented new occurrence. Next active issue is the morning bike-bus source
published as a10:17–23:00 school card. Actual offline source playback passes the
existing route/time holds. Exact one-card removal plus marker262->263 is prepared
and backed up in `docs/bikebus-oct15-false-pin-repair-plan.md`; original source,
private route candidate, school, other events and all media remain preserved.
Craig approved that exact cleanup; it is COMPLETE at21:10UTC. Independent
verification passed both details404, full active-feed absence, three untouched
references including the source, other event unchanged, retained route candidate,
both images200 and marker263. Next is Rodd Brudenell's dinner/music clock ownership.

Rodd is COMPLETE after exact approval. Narrow release731bafc is serving on all
three parsers at common hash15a93b64dc5ce4d892adfe5b52d3d46c0ff9ad06,
ACTIVE/100% latest traffic with identical configuration fingerprints. The one
card is now Vintage2.0 — Small Business Big Party, preserving the November28
21:00–00:30 entertainment window,86.95+tax admission and source/gallery. Dinner
is included without invented serving clocks. Atomic marker264 and fresh full
prewrite backup are recorded. Independent21:34UTC checks passed exact delta,
two untouched references, both details200, full active/history feeds once,
no second meal card and both images200. See
`docs/rodd-entertainment-oct15-release-and-repair-plan.md`.

Next grouped review has a fresh read-only capture of eight related source
snapshots and fourteen candidate records. This is triage, not an approved
mutation plan: `functions/artifacts/oct15-sequential-repairs/next-batch/readonly-capture.json`.
The next exact five-event batch is COMPLETE in
`docs/oct15-reviewed-batch-approval-plan.md`: one November19 McFadyen show,
four audit-proven source-array additions,feed264->265 and two narrow tested
ticket-start/merge-evidence guards at release4c8d111. Build,38 focused and825
full tests pass; saved-source/future-merge playback passes without paid calls.
Craig approved the exact grouped plan. Release4c8d111 is independently ACTIVE
on all three parsers at hashde8b283b5d93c7a569dc8bec95b4448fce196d73,
100%latest traffic and identical full configuration fingerprints. The exact
five-event repair and marker265 were applied atomically and independently
verified22:11UTC:23 untouched references,correct details,one McFadyen listing
in full active/history feeds,no duplicate and both retained images200.
Fresh backup/apply/readback/verification artifacts are in
`firebase/artifacts/oct15-reviewed-batch/`. Other pending batches need their
own grouped exact review; do not re-request this completed approval.
Keep online
delivery, unclear store/mall ownership and indefinite package horizons held
until their evidence/contracts are adequate. Do not ask per candidate.

Harvest source review found older generic/weekly/component cards overlapping
the current printed twelve-date programme. Current website fixes the clock
and year, and ten historical source snapshots are captured. The exact grouped
plan is prepared in `docs/harvest-series-oct15-batch-plan.md`:three preserved
keepers,nine missing dates,five retired copies,one venue replay policy and
marker266. The reviewed poster also corrects the wrong November primary on
October16/17. Craig approved the exact grouped plan. Release6c5c46f passes18
focused/832 full tests,no-network playback and qualified dry run; it is now
ACTIVE/100% on all three parsers at common hash8a3e2aaeaf3c7d56648fc5ce15b5c709a6fbadaa
with unchanged full configuration. The nineteen-document transaction and
marker266 were independently verified22:49:56UTC:13 untouched references,
12 canonical details200/5 deleted404,12 once in both complete active/history
feeds,no retired generated copies and12 images200. Three other venue activities
and the themed-child website-clock enrichment limitation remain separate.
Fresh backup/apply/readback/feed evidence is in
`firebase/artifacts/harvest-series-oct15/`. This batch is COMPLETE.

**Scope accounting:** `docs/oct15-repair-scope-and-status.md` reconciles the
original20 audit review groups:17 closed/addressed/covered/contained and3 held
evidence/policy limits. The final six-group batch is now complete. Three older Inn records need separate
source review. The five larger backend workstreams below are a separate backlog,
not additional newly discovered failures in the Harvest batch.

1. Finish date-only client delivery and bounded backend enablement validation.
2. Festival source/provenance shadow gates, then separately validated public writer.
3. Four confirmed broken current-listing profiles repaired/verified00:37:33UTC
   October16 (October15 Halifax); four managed images/venue endpoints, five
   event details and both complete upcoming feeds pass. Other blank/inactive
   profiles remain a separate fresh-inventory task; see the four-profile plan.
4. COMPLETE23:57:48UTC: exact venueId/startDate/startTime index READY; 17 live
   API cases pass, complete normal feeds and15 existing indexes unchanged.
   Evidence: `docs/venue-feed-index-oct15.md`.
5. Broader source-grounded duplicate clusters with exact cleanup approval.

Completed earlier: FiN Fish-only weekly recovery, APM seventeen-event recovery,
two exact duplicate deletes, Arts Mixer correction and deployed parser guards.
Tomorrow's new full run is a separate production validation, not evidence that
any pending live correction or automatic festival writer already happened.

## Consolidated final six-group batch

Craig approved the combined exact batch. Runtime release ac0e59b is ACTIVE
on all three parsers at common hash8073c2d8a8520e8362a71df53c76b718751fabfb,
100% latest traffic and unchanged full configuration. All843 backend tests,
23 focused checks, saved-source playback and qualified dry run passed.
The28-document atomic transaction/eight original assets applied23:38:14UTC;
independent exact-delta/details/full feeds/media verification passed23:38:44UTC.
All104 guarded untargeted references were unchanged. Ruby, Mill River,
Andersons Creek, Blank Canvas and the date-only activities are repaired.
The false RCMP office is absent; online sources are retained without physical
pins. Online educational recovery is excluded and unconfirmed local PetSmart
publication is skipped. See `docs/six-groups-oct15-approval-plan.md` for complete
release, fresh backup, apply and verification artifacts. This approved batch
is COMPLETE and requires no additional approval or live operation.
