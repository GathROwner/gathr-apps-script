# Phase 3: Event Migration (DATA-MIGRATION-EVENTS)

## Overview

Phase 3 migrated event data from Google Sheets "GPT Processed" spreadsheet (Sheet1) to Firestore as subcollections under their matching venues. Events are stored at `venues/{venueId}/events/{eventId}`.

## Migration Statistics

| Metric | Count |
|--------|-------|
| **Total rows processed** | 342 |
| **Events successfully migrated** | 336 |
| **Skipped (true duplicates)** | 4 |
| **Failed** | 0 |
| **Unmatched (no venue found)** | 2 |

### Venue Matching Breakdown

| Match Type | Count | Description |
|------------|-------|-------------|
| Name exact | 293 | Normalized establishment name matched exactly |
| Name fuzzy | 47 | Levenshtein similarity > 0.6 |
| Facebook URL exact | 0 | Facebook URL matched venue's pageurl |
| Facebook slug exact | 0 | URL slug matched |
| Unmatched | 2 | No venue found for establishment |

### Unmatched Events

These events could not be matched to any venue in the Contact Info sheet:

1. **Murphy Hospitality Group** - "Swift Kick: a Taylor Swift tribute band" (2026-02-13)
2. **Alongside Hope** - "Support the World of Gifts" (2026-12-25)

## Files Created

| File | Purpose |
|------|---------|
| `migration/migrate-events.js` | Main migration script |
| `migration/event-field-mapping.js` | Sheet1 column → Firestore field mapping |
| `migration/venue-matcher.js` | Venue matching algorithm with fuzzy search |
| `migration/cleanup-events.js` | Utility to delete all events (for re-migration) |

## Field Mapping

### Sheet1 Columns → Firestore Fields

```javascript
const COLUMN_TO_FIELD_MAP = {
  // Event type flags
  'Event?': 'isEvent',
  'Food Special?': 'isFoodSpecial',
  'Recurring?': 'isRecurring',
  'Recurrence Pattern': 'recurringPattern',

  // Core event fields
  'Category': 'category',
  'Event Name': 'name',
  'Description': 'description',
  'Hosting Establishment': 'establishment',

  // Location fields
  'Address': 'address',
  'Latitude': 'latitude',
  'Longitude': 'longitude',
  'City': 'city',
  'Street Address': 'streetAddress',

  // Date/time fields
  'Start Date': 'startDate',
  'End Date': 'endDate',
  'Start Time': 'startTime',
  'End Time': 'endTime',
  'UTC Start Date': 'utcStartDate',

  // Pricing fields
  'Ticket Price': 'ticketPrice',
  'Ticket Link': 'ticketLink',
  'Tickets Buy URL': 'ticketsBuyUrl',
  'Ticket Provider': 'ticketProvider',

  // Media fields
  'Icon': 'icon',
  'Image': 'image',
  'Relevant Image URL': 'relevantImageUrl',
  'Cached Image URL': 'cachedImageUrl',
  'Shared Post Thumbnail': 'sharedPostThumbnail',

  // Facebook/source fields
  'Facebook URL': 'facebookUrl',
  'Event ID': 'eventId',

  // Engagement metrics
  'Likes': 'likes',
  'Shares': 'shares',
  'Comments': 'comments',
  'Top Reactions Count': 'topReactionsCount',
  'Users Responded': 'usersResponded',

  // Additional metadata
  'Organized By': 'organizedBy',
  'Operating Hours': 'operatingHours',
  'Operating Hours Source': 'operatingHoursSource',
  'TripAdvisor Rating': 'tripAdvisorRating',
  'TripAdvisor Reviews': 'tripAdvisorReviews',
};
```

### Type Conversions

| Field Type | Fields | Conversion |
|------------|--------|------------|
| Boolean | `isEvent`, `isFoodSpecial`, `isRecurring` | "Yes"/"No" → true/false |
| Numeric | `latitude`, `longitude`, `likes`, `shares`, `comments`, etc. | String → Number |
| Date | `startDate`, `endDate` | Normalized to YYYY-MM-DD |
| Time | `startTime`, `endTime` | Normalized to HH:MM (24-hour) |

## Key Decisions

### 1. Venue Matching Algorithm

Events are matched to venues using a 4-tier priority system:

1. **Facebook URL Exact Match** - Normalized URL comparison
2. **Facebook Slug Match** - Extract and compare URL slugs
3. **Name Exact Match** - Normalized establishment name lookup
4. **Fuzzy Name Match** - Enhanced Levenshtein similarity (threshold: 0.6)

The fuzzy matching algorithm (from `additionalVenue.js`) includes:
- Base Levenshtein similarity
- Exact full match bonus (+0.50)
- Primary word match bonus (+0.30 or +0.15 for common words)
- Secondary word match bonus (+0.25)
- Substring bonus (+0.15)
- Primary word mismatch penalty (-0.20)
- Secondary word mismatch penalty (-0.75)

### 2. Event ID Generation

Event IDs are generated deterministically to enable idempotent re-runs:

```javascript
// Priority 1: Hash of eventId + establishment + name + date + time
// This handles multiple events from the same Facebook post
const parts = [
  eventData.eventId,           // Facebook post ID (if exists)
  normalizedEstablishment,     // e.g., "the local pub"
  normalizedName,              // e.g., "trivia night"
  startDate,                   // e.g., "2026-02-14"
  startTime,                   // e.g., "19:00"
];
// Returns: fb_xxxxx or evt_xxxxx

// Priority 2: Fallback to row index
// Returns: evt_row_123
```

### 3. Denormalized Venue Info

Each event document includes denormalized venue information for easier querying:

```javascript
{
  venueId: "fb_123456789",      // Parent venue document ID
  venueName: "The Local Pub",   // Venue display name
  matchType: "name_exact",      // How venue was matched
  matchScore: 1.0,              // Match confidence (0-1)
  // ... event fields
}
```

### 4. Merge Strategy

Events are written with `{ merge: true }`, meaning:
- **Existing events**: Fields are updated/merged
- **New events**: Created normally
- **Re-running migration**: Safe - updates existing, adds new

## Deviations from Plan

### Column Name Mismatch

The original field mapping assumed column headers like `Is Event`, but the actual sheet uses `Event?`. This was discovered during dry-run testing and corrected.

### Duplicate Event ID Collision

Initially, events from the same Facebook post (sharing the same `Event ID`) collided. The ID generation was updated to include `establishment + name + date + time` to ensure uniqueness.

## Configuration

### Environment Variables

```bash
# .env file
EVENTS_SPREADSHEET_ID=1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ
EVENTS_SHEET_NAME=Sheet1
SERVICE_ACCOUNT_PATH=./firebase/service-account.json
FIRESTORE_COLLECTION=venues
BATCH_SIZE=500
RATE_LIMIT_DELAY_MS=100
CHECKPOINT_INTERVAL=50
```

### Prerequisites

1. Venues must already be migrated (Phase 2)
2. Service account must have Firestore read/write access
3. Service account must have Google Sheets read access

## How to Run

### Dry Run (Validation Only)

```bash
cd migration
node migrate-events.js --dry-run
```

### Full Migration

```bash
node migrate-events.js
```

### Resume Interrupted Migration

```bash
node migrate-events.js --resume
```

### Cleanup (Delete All Events)

```bash
# Preview what will be deleted
node cleanup-events.js --dry-run

# Actually delete
node cleanup-events.js
```

## How to Validate

### Count Events via Collection Group Query

```javascript
// Firebase Console or Admin SDK
const eventsRef = collectionGroup(db, 'events');
const snapshot = await eventsRef.get();
console.log(`Total events: ${snapshot.size}`);
// Expected: 336
```

### Verify Specific Venue Events

```javascript
const venueRef = doc(db, 'venues', 'fb_123456789');
const eventsSnap = await collection(venueRef, 'events').get();
console.log(`Events for venue: ${eventsSnap.size}`);
```

### Query Events by Date

```javascript
const eventsRef = collectionGroup(db, 'events');
const q = query(
  eventsRef,
  where('startDate', '>=', '2026-02-01'),
  where('startDate', '<', '2026-03-01'),
  orderBy('startDate')
);
const snapshot = await q.get();
```

## Firestore Structure

```
venues/
  ├── fb_123456789/
  │   ├── pagename: "The Local Pub"
  │   ├── address: "123 Main St..."
  │   └── events/                    ← Subcollection
  │       ├── fb_abc123/
  │       │   ├── name: "Trivia Night"
  │       │   ├── startDate: "2026-02-14"
  │       │   ├── venueId: "fb_123456789"
  │       │   └── ...
  │       └── evt_xyz789/
  │           ├── name: "Live Music"
  │           └── ...
  └── fb_987654321/
      └── events/
          └── ...
```

## Known Limitations

1. **Unmatched Events**: Events for establishments not in Contact Info are logged but not migrated
2. **No Venue Creation**: Migration does not create new venues for unmatched events
3. **Single Venue Match**: When multiple venues have similar names, the first match is used
4. **No Event Deletion**: Events removed from the sheet are not deleted from Firestore

## Future Improvements

1. **Unrecognized Venues Queue**: Add unmatched events to `unrecognized_venues` collection for admin review
2. **Duplicate Detection**: Compare existing Firestore events before writing to avoid true duplicates
3. **Event Expiration**: Automatically delete events with past `endDate`
4. **Incremental Sync**: Only process rows modified since last migration

## Output Files

| File | Purpose | Cleanup |
|------|---------|---------|
| `events-migration-checkpoint.json` | Resume state | Delete after successful migration |
| `events-migration-failed-rows.json` | Failed row details | Review for errors |
| `events-migration-unmatched.json` | Unmatched events | Review for missing venues |

## Related Documentation

- [Firebase Schema](../firebase/README-SCHEMA.md) - Firestore structure definition
- [Phase 2 Summary](./PHASE-2-SUMMARY.md) - Venue migration (prerequisite)
- [Phase 5 Summary](./PHASE-5-SUMMARY.md) - Parsing pipeline port
