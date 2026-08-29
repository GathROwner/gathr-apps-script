import {
  Timestamp,
  getFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { SOCIAL_REGION } from './validation.js';

const EVENT_API_URL =
  'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';
const MIRROR_SOURCE = 'gathr-event-api';
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const MIRROR_VALIDITY_MILLISECONDS = 24 * 60 * 60_000;

export interface RecognizedVenueCandidate {
  id: string;
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  eventCount: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function collectRecognizedVenues(events: unknown[]): RecognizedVenueCandidate[] {
  const venues = new Map<string, RecognizedVenueCandidate>();
  for (const item of events) {
    const event = record(item);
    const id = firstText(event.venueId);
    if (!id || id.includes('/') || id.length > 256) continue;
    const venueInfo = record(event.venueInfo);
    const coordinates = record(venueInfo.coordinates);
    const venueRecord = record(event.venue);
    const metadata = record(event.metadata);
    const current = venues.get(id);
    const candidateName = firstText(
      venueInfo.name,
      typeof event.venue === 'string' ? event.venue : '',
      venueRecord.pagename,
      metadata.venueName,
      'GathR venue'
    );
    const candidateAddress = firstText(
      venueInfo.address,
      event.address,
      metadata.address,
      venueRecord.address
    );
    venues.set(id, {
      id,
      name: current?.name && current.name !== 'GathR venue' ? current.name : candidateName,
      address: current?.address || candidateAddress,
      latitude: finiteNumber(coordinates.latitude ?? event.latitude ?? current?.latitude),
      longitude: finiteNumber(coordinates.longitude ?? event.longitude ?? current?.longitude),
      eventCount: (current?.eventCount || 0) + 1,
    });
  }
  return [...venues.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function fetchCurrentRecognizedVenues(
  fetchImplementation: typeof fetch = fetch
): Promise<{ venues: RecognizedVenueCandidate[]; eventsScanned: number; pages: number }> {
  const events: unknown[] = [];
  const seenTokens = new Set<string>();
  let startAfter = '';
  let pages = 0;

  do {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      includeExpired: 'false',
    });
    if (startAfter) params.set('startAfter', startAfter);
    const response = await fetchImplementation(`${EVENT_API_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`GathR event API failed with status ${response.status}.`);
    }
    const payload = record(await response.json());
    const pageEvents = Array.isArray(payload.events) ? payload.events : [];
    events.push(...pageEvents);
    pages += 1;

    const nextToken = firstText(payload.nextPageToken);
    if (!nextToken) {
      startAfter = '';
      break;
    }
    if (seenTokens.has(nextToken)) throw new Error('GathR event API repeated a page token.');
    seenTokens.add(nextToken);
    startAfter = nextToken;
  } while (pages < MAX_PAGES);

  if (startAfter) throw new Error('GathR event API exceeded the venue mirror page limit.');
  const venues = collectRecognizedVenues(events);
  if (events.length === 0 || venues.length === 0) {
    throw new Error('GathR event API returned no recognized current venues.');
  }
  return { venues, eventsScanned: events.length, pages };
}

export async function syncRecognizedVenueMirror(
  db: Firestore = getFirestore(),
  fetchImplementation: typeof fetch = fetch,
  now: Timestamp = Timestamp.now()
): Promise<{ venuesWritten: number; eventsScanned: number; pages: number }> {
  const result = await fetchCurrentRecognizedVenues(fetchImplementation);
  const expiresAt = Timestamp.fromMillis(now.toMillis() + MIRROR_VALIDITY_MILLISECONDS);
  let venuesWritten = 0;
  for (let offset = 0; offset < result.venues.length; offset += 400) {
    const batch = db.batch();
    for (const venue of result.venues.slice(offset, offset + 400)) {
      batch.set(db.collection('venues').doc(venue.id), {
        pagename: venue.name,
        title: venue.name,
        address: venue.address,
        ...(venue.latitude === undefined ? {} : { latitude: venue.latitude }),
        ...(venue.longitude === undefined ? {} : { longitude: venue.longitude }),
        socialVenueMirrorSource: MIRROR_SOURCE,
        socialVenueMirrorSourceEventCount: venue.eventCount,
        socialVenueMirrorLastSeenAt: now,
        socialVenueMirrorExpiresAt: expiresAt,
      }, { merge: true });
    }
    await batch.commit();
    venuesWritten += result.venues.slice(offset, offset + 400).length;
  }
  return {
    venuesWritten,
    eventsScanned: result.eventsScanned,
    pages: result.pages,
  };
}

export const scheduledSocialVenueMirror = onSchedule(
  {
    region: SOCIAL_REGION,
    schedule: 'every 6 hours',
    timeZone: 'America/Halifax',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const result = await syncRecognizedVenueMirror();
    logger.info('Recognized social venue mirror synchronized', result);
  }
);
