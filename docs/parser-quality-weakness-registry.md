# GathR parser-quality weakness registry

Last updated: 2026-10-12 (Atlantic)

This is a cumulative evidence register, not a list of venue IDs to decode. A technical ID is always paired with the venue or event name. Future audits should add a new observation to an existing pattern when the failure mechanism is the same; only create a new pattern when it is materially different.

Status meanings:

- **Confirmed live data**: a bad document exists and needs a separately approved, backed-up data repair.
- **Locally hardened; not deployed**: a narrow parser guard and regression test now pass locally, but production will not change until deployment is separately approved.
- **Open code weakness**: evidence indicates a parser problem that still needs a reproduction, code change, and regression test.
- **Deployment uncertainty**: current production configuration or version is not proven.
- **Control evidence**: a healthy invariant to compare against future parses.

## Current parser and location-resolution patterns

| Pattern | Status | Human-readable evidence | What the weakness means | Next evidence or action |
|---|---|---|---|---|
| PQ-001 Source address leaks into sibling venues | Confirmed live data; open code weakness | 22 current outputs. Twenty-one events at multiple venues retained the source-page address `1 Weymouth Street`. “Highland Storm: The Elements 2026 (Last Showing)” at The Scott MacAulay Performing Arts Centre — `venues/slug_thescottmacaulayperformingartscentre/events/u83QH3zA7ump64SiiUCx` — retained `286 Fitzroy Street`; the venue parent says `619 Water Street East`. | A source/page address can survive after the event resolves to a different canonical venue. The venue is right but the displayed address can be wrong. | Add a stage-resolution regression where a schedule item resolves to a canonical venue whose name is not already an alias. Repair live addresses only with a backup and parent-address recheck. Relevant code: `functions/src/processing/rowProcessor.ts`; tests: `rowProcessor.stageVenueResolution.test.ts`. |
| PQ-002 Operating hours become events | Locally hardened; not deployed. Existing live document remains. | “Robert McMillan Pottery Gallery & Studio Open (Friday)” at Robert McMillan Pottery — `venues/FYlk4v0MPOrrIz1IJMg7/events/CLiWgvVbdGvLd6O8xPUC` — is a store/studio-hours listing (`Open 10-5pm Wed-Sun`), not a discrete event. | The parser can treat ordinary opening hours as a recurring event. | A narrow Studio Open hours filter and exact regression were added on 2026-08-14. Deployment and deletion of the existing live document are separately approval-gated. Relevant code/test: `functions/src/parsing/finalFormatter.ts`, `finalFormatter.operationalHours.test.ts`. |
| PQ-003 Pool schedules and closures need activity-aware classification | Product policy clarified; re-audit needed | An older audit counted seven pool-open schedule blocks and two pool-closure notices as bad. On October 4 Craig clarified that bookable family activities and activities generally belong in GathR; available rink time is an event-like booking opportunity. | Public swim and bookable availability may be valid activities even when presented as a facility schedule. A closure notice alone is different. The old nine-row verdict cannot justify blanket deletion. | Re-review each source for a public activity or booking opportunity. Preserve valid swim/ice slots, and assess closures individually. Do not apply the old blanket rejection rule. |
| PQ-004 Retail merchandise is mislabeled as a food special | Locally hardened; not deployed. Two existing live documents remain. | “Porch Goose Price” at Kool Breeze Farms — `venues/slug_koolbreezefarms/events/AOUNKnjFohxhHQ1QrsqH`; “Porch Goose Outfits Sale (Now $19.99)” at Kool Breeze Farms — `venues/slug_koolbreezefarms/events/YabtHD1QPjYqbV4NYtSU`. | A price plus a product promotion can be accepted as an event/food special even though it is retail merchandise. | A merchandise-promotion filter and exact regressions were added on 2026-08-14, with a counterexample preserving a real public market. Deployment and deletion of the two live documents remain separately gated. Relevant code/test: `functions/src/parsing/finalFormatter.ts`, `finalFormatter.categoryGuardrails.test.ts`. |
| PQ-005 Post timestamp substitutes for event time/date | Confirmed live data; open code weakness | “Highland Storm: The Elements 2026 (Last Showing)” at The Scott MacAulay Performing Arts Centre — `venues/slug_thescottmacaulayperformingartscentre/events/u83QH3zA7ump64SiiUCx` — starts at `14:43`, consistent with post-time fallback, despite source wording describing a show “Tonight.” | When event time evidence is weak, the parser can publish the post timestamp as the event start. | Reproduce with the source row, require explicit or trusted structured start-time evidence, and add a regression before repairing the live event. |
| PQ-006 Sentinel end times look like real times | Open code weakness; broad exposure | 88 of 135 audited outputs lacked explicit end-source evidence. Forty-five used visible fallback endings: 32 at `01:00` and 13 at `23:00`. | Internal defaults are visible to users as if the source supplied them. | Preserve end-time provenance, avoid displaying a synthetic end as explicit, and test structured Facebook Events, post-derived events, overnight events, and missing-end cases separately. Relevant test: `rowProcessor.facebookEventsEndTime.test.ts`. |
| PQ-007 Route or procession output bypasses review | Product representation implemented; live Gold Cup example repaired; parser automation remains open | Earlier evidence: “Souris Fall Frolic” trail walk/run — `events/cityevt_46a7ea38f79dd5183575c3a0`; “March For Jesus PEI” at Confederation Landing Park — `venues/v1GqfyMX7ls7yalcCNSo/events/L5iRwRN9amW8zIWGT3OZ`. On 2026-08-21, the missing “2026 Gold Cup Parade” was published as the route-scoped top-level event `events/cityevt_96c4874dc22686d3dfbb3eee`; the incorrect venue-scoped copy “2026 Gold Cup Parade” at Port Charlottetown — `venues/slug_downtowncharlottetowninc/events/2W5TmZRVv9J1TUZRQDt2` — was backed up and deleted. A follow-up exposed a second weakness: the organizer-confirmed full street sequence was labelled “suggested” merely because its drawable coordinates came from map road centre-lines. | The app can represent an approved route without inventing a venue. Route evidence certainty is now separate from geometry generation: an official complete street sequence is confirmed, while `map_aligned_street_trace` tells users that the coordinates are aligned to map streets rather than organizer GPS. The remaining weakness is automatic classification and evidence extraction. | Add parser regressions for route-like language, official street/stop extraction, and review-only routing. Require `official_full_route` evidence before routed street-centreline geometry can be marked confirmed; stops or routing alone remain approximate. Automatic publication remains intentionally approval-gated. |
| PQ-008 Parenthesized address is stripped before matching | Open code weakness | “Performance Hub, Room 149, Royalty Centre (40 Enman Crescent)” suggested Royalty Crossing — `venues/slug_royaltycrossing` — after the address-bearing parenthesis was stripped. It was instead resolved to Sport PEI at the Royalty Centre — `venues/fb_100064748074456`. | Removing parenthesized text can erase the strongest disambiguating address and create a confident but contradictory venue suggestion. | Add a Royalty Centre/Royalty Crossing regression and reject a stripped-name exact match when the surviving address contradicts the candidate. Relevant code: `functions/src/services/unknownVenueResolver.ts` (`strippedParenthesizedAddress`). |
| PQ-009 Multi-day city event collapses to one day/fallback end | Confirmed review data; open code weakness | “Old Home Week” — `city_level_event_reviews/cityevt_7e2d42cbb63b91544f2fa061` — was reduced to August 14 with a `23:00` ending even though the source describes August 14-22 and an Eastlink Centre anchor. | City-review construction can discard a real date span and replace missing end evidence with a sentinel. | Repair the review only after live recheck; add a regression preserving the full span and anchor without auto-publishing. |
| PQ-010 Multi-location festivals need an area representation | Product representation implemented; parser automation remains approval-gated | “Charlottetown Busker Festival” is published as one area event — `events/cityevt_4ee27cac80987ba50dfa5e9a` — with three named, confirmed locations: Victoria Row, Founders Food Hall & Market, and Peake's Quay. The source review is terminal at `city_level_event_reviews/cityevt_4ee27cac80987ba50dfa5e9a`. | A festival footprint is neither one durable venue nor an ordered route. The reusable representation is one umbrella event with `venueId: null`, `locationScope: area`, `mapMode: area`, and unordered `areaData.locations`. The app shows each point and never draws a connecting line. | Use Busker as the canonical regression fixture. Future multi-location candidates remain review-only until every displayed point has reliable evidence; do not create duplicate component events or infer a visiting order. Contract: `firebase/area-event-contract.js`; app display: `utils/areaEvent.ts`. |
| PQ-011 Broad post-derived locations are not publish-safe | Guardrail confirmed; one secondary-event hijack closed | The incorrect “30th Anniversary International Shellfish Festival Chef Challenge” review — `city_level_event_reviews/cityevt_9a35a5fb568fa4d8e1e0a7be` — was ignored. Its source image/post actually promoted “FireWorks Feast (Guest Chef: Chef Tyson Wright)” at The Inn at Bay Fortune — `venues/fb_100063617721610/events/qqQh5hArOlTMPqcun4pq`. No Charlottetown event or venue was created from the bad extraction. | A post can mention a secondary event or competition while promoting a different primary occurrence. Broad location text plus a date range is not enough to publish the mentioned secondary event. | Add an image/post-alignment regression where the mentioned off-site competition must not replace the promoted primary event. Keep broad post-derived candidates approval-gated without weakening the public-source boundary. |
| PQ-012 Organizer/page identity is mistaken for a venue | Queue item repaired; parser pattern remains | “Big Brothers Big Sisters of PEI” home-tour organizer — `unrecognized_venues/uv_6bf3a1baa5ee2995281c7545` — was finalized as ignored; no venue was created. | The page/organizer can be emitted as the physical event location. | Add organizer-vs-location fixtures, especially tours and events spread across private homes. The terminal queue cleanup is evidence, not proof the parser is fixed. |
| PQ-013 Online livestream is matched to a physical organization | Queue item repaired; parser pattern remains | Town of Stratford council livestream — `unrecognized_venues/uv_7ab1bca7ce3d6afe6ddd8690` — was finalized as ignored; no venue was created. | A page representing a town or building can cause an online-only event to look physical. | Add online/livestream regressions that allow a physical venue only when the event itself gives an in-person location. |
| PQ-014 Chain-wide promotion is treated as a local event | Queue item repaired; parser pattern remains | A&W Canada all-locations promotion — `unrecognized_venues/uv_e0769504be12dc802194126d` — was finalized as ignored; no venue was created. | National/chain advertising can be routed into a local venue workflow. | Add multi-location chain and generic promotion fixtures before venue resolution. |
| PQ-015 Exact or strongly evidenced venue still reaches manual review | Queue items repaired; open resolver weakness | “Stanley Bridge Hall” was resolved to Stanley Bridge Hall — `venues/qUg3AMPeXX9URM0UrXEA`; “Stratford Library” required creation of Stratford Public Library — `venues/slug_stratfordpubliclibrary`. | Strong name, page, address, or Place ID evidence is not consistently used early enough. | Compare future misses by match channel (name, alias, Facebook URL, page slug, address, Place ID) and add a regression for each repeated channel failure. |
| PQ-016 Room/green-space labels fail to inherit their parent venue | Queue items repaired; open sublocation weakness | “Founders Food Hall green space” and “Sounds of the Waterfront” were resolved to Founders’ Food Hall and Market — `venues/slug_foundersfoodhall`; “Performance Hub, Room 149” was resolved to Sport PEI — `venues/fb_100064748074456`. No aliases were added because those labels describe spaces/program context, not durable alternate venue names. | Room, lawn, green-space, and program labels can mask a well-known parent venue. | Add parent/sublocation relationship tests. Do not add every room or program title as an alias. |
| PQ-017 Sparse or mixed physical-location evidence remains ambiguous | Active manual reviews | “Alberton Day Market” — `unrecognized_venues/uv_18c06bd133d075aceb623917`; “William Callbeck Centre board room / Bedeque Museum” — `unrecognized_venues/uv_c530a5c8d38fd3b003654a12`. | The parser lacks enough consistent evidence to choose a durable venue safely. | Keep manual review. Seek an official address/source and distinguish building, room, organizer, and museum before any create or resolve action. |
| PQ-018 Shared-event production behavior is unverified | Deployment uncertainty | Shared-event collections were empty; Cloud logs reported `scheduledSharedEventPublicCandidateProcessor disabled by env flag`. | There is no current live evidence that the scheduled public-candidate path runs as intended. | Verify intended environment configuration and deployed version. Do not infer safety from an empty collection. |
| PQ-019 Image field can be empty despite provenance | Low; open investigation | All 135 audited documents contained provenance, but one lacked an image. | Image selection/upload can fail independently of event provenance. | Identify and preserve the exact path in the next audit, then determine whether the source truly had no usable image or the image stage failed. |
| PQ-020 Stale/past occurrences can enter a fresh parse | Open code/data-policy weakness | The August 14 parse produced several events dated August 13 or earlier. | A current parse can publish already-expired occurrences when source text or recurrence handling is stale. | Count by age and source type in future audits; add an admission-policy regression with a narrow grace window instead of deleting all past-looking rows blindly. |
| PQ-021 Umbrella festivals and their named component events can be conflated | Pattern evidence; classification and dedup guard needed | Official 2026 material describes Old Home Week as the August 14-22 umbrella program, the Gold Cup Parade as a 10:00 AM downtown route event on August 21, and the 67th Gold Cup & Saucer as harness racing at Charlottetown Driving Park on August 22. Current data also includes the broad Red Shores record “Gold Cup & Saucer (Old Home Week PEI)” — `venues/fb_100052606604879/events/WdHMM9R4rqjVFk4TPtUg` — spanning August 13-22. | Shared branding and overlapping dates can cause the parser or duplicate merger to collapse the week-long festival, parade, racing program, and marquee race into one record—or incorrectly use one component's venue for another. | Add a family-aware regression: preserve one Old Home Week umbrella record, one route-scoped Gold Cup Parade record, and distinct racetrack records for the Gold Cup & Saucer race/program. Allow related-family metadata, but do not merge records solely because they share “Gold Cup,” “Saucer,” or “Old Home Week.” Recheck the broad Red Shores record separately before proposing any live change. |
| PQ-022 Traffic-impact notices can supply a real event with the wrong schedule and scope | Live review repaired; open parser weakness | The Town of Stratford notice became “Gran Fondo PEI cycling (crossing Stratford / Hopeton Road & Trans Canada Highway intersection)” with `11:00-16:00`, but those are traffic-impact hours at one crossing, not the event schedule. It was replaced by “Gran Fondo PEI 2026” — `events/cityevt_ee219deda87a72f41a2f657b` — covering August 28-29 with confirmed Eastlink Centre and Stratford-crossing points and no invented course line. | A traffic advisory may prove an event and one location while still being unsafe as the title, overall schedule, or complete route. | Add a regression that preserves traffic-impact time as location metadata, requires an official event source for the event span, and never promotes a single crossing into the full route. Multiple route variants without current verified geometry must render as area points, not a line. |
| PQ-023 Correct venue address can coexist with stale coordinates | Confirmed live data repaired; ingestion weakness open | Eastlink Centre Charlottetown — `venues/slug_eastlinkctrpei` — had the correct address `46 Kensington Road, Charlottetown, PE C1A 5H7, Canada` but coordinates `46.4091112,-63.3481532`, far outside Charlottetown. It was repaired to `46.2458204,-63.1171685` after matching the official address to OpenStreetMap way 28327181. | Coordinate refresh and address normalization can disagree without a guard noticing the distance contradiction. Any event using the venue then appears in the wrong part of the map. | Add an address-to-coordinate distance sanity check after Places/contact-info updates. Quarantine large moves or city/address contradictions for review instead of accepting either field independently. |
| PQ-024 Same-day class slots collapse into one duplicate target | Selected-row code deployed; two live records repaired | Eptek's October 18 Art Club Group 1 and Group 2 originally had wrong stored times. A three-hour duplicate tolerance sent both Luna payloads toward Group 2. The approved October 2 selected-row replay updated separate records `venues/slug_eptek.centre/events/3DO8t0Eyl1TB8scIBfEx` (12:30–13:45) and `venues/slug_eptek.centre/events/nOz8TgJISaSmdkMUVNzY` (14:15–15:30), preserving eight Sunday occurrences each. | A broad time tolerance can merge distinct named sessions on one day. | Keep explicit Group/Slot ordinals and printed start/end evidence in duplicate matching; use the [October 2 canary audit](luna-different-live-canary-2026-10-02.md) as the regression reference. Scheduled main/resume have not received this code yet. |
| PQ-025 Approximate organizer end becomes an invented category end | Selected-row code deployed; scheduled path pending | Taste of Georgetown's lunch and dinner seatings have explicit noon and 6 PM starts but approximate finishes on the organizer page. A dry run supplied 1 AM ends through Stage 5.5; the corrected dry run leaves exact ends blank and maps lunch and dinner to distinct existing records. | A downstream category or hours fallback can overwrite a deliberate unknown end after source reconciliation. | Preserve the approximate-end marker through Stage 5.5 and keep the exact end blank; retain legacy fallbacks for ordinary events. See the [October 2 canary audit](luna-different-live-canary-2026-10-02.md). |
| PQ-026 Facebook resize variants fail managed-gallery guard | Code deployed October 4; next full run pending | Side Door Studio's Saturday Night Tango post and Red Island Cider's Farm Day post each supplied three Facebook URLs with one CDN attachment path. Display upload selected one representative, but the Luna guard required a managed URL for every original variant. Side Door's October 17 Tango occurrence was absent. | A valid duplicate source URL can be mistaken for a failed image upload, holding the whole post before Stage 3. | Commit `7d959da` maps all same-attachment Facebook variants to the representative's successfully uploaded managed URL while leaving genuinely missing uploads held. Unit regression and Side Door full dry extraction passed; check production holds and image provenance in the next full run. The missing October 17 record was added with a guarded backup on October 4. |
| PQ-027 Schedule AM/PM typo yields an overnight sports booking | Live record repaired; general guard open | Eastern Kings Sportsplex's October 10 poster prints MACPHEE 11:20–12:20 AM, followed by a 12:30–1:30 PM rink slot. Luna's final payload stored MACPHEE through 12:20 AM the next day, a 13-hour booking. | A single mistyped AM/PM marker can survive normalization despite contradictory adjacent schedule order. | The live MACPHEE end was corrected to October 10 at 12:20 PM with the source ambiguity stated in its description. Add a cross-slot chronological check in a separate parser change before treating this as a general fix; monitor reparse updates. |
| PQ-028 Food-special weekday math overrides an explicit future date | Parser guard deployed; two false records removed | The Local Pub's source and Luna extraction both said October 11–12 turkey dinner. The food-special postprocessor moved the dates to October 4–5 because the descriptions began “Sunday” and “Monday” and the post was published October 4. | A weekday prefix can point to the coming weekday while an explicit month/day in the source identifies the following week. The event path already protected extracted dates whose weekday agreed; the special path did not. | Commit `a0bbde5` gives specials the same weekday-consistency protection. An exact-image dry run kept October 11–12 through Stage 4. The two false live records were backed up and removed October 5; the correct Oct 11–12 records from another post remain. Recheck the next full run. |
| PQ-029 Yearless recent-past date rolls into next year | Luna hold deployed; three false records removed | Harmony House's yearless September 25–26 performances were parsed from an October 3 local post as September 2027, though the organizer and Tourism PEI identify the shows as 2026. | A future-facing date assumption can turn a just-expired source into a false event almost a year away. | Commit `a0bbde5` holds Luna items whose yearless source month/day occurred within the prior 30 days and whose extracted year is the post year or next year. An exact-image replay held all three items even with legacy fallback enabled. The three false 2027 records were backed up and removed October 5. Continue broader past-event admission work under PQ-020. |
| PQ-030 JavaScript-only venue site hides official event time | Deployed; production write pending | Trailside row 221 named Fucked Up and Club Rat on October 8 but neither source photo or caption printed a time. Stage 3.9 fetched the JavaScript-only venue homepage and found no candidates; Stage 4 rejected the untimed show. The venue's first-party event API publishes an 8 PM showtime and ticket link. | A venue may move its event feed behind a first-party proxy while the enrichment code still looks for the former client-side Locarius token. | The enricher now follows a bounded same-origin Locarius proxy route only when declared in the venue's own script, and requires a distinctive title match. An exact-post two-image dry run yielded one October 8 8 PM payload and the ticket link. Audit the next production write. |
| PQ-031 Valid Stage 5 JSON lost when a ticket URL looks like a comment | Deployed; production write pending | Milton Community Hall row 262 passed 20 of 20 Stage 4 items but Stage 5 held the whole post. A diagnostic replay captured GPT-5 nano responses containing the Elvis and North Milton WI items plus an `https://` URL; the JSON normalization stripped from `//` to end of line before parsing. | Comment stripping ran before direct JSON parsing; one bad final batch discarded earlier successful batches. | Parse valid JSON first, use strict Responses JSON schema, and retry a failed batch in two bounded smaller calls while retaining the all-or-nothing source guard. Exact-post Luna-only dry run yielded 20 event payload previews and no duplicate title/date/time keys. Venue-less election filing notices are excluded before formatting. Commit `d4d463e` is deployed to all three parser entry points; audit the next production write. |
| PQ-032 Same-post schedule sessions lost to fuzzy duplicate tolerance | Deployed; production write pending | Bell Aliant row 187 wrote nine of 11 extracted payloads, losing the 13:00 lane swim and 20:00 leisure pool. Eastern Kings row 228 wrote eight of ten, losing Friday 18:40 U14 and Saturday 14:50 U12 ringette. Cloud Run row logs explicitly marked the four as duplicates of earlier same-post sessions, and Firestore confirms the four are absent. | The sibling unique-ID guard allowed a three-hour title/time similarity match to collapse separate, nonoverlapping sessions from one source post. | Commit `324249b` preserves distinct same-source same-day time windows before fuzzy matching, while still deduplicating overlapping corrected clocks. Four source-grounded regressions and a read-only Firestore check pass. The three parser functions were deployed October 5 on hash `8d6f6fcd92cfabf16bbdae85b829848ce5095c63`. Audit the next production run; the cross-post generic RINGETTE duplicate remains separate. |
| PQ-033 Public pool access mistaken for generic operating hours | Deployed; production write pending | Bell Aliant row 187 caption lists two All pools open windows. An exact-post replay produced 13 Stage 3 items and 13 Stage 4 items, but only 11 final events. | The final formatter explicitly treated `all pools open` as an operating-hours-only title and dropped both source-grounded activity windows. | Commit `f6083f2` keeps dated, timed all-pools-open and splash-pad access while preserving the generic venue-hours filter. The saved 13-item Stage 4 replay through GPT-5 nano Stage 5 returned 13/13, including both pool windows. The three parser functions were deployed October 5 on hash `2b5f179b2aa5689b88b0081d6b19a98255cc155b`. Production writes remain pending. |
| PQ-034 Shared flyer time attached to only one of two printed dates | Deployed; production write pending | Stanley Bridge row 312 flyer places Tuesday October 6 and Friday October 9 above one Leon Gallant & Friends title and 7:30–9:30 p.m. time. Stage 3 extracted two dates but marked Tuesday's start unknown; Stage 4 rejected it. | EVENT prompt gave contradictory instructions on global time versus same-date-region evidence. | Commit `057469dd` clarified that one shared performance block applies to every listed date unless a private per-date time overrides it. Exact-post replay returned two valid payload previews at 19:30–21:30, and the performer's first-party calendar confirms Tuesday's start. The three parser functions were deployed October 5 on hash `5d36a8061dfe9b70cb51a736b4d3062f02bcf928`. Production write pending. |
| PQ-035 Generic rink listing duplicates a detailed schedule post | Parser deployed; one-record live cleanup complete; next full run pending | Eastern Kings had both `RINGETTE` and `Souris Savers Ringette — U12` on October 9 at 16:20–17:20 under the same venue. The U12 source image explicitly prints that slot. The generic record was `owQi3dQZNftKXYnebMjX`; the detailed record is `h0bVbqyWsIXG0anRyWGc`. | General title similarity correctly rejects one-word sport names as proof of identity, but this exact pair has corroborating date, full time window, venue, Facebook page, and the detailed age-group label. | Commit `e59a646` skips an incoming generic `RINGETTE` when a distinct source post from that page already has a detailed age-group ringette entry at the exact slot. It does not merge media or rewrite source identity, and it preserves different dates, slots, pages, sports, or rink labels. Build, 511/511 tests, narrow dry run, and narrow deploy passed; all three parser functions read back ACTIVE on hash `2eb5a94dcd8c2d34230fce0c3ebae01b36acc6d9`. Craig approved exact generic-record deletion. The guarded apply saved both records and same-source siblings, removed only the generic record, and retained the U12 keeper. Firestore readback and public API/detail/feed verification passed; see `docs/luna-oct5-repair-sequence.md` for artifact paths and counts. |
| PQ-036 Ordinary page posts from a matched out-of-region venue bypass event geography check | Parser deployed; 84-record live cleanup complete; next full run pending | Cornwall Public Library row 147 belongs to `library.cornwall.on.ca`; its matched venue `slug_librarycornwallontario` is at 45 Second St E, Cornwall, ON, coordinates 45.0191421,-74.7272033. The October 5 retries produced 86 and eight payloads. The venue held 84 wrong-region records. | The allowed-region coordinate check ran before parsing only for structured Facebook Events. Ordinary posts could match a known out-of-region venue and continue to image processing, AI calls, and writes. | Commit `9f5d27c` checks matched venue coordinates against configured ingest regions before parsing ordinary posts. Missing coordinates remain under existing review safeguards, and structured Facebook Events with explicit allowed event coordinates proceed even if their page venue is remote. The exact row 147 replay stopped with zero events before model calls; build, 512/512 tests, narrow dry run and deploy passed. All three parser functions read back ACTIVE on hash `a615b424fc0f9248eec3c239116aa0e500446762`. Craig approved the exact 84-path deletion; guarded apply saved a fresh complete backup and deleted 84, preserving the venue. Independent Firestore readback found zero child events; 84/84 public detail URLs returned 404, and the 917-event public feed across 10 pages contained no target IDs or recurrence instances. See `docs/luna-oct5-repair-sequence.md` and local cleanup/verification reports. |

| PQ-037 Off-site activity inherits organizer venue and misses its registration URL | Live event corrected; parser deployed at 75%, next full-run proof pending | Carrefour ISJ's October 17 apple picking names Wintermoor Orchard and prints a Jotform registration link. The venue finalizer created Wintermoor, but the replay wrote the event under Carrefour because Stage 5 carried the organizer address into the item. The event also lacked the per-item registration URL. | A copied source address could win before the explicitly named different venue; the event URL was not preserved through formatting. | Commit `d19c774` guards venue precedence and recovers only a URL in that event's own caption block. Exact-path live repair moved the event under Wintermoor and preserved the source link; see `docs/luna-stage3-oct7-75pct-release.md`. |
| PQ-038 Explicit daily special without a numeric price is rejected | Parser deployed at 75%, next full-run proof pending | Craig clarified that an advertised daily special or deal qualifies even without a printed price, while an ordinary month-long featured menu item does not. | Stage 2–4 prompts and Stage 4 validation required price or discount too broadly. | Commit `d19c774` aligns classification, extraction, and validation with the policy. Keep only the advertised special from a broader menu post; preserve the month-long feature exclusion. |
| PQ-039 Stage 3 URL JSON damaged by comment repair | Parser deployed at 100%; next full-run proof pending | October 7 UPEI and Sport PEI posts yielded valid Luna Stage 3 JSON with `https://` registration links, then reported `stage3_no_items`. | The Stage 3 response normalizer stripped `//` inside quoted URLs before trying direct JSON parse, matching the Stage 5 mechanism in PQ-031. | Direct JSON parse and quote-aware comment stripping recover the UPEI and Sport PEI source items in exact-post replays. Sport PEI's virtual-venue write hold remains separate. See `docs/luna-stage3-oct7-75pct-production-audit.md`. |
| PQ-040 OCR date separator invents a clock range | Parser deployed at 100%; next full-run proof pending | Eastern Kings October 7 row 244 primary Luna extraction read six bookable ice slots. OCR supplement read `October 10-10:10am` as a 10:00–10:10 slot, creating a false seventh listing. | Range matching included the printed date before interpreting clock text; a generic OCR title did not merge with the primary slot. | Strip the explicit date before clock-range matching, then merge a generic same-date/same-clock supplement into its primary slot. Exact-post replay retains six correct starts and no false 10:00 listing. The false live record was deleted with Craig's exact approval. |
| PQ-041 Ordinary transactions and filings become standalone events | Parser deployed at 100%; live cleanup verified; next full-run proof pending | October 7 output included an online giveaway, ordinary soup restock, non-food sale, election filing deadline, pumpkin stock, and floral product pickup. | Stage 5 could format a dated post as an event or special despite the lack of an activity or qualifying deal. | A narrow source-corroborated final filter rejects these forms while retaining food deals, bookable activities, workshops, and public gatherings. Eight exact false live records were backed up and deleted with Craig's approval; Firestore, detail endpoint, and paginated app feed checks passed. |
| PQ-042 Historical HTML comments and generic title overlap lend an event a false time | Parser deployed at 100%; next full-run proof pending | UPEI's current Fall Open House page provides October 24 but no public time; a hidden old site comment about a different bookstore open house lent it an 11:30 clock in replay. | Website enrichment parsed HTML comments and treated generic `Open House` words plus a date as sufficient event identity. | Strip HTML comments, including truncated comments, and require distinguishing title agreement before borrowing a clock. Exact-post replay holds the untimed UPEI event instead of inventing a time. |
| PQ-043 Sparse printed session dates are collapsed into weekly fragments | Locally repaired; live parents remain | October 8 Cavendish Farms row 287 carried 20 printed Saturday/Sunday PowerSkating dates. Stage 5 changed category for a consecutive middle block, then promoted it to a weekly parent, inventing November 7/8 while losing printed December dates. | Grouping the recurrence candidate by category hid the gaps in the complete same-name, same-time date series. | Detect the complete sparse date series across category labels and exempt its one-offs from weekly promotion. The actual 20-item Stage 4 payload returned 20 exact one-offs in a no-write Stage 5 replay. See `docs/luna-stage3-oct8-repair-release.md`. |
| PQ-044 Umbrella theme remap erases an already complete weekday lineup | Locally repaired; live Friday/Saturday items absent | October 8 Hunter's row 16 had five activities across Thursday–Sunday in Luna's initial extraction, but the theme-date remap reduced them to two. | The map ran despite a complete dated inventory; the OCR placeholder “May be an image of text” also looked like a month signal. | Skip theme remapping when three distinct dated schedule days already exist, ignore OCR image-description placeholders as date evidence, and check weekday coverage. A local five-stage replay retained all five. See `docs/luna-stage3-oct8-repair-release.md`. |
| PQ-045 Same-day yearless source date is held as recent past | Locally repaired; live omissions remain | October 8 Trailside row 212 and October 7 Evermoore row 226 named events on their own posting day but were held by `recent_past_yearless_source_date`. | The guard included zero-day distance in its recent-past case. | Hold only dates strictly before the post's local date. Same-day and prior-day regression cases pass; see `docs/luna-stage3-oct8-repair-release.md`. |

October 8 also extended PQ-003, PQ-004, and PQ-041: the final source guard
rejects a pool-closure notice, seven ordinary fridge items, an administrative
nomination filing, Christmas merchandise, and a new-product pie notice. A
read-only check against the live documents retained the nine public Bell
Aliant activities, Tipsy Farmers' three advertised specials, and Tignish's
priced grocery deal. The existing false records still require exact approved
cleanup; see `docs/luna-stage3-oct8-repair-release.md`.

## Control evidence from the 2026-08-14 parse

These checks passed and should remain in every future audit so regressions are visible:

- 135 of 135 audited venue-scoped events had an existing parent venue.
- 135 of 135 `venueId` values agreed with the venue document path.
- No current-run top-level city event writes were found in the 135 venue-scoped outputs.
- No impossible-duration events and no exact duplicate-key collisions were found.
- Image provenance existed on all 135 outputs, even though one event had no final image.

## 2026-08-14 review-queue outcome

This queue cleanup fixed review state; it did not by itself fix the parser patterns above.

- Created Stratford Public Library — `venues/slug_stratfordpubliclibrary` — from “Stratford Library.”
- Created Harbourview Training Centre — `venues/slug_harbourviewtrainingcentre` — from “Harbourview.”
- Created Watermark Theatre — `venues/slug_watermarktheatre` — from “Watermark Theatre.”
- Added alias `Charlottetown Legion` to Charlottetown Royal Canadian Legion Branch 1 — `venues/name_1cdqxj`.
- Resolved two Founders labels to Founders’ Food Hall and Market — `venues/slug_foundersfoodhall` — without adding misleading aliases.
- Resolved Stanley Bridge Hall to Stanley Bridge Hall — `venues/qUg3AMPeXX9URM0UrXEA` — without adding an alias.
- Resolved Performance Hub/Room 149 to Sport PEI — `venues/fb_100064748074456` — without adding a room label as an alias.
- Ignored the Big Brothers Big Sisters organizer/home-tour item, Stratford online livestream, and A&W Canada chain-wide promotion; no venue was created for any of them.
- Remaining active unknowns are Alberton Day Market — `unrecognized_venues/uv_18c06bd133d075aceb623917` — and William Callbeck Centre board room/Bedeque Museum — `unrecognized_venues/uv_c530a5c8d38fd3b003654a12`.
- Remaining active city/area reviews are Charlottetown Busker Festival, Old Home Week, Shellfish Chef Challenge, and Classic Car Night at the exact paths listed in PQ-009 through PQ-011.

## Separate automation reliability issue

This is not a parser weakness, so it must not be counted as parser evidence.

- **HB-001 — polling continued after a successful daily audit.** The heartbeat must use a two-state schedule: a noon-only daily gate while dormant, and temporary 15-minute polling only after noon when that day has not yet completed. Immediately after an audit succeeds or the 3:00 PM deadline is reached, it must save the noon-only recurrence before reporting. The current saved recurrence is noon-only: `FREQ=DAILY;BYHOUR=15;BYMINUTE=0;BYSECOND=0` during Atlantic Daylight Time (15:00 UTC equals 12:00 Atlantic).

## Local hardening verification

On 2026-08-14:

- `npm run build` passed in `functions/`.
- Ten targeted tests passed across `finalFormatter.operationalHours.test.ts` and `finalFormatter.categoryGuardrails.test.ts`.
- The exact Robert McMillan Pottery hours example is now rejected locally.
- Both exact Porch Goose retail examples are now rejected locally.
- A real public market mentioning clothing, food, and home decor remains accepted as a counterexample.
- PQ-001 was deployed on 2026-08-14 to `processDataset`, `processDatasetResume`, and `processDatasetSelectedRows`: the source and resolved venue IDs must differ and the parsed address must equal the source venue address before the resolved venue address and coordinates replace it. The exact Highland Storm regression and an off-site-address counterexample pass. Existing live documents still require a separately backed-up repair or selected-row replay.
- The PQ-001 parser fix was deployed, but no deletion, repair, or replay of the existing live bad event documents was performed.

## October 9 Luna pilot follow-up

Regular dataset `1NpfngSPGDDOm9Fb5DcYseMuCe4BdKjGq` completed all 385 rows.
Parser repair `609cedf` addresses mixed closure/named food offers, omitted
explicit public-pool caption windows, between/and range corruption, unsupported
activity post-date fallback, registration-deadline noise, ship-call logistics
and advertised public studio tours rejected as plain shop hours. Bounded
intermediate stage evidence is enabled for future snapshots. See
`docs/luna-oct9-production-audit.md` and its selected-source ledger for the
actual source IDs, writes, holds, replays and release evidence. No resume
checkpoint regression or repeated row start was observed in this run.

The public tour exception does not reverse the ordinary-hours exclusion:
plain store hours still fail; the offered studio-floor tour in the October 9
control is a public activity under Craig's explicit bookable-activity rule.

Open downstream timing cases: row 214's text-only Rxtra clinic says “11–4”
but acquired a 21:00 category default; row 279's brunch has serving starts
but no printed end and acquired 21:00; row 173's Bay Fortune booking offer
has an October 12 deadline but acquired a 00:39 end. Do not treat those
fallback ends as source facts. Untimed activities need trusted enrichment
or an explicit product policy rather than invented starts. Art Buds' cropped
schedule and the unavailable Eastern Kings/Regals images are source limits.
Stratford's correct October 24, 2–5 p.m. felting activity remains in unknown
venue queue `uv_d54f0f035d5dde2a36e99d5c`, owned by the location-queue task.

The four false October 9 live records have a fresh guarded deletion manifest
and complete backup under `artifacts/luna-oct9-production-audit`; exact
approval is pending. Parser prevention alone does not delete them. Stage 1
remains a 50% pilot and eligible-image Stage 3 remains 100% Luna high.

## October 10 follow-up

See `docs/luna-oct10-production-audit.md` for source IDs and persisted-write
distinctions. Today's 382-row regular run completed with no repeated row starts
or observed fencing regression. Stage 1 missed a dated walk-in clinic and a
public farmers' market session; the compact image/caption prompt is hardened
and the original sources pass fresh Luna high checks while routine store and
appointment controls still fail. A code merchandise filter dropped Milton's
scheduled craft/yard sale; the scoped sale exception retains it.

Website enrichment must not lend a tour's dated time/ticket link to other dates.
Already-split single-venue tour children must not inherit the caption's other
cities, and an inferred city inside the venue name is not a second stop. These
boundaries have regression coverage. Cinema admission discounts stay cinema,
and undated future-special teasers cannot default to the source-post date.

Open: Tivoli's Stage 3 extraction omits Oct 20 Evil Dead 2 and Oct 22 Dracula vs
Frankenstein and conflates Oct 21's title; the correct three live keepers already
exist. Two 8,000-token calendar inventory calls are incomplete and unhelpful.
The legacy event writer retains an older Oct 10 Minions 17:00 start despite
today's 15:00 extraction; other Minions duplicates predate this run. Keep broad
dedup work deferred as Craig requested. Row 32's website-derived 11:00–06:00
race range is untrusted; that source writes no events. Source weekday/date and
printed `2:00am` ambiguities must not be silently repaired by guesses.

Pending exact live review: Suspiria food category, Samuel's undated teaser, and
PEI Brewing's borrowed Souris ticket/time evidence. Code prevention does not
delete or retroactively correct these records. Stage 2 and Stage 5 are separate
50% pilots; release evidence belongs in `docs/luna-oct10-stage2-stage5-release.md`.

### October 10 full Stage 2 shadow evaluation and Stage 5 expansion

The later approved Stage 5 expansion is recorded in
`docs/luna-stage5-oct10-100pct-release.md`: Stage 5 is now Luna none at 100%.
Stage 2 remains 50%. Its subsequent full-cohort dry-run evaluation is recorded
in `docs/luna-stage2-oct10-100pct-evaluation.md` (90 evaluations, 86 rows,
85 unique post IDs, with matched fresh Mini controls).

No new whole-post confidence rejection was found. However, Old Triangle row 35
(`1737936975008400`) loses its October 11 advertised turkey dinner after a
schedule classification tags it as an event and Stage 4 requires a start.
Local Pub row 53 (`1128140023071506`) loses the evening's named cocktail beside
trivia. Preserve dated meal offers and advertised daily/evening drink features
without requiring discounts, while retaining ordinary menu/inventory exclusions.
Verify final special identity as well as routing: the control cocktail was
misformatted as an event downstream. These findings are open, not deployed fixes.

Shared follow-ups from the paired replays: North Rustico Lions row 308
(`1545949704227161`) retains October 9 but misses October 10's pub-grub offer
in both arms; Founders row 139 (`1718627620272751`) keeps the printed game
starts but gets different inferred ends. Albert & Crown row 98 shows different
recent-past evidence holds and Wee Point row 341 shows Nano Stage 4 variation.
Do not count these as proved Stage 2 rejection regressions or source-backed
end times. No live event records were changed by this evaluation.

The follow-up repair and full 90-evaluation regression are recorded in
`docs/luna-stage2-oct10-specials-repair.md`. Old Triangle's dated dinner and
Local Pub's evening cocktail now survive repeated downstream checks with
correct special identities. Included food in a ticketed dinner concert remains
one event. No new whole-post rejection appears; ordinary menu/restock controls
remain excluded. This repair keeps Stage 2 at 50% and preserves Stage 5 at 100%.
Live record corrections and any Stage 2 percentage increase remain separate.

## October 11 targeted integrity repairs

See `docs/luna-oct11-integrity-repair.md` for captured-source evidence, tests and release status.

- Community Cup row 234: the three-hour fuzzy time tolerance collapsed U9/U11/U13 development sessions onto one generic calendar record. Protect known clocks and age groups in all selectors and at the merge boundary.
- Baba's row 20: a third-party one-off occurrence erased a bounded weekly lifecycle. Preserve recurrence across source owners and retain the source that established a newly promoted series. Same-source corrections remain possible.
- Emily St John Mandel row 277: a new category default overwrote a legacy end and left end before start. Distinguish explicit evidence from `none` flags and update overnight date/clock together.
- Stratford council and food drive rows 313/315: live-stream wording and donated-food inventory caused semantic category errors. Civic/literary/donation activity identity takes precedence over unrelated food/music keywords. Category matching was already case-insensitive.
- Tipsy row 120 and Island Hill row 332: mixed closure notices and opening-hours text erased separately advertised meals/markets. Require item-specific offer/activity evidence; retain ordinary hours/closure-only negative controls.
- Local Pub row 66: Saturday and Sunday recurrence shared a placeholder date and were treated as duplicates. Align corroborated weekly sibling anchors and preserve weekday identity.

Existing data changes remain separately approval-gated. No model allocation, Stage 4 effort experiment, broad deduplication or prompt-cache optimization is part of these repairs.

Deployed October 11 from repair commits 4b8b00c/49193d1: all three parsers ACTIVE on common source hash 551a5ee79e21b5d374c455c220417ad046659b00, latest traffic 100%, model settings unchanged. Full backend 604/604, request checks 72/72, seven actual downstream API dry runs passed. Exact live data plan approved and applied October 11: seven updates, one create, zero deletes; eight Firestore checks, seven public detail endpoints and the 996-event feed passed, with held food drive and three unchanged controls preserved.

## October 11 Stage 5 caching validation and approved hardening

The full 43-post comparison is recorded in `docs/luna-stage5-oct11-cache-full-validation.md`. Both layouts preserve 119 supplied occurrences. BE YOU row 229 explicitly advertises 20:00–02:00, but both formatter reads supply the starting date as the closing date; the new-write path only derives a missing date, so this is a shared existing weakness. PonyBoat row 212 instead returns a blank date in the cached arm; existing write normalization correctly handles that case. Do not equate blank with an explicit wrong same-day date or call the shared weakness a proved cache regression.

The cached read also misclassifies Seaside's public care clinic as a workshop and Kool Breeze's produce weigh-off as Sports. Preserve these activities and correct their categories with semantic safeguards, retaining sports-clinic and education controls. Craig approved the fixes and caching deployment. Source commit `6c8b430` passes 615 backend tests, eight request checks, the complete saved-response replay and six fresh paired API controls. Final release status and independent serving readback belong in `docs/luna-stage5-oct11-cache-release.md`. No historical live event correction was inferred or applied from these isolated formatting replays.

Deployed and independently verified October 11 at 17:12:22 UTC: all three parsers ACTIVE with 100% latest traffic, common source hash `3a97d4348ad1907befbedd9adf45878f577ad426`, and unchanged model/effort/allocation flags. Stage 5 caching and the source-grounded safeguards are live. Next regular-run cache cost/latency remains to be measured; the experiment did not establish a speed improvement.

## October 12 compact-validation and cache production follow-up

See `luna-oct12-production-audit.md`, `luna-oct12-integrity-repair.md` and
`luna-oct12-live-repair-plan.md`. The complete 345-row run used Luna in the
approved four stages and Nano low compact Stage 4, with no stalled/replayed
row, malformed response or contract hold. Estimated cost fell 38.15% against
the different October 11 cohort; this is not a controlled whole-run comparison.

- Extend PQ-005/PQ-025: Chambers' missing lunch clock inherited the dinner
  opening period, and an untimed Boston offer inherited whole-day hours.
  Retain meal/activity-offer constraints through formatting and every start
  fallback. Actual printed/trusted clocks still work. Current official Chambers
  lunch service is 11:00–13:30; use that evidence only in the reviewed live plan.
- Extend PQ-039/PQ-041: actual Milton extraction explicitly says the 1:30–3:30
  meridiem is not printed, but the old phrase guard missed it. Hold that source
  ambiguity before normalization; do not convert it to 01:30 or guess 13:30.
- Semantic category controls: Coats for Kids' `main level` looked like a food
  main, and volunteer setup inherited incidental turkey-dinner words. Preserve
  their activity identity and genuine course meals/drink specials.
- A same-publisher book-launch correction was merged into an old `Lunch`
  Food Special keeper. Permit only a corroborated same-date/time/venue literary
  identity correction, protecting different publishers and recurring families.
- Offer scope: regular brunch beside $5 drinks does not make brunch cost $5;
  ordinary limited-time product availability is not a deal. Dated public
  recreation access survives adjacent office-closure text.
- Open film-date precision: a blind model verification also misread tiny
  October 18 digits as October 16. The experiment is not released; do not call
  the three prepared manual date corrections proof of automated prevention.

Existing records remain unchanged until the exact backed-up live plan is
approved (completed below). Coats' inferred venue hours, Milton's unresolved AM/PM and row 85's
film/Q&A overlap remain explicit evidence limits.

October 12 prevention release `e3a6a82` passed 625/625 backend tests and 33/33
focused tests. Independently verified at 16:23:12 UTC: all three parsers ACTIVE,
100% latest traffic, identical unchanged model/environment maps, common source
hash `f67316274c8329b66bd307152e012f7d20d1bc02`. Exact revisions and commands are
recorded in `luna-oct12-integrity-repair.md`. No historical record repair has
been applied by this code deployment.

Craig subsequently approved the exact 14-record plan. On October 12 the guarded
atomic repair applied 11 updates and 3 deletions, preserving media and venues.
All 14 Firestore postconditions and all 14 public API checks passed; deleted
IDs return 404 and are absent from the fully paginated 980-ID upcoming feed.
Fresh prewrite backup/result/API evidence is linked from
`luna-oct12-live-repair-plan.md`. This resolves the listed live records;
automated tiny-film-date precision, Milton's unprinted AM/PM, Coats' inherited
hours and the separate Q&A conflict remain explicit open observations.

Subsequent Milton review: `luna-oct12-milton-hold-review.md` revises the AM/PM
decision. The original chronological Wednesday cell and the hall's explicit
afternoon public calendar justify lifting that hold. Prefer the newer October
11 flyer's 13:30–15:30 for October 14; the August-updated calendar and October 1
notice say 13:00–15:00, so retain the 30-minute source discrepancy. No live
restoration or guard deployment was included in this read-only review.

Craig approved the Milton follow-up. The original October 14 knitting record
`pgViRsWspKTtSODqvrN6` was restored at 13:30–15:30 with implied time evidence;
fresh Firestore checks and public detail/feed verification passed (exactly one
occurrence). A narrow chronological same-day/image anchor guard resolves this
range while retaining genuinely ambiguous holds. Build, 30 focused tests,
631 backend tests, captured-cohort playback and an actual three-item Stage 4/5
API replay passed. See `luna-oct12-milton-hold-review.md` for the older-calendar
30-minute discrepancy, backup and restoration evidence, and
`luna-oct12-milton-context-release.md` for deployment readback.
