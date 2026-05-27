# Unknown Venue Group Review - Evermoore

Status: venue created and representative row replayed.

Cluster source:
- `tmp/unknown-venue-name-clusters-2026-05-27T19-09-48-035Z.json`
- `docs/unknown-venue-name-clusters-2026-05-27T19-09-48-035Z.md`

## Summary

- Cluster key: `evermoore`
- Manual-review unknown docs in this group: `6`
- Current/future docs as of 2026-05-27: `0`
- Firestore venue search for `evermoore`: no existing venue found.
- Likely real venue: `Evermoore Brewing Co.`
- Verified public venue data:
  - Name: `Evermoore Brewing Co.`
  - Address: `192 Water St, Summerside, PE C1N 1B1`
  - Website: `https://www.evermoorebrewing.ca/`
  - Phone: `902-436-7218`
  - Email: `info@evermoorebrewing.ca`
  - Facebook URL used by Explore Summerside event listing: `https://www.facebook.com/evermoorebrewing`

## Applied Result - 2026-05-27

Approved action applied:
- Created venue: `venues/Ty6yXQ3VwbKRlpnU7J9x`
- Created from representative unknown: `unrecognized_venues/uv_55101b7ac7d7867a6b8b40e4`
- Finalizer action: `create_new`
- Finalizer backup: `firebase/unknown-venue-evermoore-create-backup-2026-05-27T19-18-40-680Z.json`
- Drive append result: appended `1`, skipped existing `0`
- Initial row replay task: `uvreplay-417aad475613c4df6accb911e490d09f`

Created venue fields verified:
- Name: `Evermoore Brewing Co.`
- Address: `192 Water St, Summerside, PE C1N 1B1`
- Facebook URL: `https://www.facebook.com/evermoorebrewing`
- Website: `https://www.evermoorebrewing.ca/`
- Phone: `902-436-7218`
- Email: `info@evermoorebrewing.ca`
- Category: `brewery`
- Coordinates: `46.390918, -63.788393`
- Google place id: `ChIJZZNgNwubX0sRDMsoq7ROEJ8`
- Aliases added: `Evermoore`, `Evermoore Brewing`, `Evermoore Brewing Co`, `Evermoore Brewing Co.`, `Evermoore Brewing Co. (192 Water St)`

Representative event result:
- Event path: `venues/Ty6yXQ3VwbKRlpnU7J9x/events/lILuqQ3EPCGosjtB4bKf`
- Event name: `Saturday Sessions (traditional Celtic music)`
- Original post/page URL stored by parser: `https://www.facebook.com/DowntownSummerside`
- Source post id in replay: `1580387734090990`
- Start/end: `2026-05-16 13:30` to `2026-05-16 16:00`
- Address after repair/replay: `192 Water St, Summerside, PE C1N 1B1`
- Coordinates after repair/replay: `46.390918, -63.788393`
- Media: no managed media on this old post replay; Facebook image downloads failed in parser logs.

Issue found and fixed during replay:
- The first replay created the event under Evermoore but carried the source page address `125 Heather Moyse Dr...`.
- Root cause: when a full-parser item resolved to a different venue than the source row/page, the write path still used the row/page fallback address from the parsed item.
- Code fix deployed to `processDatasetSelectedRows`, `processDataset`, and `processDatasetResume`: if the event-specific venue differs from the row/page and the parsed address matches the row/page fallback address, the event uses the resolved venue address instead.
- Test added: `rowProcessor.facebookEventsEndTime.test.ts` now covers this address fallback shape.
- Verification replay through `processDataset` row `273`: processed `1`, created `0`, updated `1`; event remained at `192 Water St` with coordinates.

Additional backups:
- Location/event repair backup: `firebase/evermoore-location-repair-backup-2026-05-27T19-37-42-126Z.json`
- Alias repair backup: `firebase/evermoore-aliases-backup-2026-05-27T19-39-45-196Z.json`

Sources checked:
- Official site: `https://www.evermoorebrewing.ca/`
- Tourism PEI listing: `https://www.tourismpei.com/attractions/evermoore-brewing-co`
- Explore Summerside listing/event data: `https://exploresummerside.com/member/evermoore-brewing-co/` and `https://exploresummerside.com/event/live-music-tuesdays-at-evermoore/`

## Proposed Workflow For This One Group

Do not bulk-write yet. If Craig approves this group:

1. Use one representative unknown venue doc to `create_new` venue `Evermoore Brewing Co.` with the verified address/website/phone/email/Facebook URL.
2. Confirm the finalizer created the venue and queued replay for that representative row.
3. Re-run or finalize the remaining five unknown docs against the newly created venue, so their rows replay through the normal parser/write pipeline.
4. Verify:
   - each unknown doc moves out of `manual_review`
   - selected-row replays finish
   - events are created/updated/skipped as expected
   - no new duplicate Evermoore unknown venue docs appear
5. Update the audit/result report with before/after status for each doc.

## Proposed Venue Payload

```json
{
  "name": "Evermoore Brewing Co.",
  "address": "192 Water St, Summerside, PE C1N 1B1",
  "city": "Summerside",
  "province": "PE",
  "website": "https://www.evermoorebrewing.ca/",
  "phone": "902-436-7218",
  "email": "info@evermoorebrewing.ca",
  "facebookUrl": "https://www.facebook.com/evermoorebrewing",
  "category": "brewery",
  "aliases": [
    "Evermoore",
    "Evermoore Brewing",
    "Evermoore Brewing Co",
    "Evermoore Brewing Co.",
    "Evermoore Brewing Co. (192 Water St)"
  ]
}
```

## Records In Cluster

### 1. Tuesday Live: Dan Doiron

- Unknown venue id: `uv_ac53db38b52f1fe5758e97b6`
- Observed venue: `Evermoore Brewing`
- Event date/time: `2026-04-21 18:00`
- Original post: `https://www.facebook.com/100047389250304/posts/1632023148387311`
- Organizer/page: `exploresummerside` / `https://www.facebook.com/exploresummerside`
- Description preview: Tomorrow's Tuesday Live! April 21st, Dan Doiron is back at Evermoore.
- Suggested match: `Evermoore: Island Dining & Brewing`, address `192 Water St, Summerside, PE C1N 1B1`, confidence `0.7`, no existing venue id.
- Proposed action after venue creation: `resolve_existing` to newly created Evermoore venue.

### 2. Evermoore Brewing Company 5 Miler

- Unknown venue id: `uv_1c0c18bdfc4029ce5b5a8ba2`
- Observed venue: `Evermoore Brewing Co`
- Event date/time: `2026-05-05 09:00`
- Original post: `https://www.facebook.com/100064205469326/posts/1380292854120884`
- Organizer/page: `peimarathon` / `https://www.facebook.com/peimarathon`
- Description preview: Road race event: Evermoore Brewing Co 5 Miler presented by the PEI Marathon; post says spots are filling fast and links to registration.
- Suggested match: none.
- Proposed action after venue creation: likely `resolve_existing` to newly created Evermoore venue, but note this is a race. It may be a start/host venue rather than an in-venue event.

### 3. 6th Annual Evermoore Brewing Co 5 Miler

- Unknown venue id: `uv_d0b1032bd9cb181584a1729d`
- Observed venue: `Georgetown, PEI (implied by hashtag #GeorgetownPEI); Evermoore Brewing Company / PEI Marathon`
- Event date/time: `2026-05-13 09:00`
- Original post: `https://www.facebook.com/100047389250304/posts/1653449906244635`
- Organizer/page: `exploresummerside` / `https://www.facebook.com/exploresummerside`
- Description preview: Road race/run/walk event. Post says registration is nearly sold out.
- Suggested match: `Georgetown`, address `Georgetown, PE, Canada`, confidence `1`.
- Proposed action: hold, not auto-resolve.
- Reason: The observed venue string includes Georgetown plus Evermoore/PEI Marathon; this may be parser confusion or route/start-location logic. It should not be blindly attached to Evermoore.

### 4. Saturday Sessions

- Unknown venue id: `uv_55101b7ac7d7867a6b8b40e4`
- Observed venue: `Evermoore Brewing Co. (192 Water St)`
- Event date/time: `2026-05-16 13:30`
- Original post: `https://www.facebook.com/100063593349606/posts/1580387734090990`
- Organizer/page: `DowntownSummerside` / `https://www.facebook.com/DowntownSummerside`
- Description preview: As part of Open City, Evermoore Brewing Co is hosting Saturday Sessions from 1:30 pm to 4 pm; traditional Celtic music; address 192 Water St.
- Suggested match: `Evermoore Brewing Co. (192 Water St)`, address `192 Water St, Summerside, PE`, confidence `0.82`.
- Proposed action: best representative doc for `create_new`, because it has the cleanest observed venue and address.

### 5. Live Music Tuesday: Geoffrey Charlton

- Unknown venue id: `uv_f6bcb2e087a2612bf6d812a8`
- Observed venue: `Evermoore`
- Event date/time: `2026-05-19 18:00`
- Original post: `https://www.facebook.com/100047389250304/posts/1659320682324224`
- Organizer/page: `exploresummerside` / `https://www.facebook.com/exploresummerside`
- Description preview: Every Tuesday at Evermoore means good music, cold beer, and an easy night out in downtown Summerside; Geoffrey Charlton live from 6 to 8 PM.
- Suggested match: none.
- Proposed action after venue creation: `resolve_existing` to newly created Evermoore venue.

### 6. Traditional Celtic Music Circle

- Unknown venue id: `uv_f4eaf964568ea60ecd0a6830`
- Observed venue: `Evermoore Brewing Co.`
- Event date/time: `2026-05-23 13:30`
- Original post: `https://www.facebook.com/100063479741853/posts/1570234235102553`
- Organizer/page: `Holmansicecream` / `https://www.facebook.com/Holmansicecream/`
- Description preview: Evermoore Brewing Co - Traditional Celtic music circle - 1:30 pm - 4 pm.
- Suggested match: none.
- Proposed action after venue creation: `resolve_existing` to newly created Evermoore venue.

## Decision Needed

Approve or reject this first test group:

- `approve Evermoore`: create the venue from `uv_55101b7ac7d7867a6b8b40e4`, then process the other safe Evermoore docs against it.
- `hold Evermoore`: do not write anything; move to the next cluster.

If approved, I will not process `uv_d0b1032bd9cb181584a1729d` automatically because that one has a Georgetown/route ambiguity.
