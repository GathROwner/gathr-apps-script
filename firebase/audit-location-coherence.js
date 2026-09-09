#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
const {
  addressLocationKey,
  addressesLikelyEquivalent,
  coordinateDistanceMeters,
  coordinatesFromLocationRecord,
} = require('../functions/lib/services/locationCoherence.js');
const {
  checkEventCoordinatesAgainstAllowedRegions,
} = require('../functions/lib/services/eventIngestJurisdictions.js');

const PROJECT_ID = process.argv.find((arg) => arg.startsWith('--project='))?.split('=')[1]
  || 'gathr-migrated';
const SERVICE_ACCOUNT_PATH = process.argv.find((arg) => arg.startsWith('--serviceAccount='))?.split('=').slice(1).join('=')
  || process.env.GATHR_LOCATION_AUDIT_SERVICE_ACCOUNT;
const OUTPUT_PATH = process.argv.find((arg) => arg.startsWith('--output='))?.split('=').slice(1).join('=');
const API_URL = process.argv.find((arg) => arg.startsWith('--apiUrl='))?.split('=').slice(1).join('=')
  || 'https://gathr-backend-924732524090.northamerica-northeast1.run.app/api/v2/firestore/events';

if (!SERVICE_ACCOUNT_PATH) {
  throw new Error('Pass --serviceAccount=<path> or set GATHR_LOCATION_AUDIT_SERVICE_ACCOUNT');
}

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(SERVICE_ACCOUNT_PATH), 'utf8'));
if (serviceAccount.project_id !== PROJECT_ID) {
  throw new Error(`Credential project must be ${PROJECT_ID}, found ${serviceAccount.project_id || '(missing)'}`);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID,
});
const db = admin.firestore();

function publicEventSummary(event) {
  return {
    id: event.id,
    originalEventId: event.originalEventId || null,
    venueId: event.venueId || null,
    title: event.title || event.name || '',
    address: event.address || '',
    latitude: event.latitude,
    longitude: event.longitude,
    startDate: event.startDate || '',
  };
}

async function fetchPublicEvents() {
  const events = [];
  let startAfter = '';
  let pages = 0;
  do {
    const url = new URL(API_URL);
    url.searchParams.set('includeExpired', 'false');
    url.searchParams.set('limit', '100');
    if (startAfter) url.searchParams.set('startAfter', startAfter);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Public event feed failed (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json();
    events.push(...(Array.isArray(payload.events) ? payload.events : []));
    startAfter = String(payload.nextPageToken || '').trim();
    pages += 1;
    if (pages > 100) throw new Error('Public feed pagination guard exceeded');
  } while (startAfter);
  return { events, pages };
}

async function main() {
  const [venueSnapshot, eventSnapshot, publicFeed] = await Promise.all([
    db.collection('venues').get(),
    db.collectionGroup('events').get(),
    fetchPublicEvents(),
  ]);
  const venues = new Map(venueSnapshot.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
  const publicEventCountsByVenueId = new Map();
  for (const event of publicFeed.events) {
    const venueId = String(event.venueId || '').trim();
    if (!venueId) continue;
    publicEventCountsByVenueId.set(venueId, (publicEventCountsByVenueId.get(venueId) || 0) + 1);
  }

  const topNestedMismatches = [];
  const outsideAllowedRegion = [];
  const placeIdGroups = new Map();
  for (const venue of venues.values()) {
    const top = coordinatesFromLocationRecord({ latitude: venue.latitude, longitude: venue.longitude });
    const nested = coordinatesFromLocationRecord({ coordinates: venue.coordinates });
    if (top && nested) {
      const distanceMeters = coordinateDistanceMeters(top, nested);
      if (distanceMeters > 50) {
        topNestedMismatches.push({
          path: `venues/${venue.id}`,
          name: venue.name || '',
          address: venue.address || '',
          top,
          nested,
          distanceMeters: Math.round(distanceMeters),
        });
      }
    }

    const coordinates = top || nested;
    if (coordinates && checkEventCoordinatesAgainstAllowedRegions(coordinates).decision === 'reject') {
      outsideAllowedRegion.push({
        path: `venues/${venue.id}`,
        name: venue.name || '',
        address: venue.address || '',
        coordinates,
        publicEventCount: publicEventCountsByVenueId.get(venue.id) || 0,
      });
    }

    const placeId = String(venue.googlePlaceId || venue.placeId || '').trim();
    if (placeId) {
      const group = placeIdGroups.get(placeId) || [];
      group.push(venue);
      placeIdGroups.set(placeId, group);
    }
  }

  const duplicatePlaceIdsAcrossAddresses = [];
  for (const [placeId, group] of placeIdGroups.entries()) {
    const addressKeys = new Set(group.map((venue) => addressLocationKey(venue.address)).filter(Boolean));
    if (group.length > 1 && addressKeys.size > 1) {
      duplicatePlaceIdsAcrossAddresses.push({
        placeId,
        venues: group.map((venue) => ({
          path: `venues/${venue.id}`,
          name: venue.name || '',
          address: venue.address || '',
          coordinates: coordinatesFromLocationRecord(venue),
          publicEventCount: publicEventCountsByVenueId.get(venue.id) || 0,
        })),
      });
    }
  }

  const storedEventParentMismatches = [];
  for (const doc of eventSnapshot.docs) {
    const venueId = doc.ref.parent.parent?.id;
    const venue = venueId ? venues.get(venueId) : undefined;
    if (!venue) continue;
    const event = doc.data();
    const eventCoordinates = coordinatesFromLocationRecord(event);
    const venueCoordinates = coordinatesFromLocationRecord(venue);
    if (!eventCoordinates || !venueCoordinates) continue;
    if (!addressesLikelyEquivalent(event.address, venue.address)) continue;
    const distanceMeters = coordinateDistanceMeters(eventCoordinates, venueCoordinates);
    if (distanceMeters <= 250) continue;
    storedEventParentMismatches.push({
      path: doc.ref.path,
      title: event.eventName || event.name || '',
      address: event.address || '',
      eventCoordinates,
      venueCoordinates,
      distanceMeters: Math.round(distanceMeters),
    });
  }

  const publicEventParentMismatches = [];
  const publicEventsOutsideAllowedRegion = [];
  for (const event of publicFeed.events) {
    const venue = venues.get(String(event.venueId || ''));
    const eventCoordinates = coordinatesFromLocationRecord(event);
    if (eventCoordinates && checkEventCoordinatesAgainstAllowedRegions(eventCoordinates).decision === 'reject') {
      publicEventsOutsideAllowedRegion.push({
        ...publicEventSummary(event),
        eventCoordinates,
      });
    }
    if (!venue) continue;
    const venueCoordinates = coordinatesFromLocationRecord(venue);
    if (!eventCoordinates || !venueCoordinates) continue;
    if (!addressesLikelyEquivalent(event.address, venue.address)) continue;
    const distanceMeters = coordinateDistanceMeters(eventCoordinates, venueCoordinates);
    if (distanceMeters <= 250) continue;
    publicEventParentMismatches.push({
      ...publicEventSummary(event),
      eventCoordinates,
      venueCoordinates,
      distanceMeters: Math.round(distanceMeters),
    });
  }

  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    counts: {
      venues: venueSnapshot.size,
      storedVenueEvents: eventSnapshot.size,
      publicEvents: publicFeed.events.length,
      publicFeedPages: publicFeed.pages,
      topNestedMismatches: topNestedMismatches.length,
      outsideAllowedRegion: outsideAllowedRegion.length,
      duplicatePlaceIdsAcrossAddresses: duplicatePlaceIdsAcrossAddresses.length,
      publicVenuesOutsideAllowedRegion: outsideAllowedRegion.filter((venue) => venue.publicEventCount > 0).length,
      publicEventsOutsideAllowedRegion: publicEventsOutsideAllowedRegion.length,
      duplicatePlaceIdGroupsWithPublicEvents: duplicatePlaceIdsAcrossAddresses.filter((group) =>
        group.venues.some((venue) => venue.publicEventCount > 0)
      ).length,
      storedEventParentMismatches: storedEventParentMismatches.length,
      publicEventParentMismatches: publicEventParentMismatches.length,
    },
    findings: {
      topNestedMismatches,
      outsideAllowedRegion,
      publicEventsOutsideAllowedRegion,
      duplicatePlaceIdsAcrossAddresses,
      storedEventParentMismatches,
      publicEventParentMismatches,
    },
  };

  if (OUTPUT_PATH) {
    const resolved = path.resolve(OUTPUT_PATH);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
