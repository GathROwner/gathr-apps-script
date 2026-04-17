# Image Mismatch Review Tool

This tool is a fast heuristic review for events whose live canonical image may be wrong.

It does not try to prove image correctness. It looks for strong signals that a live event doc may be carrying a stale or unrelated image:

1. the same canonical image is reused across multiple unrelated event families at the same venue
2. the live canonical image is not present in the latest matching `parse_snapshots` media set for that event
3. the latest matching snapshot OCR text does not meaningfully overlap the event title

The current version is especially useful for venues like Harbourfront Theatre, where a few theatre poster images have historically bled across multiple unrelated event docs.

## What it uses

- live Firestore event docs under `venues/<venueId>/events`
- recent `parse_snapshots` for the same venue
- the snapshot `rowMeta.mediaUrls` list that the parser actually saw
- snapshot OCR text embedded in `inputText` after `OCR TEXT:`

It does **not** currently OCR the live image directly. Instead it uses the latest matching snapshot OCR/media as a practical proxy. That keeps it fast and cheap for review work.

## Basic usage

Review a single venue:

```powershell
node tools/image-mismatch-review/run-image-mismatch-review.mjs `
  --venue "Harbourfront Theatre"
```

Use an explicit venue id:

```powershell
node tools/image-mismatch-review/run-image-mismatch-review.mjs `
  --venue-id slug_harbourfronttheatre
```

Add a stable label to the output:

```powershell
node tools/image-mismatch-review/run-image-mismatch-review.mjs `
  --venue "Harbourfront Theatre" `
  --report-label harbourfront
```

Increase the recent snapshot search window:

```powershell
node tools/image-mismatch-review/run-image-mismatch-review.mjs `
  --venue "Harbourfront Theatre" `
  --snapshot-limit 1200
```

## Output

Each run writes one JSON report under [results](C:/Users/craig/Dev/gathr-apps-script/tools/image-mismatch-review/results/).

The report includes:

- venue summary
- flagged docs
- the best matching snapshot per flagged doc
- reason codes for each flag

Current reason codes:

- `shared_canonical_image`
  The same canonical image is used by multiple unrelated event families at the venue.
- `canonical_missing_from_latest_snapshot_media`
  The live canonical image is not in the latest matching snapshot media set.
- `title_vs_snapshot_ocr_mismatch`
  Snapshot OCR text does not contain meaningful title tokens for the live event name.

## Recommended workflow

1. run this tool for the venue
2. inspect the flagged docs
3. use [Venue Review](C:/Users/craig/Dev/gathr-apps-script/tools/venue-review/README.md) on the suspicious events
4. if a newer rerun row exists, rerun it and see whether canonical image promotion fixes the issue
5. if the same mismatch pattern repeats, add it to the parser/media hardening notes

## Limitations

- heuristic, not definitive
- best on venues with preserved `parse_snapshots`
- can miss older manual-migration docs with no modern source row
- does not yet prune stale extra `mediaUrls`
