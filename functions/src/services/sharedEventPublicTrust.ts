import {
  ParsedSharedEvent,
  PublicSharedEventCandidateRecord,
  SharedEventFieldSources,
} from '../types/sharedEvent.js';

type TrustCheckRecord = Pick<
  ParsedSharedEvent | PublicSharedEventCandidateRecord,
  'title' | 'startDate' | 'startTime' | 'locationName' | 'address' | 'fieldSources'
>;

function isPublicSource(fieldSources: SharedEventFieldSources | undefined, field: keyof SharedEventFieldSources): boolean {
  return fieldSources?.[field] === 'public_source';
}

export function getUntrustedPublicPromotionFields(record: TrustCheckRecord): string[] {
  const fieldSources = record.fieldSources;
  const untrusted: string[] = [];

  if (String(record.title || '').trim() && !isPublicSource(fieldSources, 'title')) {
    untrusted.push('title');
  }

  if (String(record.startDate || '').trim() && !isPublicSource(fieldSources, 'startDate')) {
    untrusted.push('startDate');
  }

  if (String(record.startTime || '').trim() && !isPublicSource(fieldSources, 'startTime')) {
    untrusted.push('startTime');
  }

  const hasLocation = String(record.locationName || '').trim();
  const hasAddress = String(record.address || '').trim();
  if ((hasLocation || hasAddress) &&
    !isPublicSource(fieldSources, 'locationName') &&
    !isPublicSource(fieldSources, 'address')) {
    untrusted.push('location');
  }

  return untrusted;
}

export function getUntrustedPublicPromotionReason(record: TrustCheckRecord): string {
  const fields = getUntrustedPublicPromotionFields(record);
  return fields.length ? `untrusted_public_fields:${fields.join(',')}` : '';
}

export function getUntrustedPublicPromotionReviewReasons(record: TrustCheckRecord): string[] {
  return getUntrustedPublicPromotionFields(record).map((field) => `untrusted_public_${field}`);
}
