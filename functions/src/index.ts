/**
 * GathR Cloud Functions
 * Main entry point - exports all Cloud Functions triggers
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// ===================
// HTTP Triggers
// ===================

// Process Dataset - Start or resume processing an Apify dataset file
export { processDataset } from './triggers/processDataset.js';

// Process Dataset Status - Get processing status for a file
export { processDatasetStatus } from './triggers/processDataset.js';
// Replay Stage 4/5 from saved parse snapshot artifacts (no Stage 1-3 GPT rerun)
export { replayStage45FromSnapshot } from './triggers/replayParser.js';

// Manual Cleanup - Admin endpoint for on-demand cleanup
export { manualCleanup } from './triggers/scheduledCleanup.js';
// Manual Pipeline Cost Report - Admin endpoint for on-demand token/cost metrics
export { manualPipelineCostReport } from './triggers/pipelineCostReport.js';

// Apify Webhook - Receive notifications when Apify runs complete
export { apifyWebhook } from './triggers/apifyWebhook.js';

// List Apify Webhooks - Admin endpoint to view webhook history
export { listApifyWebhooks } from './triggers/apifyWebhook.js';

// Retry Apify Webhook - Admin endpoint to retry failed webhooks
export { retryApifyWebhook } from './triggers/apifyWebhook.js';

// Facebook Events - Start capped test scrapes through Apify
export { startFacebookEventsScrape } from './triggers/facebookEvents.js';

// Shared Event Ingest - User shares Facebook/social event content into GathR
export { submitSharedEvent, uploadSharedEventImage } from './triggers/sharedEventIngest.js';
export {
  processSharedEventPublicCandidates,
  scheduledSharedEventPublicCandidateProcessor,
} from './triggers/sharedEventPromotion.js';

// Unknown Venues - Queue inspection and resolver controls
export {
  listUnrecognizedVenues,
  processUnrecognizedVenues,
  finalizeUnrecognizedVenueTrigger,
  finalizeCityLevelEventReviewTrigger,
  seedVenueFacebookBackfillReviewsTrigger,
  finalizeVenueFacebookBackfillReviewTrigger,
  startVenueFacebookPostsScrape,
  scheduledUnknownVenueResolver,
} from './triggers/unknownVenue.js';

// ===================
// Scheduled Triggers
// ===================

// Scheduled Cleanup - Daily cleanup of expired events
export { scheduledCleanup } from './triggers/scheduledCleanup.js';
// Scheduled Pipeline Cost Report - Daily parser usage summary and experiment tracking
export { scheduledPipelineCostReport } from './triggers/pipelineCostReport.js';

// ===================
// Task Queue Triggers
// ===================

// Process Dataset Resume - Resumes paused processing from task queue
export { processDatasetResume } from './triggers/processDataset.js';

// Process Dataset Selected Rows - Targeted row replays from unknown-venue finalization
export { processDatasetSelectedRows } from './triggers/processDataset.js';

// Shared Event Ingest - Processes queued media-heavy share ingests
export { processSharedEventIngest } from './triggers/sharedEventIngest.js';
