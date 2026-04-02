# GathR Cloud Functions

Firebase Cloud Functions for GathR's data processing pipeline.

## Related Docs

- Unknown venue cloud pipeline (cloud-only queue/resolver/email review/finalize): `../docs/UNKNOWN-VENUE-CLOUD-PIPELINE-README.md`

## Overview

This package replaces the Google Apps Script processing with Firebase Cloud Functions, providing:
- Scalable batch processing with pause/resume capability
- GPT-powered content extraction (5-stage pipeline)
- Google Places API integration for venue lookup
- Firestore for data persistence and state management

## Directory Structure

```
functions/
├── src/
│   ├── index.ts              # Main exports
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── utils/
│   │   ├── index.ts
│   │   ├── similarity.ts     # String similarity functions
│   │   ├── dateTime.ts       # Date/time utilities
│   │   └── logger.ts         # Structured logging
│   ├── services/
│   │   ├── index.ts
│   │   ├── gptService.ts     # OpenAI API integration
│   │   ├── placesService.ts  # Google Places API
│   │   ├── driveService.ts   # Google Drive file access
│   │   └── firestoreService.ts # Firestore CRUD
│   ├── processing/
│   │   ├── index.ts
│   │   ├── fileProcessor.ts  # Main orchestration
│   │   ├── rowProcessor.ts   # Individual row handling
│   │   └── batchManager.ts   # Batch state management
│   └── triggers/
│       ├── index.ts
│       ├── processDataset.ts # HTTP trigger for processing
│       ├── scheduledCleanup.ts # Daily cleanup
│       └── apifyWebhook.ts   # Apify notifications
├── package.json
├── tsconfig.json
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
└── .env.example
```

## Setup

1. Install dependencies:
   ```bash
   cd functions
   npm install
   ```

2. Copy environment file and configure:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. Build TypeScript:
   ```bash
   npm run build
   ```

4. Deploy:
   ```bash
   npm run deploy
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for GPT calls |
| `GPT_MODEL_FAST` | Fast model for validation (default: gpt-5-nano) |
| `GPT_MODEL_REASONING` | Reasoning model for extraction (default: gpt-5-mini) |
| `GOOGLE_PLACES_API_KEY` | Google Places API key |
| `OPERATING_HOURS_CACHE_TTL_MS` | Minimum cache lifetime for venue operating hours (default: 604800000 / 7 days) |
| `MAIN_SPREADSHEET_ID` | Main venue spreadsheet ID |
| `BATCH_SIZE` | Rows per batch (default: 15) |
| `PAUSE_BETWEEN_BATCHES_MS` | Pause duration (default: 120000) |
| `MAX_EXECUTION_MS` | Max execution time (default: 540000) |
| `ADMIN_API_KEY` | API key for admin endpoints |
| `CLEANUP_VENUE_IDS` | Optional comma-separated venue IDs to scope scheduled cleanup |
| `APIFY_WEBHOOK_SECRET` | Secret for Apify webhook verification |
| `ENABLE_PARSE_SNAPSHOTS` | Save per-row parse snapshots in Firestore (keep enabled for cost reporting) |
| `ENABLE_OCR_DEBUG` | Enable always-on OCR debug snapshot call in `full5stage` (default: true; set `false` to disable) |
| `STAGE1_MODEL_OVERRIDE` | Optional model override for Stage 1 validation |
| `STAGE2_MODEL_OVERRIDE` | Optional model override for Stage 2 classification |
| `STAGE3_MODEL_OVERRIDE` | Optional model override for Stage 3 extraction |
| `STAGE4_MODEL_OVERRIDE` | Optional model override for Stage 4 validation |
| `STAGE5_MODEL_OVERRIDE` | Optional model override for Stage 5 formatting |
| `OCR_DEBUG_MODEL_OVERRIDE` | Optional model override for OCR debug extraction |
| `STAGE1_IMAGE_DETAIL` | Image detail override for Stage 1 (`high`/`low`/`auto`) |
| `STAGE2_IMAGE_DETAIL` | Image detail override for Stage 2 (`high`/`low`/`auto`) |
| `STAGE3_IMAGE_DETAIL` | Image detail override for Stage 3 (`high`/`low`/`auto`) |
| `OCR_DEBUG_IMAGE_DETAIL` | Image detail override for OCR debug calls (`high`/`low`/`auto`) |
| `ENABLE_STAGE3_MIXED_DUAL_EXTRACT` | Stage 3 mixed mode: run both event + specials extractors (default: true) |
| `ENABLE_STAGE3_CALENDAR_SUPPLEMENTAL_OCR` | Stage 3 calendar supplemental OCR pass (default: true) |
| `ENABLE_DAILY_PIPELINE_COST_REPORT` | Enable scheduled daily token/cost report generation (default: true) |
| `PIPELINE_COST_REPORT_LOOKBACK_HOURS` | Report lookback window in hours (default: 24) |
| `PIPELINE_COST_REPORT_SCAN_LIMIT` | Max snapshots scanned per report run (default: 5000) |
| `PRICE_<MODEL>_INPUT_PER_M` | Optional pricing override (USD per 1M uncached input tokens) |
| `PRICE_<MODEL>_OUTPUT_PER_M` | Optional pricing override (USD per 1M output tokens) |
| `PRICE_<MODEL>_CACHED_INPUT_PER_M` | Optional pricing override (USD per 1M cached input tokens) |

## API Endpoints

### Process Dataset
```
POST /processDataset
{
  "fileId": "google-drive-file-id",
  "fileName": "optional-name",
  "resumeFromCheckpoint": true,
  "dryRun": false
}
```

### Get Processing Status
```
GET /processDatasetStatus?fileId=xxx
```

### Manual Cleanup (Admin)
```
POST /manualCleanup
Authorization: Bearer <ADMIN_API_KEY>
{
  "expiredEventsDays": 1,
  "processedRecordsDays": 30,
  "venueIds": ["slug_thetivolicinema"]
}
```

### Manual Pipeline Cost Report (Admin)
```
POST /manualPipelineCostReport
Authorization: Bearer <ADMIN_API_KEY>
{
  "lookbackHours": 24,
  "scanLimit": 5000
}
```

### Apify Webhook
```
POST /apifyWebhook
```

## Processing Pipeline

1. **Content Validation** (Stage 1) - Check if post contains event content
2. **Content Classification** (Stage 2) - Determine content type and item count
3. **Content Extraction** (Stage 3) - Extract structured event data
4. **Secondary Validation** (Stage 4) - Validate extracted items
5. **Final Formatting** (Stage 5) - Format and normalize output

## Batch Processing

- Processes 15 valid rows per batch
- 2-minute pause between batches
- Checkpoints saved to Firestore for resume capability
- Automatic task queue scheduling for continuation

## Logging

All logs are structured JSON for Cloud Console visibility:
```json
{
  "severity": "INFO",
  "message": "Processing started",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "context": {
    "functionName": "processDataset",
    "fileId": "abc123"
  }
}
```

## Development

```bash
# Build and watch
npm run build:watch

# Run emulator
npm run serve

# View logs
npm run logs

# Verify parser env guardrails on deployed services
npm run verify:parser-env
```

## Firestore Collections

- `venues/` - Venue documents
- `venues/{id}/events/` - Events subcollection
- `batch_states/` - Processing state tracking
- `checkpoints/` - Resume checkpoints
- `processed_datasets/` - Processed file tracking
- `apify_webhooks/` - Webhook event log
- `parse_snapshots/` - Per-row parser snapshots (includes GPT usage summaries in full5stage mode)
- `pipeline_cost_reports/` - Daily/on-demand pipeline token+cost report outputs
