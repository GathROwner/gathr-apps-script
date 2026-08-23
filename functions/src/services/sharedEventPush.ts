import { createHash } from 'node:crypto';

export type SharedEventPushKind =
  | 'shared_event_complete'
  | 'shared_event_venue_needed'
  | 'shared_event_failed';

export type SharedEventPushContent = {
  title: string;
  body: string;
  kind: SharedEventPushKind;
  ingestId: string;
};

type SharedEventPushRecord = {
  processingStatus?: unknown;
  processingError?: unknown;
  extractedEventCount?: unknown;
  eventsPreview?: unknown;
  crowdPromotion?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function isExpoPushToken(value: unknown): value is string {
  const token = text(value);
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token);
}

export function sharedEventPushInstallationId(expoPushToken: string): string {
  return createHash('sha256').update(expoPushToken).digest('hex');
}

export function shouldSendSharedEventPush(
  beforeStatus: unknown,
  afterStatus: unknown
): boolean {
  const before = text(beforeStatus);
  const after = text(afterStatus);
  return before !== after && (after === 'completed' || after === 'failed');
}

export function buildSharedEventPushContent(
  ingestId: string,
  data: SharedEventPushRecord
): SharedEventPushContent {
  const processingStatus = text(data.processingStatus);
  if (processingStatus === 'failed') {
    return {
      title: 'Share needs a retry',
      body: text(data.processingError) || 'GathR could not finish scanning that share.',
      kind: 'shared_event_failed',
      ingestId,
    };
  }

  const events = Array.isArray(data.eventsPreview)
    ? data.eventsPreview.map(asRecord)
    : [];
  const unresolvedVenue = events.find((event) => (
    text(event.venueResolutionStatus) === 'selection_required'
  ));
  if (unresolvedVenue) {
    return {
      title: 'Venue needed',
      body: `Tap to choose the location for ${text(unresolvedVenue.locationName) || 'your shared event'}.`,
      kind: 'shared_event_venue_needed',
      ingestId,
    };
  }

  const count = Math.max(positiveInteger(data.extractedEventCount), events.length);
  const crowd = asRecord(data.crowdPromotion);
  const candidateCount = positiveInteger(crowd.candidateEventCount);
  const collectingCount = positiveInteger(crowd.collectingEventCount);
  const threshold = Math.max(1, positiveInteger(crowd.threshold));
  const contributorCount = Math.min(positiveInteger(crowd.maxContributorCount), threshold);
  const body = candidateCount > 0
    ? `${candidateCount} ${candidateCount === 1 ? 'event has' : 'events have'} enough independent confirmations for GathR's safety checks.`
    : collectingCount > 0
      ? `Community confirmation: ${contributorCount} of ${threshold}.`
      : count > 1
        ? `GathR found ${count} possible events from your share.`
        : 'GathR finished scanning your share.';

  return {
    title: 'Share scan complete',
    body,
    kind: 'shared_event_complete',
    ingestId,
  };
}

