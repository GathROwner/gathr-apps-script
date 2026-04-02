# GathR Firestore Schema Documentation

This document describes the Firestore database schema for the GathR application, migrated from Google Sheets.

## Overview

The database uses a nested collection structure:
- **venues** - Top-level collection for all venues
  - **events** - Subcollection under each venue for events
- **processed_datasets** - Tracks processed Apify export files
- **unrecognized_venues** - Queue of venues needing manual review
- **processing_state** - State for resumable batch operations

## Security Model

| Collection | Guest (Unauthenticated) | Authenticated User | Admin |
|------------|-------------------------|-------------------|-------|
| venues | Read | Read | Read/Write |
| events | Read | Read | Read/Write |
| processed_datasets | - | - | Read/Write |
| unrecognized_venues | - | - | Read/Write |
| processing_state | - | - | Read/Write |

**Notes:**
- Guest access enables map clusters and basic browsing without registration
- Premium features are gated in the frontend, not at database level
- Admin status is determined by `admin: true` custom claim on Firebase Auth token

---

## Collections

### venues

Top-level collection containing all venue information. Source: "Contact Info" sheet.

**Document ID:** Auto-generated or derived from `facebookId`

#### Core Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `pagename` | string | Pagename | Display name of the venue |
| `pageurl` | string | Pageurl | Facebook page URL |
| `facebookUrl` | string | Facebookurl | Canonical Facebook URL |
| `facebookId` | string | Facebookid | Facebook page ID |
| `address` | string | Address | Full street address |
| `latitude` | number | Latitude | Geographic latitude (column 19) |
| `longitude` | number | Longitude | Geographic longitude (column 21) |
| `phone` | string | Phone | Contact phone number |
| `email` | string | Email | Contact email address |
| `website` | string | Website | Official website URL |

#### Derived Fields (for name matching)

| Field | Type | Description |
|-------|------|-------------|
| `pagenameNormalized` | string | Lowercase, no punctuation, trimmed version of pagename |
| `pagenameSearchTokens` | array\<string\> | Array of normalized word tokens for fuzzy matching |
| `pagenameSlug` | string | URL-friendly slug derived from Facebook URL |

**Example derived field generation:**
```javascript
// Input: "O'Malley's Irish Pub & Grill"
pagenameNormalized: "omalleys irish pub grill"
pagenameSearchTokens: ["omalleys", "irish", "pub", "grill"]
pagenameSlug: "omalleys-irish-pub-grill"
```

#### Category Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `categories` | array\<string\> | Categories 0-2 | Array of category strings |

**Legacy support:** Individual fields `category0`, `category1`, `category2` may exist for backward compatibility.

#### Engagement Metrics

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `rating` | number | Rating | Average rating (1-5) |
| `ratingCount` | number | Ratingcount | Number of ratings |
| `priceRange` | string | Pricerange | Price indicator (e.g., "$$") |
| `followers` | number | Followers | Facebook follower count |
| `likes` | number | Likes | Facebook page likes |

#### Media Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `profileImage` | string | Profile Image | URL to profile image |
| `coverPhoto` | string | Cover Photo | URL to cover photo |

#### Business Information

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `hoursText` | string | Hours | Human-readable hours string |
| `hoursStructured` | map | (derived) | Parsed hours by day |
| `features` | array\<string\> | Features | Venue features/amenities |
| `about` | string | About | About/description text |
| `mission` | string | Mission | Mission statement |
| `companyOverview` | string | Company Overview | Company description |
| `foundedDate` | string | Founded | When established |

#### Additional Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `checkIns` | number | Check-ins | Facebook check-in count |
| `verifiedStatus` | boolean | Verified | Is verified page |
| `pageType` | string | Page Type | Type of Facebook page |
| `placeId` | string | Place ID | Google Places ID (if available) |
| `neighborhood` | string | Neighborhood | Local area name |
| `city` | string | City | City name |
| `state` | string | State | State/province |
| `zip` | string | Zip | Postal code |
| `country` | string | Country | Country name |

#### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | timestamp | Document creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |
| `sourceSheet` | string | Original sheet name for reference |
| `importedAt` | timestamp | When imported from sheets |

---

### venues/{venueId}/events

Subcollection containing events for each venue. Source: "Sheet1" (events sheet).

**Document ID:** Use `eventId` from source data, or auto-generate

#### Event Type Flags

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `isEvent` | boolean | Is Event | True if this is an event (vs. special) |
| `isFoodSpecial` | boolean | Is Food Special | True if this is a food special |
| `isRecurring` | boolean | Is Recurring | True if event repeats |
| `recurringPattern` | string | Recurring Pattern | e.g., "Every Tuesday", "First Friday" |

#### Core Event Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `name` | string | Event Name | Event title/name |
| `description` | string | Description | Full event description |
| `category` | string | Category | Event category |
| `establishment` | string | Hosting Establishment | Venue name (for lookup matching) |

#### Location Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `address` | string | Address | Event address (may differ from venue) |
| `latitude` | number | Latitude | Event location latitude |
| `longitude` | number | Longitude | Event location longitude |

#### Date/Time Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `startDate` | timestamp | Start Date | Event start date/time |
| `endDate` | timestamp | End Date | Event end date/time |
| `startTime` | string | Start Time | Display start time (e.g., "7:00 PM") |
| `endTime` | string | End Time | Display end time |

**Note:** `startDate` and `endDate` are stored as Firestore Timestamps for proper querying. The original string times are preserved in `startTime`/`endTime` for display.

#### Pricing

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `ticketPrice` | string | Ticket Price | Price info (e.g., "Free", "$10", "$15-25") |
| `ticketPriceMin` | number | (derived) | Minimum price in cents for filtering |
| `ticketPriceMax` | number | (derived) | Maximum price in cents for filtering |

#### Media Fields

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `icon` | string | Icon | Event type icon identifier |
| `image` | string | Image | Event image URL |
| `facebookUrl` | string | Facebook URL | Event's Facebook URL |

#### Engagement Metrics

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `likes` | number | Likes | Event likes count |
| `shares` | number | Shares | Event shares count |
| `comments` | number | Comments | Event comments count |
| `interested` | number | Interested | Facebook "Interested" count |
| `going` | number | Going | Facebook "Going" count |

#### Source Tracking

| Field | Type | Source Column | Description |
|-------|------|---------------|-------------|
| `eventId` | string | Event ID | Original event ID from source |
| `sourceUrl` | string | Source URL | Original scrape URL |
| `scrapedAt` | timestamp | Scraped At | When data was scraped |

#### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | timestamp | Document creation timestamp |
| `updatedAt` | timestamp | Last update timestamp |
| `venueId` | string | Parent venue document ID (denormalized) |
| `venueName` | string | Parent venue name (denormalized for display) |

---

### processed_datasets

Tracks which Apify export files have been processed to prevent duplicate imports.

**Document ID:** Hash of filename or auto-generated

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | Original filename (e.g., "Apify Dataset (1).xlsx") |
| `fileHash` | string | SHA-256 hash of file contents |
| `status` | string | "pending", "processing", "completed", "failed" |
| `processedAt` | timestamp | When processing completed |
| `startedAt` | timestamp | When processing started |
| `rowCount` | number | Total rows in file |
| `eventsCreated` | number | New events added |
| `eventsUpdated` | number | Existing events updated |
| `eventsSkipped` | number | Rows skipped (duplicates, errors) |
| `venuesCreated` | number | New venues created |
| `unrecognizedCount` | number | Venues that couldn't be matched |
| `errors` | array\<map\> | List of processing errors |
| `processedBy` | string | Admin user ID who processed |

---

### unrecognized_venues

Queue of venue names from events that couldn't be matched to existing venues.

**Document ID:** Hash of normalized establishment name or auto-generated

| Field | Type | Description |
|-------|------|-------------|
| `establishment` | string | Original establishment name from event |
| `establishmentNormalized` | string | Normalized for matching |
| `status` | string | "pending", "matched", "created", "ignored" |
| `createdAt` | timestamp | When first encountered |
| `updatedAt` | timestamp | Last update |
| `occurrences` | number | How many events reference this |
| `sampleEvents` | array\<map\> | Sample event data for context |
| `suggestedMatches` | array\<map\> | Possible venue matches with scores |
| `resolvedVenueId` | string | Venue ID if matched/created |
| `resolvedBy` | string | Admin user ID who resolved |
| `resolvedAt` | timestamp | When resolved |
| `notes` | string | Admin notes |

---

### processing_state

Stores state for resumable batch processing operations.

**Document ID:** Processing job ID (e.g., "import-2024-01-15-abc123")

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | "sheet_import", "venue_sync", "event_cleanup" |
| `status` | string | "running", "paused", "completed", "failed" |
| `startedAt` | timestamp | When processing started |
| `pausedAt` | timestamp | When last paused |
| `completedAt` | timestamp | When finished |
| `totalItems` | number | Total items to process |
| `processedItems` | number | Items completed |
| `lastProcessedId` | string | Last document ID processed (for resume) |
| `lastProcessedRow` | number | Last row number processed |
| `checkpoint` | map | Arbitrary checkpoint data |
| `errors` | array\<map\> | Errors encountered |
| `startedBy` | string | Admin user ID |

---

## Indexes

### Venue Indexes

| Fields | Query Scope | Purpose |
|--------|-------------|---------|
| `pageurl` | COLLECTION | Facebook URL exact lookup |
| `pagename` | COLLECTION | Exact name matching |
| `pagenameNormalized` | COLLECTION | Canonicalized name matching |
| `pagenameSearchTokens` | COLLECTION (array-contains) | Fuzzy/partial name matching |
| `pagenameSlug` | COLLECTION | URL slug lookup |
| `latitude`, `longitude` | COLLECTION | Geographic queries |

### Event Indexes (Collection Group)

| Fields | Query Scope | Purpose |
|--------|-------------|---------|
| `startDate` | COLLECTION_GROUP | Date range queries across all venues |
| `isEvent` + `startDate` | COLLECTION_GROUP | Filter events vs specials by date |
| `category` + `startDate` | COLLECTION_GROUP | Category filter with date |
| `establishment` + `startDate` | COLLECTION_GROUP | Duplicate detection |
| `isRecurring` + `startDate` | COLLECTION_GROUP | Recurring event queries |
| `isFoodSpecial` + `startDate` | COLLECTION_GROUP | Food specials by date |

### Admin Indexes

| Fields | Query Scope | Purpose |
|--------|-------------|---------|
| `status` + `processedAt` | processed_datasets | Admin dataset queue |
| `status` + `createdAt` | unrecognized_venues | Admin review queue |
| `type` + `status` | processing_state | Find active jobs |

---

## Query Examples

### Get all events on a specific date (across all venues)

```javascript
const eventsRef = collectionGroup(db, 'events');
const q = query(
  eventsRef,
  where('startDate', '>=', startOfDay),
  where('startDate', '<', endOfDay),
  orderBy('startDate')
);
```

### Find venue by normalized name

```javascript
const venuesRef = collection(db, 'venues');
const normalized = normalizeVenueName(searchTerm);
const q = query(venuesRef, where('pagenameNormalized', '==', normalized));
```

### Fuzzy venue search using tokens

```javascript
const venuesRef = collection(db, 'venues');
const tokens = searchTerm.toLowerCase().split(/\s+/);
// Query for venues containing the first token
const q = query(venuesRef, where('pagenameSearchTokens', 'array-contains', tokens[0]));
// Filter results client-side for additional tokens
```

### Get unresolved venue queue for admin

```javascript
const unresolvedRef = collection(db, 'unrecognized_venues');
const q = query(
  unresolvedRef,
  where('status', '==', 'pending'),
  orderBy('createdAt'),
  limit(50)
);
```

### Get events for a specific venue

```javascript
const eventsRef = collection(db, `venues/${venueId}/events`);
const q = query(
  eventsRef,
  where('startDate', '>=', now),
  orderBy('startDate'),
  limit(20)
);
```

---

## Data Migration Notes

### Venue Name Normalization Function

```javascript
function normalizeVenueName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '')          // Remove punctuation
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .trim();
}

function generateSearchTokens(name) {
  const normalized = normalizeVenueName(name);
  return normalized.split(' ').filter(token => token.length > 0);
}

function generateSlug(facebookUrl) {
  // Extract page name from URL: https://facebook.com/omalleys-irish-pub
  const match = facebookUrl.match(/facebook\.com\/([^\/\?]+)/);
  return match ? match[1] : normalizeVenueName(name).replace(/\s+/g, '-');
}
```

### Field Type Conversions

| Source Type | Firestore Type | Notes |
|-------------|----------------|-------|
| Date strings | Timestamp | Parse and convert to Firestore Timestamp |
| Numbers as strings | number | Parse with validation |
| Empty strings | null or omit | Don't store empty strings |
| "TRUE"/"FALSE" | boolean | Convert to actual booleans |
| Comma-separated lists | array | Split and trim |

---

## Maintenance Operations

### Cleanup Orphaned Events

Events should always have a parent venue. Orphaned events can be found via:

```javascript
// This requires iterating all venues - expensive but occasionally necessary
const snapshot = await collectionGroup(db, 'events').get();
for (const doc of snapshot.docs) {
  const venueRef = doc.ref.parent.parent;
  const venueDoc = await venueRef.get();
  if (!venueDoc.exists) {
    console.log('Orphaned event:', doc.id);
  }
}
```

### Rebuild Search Tokens

If the normalization algorithm changes:

```javascript
const venues = await collection(db, 'venues').get();
const batch = writeBatch(db);
venues.forEach(doc => {
  const data = doc.data();
  batch.update(doc.ref, {
    pagenameNormalized: normalizeVenueName(data.pagename),
    pagenameSearchTokens: generateSearchTokens(data.pagename),
    updatedAt: serverTimestamp()
  });
});
await batch.commit();
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-XX-XX | Initial schema from Google Sheets migration |
