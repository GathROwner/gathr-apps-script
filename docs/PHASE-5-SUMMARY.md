# Phase 5: Parsing Pipeline Port to Cloud Functions

## Overview

This phase ported the complete 5-stage parsing pipeline from Google Apps Script (`postParser.js`) to TypeScript Cloud Functions. The parsing system extracts events and food/drink specials from social media posts using GPT with function calling.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `functions/src/parsing/types.ts` | ~280 | All parsing-specific type definitions |
| `functions/src/parsing/contentValidator.ts` | ~220 | Stage 1: Content validation |
| `functions/src/parsing/contentClassifier.ts` | ~200 | Stage 2: Content classification |
| `functions/src/parsing/eventExtractor.ts` | ~650 | Stage 3: Content extraction |
| `functions/src/parsing/secondaryValidator.ts` | ~380 | Stage 4: Secondary validation |
| `functions/src/parsing/finalFormatter.ts` | ~520 | Stage 5: Final formatting |
| `functions/src/parsing/venueResolver.ts` | ~330 | Stage 5.5: Hours-based time resolution |
| `functions/src/parsing/postParser.ts` | ~380 | Main orchestrator |
| `functions/src/parsing/index.ts` | ~85 | Module exports |

**Total: ~3,045 lines of TypeScript**

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        parsePostData()                               │
│                     (postParser.ts - Orchestrator)                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Content Validation (contentValidator.ts)                  │
│  - Check if post contains valid event/special content               │
│  - OCR preprocessing guidance for images                            │
│  - Calendar/roundup detection heuristics                            │
│  - Output: { hasValidContent, confidence, validationDecision }      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Content Classification (contentClassifier.ts)             │
│  - Classify as EVENT, FOOD_SPECIAL, MIXED, CALENDAR, or SCHEDULE    │
│  - Handle Facebook Events with utcStartDate                         │
│  - Output: { contentType, estimatedItemCount, confidence }          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 3: Content Extraction (eventExtractor.ts)                    │
│  - Extract events and food specials based on content type           │
│  - Weekday → date calculation with timezone handling                │
│  - Time association rules (per-day region)                          │
│  - Recurring pattern detection (daily, weekly_*)                    │
│  - Output: Array of ExtractedItem[]                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 3.5: Facebook Events Time Resolution (postParser.ts)         │
│  - Use utcStartDate as authoritative source                         │
│  - Timezone conversion (America/Halifax)                            │
│  - Output: Items with corrected dates/times                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Secondary Validation (secondaryValidator.ts)              │
│  - Filter by confidence threshold (0.6)                             │
│  - Contradiction detection (REJECTED but reasoning says KEPT)       │
│  - Holiday-specific recurring pattern correction                    │
│  - Preserve timeFlags metadata                                      │
│  - Output: Filtered ExtractedItem[]                                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 5: Final Formatting (finalFormatter.ts)                      │
│  - Standardize field formats                                        │
│  - Category mapping (Live Music, Trivia Night, Food Special, etc.)  │
│  - Category corrections (art party, comedy vs live music)           │
│  - Venue/establishment assignment                                   │
│  - Output: FormattedEvent[]                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 5.5: Hours-Based Time Resolution (venueResolver.ts)          │
│  - Venue lookup in Firestore                                        │
│  - Google Places fallback for operating hours                       │
│  - Category defaults for missing times                              │
│  - Overnight handling (end time < start time)                       │
│  - Output: TimeResolvedEvent[] ready for Firestore                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features Ported

### GPT Integration
- **Function Calling**: All stages use GPT function calling with strict JSON schemas
- **Exact Prompts**: GPT prompts preserved verbatim from `postParser.js`
- **Model Configuration**: Configurable fast model (gpt-4o-mini) and reasoning model (gpt-4o)

### Content Detection
- **Calendar/Roundup Heuristics**: Detects multi-event posts via time patterns and venue mentions
- **Image Analysis**: OCR preprocessing guidance for calendar grids and event posters
- **Facebook Events**: Special handling for structured Facebook Event data with `utcStartDate`

### Date/Time Handling
- **Weekday → Date Calculation**: "Thursday" becomes the next Thursday from post date
- **Timezone Support**: All conversions use America/Halifax timezone
- **Time Association Rules**: Times read from same tile/region as the act for that day
- **Overnight Events**: Automatically bumps end date when end time < start time

### Recurring Patterns
- **Pattern Detection**: Recognizes "Every Monday", "Daily", etc.
- **Holiday Correction**: Converts recurring to one-time for holiday-specific specials
- **Valid Patterns**: `none`, `daily`, `weekly_monday` through `weekly_sunday`

### Validation & Error Handling
- **Contradiction Detection**: Overrides GPT when decision says REJECTED but reasoning says KEPT
- **JSON Repair**: Fixes common malformed JSON from GPT (extra braces, trailing commas)
- **Confidence Threshold**: Configurable threshold (default 0.6) for filtering low-confidence items

### Category System

**Event Categories:**
- Live Music, Trivia Night, Comedy, Cinema
- Workshops & Classes, Religious, Sports
- Family Friendly, Gatherings & Parties
- DJ/Nightlife, Karaoke, Open Mic

**Special Categories:**
- Happy Hour, Wing Night, Food Special, Drink Special

**Post-Processing Corrections:**
- Art party/paint night → Gatherings & Parties
- Comedy indicators in "Live Music" → Comedy
- Book clubs in "Family Friendly" → Gatherings & Parties

## Type Definitions

### Input Types
```typescript
interface ParsePostInput {
  combinedText: string;
  mediaUrls: string[];
  sharedPostThumbnails: string[];
  userName: string;
  pageName: string;
  timestamp: string;
  facebookUrl: string;
  profilePicUrl?: string;
  extractedData?: ExtractedDataInput;
}
```

### Output Types
```typescript
interface ProcessedEvent {
  // Event details
  name: string;
  description: string;
  category: Category;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;

  // Classification
  isEvent: 'Yes' | 'No';
  isFoodSpecial: 'Yes' | 'No';
  isRecurring: 'Yes' | 'No';
  recurringPattern: RecurringPattern;

  // Venue
  establishment: string;
  venue: string;
  additionalLocation: string;
  address: string;

  // Time resolution metadata
  timeFlags?: TimeFlags;
  timeResolution?: TimeResolution;

  // Media & metadata
  relevantImageIndex: number;
  relevantImageUrl?: string;
  ticketPrice: string;
  ticketLink: string;
  // ... additional Firestore fields
}
```

## Configuration

```typescript
const DEFAULT_PARSING_CONFIG: ParsingConfig = {
  batchSize: 50,
  maxRetries: 3,
  confidenceThreshold: 0.6,
  timezone: 'America/Halifax',
  gptModelFast: 'gpt-4o-mini',
  gptModelReasoning: 'gpt-4o',
};
```

## Usage

```typescript
import { parsePostData, ParsePostInput } from './parsing/index.js';

const input: ParsePostInput = {
  combinedText: "Live music tonight at 8pm! $10 cover.",
  mediaUrls: ["https://example.com/poster.jpg"],
  sharedPostThumbnails: [],
  userName: "The Local Pub",
  pageName: "The Local Pub",
  timestamp: "2024-01-15T14:30:00Z",
  facebookUrl: "https://facebook.com/thelocalpub",
};

const events = await parsePostData(input);
// Returns: ProcessedEvent[]
```

## Dependencies

- **OpenAI SDK**: For GPT function calling
- **Luxon**: For timezone-aware date/time handling
- **Firebase Admin**: For Firestore venue lookups
- **Google APIs**: For Google Places operating hours fallback

## Migration Notes

### From Apps Script
The Apps Script version used:
- `UrlFetchApp.fetch()` → Now uses `openai` npm package
- `Utilities.formatDate()` → Now uses Luxon `DateTime`
- `Session.getScriptTimeZone()` → Now configurable via `ParsingConfig.timezone`
- `PropertiesService` → Now uses environment variables

### Breaking Changes
- All functions are now async/await instead of synchronous
- Types are strictly enforced (no implicit `any`)
- Logging uses structured `logger` instead of `console.log`

## Testing Recommendations

1. **Unit Tests**: Each stage function can be tested independently
2. **Integration Tests**: Test full pipeline with sample posts
3. **Snapshot Tests**: Compare output with Apps Script results for same inputs
4. **Edge Cases**:
   - Multi-day events
   - Overnight events (end time < start time)
   - Calendar images with OCR
   - Mixed content (events + specials)
   - Facebook Events with utcStartDate
   - Holiday-specific recurring patterns
