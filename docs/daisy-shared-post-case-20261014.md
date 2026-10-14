# Daisy’s Dairy Bar and Grill — shared-post venue loss

Case DAISY-002, received October14: two original screenshots independently
viewed. One is the GathR card at PEI Foodies,17 Pownal Street; the other shows
PEI Foodies sharing **Daisy’s Dairy Bar and Grill**. Status: local prevention
validated; production deployment and live repair remain coordinator-owned.

## Exact trace

Worktree `C:\Users\craig\.codex\worktrees\ca1c\gathr-apps-script`, branch
`codex/be-you-duplicate-investigation`, additive to committed Be You baseline
`1060e549e60e6e73332c55c382a7e2dd9e109743`. No other checkout changed. The
coordinator is separately integrating/revising recurring hardening; this case
must remain a separate commit for reconciliation before any release.

Fresh readback still shows all three production parsers ACTIVE/latest traffic
at hash `4f54118bd8f92b0cbd2b0456e3172f345809dd26`: revisions
`processdataset-00480-cuw`, `processdatasetresume-00444-mak`,
`processdatasetselectedrows-00436-ciy`. This local fix is not serving.

Two stored parents, one source:

| Schedule | Full Firestore path | Source ID | API occurrence |
|---|---|---|---|
| Wednesday | `venues/slug_peifoodies/events/L6dOyFMhpOWTcZSdwPfh` | `1738543821054078_9bfee87a748ab02b` | `L6dOyFMhpOWTcZSdwPfh_20261014` |
| Monday | `venues/slug_peifoodies/events/krhMcNCxV2s5sM7m26si` | `1738543821054078_9ad3b4a6e6d2a3c6` | `krhMcNCxV2s5sM7m26si_20261019` |

Both are Burger Basket Day (Burger Basket),$11.99, with legitimate source
wording “Every Monday & Wednesday.” Those weekdays are two supported schedule
components, not duplicates of each other. Both incorrectly belong to
`venues/slug_peifoodies` (PEI Foodies | Charlottetown PE). Base dates are Aug17/19;
created Aug14. Stored start11:00 is explicitly marked semantic, “Start from
venue hours (opens11:00),” and21:00 is an unsupported category default. The
original post supplies neither clock. Correcting the venue must not carry
these publisher-derived clocks into Daisy’s record.

Sharing post: [PEI Foodies, Aug13](https://www.facebook.com/100046954317167/posts/1738543821054078).
Original [Daisy’s page](https://www.facebook.com/people/Daisys-Dairy-Bar-and-Grill/61575935160163/),
post timestamp **2026-08-10T14:01:10.000Z**. Sharing timestamp
**2026-08-13T22:47:35Z**. The complete original permalink is preserved in the
local raw row. MacQuarries is thanked as the beef supplier, not named as the venue.

The actual original Drive dataset `1I3vDBQk5prUtMaNBDvfM9TaZHWkKHQkM` was
downloaded read-only. Its matching row contains all of:

- `sharedPost/pageName/name` and `sharedPost/user/name`: Daisy’s Dairy Bar and Grill.
- Both shared profile URLs: the Daisy’s page above.
- `sharedPost/text`: the full first-person burger offer.
- `sharedPost/url`, `sharedPost/time`, original photo and OCR metadata.
- Outer `user/name`: PEI Foodies; outer text: “Great deal and great food!”

`driveService.extractRowData` preserved the shared text/media but discarded
the shared author and original URL/date. `rowProcessor` consequently supplied
only PEI Foodies as the row establishment. The two retained Aug14 format
snapshots explicitly emit PEI Foodies as establishment and the wrong inferred
hours. The writer resolves that existing publisher venue and accepts it as
fallback. Two update audits show only same-source poster replacement on retry;
they did not cause or correct the venue error.

Snapshots: `parse_snapshots/1I3vDBQk5prUtMaNBDvfM9TaZHWkKHQkM_29_1786711801877`
and `parse_snapshots/1I3vDBQk5prUtMaNBDvfM9TaZHWkKHQkM_29_1786712404052`.
Complete captures, captions, audit rows and original workbook remain local under
`functions/artifacts/daisy-oct14/`. No production data is committed.

API details return200 for both parents. Ten fully paginated pages (993 current
events at capture) contain the Wednesday Oct14 and Monday Oct19 occurrences
under PEI Foodies. This is a persisted ingestion defect; screenshot “Today”
alone is not used to establish capture date.

## Local prevention and controls

The XLSX importer and direct Apify fallback preserve the structured shared
author name/profile URL and original post URL/time, while retaining the outer
sharing identity. Parse snapshots now retain these fields too. Models/prompts,
SDK settings, ordinary source identity, and recurrence policy are unchanged.

`sharedFoodOfferVenue.ts` applies only to first-person **Food Special** offers
where the item has merely repeated the sharing page or original author. It
does not override an explicit other venue/room, spatial event or structured
Facebook Event. An exact original-business match is required; fuzzy results,
missing venues and matches returning the sharing page hold. The unknown-venue
candidate is the original business. Publisher-repeated location labels,
publisher address and unsupported publisher-derived clocks are removed.
Source-supported explicit clocks and Monday/Wednesday cadence remain intact.

Build and11 focused checks pass. Full compiled backend suite:747 tests pass.
Controls cover XLSX and direct ingestion, original-source provenance, known
original venue, missing/fuzzy/wrong-publisher matches, ordinary/same-author
sources, explicit other venue/room/route, explicit clocks, and separate weekdays.
Both original captured formatted items execute the actual live read-only venue
selector and return **no exact Daisy’s match**; both become held original-business
offers with unknown clocks rather than PEI Foodies publications. No model calls,
paid replays, queue writes, venue writes, deployments or event writes occurred.

## Venue and current-offer limits

No venue with Daisy’s name or original profile ID exists in the current full
venue inventory. Decker’s Dairy Bar & Grill | Cornwall PE exists separately at
`venues/fb_100063590381790`,655 Main St, with a different Facebook page. This
case does not authorize renaming or aliasing that business.

[Tourism PEI](https://www.tourismpei.com/attractions/daisys-dairy-bar-and-grill)
lists Daisy’s at655 Main St, Cornwall, with May14–September14 operating dates,
but its body still calls the business Decker’s and mentions Brackley Beach.
That mixed information is a reason to verify the canonical location, current
business identity and October offer/hours before recovery. It is not proof of
a closure or permission to move a currently recurring record automatically.
The first-party page fetch was throttled; the original spreadsheet and Craig’s
source screenshot remain the direct historical evidence.

## Bounded related-case scan

Compared all1,144 current documents with the complete380-row August14 source
workbook;29 rows retain differing shared authors. The same first-person food
offer/publisher failure selects exactly these two parents, one source family.
No additional live candidate appears within this source-backed comparison.
Other source workbooks and categories were not exhaustively reconstructed;
this is not a global claim that no other sharing page is affected.
Evidence: `playback-and-scan.json`.

## Exact proposed live repair — not applied

Default-dry helper: `firebase/plan-daisy-publisher-repair-readonly.mjs`.
The guarded read-only plan proposes **deleting only the two PEI Foodies parents**
listed above, with no venue change, poster deletion or invented replacement.
Recovery of the original Daisy’s offer remains held for canonical venue,
current availability and time review. Both weekdays and the historical source
remain available in the full backup and source captures.

- Full backup: `firebase/artifacts/daisy-oct14/backup-2026-10-14T21-36-36-631Z.json`.
- Plan: `firebase/artifacts/daisy-oct14/plan-2026-10-14T21-36-36-631Z.json`.

Dry run passed with zero writes: exact source sibling inventory, document
versions, title/source/clocks/recurrence fingerprints, publisher version and no
active parser. It refuses `--apply`; the coordinator owns review, exact approval,
fresh guards/backup, atomic application and details/feed verification. Be You
and all other pending plans remain separate.

## Coordinator integration outcome

The earlier local/prepared sections are historical investigation evidence.
Craig approved integration/release on the accepted Be You baseline. Coordinator
`dfb262f` imports this patch; `42f5330` adds original-source review separation
and protects resolver hydration from restoring a sharing-page address. All761
backend tests,55 focused checks, both19-test serving-baseline resolver suites
and actual captured full-writer dry previews pass. The three parsers and two
separately assembled resolver functions are verified ACTIVE/100% latest traffic;
parser source hash is `05085d8b2f51df99d8c8e67e40146f1902afdf64`. No model/SDK/prompt
settings changed and no older resolver/parser baseline was substituted.

The location specialist independently supports the mislocation finding but
holds Daisy/Decker identity migration and current offer recovery for first-party
confirmation. Exact two-record deletion approval was requested against the
fresh guarded plan; live data remains unchanged pending that approval. See
`docs/daisy-shared-origin-oct14-release.md` for exact revisions, hashes, test
artifacts, fresh backup/plan and current approval status.
