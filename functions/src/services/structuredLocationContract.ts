import type {CityLevelEventReviewRecord} from '../types/index.js';
import type {TimeFlags} from '../parsing/types.js';
import {createHash} from 'crypto';

export const STRUCTURED_LOCATION_VALIDATION_VERSION = 1;

export interface StructuredPosterEvidence {
  status: 'no_poster' | 'no_physical_venue' | 'broad_event' | 'explicit_venue' | 'unreadable';
  occurrence: 'matching' | 'not_printed' | 'conflict';
  venueText: string;
  addressText: string;
  venueEvidence: string;
  broadEvidence: string;
  startText: string;
  endText: string;
  doorsText: string;
  clockEvidence: string;
}

export interface StructuredLocationValidation {
  version: 1;
  sourceSignature: string;
  mediaSignature: string;
  decision: 'venue' | 'broad' | 'hold';
  posterStatus: StructuredPosterEvidence['status'] | 'no_media' | 'unavailable' | 'over_limit';
  posterEvidence?: StructuredPosterEvidence;
  venueId?: string;
  evidence: string[];
  reasons: string[];
  startTime?: string;
  endTime?: string;
  doorsTime?: string;
  timeFlags?: TimeFlags;
}

/** Retired city records and human decisions are never re-entered by ingestion. */
export function protectedStructuredReview(record: Partial<CityLevelEventReviewRecord> & Record<string, unknown>): boolean {
  const finalization = record.finalization as {action?: string; manual?: Record<string, unknown>} | undefined;
  const automatic = record.resolvedBy === 'city_level_auto_publish' && finalization?.action === 'approve_publish' &&
    Object.keys(finalization.manual || {}).length === 0;
  return ['rejected', 'ignored', 'approved', 'published_as_venue_event'].includes(String(record.status)) ||
    isRetiredVenueReview(record) || Boolean(finalization && !automatic);
}

export function structuredMediaSignature(urls: string[]): string {
  return createHash('sha256').update(JSON.stringify([...new Set(urls)].map(raw => {
    try {
      const url = new URL(raw);
      if (/(?:^|\.)(?:fbcdn\.net|facebook\.com)$/.test(url.hostname)) {
        for (const name of ['oh', 'oe', '_nc_ohc', '_nc_oc']) url.searchParams.delete(name);
      } else if (url.hostname === 'storage.googleapis.com') {
        for (const name of [...url.searchParams.keys()]) {
          if (/^(?:GoogleAccessId|Expires|Signature|X-Goog-(?:Algorithm|Credential|Date|Expires|SignedHeaders|Signature))$/i.test(name)) url.searchParams.delete(name);
        }
      }
      url.searchParams.sort(); return url.toString();
    } catch {return raw;}
  }))).digest('hex');
}

export function hasCurrentStructuredValidation(value: unknown, signature: string, mediaUrls?: string[]): boolean {
  const proof = value as StructuredLocationValidation | undefined;
  return Boolean(signature && proof?.version === STRUCTURED_LOCATION_VALIDATION_VERSION && proof.sourceSignature === signature &&
    ['venue', 'broad', 'hold'].includes(proof.decision) && Array.isArray(proof.reasons) &&
    (mediaUrls === undefined || proof.mediaSignature === structuredMediaSignature(mediaUrls)));
}

export function isRetiredVenueReview(record: Record<string, unknown>): boolean {
  return record.status === 'published_as_venue_event' || record.resolvedLocationScope === 'venue' ||
    /^venues\/[^/]+\/events\/[^/]+$/.test(String(record.publishedEventPath || ''));
}
