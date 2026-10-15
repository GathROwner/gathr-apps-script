# FiN Taco Thursday: October15 source review, prevention and exact recovery

## Source and current live state

Source post `122305763552019252`, October14, explicitly changes Taco Tuesdays
to every Thursday and offers fish or chicken. Original ordered gallery has one
poster, independently viewed: **Fish Tacos, $7 each, Special Available All Day
Long**. No chicken price or separate chicken serving clock appears. The
original workbook supplies exact post permalink
`https://www.facebook.com/61550577560449/posts/122305763552019252`.

Fresh Firestore discovery confirms exact existing venue
`venues/1MYRGigRnV8KbuEigjMg`, FiN Folk Food,106 Beach Road, Grand Tracadie.
Its eight existing event siblings contain no taco parent or Tuesday copy.
No active parser. No event, venue, source or media writes in this preparation.

Current first-party [contact page](https://finfolkfood.ca/contact-us/) explicitly
labels **NEW FALL2026 HOURS — Open Everyday:7am–8pm**, agreeing with the
October10 cached venue hours. Retained HTML is independently fetched and checked.
The same site contains older2022 hours and an undated homepage closing notice
whose weekday/date does not fit2026. Those are excluded; no seasonal recurrence
end is invented. Source media SHA256:
`a9a65519558daef866c9ec4dd1dcf7bf8657f0fe3f88eb537136889ad5a59240`.

## Preventive findings and serving release

Both captured Stage4 responses now preserve both Thursday items after the
previous compact-placeholder repair. Offline actual Stage5.5 playback revealed
a second failure: Fish resolves07–20 from all-day/closing evidence, while the
untimed Chicken item received07–21 via category default, beyond venue closing.
The source does not support that21:00 finish.

Narrow release `2ce92a77b2a355a44d4eb8667842ada45b02c77d` bounds only an
unconfirmed special category-default cutoff by verified closing hours. The
reason remains `category_default`, retaining uncertainty rather than relabeling
it as a printed ending. Explicit clocks, other activity categories, starts
outside known hours and unverified hours retain their existing policy.
Overnight spans are tested. No stage prompts/models/cache allocations changed.

Build,20 focused checks and all809 compiled backend tests passed. Idle-lock
preflight and codebase-qualified three-parser dry run passed before deployment.
Independent readback at17:33:49 UTC confirms ACTIVE,100% latest traffic and
common hash `c8f778d960e9fd45d2efd5624d0b5b3b1411fb84`:

- `processdataset-00487-tes`
- `processdatasetresume-00451-jan`
- `processdatasetselectedrows-00443-kas`

All raw environment/secret bindings and resource/security settings match the
pre-deploy snapshots. Global date-only publication remains OFF. Evidence is in
the isolated release checkout's `functions/artifacts/fin-tacos-release/` and
`functions/artifacts/fin-tacos-{build,focused,full-tests}.txt`.
The existing firebase-functions SDK warning remains; no SDK update was made.

## Exact proposed live action — not yet applied

Create only:
`venues/1MYRGigRnV8KbuEigjMg/events/oct15_fin_122305763552019252_dc008c031ae01b13`.

- Title: **Thursday Fish Tacos**; Food Special; $7 each **for fish only**.
- Weekly Thursday, first source-supported occurrence October15; no invented
  end horizon.07:00–20:00 is venue-hours-derived availability supported by the
  poster's all-day offer and explicitly current2026 first-party venue hours.
- Preserve exact source ID/permalink, existing venue/address and original
  poster. Upload that verified poster once to managed `postimages`; never use
  the profile image as the event poster or delete any media.
- Description preserves the advertised chicken choice, explicitly saying no
  chicken price or separate serving window was supplied. No separately timed
  or falsely all-day Chicken card is created by this plan.
- Use the established legacy `to_close` contract, not new v2 date-only or
  experimental null-date all-day metadata.

Default-dry helper: `firebase/repair-fin-fish-tacos-oct15.mjs`.
Reviewed plan: `functions/artifacts/fin-tacos-oct15/plan-2026-10-15T17-31-19-460Z.json`.
Full prewrite preparation backup: matching `backup-2026-10-15T17-31-19-460Z.json`.
It pins the complete source/venue/sibling state, candidate fields, source-image
hash and exact target absence. Apply requires exact approval, fresh idle/source/
venue/sibling checks, another prewrite backup and transactional rechecks. Upload
intent/result are persisted locally; an unknown upload outcome is not retried
blindly. After creation verify exact payload/untouched references, original
image200, detail and complete feed, plus the generated October22 occurrence.

## Existing app compatibility and evidence limits

The existing frontend coordinator tested actual current app and accepted older
`a43cb20` source offline for October15/22. The established legacy payload derives
each occurrence date correctly, recognizes `until_close`, exports the correct
07–20 calendar span without a duration prompt, and expires after20:05 using the
existing five-minute grace. It uses normal Now eligibility during that window.
For this explicit all-day Fish offer, that is source-supported availability;
it is not the no-Now date-only policy for unknown serving times. The description
must explain that the hours are venue-derived rather than printed on the poster.
Legacy normalization still treats derived start as observed; no claim of newly
improved provenance UI is made.

The null-localDate v2 all-day alternative follows recurrence dates but expires
at midnight, asks for calendar duration and has misleading pre-opening copy.
Pinned v2 October15 dates incorrectly expire the generated October22 occurrence.
Neither alternative is used. No frontend code/OTA/map/emulator change occurred.
These are synthetic offline app checks, not device adoption or live backend
recurrence proof. Backend recurrence projection is verified through the real
API after any approved create. A separate Chicken parent remains held until
its serving availability is source-supported or the honest untimed recurrence
publication/display contract is completed; its caption information is retained.
