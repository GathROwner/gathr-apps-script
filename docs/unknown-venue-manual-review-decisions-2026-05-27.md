# Unknown Venue Manual Review Decisions - 2026-05-27

This is the running operator log for the large Facebook Events / post-parser unknown-venue backlog.

## Backlog Reset - 2026-05-31

Decision: stop working the old unknown-venue backlog and switch to a go-forward-only workflow.

Reason:
- Most old unknown-venue approvals replayed stale rows and produced low-value old events.
- Leaving old docs in `unrecognized_venues` can suppress fresh emails because the queue reuses normalized venue-name doc IDs and source IDs.
- Marking old docs `ignored` is not enough for a true reset; future rows with the same normalized unknown venue could update the old terminal doc instead of creating a fresh review email.

Action taken:
- Archived all live `unrecognized_venues` docs to Firestore collection `unrecognized_venues_archive_2026_05_31`.
- Wrote local backup `firebase/unrecognized-venues-live-reset-backup-2026-05-31T12-01-53-929Z.json`.
- Deleted all originals from live collection `unrecognized_venues`.

Counts:
- Before reset: `850`
  - `manual_review`: `444`
  - `failed`: `150`
  - `resolved_existing`: `174`
  - `created_new`: `63`
  - `ignored`: `19`
- After reset: `0` live docs in `unrecognized_venues`.
- Archive count: `850`.

Future workflow:
- Do not continue applying old unknown-venue backlog emails or old report batches.
- Treat any new unknown-venue email after this reset as a fresh go-forward case.
- If a future row fails to match a known venue, diagnose that individual new case rather than replaying old backlog rows.

Source reports:
- `tmp/unknown-venue-manual-review-rich-2026-05-27T18-27-38-205Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-27T18-41-47-296Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-28T11-09-54-155Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-28T11-22-11-055Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-28T11-35-01-157Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-28T12-11-09-464Z.json`
- `tmp/unknown-venue-manual-review-rich-2026-05-28T12-28-30-000Z.json`

Current queue snapshot after Batch L:
- `manual_review`: 414
- `resolved_existing`: 174
- `ignored`: 19
- `created_new`: 63
- `failed`: 150
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

### Batch C - Email-first venue creation, aliasing, and stale-address repair

#### Farmers Bank / Doucet House Museums
- Unknown venue id: `uv_230eacdeaa564d7210c0ba05`
- Action: `create_new`
- Created venue id: `xYWyGtI1ymMdlEB81QHP`
- Venue name: `The Farmers' Bank of Rustico & Doucet House Museums`
- Address: `2188 Church Rd, Rustico, PE C0A 1N0, Canada`
- Facebook: `https://www.facebook.com/farmers.rustico`
- Result: venue created and selected-row replay queued. No event doc was created from the replayed row, so this remains a venue-only creation for now.

#### Crapaud Public Library
- Unknown venue id: `uv_bf97847c06731379dd9f5296`
- Action: `create_new`
- Created venue id: `taUCO5DyhUoJiX0whx2X`
- Venue name: `Crapaud Public Library`
- Address: `20424 PE-1, Crapaud, PE C0A 1J0, Canada`
- Result: venue created and two selected-row replays queued. No event doc was created from the replayed rows, so this remains a venue-only creation for now.

#### Stratford Town Hall variants
- Unknown venue ids: `uv_e44457f825c084ac074193a7`, `uv_8c5e6523e5a2409167f533b4`
- Action: `resolve_existing`
- Resolved venue id: `31MHpCb7juuQkKD5N98q`
- Aliases added include `Stratford Town Hall` and `Stratford Town Hall, 234 Shakespeare Drive, Stratford`.
- Repair result:
  - `venues/31MHpCb7juuQkKD5N98q/events/TP4f97oJpyCZhC0B1xbY`
  - Event: `Chronic Pain Strategy Focus Group (Queens County)`
  - Address corrected from the stale PEI Preserve address to `234 Shakespeare Drive, Stratford, PE C1B 2V8`
  - `additionalLocation` cleared because `Stratford Town Hall` is a venue alias, not a separate sub-location.
- Guardrail: `Stratford Town Centre Gymnasium` is still preserved as a sub-location label when present.

#### Salt & Soul
- Unknown venue id: `uv_cd5309d9d172fb4f782733eb`
- Action: `resolve_existing`
- Resolved venue id: `slug_saltandsolpei`
- Alias added: `Salt & Soul`
- Code fix: duplicate-event merges can now replace stale source-page addresses with the resolved venue address, and exact venue aliases are not kept as fake `additionalLocation` values.
- Verified event docs now use Salt & Sol's venue address and have blank `additionalLocation`:
  - `venues/slug_saltandsolpei/events/IH1qX7hiB6HAyTEzV8GF` - `Salsa Night`, `2026-05-28`
  - `venues/slug_saltandsolpei/events/VB5GGEk54qd5RXQGUHSH` - `Salsa Night`, `2026-05-21`
  - `venues/slug_saltandsolpei/events/M8E5rOpFiu6PVvzH1bng` - `DJ Mojo`, `2026-05-16`

#### PEI Preserve Company
- Unknown venue ids: `uv_ff7068cff1bf182bfa8726ae`, `uv_00b14eb846caa5a0c0db26ff`
- Action: `resolve_existing`
- Resolved venue id: `fb_100064655410415`
- Metadata repaired:
  - PEI Preserve Facebook URL corrected to `https://www.facebook.com/PEIPreserveCompany`
  - PEI Preserve address corrected to `2841 New Glasgow Rd, New Glasgow, PE C0A 1N0, Canada`
  - New Glasgow Lobster Suppers Facebook URL restored to its own page/profile instead of PEI Preserve.
- Verified Brunch for Wishes docs under PEI Preserve now use the correct venue address and blank `additionalLocation`.
- Deleted false doc:
  - `venues/fb_100064655410415/events/CjPoC60EtcmW05KCICSf`
  - Reason: GovPE virtual consultation was incorrectly attached to PEI Preserve while the venue carried stale GovPE metadata.

#### Batch C backups and replay notes
- Unknown-venue finalization backup: `firebase/unknown-venue-batch-c-backup-2026-05-27T22-29-08-412Z.json`
- Stale-doc cleanup backup: `firebase/stale-venue-address-doc-cleanup-backup-2026-05-27T23-29-51-184Z.json`
- Selected-row queue status after repairs: empty.
- Test coverage added:
  - venue alias with source-page fallback address resolves to the venue address.
  - duplicate merge replaces stale source-page addresses when the incoming parse has the resolved venue address.
  - sub-location aliases such as `Gymnasium` are preserved.

### Batch D - Exact existing venue aliases and Farmers Market address repair

#### St. Paul's Anglican Church, Charlottetown
- Unknown venue id: `uv_c344782ebec3ad546383fb65`
- Observed venue: `101 Prince St, Charlottetown`
- Action: `resolve_existing`
- Resolved venue id: `slug_stpaulschurchinpei`
- Evidence: source Facebook page is `https://www.facebook.com/stpaulschurchinpei/`; existing venue address and Facebook URL match.
- Replay result: recent Firestore check found `St. Paul's Yard Sale`.
  - Event doc: `venues/slug_stpaulschurchinpei/events/7XzibOzRd5tZYo8LTrES`
  - Start/end: `2026-05-23 08:00` to `2026-05-23 12:00`
  - Address: `101 Prince St, Charlottetown, PE, Canada, C1A 4R5`
- Status: finalized.

#### Boxcar Pub & Grill
- Unknown venue id: `uv_a92cbb2767b3f45198706045`
- Observed venue: `1910 Nodd Rd Emerald`
- Action: `resolve_existing`
- Resolved venue id: `slug_boxcarpub`
- Evidence: source Facebook page is `https://www.facebook.com/boxcarpub`; existing venue address and Facebook URL match.
- Replay result: recent Firestore check found `Emergency Preparedness Workshop`.
  - Event doc: `venues/slug_boxcarpub/events/ti9MGrsPb9J0slzUpc33`
  - Start/end: `2026-05-06 18:30` to `2026-05-06 20:00`
  - Address: `1910 Nodd Rd, Emerald Junction, PE C0B 1M0, Canada`
- Status: finalized.

#### The Local Pub and Oyster Bar
- Unknown venue id: `uv_a4b95eaf61ec0f807f0a9259`
- Observed venue: `202 Buchanan Dr, Charlottetown`
- Action: `resolve_existing`
- Resolved venue id: `slug_thelocalpubpei`
- Evidence: source Facebook page is `https://www.facebook.com/TheLocalPubPEI`; existing venue address and Facebook URL match.
- Replay result: recent Firestore check found two docs:
  - `Paint & Pride Night in the Brae (Pride & Paint Experience)`, `2026-05-14 18:00` to `20:00`
  - `Paint & Pride Night ticket (includes drink)`, categorized as `Food Special`, `2026-05-14 11:00` to `21:00`
- Status: finalized.

#### Charlottetown Farmers' Market Co-operative
- Unknown venue ids:
  - `uv_023706888fe4a4b46c1fea7a`
  - `uv_05ab4595c69fb7d8b20e9182`
  - `uv_8d71932d14bda7a6e3b954ee`
  - `uv_e531eb10bfef5d8857f350cd`
- Observed venue variants: `614 North River Rd`, `614 North River Road`, and Charlottetown Farmers Market wording.
- Action: `resolve_existing`
- Resolved venue id: `slug_charlottetownfarmersmarket`
- Venue repair applied before replay:
  - Address corrected from the old `100 Belvedere Ave` value to `614 North River Road, Charlottetown, PE, Canada`.
  - Coordinates set to `46.2632686`, `-63.1571917`.
  - Website set to `https://charlottetownfarmersmarket.com/`.
  - Phone set to `+1 902-626-3373`.
  - Aliases added for the 614 North River Road variants and temporary-location wording.
- Replay result: queue drained successfully after manual force-run of initially stuck Cloud Tasks. Recent Firestore check found 10 newly-created or updated docs under `venues/slug_charlottetownfarmersmarket/events`.
- Important quality note: this was a correct venue-resolution batch, but the source rows are noisy. Several old vendor/market-hours posts became dated events or food specials, most with no media, and several dates are already in the past. Do not treat this as proof that every Farmers Market source row is app-worthy; future cleanup may need content-quality filtering for recurring market-hours/vendor posts.
- Status: finalized with caveat.

#### Batch D backups and replay notes
- Backup: `firebase/unknown-venue-batch-d-backup-2026-05-27T23-47-42-806Z.json`
- Queue verification: `processDatasetSelectedRows` was empty after replay follow-up.
- Notable replay behavior: multiple same-file row replays briefly hit `selected_rows_replay_lock_active`, then retried or completed after the queue cleared.

### Batch E - Exact existing venue aliases with side-effect repairs

#### Beaconsfield Carriage House
- Unknown venue ids: `uv_41522b0c4333a39ad11eac1d`, `uv_8972d741adabd655974ccb07`
- Action: `resolve_existing`
- Resolved venue id: `DqhaDw4xcuBFIm6WCQSq`
- Evidence:
  - `Fascinating Ladies of Country` source row names `Beaconsfield Carriage House`.
  - `Around the Table` source row names `Beaconsfield Carriage House` for the April 10 screening.
  - Existing venue has canonical address `2 Kent St, Charlottetown, PE C1A 1M6`.
- Replay result:
  - Created `Around the Table - Film Screening + Conversation` under Beaconsfield for `2026-04-10 18:00-20:00`.
  - The Souris Show Hall source row expanded into a multi-event calendar; most events remained correctly under Souris Show Hall, but one related `Around the Table` screening for `2026-04-17` was incorrectly written under Souris with PEI Farm Centre's address.
- Side-effect repair:
  - Moved `venues/slug_sourisshowhall/events/cySMNw9bO0wYKmWrTmUZ` to `venues/slug_peifarmcentre/events/cySMNw9bO0wYKmWrTmUZ`.
  - Deleted the bad Souris copy.
  - Repaired Beaconsfield event addresses/coordinates for:
    - `venues/DqhaDw4xcuBFIm6WCQSq/events/9Z0H42ZVQpY1W4jHN6zL`
    - `venues/DqhaDw4xcuBFIm6WCQSq/events/JrmRNaN82ySUk0fgrw5V`
- Status: finalized with repair.

#### Buenos Island Studio
- Unknown venue id: `uv_afc098dc0ae7be98f46c9e4a`
- Observed venue: `Buenos Island Studios, 135 Great George St., Charlottetown`
- Action: `resolve_existing`
- Resolved venue id: `0F6W6IBgJqlKQ8AmaTGC`
- Replay result: created or updated the `Flow to Fierce` recurring dance-class series under Buenos Island Studio.
- Status: finalized.

#### Claddagh Oyster House
- Unknown venue id: `uv_d62782d7c985b0465f5617b4`
- Action: `resolve_existing`
- Resolved venue id: `jcY0JhgnTqiQ8qbwAZTB`
- Replay result: created `Carter MacLellan` and `Luka Hall & Ray Knorr` live-music docs under Claddagh Oyster House.
- Caveat: the parser inferred overnight `01:00` end times from venue hours for these old March live-music rows. I did not change those times because the source row is old and the event is already past.
- Status: finalized.

#### Confederation Court Mall Food Court
- Unknown venue id: `uv_0a9b977d5753a9b65dc57f8b`
- Action: `resolve_existing`
- Resolved venue id: `name_2lgcnn`
- Replay result: the row expanded into four mall activities on `2026-03-21`:
  - `Spring Thaw Market Pop-Up Market`
  - `Juggler & Balloon Animals`
  - `Free Face Painting`
  - `Create an Art Mural with Blank Canvas`
- Caveat: several same-day mall sub-events have weak end times from fallback/hours inference. These are past events, so I recorded the behavior but did not repair times.
- Status: finalized.

#### Ellen's Creek Gallery & Framing
- Unknown venue id: `uv_1f2c27fab8d33be18740b66e`
- Action: `resolve_existing`
- Resolved venue id: `JZsTzan084I8e4isQGx1`
- Replay result:
  - Updated existing `"The Time Of Our Lives" (PEI Seniors' College) Group Art Show and Sale`.
  - Created/updated `"The Time Of Our Lives" opening reception`.
- Status: finalized.

#### Batch E backups and replay notes
- Finalizer backup: `firebase/unknown-venue-batch-e-backup-2026-05-27T23-57-45-266Z.json`
- Side-effect repair backup: `firebase/batch-e-side-effect-repair-backup-2026-05-28T00-08-09-318Z.json`
- Queue verification: `processDatasetSelectedRows` was empty after retry/lock follow-up.
- Index note: a collection-group audit query for `events.updatedAt`/`events.createdAt` still requires a Firestore collection-group single-field index. I briefly tried the `gcloud firestore indexes fields update` route, but it produced only collection-scope field exemptions, so I cleared those exemptions immediately. Current field configs are restored to ancestor/default single-field settings.

### Batch F - Exact venue aliases plus replay side-effect cleanup

#### Ellen's Creek Gallery duplicate queue entry
- Unknown venue id: `uv_dfc1e649bd096dc1ef589915`
- Action: `resolve_existing`
- Resolved venue id: `JZsTzan084I8e4isQGx1`
- Replay result:
  - Created `"The Time Of Our Lives" - Art Show (Open Hours)`, `2026-04-27 09:00-17:00`.
  - Updated `"The Time Of Our Lives" opening reception`, `2026-04-30 19:00-21:00`.
  - Both landed under Ellen's Creek Gallery & Framing with address `525 N River Rd, Charlottetown, PE C1E 1J6`.
- Status: finalized.

#### Milton Hall Upstairs
- Unknown venue id: `uv_fc08c1e8585ccac56f6a39dc`
- Action: `resolve_existing`
- Resolved venue id: `nvQTJXSbDsSfJTCxDKCH`
- Replay result:
  - Created `Crochet & Knit Drop-In (with Izzy Dolls project option)`.
  - Start/end: `2026-04-15 13:30-15:30`.
  - Address: `7 New Glasgow Rd #224, North Milton, PE C1E 0X5`.
  - Additional location preserved: `Milton Hall (Upstairs)`.
- Status: finalized.

#### Rodd Charlottetown
- Unknown venue id: `uv_f8ed585196217c9a06537705`
- Action: `resolve_existing`
- Resolved venue id: `fb_100063479865570`
- Replay result: selected-row replay did not create or update a recent Rodd event doc during this verification pass.
- Status: venue alias finalized; no event write verified from the replay.

#### Salvador Dali Cafe typo variant
- Unknown venue id: `uv_ce99fc740e2dde5c8eb12631`
- Action: `resolve_existing`
- Resolved venue id: `slug_thedalicafe`
- Replay result:
  - Created `Experience Dali`, `2026-04-11 18:30-20:30`.
  - Address: `155 Kent St, Charlottetown, PE C1A 4K9`.
- Side-effect cleanup:
  - The source row was a Downtown Charlottetown multi-event calendar. Replaying the whole row created unrelated April 10-12 calendar docs with fallback addresses and mismatched sublocations.
  - Deleted 37 noisy side-effect event docs from the two Downtown Charlottetown source ids, keeping only the targeted `Experience Dali` doc.
- Status: finalized with side-effect cleanup.

#### The Arts Hotel
- Unknown venue id: `uv_6b29b5fbb7d13abeef6b12e3`
- Action: `resolve_existing`
- Resolved venue id: `vCb3rgvHFkPbpiVdksN8`
- Replay result: no Arts Hotel event doc remained after verification. The queued replay source was part of the same noisy Downtown calendar class, so the side-effect docs were removed rather than kept.
- Status: venue alias finalized; event write held/cleaned as noisy replay output.

#### Cavendish Farms Community Events Centre - Tyne Valley
- Unknown venue id: `uv_21d08c89da663923e0653743`
- Action: `resolve_existing`
- Resolved venue id: `LglliE42SPFssmoU01su`
- Replay result:
  - Created or touched `Adult Learn-to-Play League`, `2026-03-15 13:00-23:00`, under the Tyne Valley venue.
  - Address: `7085 PE-12, Tyne Valley, PE C0B 2C0`.
- Caveat: this is a past row and the `23:00` end came from hours/default resolution; recorded, not repaired.
- Status: finalized.

#### Veterans Memorial Park
- Unknown venue id: `uv_3207c7d09aa2bf1dccdadab9`
- Action: `resolve_existing`
- Resolved venue id: `5fxwonYWZbp95kOOjdfF`
- Initial replay issue:
  - The parser collapsed the `Age 0-6` and `Age 7+` Easter egg hunts into one event, then read `Age 0 - 6` as a `00:00-06:00` time range.
- Code fixes deployed:
  - `functions/src/utils/similarity.ts`: explicit conflicting age groups now prevent same-root sibling events from being treated as duplicates.
  - `functions/src/processing/rowProcessor.ts`: explicit age ranges in evidence text are ignored by time-evidence extraction, so `Age 0 - 6 Hunt 11 - 11:30` resolves to `11:00-11:30`, not `00:00-06:00`.
- Final replay verification:
  - Replay source unique id: `1507911641334813`.
  - Final task result: `Created 0 new events, updated 0 through dedup`, with `duplicate-only: 2 item(s)`.
  - `venues/5fxwonYWZbp95kOOjdfF/events/RYUrJXsDTdJ16Dsk25MN`
    - `Downtown Summerside Easter Egg Hunt (Age 0-6 Hunt)`
    - `2026-03-28 11:00-11:30`
    - Address: `89 Summer St, Summerside, PE C1N 3H9`
  - `venues/5fxwonYWZbp95kOOjdfF/events/ExAdl9kqxsNjbzuu8wPK`
    - `Downtown Summerside Easter Egg Hunt (Age 7+)`
    - `2026-03-28 12:30-13:00`
    - Address: `89 Summer St, Summerside, PE C1N 3H9`
- Status: finalized after code fix, data repair, and stable replay.

#### Batch F backups and replay notes
- Finalizer backup: `firebase/unknown-venue-batch-f-backup-2026-05-28T00-12-12-248Z.json`
- Downtown calendar side-effect cleanup backup: `firebase/batch-f-side-effect-repair-backup-2026-05-28T00-29-18-977Z.json`
- Veterans age-group repair backup: `firebase/veterans-age-group-repair-backup-2026-05-28T00-41-24-270Z.json`
- Queue verification: `processDatasetSelectedRows` was empty after final replay.
- Tests run:
  - `npm run build`
  - `node --test lib/services/firestoreService.siblingSkip.test.js`
  - `node --test lib/processing/rowProcessor.startTimeExplicitMerge.test.js`
- Deployment: `firebase deploy --only functions` completed after both parser fixes.
- Important operating note: selected-row replay can still replay an entire multi-event source row. For noisy calendar/list posts, apply finalizer actions cautiously and inspect side effects before moving to the next batch.

### Batch G - High-confidence existing venue aliases

#### Finalizer actions
- Backup: `firebase/unknown-venue-batch-g-backup-2026-05-28T00-53-21-740Z.json`
- Actions applied:
  - `uv_0c3ff7a8b05871e851209329`: `APM center, Cornwall` -> `venues/ItWg0uH2yXtETbhlepAJ` (`APM Centre`)
  - `uv_1bd8cde85fb58521c87f841c`: `Farmers Bank at Rustico` -> `venues/xYWyGtI1ymMdlEB81QHP` (`The Farmers' Bank of Rustico & Doucet House Museums`)
  - `uv_f6bcb2e087a2612bf6d812a8`: `Evermoore` -> `venues/Ty6yXQ3VwbKRlpnU7J9x` (`Evermoore Brewing Co.`)
  - `uv_1c0c18bdfc4029ce5b5a8ba2`: `Evermoore Brewing Co` -> `venues/Ty6yXQ3VwbKRlpnU7J9x`
  - `uv_f4eaf964568ea60ecd0a6830`: `Evermoore Brewing Co.` -> `venues/Ty6yXQ3VwbKRlpnU7J9x`
  - `uv_d95d82b460f3951039d57898`: `Buenos Island Dance Studios` -> `venues/0F6W6IBgJqlKQ8AmaTGC` (`Buenos Island Studio`)
  - `uv_43714526dfe8296773491ae4`: `Buenos Island Studio, 135 Great George St. Charlottetown` -> `venues/0F6W6IBgJqlKQ8AmaTGC`
  - `uv_dab2c31cbd8ba0e58d9d8e3e`: `Tekila Mexican Restaurant` -> `venues/fb_100075997661092` (`Tekila`)
  - `uv_df5330089beef9d6039c3e8d`: `Tekila Mexican Restaurant` -> `venues/fb_100075997661092`
  - `uv_0c2c48a0017fb171680cb936`: `Carrefour - Charlottetown` -> `venues/slug_carrefourdelislesaintjean` (`Carrefour ISJ`)
- Queue verification: `processDatasetSelectedRows` drained to empty after manual serial dispatch of stuck tasks.
- Current queue snapshot after refresh: `manual_review` dropped from `474` to `464`.

#### Direct target writes
- `venues/ItWg0uH2yXtETbhlepAJ/events/wczvzbVGWn89cWLU7xfn`
  - `Island Pro Wrestling: Game On (Island Rumble Season 2)`
  - `2026-05-16 18:00-23:00`
  - Source: `1532901155515354_1`
  - Original/source URL stored: `https://www.facebook.com/SamsFamilyRestaurantPub`
  - Address: `35 Mercedes Dr, Cornwall, PE C0A 1H0`
- `venues/xYWyGtI1ymMdlEB81QHP/events/l1SNXgO5DFQd0HKYbQUe`
  - `Natural History Walk and Feast`
  - `2026-05-27 20:30-23:00`
  - Source: `1571174074807782_1`
  - Original/source URL stored: `https://www.facebook.com/TheSandsAtDarnley`
  - Address: `2188 Church Rd, Rustico, PE C0A 1N0`
- Evermoore target writes under `venues/Ty6yXQ3VwbKRlpnU7J9x/events`:
  - `8I0IuK6RfykecvJ0ivja`: `Live Music: Geoffrey Charlton`, `2026-05-19 18:00-20:00`, source `1659320682324224_1`
  - `N1vBwqItYzFBYGoN0ChV`: `Evermoore's Celtic Jam`, `2026-05-16 13:30-16:00`, source `1655317712724521_2`
  - `X9IlnrWpv9jbASLuWvGb`: `Evermoore Brewing Company 5 Miler (presented by the PEI Marathon)`, `2026-05-05 09:00-23:00`, source `1380292854120884_1`
  - `bB4IKDmt815pIE1x5jJX`: `Traditional Celtic music circle`, `2026-05-23 13:30-16:00`, source `1570234235102553_6`
- Buenos target writes under `venues/0F6W6IBgJqlKQ8AmaTGC/events`:
  - `BGFhuNySWdLopSUkTUFu`: `Latin Mix Class!`, `2026-04-19 13:00-15:00`, source `122131956003035455_1`
  - `tjFsMzGOrZWeD7LKCDXW`: `OPEN MODEL CALL`, `2026-04-19 15:00-17:00`, source `122131956003035455_3`
  - `MRg0BnTyxZCtKyeKGRTH`: `LATIN NIGHT (SOLD OUT)`, `2026-04-19 19:00-22:00`, source `122131956003035455_4`
  - `AeIyB9ZRrq9TfVr9FfuL`: `Ken's Rueda Club`, `2026-03-22 16:00-17:00`, source `122129427837035455_1`, updated by replay
- Tekila target writes under `venues/fb_100075997661092/events`:
  - `oK30WbQY6j9ZZpQz3MDx`: `Live Music Saturday Night - David "Dave" Woodside`, `2026-05-09 18:00-21:00`, source `995058876370692_1`
  - `IKtAlYlYii7XKUlihhjX`: `Live Music: Jerry Laird`, `2026-04-10 18:00-21:00`, source `971893485353898_1`
  - `swJ8hsirMP1R5hnYDhET`: `Friday Night Live at Tekila (Jerry Laird)`, `2026-05-08 18:00-21:00`, source `995060563037190_1`
  - `uKQLiBtXi0xIbrRRumIH`: `Live Music with Brian Dunn`, `2026-04-04 18:00-21:00`, source `965163849360195_1`
- `venues/slug_carrefourdelislesaintjean/events/10I2nDDLIXpVaT1yxxoo`
  - `Je grandis en francais - Des la naissance (Phase 2)`
  - `2026-04-15 18:00-19:00`
  - Source: `1372605281574114_1`
  - Address: `5 Acadian Dr, Charlottetown, PE C1C 1M2`

#### Replay side effects and repairs
- The Evermoore/Downtown Summerside replay expanded an Open City style row into additional venue events. I kept these because the rows resolved to real venues and event content, but recorded them as side effects rather than direct target writes:
  - `venues/slug_holmansicecream/events/Mw0sUQpZmVH65NVrBzZE`: `ADL Music Series: Roger Stone`, `2026-05-09 18:00-20:00`
  - `venues/slug_artbudspei/events/o3srwUGypJcNMsKBsw8t`: `Tiny Landscape + Wildflower Suncatcher Drop-In`, `2026-05-23 10:00-17:00`
  - `venues/slug_bogsidebrewco/events/e0GHvG2Q5hTW8ElAW8OD`: `Live music with Madjoy`, `2026-05-23 18:00-21:00`
  - `venues/fb_100063593349606/events/hYaSeHtmr33sMsEdHxHL`: `Downtown Summerside Community Cleanup Day`, `2026-05-23 09:00-11:00`
  - `venues/Ty6yXQ3VwbKRlpnU7J9x/events/ndF3BEfl04ku07sJPEYu`: `FREE Ice Cream (Community Cleanup Day volunteers)`, `2026-05-23 11:00-21:00`, category `Food Special`
- Repair backup: `firebase/batch-g-replay-audit-repair-backup-2026-05-28T01-10-25-737Z.json`
- Deleted false side-effect doc:
  - `venues/0F6W6IBgJqlKQ8AmaTGC/events/k24qWNDa1UfHoKm3PAe0`
  - Name was `Latino Association of PEI (with)`.
  - Rationale: this was a collaborator/host line, not an event.
- Repaired duplicated title:
  - `venues/slug_holmansicecream/events/PZ6dXxKLqJfwuI5DWNnK`
  - Before: `ADL Music Series with Shane Pendergast - ADL Music Series with Shane Pendergast`
  - After: `ADL Music Series with Shane Pendergast`
  - Content, date/time, image, and venue were left unchanged.

#### Batch G notes
- The selected-row replay queue still sometimes leaves tasks scheduled in the past until manually dispatched; several eventually disappeared on their own, and one manual run hit `selected_rows_replay_lock_active` while another task for the same file was active.
- Attempted to create an `events.updatedAt` collection-group audit index, but the Firestore CLI/API path only manipulated the collection-scope field config and did not satisfy the `COLLECTION_GROUP_ASC` requirement. I cleared the field exemption back toward inherited/default settings and used a client-side collection-group scan for this audit.

### Batch H - Existing aliases plus non-event ignores

#### Finalizer actions
- Finalizer backup: `firebase/unknown-venue-batch-h-backup-2026-05-28T10-49-36-028Z.json`
- Side-effect repair backup: `firebase/batch-h-side-effect-repair-backup-2026-05-28T11-08-20-161Z.json`
- Actions applied:
  - `uv_4d62762c75b1288a55417365`: `Emerald` -> `venues/slug_boxcarpub` (`Boxcar Pub & Grill`)
  - `uv_74535d54c49996cb5bd0c48e`: `O'Brien's Social Bar & Kitchen (Red Shores Charlottetown)` -> `venues/fb_100052606604879`
  - `uv_917c5b372edb2ce7f6bd5b22`: Souris Show Hall address variant -> `venues/slug_sourisshowhall`
  - `uv_87434be1c54c8c05c2df6ccf`: Souris Show Hall town variant -> `venues/slug_sourisshowhall`
  - `uv_de1471e4c20db457c1bb63e8`: Souris Show Hall province variant -> `venues/slug_sourisshowhall`
  - `uv_8ff3444bfab65fda031e78b2`: `St. Paul's Church` -> `venues/slug_stpaulschurchinpei`
  - `uv_ece60a8d162ff2d85079bb02`: `Blank Canvas Art Supplies (Confederation Court Mall, Charlottetown)` -> `venues/name_6387om`
  - `uv_dac52e397ec585836284858d`: DownStreet Dance address variant -> `venues/slug_downstreetdance`
  - `uv_0f5449e73325baa822ac9cca`: Harbourfront short alias -> `venues/slug_harbourfronttheatre`
  - `uv_5811978b9b4accd47bddc206`: Inspire Learning Centre room/address variant -> `venues/JJafK6aSGGv8vxNxvJdK`
  - `uv_9beffbcd472a4ef0ca5885fd`: `PEERS Aliance Inc` typo -> `venues/slug_peersalliance`
  - `uv_f28929bd092b783b85eab234`: `PEERS Alliance Office @ 250B Queen St` -> `venues/slug_peersalliance`
  - `uv_c4fe85212aebb996a22b9d0b`: `Summerside Raceway` -> `venues/3f8DZiSSgoL1mQ5kMxSN`
  - `uv_4fdd2858ce1ea9043beed265`: `Timothy's Cafe (154 Great George St, Charlottetown, PE)` -> `venues/slug_timothyscharlottetown`
  - `uv_b10a842f1f0d1c4b21056e2e`: `Wheelhouse` -> `venues/fb_100063721472778`
- Ignored:
  - `uv_0d88b9ac65ecbe13b2091694`: Charlottetown Mitsubishi service-department discount
  - `uv_a7672b83960b82ac24500a9b`: Confederation Bridge Aquatics maintenance closure
  - `uv_ab214bf05f1028bdc66a4893`: Kool Breeze retail product bundle
  - `uv_aceb01a966bda5f882040be1`: PetSmart online same-day delivery offer
  - `uv_ad037aa2d1178135313cb059`: PetSmart.ca same-day delivery offer
  - `uv_2cf102617ab9f67482d836bc`: PetSmart Canada delivery offer
  - `uv_29c6040cfc8fc0dcc4ac28e3`: Rxtra Care Clinic service notice
  - `uv_6146802a141a8785ffff93d0`: Rxtra Care Clinics service notice
- Queue verification: `processDatasetSelectedRows` drained to empty after serial dispatch and lock waits.
- Current queue snapshot after refresh: `manual_review` dropped from `464` to `441`.

#### Direct target writes after side-effect repair
- `venues/fb_100052606604879/events/j1CNQS00NdQbSdPiwi5X`
  - `2 for 1 Fish & Chips`, `2026-03-02 16:00-19:00`, source `1595350725561799_4`, updated by replay
- `venues/fb_100052606604879/events/I6NiYVawdNnuFD0A5eol`
  - `Wing Night`, `2026-03-02 17:00-20:00`, source `1595350725561799_5`, updated by replay
- `venues/fb_100052606604879/events/YwucwqDKIUADzx2o5F0g`
  - `3-Course Menu Special`, `2026-02-27 17:00-22:00`, source `1587906202972918_3`, created by replay
- `venues/name_6387om/events/11KAtsA6rMcbglvWmhzk`
  - `Oil Pastel Workshop with Dave`, `2026-05-15 18:30-20:30`, source `917997967929275_1`
- `venues/slug_downstreetdance/events/CXB6Fksq9AHKAaxwRtWp`
  - `Beginner Belly Dance Class (Drop-in)`, `2026-05-05 18:30-20:30`, source `1615247680606133_1`
- `venues/slug_harbourfronttheatre/events/DV0HEA01nMt4qljoR4hO`
  - `EPiC Movie Night: Elvis`, `2026-05-04 19:00-23:00`, source `1567844625346502_1`
- `venues/JJafK6aSGGv8vxNxvJdK/events/oYkAFe4xCAFTxUz6917w`
  - `Summerside Rainbow Youth Club: Fibre Arts 101 Workshop`, `2026-05-05 18:00-20:00`, source `1389018029931236_1`
- `venues/slug_peersalliance/events/jt9jxrPUgleUl8xTlgny`
  - `Queer Poetry Club`, `2026-05-02 14:00-16:00`, source `1410438631123670_22`
- `venues/slug_peersalliance/events/yhbXRBbhuH3ytN2zttJD`
  - `Square Dance (PEI's Rainbow Youth Club - Charlottetown)`, `2026-05-26 18:00-20:00`, source `1410442317788807_1`
- `venues/3f8DZiSSgoL1mQ5kMxSN/events/P1jNYbOxvOdyPUJocNvg`
  - `Racing Returns to Summerside Raceway (Season Opener)`, `2026-05-18 12:30-23:00`, source `1658829589213912_1`
- `venues/slug_timothyscharlottetown/events/GvmADTqEAPJY72c0lGD2`
  - `Live Music: Kendra Lyttle`, `2026-05-23 12:30-2026-05-24 01:00`, source `1628490159278800_1`
- `venues/fb_100063721472778/events/Uf4CyikrF4XFe5rnQzdB`
  - `Opening for the 2026 season`, `2026-05-22 17:00-21:00`, source `1591641739636527_1`
- Souris duplicate-only replay under `venues/slug_sourisshowhall/events`:
  - `hBsCqVnsOg8L07RaEzvI`: `Family Movie Series: Charlotte's Web`, `2026-03-01 14:00-23:00`, source `1518483866951749_1`
  - `87FhEER1bjhulBkJV0j2`: `Family Movie Series: Darby O'Gill`, `2026-03-15 14:00-23:00`, source `1518483866951749_2`

#### Replay skips and side effects
- `Emerald` / Boxcar replay (`fileId=1OBkpqt-PKK02Ud8eC7w5M1X8rICDkoTv`, source `1517427593718798`) reached row 87 but wrote no event: Stage 4 secondary validation failed.
- Blank Canvas second replay (`fileId=12DvqvGpvHToTqW1v9MRP70wzhhOydEQE`, row 351) wrote no event: Stage 1 validation failed.
- St. Paul's replay (`fileId=1fQNRn-t1s6XQUdDKdglkCcJ5iO7RO-8b`, row 228) wrote no event: Stage 4 secondary validation failed.
- The PEERS typo replay expanded two Downtown Charlottetown multi-event source rows (`1410438631123670_*`, `1411261657708034_*`) into 47 unintended, newly-created old May 1-3 event docs across multiple venues. I deleted those side-effect docs and kept only the direct PEERS target `venues/slug_peersalliance/events/jt9jxrPUgleUl8xTlgny`.

#### Batch H notes
- Several replays hit `selected_rows_replay_lock_active` while another selected-row task was processing the same spreadsheet. I waited for locks to release, then reran remaining tasks. Final queue state was empty.
- This batch reinforces that selected-row replay should not be used casually for broad multi-event calendar rows. When resolving aliases from old backlog emails, source IDs with many generated suffixes need side-effect audit immediately after replay.

### Batch I - Existing aliases plus retail-promo ignores

#### Finalizer actions
- Finalizer backup: `firebase/unknown-venue-batch-i-backup-2026-05-28T11-15-05-443Z.json`
- Side-effect repair backup: `firebase/batch-i-side-effect-repair-backup-2026-05-28T11-21-45-997Z.json`
- Actions applied:
  - `uv_68d43da5ce28d24d4f1515c4`: `The Comedy Cave (downstairs at The Factory)` -> `venues/V7zQ5unfTY1GtNKUvR7c`
  - `uv_3f668ca20de789510c2dcfe0`: `The Dali Cafe (in The Arts Hotel)` -> `venues/slug_thedalicafe`
  - `uv_ddba05023aab377ddaf8d910`: `Timothy's Coffee` -> `venues/slug_timothyscharlottetown`
  - `uv_d2bc96a451f13b25d16256f8`: `Ruby's Cafe` -> `venues/ZDUj9euh7NVJ6INSlHM8`
  - `uv_bd32fa3d47c10f4d5e9c58a6`: `Salt & Sol` -> `venues/slug_saltandsolpei`
- Ignored:
  - `uv_11bdb425b959e58e53dd58ed`: ANNE Chocolates gift-basket/free COW Chips retail promotion
  - `uv_35402002b75412e1d0f64065`: Island Style opening-weekend denim sale
- Queue verification: `processDatasetSelectedRows` drained to empty after serial dispatch. The Salt & Sol task initially returned HTTP 500, then retried and wrote events before disappearing from the queue.
- Current queue snapshot after refresh: `manual_review` dropped from `441` to `435`.

#### Direct target writes after side-effect repair
- `venues/V7zQ5unfTY1GtNKUvR7c/events/7mjiaQrrIBlja5ln1Swx`
  - `Live Stand-Up in The Comedy Cave`, `20:00-22:00`, source `1663601968466048_1`
- `venues/slug_thedalicafe/events/Z4RNlSmB1j4HwvOMQJfo`
  - `Tango Club, PEI (Argentine Tango Practica/Jam)`, `14:00-01:00`, source `122131154907035455_1`
- `venues/slug_timothyscharlottetown/events/JPAKTSIUukse7KmA4qKj`
  - `Franco-vendredis a Charlottetown`, `10:00-23:00`, source `1377474464420529_1`
- `venues/ZDUj9euh7NVJ6INSlHM8/events/TvLccJfpgq0XpgGPVCG1`
  - `Coffee with a Cop`, `09:00-23:00`, source `122288672570189551_1`
- `venues/slug_saltandsolpei/events/xmV0zaeKpn7OO6O48Omu`
  - `Street Feast After Hours: DJ MOJO`, `22:00-01:00`, source `122221814792376645_8`

#### Replay skips and side effects
- The Salt & Sol / Discover Charlottetown source row extracted multiple Street Feast items. The direct Salt & Sol target was kept, but seven unintended sibling docs were deleted:
  - `venues/slug_discovercharlottetown/events/E6yXdDwOQkXWO7c5zRC6`
  - `venues/slug_discovercharlottetown/events/tulXkRvxjrJiNXz15W0L`
  - `venues/DZ4nQZQnOKCkTotuKYVv/events/XkBVzAr4xImtKCFqejmh`
  - `venues/fb_100063464116222/events/yiWR4jMElt52gACH5sOd`
  - `venues/slug_ponyboat.socialclub/events/CWk5Dx3A6YpFoA6ivH7C`
  - `venues/fb_100057766283684/events/r9pGmZytd5zxzcxszTPL`
  - `venues/slug_ponyboat.socialclub/events/aX9sDrDrI5piNxAkBKua`
- Batch I reinforces the same risk as Batch H: selected-row replay can legally expand one old multi-event source row into many event docs. Keep using immediate post-replay audit before moving on.

### Batch J - Strict existing aliases, with large replay cleanup

#### Finalizer actions
- Finalizer backup: `firebase/unknown-venue-batch-j-backup-2026-05-28T11-25-36-104Z.json`
- Side-effect repair backup: `firebase/batch-j-side-effect-repair-backup-2026-05-28T11-34-26-189Z.json`
- Actions applied:
  - `uv_31259fec2d68508df3c2c6d1`: `Charlottetown Farmers' Market, 614 North River Rd` -> `venues/slug_charlottetownfarmersmarket`
  - `uv_8478cacef71d2f77cf7d66a1`: `Milton Hall` -> `venues/nvQTJXSbDsSfJTCxDKCH`
  - `uv_9d76f9d0801e5bb8a8eb3603`: `The Milton Hall` -> `venues/nvQTJXSbDsSfJTCxDKCH`
  - `uv_b0c6d79cc231fe5a3beb4322`: `Loyalist Country (195 Heather Moyse Drive, Summerside)` -> `venues/slug_loyalistcountryinn`
  - `uv_7d9a8fbdc5e39287220ca0ae`: `Loyalist Country Inn, 195 Heather Moyse Drive, Summerside` -> `venues/slug_loyalistcountryinn`
  - `uv_0b2dedc87436ab3f040f80c6`: `Founders' Food Hall & Makret` typo -> `venues/slug_foundersfoodhall`
  - `uv_7d3bb58931cec8b357734749`: `O'Briens` -> `venues/fb_100052606604879`
- Queue verification: `processDatasetSelectedRows` drained to empty after serial dispatch. Fifteen tasks were queued; six returned HTTP 500 on first attempt and were rerun after the retry window.
- Current queue snapshot after refresh: `manual_review` dropped from `435` to `429`, not `428`, because one replay created a new `Virtual (online)` unknown-venue record.

#### Direct target writes after side-effect repair
- `venues/slug_charlottetownfarmersmarket/events/7BbrHk3gYR6qEHtvV6lI`
  - Existing `Charlottetown Farmers' Market (Saturday market hours)` doc was updated by dedupe; retained source `1551026647033010_1`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/DFLkhXcrZbL3Sg7eGf16`
  - `Yard & Craft Sale`, `08:00-14:00`, source `1783617376425599_1`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/CTR6fStvgVxRwqvRb8kh`
  - `An Evening with Elvis`, `19:30-01:00`, source `1764540015000002_1`.
- `venues/slug_loyalistcountryinn/events/Mggb6LNKkQ4cXOmnnROT`
  - `Chronic Pain Strategy - Community Consultation Session (Prince County)`, `18:00-20:00`, source `1783098003144203_1`.
- `venues/slug_foundersfoodhall/events/fm6pEV2uXp2A87HA9m5K`
  - `Lilo & Stitch`, `14:00-16:00`, source `1382515020582698_7`.
- `Loyalist Country` craft-fair source `122136090356997321` produced no post-repair event doc in the Batch J audit.
- `O'Briens` source `1614826196947585` produced no new post-repair event doc; existing Red Shores food-special docs remain.

#### Replay skips and side effects
- The Founders/Downtown sampled rows expanded into a large Downtown Charlottetown calendar scrape. I deleted 75 newly-created side-effect event docs and kept only the direct Founders `Lilo & Stitch` target. Full deleted path list is in the side-effect backup.
- The same repair deleted:
  - two newly-created Red Shores duplicate `Theme Night - Pub Favourites` docs from source `1595350725561799`
  - one duplicate Elvis doc from sampled source `1755748262545844`
  - one Queens County chronic-pain session created under the wrong Rodd Charlottetown venue from source `1783098003144203_2`
- One pre-existing Queens County chronic-pain event was updated by dedupe and was not deleted: `venues/31MHpCb7juuQkKD5N98q/events/TP4f97oJpyCZhC0B1xbY`.
- Replays also refreshed manual-review unknown venue docs that were not finalized in this batch:
  - `uv_236ac869a6073539d620c27f`: `Virtual (online)`, new manual-review record from the chronic-pain source
  - `uv_39e82ff63d1e160bda38e591`: `Microtel Inn and Suites, 515 Notre Dame Street, Summerside`
  - `uv_605903dde90518d7961cd209`: `Montague High School cafeteria, 274 Valleyfield Road, Montague`
  - `uv_37da59a2cb5fb0f19bcc50ba`: `John Brown`
  - `uv_67e727818b3e352626fb9371`: `The Oak`
- Batch J confirms the selected-row finalizer is too aggressive for records with sampled sibling posts. For future batches, prefer one-source rows or use a replay path that does not enqueue sampled sibling source IDs.

### Batch K - Primary-sample replay aliases

#### Replay guard deployed before applying
- Code commit: `74af07f Guard unknown venue replay scope`
- Deployed function: `gathr-functions:finalizeUnrecognizedVenueTrigger(northamerica-northeast2)`
- Function URL: `https://finalizeunrecognizedvenuetrigger-6ju7yi5g2a-pd.a.run.app`
- Behavior change: unknown-venue finalizer now defaults to `replayScope: primary_sample`.
- Why it matters: resolving one unknown-venue doc no longer replays every sampled sibling row by default. It queues only the primary replayable sample unless a caller explicitly passes `replayScope: all_samples`.
- Remaining limitation: one primary source row can still parse into multiple events if the post itself is a multi-event calendar or schedule image. That is expected parser behavior and still requires post-replay audit.
- Verification:
  - `npm run build`
  - `node --test lib/services/unknownVenueResolver.replayTargets.test.js`

#### Finalizer actions
- Finalizer backup: `firebase/unknown-venue-batch-k-backup-2026-05-28T11-54-55-621Z.json`
- Alias repair backup: `firebase/batch-k-alias-repair-backup-2026-05-28T12-05-43-771Z.json`
- All finalizer responses returned `replayScope: primary_sample`.
- Actions applied:
  - `uv_6c1f27b6db070e3678ba203b`: `Milton Hall` -> `venues/nvQTJXSbDsSfJTCxDKCH`
    - sample count `5`, skipped sampled sibling rows `4`, queued source `1774366857350651`
  - `uv_b3647d71417297d5ec6fde9c`: `Confederation Court Mall Holman entrance` -> `venues/name_2lgcnn`
    - sample count `2`, skipped sampled sibling row `1`, queued source `928149306914141`
  - `uv_de1d9525acf89203ad84cc26`: `Rodd Charlottetown Hotel` alias -> `venues/fb_100063479865570`
    - queued source `1405635061589581`
  - `uv_95f55e5d5bcdf7bbe9de395d`: `Razzy's Roadhouse` -> `venues/slug_razzys.house`
    - queued source `1392881492880091`
  - `uv_7b5565726525003cf0037070`: `Famous Peppers Charlottetown` alias -> `venues/fb_100063642936644`
    - queued source `1571041301693953`
  - `uv_e9c782243299a2886d77c522`: `Carrefour de L'Isle Saint-Jean` -> `venues/slug_carrefourdelislesaintjean`
    - queued source `1343540547813921`
  - `uv_a8752b45f714ab20dcc79eb6`: `Farm Centre back parking lot` -> initially resolved to duplicate `venues/Wg9ldWt2KHK85iCoGWi7`
    - queued source `1588076283320054`
    - later repaired to canonical `venues/slug_peifarmcentre`
  - `uv_229258f98f791ac9eb994c3e`: `The 5th Wave` -> `venues/fb_100063680584674`
    - queued source `1594159769383361`
  - `uv_29f5e31531c8b2cb1a8ddb8e`: `The 5th Wave` address alias -> `venues/fb_100063680584674`
    - queued source `1594049046061100`

#### Direct target writes and skips
- `venues/nvQTJXSbDsSfJTCxDKCH/events/YmEQzFJrDpiveFuT4L5H`
  - `Yoga`, source `1774366857350651_1`, `2026-05-08 09:15-11:15`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/2vnkOPpsS6BEFz0OcWCu`
  - `Chronic Pain`, source `1774366857350651_3`, `2026-05-11 07:15-09:15`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/l1Eomp6PfbFH2B9EOccQ`
  - `Blankets`, source `1774366857350651_4`, `2026-05-13 10:15-12:15`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/B0HglnQ1xDE8yQUf5x5e`
  - `Yard Sale`, source `1774366857350651_5`, `2026-05-16 08:00-10:00`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/znS7ntmQPnqz0DjRYxfq`
  - `Lentils`, source `1774366857350651_6`, `2026-05-19 13:00-15:00`.
- `venues/nvQTJXSbDsSfJTCxDKCH/events/ii8SSNLIKWNltM6KI6nu`
  - `Flowers`, source `1774366857350651_7`, `2026-05-21 19:00-21:00`.
- `venues/name_2lgcnn/events/qOsmHWRruVEi77KxJ4S3`
  - `Beginner Linocut Printmaking Workshop`, source `928149306914141_1`, `2026-05-26 18:30-20:30`.
  - Snapshot row venue was `name_6387om` Blank Canvas, but the parsed event item resolved to Confederation Court Mall.
- `venues/slug_razzys.house/events/GxkV0BlxyxtxUSykn9DC`
  - `No Big Dill (Burger Love burger) - Razzy's Roadhouse`, source `1392881492880091_1`, `2026-04-21 11:00-21:00`.
- `venues/slug_razzys.house/events/DNW8tZVw64YsqBszG9C2`
  - `$1 from each burger sold supports Anderson House`, source `1392881492880091_2`, `2026-04-21 11:00-21:00`.
- `venues/fb_100063642936644/events/vgzSnlhzioKpgbtE0HnY`
  - Burger Passport stamp promo, source `1571041301693953_1`, `2026-04-20 11:30-21:00`.
- `venues/slug_carrefourdelislesaintjean/events/BbbQ38ks5bPNhJREqOtU`
  - `Libre-Service (Self-Service) - 500g portion`, source `1343540547813921_1`, `2026-03-05 08:30-21:00`.
- `Rodd Charlottetown Hotel` source `1405635061589581` produced a fresh parse snapshot, but `eventCount=0`.
  - Parser error: `Due to failing Stage 4 secondary validation`.
  - Snapshot establishment was `St. Paul's Anglican Church, Charlottetown`, venue id `slug_stpaulschurchinpei`.
  - No Rodd event doc was created.
- `The 5th Wave` source `1594159769383361` skipped because the source row had empty post content.

#### Alias and canonical repairs
- Farm Centre:
  - Added aliases to canonical venue `venues/slug_peifarmcentre`:
    - `PEI Farm Centre`
    - `Farm Centre`
    - `Back parking lot of the Farm Centre (Prince Edward Island Farm Centre)`
    - `Prince Edward Island Farm Centre (back parking lot)`
    - `Farm Centre back parking lot`
  - Removed only the just-added long exact alias from duplicate `venues/Wg9ldWt2KHK85iCoGWi7` to avoid an exact-alias conflict.
  - Corrected `unrecognized_venues/uv_a8752b45f714ab20dcc79eb6` from duplicate venue `Wg9ldWt2KHK85iCoGWi7` to canonical venue `slug_peifarmcentre`.
  - Replayed row `218` from file `1XN-tJRA4E3jidJpR_P000Nfj85l0vOMi`.
  - Result: `venues/slug_peifarmcentre/events/omy66Ak18dzqE8oVigFF`
    - `Fruit Tree Order Pickup Begins`, source `1588076283320054_1`, `2026-05-19 09:00-23:00`.
- Red Island Cider / The 5th Wave:
  - Added aliases to `venues/fb_100063680584674`:
    - `The 5th Wave`
    - `The 5th Wave Espresso & Tea Bar`
  - Replayed row `18` from file `1bFQ2h9A7iF_IQ4F64KCIRotFXCkGC8mb`.
  - Result: `venues/fb_100063680584674/events/0Al3MYedxQtUQeDi94W3`
    - `The 5th Wave Grand Opening`, source `1594049046061100_1`, `2026-05-04 07:30-23:00`.

#### Held items from this pass
- Do not bulk-resolve these without more review:
  - `Street Feast` -> suggested `PonyBoat Social Club`; likely wrong because Street Feast is a downtown area event.
  - `TBC` -> suggested `Milton Community Hall`; abbreviation is not enough evidence.
  - `Sterling WI Hall` -> suggested `Stanley Bridge Hall`; name similarity is not enough evidence.
  - A broad `A&W` multi-location record; needs per-location handling if it is a real app event.
  - `Virtual` / online records; should not create normal venues.

### Batch L - Strict existing aliases with direct replay audit

#### Finalizer actions
- Queue snapshot before batch: `tmp/unknown-venue-manual-review-rich-2026-05-28T12-11-09-464Z.json`
  - `manual_review`: `422`
- Queue snapshot after batch: `tmp/unknown-venue-manual-review-rich-2026-05-28T12-28-30-000Z.json`
  - `manual_review`: `414`
- Finalizer backup: `firebase/unknown-venue-batch-l-backup-2026-05-28T12-14-19-553Z.json`
- Event-placement repair backup: `firebase/batch-l-event-placement-repair-backup-2026-05-28T12-26-40-909Z.json`
- All finalizer responses returned `replayScope: primary_sample`.
- Actions applied:
  - `uv_d409aadb743aab0e7874d65f`: `Charlottetown Farmers' Market, 614 North River Road` -> `venues/slug_charlottetownfarmersmarket`
    - sample count `4`, skipped sampled sibling rows `3`, queued source `1628616635940677`
  - `uv_daada02af1d5f5024ae81a45`: `O'Briens` -> `venues/fb_100052606604879`
    - sample count `5`, skipped sampled sibling rows `4`, queued source `1626750482421823`
  - `uv_dc31ea6c0e286b2df93e5c1b`: `Prince Edward Island Farm Centre (back parking lot)` -> `venues/slug_peifarmcentre`
    - queued source `1588076283320054`
  - `uv_a1872f8df24c88647d4ea110`: `The 5th Wave` -> `venues/fb_100063680584674`
    - queued source `1594049046061100`
  - `uv_090712dc3e25ec51e953d4f9`: `Charlottetown Farmers' Market (temporary location), 614 North River Road` -> `venues/slug_charlottetownfarmersmarket`
    - sample count `2`, skipped sampled sibling row `1`, queued source `1600039285465079`
  - `uv_980d1987631cdc845b7cc825`: `Summerside Waterfront Cafe & Training Center` -> `venues/RJ9iYyEWcYUr91hcGSeL`
    - queued source `950849441028341`
  - `uv_f4e40f0d0cd3c989fc837f95`: `Charlottetown Mitsubishi (showroom)` -> `venues/luyMgWB1DMUHPUxvuxvO`
    - sample count `5`, skipped sampled sibling rows `4`, queued source `1389324513215570`
  - `uv_acffad063d9fca8c60efb388`: `Confederation Court Mall (Buenos Island Studio...)` -> `venues/0F6W6IBgJqlKQ8AmaTGC`
    - queued source `122132972169035455`

#### Direct replay audit
- The finalizer queued Cloud Task replays, but several source-id replays did not force fresh parse snapshots. I then replayed selected rows directly by `fileId` + `rowIndex`:
  - `12SyL08Juv1bNcNWSOE7o7nOAdjpohvhG`, row `209`: processed `1`, created `1`, updated `4`.
  - `1hG60uHGLZc8viuqzNxkWSIPFyIZJX7uP`, row `227`: processed `1`, created `0`, updated `1`.
  - `18ENh2qDumYVp30Wx6mBLRAN-sbKHnybU`, row `224`: skipped `1`; latest parse now correctly rejects it as a holiday greeting / closure notice with `eventCount=0`.
  - `14uFDS_Rs5SVJRthbDIXb3ff_cvpYZnaz`, row `246`: processed `1`, created `0`, updated `1`.
  - `12boS5aufaDzkDcehchylIiytoAPHbXoF`, row `317`: processed `1`, duplicate `1`; this still updated the old parent-mall doc, so I repaired placement manually.

#### Event writes and repairs
- `venues/fb_100052606604879/events/W6xawAOcRqbTR1GryLrf`
  - `3 Course Menu Special`, source `1626750482421823_1`, `2026-04-10 17:00-21:00`.
  - Existing doc updated by dedupe.
- `venues/slug_peifarmcentre/events/omy66Ak18dzqE8oVigFF`
  - `Fruit Tree Order Pickup Begins`, source `1588076283320054_1`, `2026-05-19 09:00-23:00`.
  - Existing doc updated by dedupe.
- `venues/fb_100063680584674/events/0Al3MYedxQtUQeDi94W3`
  - `The 5th Wave Grand Opening`, source `1594049046061100_1`, `2026-05-04 07:30-23:00`.
  - Existing doc updated by dedupe.
- `venues/luyMgWB1DMUHPUxvuxvO/events/2WtnXhOVdHsMFoDCxCGI`
  - `Meet Gerard Murphy (Ocean 100) at Charlottetown Mitsubishi`, source `1389324513215570_1`, `2026-05-23 10:00-14:00`.
  - New doc created then updated by direct replay.
- `venues/0F6W6IBgJqlKQ8AmaTGC/events/mTXXNWDNdHxG8aInnL3B`
  - `Sass Class (Sexy High Heels Dance Classes)`, source `122132972169035455_1`, `2026-04-25 13:00-15:00`.
  - Repaired from old parent path `venues/name_2lgcnn/events/mTXXNWDNdHxG8aInnL3B` to specific venue `Buenos Island Studio`.
- `venues/slug_charlottetownfarmersmarket/events/wLPCwUURFbQQVl8Z8iyK`
  - `Visit Alex of @riverdaleorchard at the Market (temporary location)`, source `1600039285465079_1`, `2026-05-02 09:00-14:00`.
- `venues/slug_charlottetownfarmersmarket/events/I8wSzrjsfBNgpsj1Z2ka`
  - `Chocolate Croissant`, repaired source `1628616635940677_2`, `2026-05-26 13:00-21:00`.
- `venues/slug_charlottetownfarmersmarket/events/uPAwtZUWC6QQp3is2eiB`
  - `Chocolate Explosion`, source `1628616635940677_3`, `2026-05-26 13:00-21:00`.
- `venues/slug_charlottetownfarmersmarket/events/aIxo73dg3Ma2rsDl6vNR`
  - `Eclair`, source `1628616635940677_4`, `2026-05-26 13:00-21:00`.
- `venues/slug_charlottetownfarmersmarket/events/BbmHRWR6pqZbTuYMwxw5`
  - `Tiramisu`, source `1628616635940677_5`, `2026-05-26 13:00-21:00`.
- Deleted duplicate/unstable Farmers Market doc:
  - `venues/slug_charlottetownfarmersmarket/events/LCOHxAA14HHCotIXrA7j`
  - Reason: duplicate Chocolate Explosion item from an earlier parser ordering; it occupied source suffix `_2` after the later replay used `_2` for Chocolate Croissant.
- Updated existing market-hours keeper:
  - `venues/slug_charlottetownfarmersmarket/events/7BbrHk3gYR6qEHtvV6lI`
  - Existing recurring market-hours doc retained source `1551026647033010_1`; dedupe refreshed its media/details from the new source.

#### Issues found
- Batch L found a real duplicate-ID risk: when a multi-item source row is re-parsed and the item order changes, semantic dedupe can update an old item while a later item creates a second doc with the same `uniqueId`. I repaired the live Farmers Market docs and added a write-path guard so incompatible exact-`uniqueId` collisions are logged and skipped instead of creating a second Firestore doc with the same `uniqueId`.
  - Deployed guard to `gathr-functions:processDataset(northamerica-northeast2)`.
  - Deployed guard to `gathr-functions:processDatasetSelectedRows(northamerica-northeast1)`.
- Batch L also found a parent-vs-specific placement issue: the Buenos Island parser snapshot said `venueId=0F6W6IBgJqlKQ8AmaTGC`, but the write path updated the old event under the parent mall venue. I repaired the live doc, but similar sublocation cases should be audited after replay.
- Several old post-derived events still have no managed event image even after replay:
  - `Fruit Tree Order Pickup Begins`
  - `The 5th Wave Grand Opening`
  - `Visit Alex of @riverdaleorchard at the Market`
  - `Meet Gerard Murphy (Ocean 100) at Charlottetown Mitsubishi`
  - These are not fixed in Batch L; they should be handled by a separate media backfill or parser image investigation.
- Remaining likely-existing bucket is not safe to bulk-apply. The next report still includes risky rows such as `CMP`, `TBC`, city/route-level Charlottetown rows, broad multi-location records, and organizer-vs-venue cases.

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
