# Luna high selected-row cohort — October 1, 2026

## Decision

Do not flip the scheduled large parser to Luna yet. A narrow, audited Luna pilot is justified: the source-checked successes remained much cheaper than the saved mixed-model parses, and a bounded second read recovered a real dense-calendar omission. The broad route still needs explicit eligibility/fallback behavior and an image-access repair or recovery path. `processDataset` and `processDatasetResume` remained on their prior GPT-5.2 configuration throughout this cohort.

## Method

Six source-reviewed posts were frozen in `artifacts/luna-cohort-2026-10-01/manifest.json` before replays. Every new task used `full5stage`, `dryRun:true`, an exact post ID on `processDatasetSelectedRows`, and a saved Firestore parse snapshot. This is a regression cohort of previously reviewed sources, not a statistically representative sample or fresh blind set. The six separate self-taken Factory/Hunter's calendar photos remain held out.

| Case | Source expectation | Latest result | Luna model estimate | Saved legacy estimate | Outcome |
| --- | --- | --- | ---: | ---: | --- |
| Hunter's four-day poster | 5 date/start slots | 5 | $0.00556 | $0.03795 | Coverage pass, managed poster retained |
| Downtown Charlottetown long caption | 28 slots | 28 | $0.008974 | $0.01537 | Count pass; venue resolution still needs review. Legacy here was mini/nano, not 5.2. |
| Clamdiggers five-image gallery | separate 12:00–14:00 lunch and 18:00–21:00 dinner | 2 correct seatings | $0.010192 | $0.08408 | Source-time and ticket-link pass; each payload retained the five post images plus ticket image |
| Pints East festival gallery | onsite festival plus offsite vendors market | 0 | $0.003266 incurred | $0.06910 | Unscorable: `legacy_retry_no_items: preprocessed_image_missing`; Stage 3 was not a fair Luna read |
| Cornfest, audit off | 15 timed slots | 12 | $0.014038 | $0.09910 | Coverage fail: Sunday corn shucking, HACHE, BBQ omitted |
| Cornfest, dense audit on, repeat 1 | 15 timed slots | 15 | $0.017917 | $0.09910 | Primary read complete; second read found no additions |
| Cornfest, dense audit on, repeat 2 | 15 timed slots | 15 | $0.017872 | $0.09910 | Primary 13; second read found 15 and safely added HACHE and BBQ, zero conflicts |
| Kids Fox Trot | Friday pickup plus Saturday race | 2 | $0.004911 | $0.03427 | Source times/venues and registration URL retained; both payloads carry two managed post images |

The Luna figures apply [OpenAI's Standard short-context rate](https://developers.openai.com/api/docs/models/gpt-6-luna) of $0.10 per million input tokens and $0.50 per million output tokens to snapshot usage without cache discount. They exclude cache writes, infrastructure and tax. Legacy estimates are taken from saved older mixed-model runs, so these are directional comparisons rather than paired invoices. The final Cornfest audited repeat is about 82% less than its legacy estimate while matching the 15 source slots. Do not count Pints' low charge as a saving: it produced no event.

## Dense-calendar trigger finding

The unaudited Cornfest run extracted 12 while Stage 2 estimated only 13. The previous `estimatedItemCount - timedPrimaryCount >= 2` gate suppressed the independent inventory read. Commit from this cohort removes that unreliable count gate for already selected dense calendar frames. The read remains bounded to two frames, and guarded reconciliation still refuses disputed or unanchored additions. In the second audited replay, the primary read found 13, the two-frame inventory found 15, and exactly two additions from source gallery image 2 survived Stage 4/5. The final 15 use nine primary images from gallery image 1 and six from image 2. The task log reports `dryRun:true`, `eventsCreated:0`, `eventsUpdated:0`.

## Operational state and next release gate

The code change was built, all eight focused reconciliation tests passed, and a codebase-qualified Firebase dry run passed. Only `gathr-functions:processDatasetSelectedRows` was deployed; the Firebase CLI warned that `firebase-functions` is outdated. The selected service was temporarily allowlisted first for six posts, then for Cornfest with `LUNA_CALENDAR_INVENTORY_AUDIT=true` and `LUNA_CALENDAR_INVENTORY_APPLY=true`. All four flags were removed after the queue emptied. Latest selected revision is `processdatasetselectedrows-00353-rl4`; scheduled main/resume remain `processdataset-00434-giw` and `processdatasetresume-00398-nam`. All three have zero `LUNA*` environment variables.

Before a broader switch, implement an explicit routing policy: use Luna high with the bounded inventory audit for dense source calendars; keep known unsafe season-long recurrence boards and broad linked-calendar scope decisions on the current route; preserve venue review holds; and define a source-image recovery/fallback rule when preprocessing cannot retrieve historical or current media. Then run a small live allowlisted pilot with backups and monitor its exact snapshots/writes before expanding traffic. This cohort does not establish private photo-share parity or arbitrary dense-calendar routing.

Evidence: `artifacts/luna-cohort-2026-10-01/results.json` and the workbook under `outputs/luna-cohort-2026-10-01/luna-cohort-evidence.xlsx`. Key snapshots are `1yjqqEOctulJcObGboRVelF0ySiiMaEXj_0_1790896711317` (12), `1yjqqEOctulJcObGboRVelF0ySiiMaEXj_0_1790897779854` (15 primary), and `1yjqqEOctulJcObGboRVelF0ySiiMaEXj_0_1790898078439` (13 plus two guarded additions).
