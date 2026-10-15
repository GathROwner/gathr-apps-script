# October 15 remaining repairs: sequential execution

Craig authorized working through the remaining list one issue at a time.
Live document changes still use reviewed exact targets, fresh backups and
approval; no broad sweep or unrelated release is implied. The coordinator owns
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

1. Remaining exact category/media/spatial corrections and source-backed recovery
   of genuinely missing activities; retain ambiguous prices/identities.
2. Finish date-only client delivery and bounded backend enablement validation.
3. Festival source/provenance shadow gates, then separately validated public writer.
4. Fresh missing/blank venue-profile review with validated first-party recovery.
5. The exact missing venueId/startDate/startTime collection-group index.
6. Broader source-grounded duplicate clusters with exact cleanup approval.

Completed earlier: FiN Fish-only weekly recovery, APM seventeen-event recovery,
two exact duplicate deletes, Arts Mixer correction and deployed parser guards.
Tomorrow's new full run is a separate production validation, not evidence that
any pending live correction or automatic festival writer already happened.
