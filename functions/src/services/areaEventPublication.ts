/** Reviewed unordered locations. This module never geocodes or discovers members. */
export interface EventAreaLocation {
  id: string;
  label: string;
  coordinates: {latitude: number; longitude: number};
  certainty: 'confirmed' | 'approximate';
  venueId?: string;
  linkedEventIds?: string[];
  address?: string;
  description?: string;
  timeLabel?: string;
  sourceLabel?: string;
}

export interface EventAreaData {
  version: 1;
  status: 'verified' | 'partial';
  sourceUrl?: string;
  sourceLabel?: string;
  verifiedAt?: string;
  locations: EventAreaLocation[];
}

/** Private review evidence; never copied to the public areaData. */
export interface AreaEventLinkEvidence {
  eventPath: string;
  eventName: string;
  venueId: string;
  startDate: string;
  startTime: string;
  festivalName: string;
  sourceUrl: string;
  sourceText: string;
  /** Verbatim activity/date/clock/venue excerpts from this scoped source. */
  sourceEventText: string;
  sourceDateText: string;
  sourceTimeText: string;
  sourceVenueText: string;
}

const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && Boolean(v.trim());
const url = (v: unknown): boolean => {
  try { return ['https:', 'http:'].includes(new URL(String(v)).protocol); } catch { return false; }
};
const key = (v: unknown): string => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const familyKey = (v: unknown): string => key(v).replace(/\b20\d{2}\b/g, '').replace(/\s+/g, ' ').trim();

function evidenceDate(value: string, year: string): string {
  const iso = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const match = value.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:\D+(20\d{2}))?/i);
  if (!match) return '';
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return `${match[3] || year}-${String(months.indexOf(match[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
}

function evidenceClock(value: string): string {
  const clock = value.toLowerCase().replace(/\./g, '').match(/^\s*(\d{1,2})(?::(\d{2}))?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?)?\s*(am|pm)?\s*$/);
  if (!clock || (!clock[2] && !clock[3])) return '';
  let hour = Number(clock[1]);
  if (clock[3]) { if (hour < 1 || hour > 12) return ''; hour = hour % 12 + (clock[3] === 'pm' ? 12 : 0); }
  return hour <= 23 && Number(clock[2] || 0) < 60 ? `${String(hour).padStart(2,'0')}:${clock[2] || '00'}` : '';
}

function sourceBindsOccurrence(proof: AreaEventLinkEvidence, point: EventAreaLocation): boolean {
  const source = key(proof.sourceText);
  // Film cards sometimes append the director/cast after an em dash. The
  // programme's activity heading remains the exact film identity before it.
  const activity = key(proof.eventName.split(/\s+[—–]\s+/)[0]);
  return [proof.sourceEventText, proof.sourceDateText, proof.sourceTimeText, proof.sourceVenueText]
    .every(excerpt => text(excerpt) && source.includes(key(excerpt))) &&
    key(proof.sourceEventText) === activity &&
    // A reviewer may preserve a named sublocation/alias in the public point
    // label, but an unrelated place name in the source cannot bind this point.
    (` ${key(point.label).replace(/^the /, '')} `).includes(` ${key(proof.sourceVenueText).replace(/^the /, '')} `) &&
    evidenceDate(proof.sourceDateText, proof.startDate.slice(0,4)) === proof.startDate &&
    evidenceClock(proof.sourceTimeText) === proof.startTime;
}

export function validateEventAreaData(value: unknown): EventAreaData {
  const data = value as EventAreaData;
  if (!data || data.version !== 1 || !['verified', 'partial'].includes(data.status) ||
      !Array.isArray(data.locations) || data.locations.length < 1 || data.locations.length > 50) {
    throw new Error('Invalid areaData header or locations');
  }
  const raw = data as unknown as Record<string, unknown>;
  if ((data.sourceUrl !== undefined && !url(data.sourceUrl)) ||
      (data.verifiedAt !== undefined && !Number.isFinite(Date.parse(data.verifiedAt)))) {
    throw new Error('Invalid area source URL or verification date');
  }
  if (['segments', 'route', 'orderedLocations', 'ordered', 'geometry'].some(k => k in raw)) {
    throw new Error('areaData cannot contain a route, order, or connecting line');
  }
  const ids = new Set<string>(), venues = new Set<string>(), eventIds = new Set<string>();
  for (const point of data.locations) {
    if (!point || !identifier(point.id) || !text(point.label) || ids.has(point.id) ||
        !['confirmed', 'approximate'].includes(point.certainty) ||
        !Number.isFinite(point.coordinates?.latitude) || Math.abs(point.coordinates.latitude) > 90 ||
        !Number.isFinite(point.coordinates?.longitude) || Math.abs(point.coordinates.longitude) > 180) {
      throw new Error('Invalid or duplicate area location');
    }
    ids.add(point.id);
    if (point.venueId !== undefined) {
      if (!identifier(point.venueId) || venues.has(point.venueId)) throw new Error('Invalid or duplicate area venue');
      venues.add(point.venueId);
    }
    if (point.linkedEventIds !== undefined) {
      if (!point.venueId || point.certainty !== 'confirmed' || !Array.isArray(point.linkedEventIds) || point.linkedEventIds.length > 100) {
        throw new Error('Event links require a confirmed canonical venue');
      }
      for (const id of point.linkedEventIds) {
        if (!identifier(id) || eventIds.has(id)) throw new Error('Invalid or duplicate linked event ID');
        eventIds.add(id);
      }
    }
  }
  // Copy only public contract fields; a private audit object must never leak.
  return {
    version: 1, status: data.status,
    ...(text(data.sourceUrl) ? {sourceUrl: data.sourceUrl} : {}),
    ...(text(data.sourceLabel) ? {sourceLabel: data.sourceLabel} : {}),
    ...(text(data.verifiedAt) ? {verifiedAt: data.verifiedAt} : {}),
    locations: data.locations.map(p => ({
      id: p.id, label: p.label, coordinates: {latitude: p.coordinates.latitude, longitude: p.coordinates.longitude}, certainty: p.certainty,
      ...(p.venueId ? {venueId: p.venueId} : {}),
      ...(p.linkedEventIds ? {linkedEventIds: [...p.linkedEventIds]} : {}),
      ...Object.fromEntries(['address', 'description', 'timeLabel', 'sourceLabel'].filter(k => text((p as any)[k])).map(k => [k, (p as any)[k]])),
    })),
  };
}

/** Strip only the legacy generated audit suffix, preserving the public prose. */
export function publicCityLevelDescription(value: unknown): string | undefined {
  const result = String(value || '').split(/\s*\|\s*(?:Observed broad location|Review reasons):/i)[0].trim();
  return result || undefined;
}

export function requiresReviewedAreaPoints(record: {
  spatialEvidence?: {kind?: string}; observedLocationName?: string;
  sampleRows?: {observedLocationName?: string}[];
}): boolean {
  if (record.spatialEvidence?.kind === 'multi_location') return true;
  // Legacy reviews predate spatialEvidence. A named list is still review evidence,
  // never a request to split an address or geocode a city centroid into sites.
  return [record.observedLocationName, ...(record.sampleRows || []).map(s => s.observedLocationName)]
    .some(v => /\b(?:including|locations|venues)\b[^|]*(?:;|,.*\band\b)/i.test(v || ''));
}

export type ReadAreaReference = (path: string) => Promise<Record<string, any> | undefined>;

export async function verifyAreaPublicationReferences(input: {
  areaData: EventAreaData; evidence?: AreaEventLinkEvidence[];
  eventName: string; startDate: string; endDate: string;
  read: ReadAreaReference; refreshing?: boolean;
}): Promise<EventAreaData> {
  const area = validateEventAreaData(input.areaData);
  const proofs = input.evidence || [];
  const proofIds = new Set<string>();
  for (const proof of proofs) {
    const id = proof.eventPath?.split('/').at(-1);
    if (!id || proofIds.has(id)) throw new Error('Duplicate or malformed membership evidence');
    proofIds.add(id);
  }
  let removed = false;
  for (const point of area.locations) {
    if (point.venueId) {
      const venue = await input.read(`venues/${point.venueId}`);
      if (!venue || Number(venue.latitude) !== point.coordinates.latitude || Number(venue.longitude) !== point.coordinates.longitude) {
        throw new Error(`Area venue missing or coordinates changed: ${point.venueId}`);
      }
    }
    const retained: string[] = [];
    for (const id of point.linkedEventIds || []) {
      const proof = proofs.find(p => p.eventPath?.split('/').at(-1) === id);
      if (!proof || !/^(?:events\/[A-Za-z0-9_-]+|venues\/[A-Za-z0-9_-]+\/events\/[A-Za-z0-9_-]+)$/.test(proof.eventPath) ||
          (proof.eventPath.startsWith('venues/') && proof.eventPath.split('/')[1] !== point.venueId) ||
          proof.venueId !== point.venueId || !url(proof.sourceUrl) ||
          !familyKey(proof.festivalName) || familyKey(proof.festivalName) !== familyKey(input.eventName) ||
          !key(proof.sourceText).includes(familyKey(proof.festivalName)) || !sourceBindsOccurrence(proof, point)) {
        throw new Error(`Missing source-bound festival membership: ${id}`);
      }
      const child = await input.read(proof.eventPath);
      if (!child && input.refreshing) { removed = true; continue; }
      if (!child || child.venueId !== point.venueId || child.originalEventId || child.isRecurringInstance ||
          child.isRecurring === true || String(child.isRecurring).toLowerCase() === 'yes' ||
          key(child.eventName || child.name) !== key(proof.eventName) ||
          child.startDate !== proof.startDate || child.startTime !== proof.startTime ||
          child.startDate < input.startDate || child.startDate > input.endDate ||
          (child.endDate && child.endDate > input.endDate) ||
          ['cancelled', 'deleted', 'rejected'].includes(String(child.status || '').toLowerCase())) {
        throw new Error(`Festival child occurrence changed or is not a canonical occurrence: ${id}`);
      }
      retained.push(id);
    }
    if (point.linkedEventIds) point.linkedEventIds = retained;
  }
  if (removed) area.status = 'partial';
  return area;
}
