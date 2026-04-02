#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require('node:child_process');

const PROJECT_ID = process.argv.find((arg) => arg.startsWith('--project='))?.split('=')[1]
  || 'gathr-migrated';
const PAGE_SIZE = Number(process.argv.find((arg) => arg.startsWith('--pageSize='))?.split('=')[1] || 500);
const APPLY_COPY_TOP_LEVEL = process.argv.includes('--apply-copy-top-level');
const APPLY_GEOCODE_GOOGLE = process.argv.includes('--apply-geocode-google');
const ONLY_COPYABLE = process.argv.includes('--only-copyable');
const GEOCODE_DELAY_MS = Number(process.argv.find((arg) => arg.startsWith('--geocodeDelayMs='))?.split('=')[1] || 200);

function getAccessToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) {
    return String(process.env.FIRESTORE_ACCESS_TOKEN).trim();
  }
  const commands = process.platform === 'win32' ? ['gcloud.cmd', 'gcloud'] : ['gcloud'];
  let lastError = null;
  for (const command of commands) {
    try {
      return execFileSync(command, ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unable to execute gcloud auth print-access-token');
}

function getGoogleMapsApiKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return String(process.env.GOOGLE_MAPS_API_KEY).trim();
  }
  return '';
}

function readFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, 'integerValue')) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, 'doubleValue')) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, 'booleanValue')) return Boolean(value.booleanValue);
  if (Object.prototype.hasOwnProperty.call(value, 'timestampValue')) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, 'nullValue')) return null;
  if (value.mapValue?.fields) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields)) {
      out[k] = readFirestoreValue(v);
    }
    return out;
  }
  if (value.arrayValue?.values) {
    return value.arrayValue.values.map(readFirestoreValue);
  }
  return null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNestedCoordinates(docFields) {
  const coordinates = readFirestoreValue(docFields.coordinates);
  if (!coordinates || typeof coordinates !== 'object') return null;
  const lat = toNumberOrNull(coordinates.latitude);
  const lng = toNumberOrNull(coordinates.longitude);
  return lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
}

function getTopLevelCoordinates(docFields) {
  const lat = toNumberOrNull(readFirestoreValue(docFields.latitude));
  const lng = toNumberOrNull(readFirestoreValue(docFields.longitude));
  return lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
}

async function listVenueDocs(token) {
  const allDocs = [];
  let pageToken = '';
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/venues`;

  do {
    const url = new URL(base);
    url.searchParams.set('pageSize', String(PAGE_SIZE));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Firestore list venues failed (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json();
    if (Array.isArray(payload.documents)) {
      allDocs.push(...payload.documents);
    }
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return allDocs;
}

async function patchVenueCoordinates(token, venueDocName, coordinates, { patchTopLevel = false } = {}) {
  const now = new Date().toISOString();
  const url = new URL(`https://firestore.googleapis.com/v1/${venueDocName}`);
  url.searchParams.append('updateMask.fieldPaths', 'coordinates');
  if (patchTopLevel) {
    url.searchParams.append('updateMask.fieldPaths', 'latitude');
    url.searchParams.append('updateMask.fieldPaths', 'longitude');
  }
  url.searchParams.append('updateMask.fieldPaths', 'updatedAt');

  const fields = {
    coordinates: {
      mapValue: {
        fields: {
          latitude: { doubleValue: coordinates.latitude },
          longitude: { doubleValue: coordinates.longitude },
        },
      },
    },
    updatedAt: { timestampValue: now },
  };

  if (patchTopLevel) {
    fields.latitude = { doubleValue: coordinates.latitude };
    fields.longitude = { doubleValue: coordinates.longitude };
  }

  const body = {
    fields,
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Patch failed (${response.status}): ${await response.text()}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeGoogle(address, apiKey) {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Geocoding HTTP ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (payload.status !== 'OK' || !Array.isArray(payload.results) || payload.results.length === 0) {
    return null;
  }

  const first = payload.results[0];
  const lat = toNumberOrNull(first.geometry?.location?.lat);
  const lng = toNumberOrNull(first.geometry?.location?.lng);
  if (lat == null || lng == null) return null;

  return {
    latitude: lat,
    longitude: lng,
    placeId: first.place_id || null,
    formattedAddress: first.formatted_address || '',
    locationType: first.geometry?.location_type || '',
  };
}

function summarizeDoc(doc) {
  const fields = doc.fields || {};
  const id = String(doc.name || '').split('/').pop();
  const pagename = readFirestoreValue(fields.pagename) || readFirestoreValue(fields.title) || '';
  const address = readFirestoreValue(fields.address) || '';
  const facebookUrl = readFirestoreValue(fields.facebookUrl) || readFirestoreValue(fields.pageurl) || '';
  const nested = getNestedCoordinates(fields);
  const topLevel = getTopLevelCoordinates(fields);
  const hasAddress = Boolean(String(address).trim());
  const hasFacebook = Boolean(String(facebookUrl).trim());

  return {
    id,
    name: pagename,
    address,
    facebookUrl,
    nestedCoordinates: nested,
    topLevelCoordinates: topLevel,
    hasAddress,
    hasFacebook,
    missingCoordinatesMap: !nested,
    copyableFromTopLevel: !nested && !!topLevel,
    firestoreDocName: doc.name,
  };
}

async function main() {
  const token = getAccessToken();
  const docs = await listVenueDocs(token);
  const rows = docs.map(summarizeDoc);

  const missing = rows.filter((r) => r.missingCoordinatesMap);
  const missingWithAddressOrFb = missing.filter((r) => r.hasAddress || r.hasFacebook);
  const copyable = missingWithAddressOrFb.filter((r) => r.copyableFromTopLevel);
  const needsGeocode = missingWithAddressOrFb.filter((r) => !r.copyableFromTopLevel);

  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Venues scanned: ${rows.length}`);
  console.log(`Missing coordinates map: ${missing.length}`);
  console.log(`Missing coordinates map + has address or FB: ${missingWithAddressOrFb.length}`);
  console.log(`Copyable from top-level lat/lng: ${copyable.length}`);
  console.log(`Needs geocode/manual backfill: ${needsGeocode.length}`);

  let displayRows = missingWithAddressOrFb;
  if (ONLY_COPYABLE) displayRows = copyable;

  console.log('\nSample rows (up to 50):');
  for (const row of displayRows.slice(0, 50)) {
    console.log(JSON.stringify({
      id: row.id,
      name: row.name,
      hasAddress: row.hasAddress,
      hasFacebook: row.hasFacebook,
      topLevelCoordinates: row.topLevelCoordinates,
      copyableFromTopLevel: row.copyableFromTopLevel,
      address: row.address,
      facebookUrl: row.facebookUrl,
    }));
  }

  if (!APPLY_COPY_TOP_LEVEL) {
    console.log('\nDry run only. Re-run with --apply-copy-top-level to backfill nested coordinates from top-level lat/lng.');
    return;
  }

  let patched = 0;
  for (const row of copyable) {
    await patchVenueCoordinates(token, row.firestoreDocName, row.topLevelCoordinates, { patchTopLevel: false });
    patched += 1;
    console.log(`Patched coordinates map from top-level: ${row.id}`);
  }

  console.log(`\nPatched ${patched} venue docs from top-level coords.`);

  if (!APPLY_GEOCODE_GOOGLE) {
    return;
  }

  const googleKey = getGoogleMapsApiKey();
  if (!googleKey) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY env var for --apply-geocode-google');
  }

  const geocodeTargets = missingWithAddressOrFb.filter(
    (row) => !row.copyableFromTopLevel && row.hasAddress
  );

  let geocodePatched = 0;
  let geocodeFailed = 0;
  const geocodeMisses = [];

  for (const row of geocodeTargets) {
    try {
      const result = await geocodeGoogle(row.address, googleKey);
      if (!result) {
        geocodeFailed += 1;
        geocodeMisses.push({ id: row.id, name: row.name, address: row.address, reason: 'no-result' });
      } else {
        await patchVenueCoordinates(
          token,
          row.firestoreDocName,
          { latitude: result.latitude, longitude: result.longitude },
          { patchTopLevel: true }
        );
        geocodePatched += 1;
        console.log(
          `Geocoded + patched: ${row.id} -> ${result.latitude}, ${result.longitude} (${result.locationType})`
        );
      }
    } catch (error) {
      geocodeFailed += 1;
      geocodeMisses.push({
        id: row.id,
        name: row.name,
        address: row.address,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    if (GEOCODE_DELAY_MS > 0) {
      await sleep(GEOCODE_DELAY_MS);
    }
  }

  console.log(`\nGeocode backfill complete. Patched=${geocodePatched}, failed=${geocodeFailed}`);
  if (geocodeMisses.length > 0) {
    console.log('Geocode misses/failures (up to 50):');
    geocodeMisses.slice(0, 50).forEach((entry) => console.log(JSON.stringify(entry)));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
