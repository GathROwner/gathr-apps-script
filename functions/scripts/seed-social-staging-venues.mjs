import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = 'gathr-social-staging';
const backendUrl = 'https://gathr-backend-924732524090.northamerica-northeast1.run.app';
const eventsUrl = `${backendUrl}/api/v2/firestore/events`;
const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
const databasePath = `projects/${projectId}/databases/(default)/documents`;

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function optionalNumberValue(value) {
  return Number.isFinite(value) ? { doubleValue: value } : undefined;
}

function fieldsForVenue(venue, seededAt) {
  return Object.fromEntries(Object.entries({
    pagename: { stringValue: venue.name },
    title: { stringValue: venue.name },
    address: { stringValue: venue.address },
    latitude: optionalNumberValue(venue.latitude),
    longitude: optionalNumberValue(venue.longitude),
    socialPreviewEnvironment: { stringValue: 'staging' },
    socialPreviewSourceEventCount: { integerValue: String(venue.eventCount) },
    socialPreviewSeededAt: { timestampValue: seededAt },
  }).filter(([, value]) => value !== undefined));
}

async function firebaseCliAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.tokens?.access_token, 'Firebase CLI access token is unavailable.');
  return config.tokens.access_token;
}

async function fetchCurrentVenues() {
  const venues = new Map();
  let startAfter = '';
  let pages = 0;
  let eventsScanned = 0;

  do {
    const params = new URLSearchParams({ limit: '100', includeExpired: 'false' });
    if (startAfter) params.set('startAfter', startAfter);
    const response = await fetch(`${eventsUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Event API failed (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json();
    const events = Array.isArray(payload.events) ? payload.events : [];
    pages += 1;
    eventsScanned += events.length;

    for (const event of events) {
      const venueId = firstText(event.venueId);
      if (!venueId || venueId.includes('/') || venueId.length > 256) continue;
      const venueRecord = event.venue && typeof event.venue === 'object' ? event.venue : {};
      const current = venues.get(venueId);
      venues.set(venueId, {
        id: venueId,
        name: firstText(
          event.venueInfo?.name,
          typeof event.venue === 'string' ? event.venue : '',
          venueRecord.pagename,
          event.metadata?.venueName,
          'GathR venue'
        ),
        address: firstText(
          event.venueInfo?.address,
          event.address,
          event.metadata?.address,
          venueRecord.address
        ),
        latitude: Number(event.venueInfo?.coordinates?.latitude ?? event.latitude),
        longitude: Number(event.venueInfo?.coordinates?.longitude ?? event.longitude),
        eventCount: (current?.eventCount || 0) + 1,
      });
    }

    startAfter = firstText(payload.nextPageToken);
    if (pages >= 20) break;
  } while (startAfter);

  return { venues: [...venues.values()], eventsScanned, pages };
}

async function writeVenues(venues, accessToken) {
  const seededAt = new Date().toISOString();
  let written = 0;
  for (let offset = 0; offset < venues.length; offset += 400) {
    const batch = venues.slice(offset, offset + 400);
    const writes = batch.map((venue) => {
      const fields = fieldsForVenue(venue, seededAt);
      return {
        update: {
          name: `${databasePath}/venues/${venue.id}`,
          fields,
        },
        updateMask: { fieldPaths: Object.keys(fields) },
      };
    });
    const response = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });
    if (!response.ok) {
      throw new Error(`Firestore staging venue seed failed (${response.status}): ${await response.text()}`);
    }
    written += batch.length;
  }
  return written;
}

const accessToken = await firebaseCliAccessToken();
const { venues, eventsScanned, pages } = await fetchCurrentVenues();
assert.ok(venues.length > 0, 'No recognized venues were returned by the current event API.');
const written = await writeVenues(venues, accessToken);

console.log(JSON.stringify({
  projectId,
  eventsScanned,
  pages,
  recognizedVenuesWritten: written,
  status: 'passed',
}, null, 2));
