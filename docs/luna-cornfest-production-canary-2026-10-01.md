# Cornfest selected-row Luna dry run — 2026-10-01

## Runtime and safety

- Parser source revision: `5c43f6e` (`codex/luna-parser-live-merge`). Focused tests passed after final prompt revision; full parser suite passed 183/183 before the final wording revert.
- Three parser functions were deployed with Luna flags off. The selected-row service was temporarily limited to post `1547968420692186` for a dry run only. The first task had malformed environment flag parsing and did not route to Luna; it produced no events. The flags were corrected before the second task.
- Corrected task: `luna-cornfest-layout-dry-20261001150728`, run 2026-10-01 18:07–18:10 UTC, snapshot `1yjqqEOctulJcObGboRVelF0ySiiMaEXj_0_1790878214581`.
- Logs confirmed `Exact-post Luna canary selected`, Stage 1 accepted, Stage 2 classified `CALENDAR`, and a Luna full-image Stage 3 route. Dry-run snapshot has `dryRun: true`, parser mode `full5stage`, five Luna calls, 53,776 input tokens and 17,831 output tokens. Batch log reports zero new events, updates, food specials, or dedup updates.
- After completion, selected-row revision `processdatasetselectedrows-00311-cpd` serves 100% traffic with no Luna flags. `processdataset-00433-zik` and `processdatasetresume-00397-vel` also have no Luna flags.

## Source score

The four screenshots form one Cornfest post; slides 2 and 3 contain the schedule, and slide 4 repeats the Saturday market. Source review expects 15 distinct timed activity slots when the Saturday pickleball tournament's morning and afternoon sessions are counted separately. The dry run returned 13. Its Stage 3 item list and final snapshot omit the Sunday `ENTERTAINMENT` (2:00–4:00 pm, HACHE) and `CORNBOIL & COMMUNITY BBQ` (2:00 pm). Stage 4 kept all 13 extracted items, so this is a Stage 3 coverage miss. A local repeat had included HACHE as a generic `ENTERTAINMENT` title, showing run-to-run variability; another local repeat missed it.

All 13 final records point to managed post media, not the profile icon. The first nine choose the main schedule slide and the last four choose its continuation slide; all four original gallery images remain in image provenance. The 11:30 Senior's Lunch keeps its printed start time and receives the intended 13:30 estimated end from existing time-resolution code. Other unprinted end times are estimates, not source-verified facts.

## Decision

The exact-post canary failed the reviewed 15-slot coverage criterion. Broad Luna activation remains off. A bounded second-look method should target missed source-supported listings and be tested against gallery provenance, duplicate handling, and cost before another switch decision. The four original screenshots and a source-specific question for external review are in `artifacts/cornfest-google-chat-2026-10-01/`.
