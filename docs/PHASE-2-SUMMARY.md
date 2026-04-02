# Phase 2: Venue Data Migration Summary

**Status:** Completed
**Date:** 2026-01-30
**Duration:** ~2 seconds execution time

## Overview

Phase 2 migrated venue data from Google Sheets "Contact Info" sheet to Firestore "venues" collection.

## Migration Statistics

| Metric | Value |
|--------|-------|
| Total rows processed | 267 |
| Successful migrations | 254 |
| Failed | 0 |
| Skipped (empty rows) | 13 |
| Execution time | 2 seconds |
| Average rate | 95.29 venues/second |

## Files Created

| File | Purpose |
|------|---------|
| `migration/migrate-venues.js` | Main migration script with CLI interface |
| `migration/venue-field-mapping.js` | Column-to-field mapping and transformation logic |
| `migration/migration-utils.js` | Checkpoint management, logging, retry utilities |
| `migration/package.json` | Node.js dependencies and npm scripts |
| `migration/.env.example` | Configuration template |
| `migration/.env` | Actual configuration (gitignored) |

## Key Decisions

### 1. Venue ID Generation Strategy

Priority order for generating document IDs:
1. **Facebook ID** (`fb_{facebookId}`) - Most stable, used when numeric Facebook ID available
2. **URL Slug** (`slug_{slug}`) - Extracted from Facebook page URL
3. **Name Hash** (`name_{hash}`) - Deterministic hash of normalized venue name
4. **Timestamp** (`venue_{timestamp}_{random}`) - Last resort fallback

### 2. Field Mapping (52+ columns)

Source sheet columns mapped to Firestore fields:

**Core Identification:**
- `Pagename` → `pagename`
- `Pageurl` → `pageurl`
- `Facebookurl` → `facebookUrl`
- `Facebookid` → `facebookId`
- `Pageid` → `pageId`
- `Title` → `title`

**Location:**
- `Address` → `address` (cleaned of appended URLs)
- `Latitude` → `latitude` (numeric)
- `Longitude` → `longitude` (numeric)

**Contact:**
- `Phone` → `phone`
- `Email` → `email`
- `Website` → `website`
- `Messenger` → `messenger`

**Categories:**
- `Categories 0/1/2` → Combined into `categories` array
- `Page_Categories 0 Text` → `pageCategory`

**Engagement Metrics:**
- `Rating` → `rating` (numeric)
- `Ratingcount` → `ratingCount` (numeric)
- `Followers` → `followers` (numeric)
- `Likes` → `likes` (numeric)
- `Were_Here_Count` → `checkIns` (numeric)

**Hours (7 day columns):**
- `Open_Hour_Details 0-6 Day_In_Week Text` + `Hours_Text Text` → `hoursStructured` map
- `Operating Hours (JSON)` → `operatingHoursJson` + parsed `operatingHoursParsed`

**Social Media:**
- `Instagramurl` → `instagramUrl`
- `InstagramFollowers` → `instagramFollowers` (numeric)
- `Alternativesocialmedia` → `alternativeSocialMedia`

**Google Places:**
- `Place ID` → `placeId`
- `Place Details (JSON)` → `placeDetailsJson` + parsed `placeDetailsParsed`

**Media:**
- `Profile Image` → `profileImage`

**Business Info:**
- `About_Me Text` → `about`
- `Services` → `services` (parsed to array)

### 3. Derived Fields for Name Matching

Generated automatically for each venue:
- `pagenameNormalized` - Lowercase, no diacritics, no punctuation
- `pagenameSearchTokens` - Array of word tokens for fuzzy matching
- `pagenameSlug` - URL-friendly slug from Facebook URL or name

### 4. Metadata Fields

Added to every document:
- `createdAt` - Server timestamp
- `updatedAt` - Server timestamp
- `importedAt` - Server timestamp
- `sourceSheet` - "Contact Info"

## Configuration Required

### Prerequisites
1. **Enable Google Sheets API** in Google Cloud Console for the service account project
2. **Share spreadsheet** with service account email (`firebase-adminsdk-fbsvc@gathr-migrated.iam.gserviceaccount.com`)

### Environment Variables
```bash
SPREADSHEET_ID=1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ
SHEET_NAME=Contact Info
SERVICE_ACCOUNT_PATH=../firebase/service-account.json
FIRESTORE_COLLECTION=venues
BATCH_SIZE=500
```

## How to Re-run Migration

```bash
cd migration
npm install

# Validate without writing
npm run migrate:dry-run

# Run full migration
npm run migrate

# Resume if interrupted
npm run migrate:resume
```

## How to Validate

### Firebase Console
Visit: https://console.firebase.google.com/project/gathr-migrated/firestore/data/~2Fvenues

### Firestore Query (Node.js)
```javascript
const admin = require('firebase-admin');
const snapshot = await admin.firestore().collection('venues').count().get();
console.log(`Venue count: ${snapshot.data().count}`); // Expected: 254
```

### Check Specific Venue
```javascript
const venues = await admin.firestore()
  .collection('venues')
  .where('pagename', '==', 'Some Venue Name')
  .get();
```

## Technical Implementation

### Batch Processing
- Maximum 500 documents per Firestore batch write
- 100ms delay between batches for rate limiting
- Checkpoint saved every 50 rows

### Error Handling
- Retry with exponential backoff (3 attempts, 1s/2s/4s delays)
- Failed rows logged to `migration-failed-rows.json`
- Checkpoint preserved on failure for resume capability

### Validation Performed
- Required field: venue name (Pagename or Title)
- Coordinate validation: latitude (-90 to 90), longitude (-180 to 180)
- Duplicate detection: skips venues with already-processed IDs
- Empty row detection: skips rows with no data

## Deviations from Original Plan

1. **Column names differed** - Original plan assumed different column headers. Updated mapping after dry-run revealed actual headers (e.g., `Were_Here_Count` instead of `Check-ins`).

2. **JSON fields added** - Sheet contained JSON columns (`Place Details (JSON)`, `Operating Hours (JSON)`) that were parsed into nested objects.

3. **Instagram fields added** - Sheet included Instagram data not in original schema, now captured.

## Known Limitations

1. **One-time migration** - Script designed for initial migration. For ongoing sync, would need delta detection.

2. **No image download** - Profile images stored as URLs, not downloaded to Firebase Storage.

3. **Hours parsing** - Structured hours depend on consistent day names in source data.

4. **No geocoding validation** - Coordinates accepted as-is from source sheet.

## Future Considerations

- Consider adding incremental sync capability for ongoing updates
- May want to add Firebase Storage upload for profile images
- Could add geocoding validation/enrichment via Google Maps API
