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

The full compiled backend suite passed 549/549 tests and the narrow Firebase
dry run passed. A Firestore read found zero running parser locks before deploy.
Commit `0319ef9` was deployed to `gathr-migrated` with the codebase-qualified
parser targets. The interrupted CLI session had updated `processDataset` and
`processDatasetResume` but left `processDatasetSelectedRows` on the prior
revision. A separate narrow dry run and deploy updated that function. The
post-deploy readback found all three ACTIVE with Firebase source hash
`6ec1fb03acc847610ed2dd5f3ef8ae2cf4e42b10`:

| Function | Serving revision |
| --- | --- |
| `processDataset` | `processdataset-00457-yuh` |
| `processDatasetResume` | `processdatasetresume-00421-tab` |
| `processDatasetSelectedRows` | `processdatasetselectedrows-00413-yey` |

All three retain the production model routing: Luna high for 100% of eligible
Stage 3 image posts, GPT-5 mini for Stages 1–2, GPT-5 nano for Stages 4–5,
GPT-5.2 for image-ineligible Stage 3, and no legacy fallback. The Firebase CLI
warned that `firebase-functions` is outdated; upgrading it is outside this
repair.

The approved live record repairs were completed after deployment using exact
guarded plans and complete backups. See `docs/luna-stage3-oct8-live-repair-plan.md`
for target paths and independent Firestore and app-feed verification. Luna
remains at 100% of eligible Stage 3 image posts for the next regular full-run
audit. No media were deleted and the GathR map was not touched.
