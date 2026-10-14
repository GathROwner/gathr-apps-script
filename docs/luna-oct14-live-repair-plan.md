# October 14 exact live event repair plan

Status: **Craig approved this exact batch; all26 changes were applied and verified on October14 at18:01 UTC.**

26 targets: **8 deletes,4 updates,14 creates**. Fourteen new records restore Harmony’s four printed November Wednesdays plus13 source-verified festival activities. All clocks below are Halifax local.

## Guarded evidence

- Machine plan: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\luna-oct14-repair\live-plan-2026-10-14T15-36-18-437Z.json`
- Full backup: `C:\Users\craig\.codex\worktrees\luna-accounting-release\gathr-apps-script\functions\artifacts\luna-oct14-repair\live-backup-2026-10-14T15-36-18-437Z.json`
- Default-dry repair script: `firebase/repair-luna-oct14-integrity.mjs`
- Apply requires the exact approved machine-plan file, unchanged target data/update times, unchanged source/venue siblings and no active parser. The26 mutations are one atomic batch; normal updatedAt timestamps are refreshed. No media is deleted.

## DELETE

| Event | Date/start | Intended action | Exact path |
|---|---|---|---|
| Male U9 A/Rec Conditioning Session | 2026-10-16 09:20 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/Bc249Rqr374nSPC5ndZs` |
| Male U9 A/Rec Conditioning Session | 2026-10-23 09:00 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/leUhUmHcEuM48hg8PUhf` |
| Male U11 A/Rec Conditioning Session | 2026-10-17 11:40 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/v1dfWxtnoLnvI0Ruhhcs` |
| Male U11 A/Rec Conditioning Session | 2026-10-24 04:00 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/5FTkut3T5d5KCclsuQtL` |
| Male U13 A/Rec Conditioning Session | 2026-10-16 05:40 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/O7vemBuoK4VtmSaDOj5i` |
| Male U13 A/Rec Conditioning Session | 2026-10-23 05:10 | Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified. | `venues/ItWg0uH2yXtETbhlepAJ/events/qsbHiAurDCbdCPAeRzIj` |
| ANCHOR Fest Jim Queen | 2026-10-15 21:00 | Downtown Jim Queen 21:00 conflicts with cinema-owner 21:30; preserve NJzspju9NlqTrmGPEumW. | `venues/slug_thetivolicinema/events/kcj1QvFVL5I78GNtZSF6` |
| Anchor Fest Opening Night Film, Back in Black | 2026-10-14 19:00 | Exact October14 19:00 Back in Black aggregator duplicate; preserve 9hRzOvheJh5llYmNNDdt and hold the separate 19:30 source conflict. | `venues/slug_citycinemachtown/events/bi8tjyu0PjfessyR0eGi` |

## UPDATE

| Event | Date/start | Intended action | Exact path |
|---|---|---|---|
| Roots & Shoots Summerside | 2026-10-20 18:00 | Peer-support activity with incidental pizza; poster confirms existing October20 18–20 date/time. | `venues/KeaYNQ0m7AfE583KyS5R/events/KONZP3s2tJNWCQRKvrB9` |
| Lorena McKennitt, The Mask and the Mirror 30th Anniversary Tour | 2026-10-15 19:30 | Anniversary concert tour at theatre is live music, not cinema. | `venues/slug_sobeyfamilytheatre/events/LLfTk1jgPz6tavQqfqlO` |
| Island Jazz ft. Nadine Haddad | 2026-10-15 20:00 | Named Nadine guest is one October15 show; restore visually verified first-party source poster and retain the existing venue icon. | `venues/fb_100057766283684/events/d4G5oioihLF6AgHz5Q0L` |
| Soup of the Day | 2026-10-14 10:00 | Today soup feature cannot continue beyond printed 20:00 close. | `venues/slug_tipsyfarmers/events/mh2kHTJ20kdp5SannxDp` |

## CREATE

| Event | Date/start | Intended action | Exact path |
|---|---|---|---|
| Jazz-ish with Carlie Howell & Friends | 2026-11-04 19:00 | Add 19:00–21:00; weekly_wednesday; Live Music | `venues/BKaKU7O4J56sipdJRrHM/events/oct14_repair_jazzish_november2026` |
| Murder Mystery Night (in French) | 2026-10-16 18:00 | Add 18:00–21:00; none; Gatherings & Parties | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261016_1` |
| Michel Robichaud in Concert! (in French) | 2026-10-17 17:00 | Add 17:00–19:30; none; Live Music | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261017_2` |
| Wood Painting Workshop (in French) | 2026-10-19 18:30 | Add 18:30–21:00; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261019_3` |
| Charcuterie Board (in French) | 2026-10-20 18:30 | Add 18:30–20:30; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261020_4` |
| Encaustic Art Workshop (in French) | 2026-10-21 18:30 | Add 18:30–20:30; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261021_5` |
| Baie in Concert! (in French) | 2026-10-24 18:30 | Add 18:30–20:30; none; Live Music | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261024_6` |
| Stained Glass Workshop (in French) | 2026-10-26 18:30 | Add 18:30–20:30; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261026_7` |
| Cooking Workshop & Tasting with Chef Robert Pendergast (in French) | 2026-10-27 18:30 | Add 18:30–20:30; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261027_8` |
| Little Chefs and Pumpkins (in French) | 2026-10-28 17:00 | Add 17:00–20:00; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9` |
| Stained Glass Workshop (Part 2) | 2026-10-29 18:30 | Add 18:30–20:30; none; Workshops & Classes | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261029_10` |
| Halloween Costume Parade | 2026-10-30 09:00 | Add 09:00–12:00; none; Gatherings & Parties | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261030_11` |
| Anniversary Gala — Cap Rouge, Louise, Jonathan & Shane Arsenault, Patricia and Marcella Richard, Riel and Rémi Arsenault | 2026-10-30 17:30 | Add 17:30–20:30; none; Live Music | `venues/slug_centrebellealliance/events/oct14_repair_festival_20261030_12` |
| Storytime – Même pas peur ! (in French) | 2026-10-31 10:00 | Add 10:00–12:30; none; Workshops & Classes | `venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13` |

## Additional safeguards

- Preserve official Jim Queen21:30 keeper `NJzspju9NlqTrmGPEumW`.
- Preserve Back in Black19:00 keeper `9hRzOvheJh5llYmNNDdt`; the separate19:30 source conflict remains held.
- PEERS remains October20 18:00–20:00, confirmed by its recovered poster. Change category/type flags only.
- Nadine remains October15 20:00–22:00, becomes one-off and regains its source-verified poster. Generic Island Jazz series is unaffected.
- Today’s Tipsy soup ends20:00 as explicitly advertised. Expired October13 meal history is retained.
- Harmony is exactly November4/11/18/25 at19:00. Its21:00 end is marked inferred.
- Festival creates bind to existing Centre Belle-Alliance or J.-Henri-Blanchard library, never publisher Carrefour ISJ. Eleven matching registration pages supply explicit ends and ticket links; parade09:00–12:00 is printed, second glass-session end20:30 is marked inferred.
- Do not recreate existing Raine/Chantal or Barktoberfest, or the expired Red Ribbon event.

## Verification after approval

Re-read all26 paths, verify every approved field and deletion, compare untargeted source/venue siblings with the backup, check each API detail response and paginate the complete upcoming app feed. Confirm absent deleted IDs, correct categories/one-off/closing time/posters, one bounded four-show Harmony parent and exactly13 new festival one-offs. Report the separate Back in Black19:30 conflict without deleting it.

## Separate location/source follow-up

[Prepared handoff](luna-oct14-location-followups.md) covers the existing Ghostwalk under Harbourfront Theatre instead of MacNaught, the missing Acadian Museum venue for12 slots, Water Street area identity, the corn-maze conflicting clock, and resident-only access questions. Craig also approved sending it to **Review GathR location queues**. The read-only investigation was dispatched; this does not authorize additional live mutations.

## Applied result

The guarded atomic batch passed every approved fingerprint, complete-document
hash, update-time and sibling guard before writing. Fresh prewrite backup:
`functions/artifacts/luna-oct14-repair/live-backup-2026-10-14T18-01-00-776Z.json`.
Result: `functions/artifacts/luna-oct14-repair/live-result-2026-10-14T18-01-00-776Z.json`.

All26 Firestore postconditions passed. All8 deleted IDs returned404 and were
absent from the complete upcoming feed. The18 retained/new API details and
feed entries matched the approved categories, venue IDs, dates, clocks,
recurrence, posters and ticket links. The feed was fully paginated across11
pages;1032 entries were observed at verification. All6 distinct managed poster
URLs returned200. All35 untargeted source/related sibling records were unchanged.
Harmony retains exactly4 bounded Wednesdays, November4/11/18/25, with no
open-ended recurrence. Nadine is one-off with its restored poster; PEERS and
McKennitt have corrected activity categories; today's Tipsy soup ends20:00.
The13 festival records use their verified existing venues and printed/matching
registration clocks; no uncertain museum/area/corn-maze records were created.

Evidence: `live-verification.json` and `live-api-contract-verification.json`
under `functions/artifacts/luna-oct14-repair/`. No media or venue document was
deleted or modified, and no parser deployment was needed for this data batch.
