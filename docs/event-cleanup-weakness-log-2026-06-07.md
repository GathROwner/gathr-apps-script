# Event Cleanup Weakness Log - 2026-06-07

Purpose: capture parser, ingestion, and cleanup weaknesses found during Firestore event cleanup so they can become follow-up fixes. This is not a deletion audit; backup and apply reports stay under `firebase/`.

## Findings

## Agent Workflow Notes

### Firestore inline Node helpers must use the firebase workdir

- Evidence: inline `node -` Firestore helper scripts fail from the repo root with `MODULE_NOT_FOUND: Cannot find module 'firebase-admin'`.
- Impact: repeated failed inspection commands slow down cleanup and create noisy artifacts.
- Follow-up: run inline Firestore helpers from `C:\Users\craig\Dev\gathr-apps-script\firebase`, where `firebase-admin` is installed, or explicitly resolve modules from `firebase/node_modules`.

### Hours and opening-hours posts can become event docs

- Evidence: Lighthouse Willy's "June Hours" and Kool Breeze "Greenhouse Open Hours" records were stored as recurring venue events.
- Impact: opening hours are not public app events and can keep recurring indefinitely when parsed as lifecycle-less recurring docs.
- Follow-up: add parser/suppression rules for titles/descriptions/images dominated by "hours", "open hours", "opening hours", "Mon-Fri", "Sat & Sun", and similar operating-hours language unless the post clearly announces a dated event.

### Broadcast/radio schedule posts can become event docs

- Evidence: CFCY "Country Top 40 with Fitz" Saturday/Sunday broadcast records were stored as recurring venue events.
- Impact: radio broadcasts are not venue events users can attend in the app. They clutter event feeds and bypass normal expiry when marked recurring.
- Follow-up: add parser/suppression rules for radio countdown/show schedule posts unless the source describes an in-person public event.

### Standing specials produce duplicate recurring docs across posts

- Evidence: Red Shores 3-course menu and fish-and-chips specials, Tipsy Farmers wings/deal posts, and similar restaurant specials can produce multiple open-ended recurring docs for the same standing offer.
- Impact: cleanup must choose a canonical record, usually the newest or best-media version, and delete older duplicates. Without dedupe, recurring specials accumulate.
- Follow-up: improve dedupe for same venue + same weekday/time + normalized special title/description, preferring recent `lastSeenAt` and usable media.

### Recent lastSeenAt does not guarantee usable media

- Evidence: some docs last seen in late May still had no image or 404 image URLs.
- Impact: review time is wasted chasing missing images, and the app may show stale/blank media even when the record was recently refreshed.
- Follow-up: investigate why dedupe/re-ingestion does not replace missing/404 media when a later source post has usable images.

### Open-ended recurring semantics need explicit product policy

- Evidence: valid standing specials and open-ended recurring activities often have no `recurrenceUntilDate`, relying on stale `lastSeenAt` cleanup.
- Impact: these look like lifecycle defects during Firestore review even when they may be valid. Cleanup behavior depends on the stale-recurring threshold.
- Follow-up: confirm desired stale-recurring window and document how open-ended recurring events should appear in the app while waiting for stale cleanup.

### Day-of-week-only sign text can become a weekly recurring event

- Evidence: Milton Community Hall "SAT ELVIS 730 $30" was stored as a weekly Saturday recurring event even though the sign did not expose a reliable date range or recurrence.
- Impact: one-off sign-board items can be stretched into open-ended weekly events.
- Follow-up: require stronger recurrence evidence than a day-of-week token when OCR comes from a mixed sign/list image. If no concrete date is present, send to review instead of creating a recurring event.

### Raffle and weekly draw posts can become event docs

- Evidence: PEI Humane Society "Gold Rush" weekly draw records were stored as recurring event docs.
- Impact: fundraising draws can appear like attendable public events even though they are better treated as promotions, source metadata, or ignored content.
- Follow-up: add parser/suppression rules for raffle, 50/50, draw, ballot, and prize-entry posts unless there is a clearly attendable in-person event.

### Casino table-game hours can become event docs

- Evidence: Red Shores "Table Games" and "Poker and Roulette" operating-hours records were stored as recurring venue events from one schedule post.
- Impact: game availability hours are venue logistics, not public app events, and can fan out into multiple recurring docs.
- Follow-up: suppress table-game/casino-hours schedule posts when the content is dominated by operating hours, game availability, age limits, and "to close" wording instead of a dated public event.

### Interest-gathering posts can become confirmed classes

- Evidence: Eastern Kings "Dance Fitness Class (Interest/Proposed)" was stored as a recurring Tuesday class from wording that said an instructor was willing to teach if there was enough interest.
- Impact: tentative demand-check posts can appear as confirmed events even before a real schedule is established.
- Follow-up: send posts containing "if there is enough interest", "gauging interest", "would you attend", or similar tentative language to review unless there is a clear confirmed date/time/range.

### Individual menu items can fan out as recurring specials

- Evidence: Tipsy Farmers "Tapas + Tunes Menu" created separate recurring docs for individual menu items from a single Sunday menu post.
- Impact: one menu/special post can become many weekly events, especially when day names are present but recurrence is not explicit.
- Follow-up: when parsing a menu image or post, avoid creating one recurring event per dish unless the source clearly presents each as a separate recurring special.

### Retail and lodging amenities can become daily events

- Evidence: Kool Breeze "Buy 4, Get 1 FREE" retail plant sale and Inn at Bay Fortune included-stay breakfast were stored as daily event/special docs.
- Impact: retail sales and hotel amenities are not necessarily app events, and date fallback from post time can make them appear as daily recurring items.
- Follow-up: add suppression or review routing for retail inventory sales, everyday value deals, and lodging amenities unless there is a public dated event or explicit app-relevant promotion policy.

### Source page and resolved venue can diverge

- Evidence: a Carr's Oyster Bar event doc was stored under the Carr's PEI venue while its source fields pointed to `facebook.com/InnatthePier` and a Pismo Beach, California address.
- Impact: a bad source/venue pairing can make unrelated page posts look like local venue events, and a title/venue-only cleanup pass may miss the real provenance problem.
- Follow-up: add validation that source page identity, source address, resolved venue, and location scope agree before publishing an event under a venue subcollection.

### Recurrence weekdays can contradict the source text

- Evidence: Mill River "Nine & Dine" text says available Sunday, Monday, and Tuesday during June, July, and August, while Firestore stored `recurringDaysOfWeek` as Monday through Friday.
- Impact: even when the lifecycle end date is recoverable, the app can show the event on the wrong days.
- Follow-up: add a recurrence integrity check that compares extracted weekdays against explicit day lists in the source text before publishing or during cleanup.

### Bad same-source siblings can sit outside the stale-recurring scan

- Evidence: an Inn at Bay Fortune lodging-availability post produced both a daily recurring breakfast/amenity doc and a non-recurring room-availability event doc from the same source.
- Impact: cleaning only lifecycle-less recurring docs can leave related bad one-off docs live in the app.
- Follow-up: when deleting a bad event, query same `uniqueId` root and same `sourceTimestamp` siblings even if they are non-recurring or already have lifecycle fields.

### Stored post image URLs can point at deleted/missing GCS objects

- Evidence: active Fiddling Fisherman, Eastlink Centre, and Buenos Island Studio docs referenced `gathr-uploaded-images/postimages/...webp` URLs that returned 404 during review.
- Additional evidence: the June 10 scheduled-cleanup candidate review found Old Triangle and Tipsy Farmers event docs whose `image`, `imageUrl`, `relevantImageUrl`, or `mediaUrls` pointed at `storage.googleapis.com/gathr-uploaded-images/postimages/...webp` objects that already returned 404 before the event docs were deleted.
- June 10 full image audit evidence: `firebase/event-image-integrity-audit-2026-06-10T11-53-02-882Z.json` scanned 787 live event docs, checked 1,231 unique managed GCS URLs, and found 297 missing URLs across 332 event docs.
- June 10 provenance evidence: `scheduledCleanup` at `2026-06-10T06:00:20Z` logged 48 `Image reference query failed` warnings because collection-group indexes were missing for `image`, `imageUrl`, `relevantImageUrl`, `cachedImageUrl`, `sharedPostThumbnail`, `mediaUrls`, and matching `metadata.*` fields. Cleanup then continued into image deletion. A Cornwall Library URL uploaded at `2026-06-09T13:49:57Z` was soft-deleted at `2026-06-10T06:00:28Z` while 67 live event docs still referenced it. Other Cornwall media URLs were logged as already removed by the same cleanup run.
- June 10 repair-pass evidence: after restoring recoverable soft-deleted objects and clearing the approved broken refs, `firebase/event-image-integrity-audit-2026-06-10T17-24-02-710Z.json` still found five 404 URLs on three event docs created after the earlier audit. These were not soft-deleted/restorable, which suggests fresh parser output or dedupe/managed-media fallback can still publish old broken managed image/profile URLs.
- Impact: source/image review can fail even when Firestore has an image URL, and the app may display broken media for recently seen records.
- Follow-up: during ingestion and dedupe, verify that selected uploaded media objects still exist before keeping them as `image`, `imageUrl`, `relevantImageUrl`, or `mediaUrls`; replace broken media from fresher siblings where possible. Post image garbage collection must fail closed when any reference scan query fails, and successful image deletes should log the exact URL/object so future provenance is direct.

### Legacy image provenance gaps should not become a manual backfill queue

- Evidence: after image provenance was added, the audit still found hundreds of older live event docs without `imageProvenance`, but most were created or last seen before the provenance deployment window.
- Impact: treating all missing provenance as equally actionable would create a large manual review bucket with little user-visible benefit, and many of those events will expire through normal cleanup.
- Follow-up: keep provenance mandatory for new parser writes and keep the read-only audit, but classify missing provenance by timestamp signals. Legacy missing provenance is informational; docs with `createdAt` or `lastSeenAt` inside the audit window and no provenance are parser regression candidates.
- Code follow-up: duplicate merge now backfills `imageProvenance` when a current parser result re-sees a legacy duplicate that lacks provenance, without doing a manual Firestore backfill.

### Schedule-summary posts can fan out into malformed recurring docs

- Evidence: one Fiddling Fisherman Lookout source produced restaurant-hours, wedding-closure, Seaside Musical Revival, Pub Nights, and Summer Concert Series recurring docs. Several used `2026-05-28` plus a `09:45` post-time fallback even though the text described July/August or evening events.
- Impact: a single venue schedule summary can create multiple app-visible recurring events with wrong date/time, including non-events like hours and closure logistics.
- Follow-up: if a source is a season/venue schedule summary, require explicit per-item dates/times before publishing; suppress hours/closures, and prefer dedicated event pages or later specific posts for recurring series.

### Non-weekly recurrence wording can be flattened into weekly events

- Evidence: Be You "Grinder Night + Confessions" says every second Friday, but Firestore stored `recurringPattern: weekly_friday`. Cornwall Public Library "Dungeons & Dragons" says last Monday of each month, but Firestore stored `weekly_monday`.
- Impact: valid events can show too often because the Firestore recurrence shape does not preserve biweekly or ordinal monthly cadence.
- Follow-up: confirm app-supported fields for biweekly and ordinal-monthly recurrence before writing corrections; route unsupported recurrence text to review or store a conservative single occurrence.

### Radio programming can be published as public events

- Evidence: CFCY "Country Top 40 with Fitz" schedule posts were stored as weekly Saturday/Sunday venue events.
- Impact: broadcast programming appears in the app even though it is not an attendable public event.
- Follow-up: suppress radio/TV/stream programming schedules unless the source describes an in-person public event.

### Operating-hours posts still reach event cleanup

- Evidence: PEI Preserve gift-shop hours and Point Prim Chowder House open-hours posts were stored as daily/weekly recurring event docs.
- Impact: venue logistics can remain app-visible for weeks until stale cleanup catches them, and they inflate lifecycle-less recurring review.
- Follow-up: strengthen parser suppression for titles/descriptions dominated by open hours, season hours, gift shop hours, closed days, and opening-time language.

### Donation/logistics windows can become events

- Evidence: Stratford Youth Centre flea-market item drop-off windows were stored as a weekly recurring event.
- Impact: support logistics for a later event can be shown as an event itself.
- Follow-up: route donation drop-off, item drop-off, pickup, registration, and volunteer/logistics windows to review unless the public activity itself is clearly the event.

### Aggregator-page posts can duplicate resolved venue events

- Evidence: Explore Summerside source posts created venue-level event docs both under the aggregator page venue and under the resolved actual venue for Evermoore's Celtic Jam.
- Impact: the same recurring public event can appear twice, often with one record carrying better media and the other carrying better venue placement.
- Follow-up: when source page identity differs from resolved venue, dedupe across venue subcollections using normalized title, date/time, source page, and resolved location before publishing.

### Weekday food-special titles can become open-ended weekly specials

- Evidence: Razzy's "Monday Special - Homemade Pulled Pork Hoagie" came from a June 8 source post for a specific dish, but Firestore stored it as `weekly_monday` with no lifecycle.
- Impact: one-day restaurant specials can continue showing on future weeks even when the special was only for the source-post date.
- Follow-up: require stronger recurrence wording than "Monday Special", "Tuesday Special", or similar weekday-title phrasing before setting `isRecurring` or `weekly_*`; otherwise keep it single-date and let normal past-event cleanup remove it.

### Expired finite recurring series can survive the normal cleanup window

- Evidence: the June 11 recurrence-integrity batch deleted 20 docs whose `recurrenceUntilDate` values were between May 11 and May 26, including Aging in Place, Luna pop-up hours, Kool Long Weekend specials, and acrylic workshops.
- Impact: these were valid human deletes in June, but they were outside earlier lifecycle-less review buckets because they already had lifecycle fields. The scheduled cleanup also keeps recurring docs until the computed series end plus the 30-day recurring grace window, so explicitly expired finite campaigns can remain visible longer than expected.
- Follow-up: split cleanup policy for finite recurring series from open-ended standing recurring events. If `recurrenceUntilDate` or `totalOccurrences` is explicitly derived from the source and is before the active display window, route to delete sooner than the 30-day open-ended grace rule.

### Same-day cleanup cutoff and fallback end dates delay obvious one-off cleanup

- Evidence: on June 11 at 3:00 AM Atlantic, scheduled cleanup used cutoff `2026-06-10` and queried only `startDate < cutoff`, so June 10 events were not scanned. The Knot and Trailside June 10 live-music docs also had `endDate: 2026-06-11` with `endTime: 01:00`, even though the source text described June 10 evening events.
- Additional June 11 evidence: the 21:18 scheduled-cleanup candidate audit found 74 delete candidates after the morning cleanup had succeeded. 71 had `startDate: 2026-06-10` and were excluded by the date-only cutoff. The other three older docs were seen by the 06:00Z scheduled run as recurring/active venue candidates, then later parser/dedupe updates on June 11 changed them into non-recurring delete candidates.
- Impact: "yesterday" events can survive one extra cleanup pass, and incorrect next-day end dates can delay deletion even further.
- Follow-up: audit whether same-day/yesterday cleanup should compare full local date-time instead of date-only `startDate`, and fix parser fallback that turns evening events without a clear end time into next-day `01:00` endings.
- Code follow-up: scheduled cleanup now scans `startDate <= cutoff` and evaluates non-recurring docs by their resolved `America/Halifax` end timestamp, while recurring docs keep the existing lifecycle/grace handling.

### Recurrence audit can misread date-time separators as date ranges

- Evidence: the June 11 high-severity recurrence audit interpreted `JUNE 15 - 1:00 PM` as a range ending on June 1, and interpreted `JUNE 24 - 1:00 PM` the same way. The affected Fan Experience and Watercolour Workshop docs were valid future events.
- Impact: audit output can recommend reviewing or deleting valid future events when poster text uses a hyphen between the date and time.
- Follow-up: keep date extraction from treating a hyphen before a time as a date-range separator, and add regression coverage for `June 15 - 1:00 PM` and similar poster text.

### Ticket-sale dates can look like expired event dates

- Evidence: the Arkells August 28, 2026 event was flagged as expired because the description said tickets go on sale Friday, April 10.
- Impact: future ticketed events can appear stale in cleanup review when the only past date is a sales or registration date.
- Follow-up: ignore ticket-sale/on-sale dates for expiry checks when the stored event date or source event timestamp is future-dated.

### Current finite recurring programs can be flagged by their start date

- Evidence: Buenos Island Studio Swing Nights was flagged as expired because the description said it starts April 21, even though the same text says it runs till the end of June and Firestore has `recurrenceUntilDate: 2026-06-30`.
- Impact: valid recurring series can be routed into delete review because the audit focuses on the earliest explicit start date and misses lifecycle/range wording.
- Follow-up: when a recurring doc has a future `recurrenceUntilDate`, suppress past-start-date expiry findings if the source text contains range wording such as "runs till", "through", or "end of".

### Camps and programs can be mistaken for operating hours

- Evidence: Eastern Kings Summer Camp 2026 was flagged as operating-hours-like because the post says Monday-Friday 8:30 AM-4 PM.
- Impact: valid dated camps/programs can be mixed with true operating-hours posts in cleanup review.
- Follow-up: treat camp/program wording as an attendable-event cue before applying operating-hours suppression or audit findings.

### Audit ignored stored biweekly interval on simple weekly patterns

- Evidence: Be You "Grinder Night + Confessions" was flagged as non-weekly recurrence flattened even though Firestore already had `recurringWeekInterval: 2` with `recurringPattern: weekly_friday`.
- Impact: valid biweekly events can be repeatedly routed into cleanup review even when the stored doc is already correct.
- Follow-up: recurrence audit rule resolution must preserve `recurringWeekInterval` for simple `weekly_*` patterns, not only for `weekly_custom` or explicit weekday arrays.

### Campaign ads and product offers can become event docs

- Evidence: Charlottetown Mitsubishi "Lease Special (2026 Eclipse Cross ES S-AWC)" was stored as an event with `totalOccurrences: 60` from the financing term "60 months".
- Impact: non-attendable ads can enter the event feed, and financing/payment terms can be misread as recurrence lifecycle.
- Follow-up: suppress vehicle/product lease, financing, price-only, and retail campaign ads unless the text describes a public in-person event.

### Child camp classes can inherit week-long daily recurrence incorrectly

- Evidence: Blank Canvas "Embroidery & Framed Art", "DIY Print Shop!", "Mosaics with Beans", and related named workshop docs are individual camp-day classes, but several inherited `recurringPattern: daily` through the end of the camp week.
- Impact: a one-day child class can show on multiple later camp days, creating duplicates beside the actual child docs.
- Follow-up: when a source poster supports both full-week registration and per-class child entries, only the full-week registration docs should carry a week-long daily lifecycle; named child workshops should stay single-date unless the same class explicitly repeats.

### Full-week camp registration docs can miss their daily lifecycle

- Evidence: Blank Canvas "Kids Art Camp (Ages 6-9) — Week 1" described a July 6-10 full-week camp registration option, but Firestore stored it as non-recurring with `totalOccurrences: 0`.
- Impact: full-week camp registrations can show only on the first day or be cleaned up too early, while the parallel preteen full-week doc is correctly daily through the end of the week.
- Follow-up: distinguish full-week registration docs from single workshop child docs, then assign daily lifecycle only to the full-week entries.

### Carousel posts can assign the wrong primary image to a valid child event

- Evidence: Hoedown, Art Buds Mini Market, and Blank Canvas Watercolour Scene docs had the correct event image in secondary media, while the primary image pointed at another image from the same source carousel.
- Impact: valid events can display a related but wrong poster/date, and manual reviewers can mistake the event itself for bad data.
- Follow-up: image selection should score candidate media against the parsed child event title/date/time, not just against the source post as a whole. If a secondary media item contains the child event date/title and the primary does not, prefer the matching secondary media.

### Broad venue carousels can create wrong-venue duplicate child docs

- Evidence: Come From Away show-run, pre-show chat, and post-show chat docs were stored under `slug_ccoagallery` from Confed Centre source carousels even though better related docs exist under `slug_confedcentre`.
- Impact: users can see the same production or related chat under the Art Gallery venue, often with all-day fallback times and duplicated siblings under the actual Confed Centre venue.
- Follow-up: when a parent organization source page produces child events for multiple internal venues, dedupe and venue-resolve across sibling venue docs before publishing, especially for all-day fallback child entries from the same carousel.

### Date-range events can be left as a single first-day doc

- Evidence: Confed Centre "Polka Dot Door" text says July 16-August 22 at 11 a.m., but Firestore has a single non-recurring doc under `slug_ccoagallery` with an overnight-style July 16-17 end and no better Confed Centre sibling.
- Impact: a valid run of events can show only once, or show with an odd generated end time, while the wrong parent venue makes the cleanup decision less obvious.
- Follow-up: when a source gives a date range without explicit daily/weekly wording, route it to a venue/range review queue instead of deleting it or blindly assigning daily recurrence.

### Multi-day weekly programs can be flattened to one weekday

- Evidence: Tennis PEI May-June program docs say Mondays & Wednesdays, but Firestore stored `recurringPattern: weekly_wednesday` with no `recurringDaysOfWeek`.
- Impact: valid Monday occurrences can be missing from the app even though the source text explicitly lists both days.
- Follow-up: for "Mondays & Wednesdays" and similar patterns, store `recurringPattern: weekly_custom` with `recurringDaysOfWeek` instead of choosing only one day.

### Missing end times can become overlong or overnight events

- Evidence: PEI Library "Fabulous Fruit Pizzas" says Saturday, June 27 at 11 a.m., but Firestore ended it at 9 p.m.; "Summer Reading Club Kick-Off Party" says Monday, June 29 at 2:30 p.m., but Firestore ended it on June 30 at 1 a.m.
- Additional evidence: Timothy's Cafe "Live & Acoustic: Caio Loesch" poster says Saturday, June 20 at 12:30 p.m., but Firestore ended it on June 21 at 1 a.m.
- Impact: valid one-off library programs can remain visible much longer than intended and later cleanup may wait for an artificial next-day end.
- Follow-up: when no end time is provided, use a bounded same-day default and avoid carrying generic venue/row end times into child events.

### Service/logistics announcements can become public events

- Evidence: Kari rural ride-share expansion posts were stored as North Rustico Lions Club event docs for Friday/Saturday late-night service hours.
- Impact: transportation availability and logistics announcements can appear in the event feed even though they are not attendable public events.
- Follow-up: suppress ride-share, transit, shuttle, route, service-hours, and launch-of-service logistics unless the post describes a specific public gathering with a host, venue, and program.

### Escaped newline text can confuse audit date and weekday extraction

- Evidence: the June 11 recurrence audit flagged Tennis PEI Monday/Wednesday weekly-custom docs as weekday mismatches because Firestore descriptions contained literal `\n` text. The extractor read `\nMondays` as `nmondays` and missed Monday.
- Impact: audit output can produce false-positive recurrence issues even when the stored Firestore recurrence is correct.
- Follow-up: normalize literal escaped newline/tab sequences before weekday/date extraction in audit helpers and parser review scripts. A June 12 audit-script fix cleared the false positives.

### Venue schedule and availability blocks still enter cleanup candidates

- Evidence: the June 12 scheduled-cleanup review found Bell Aliant Centre lane-swim, pool-open, pool-closed, and Aqua Arthritis schedule blocks, plus an Inn at Bay Fortune room-availability listing.
- Impact: routine facility schedules and inventory availability can appear as app events until cleanup removes each generated one-off.
- Follow-up: suppress pool/facility open/closed schedule blocks, lane-swim availability blocks, and hotel room availability unless the post describes a specific public event or registration program.

### Out-of-market venue docs may still receive event children

- Evidence: the June 12 scheduled-cleanup review included several Cornwall Public Library Ontario child events under `slug_librarycornwallontario`.
- Impact: event cleanup can remove expired children, but users may still see future out-of-market docs if source or venue scope filtering allows them through.
- Follow-up: audit source and venue location-scope filtering so non-PEI venue event docs do not enter the public GathR event feed unless intentionally supported.

### Semantically equivalent event titles can slip past dedupe

- Evidence: Hunter's Ale House had `Darcy’s Entertainment Trivia` and `Thursday Trivia Night` at the same venue/date/time. Albert & Crown had a recurring `Joey Doucette` Thursday series and a June 11 one-off `Joey (Live music)` at the same occurrence time.
- Impact: same real-world events can appear twice when one source uses a generic event title and another uses host/performer branding, or when a one-off source overlaps an existing recurring series occurrence.
- Follow-up: improve duplicate detection for same venue/date/start-time/event-type candidates by comparing generated recurring occurrences, source-page relationship, shared media, and host/performer/activity tokens. Do not merge same-time multi-act posters solely because they share a source root or image.

### Shared-source child events can all inherit one imperfect image

- Evidence: Merchantman Happy Hour created three daily child docs from one source root (`1871976887579856_*`) for oysters, beer, and Nova 7/rose, but all three display the same oyster-plate source image.
- Impact: valid child event docs can look like generic or mismatched fallback cards even when the parser only had one source image available for a multi-item post.
- Follow-up: distinguish source-post media reuse from true app fallback images in review tools and provenance. For multi-item food/drink specials, consider semantic image fallback only when the source post has no child-specific media, and record the reason clearly.

### Venue address and coordinate fields can disagree

- Evidence: The Mack venue doc has the correct address, `128 Great George St, Charlottetown`, but Firestore coordinates `46.2522162, -63.1393205`, which place its events near the University Avenue/UPEI area instead of downtown Great George Street.
- Impact: the app map clusters events at the wrong physical location even though the venue information panel shows the correct address.
- Follow-up: add a venue integrity audit for address/coordinate mismatch, especially when a venue address is downtown but coordinates cluster around a different known venue area. Repairs should back up both the venue doc and affected event docs before coordinate updates.

### Same-date duplicate candidates with conflicting times need review

- Evidence: Baba's Lounge has an accurate OBGMs tour-poster event at 10 p.m. and aggregator/calendar child docs at 7 p.m. for `OBGMs (Toronto)` and `Firing Squad`; the duplicate audit did not flag the OBGMs pair because the times differ by 3 hours and only one rare title token overlaps.
- Impact: wrong-time aggregator duplicates can survive same-time duplicate audits, while widening auto-dedupe would risk merging distinct same-day lineup items.
- Follow-up: create a read-only review bucket for same venue/date/event-type candidates with rare shared performer/title tokens but conflicting start times. Prefer review/delete over auto-merge when a specific source poster conflicts with an aggregator summary.

### Booking-deadline promotions can outlive their actionable window

- Evidence: Rodd Charlottetown Spring Sale was stored as a non-recurring food-special event through June 30 because the offer was valid for stays until June 30, but the description also said `Book by March 31, 2026`.
- Impact: a lodging promotion can remain on the map long after users can act on it, because scheduled cleanup uses the stored event end date and does not understand booking/purchase deadlines.
- Follow-up: detect `book by`, `reserve by`, `buy by`, `order by`, `register by`, and similar deadline phrases. For non-attendable promotions, treat the action deadline as the expiry date or suppress the post entirely unless it describes a public event.

### Carousel child events need title/date-to-image matching

- Evidence: the June 12 shared-source image review found Blank Canvas camp docs, Summerside Rotary Library program docs, Indigo Charlottetown docs, and Under the Spire East Coast Voices docs where all child events inherited one overview/first image even though more specific media existed on the same Firestore docs.
- Impact: valid child events can look duplicated or wrong in the app even when the source post supplied a better event-specific poster.
- Follow-up: audit the existing "most relevant image" selection path. It may be choosing the best image for the overall source post, but not re-running selection for each generated child event when one post mentions multiple events and includes multiple images. When a source post has multiple media URLs, score each media item against the child event title, date, performer, category, and detected source text. Prefer the best child-specific media over the first/overview media, and record image provenance for the selected media.

### Lineup posters can create wrong-week child events

- Evidence: Albert & Crown June 2026 live-music lineup children included docs whose stored dates did not match the poster: Crystal & Wade is shown as Fri Jun 5, Greenmount as Thu Jun 25, Perry & Cathy as Sat Jun 20, and Father's Day Joey Doucette as Jun 21, while some docs were stored on Jun 11-13.
- Impact: live-music children can appear on the wrong day, duplicate correctly dated siblings, or survive cleanup because the parsed stored date is not the actual source date.
- Follow-up: for month lineup posters, resolve weekday/date pairs against the poster month before writing, and flag conflicts when an existing source-root child has the same artist but a different stored date.

### Multi-act posters can split one real show into duplicate event cards

- Evidence: Under the Spire June Events produced separate same-time docs for `The Pairs`, `Beolach`, and `James Mullinger` from one Small Halls show, and separate same-time docs for `Arioso` and `Island A Cappella` from one concert listing.
- Impact: users can see multiple cards for what is likely one ticketed show because performers were extracted as separate event titles.
- Follow-up: when multiple performers share the exact same venue/date/time/source listing, prefer one event title with performers in description unless the source clearly lists separate shows.

### Misdated lineup children can duplicate correct future siblings

- Evidence: an Albert & Crown focused review on June 12 found `Father's Day` Joey Doucette children stored on June 11 and June 14 even though the correct June 21 sibling already exists, plus Greenmount/Perry & Cathy children stored on June 11/13 while correct June 25/20 siblings exist.
- Impact: repairing every bad child can create or preserve duplicate future cards when a correct sibling is already present from another source root or parser pass.
- Follow-up: when a child event's own text contradicts the stored date, first search the same venue for a matching title/artist/date/time sibling. If a better sibling exists, prefer deleting the misdated duplicate; only repair when no correct sibling exists.

### Midnight ranges can become false 24-hour events

- Evidence: PEERS Alliance `WERK NIGHT` says `Saturday, June 13th. 9 PM - Midnight`, but Firestore stored `startDate=2026-06-13`, `startTime=21:00`, `endDate=2026-06-14`, `endTime=21:00`. The live Firestore v2 event endpoint still served it with `includeExpired=false` because the stored end key was June 14 at 9 p.m.
- Impact: same-night events ending at midnight can stay active on the map all day after the event, even though scheduled cleanup and API expiry filtering are behaving according to the incorrect stored end time.
- Follow-up: add parser regression coverage for explicit `start PM - midnight` ranges and normalize them to next-day `00:00`, not same start time on the next day. Add a narrow API defense for non-recurring, suspicious 24-hour events whose text explicitly says `midnight`, so bad historical docs stop leaking while parser fixes roll forward.

### Operating-hours-only posts can survive prompt validation

- Evidence: Island Chef Downtown Lounge & Eatery created `venues/slug_islandchefdowntownloungeandeatery/events/jz456G5d13rzHqGtZodH` from a poster titled `Operating Hours (Sunday-Thursday)`. The stored description is only `Regular hours Sunday-Thursday: 11:00 AM - 8:30 PM.`, but Stage 4 kept it as a recurring `Family Friendly` event.
- Impact: prompt instructions say to reject business hours, but the same validation prompt also keeps items with specific timing. A model can treat hours as a timed event and generate a recurring map card.
- Follow-up: add deterministic Stage 4 filtering for hours-only extracted items. Keep actual public activities such as open swim, classes, live music, happy hour, and priced specials even when they mention hours.

### Cleanup audits can mix previous-day stale docs with same-day ended docs

- Evidence: the June 15 post-parse scheduled-cleanup audit reported 51 delete candidates, but 28 were events from June 15 that had ended earlier that same day. The manual operating rule is to let same-day docs age out at the overnight cleanup instead of preempting them during the evening.
- Impact: review output can look more urgent than it is and could lead to deleting same-day event cards before the intended 3 a.m. cleanup boundary.
- Follow-up: make scheduled-cleanup review reports split `previous_day_or_older_delete_candidates` from `same_day_wait_for_overnight_cleanup` so manual cleanup focuses on docs that should already have been removed.
