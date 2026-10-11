# October 11 exact live data repair plan

**Pending Craig's exact approval. No live mutations have been applied.**

The dry run and complete native-typed backups are in `functions/artifacts/luna-oct11-integrity-repair/live-repair-plan.json`. The saved plan is applied only with `functions/scripts/oct11-integrity-live-repair.cjs --apply <saved-plan>`. Changed update times or fingerprints stop the entire transaction.

## Exact targets

| Path | Action | Reviewed change |
| --- | --- | --- |
| `venues/slug_easternkingssportsplex/events/0HKcUnxA1jou0pFpLmzI` | Update | Correct U9 description to **U13 Development Camp**; retain **18:40–19:40**; Tuesdays **Oct 13/20/27**, free; establish the camp post as recurrence source |
| `venues/slug_easternkingssportsplex/events/zYyaYGXGRHRPOk1pTcNd` | Update | Identify **U11 Development Camp**; retain **17:30–18:30**; Tuesdays **Oct 13/20/27**, free; establish recurrence source |
| `venues/slug_easternkingssportsplex/events/oct11_cup_u9_20261013` | Create | Missing **U9 Development Camp**, Tuesdays **Oct 13/20/27 at 16:20**, free; managed source image; no unprinted end supplied |
| `venues/fb_100057766283684/events/3C9dqyOoaejurl8zjx3x` | Update | Restore **Karaoke** weekly Mondays, four original occurrences **Oct 5/12/19/26**, **22:00**; retain current media |
| `venues/fb_100057766283684/events/O4FDKN8GUqCUld1ZhO8p` | Update | Restore **Rat Tales Comedy Night** weekly Mondays, four original occurrences **Oct 5/12/19/26**, **20:30**; retain current media |
| `venues/slug_florencesimmonsperformancehall/events/SEWO0qtndzRF6gyqMjbB` | Update | **Emily St John Mandel**, Oct 22 **19:00**: category **Gatherings & Parties**; restore previous **21:00 same-day** end; preserve ticket URL and prices |
| `venues/31MHpCb7juuQkKD5N98q/events/tX70MrxuGdaAHwV0lgtj` | Update | **Stratford council meeting**, Oct 14 **16:30**: category **Gatherings & Parties**; remove unsupported **01:00** end |
| `city_level_event_reviews/cityevt_7040cff228c17373d2ea4ea3` | Update held draft | **Stratford food drive**, Oct 17 **09:00–14:00**: category **Gatherings & Parties**, activity type; preserve `needs_review` and all spatial holds |

**Total: seven updates, one create, zero deletes.** No venue records are changed. The food drive is not published by this plan.

The Community Cup source prints start times but no ends. Existing U11/U13 calendar end times remain; U9 receives none. The author's restored 21:00 is prior stored data with unknown source derivation, not newly confirmed by the caption. Its source prints only the 19:00 start. Council's source prints no end.

## Source and duplicate checks

- Community Cup [source 1668733748047343](https://www.facebook.com/1668733748047343) supplies all three age groups and dates. Fresh inventory contains the U11/U13 generic slots and no Oct 13 16:20 slot. A second inventory check occurs inside the transaction.
- Baba's before-state audits preserve the original bounded Monday series from source `1667441038524756`; the Oct 11 Downtown schedule only confirms Oct 12 occurrences.
- Author [source 1686896163030398](https://www.facebook.com/1686896163030398) confirms literary conversation, Oct 22 19:00, $20/$45 tickets and its ticket URL. It supplies no end.
- Council [source 1565517958943059](https://www.facebook.com/1565517958943059) confirms the Oct 14 16:30 meeting and live stream.
- Food-drive [source 1565233575638164](https://www.facebook.com/1565233575638164) describes collection at four locations, so its spatial hold remains correct.
- Existing Tipsy buffet `8WD9DcZTLgEBYnqnZNtm`, Sunday brunch `PMLIVM9n9zyehj5tuHMA`, and Sunday market `LFEXYZ7jGdqEnltJpe8u` already cover those activities. No duplicate creates are proposed.

## Verification after approval

1. Freshly re-read every target, exact update timestamp, source identity and full fingerprint; fail closed on drift.
2. Save a second complete prewrite backup, then atomically apply exactly the saved deltas.
3. Re-read every target and compare each changed field. Verify three camp series cover exactly nine intended occurrences and Baba's Monday series remain bounded through Oct 26.
4. Check app detail responses and the paginated event feed for corrected dates, categories, recurrence, ticket metadata and the U9 slot. Confirm unchanged buffet/brunch/market controls. Report any API inconsistency explicitly.

The pre-existing author duplicate and NHL title-typo duplicate stay in the previously deferred broad deduplication work; this plan does not delete them.
