# Daisy shared-origin prevention — October 14

Craig approved integration/testing/release after coordinator review of the
investigation chat's `8bece5f` patch. Coordinator branch
`codex/shared-offer-origin-20261014` starts at accepted `756fc22` (runtime
`e026d19`), preserving every Be You/active-series repair. Cherry-pick `dfb262f`
contains the Daisy fix; the only cherry-pick conflict was additive ignore paths.
No older parser checkout is deployed.

## Source-backed finding and limits

The original screenshot and August14 workbook identify **Daisy's Dairy Bar and
Grill** as the author of the $11.99 Monday/Wednesday Burger Basket offer. PEI
Foodies shared it. The importer discarded the structured original author while
keeping the offer text, causing both occurrences to use the publisher's venue
and11:00 opening time. The original caption supplies no clocks.

The coordinator independently viewed both screenshots, inspected the source
workbook/captured outputs and read the actual patch/tests. The location owner,
“Review GathR location queues”, independently investigated read-only. The
[Tourism PEI listing](https://www.tourismpei.com/attractions/daisys-dairy-bar-and-grill)
uses Daisy's heading and655 Main St, Cornwall, but its body still names Decker's
and lists May14–September14 operation. It links to Decker's page. This supports
a possible rename/successor at that address, not an approved venue identity
migration or proof of current October offer availability. Facebook throttling
limits current first-party verification. Existing Decker's venue
`venues/fb_100063590381790` remains unchanged. No replacement offer or venue is
invented. Historical Monday/Wednesday source evidence remains retained.

## Implemented prevention

- XLSX and direct Apify imports preserve original author name/profile, original
  post URL/time alongside the sharing identity; snapshots retain the evidence.
- A narrowly scoped first-person Food Special that merely repeats the sharing
  page is resolved against its structured original business. Only an exact
  existing original-venue match is accepted; missing/fuzzy/publisher matches
  hold. Explicit third venues/rooms, routes and structured Facebook Events
  retain their existing path.
- Publisher address and publisher-derived clocks are cleared; explicit source
  clocks and both advertised weekdays survive.
- Coordinator review found another path: unknown-review city hints/address and
  later spreadsheet hydration could reuse the sharing-page identity. New
  original-business samples use the original author/profile/post URL, retain
  file/row/source trace and store sharing-page provenance separately. The
  `shared_original_business` role prevents resolver backfill from restoring an
  outer publisher's address. Untagged legacy hydration still works.
- Hydration read/write dependencies are injectable for deterministic tests;
  production defaults preserve the existing persistence behavior. The first
  new mixed-sample test exposed an unintended test persistence attempt with no
  credentials; it failed before any write. Final tests inject both dependencies
  and perform no live writes.

## Verification

Build passes;55 focused tests and all761 compiled backend tests pass. Fourteen
added tests cover ingestion, first-person author selection, held missing/fuzzy
venues, explicit clocks/rooms/routes, source-separated review payload and real
mixed-sample hydration. Both source formats use the actual live read-only venue
matcher: no exact Daisy venue, therefore held, no clocks borrowed. The actual
review sample builder and hydration path preserve original source identity and
refuse publisher backfill. No paid model calls or parser replay writes.

Captured comparison covers all1,144 captured event documents against the full
380-row August14 source workbook (29 differing shared authors). Exactly the two
Daisy parents match this source-backed mechanism. Other workbooks/categories
are outside that bounded scan; this is not a global zero-duplicate claim.

## Separate resolver baselines

All three serving parsers were freshly ACTIVE on common baseline hash
`b08f69995f660b68ec851b648fff969b1c15e2df`. The resolver endpoints have separate
serving code, including municipal identity repairs missing from the parser's
checkout. Each release is assembled from its own immutable archive/readback:

| Endpoint | Baseline hash | Region |
|---|---|---|
| scheduledUnknownVenueResolver | `8bba926e50fce5f1bd5cfe3f4346b932e904937e` | northamerica-northeast1 |
| processUnrecognizedVenues | `e1d70db8fe92cbc601a2cceccddf719f1188ff6f` | northamerica-northeast2 |

Both archives have SHA256
`0b536ccd28808e65039a4a2ac0f9f9ed237c3af804bddee0b4253c2acc50f70d`;
resolver before SHA256
`4fda0b897041c60b41ca12b954a237684ee8bc8b43a4d07858b22f3fb9162193`.
The only resolver runtime change is the tagged-origin hydration guard (plus
test dependency injection), optional sample role type and its tiny pure helper.
Municipal variants/road-result protection are retained. Each assembled baseline
builds and passes19 resolver/identity/hydration tests. Each target retains its
own57 user configuration keys; platform-managed keys regenerate normally.
Reproducible assembly: `functions/scripts/assemble-shared-origin-resolver.mjs`.
Local private archives/env/readbacks stay under `functions/artifacts/daisy-oct14/`.

## Exact data plan

The GathR event-integrity skill requires exact live deletion approval; the
coordinator requested it after fresh read-only guards/backup. Pending targets:

- Wednesday: `venues/slug_peifoodies/events/L6dOyFMhpOWTcZSdwPfh`.
- Monday: `venues/slug_peifoodies/events/krhMcNCxV2s5sM7m26si`.

These are distinct supported weekdays at the wrong venue, not duplicates of one
another. Delete only these two publisher parents, retain all media/venues and
hold Daisy recovery until identity/current operation/offer evidence is verified.

Reviewed plan:
`firebase/artifacts/daisy-oct14/plan-2026-10-14T22-35-11-713Z.json`.
Fresh guarded dry-run backup:
`firebase/artifacts/daisy-oct14/prewrite-backup-2026-10-14T22-37-02-307Z.json`.
Application helper `firebase/repair-daisy-publisher-records-20261014.mjs`
defaults to dry run, checks both exact source siblings/title/clock/recurrence,
document versions/content hashes, publisher version, all publisher siblings and
no active parse, then uses one atomic transaction. It cannot move events,
create/rename a venue or delete media. API detail/full-feed verification follows
any approved application. Code release does not itself repair existing records.

## Release commands and gates

Before each release, confirm idle processing locks and unchanged serving
baseline. Parser build/test gates are complete. From coordinator `functions/`:

```powershell
npm run build
$tests = @(Get-ChildItem lib -Recurse -Filter '*.test.js' | ForEach-Object { $_.FullName })
node --test @tests
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated --dry-run
firebase deploy --only 'functions:gathr-functions:processDataset,functions:gathr-functions:processDatasetResume,functions:gathr-functions:processDatasetSelectedRows' --project gathr-migrated
```

From each separately assembled resolver serving directory, run narrow dry-run
then deploy with `--only 'functions:gathr-functions:scheduledUnknownVenueResolver'`
or `--only 'functions:gathr-functions:processUnrecognizedVenues'`, respectively,
and `--project gathr-migrated`. Independently read all five ACTIVE revisions,
100% latest traffic, expected common parser hash and preserved configuration.
No model/prompt/SDK/map changes. The existing outdated Functions SDK warning
is a separate deferred upgrade. Verified release/data outcomes follow below.
