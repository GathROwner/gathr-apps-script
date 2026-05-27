# Unknown Venue Manual Review Decisions - 2026-05-27

This is the running operator log for the large Facebook Events / post-parser unknown-venue backlog.

Source reports:
- `tmp/unknown-venue-manual-review-rich-2026-05-27T18-27-38-205Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-27T18-41-47-296Z.json`

Current queue snapshot after Batch B:
- `manual_review`: 502
- `resolved_existing`: 92
- `ignored`: 5
- `created_new`: 58
- `failed`: 152
- `pending`, `candidate_found`, `lookup_running`: 0

Review rules I am using:
- Use the Gmail unknown-venue email as the intake and decision record; the cluster reports are secondary grouping tools only.
- Before applying an email action or scripted equivalent, cross-check current Firestore state because old emails may be stale after a venue or alias has been created.
- Do not create or resolve normal venues for city-level, street-level, route-level, or broad-area Facebook Event locations.
- Do not accept fuzzy venue suggestions when the parsed venue is really the organizer, a city, a road route, or a nearby unrelated business.
- Resolve existing venue aliases only when the observed venue text, address, Facebook URL, or source description clearly supports the match.
- If the event itself is a store promo, recurring retail post, closure notice, or otherwise likely not app-worthy, do not resolve it just because the venue can be matched.
- Keep uncertain items in `manual_review` until Craig confirms or we research them separately.

Email-first packet log:
- `docs/unknown-venue-email-first-review-packets-2026-05-27.md`

## Completed Actions

### Batch A - High-confidence existing venue aliases

#### Be You
- Unknown venue id: `uv_f10bf985d765221bef51bf1a`
- Action: `resolve_existing`
- Resolved venue id: `name_n2ivcu`
- Observed venue: Be You
- Source unique id replayed: `1273559408323904`
- Result:
  - Updated existing `Lifestyle Party`
  - Created `Dance Party`
- Notes: High-confidence direct venue match.

#### Beaconsfield Historic House
- Unknown venue id: `uv_1d3b88e616de6d12b03816f6`
- Action: `resolve_existing`
- Resolved venue id: `DqhaDw4xcuBFIm6WCQSq`
- Observed venue: Beaconsfield Historic House
- Original event URL: `https://www.facebook.com/events/2832648610422793/`
- Event: `PEI Poetry Bash`
- Result:
  - Updated `venues/DqhaDw4xcuBFIm6WCQSq/events/JrmRNaN82ySUk0fgrw5V`
  - Start: `2026-06-17 19:00`
  - End: `2026-06-17 01:00`
- Notes: Venue match is correct. The same-date `01:00` end time is suspicious and should be separately audited.

#### Bookmark
- Unknown venue id: `uv_be1191bba95988461e7597b0`
- Action: `resolve_existing`
- Resolved venue id: `slug_bookmarkcharlottetown`
- Source unique id replayed: `2402368880227210`
- Result:
  - Selected-row replay skipped because the source row content was empty.
  - Existing Bookmark event docs already exist for the poetry event.
- Notes: Venue match is correct, but the source-row replay did not add value. Possible duplicate Bookmark poetry docs remain for later cleanup.

#### Brackley Drive-In
- Unknown venue id: `uv_8d74b83ced62086c9dcadd09`
- Action: `resolve_existing`
- Resolved venue id: `slug_brackley-drivein`
- Original event URL: `https://www.facebook.com/events/2714384128894858/`
- Event: `Island Revved 3`
- Result:
  - Created `venues/slug_brackley-drivein/events/VNdPKT7mCX5IQPPlR5sI`
  - Start: `2026-06-20 11:00`
  - End: `2026-06-20 16:00`
  - Managed image URL present.
- Notes: Manual address and Facebook URL were supplied during finalization.

#### Buenos Island Studio
- Unknown venue id: `uv_670f1a5ad148d4a8277986e1`
- Action: `resolve_existing`
- Resolved venue id: `0F6W6IBgJqlKQ8AmaTGC`
- Source unique id replayed: `122136070455035455`
- Result:
  - Updated an existing `Movin and Groovin` event under Buenos Island Studio.
  - Updated event date found: `2026-05-21`
- Notes: Venue match is correct. Because this updated a past occurrence, recurrence/dedupe behavior should be checked before using it as evidence that all current Buenos rows are clean.

#### FiN Folk Food
- Unknown venue id: `uv_ba442b234e17696ebfad40ce`
- Action: `resolve_existing`
- Resolved venue id: `1MYRGigRnV8KbuEigjMg`
- Source unique id replayed: `1574290128039835`
- Result:
  - Replay rejected by Stage 4, so no new event was created from this row.
  - Existing event already found: `Luka Hall & Irish Millie Summer 2026`
- Notes: Venue match is correct, but parser rejection means this row needs a parser-quality review only if the event is missing or important.

#### Harbourfront Theatre
- Unknown venue id: `uv_ca8c504237861393225aefb8`
- Action: `resolve_existing`
- Resolved venue id: `slug_harbourfronttheatre`
- Observed venue: `Harbourfront PEI (Summerside, PE)`
- Original post: `https://www.facebook.com/100063704492205/posts/1596693799130755`
- Event: `Vishten & Louis Michot`
- Date/time: `2026-06-29 22:30`
- Description preview: A couple of shows with Louis Michot this summer; tickets on sale; June 29 at `@harbourfrontpei` in Summerside, PE.
- Result:
  - Added alias `Harbourfront PEI (Summerside, PE)`.
  - Row replay generated a new manual-review record for the shorter observed venue `Harbourfront PEI`.
- Notes: Match is correct, but the alias was too specific. Need to also resolve the shorter alias.

#### Stanley Bridge Hall
- Unknown venue id: `uv_854a62707c3b94b4e6bcdbb8`
- Action: `resolve_existing`
- Resolved venue id: `qUg3AMPeXX9URM0UrXEA`
- Source unique id replayed: `1548231573977033`
- Result:
  - Replay skipped because the source row content was empty.
  - Existing event still exists: `Music all week`, updated earlier on `2026-05-14`.
- Notes: Venue match was safe, but replay did not refresh the event.

#### The Tivoli Cinema
- Unknown venue id: `uv_eaeeb15ed7439a161ce55685`
- Action: `resolve_existing`
- Resolved venue id: `slug_thetivolicinema`
- Source unique ids replayed: `1410839001082472`, `1394269569406082`
- Result:
  - Created `Ask a Trans Person Anything (Q&A)`.
  - Updated another Tivoli event from the second source row.
- Notes: Venue match is correct.

#### UPEI
- Unknown venue id: `uv_72567ec9221049687b489c67`
- Action: `resolve_existing`
- Resolved venue id: `slug_universityofpei`
- Original event URL: `https://www.facebook.com/events/1363229605109263/`
- Event: `PEI Chess Festival`
- Result:
  - Created `venues/slug_universityofpei/events/2fW2jt9lSVP6yGnyZ1BS`
  - Start: `2026-07-24 11:00`
  - End: `2026-07-26 18:00`
  - Managed image URL present.
- Notes: Venue match is correct.

#### PetSmart.ca Online Only
- Unknown venue id: `uv_85ee0775594bd6613fff0e39`
- Action: `ignore`
- Event type: online retail promotion
- Result: unknown venue doc ignored, no row replay.
- Notes: This was not a venue event for the app.

## New Item Created By Replay

#### Harbourfront PEI
- Unknown venue id: `uv_a7b841099422a31a6b6081ae`
- Action: `resolve_existing`
- Resolved venue id: `slug_harbourfronttheatre`
- Observed venue: `Harbourfront PEI`
- Original post: `https://www.facebook.com/100063704492205/posts/1596693799130755`
- Event: `Vishten & Louis Michot (Live show)`
- Date/time: `2026-06-29 22:30`
- Organizer/page: `sourisshowhall` / `https://www.facebook.com/sourisshowhall/`
- Description preview: A couple of shows with Louis Michot this summer; tickets on sale; June 29 at `@harbourfrontpei` in Summerside, PE.
- Suggested match:
  - `Harbourfront Theatre` (`slug_harbourfronttheatre`)
  - Address: `124 Heather Moyse Dr, Summerside, PE C1N 5R1, Canada`
  - Facebook: `https://www.facebook.com/harbourfronttheatre`
  - Confidence: `0.7`
- Decision rationale: The description explicitly points to `@harbourfrontpei` in Summerside, and this is the same source row as the already-resolved longer alias.
- Backup: `firebase/unknown-venue-harbourfront-pei-short-alias-backup-2026-05-27T18-50-57-407Z.json`
- Result:
  - Finalizer returned success.
  - Drive append skipped the Facebook URL because it was already present.
  - Queued selected-row replay task `uvreplay-48a04f324b5fd6c7b4c847c15c59dfd1`.
  - Replay source unique id: `1596693799130755`.
- Replay result:
  - Finished at `2026-05-27T18:52:13`.
  - `Created 0 new events, updated 1 through dedup`.
  - No new `manual_review` unknown venue doc was created after this replay.
  - Confirmed venue aliases now include `Harbourfront PEI (Summerside, PE)` and `Harbourfront PEI`.
- Updated Firestore event:
  - Path: `venues/slug_harbourfronttheatre/events/cvTifk7rtTeV9kNrtclW`
  - Existing event name: `Acadian-Cajun Night with Vishten & Louis Michot`
  - Date/time retained: `2026-06-29 19:30` to `2026-06-30 01:00`
  - Existing unique id retained: `1542352811229017_1`
  - Updated from incoming source unique id: `1596693799130755_1`
  - Updated fields from audit: `additionalLocation`, `ticketLink`, `ticketsBuyUrl`, `sourceTimestamp`, `shares`, `comments`, `relevantImageUrl`, `image`, `imageUrl`, `icon`
  - Before share/comment counts: shares `1`, comments not present in audit snapshot.
  - After share/comment counts: shares `2`, comments `1`.
  - Before main image: `https://storage.googleapis.com/gathr-uploaded-images/postimages/1775502269921-6sqx5c.webp`
  - After main image: `https://storage.googleapis.com/gathr-uploaded-images/postimages/1779907931854-hfrqxe.webp`
  - Ticket URL added: `https://www.sourisshowhall.com/shows/visited-%26-louis-m`
  - Existing `mediaUrls` array still has 5 managed bucket URLs. The new main image was written to `image`/`imageUrl`/`relevantImageUrl`, not appended to `mediaUrls`.
- Event update audit:
  - Audit doc id: `tS1PPYoUceaG5mLsR7NO`
  - Original row top-level URL: `https://www.facebook.com/100063704492205/posts/1596693799130755`
- Status: finalized and replay verified.

## Current / Future Items Not Auto-Resolved

These are not safe to bulk-resolve even when the report bucket says `likely_existing_alias_or_match`.

#### Course du Festival Acadien / Acadian Festival Road Race
- Unknown venue id: `uv_bcb0dc1f4ae26ed407f67cca`
- Observed venue: `Charlottetown (5 promenade acadienne / 5 Acadian Drive)`
- Event date/time: `2026-05-30 09:00`
- Description preview: Road race/walk in Charlottetown, registration 7:45-8:45, location mentions 5 Acadian Drive.
- Suggested matches include:
  - `Charlottetown, PE, Canada`
  - `Port Charlottetown`
  - `Rodd Charlottetown`
  - `Indigo Charlottetown`
- Decision: do not resolve to any of the fuzzy suggestions.
- Reason: This is a route/start-location style event. The fuzzy suggestions are nearby/irrelevant and would create a bad alias.

#### Course du festival Acadien a Charlottetown
- Unknown venue id: `uv_26f36e5ed46068b80bd9ae20`
- Observed venue: `De l'Ecole Francois-Buote jusqu'a East Royalty Parkman Complex`
- Event date/time: `2026-05-30 07:45`
- Description preview: Route from Ecole Francois-Buote to East Royalty Parkman Complex, 5 km.
- Suggested match: `Carrefour ISJ`
- Decision: do not resolve as a normal venue.
- Reason: The text describes a route, not a single event venue.

#### Annual Congregational Business Meeting AGM
- Unknown venue id: `uv_88a7c2a364221af85fd97df0`
- Observed venue: `Charlottetown, Canada`
- Event date/time: `2027-01-21 12:00`
- Suggested matches include city-level and unrelated Charlottetown venues.
- Decision: do not resolve to a venue.
- Reason: City-level location; if it is ever published it needs city-level review, not normal venue matching.

#### PEI Preserve Company - Brunch for Wishes
- Unknown venue ids: `uv_ff7068cff1bf182bfa8726ae`, `uv_00b14eb846caa5a0c0db26ff`
- Observed venues:
  - `PEI Preserve Company`
  - `PEI Preserve Company, 2841 New Glasgow Rd`
- Event date/time: `2026-05-30 10:30`
- Description preview: Brunch, live music, silent auction, Make-A-Wish PEI fundraiser at Prince Edward Island Preserve Co.
- Suggested match:
  - Venue id `fb_100057777755102`
  - Displayed candidate name: `New Glasgow Lobster Suppers | New Glasgow PE`
  - Candidate Facebook URL: `https://www.facebook.com/PEIPreserveCompany`
  - Candidate address: `604 Route 258, New Glasgow, PE C0A 1N0, Canada`
- Decision: do not resolve yet.
- Reason: The candidate record appears internally inconsistent: its Facebook URL looks like PEI Preserve Company, but the stored venue name/address look like New Glasgow Lobster Suppers. This needs venue data repair or explicit venue creation, not a blind resolve.

#### Rxtra Care Clinics
- Unknown venue id: `uv_6146802a141a8785ffff93d0`
- Observed venue: `Rxtra Care Clinics`
- Event date/time: `2026-05-28 11:00`
- Description preview: Walk-in care at Souris Remedy's / Rxtra Care Clinics, 51 Main Street, Souris.
- Suggested match: `Souris Remedy's RX & Seaside Medical Center` (`slug_sourisremedysrxseasidemedicalcenter`)
- Decision: hold.
- Reason: The physical location probably matches, but the post may be an ongoing service promotion rather than an app event. Needs event-quality decision before aliasing.

#### St. Peter's Courthouse Theatre & Museum
- Unknown venue id: `uv_3aa2d9643324048c43b5ecf7`
- Observed venue: `St. Peter's Courthouse Theatre & Museum`
- Event date/time: `2026-07-03 13:00`
- Description preview: Maggie's Wake workshop at St. Peter's Courthouse Theatre & Museum.
- Suggested match: `Souris Show Hall`
- Decision: do not resolve.
- Reason: Candidate is wrong. This is likely a legitimate separate venue or needs research.

#### Sterling WI Hall
- Unknown venue id: `uv_ac94dea5ba06104fdf4b0b08`
- Observed venue: `Sterling WI Hall`
- Event date/time: `2026-05-30 19:30`
- Description preview: Richard Wood Celtic music.
- Suggested match: `Stanley Bridge Hall`
- Decision: do not resolve.
- Reason: Name similarity is not enough; Sterling WI Hall and Stanley Bridge Hall are not the same venue on the evidence available.

#### CMP
- Unknown venue id: `uv_a41ebc6bec38f06bf9858906`
- Observed venue: `CMP`
- Event: `Car Show`
- Event date/time: `2026-06-20 12:00`
- Original post: `https://www.facebook.com/100043320621129/posts/1791809775606359`
- Organizer/page: `miltoncommunityhall`
- Suggested match: `Milton Community Hall` (`nvQTJXSbDsSfJTCxDKCH`)
- Decision: hold.
- Reason: The organizer is Milton Community Hall, but the parsed venue is only `CMP`. That abbreviation is not enough evidence to add as an alias to Milton Community Hall without checking the original post/context.

## Batch B - Current/Future Triage

### Safe To Apply

#### Bookmark (111 Kent Street)
- Unknown venue id: `uv_567d5deb2dbaf5dd46d34a6b`
- Action: `resolve_existing`
- Resolved venue id: `slug_bookmarkcharlottetown`
- Observed venue: `Bookmark (111 Kent Street)`
- Original post: `https://www.facebook.com/100051300909189/posts/1549268420126507`
- Event: `Poetry in the Bookshop with Sue Sinclair and Jane Ledwell`
- Date/time: `2026-05-28 19:00`
- Description preview: Poetry in the Bookshop with Sue Sinclair and Jane Ledwell, Thursday May 28 at 7 pm, Bookmark, 111 Kent Street.
- Suggested match:
  - `Bookmark` (`slug_bookmarkcharlottetown`)
  - Address: `111 Kent Street, Unit 110, Charlottetown, PE, Canada, C1A 1N3`
  - Facebook: `https://www.facebook.com/bookmarkcharlottetown/`
  - Confidence: `1`
- Decision rationale: Exact venue id, exact name, and exact address all match. This should be resolved as an existing venue alias.
- Backup: `firebase/unknown-venue-batch-b-backup-2026-05-27T18-55-43-178Z.json`
- Result:
  - Finalizer returned success.
  - Drive append skipped the Facebook URL because it was already present.
  - Queued selected-row replay task `uvreplay-61a0096ee605c9433b5a40b3efe00501`.
  - Replay source unique id: `1549268420126507`.
  - Replay finished at `2026-05-27T18:55:57`.
  - Replay row: `305`.
  - Replay outcome: skipped because the source row had empty post content.
  - Processing summary: `Created 0 new events, updated 0 through dedup`.
- Status: finalized and replay verified.

#### University of New Brunswick extracted from Bookmark event
- Unknown venue id: `uv_48275ea1e9af2517293621e1`
- Action: `ignore`
- Observed venue: `the University of New Brunswick`
- Event: `An Evening of Poetry in the Bookshop with Sue Sinclair`
- Date/time: `2026-05-28 19:00`
- Description preview: Bookmark in Charlottetown is hosting poet Sue Sinclair in the bookshop; the UNB reference is about the poet, not the event location.
- Suggested match:
  - `University of New Brunswick`
  - Address: `3 Bailey Dr, Fredericton, NB E3B 5A3, Canada`
- Decision rationale: This is an entity/person-affiliation extraction error, not a PEI venue. The real event location is Bookmark.
- Backup: `firebase/unknown-venue-batch-b-backup-2026-05-27T18-55-43-178Z.json`
- Result: finalizer returned success; status is now `ignored`.
- Status: finalized.

#### Evermoore Brewing Co.
- Unknown venue id used for create: `uv_55101b7ac7d7867a6b8b40e4`
- Action: `create_new`
- Created venue id: `Ty6yXQ3VwbKRlpnU7J9x`
- Created venue: `Evermoore Brewing Co.`, `192 Water St, Summerside, PE C1N 1B1`
- Added coordinates: `46.390918, -63.788393`
- Added aliases: `Evermoore`, `Evermoore Brewing`, `Evermoore Brewing Co`, `Evermoore Brewing Co.`, `Evermoore Brewing Co. (192 Water St)`
- Representative event created/updated: `venues/Ty6yXQ3VwbKRlpnU7J9x/events/lILuqQ3EPCGosjtB4bKf`
- Event result: `Saturday Sessions (traditional Celtic music)`, `2026-05-16 13:30-16:00`, address `192 Water St, Summerside, PE C1N 1B1`
- Backups:
  - `firebase/unknown-venue-evermoore-create-backup-2026-05-27T19-18-40-680Z.json`
  - `firebase/evermoore-location-repair-backup-2026-05-27T19-37-42-126Z.json`
  - `firebase/evermoore-aliases-backup-2026-05-27T19-39-45-196Z.json`
- Verification: one-row `processDataset` replay for row `273` processed `1`, created `0`, updated `1`; event kept corrected venue address/coordinates.
- Follow-up still pending: resolve safe remaining Evermoore unknown docs to this venue; hold `uv_d0b1032bd9cb181584a1729d` because its Georgetown/route wording is ambiguous.

#### APM Centre
- Unknown venue id: `uv_a63da539fc1d738b0e191342`
- Action: `create_new`
- Created venue id: `ItWg0uH2yXtETbhlepAJ`
- Created venue: `APM Centre`, `35 Mercedes Dr, Cornwall, PE C0A 1H0, Canada`
- Venue coordinates: `46.2357393, -63.2052504`
- Venue Facebook: `https://www.facebook.com/p/APM-Centre-100063625111310`
- Original post: `https://www.facebook.com/100043320621129/posts/1791809775606359`
- Event result:
  - Created `venues/ItWg0uH2yXtETbhlepAJ/events/mCsVC5ZCJGvhV6ZPyReC`
  - Event: `APM Bylaws Meeting`
  - Start/end: `2026-05-27 19:00-21:00`
  - Managed image URL present.
- Backups:
  - `firebase/unknown-venue-apm-stratford-create-backup-2026-05-27T21-16-46-075Z.json`
  - `firebase/unknown-venue-apm-stratford-event-address-repair-backup-2026-05-27T21-23-35-319Z.json`
- Replay task: `uvreplay-e0d70f1b2ebadb249a4b3783b855a52f`
- Verification: selected-row replay created one APM event. The replay initially carried the Milton Community Hall source-page address; the event was repaired to the APM venue address and the parser was patched so selected-row venue replays prefer the approved venue address when the row address is still an organizer fallback.
- Follow-up: same source post also generated a separate `CMP` / `Car Show` unknown venue. Keep it on hold until the original context proves what `CMP` means.

#### Stratford Town Centre
- Unknown venue id: `uv_25358b4a9bcf7c001f6c63f3`
- Action: `create_new`
- Created venue id: `31MHpCb7juuQkKD5N98q`
- Created venue: `Stratford Town Centre`, `234 Shakespeare Drive, Stratford, PE C1B 2V8`
- Venue coordinates: `46.2265862, -63.08734429999999`
- Venue Facebook/page URL: `https://facebook.com/townofstratford`
- Added aliases: `Stratford Town Centre Gymnasium`, `Stratford Town Centre`, `Stratford Town Hall Gymnasium`, `Stratford Recreation Centre`
- Original post: `https://www.facebook.com/100064856313650/posts/1453285933509937`
- Event result:
  - Created `venues/31MHpCb7juuQkKD5N98q/events/qKmR3jNE6mo56KFsH4Bk`
  - Event: `Community Flea Market`
  - Start/end: `2026-05-30 08:00-12:00`
  - Ticket price: `$2.00`
  - Managed image URLs present.
- Backups:
  - `firebase/unknown-venue-apm-stratford-create-backup-2026-05-27T21-16-46-075Z.json`
  - `firebase/unknown-venue-apm-stratford-event-address-repair-backup-2026-05-27T21-23-35-319Z.json`
- Replay task: `uvreplay-dc899a88c2cc6022112e18d7eeb6ea51`
- Verification: selected-row replay created one event under Stratford Town Centre. The replay initially carried the Stratford Youth Centre organizer address; the event and venue coordinates were repaired to the Town Centre address, and the parser was patched to prevent this replay-address mismatch from recurring.

#### Confederation Bridge work-zone update
- Unknown venue id: `uv_8f0920358b9d1440a58a2769`
- Action: `ignore`
- Observed venue: `Confederation Bridge`
- Event: `Work zone taken down (Confederation Bridge resurfacing phase 1)`
- Date/time: `2026-05-27 12:25`
- Description preview: Lane resurfacing/work-zone update for the bridge.
- Suggested match:
  - `Confederation Bridge`
  - Address: `Confederation Bridge, Borden-Carleton, Canada`
- Decision rationale: This is road/operations information, not an app event.
- Backup: `firebase/unknown-venue-batch-b-backup-2026-05-27T18-55-43-178Z.json`
- Result: finalizer returned success; status is now `ignored`.
- Status: finalized.

#### Downtown Charlottetown participating locations discount-card promo
- Unknown venue id: `uv_bce57c76fba91a9ce74261da`
- Action: `ignore`
- Email id: `19e6a8250a722d94`
- Event: `Downtown Discount Card - minimum 10% off/savings`
- Original post: `https://www.facebook.com/100064726384797/posts/1430608865773313`
- Decision rationale: This is a discount-card/participating-locations promo, not a normal venue event. It should not create a city-level venue or a Downtown Charlottetown venue alias.
- Backup: `firebase/unknown-venue-email-first-ignore-backup-2026-05-27T19-53-49-522Z.json`
- Result: email ignore action returned success; status moved from `manual_review` to `ignored`.
- Status: finalized.

#### Glasgow Square Nova Scotia event
- Unknown venue id: `uv_914500289a0fef992bdc174c`
- Action: `ignore`
- Email id: `19e6a8a5eb2596d1`
- Event: `Luka Hall & Irish Millie Summer 2026`
- Original post: `https://www.facebook.com/100063597751828/posts/1556648323131745`
- Suggested candidate: `Glasgow Square Theatre`, `155 Riverside Pkwy, New Glasgow, NS B2H 5E1, Canada`
- Decision rationale: The venue candidate appears real, but it is in Nova Scotia. Creating out-of-market venues from PEI artist travel posts would pollute the PEI app venue/event set.
- Backup: `firebase/unknown-venue-email-first-ignore-backup-2026-05-27T19-53-49-522Z.json`
- Result: email ignore action returned success; status moved from `manual_review` to `ignored`.
- Status: finalized.

### Hold / Research

#### APM Centre
- Unknown venue id: `uv_a63da539fc1d738b0e191342`
- Observed venue: `APM Centre`
- Event: `APM Bylaws Meeting`
- Date/time: `2026-05-27 19:00`
- Suggested match: Google Places `APM Centre`, address `35 Mercedes Dr, Cornwall, PE C0A 1H0, Canada`
- Original post review: schedule image explicitly says `APM Bylaws Meeting - APM Centre - 7 p.m.`, so APM Centre is the physical venue, not a Milton Community Hall organizer fallback.
- Current Firestore venue search: no existing APM venue found.
- Recommendation: `create_new`
- Status: finalized; see Completed Actions.
- Caveat: the meeting itself is a low-interest governance/community event. If those should be filtered from the app, that should be handled by content-quality filtering after venue resolution, not by pretending the venue is invalid.

#### Farmers Bank at Rustico / Doucet House Museums
- Unknown venue id: `uv_230eacdeaa564d7210c0ba05`
- Observed venue: `Farmers Bank at Rustico / Doucet House Museums (Rustico, PE)`
- Event: `Live Acadian music (during Natural History Walk program)`
- Date/time: `2026-05-27 20:30`
- Suggested match: Google Places `The Farmers' Bank of Rustico & Doucet House Museums`, address `2188 Church Rd, Rustico, PE C0A 1N0, Canada`
- Hold reason: Likely legitimate venue, but no existing Firestore venue id in the suggestion.

#### Online chronic pain consultation sessions
- Unknown venue ids: `uv_4ed8facea5f42eb539e57e1b`, `uv_19b363cb8c1a7a536a8ee904`
- Observed venue: `Online (virtual session)` / `Online (virtual)`
- Event date/time: `2026-05-27 18:00`
- Hold reason: This is a policy decision. We should not create a normal venue named Online, but we may want an explicit online-event handling path later.

#### Waterfront
- Unknown venue id: `uv_fc5b60630f4e10bf4e8886ec`
- Observed venue: `Waterfront`
- Event: `Wellness on the Waterfront`
- Date/time: `2026-05-27 17:15`
- Hold reason: Broad-area location; not enough evidence for a normal venue.

#### Crapaud Public Library
- Unknown venue id: `uv_bf97847c06731379dd9f5296`
- Observed venue: `Crapaud Public Library`
- Event: `Canada's Public Pensions (information session)`
- Date/time: `2026-05-28 18:00`
- Suggested match: Google Places `Crapaud Public Library`, address `20424 PE-1, Crapaud, PE C0A 1J0, Canada`
- Hold reason: Likely legitimate venue, but no existing Firestore venue id. Needs create-new review.

#### Stratford Town Hall
- Unknown venue ids: `uv_e44457f825c084ac074193a7`, `uv_8c5e6523e5a2409167f533b4`
- Observed venue: `Stratford Town Hall` / `Stratford Town Hall, 234 Shakespeare Drive, Stratford`
- Event date/time: `2026-05-28 18:00`
- Suggested match: `Stratford Town Hall`, address `234 Shakespeare Drive, Stratford, PE`
- Hold reason: Likely legitimate venue, but no existing Firestore venue id. Needs create-new review or existing venue search.

#### Stratford Town Centre Gymnasium
- Unknown venue id: `uv_25358b4a9bcf7c001f6c63f3`
- Observed venue: `Stratford Town Centre Gymnasium`
- Event: `Community Flea Market`
- Date/time: `2026-05-30 08:00`
- Original post: `https://www.facebook.com/100064856313650/posts/1453285933509937`
- Original post review: post text says the yard sale includes a massive flea market at Stratford Town Centre; embedded image says `Community Flea Market`, `Stratford Town Centre Gymnasium`, `8:00am to 12:00pm`, `Over 70 tables`.
- Current Firestore venue search: existing `Stratford Youth Centre` is only the organizer and is located at `57 Bunbury Road`; no existing venue found for the Town Centre/Gymnasium at `234 Shakespeare Drive`.
- Recommendation: `create_new`
- Proposed canonical venue: `Stratford Town Centre`
- Proposed aliases: `Stratford Town Centre Gymnasium`, `Stratford Town Hall Gymnasium`, `Stratford Recreation Centre`
- Status: finalized; see Completed Actions.
- Caveat: current email has no candidate suggestions and only an ignore button, so creation likely needs a manual/synthetic create flow rather than the current email action.

#### The Lady Ball Charlottetown
- Unknown venue id: `uv_23e0fafe201386f0dd0a3cc5`
- Observed venue: `Ovarian Cancer Canada`
- Event: `THE LADY BALL Charlottetown`
- Date/time: `2026-05-28 18:00`
- Hold reason: Observed venue looks like organizer/beneficiary, not the physical venue. Needs original/ticket-page research.

#### Salt & Soul
- Unknown venue id: `uv_cd5309d9d172fb4f782733eb`
- Observed venue: `Salt & Soul`
- Event: `Salsa Night`
- Date/time: `2026-05-28 21:00`
- Hold reason: No candidate. Needs research before creating or ignoring.

## Next Work Queue

1. Research the current/future held items that look legitimate but are not existing-venue aliases:
   - APM Centre
   - Farmers Bank at Rustico / Doucet House Museums
   - Crapaud Public Library
   - Stratford Town Hall
   - Salt & Soul
   - The Lady Ball Charlottetown
   - PEI Preserve Company bad candidate/data repair
2. Build a safe stale-backlog alias batch for older records where exact Firestore venue signals exist.
3. Separate the remaining backlog into:
   - safe existing venue aliases
   - likely new venues
   - city/route/area-level reviews
   - likely non-events / ignore candidates
   - bad resolver suggestions / venue-data repair
4. Present uncertain batches here before applying finalizer actions.
