/**
 * Scheduled Cleanup Trigger
 * Daily cleanup of expired events and old processed records
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as firestoreService from '../services/firestoreService.js';
import { logger } from '../utils/logger.js';
import { DateTime } from 'luxon';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

function normalizeVenueIds(input: unknown): string[] {
  let values: string[] = [];

  if (Array.isArray(input)) {
    values = input.map((value) => String(value || ''));
  } else if (typeof input === 'string') {
    values = input.split(',');
  } else if (input != null) {
    values = [String(input)];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawValue of values) {
    const venueId = rawValue.trim();
    if (!venueId || seen.has(venueId)) continue;
    seen.add(venueId);
    normalized.push(venueId);
  }

  return normalized;
}

// Configuration
const CLEANUP_CONFIG = {
  // Delete events older than this many days
  expiredEventsDays: 1,
  // Keep recurring series for this many days after computed recurrence end
  recurringGraceDays: 30,
  // Delete recurring series with no lifecycle metadata when unseen this long
  staleRecurringDays: 90,
  // Delete processed dataset records older than this many days
  processedRecordsDays: 30,
  // Maximum events to delete per run (to avoid timeout)
  maxEventsPerRun: 500,
  // Optional default venue scope for cleanup (comma-separated via env var)
  defaultVenueIds: normalizeVenueIds(process.env.CLEANUP_VENUE_IDS),
};

/**
 * Scheduled Trigger: Daily cleanup of expired events
 * Runs at 3:00 AM Atlantic time every day
 */
export const scheduledCleanup = onSchedule(
  {
    schedule: '0 3 * * *', // 3:00 AM daily
    timeZone: 'America/Halifax',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'northamerica-northeast1', // Cloud Scheduler not available in northeast2
  },
  async (_event) => {
    logger.setContext({ functionName: 'scheduledCleanup' });
    logger.info('Starting scheduled cleanup');

    const results = {
      expiredEventsDeleted: 0,
      processedRecordsDeleted: 0,
      errors: [] as string[],
    };

    try {
      const scheduledVenueIds = CLEANUP_CONFIG.defaultVenueIds;

      // 1. Delete expired events
      const expiredCutoff = DateTime.now()
        .setZone('America/Halifax')
        .minus({ days: CLEANUP_CONFIG.expiredEventsDays })
        .toFormat('yyyy-MM-dd');

      logger.info('Deleting expired events', {
        cutoffDate: expiredCutoff,
        maxEvents: CLEANUP_CONFIG.maxEventsPerRun,
        recurringGraceDays: CLEANUP_CONFIG.recurringGraceDays,
        staleRecurringDays: CLEANUP_CONFIG.staleRecurringDays,
        venueIdsCount: scheduledVenueIds.length,
        venueIds: scheduledVenueIds.length > 0 ? scheduledVenueIds : undefined,
      });

      try {
        results.expiredEventsDeleted = await firestoreService.deleteExpiredEvents(
          expiredCutoff,
          CLEANUP_CONFIG.maxEventsPerRun,
          {
            recurringGraceDays: CLEANUP_CONFIG.recurringGraceDays,
            staleRecurringDays: CLEANUP_CONFIG.staleRecurringDays,
            venueIds: scheduledVenueIds,
          }
        );
        logger.info('Expired events cleanup complete', {
          deletedCount: results.expiredEventsDeleted,
          venueIdsCount: scheduledVenueIds.length,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Expired events cleanup failed: ${errorMsg}`);
        logger.error('Expired events cleanup failed', error);
      }

      // 2. Clean up old processed dataset records
      logger.info('Cleaning up old processed dataset records', {
        olderThanDays: CLEANUP_CONFIG.processedRecordsDays,
      });

      try {
        results.processedRecordsDeleted = await firestoreService.cleanupOldProcessedRecords(
          CLEANUP_CONFIG.processedRecordsDays
        );
        logger.info('Processed records cleanup complete', {
          deletedCount: results.processedRecordsDeleted,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`Processed records cleanup failed: ${errorMsg}`);
        logger.error('Processed records cleanup failed', error);
      }

      // Log summary
      logger.info('Scheduled cleanup complete', {
        expiredEventsDeleted: results.expiredEventsDeleted,
        processedRecordsDeleted: results.processedRecordsDeleted,
        venueIdsCount: scheduledVenueIds.length,
        venueIds: scheduledVenueIds.length > 0 ? scheduledVenueIds : undefined,
        errors: results.errors,
        hasErrors: results.errors.length > 0,
      });
    } catch (error) {
      logger.error('Scheduled cleanup failed', error);
      throw error;
    } finally {
      logger.clearContext('functionName');
    }
  }
);

/**
 * HTTP Trigger: Manual cleanup (for admin use)
 * Allows running cleanup on-demand with custom parameters
 */
import { onRequest } from 'firebase-functions/v2/https';

export const manualCleanup = onRequest(
  {
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'northamerica-northeast2',
    cors: true,
  },
  async (request, response) => {
    // Only accept POST requests
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Check for admin authorization (simple API key check)
    const authHeader = request.headers.authorization;
    const expectedKey = process.env.ADMIN_API_KEY;

    if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const body = (request.body ?? {}) as {
      mode?:
        | 'cleanup'
        | 'backfill_images'
        | 'backfill_venue_profiles'
        | 'backfill_recurring_lifecycle';
      expiredEventsDays?: number;
      recurringGraceDays?: number;
      staleRecurringDays?: number;
      processedRecordsDays?: number;
      maxEventsPerRun?: number;
      venueIds?: string[] | string;
      backfill?: {
        cursor?: string;
        scanLimit?: number;
        maxUpdatedDocs?: number;
        maxEventsPerVenue?: number;
        dryRun?: boolean;
        onlyRecurring?: boolean;
      };
    };

    if (body.mode === 'backfill_images') {
      const backfillOptions = {
        cursor: body.backfill?.cursor,
        scanLimit: body.backfill?.scanLimit,
        maxUpdatedDocs: body.backfill?.maxUpdatedDocs,
        dryRun: body.backfill?.dryRun,
      };

      logger.setContext({ functionName: 'manualCleanup', mode: 'backfill_images' });
      logger.info('Starting manual image backfill', { backfillOptions });

      try {
        const backfillResult = await firestoreService.backfillEventImages(backfillOptions);
        logger.info('Manual image backfill complete', { ...backfillResult });
        response.json({
          success: true,
          mode: 'backfill_images',
          result: backfillResult,
        });
      } catch (error) {
        logger.error('Manual image backfill failed', error);
        response.status(500).json({
          success: false,
          mode: 'backfill_images',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        logger.clearContext('functionName', 'mode');
      }
      return;
    }

    if (body.mode === 'backfill_venue_profiles') {
      const backfillOptions = {
        cursor: body.backfill?.cursor,
        scanLimit: body.backfill?.scanLimit,
        maxUpdatedDocs: body.backfill?.maxUpdatedDocs,
        maxEventsPerVenue: body.backfill?.maxEventsPerVenue,
        dryRun: body.backfill?.dryRun,
      };

      logger.setContext({ functionName: 'manualCleanup', mode: 'backfill_venue_profiles' });
      logger.info('Starting manual venue profile backfill', { backfillOptions });

      try {
        const backfillResult = await firestoreService.backfillVenueProfileImages(backfillOptions);
        logger.info('Manual venue profile backfill complete', { ...backfillResult });
        response.json({
          success: true,
          mode: 'backfill_venue_profiles',
          result: backfillResult,
        });
      } catch (error) {
        logger.error('Manual venue profile backfill failed', error);
        response.status(500).json({
          success: false,
          mode: 'backfill_venue_profiles',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        logger.clearContext('functionName', 'mode');
      }
      return;
    }

    if (body.mode === 'backfill_recurring_lifecycle') {
      const backfillOptions = {
        cursor: body.backfill?.cursor,
        scanLimit: body.backfill?.scanLimit,
        maxUpdatedDocs: body.backfill?.maxUpdatedDocs,
        dryRun: body.backfill?.dryRun,
        onlyRecurring: body.backfill?.onlyRecurring,
      };

      logger.setContext({ functionName: 'manualCleanup', mode: 'backfill_recurring_lifecycle' });
      logger.info('Starting manual recurring lifecycle backfill', { backfillOptions });

      try {
        const backfillResult = await firestoreService.backfillRecurringLifecycle(backfillOptions);
        logger.info('Manual recurring lifecycle backfill complete', { ...backfillResult });
        response.json({
          success: true,
          mode: 'backfill_recurring_lifecycle',
          result: backfillResult,
        });
      } catch (error) {
        logger.error('Manual recurring lifecycle backfill failed', error);
        response.status(500).json({
          success: false,
          mode: 'backfill_recurring_lifecycle',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        logger.clearContext('functionName', 'mode');
      }
      return;
    }

    const hasManualVenueIdsOverride = Object.prototype.hasOwnProperty.call(body, 'venueIds');
    const resolvedVenueIds = hasManualVenueIdsOverride
      ? normalizeVenueIds(body.venueIds)
      : CLEANUP_CONFIG.defaultVenueIds;

    const config = {
      expiredEventsDays: body.expiredEventsDays ?? CLEANUP_CONFIG.expiredEventsDays,
      recurringGraceDays: body.recurringGraceDays ?? CLEANUP_CONFIG.recurringGraceDays,
      staleRecurringDays: body.staleRecurringDays ?? CLEANUP_CONFIG.staleRecurringDays,
      processedRecordsDays: body.processedRecordsDays ?? CLEANUP_CONFIG.processedRecordsDays,
      maxEventsPerRun: body.maxEventsPerRun ?? CLEANUP_CONFIG.maxEventsPerRun,
      venueIds: resolvedVenueIds,
    };

    logger.setContext({ functionName: 'manualCleanup' });
    logger.info('Starting manual cleanup', { config });

    const results = {
      expiredEventsDeleted: 0,
      processedRecordsDeleted: 0,
      errors: [] as string[],
    };

    try {
      // Delete expired events
      const expiredCutoff = DateTime.now()
        .setZone('America/Halifax')
        .minus({ days: config.expiredEventsDays })
        .toFormat('yyyy-MM-dd');

      results.expiredEventsDeleted = await firestoreService.deleteExpiredEvents(
        expiredCutoff,
        config.maxEventsPerRun,
        {
          recurringGraceDays: config.recurringGraceDays,
          staleRecurringDays: config.staleRecurringDays,
          venueIds: config.venueIds,
        }
      );

      // Clean up old processed records
      results.processedRecordsDeleted = await firestoreService.cleanupOldProcessedRecords(
        config.processedRecordsDays
      );

      logger.info('Manual cleanup complete', results);
      response.json({
        success: true,
        venueIdsCount: config.venueIds.length,
        venueIds: config.venueIds.length > 0 ? config.venueIds : undefined,
        ...results,
      });
    } catch (error) {
      logger.error('Manual cleanup failed', error);
      response.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
      });
    } finally {
      logger.clearContext('functionName');
    }
  }
);
