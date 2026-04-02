# Phase 4: Cloud Functions Core Infrastructure

**Status:** Complete
**Deployed:** 7 Cloud Functions to `gathr-migrated` project

## Overview

Phase 4 built the Cloud Functions processing infrastructure for handling Apify data imports. This replaces the Google Apps Script processing with a scalable, resumable batch processing system using Firebase Cloud Functions (2nd Gen).

## Files Created

### Root Configuration
| File | Description |
|------|-------------|
| `functions/package.json` | NPM dependencies and scripts |
| `functions/tsconfig.json` | TypeScript compiler configuration |
| `functions/.env.example` | Environment variable template |
| `functions/.gitignore` | Git ignore patterns for functions |
| `functions/firebase.json` | Firebase deployment configuration |
| `functions/firestore.rules` | Firestore security rules |
| `functions/firestore.indexes.json` | Firestore index definitions |
| `functions/README.md` | Functions documentation |

### Source Files (`functions/src/`)

#### Entry Point
| File | Description |
|------|-------------|
| `index.ts` | Main exports for all 7 Cloud Functions |

#### Triggers (`triggers/`)
| File | Description |
|------|-------------|
| `processDataset.ts` | HTTP trigger to process Apify XLSX files, status endpoint, and task queue resume handler |
| `scheduledCleanup.ts` | Daily scheduled cleanup (3 AM Atlantic) and manual cleanup endpoint |
| `apifyWebhook.ts` | HTTP webhook for Apify completion notifications (stub) and webhook listing endpoint |
| `index.ts` | Trigger exports |

#### Services (`services/`)
| File | Description |
|------|-------------|
| `gptService.ts` | OpenAI API integration with 5-stage parsing pipeline |
| `placesService.ts` | Google Places API for venue lookup and operating hours |
| `driveService.ts` | Google Drive file access and XLSX parsing |
| `firestoreService.ts` | Firestore CRUD for venues, events, batch state, checkpoints |
| `index.ts` | Service exports |

#### Processing (`processing/`)
| File | Description |
|------|-------------|
| `fileProcessor.ts` | Main orchestration for dataset processing |
| `rowProcessor.ts` | Individual row handling and event creation |
| `batchManager.ts` | Batch state persistence and checkpointing for resumability |
| `index.ts` | Processing exports |

#### Utilities (`utils/`)
| File | Description |
|------|-------------|
| `logger.ts` | Structured JSON logging for Cloud Console visibility |
| `similarity.ts` | Levenshtein distance, venue name matching, duplicate detection |
| `dateTime.ts` | Timezone-aware date handling (Luxon), PEI timezone support |
| `index.ts` | Utility exports |

#### Types (`types/`)
| File | Description |
|------|-------------|
| `index.ts` | TypeScript interfaces for all data structures |

## Deployed Functions

| Function | Type | Region | Memory | Timeout | Description |
|----------|------|--------|--------|---------|-------------|
| `processDataset` | HTTP | northeast2 | 1GiB | 540s | Start/resume dataset processing |
| `processDatasetStatus` | HTTP | northeast2 | 256MiB | 30s | Get processing status |
| `processDatasetResume` | Task Queue | northeast1* | 1GiB | 540s | Resume paused processing |
| `scheduledCleanup` | Scheduled | northeast1* | 512MiB | 540s | Daily cleanup at 3 AM |
| `manualCleanup` | HTTP | northeast2 | 512MiB | 540s | On-demand cleanup |
| `apifyWebhook` | HTTP | northeast2 | 256MiB | 60s | Apify webhook receiver |
| `listApifyWebhooks` | HTTP | northeast2 | 256MiB | 30s | View webhook history |

*Cloud Tasks and Cloud Scheduler don't support `northamerica-northeast2`, so these functions use `northamerica-northeast1` (Montreal).

### Function URLs
```
processDataset:       https://processdataset-6ju7yi5g2a-pd.a.run.app
processDatasetStatus: https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/processDatasetStatus
manualCleanup:        https://manualcleanup-6ju7yi5g2a-pd.a.run.app
apifyWebhook:         https://apifywebhook-6ju7yi5g2a-pd.a.run.app
listApifyWebhooks:    https://listapifywebhooks-6ju7yi5g2a-pd.a.run.app
```

## Key Decisions Made

### Architecture
1. **2nd Gen Cloud Functions** - Using Firebase Functions v2 for longer timeouts (up to 9 min) and Cloud Run integration
2. **Batch Processing with Checkpointing** - Process 15 rows per batch, save state to Firestore, resume via Task Queue
3. **Mixed Regions** - HTTP functions in northeast2 (Toronto), scheduled/task functions in northeast1 (Montreal) due to service availability
4. **5-Stage GPT Pipeline** - Content validation → Classification → Extraction → Secondary validation → Final formatting

### Service Design
1. **Separation of Concerns** - Services (GPT, Places, Drive, Firestore) are independent modules
2. **Structured Logging** - JSON output for Cloud Console filtering and alerting
3. **Resumable Processing** - Checkpoints saved after each row to handle timeouts gracefully

### GPT Models
- `gpt-5-nano` - Fast model for validation and classification
- `gpt-5-mini` - Reasoning model for content extraction

## Deviations from Plan

1. **Region Split** - Originally planned all functions in northeast2, but Cloud Tasks and Cloud Scheduler don't support that region. Split to northeast1 for those services.
2. **Node.js 20** - Used Node 20 instead of 18 (current LTS)
3. **No `.eslintrc.js`** - ESLint configured in package.json scripts, no separate config file created

## Configuration Required

### Environment Variables (`.env`)
```bash
# Required
OPENAI_API_KEY=sk-...
GOOGLE_PLACES_API_KEY=AIza...

# Optional (have defaults)
GPT_MODEL_FAST=gpt-5-nano
GPT_MODEL_REASONING=gpt-5-mini
MAIN_SPREADSHEET_ID=1w0h7TjgP...
BATCH_SIZE=15
PAUSE_BETWEEN_BATCHES_MS=120000
MAX_EXECUTION_MS=540000
IMAGE_UPLOAD_URL=https://gathr-backend-....run.app/upload-image/
ENABLE_VERBOSE_LOGGING=true
DRY_RUN=false
ADMIN_API_KEY=<for admin endpoints>
APIFY_WEBHOOK_SECRET=<for webhook verification>
```

### APIs Enabled (Google Cloud Console)
- Cloud Functions API
- Cloud Build API
- Artifact Registry API
- Cloud Scheduler API
- Cloud Tasks API
- Cloud Run API
- Eventarc API
- Pub/Sub API
- Storage API

## How to Test/Validate

### Local Development
```bash
cd functions
npm install
npm run build
npm run serve  # Starts Firebase emulators
```

### Manual Testing
```bash
# Process a dataset file
curl -X POST https://processdataset-6ju7yi5g2a-pd.a.run.app \
  -H "Content-Type: application/json" \
  -d '{"fileId": "GOOGLE_DRIVE_FILE_ID", "dryRun": true}'

# Check processing status
curl "https://northamerica-northeast2-gathr-migrated.cloudfunctions.net/processDatasetStatus?fileId=GOOGLE_DRIVE_FILE_ID"

# Trigger manual cleanup
curl -X POST https://manualcleanup-6ju7yi5g2a-pd.a.run.app \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expiredEventsDays": 1}'
```

### View Logs
```bash
firebase functions:log --project gathr-migrated
```

## Known Limitations / TODOs

1. **Apify Webhook** - Currently a stub; doesn't automatically trigger processing when Apify runs complete
2. **Webhook Signature Verification** - Not fully implemented (accepts all webhooks if secret is configured)
3. **Image Processing** - Image upload logic references external Cloud Run service, not fully integrated
4. **Venue Creation** - Currently skips rows without matching venues; could auto-create venues
5. **Error Recovery** - Failed rows are logged but not automatically retried
6. **Duplicate Detection** - Uses in-memory current run entries; may miss duplicates across separate runs

## Dependencies Installed

### Production
| Package | Version | Purpose |
|---------|---------|---------|
| `firebase-admin` | ^13.0.0 | Firebase Admin SDK |
| `firebase-functions` | ^6.3.0 | Cloud Functions SDK (v2) |
| `openai` | ^4.76.0 | OpenAI API client |
| `googleapis` | ^144.0.0 | Google APIs (Drive, Places) |
| `xlsx` | ^0.18.5 | Excel file parsing |
| `luxon` | ^3.5.0 | Date/time handling with timezone support |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7.0 | TypeScript compiler |
| `@types/node` | ^20.0.0 | Node.js type definitions |
| `@types/luxon` | ^3.4.2 | Luxon type definitions |
| `eslint` | ^9.0.0 | Code linting |
| `@typescript-eslint/*` | ^8.0.0 | TypeScript ESLint plugins |
| `firebase-functions-test` | ^3.4.0 | Functions testing utilities |

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `venues` | Venue documents |
| `venues/{id}/events` | Events subcollection |
| `batch_states` | Processing state tracking |
| `checkpoints` | Resume checkpoints |
| `processed_datasets` | Processed file tracking |
| `apify_webhooks` | Webhook event log |

## Next Steps

- **Phase 5**: Migrate venue data from Google Sheets to Firestore
- **Phase 6**: Port the complete 5-stage parsing pipeline from `postParser.js`
- **Phase 7**: End-to-end testing with real Apify datasets
- **Phase 8**: Cutover from Apps Script to Cloud Functions
