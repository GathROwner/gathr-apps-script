# October 8 Luna Stage 3 repair

Source audit: `docs/luna-stage3-oct8-100pct-production-audit.md`. The regular
October 8 parse completed 368/368 rows on dataset
`1kIx_zGW7BZMf8F55eCYTQYOeYuFq-VLv`. Luna handled 65 image posts; one
selected post used an anchored text route.

## Repairs and read-only evidence

- **Cavendish Farms PowerSkating, row 287.** The flyer prints ten U9–U11
  Saturday dates and ten U13–U15 Sunday dates, with November and late December
  gaps. Stage 3 and Stage 4 each retained 20 items. Stage 5 split a consecutive
  middle fragment into a different category and incorrectly promoted just that
  fragment to a weekly recurrence; two live parents materialized unprinted
  November 7/8 sessions. The revised final pass recognizes the complete sparse
  date sequence across category labels and keeps each printed occurrence
  separate. A local no-write Stage 5 replay on the actual saved Stage 4 payload
  returned 20 distinct one-offs, no weekly parent, and no November 7/8 date.
  Evidence: `functions/artifacts/luna-oct8-full-audit/row287-stage5-readonly.json`.
- **Hunter's Ale House, row 16.** Luna's initial response listed Thursday
  trivia, Thursday Brad & Isaac, Friday Griff & Guest, Saturday Gin N Tonic,
  and Sunday music trivia. An unrelated umbrella-theme date remap reduced
  those five to two. A Facebook OCR placeholder, “May be an image of text,”
  also supplied a false month signal. The remap now skips an already dated
  multi-day inventory and ignores that OCR placeholder as a month. A local
  no-write five-stage replay returned all five source events, with Friday and
  Saturday each at the poster's 10 p.m. time. Evidence:
  `functions/artifacts/luna-oct8-full-audit/row16-local-readonly.json`.
- **Recent same-day dates.** Row 212 Trailside (posted October 8 for October 8)
  and row 226 Evermoore (posted October 7 for October 7) were held by the
  recent-past yearless guard despite source-grounded same-day dates. The guard
  now holds only dates strictly before the post's local date. The same-day and
  prior-day regression cases pass. A local no-write five-stage replay of row
  212 returned the October 8, 8 p.m. show instead of holding it; evidence:
  `functions/artifacts/luna-oct8-full-audit/row212-local-readonly.json`.
- **Post eligibility.** Final source checks now reject the Souris nomination
  filing, Tipsy Farmers' seven ordinary Grab 'n Go fridge items, PEI Co.
  Christmas merchandise, an ordinary Tignish new-product pie notice, and a
  Bell Aliant pool-closure notice. A read-only check against their actual live
  Firestore documents dropped those 11 items while retaining Tipsy Farmers'
  three advertised specials and Bell Aliant's nine public activities. It also
  retained the Tignish grocery deal; a separate recurrence guard removes its
  unsupported weekly rule. Evidence: `functions/artifacts/luna-oct8-full-audit/
  live-filter-preview.json` and complete read backup `live-filter-backup.json`.

## Release boundary

Parser code can be deployed after the compiled suite and narrow Firebase dry
run pass and a fresh check finds no active full parse. Deployment prevents new
bad writes but does not change the 11 existing false listings, two wrong
PowerSkating parents, or missing Hunter performances. Those live repairs need
an exact guarded plan, current document readback, a fresh backup, and Craig's
approval under the GathR event-integrity repair workflow. Do not delete media
or alter the GathR map.
