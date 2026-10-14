# October 14 exact follow-up repair plan

Prepared and dry-run verified. No live event/venue changes have been made.

## Scope

1. Create exactly the 17 APM Centre events below from the original posters. Keep all 16 printed hockey sessions, including the 70-minute U15 session. The volunteer meeting keeps its explicit 18:00 start with unknown end; remove the unsupported 23:00 category default. Preserve source/media and room labels.
2. Move `venues/slug_harbourfronttheatre/events/pZJuPZ8TpO1MYUgCndDD` to `venues/slug_macnaughthistorycentrearchives/events/pZJuPZ8TpO1MYUgCndDD`. October 15 Ghostwalk departs MacNaught at 18:30. End 21:00 is derived from last departure 20:00 plus approximately 60 minutes. Preserve source/media and guard source and target venue versions.
3. Create `venues/slug_acadianmuseumpei`, verified Google Place `ChIJK6SplcOFX0sRQ3eogngsm5g`, 23 Main Dr E, Miscouche. Create only `venues/slug_acadianmuseumpei/events/bellealliance_nuitmusee_20261022` and `venues/slug_acadianmuseumpei/events/bellealliance_nuitmusee_20261023`: Night at the Acadian Museum, 18:00–21:00, six scheduled half-hour starts through 20:30, with dated tickets and language/availability details. End 21:00 is duration-derived. Use the already-managed original festival program as event media, never a venue profile.

Connolly Park remains held in Souris. No road pin, broad replay, duplicate deletion, or media deletion is included.

## Backups and verification

APM dry-run backup: `functions/artifacts/venue-resolution-oct14/apm-recovery/backup-2026-10-14T19-06-50-264Z.json` in this worktree.

Location backup/report: `C:/Users/craig/Dev/gathr-apps-script/firebase/artifacts/oct14-location-followup/backups/` and latest Ghostwalk/museum dry-run report.

Before apply: reread exact targets/venue versions, scan related source/date siblings, abort for active parsing or drift, save fresh full backup. After apply: reread every target, confirm source siblings and clocks, check details and paginated app event feed. No media is deleted.

## APM exact targets

| Event | Date/time | Create path |
|---|---|---|
| North River Flames Boys' Evaluation - U9 Group 1 | 2026-10-16 16:00–17:00 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_c46d0f8dac311d9d |
| North River Flames Boys' Evaluation - U9 Group 2 | 2026-10-16 17:10–18:10 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_2e5208ec6d6aa768 |
| North River Flames Boys' Evaluation - U9 Group 1 | 2026-10-17 10:20–11:20 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_f3c1a225265c45bb |
| North River Flames Boys' Evaluation - U9 Group 2 | 2026-10-17 11:30–12:30 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_4e13080777afe158 |
| North River Flames Boys' Evaluation - U11 Group 1 | 2026-10-17 12:40–13:40 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_d41a30eaffea5508 |
| North River Flames Boys' Evaluation - U11 Group 2 | 2026-10-17 13:50–14:50 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_1edf23feab4256f2 |
| North River Flames Boys' Evaluation - U11 Group 1 | 2026-10-20 16:00–17:00 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_e3e213c080efb0f8 |
| North River Flames Boys' Evaluation - U11 Group 2 | 2026-10-20 17:10–18:10 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_6cc02d3d9bd0f556 |
| North River Flames Boys' Evaluation - U13 Group 1 | 2026-10-17 16:10–17:10 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_c22342d35f2808ff |
| North River Flames Boys' Evaluation - U13 Group 2 | 2026-10-17 17:20–18:20 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_d1801c0da011dfbc |
| North River Flames Boys' Evaluation - U13 Group 1 | 2026-10-22 17:10–18:10 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_298f2b6a663ee2d9 |
| North River Flames Boys' Evaluation - U13 Group 2 | 2026-10-22 18:20–19:20 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_c256658ec8f9b87b |
| North River Flames Boys' Evaluation - U15 Group 1 | 2026-10-18 16:20–17:20 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_6844ec126663d0d8 |
| North River Flames Boys' Evaluation - U15 Group 2 | 2026-10-18 17:30–18:30 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_af079f76dc874db8 |
| North River Flames Boys' Evaluation - U15 Group 1 | 2026-10-23 17:10–18:20 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_4b86451ea964fa4a |
| North River Flames Boys' Evaluation - U15 Group 2 | 2026-10-23 18:30–19:30 | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647737666047_d5a6c22fffe73f90 |
| Golf Fundraiser Volunteer Meeting | 2026-10-15 18:00–unknown | venues/ItWg0uH2yXtETbhlepAJ/events/oct14_apm_1744647037666117_7cba129405246001 |
