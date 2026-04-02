# Phase 7: Validation Scripts Summary

## Overview

Phase 7 implements validation scripts to compare Google Sheets and Firestore data during the parallel operation period of the migration. These scripts ensure data consistency before the final cutover from Google Sheets to Firestore.

## Files Created

| File | Purpose |
|------|---------|
| `validation/package.json` | Dependencies and npm scripts for validation tooling |
| `validation/compare-outputs.js` | Field-by-field comparison between Sheet and Firestore data |
| `validation/daily-consistency-check.js` | Scheduled count verification and sample validation |
| `validation/generate-report.js` | Aggregates metrics and generates comprehensive reports |

## Key Decisions

### 1. Reuse of Field Mappings
The validation scripts import and reuse the field mapping modules from the migration folder (`venue-field-mapping.js` and `event-field-mapping.js`) rather than duplicating mapping logic. This ensures consistency between how data is migrated and how it's validated.

### 2. Dual Output Formats
All scripts generate both JSON (for programmatic use/automation) and human-readable text reports. This supports both CI/CD integration and manual review.

### 3. Health Score System
Implemented a 0-100 health scoring system with letter grades (A-F) to provide a quick assessment of migration data quality. Score deductions are applied for:
- Accuracy rates below 99%
- Count mismatches above 5%
- Critical alerts from daily checks

### 4. State Persistence
The daily consistency check maintains state between runs to track count changes over time and identify trends.

### 5. Critical Threshold
A discrepancy threshold of >1% is flagged as critical, matching the requirement specification. Scripts exit with error code 1 when critical issues are detected for CI/CD integration.

## Deviations from Original Plan

None. All requested functionality was implemented:
- Compare outputs with field-by-field comparison
- Daily consistency checks with counts and sampling
- Metrics tracking with processing time, error rates, and accuracy
- Both JSON and human-readable output formats
- Critical flagging at >1% discrepancy threshold

## Configuration Required

### Environment Variables

Create a `.env` file in the `validation/` directory (or use the existing one in the project root):

```env
# Google Sheets Configuration
SPREADSHEET_ID=1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ
VENUES_SHEET_NAME=Contact Info
EVENTS_SHEET_NAME=Sheet1

# Firebase Configuration
SERVICE_ACCOUNT_PATH=../firebase/service-account.json
VENUES_COLLECTION=venues
```

### Service Account

The scripts require the Firebase service account JSON file at:
`firebase/service-account.json`

This service account needs:
- Google Sheets API read access to the spreadsheet
- Firestore read access to the `gathr-migrated` project

## How to Test/Validate

### 1. Install Dependencies

```bash
cd validation
npm install
```

### 2. Run Individual Scripts

```bash
# Full data comparison
npm run compare
# or: node compare-outputs.js

# Quick count check
node daily-consistency-check.js --quick

# Full daily check with sampling
npm run daily-check
# or: node daily-consistency-check.js

# Generate aggregated report
npm run report
# or: node generate-report.js
```

### 3. Command Line Options

**compare-outputs.js**
```bash
--venues-only     # Compare only venues
--events-only     # Compare only events
--sample N        # Compare N random records instead of all
--output FILE     # Custom output file path
```

**daily-consistency-check.js**
```bash
--quick           # Count-only check (no sample validation)
--sample N        # Custom sample size (default: 100)
```

**generate-report.js**
```bash
--all             # Include all historical data
--days N          # Analyze last N days (default: 30)
--output FILE     # Custom output path
```

### 4. Run Full Validation Pipeline

```bash
npm run full-validation
```

This runs all three scripts in sequence.

### 5. Expected Output

Reports are saved to `validation/reports/`:
- `comparison-{timestamp}.json` - Full comparison data
- `comparison-{timestamp}.txt` - Human-readable summary
- `daily-check-{date}.json` - Daily check results
- `daily-check-state.json` - State for tracking changes
- `metrics-report-{timestamp}.json` - Aggregated metrics
- `metrics-report-{timestamp}.txt` - Human-readable report

## Known Limitations / TODOs

1. **Event Matching**: Events are matched by generated event ID which may not always align between systems if the ID generation logic differs slightly. Consider adding fuzzy matching by name+date+venue.

2. **Performance**: Full comparison loads all data into memory. For very large datasets (>10k records), consider implementing pagination or streaming.

3. **Subcollection Traversal**: Fetching all events requires iterating through all venue documents. For 254 venues with 336 events, this is manageable but could be optimized with collection group queries if the data grows significantly.

4. **Timezone Handling**: Date/time comparisons may have edge cases around timezone differences between Sheet data and Firestore timestamps.

5. **No Automated Scheduling**: Daily checks must be manually scheduled (e.g., via cron, Cloud Scheduler, or GitHub Actions). Consider adding a scheduling mechanism.

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Processing Time | Time to complete comparison/check operations |
| Error Rate | Percentage of records with validation errors |
| Match Rate | Percentage of fields that match between systems |
| Missing Records | Count of Sheet records not found in Firestore |
| Extra Records | Count of Firestore records not in Sheet |
| Count Difference | Absolute and percentage difference in record counts |
| Health Score | 0-100 aggregate score with letter grade |

## Report Output Example

```
╔══════════════════════════════════════════════════════════════╗
║              VALIDATION METRICS REPORT                       ║
╚══════════════════════════════════════════════════════════════╝

  OVERALL HEALTH
═══════════════════════════════════════════════════════════════
  Score: 98/100 (Grade: A)

  LATEST COUNTS:
    Sheet Venues:     254
    Firestore Venues: 254
    Sheet Events:     336
    Firestore Events: 336

  STATUS: HEALTHY - Migration data is consistent
═══════════════════════════════════════════════════════════════
```
