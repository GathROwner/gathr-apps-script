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

Exact apply approval requested. No mutation yet. Before apply, recheck source,
website facts, full sibling membership and idle parser in the transaction.
After apply, verify exact delta/untouched references, event detail, complete
active feed, duplicates and existing media availability. Do not use the older
two-target unknown-clock plan for Harvest.

## 2. Auditions and honest unknown-time publication

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

## Subsequent queue (start after the first approved change is verified)

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
