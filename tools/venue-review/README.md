# Venue Review Tool

This tool packages the venue cleanup workflow we have been doing manually:

1. find the venue
2. find the bad live docs for one or more target events/specials
3. find the most likely source rows / parse snapshots
4. optionally back up and delete the bad docs
5. optionally rerun the source rows through live `processDataset`
6. inspect the fresh snapshots and the fresh Firestore write results in one JSON report

It is designed for rapid-fire cleanup work when a venue has stale bad data and we want to know:

- is this still reproducible with the current parser?
- is it just legacy Firestore data?
- did the rerun come back as recurring or one-off?
- did the write path land the same way the snapshot did?

## What it does

- resolves a venue by `--venue` or `--venue-id`
- scans that venue's live Firestore docs for target names/phrases
- scans that venue's `parse_snapshots` for matching rows
- scores likely source rows for each target
- can delete the matched live docs with a backup first
- can rerun the selected rows using deployed `processDataset`
- writes a single report under [results](C:/Users/craig/Dev/gathr-apps-script/tools/venue-review/results/)

## What it does not do

- it does not patch parser code
- it does not decide on your behalf whether a recurrence rule is conceptually correct
- it does not clean unrelated venue docs

## Basic usage

Inspect only:

```powershell
node tools/venue-review/run-venue-review.mjs `
  --venue "Harbourfront Theatre" `
  --target "Trent McClellan" `
  --target "Harbour Charger"
```

Clean the matched docs, rerun the best source rows, and inspect the result:

```powershell
node tools/venue-review/run-venue-review.mjs `
  --venue "Harbourfront Theatre" `
  --target "Trent McClellan" `
  --target "Harbour Charger" `
  --apply-cleanup `
  --rerun
```

Override the automatically selected rows when you already know the exact source rows:

```powershell
node tools/venue-review/run-venue-review.mjs `
  --venue "Harbourfront Theatre" `
  --target "Trent McClellan" `
  --target "Harbour Charger" `
  --row 1OETFgiaf1uiUA8L5xFNMBmmyr9TJpgq1:208 `
  --row 1-R_OUk1keZQXRnMOCZXF4ALGVZfJ8yT0:277 `
  --apply-cleanup `
  --rerun
```

Use an explicit venue id:

```powershell
node tools/venue-review/run-venue-review.mjs `
  --venue-id slug_harbourfronttheatre `
  --target "Trent McClellan"
```

## Flags

- `--venue "<name>"`
  Resolve the venue by name.
- `--venue-id <id>`
  Resolve the venue directly by Firestore venue id.
- `--target "<phrase>"`
  Repeatable. The event/special names or phrases to investigate.
- `--row <fileId:rowIndex>`
  Repeatable. Use explicit source rows instead of relying only on automatic snapshot selection.
- `--apply-cleanup`
  Back up and delete the currently matched live docs before rerun.
- `--rerun`
  Rerun the selected source rows through live `processDataset` with `parserMode: full5stage`.
- `--report-label "<label>"`
  Optional stable label for the output filename.
- `--max-snapshot-candidates <n>`
  Limit how many candidate rows are kept per target in the report.

## Output

Each run writes one JSON report under [results](C:/Users/craig/Dev/gathr-apps-script/tools/venue-review/results/).

The report contains:

- venue summary
- targets
- matched live docs before cleanup
- ranked candidate snapshots per target
- cleanup backup path, if cleanup ran
- rerun calls and their responses, if rerun ran
- latest snapshots for rerun rows
- matched live docs after rerun

## AI-facing workflow

When an AI is asked to use the Venue Review tool, the intended sequence is:

1. run the tool in inspect mode first
2. confirm the matched docs and suggested rows look correct
3. rerun with `--apply-cleanup --rerun`
4. read the single report
5. summarize whether the issue was:
   - stale legacy Firestore data
   - still reproducible in the current parser
   - fixed by rerun
   - still needing code changes

## Recommended use cases

- past events or specials still showing in the app
- recurring docs that should be one-offs
- stretched `endDate` / bad recurrence artifacts
- venue-specific duplicate remnants where a clean rerun is the best test
- image/menu case studies where we want to compare snapshot output vs live write result
