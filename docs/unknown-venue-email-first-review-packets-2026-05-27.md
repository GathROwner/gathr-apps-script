# Unknown Venue Email-First Review Packets - 2026-05-27

Purpose: use the actual unknown-venue review emails as the intake and decision record, then cross-check current Firestore/resolver state before applying venue actions.

Important caveat: an email is a point-in-time snapshot. If a venue or alias was created after the email was sent, the email's candidate/action buttons may be stale. The email still gives the doc id, sample event, original post link, and available operator actions, but current Firestore state must be checked before clicking or scripting an action.

## Review Flow

1. Start from Gmail unknown-venue email.
2. Extract:
   - email id and subject
   - unknown venue doc id
   - observed venue name
   - location hint and occurrence count
   - candidate cards and action links
   - sample event names, dates, descriptions, and original post links
3. Cross-check the matching `unrecognized_venues/{docId}` record:
   - current status
   - current `sampleEvents`
   - current `suggestedMatches`
   - whether new venues/aliases created after the email would change the decision
4. Review the original post when the email/report context is not enough.
5. Decide one of:
   - `resolve_existing`
   - `create_new`
   - `ignore`
   - `hold/research`
   - `city/area-level review`
6. If an action is applied, log:
   - backup path
   - finalizer action
   - replay task id
   - created/updated/skipped event result

## Packets

### APM Centre

- Email id: `19e6a8521107ce8f`
- Email subject: `Unknown venue review: APM Centre`
- Unknown venue doc: `uv_a63da539fc1d738b0e191342`
- Email timestamp: `2026-05-27T17:39:29`
- Observed venue: `APM Centre`
- Location hint: `North Milton, PE`
- Occurrences: `2`
- Email candidate:
  - `APM Centre`
  - Type/confidence: `places`, `100%`
  - Address: `35 Mercedes Dr, Cornwall, PE C0A 1H0, Canada`
  - Facebook: `https://www.facebook.com/p/APM-Centre-100063625111310`
  - Website: `http://www.apmcentre.com/`
  - Phone: `(902) 628-8513`
  - Place ID: `ChIJ35nx9-usX0sR3Qaug3oRL0M`
- Email actions available:
  - `Create New Venue From This Candidate`
  - `Ignore This Unknown Venue`
- Sample event:
  - `APM Bylaws Meeting`
  - Date/time: `2026-05-27 19:00`
  - Original post: `https://www.facebook.com/100043320621129/posts/1791809775606359`
- Current report cross-check:
  - Bucket: `parent_venue_or_sublocation_review`
  - Organizer/page: `miltoncommunityhall` / `http://www.facebook.com/pages/Milton-Community-Hall/380730012010498`
  - Organizer venue signal: existing `Milton Community Hall` (`nvQTJXSbDsSfJTCxDKCH`)
  - Suggested match still points to APM Centre via Places/Apify.
- Original post review:
  - Facebook post text is a Milton Community Hall weekly-neighbourhood schedule.
  - The embedded schedule image explicitly says `Wed. May 27 - APM Bylaws Meeting - APM Centre - 7 p.m.`
  - This confirms `APM Centre` is the physical venue for that listed event, not the Milton Community Hall organizer/page fallback.
- Current venue search:
  - No existing Firestore venue found for `APM Centre`, `35 Mercedes`, or related APM terms.
  - Existing organizer signal `Milton Community Hall` is not the physical event venue for this item.
- External venue confirmation:
  - Resolver candidate: `APM Centre`, `35 Mercedes Dr, Cornwall, PE C0A 1H0`, phone `(902) 628-8513`, Facebook `https://www.facebook.com/p/APM-Centre-100063625111310`, Place ID `ChIJ35nx9-usX0sR3Qaug3oRL0M`.
  - Official APM site text confirms contact phone `902-628-8513` and mailing address `P.O. Box 178, 35 Mercedes Drive, Cornwall, PE C0A 1H0`.
- Recommended action: `create_new`
- Reason: The venue is real, the original post confirms the event location, and there is no current Firestore venue to alias. The caveat is event-quality, not venue-quality: `APM Bylaws Meeting` is a governance/community meeting. If those should be filtered from the app, that needs content-quality filtering after venue resolution, not a venue alias decision.
- Applied result:
  - Applied via scripted create-new finalizer on `2026-05-27`.
  - Backup: `firebase/unknown-venue-apm-stratford-create-backup-2026-05-27T21-16-46-075Z.json`
  - Unknown venue status moved to `created_new`.
  - Created venue: `venues/ItWg0uH2yXtETbhlepAJ`
  - Venue address: `35 Mercedes Dr, Cornwall, PE C0A 1H0, Canada`
  - Venue coordinates: `46.2357393, -63.2052504`
  - Venue Facebook: `https://www.facebook.com/p/APM-Centre-100063625111310`
  - Queued selected-row replay task: `uvreplay-e0d70f1b2ebadb249a4b3783b855a52f`
  - Replay result: created `venues/ItWg0uH2yXtETbhlepAJ/events/mCsVC5ZCJGvhV6ZPyReC`
  - Created event: `APM Bylaws Meeting`, `2026-05-27 19:00-21:00`
  - Address repair backup: `firebase/unknown-venue-apm-stratford-event-address-repair-backup-2026-05-27T21-23-35-319Z.json`
  - Final event address corrected to the APM Centre address and coordinates after replay initially carried the Milton Community Hall source-page address.
  - Replay also surfaced a separate `CMP` / `Car Show` unknown venue from the same source post; that remains on hold because `CMP` alone is not enough evidence for a safe venue alias.

### Stratford Town Centre Gymnasium

- Email id: `19e6a85d2485bcbf`
- Email subject: `Unknown venue review: Stratford Town Centre Gymnasium`
- Unknown venue doc: `uv_25358b4a9bcf7c001f6c63f3`
- Email timestamp: `2026-05-27T17:40:15`
- Observed venue: `Stratford Town Centre Gymnasium`
- Location hint: `Stratford, PE`
- Occurrences: `1`
- Email candidate: none
- Email actions available:
  - `Ignore This Unknown Venue`
- Sample event:
  - `Community Flea Market`
  - Date/time: `2026-05-30 08:00`
  - Description: `Community Flea Market - Saturday, May 30th 8:00am to 12:00pm. Stratford Town Centre Gymnasium. Rain or Shine! Over 70 tables of Flea Market merchandise.`
  - Original post: `https://www.facebook.com/100064856313650/posts/1453285933509937`
- Current report cross-check:
  - Bucket: `parent_venue_or_sublocation_review`
  - Organizer/page: `StratfordYouth` / `https://www.facebook.com/StratfordYouth`
  - Organizer venue signal: existing `Stratford Youth Centre` (`FceWAtYDPJCixXOBU0Fq`)
  - Suggested matches: none
- Original post review:
  - Facebook post text says the Stratford Community Yard Sale includes a massive flea market at the Stratford Town Centre.
  - The embedded image says `Community Flea Market`, `Saturday, May 30th`, `8:00am to 12:00pm`, `Stratford Town Centre Gymnasium`, `Admission: $2.00`, `Over 70 tables of Flea Market merchandise`, and identifies it as a Stratford Youth Centre fundraiser.
  - This confirms the physical location is `Stratford Town Centre Gymnasium`; `Stratford Youth Centre` is the organizer/fundraiser page, not the venue.
- Current venue search:
  - Existing `Stratford Youth Centre` (`FceWAtYDPJCixXOBU0Fq`) is at `57 Bunbury Road` and should not receive this event.
  - No existing Firestore venue found for `Stratford Town Centre`, `Stratford Town Centre Gymnasium`, `Stratford Town Hall Gymnasium`, or `234 Shakespeare`.
- External venue confirmation:
  - Town of Stratford official site lists `Stratford Town Centre Office`, `234 Shakespeare Drive, Stratford, PE Canada C1B 2V8`, with a `View Gym Hours` link.
  - The same page lists the Recreation Desk phone `(902) 569-6250`.
- Recommended action: `create_new`
- Proposed canonical venue: `Stratford Town Centre`
- Proposed aliases:
  - `Stratford Town Centre Gymnasium`
  - `Stratford Town Hall Gymnasium`
  - `Stratford Recreation Centre`
- Reason: This is a real public community event at a real municipal facility. It should not be ignored and should not be resolved to the Youth Centre organizer. Because the current email generated no candidate suggestions, creation likely needs a manual/synthetic create flow rather than simply clicking the existing email.
- Applied result:
  - Applied via scripted create-new finalizer on `2026-05-27`.
  - Backup: `firebase/unknown-venue-apm-stratford-create-backup-2026-05-27T21-16-46-075Z.json`
  - Unknown venue status moved to `created_new`.
  - Created venue: `venues/31MHpCb7juuQkKD5N98q`
  - Venue address: `234 Shakespeare Drive, Stratford, PE C1B 2V8`
  - Venue coordinates: `46.2265862, -63.08734429999999`
  - Venue Facebook/page URL: `https://facebook.com/townofstratford`
  - Added aliases: `Stratford Town Centre Gymnasium`, `Stratford Town Centre`, `Stratford Town Hall Gymnasium`, `Stratford Recreation Centre`
  - Queued selected-row replay task: `uvreplay-dc899a88c2cc6022112e18d7eeb6ea51`
  - Replay result: created `venues/31MHpCb7juuQkKD5N98q/events/qKmR3jNE6mo56KFsH4Bk`
  - Created event: `Community Flea Market`, `2026-05-30 08:00-12:00`, ticket price `$2.00`
  - Address repair backup: `firebase/unknown-venue-apm-stratford-event-address-repair-backup-2026-05-27T21-23-35-319Z.json`
  - Final event address corrected to the Town Centre address and coordinates after replay initially carried the Stratford Youth Centre organizer address.

### Downtown Charlottetown Participating Locations

- Email id: `19e6a8250a722d94`
- Email subject: `Unknown venue review: Downtown Charlottetown (participating locations)`
- Unknown venue doc: `uv_bce57c76fba91a9ce74261da`
- Email timestamp: `2026-05-27T17:36:25`
- Observed venue: `Downtown Charlottetown (participating locations)`
- Location hint: `Charlottetown, PE`
- Occurrences: `1`
- Email candidate: none
- Email actions available:
  - `Ignore This Unknown Venue`
- Sample event:
  - `Downtown Discount Card - minimum 10% off/savings`
  - Date/time: `2026-05-24 13:00`
  - Description: `Get your Downtown Discount Card for just $5 and enjoy a minimum 10% discount or savings at participating locations.`
  - Original post: `https://www.facebook.com/100064726384797/posts/1430608865773313`
- Current report cross-check:
  - Bucket: `no_candidate_research`
  - Organizer/page: `DowntownCharlottetownInc` / `https://www.facebook.com/DowntownCharlottetownInc`
  - Suggested matches: none
- Recommended action: `ignore`
- Reason: This is a discount-card/participating-locations promo, not a normal venue event. It should not create a city-level venue or a Downtown Charlottetown venue alias.
- Applied result:
  - Applied via email ignore action on `2026-05-27`
  - Backup: `firebase/unknown-venue-email-first-ignore-backup-2026-05-27T19-53-49-522Z.json`
  - Before status: `manual_review`
  - After status: `ignored`
  - Replay: none; ignore action does not replay rows.

### Glasgow Square

- Email id: `19e6a8a5eb2596d1`
- Email subject: `Unknown venue review: Glasgow Square`
- Unknown venue doc: `uv_914500289a0fef992bdc174c`
- Email timestamp: `2026-05-27T17:45:13`
- Observed venue: `Glasgow Square`
- Location hint: empty
- Occurrences: `1`
- Email candidate:
  - `Glasgow Square Theatre`
  - Type/confidence: `places`, `70%`
  - Address: `155 Riverside Pkwy, New Glasgow, NS B2H 5E1, Canada`
  - Facebook: `https://www.facebook.com/glasgowsquare`
  - Website: `http://www.glasgowsquare.com/`
  - Phone: `(902) 752-4800`
  - Place ID: `ChIJhf8tQrIeXEsRJu45kkmHUM4`
- Email actions available:
  - `Create New Venue From This Candidate`
  - `Ignore This Unknown Venue`
- Sample event:
  - `Luka Hall & Irish Millie Summer 2026`
  - Date/time: `2026-07-12 13:00`
  - Description: `Songs From The Square, Glasgow Square, New Glasgow, NS, 1-3pm`
  - Original post: `https://www.facebook.com/100063597751828/posts/1556648323131745`
- Current report cross-check:
  - Bucket: `outside_pei_or_travel_review`
  - Organizer/page: `lukafiddle` / `https://www.facebook.com/lukafiddle`
  - Suggested match still points to Glasgow Square Theatre in New Glasgow, NS.
- Recommended action: `ignore`
- Reason: The candidate appears real, but it is in Nova Scotia. Creating out-of-market venues from PEI artist travel posts would pollute the PEI app venue/event set.
- Applied result:
  - Applied via email ignore action on `2026-05-27`
  - Backup: `firebase/unknown-venue-email-first-ignore-backup-2026-05-27T19-53-49-522Z.json`
  - Before status: `manual_review`
  - After status: `ignored`
  - Replay: none; ignore action does not replay rows.

## Immediate Process Change

Do not use cluster order alone for venue work. Use clusters only to find duplicates/similar names. For each actionable group, create a packet like the above from the Gmail email plus current Firestore report before applying finalizer actions.
