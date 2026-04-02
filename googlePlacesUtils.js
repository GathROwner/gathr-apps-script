// googlePlacesUtils.gs

/**
 * Retrieves the Google Places API key from script properties.
 * @return {string} The Google Places API key.
 */
function getGooglePlacesApiKey() {
  return PropertiesService.getScriptProperties().getProperty('GOOGLE_PLACES_API_KEY');
}


/**
 * Searches for a place using Google Places API with improved input handling and detailed logging.
 * @param {string} establishment - The name of the establishment.
 * @param {string} partialAddress - Any partial address information available.
 * @return {Object|null} The place details if found, null otherwise.
 */
function searchGooglePlaces(establishment, partialAddress, streetAddress, city, category) {
  console.log(`searchGooglePlaces : Starting Google Places search`);
  console.log(`searchGooglePlaces : Raw input - Establishment: "${establishment}", Partial Address: "${partialAddress}", StreetAddress: "${streetAddress}", City: "${city}", Category: "${category}"`);

  // Clean and prepare input
  establishment = (establishment || '').trim().replace(/,\s*$/, '');
  partialAddress = (partialAddress || '').trim().replace(/,\s*$/, '');
  streetAddress = (streetAddress || '').trim().replace(/,\s*$/, '');
  city = (city || '').trim().replace(/,\s*$/, '');
  category = (category || '').trim();

  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) {
    console.error('Google Places API key not found');
    return null;
  }

  // Construct the input query
  let inputQuery = establishment;
  if (partialAddress && !establishment.includes(partialAddress)) {
    inputQuery += ' ' + partialAddress;
  } else if (!partialAddress) {
    // Use streetAddress and city as fallback if partialAddress is not available
    if (streetAddress && !establishment.includes(streetAddress)) {
      inputQuery += ' ' + streetAddress;
    }
    if (city && !establishment.includes(city)) {
      inputQuery += ' ' + city;
    }
  }
  if (category && !inputQuery.toLowerCase().includes(category.toLowerCase())) {
    inputQuery += ' ' + category;
  }
  inputQuery = inputQuery.trim();

  console.log(`searchGooglePlaces : Constructed query: "${inputQuery}"`);

  // Rest of the function remains the same...
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(inputQuery)}&inputtype=textquery&fields=name,formatted_address,geometry,place_id,types&key=${encodeURIComponent(apiKey)}`;

  console.log(`searchGooglePlaces : API URL (redacted): ${url.replace(apiKey, 'REDACTED')}`);

  try {
    const response = UrlFetchApp.fetch(url);
    const responseCode = response.getResponseCode();
    console.log(`searchGooglePlaces : API Response Code: ${responseCode}`);

    const responseText = response.getContentText();
    console.log('searchGooglePlaces : Raw API Response:', responseText);

    const result = JSON.parse(responseText);
    console.log(`searchGooglePlaces : API Response Status: ${result.status}`);

    if (result.status === 'OK' && result.candidates && result.candidates.length > 0) {
      const place = result.candidates[0];
      console.log('First result details:');
      console.log(`- Name: ${place.name}`);
      console.log(`- Address: ${place.formatted_address}`);
      console.log(`- Latitude: ${place.geometry.location.lat}`);
      console.log(`- Longitude: ${place.geometry.location.lng}`);
      console.log(`- Types: ${place.types.join(', ')}`);

      // Check if the result is likely to be an actual establishment
      const isEstablishment = place.types.some(type => 
        ['establishment', 'point_of_interest', 'food', 'restaurant', 'bar', 'lodging'].includes(type)
      );

      return {
        formatted_address: place.formatted_address,
        geometry: {
          location: {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng
          }
        },
        name: isEstablishment ? place.name : null,
        is_establishment: isEstablishment,
        place_id: place.place_id
      };
    } else {
      console.log(`searchGooglePlaces : No results found for query: ${inputQuery}`);
      if (result.status !== 'OK') {
        console.log(`searchGooglePlaces : API returned status: ${result.status}`);
        if (result.error_message) {
          console.log(`searchGooglePlaces : Error message: ${result.error_message}`);
        }
      }
    }
  } catch (error) {
    console.error(`searchGooglePlaces : Error searching Google Places for query "${inputQuery}":`, error);
    console.error(`searchGooglePlaces : Error stack: ${error.stack}`);
  }

  console.log('searchGooglePlaces : No results found in Google Places');
  return null;
}


/**
 * Caches the result of a Google Places API call.
 * @param {string} key - The cache key (usually establishment name).
 * @param {Object} data - The data to cache.
 */
function cacheGooglePlacesResult(key, data) {
  const cache = CacheService.getScriptCache();
  cache.put(key, JSON.stringify(data), 21600); // Cache for 6 hours
}

/**
 * Retrieves a cached Google Places API result.
 * @param {string} key - The cache key (usually establishment name).
 * @return {Object|null} The cached data if found, null otherwise.
 */
function getCachedGooglePlacesResult(key) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  return cached ? JSON.parse(cached) : null;
}

/**
 * Cache helpers for hours keyed by place_id
 */
function cachePlaceHours(placeId, hoursObj) {
  const cache = CacheService.getScriptCache();
  cache.put(`hours:${placeId}`, JSON.stringify(hoursObj), 21600); // 6 hours
}

function getCachedPlaceHours(placeId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(`hours:${placeId}`);
  return cached ? JSON.parse(cached) : null;
}

function fetchPlaceDetails(placeId) {
  try {
    const apiKey = getGooglePlacesApiKey();
    // Request formatted_address so appendToDestinationSheet can accept Stage 5.5 without Contact Info
    const fields = 'name,formatted_address,opening_hours,geometry,website,international_phone_number';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${encodeURIComponent(apiKey)}`;

    console.log('fetchPlaceDetails: placeId=' + placeId);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());

    if (json.status !== 'OK') {
      console.log(`fetchPlaceDetails: status=${json.status} msg=${json.error_message || ''}`);
      return null;
    }

    const result = json.result || null;

    // Extra logging so we can see if address/coords are present
    if (result) {
      const lat = result.geometry && result.geometry.location ? result.geometry.location.lat : '(n/a)';
      const lng = result.geometry && result.geometry.location ? result.geometry.location.lng : '(n/a)';
      console.log(`fetchPlaceDetails: got result. formatted_address="${result.formatted_address || ''}" lat=${lat} lng=${lng}`);
    }

    return result;
  } catch (e) {
    console.error('fetchPlaceDetails: Error', e);
    return null;
  }
}


/**
 * Convert Google HHmm (e.g., "1730") to "HH:MM:00 AM/PM"
 */
function toAmPm(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || hhmm.length < 3) return '';
  const hh = parseInt(hhmm.slice(0, 2), 10);
  const mm = hhmm.slice(2, 4) || '00';
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hr12 = ((hh + 11) % 12) + 1;
  const hrStr = hr12.toString().padStart(2, '0');
  return `${hrStr}:${mm}:00 ${suffix}`;
}


/**
 * Resolve times using venue hours AFTER Stage 5 locked the venue.
 * Only applies when timeFlags indicate "to close"/"semantic" or when times are missing.
 * items: array of formatted events/specials (from Stage 5)
 */
function resolveTimesWithOperatingHours(items, userName, partialAddress, timestamp) {
  try {
    if (!Array.isArray(items) || items.length === 0) return items;

    const __processed = items.map((item, idx) => {
      try {
         let tf = item.timeFlags || {};

      // ANCHOR: HOURS_UNKNOWN_TREAT_EMPTY_START
      // Normalize "unknown" to empty so downstream logic treats it as missing.
      const isMissingTime = (v) => {
        if (v === null || v === undefined) return true;
        const s = String(v).trim().toLowerCase();
        return s === '' || s === 'unknown';
      };

      if (isMissingTime(item.startTime)) item.startTime = '';
      if (isMissingTime(item.endTime)) item.endTime = '';

      // If start is missing or "unknown", ask resolver to use venue OPEN time
      const _startStr = (item.startTime || '').toString().trim().toLowerCase();
      if (!_startStr) {
        item.timeFlags = item.timeFlags || {};
        item.timeFlags.start = item.timeFlags.start || {};
        if (item.timeFlags.start.source !== 'semantic') {
          item.timeFlags.start.source = 'semantic';
          item.timeFlags.start.evidence =
  (item.timeFlags.start.evidence ? item.timeFlags.start.evidence + '; ' : '') +
  'start missing/unknown → use venue open time';
        }
      }

      // If the item has no end time, prefer venue CLOSING time over category default
      let endMissing = isMissingTime(item.endTime);
      if (endMissing) {
        item.timeFlags = item.timeFlags || {};
        item.timeFlags.end = item.timeFlags.end || {};
        if (item.timeFlags.end.toClose !== true) {
          item.timeFlags.end.toClose = true;
          item.timeFlags.end.evidence = (item.timeFlags.end.evidence ? item.timeFlags.end.evidence + '; ' : '') + 'end missing → use venue close time';
        }
      }
      // ANCHOR: HOURS_UNKNOWN_TREAT_EMPTY_END


        // refresh snapshot AFTER mutations so logic below sees the new flags
        tf = item.timeFlags || tf;

        const endToClose = !!(tf && tf.end && tf.end.toClose === true);

        // Determine whether we actually need venue hours
        const startNeedsHours = !!(tf && tf.start && tf.start.source === 'semantic');
        const endNeedsHours   = endToClose || !!(tf && tf.end && tf.end.source === 'semantic');


        // If there's no "to close" or "semantic" need, but start exists and end is missing,
        // use a category default duration (NO Places call).
        const startPresent = !!(item.startTime && String(item.startTime).trim() !== '' && String(item.startTime).toLowerCase() !== 'unknown');
if (!startNeedsHours && !endNeedsHours && startPresent && endMissing) {
  const mins = inferDefaultDurationByCategory(item.category);
  console.log('resolveTimesWithOperatingHours: category default check → category="' + (item.category || '') + '" mins=' + mins);
  if (mins > 0) {
    try {
      const computedEnd = addMinutesToTime(item.startTime, mins);
      item.endTime = computedEnd;

      // Always set endDate to startDate; bump if end crosses midnight
      if (item.startDate) {
        item.endDate = item.startDate;
        if (_crossesMidnight(item.startTime, item.endTime)) {
          item.endDate = _bumpDateYYYYMMDD(item.startDate);
        }
      }

      item.timeResolution = item.timeResolution || {};
item.timeResolution.endFromHours = 'category_default';
item.timeResolution.hoursUsed = false;

// ensure flags reflect default path (not "to close")
item.timeFlags = item.timeFlags || {};
item.timeFlags.end = item.timeFlags.end || {};
item.timeFlags.end.toClose = false;
item.timeFlags.end.evidence = 'category default applied';

// breadcrumb
console.log(`[TimeRes] path=category_default start=${item.startTime} computedEnd=${item.endTime} assignedEnd=${item.endTime} endDate=${item.endDate||''}`);

      console.log(`[TimeRes] path=category_default start=${item.startTime} computedEnd=${computedEnd} assignedEnd=${item.endTime} endDate=${item.endDate||''}`);
    } catch (e) {
      console.error('resolveTimesWithOperatingHours: category default error', e);
    }
  }
  return item;
}


        // If we don't actually need hours, nothing to do.
        if (!startNeedsHours && !endNeedsHours) {
          return item;
        }

        // Choose a venue: prefer additionalLocation (locked in Stage 5), else establishment, else userName
        const venueName = (item.additionalLocation && String(item.additionalLocation).trim())
          || (item.establishment && String(item.establishment).trim())
          || userName;

        // Pick the date we’re resolving against
        const localDate = item.startDate || item.date || '';
        if (!localDate) {
          item.timeResolution = { usedHours: false, reason: 'no_date' };
          return item;
        }

        // Try Contact Info match first (by Pagename), then fall back to Places
        let placeId = item.placeId || null;
        let ciAddressHint = '';

        try {
          console.log(`[Stage 5.5] Contact Info lookup: looking for "${venueName}" in Contact Info (Pagename)`);
          const DESTINATION_SPREADSHEET_ID = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';
          const ss = SpreadsheetApp.openById(DESTINATION_SPREADSHEET_ID);
          const ciSheet = ss && ss.getSheetByName('Contact Info');

          if (ciSheet) {
            const ciMatch = findExistingContactInfoEntry(ciSheet, venueName, '');
            if (ciMatch && ciMatch.data) {
              const ciHeaders = ciSheet.getDataRange().getValues()[0] || [];
              const colPagename = ciHeaders.indexOf('Pagename');
              const colAddress  = ciHeaders.indexOf('Address');
              let   colPlaceId  = ciHeaders.indexOf('Placeid');
              if (colPlaceId === -1) colPlaceId = ciHeaders.indexOf('Place Id');
              if (colPlaceId === -1) colPlaceId = ciHeaders.indexOf('PlaceID');

              const ciName = (colPagename !== -1 ? String(ciMatch.data[colPagename] || '').trim() : '');
              console.log(`[Stage 5.5] Contact Info match: rowIndex=${ciMatch.rowIndex}; found venue in column "Pagename" value="${ciName}"`);

              if (colPlaceId !== -1 && ciMatch.data[colPlaceId]) {
                placeId = String(ciMatch.data[colPlaceId]).trim();
                console.log(`[Stage 5.5] Using CI PlaceId from column "Placeid": ${placeId}`);
              }

              if (colAddress !== -1 && ciMatch.data[colAddress]) {
                const addr = String(ciMatch.data[colAddress]).trim();
                if (isAddressAcceptable(addr)) {
                  ciAddressHint = addr;
                  console.log(`[Stage 5.5] Using CI Address hint from column "Address": ${addr}`);
                } else {
                  console.log(`[Stage 5.5] CI Address present but not acceptable; ignoring: ${addr}`);
                }
              }
            } else {
              console.log(`[Stage 5.5] Contact Info lookup: no match for "${venueName}"`);
            }
          } else {
            console.log('[Stage 5.5] Contact Info sheet not found');
          }
        } catch (ciErr) {
          console.log('[Stage 5.5] Contact Info lookup failed; continuing without CI hint: ' + ciErr);
        }

          // If we still don't have a placeId, run a Places search using CI address hint first
          if (!placeId) {
            const hint = ciAddressHint || partialAddress || '';
            console.log(`[Stage 5.5] searchGooglePlaces: using hint="${hint}"`);
            const search = searchGooglePlaces(venueName, hint);
            if (search && (search.place_id || search.placeId)) {
              placeId = search.place_id || search.placeId;

            // Backfill address/coords so append step can accept and skip CI fallback
            try {
              if (search.formatted_address && (!item.address || String(item.address).trim() === '')) {
                item.address = search.formatted_address;
              }
              if (search.geometry && search.geometry.location) {
                if (!item.latitude)  item.latitude  = search.geometry.location.lat;
                if (!item.longitude) item.longitude = search.geometry.location.lng;
              }
            } catch (e) {
              console.error('resolveTimesWithOperatingHours: unable to set address/coords from search', e);
            }
          }
        }

if (!placeId) {
  // Fallback to category default if we at least have a start time
  const mins = (startPresent ? inferDefaultDurationByCategory(item.category) : 0);
  if (mins > 0 && endMissing) {
    const computedEnd = addMinutesToTime(item.startTime, mins);
    item.endTime = computedEnd;

    if (item.startDate) {
      item.endDate = item.startDate;
      if (_crossesMidnight(item.startTime, item.endTime)) {
        item.endDate = _bumpDateYYYYMMDD(item.startDate);
      }
    }

item.timeFlags = item.timeFlags || {};
item.timeFlags.end = item.timeFlags.end || {};
item.timeFlags.end.toClose = false;
item.timeFlags.end.evidence = 'category default applied (no place)';

item.timeResolution = { hoursUsed: false, reason: 'no_place_match→category_default', venueTried: venueName, endFromHours: 'category_default_fallback' };
console.log(`[TimeRes] path=category_default_fallback_no_place start=${item.startTime} computedEnd=${computedEnd} assignedEnd=${item.endTime} endDate=${item.endDate||''}`);

  } else {
    item.timeResolution = { usedHours: false, reason: 'no_place_match', venueTried: venueName };
  }
  return item;
}


        const hours = getPlaceHoursForDate(placeId, localDate);
if (!hours) {
  // Fallback to category default if we at least have a start time
  const mins = (startPresent ? inferDefaultDurationByCategory(item.category) : 0);
  if (mins > 0 && endMissing) {
    const computedEnd = addMinutesToTime(item.startTime, mins);
    item.endTime = computedEnd;

    if (item.startDate) {
      item.endDate = item.startDate;
      if (_crossesMidnight(item.startTime, item.endTime)) {
        item.endDate = _bumpDateYYYYMMDD(item.startDate);
      }
    }

item.timeFlags = item.timeFlags || {};
item.timeFlags.end = item.timeFlags.end || {};
item.timeFlags.end.toClose = false;
item.timeFlags.end.evidence = 'category default applied (no hours)';

item.timeResolution = { hoursUsed: false, reason: 'no_hours→category_default', placeId, endFromHours: 'category_default_fallback' };
console.log(`[TimeRes] path=category_default_fallback_no_hours start=${item.startTime} computedEnd=${computedEnd} assignedEnd=${item.endTime} endDate=${item.endDate||''}`);

  } else {
    item.timeResolution = { usedHours: false, reason: 'no_hours', placeId };
  }
  return item;
}


        // Apply hours to start/end as needed
        item.timeResolution = item.timeResolution || {};
        let changed = false;

        // Start from hours if semantic and missing startTime
        if (startNeedsHours && (!item.startTime || String(item.startTime).trim() === '')) {
          item.startTime = hours.open; // "HH:MM:SS AM/PM"
          item.timeResolution.startFromHours = true;
          changed = true;
        }

        // End to close if explicitly flagged
if (endToClose) {
  item.endTime = hours.close; // "HH:MM:SS AM/PM"

  if (item.startDate) {
    item.endDate = item.startDate;
    if (_crossesMidnight(item.startTime, item.endTime)) {
      item.endDate = _bumpDateYYYYMMDD(item.startDate);
    }
  }

  item.timeResolution.endFromHours = 'to_close';
  console.log(`[TimeRes] path=to_close_hours start=${item.startTime} close=${hours.close} endDate=${item.endDate||''}`);


          // If endDate is missing, seed it to the same date as start
          if (!item.endDate || String(item.endDate).trim() === '') {
            item.endDate = localDate;
          }
          changed = true;
        }

        // If both start and end are "semantic" (e.g., "open to close"), set both from hours
        if (!endToClose && tf && tf.start && tf.end && tf.start.source === 'semantic' && tf.end.source === 'semantic') {
          if (!item.startTime) {
            item.startTime = hours.open;
            item.timeResolution.startFromHours = true;
            changed = true;
          }
          if (!item.endTime) {
            item.endTime = hours.close;
            item.timeResolution.endFromHours = 'semantic_close';
            changed = true;
          }
        }

        // Overnight close: if we now have start/end and they represent next-day close, bump endDate by +1
        if (hours.crossesMidnight && item.startTime && item.endTime) {
          // Ensure there's a base endDate, then bump it
          if (!item.endDate || String(item.endDate).trim() === '') {
            item.endDate = localDate;
          }
          item.endDate = bumpDateByOne(item.endDate);
        }

        item.timeResolution.placeId = placeId;
        item.timeResolution.hoursUsed = changed;

        return item;
      } catch (inner) {
        console.error('resolveTimesWithOperatingHours: item error', inner);
        return item;
      }
    });

    // === Stage 5.5 summary log ===
    try {
      const total = __processed.length;
      let hoursUsed = 0, startFromHours = 0, endToClose = 0, semanticClose = 0, categoryDefault = 0, categoryDefaultFallback = 0;
      for (var ii = 0; ii < __processed.length; ii++) {
        const t = (__processed[ii] && __processed[ii].timeResolution) || {};
        if (t.hoursUsed) hoursUsed++;
        if (t.startFromHours) startFromHours++;
        if (t.endFromHours === 'to_close') endToClose++;
        if (t.endFromHours === 'semantic_close') semanticClose++;
        if (t.endFromHours === 'category_default') categoryDef    // === Stage 5.5 summary log + same-day endDate fix ===
    try {
      // 1) Fix: if endTime is present but endDate is blank, assume same-day endDate = startDate
      let endDateFilledFromStart = 0;
      for (var jj = 0; jj < __processed.length; jj++) {
        const evt = __processed[jj] || {};
        const hasEndTime = !!(evt.endTime && String(evt.endTime).trim() !== '' && String(evt.endTime).toLowerCase() !== 'unknown');
        const missingEndDate = !(evt.endDate && String(evt.endDate).trim() !== '');
        const hasStartDate = !!(evt.startDate && String(evt.startDate).trim() !== '');
        if (hasEndTime && missingEndDate && hasStartDate) {
          evt.endDate = evt.startDate;
          endDateFilledFromStart++;
          console.log(`Stage 5.5: endDate filled from startDate for "${evt.name || 'unnamed'}" (${evt.startDate})`);
        }
      }

      // 2) Counters for how times were resolved
      const total = __processed.length;
      let hoursUsed = 0, startFromHours = 0, endToClose = 0, semanticClose = 0, categoryDefault = 0, categoryDefaultFallback = 0;
      for (var ii = 0; ii < __processed.length; ii++) {
        const t = (__processed[ii] && __processed[ii].timeResolution) || {};
        if (t.hoursUsed) hoursUsed++;
        if (t.startFromHours) startFromHours++;
        if (t.endFromHours === 'to_close') endToClose++;
        if (t.endFromHours === 'semantic_close') semanticClose++;
        if (t.endFromHours === 'category_default') categoryDefault++;
        if (t.endFromHours === 'category_default_fallback') categoryDefaultFallback++;
      }

      console.log(`[Stage 5.5 Summary] items=${total} hoursUsed=${hoursUsed} startFromHours=${startFromHours} endToClose=${endToClose} semanticClose=${semanticClose} categoryDefault=${categoryDefault} categoryDefaultFallback=${categoryDefaultFallback} endDateFilledFromStart=${endDateFilledFromStart}`);
    } catch (sumErr) {
      console.log('Stage 5.5 Summary: (unable to compute)', sumErr);
    }

    return __processed;
ault++;
        if (t.endFromHours === 'category_default_fallback') categoryDefaultFallback++;
      }
      console.log(`[Stage 5.5 Summary] items=${total} hoursUsed=${hoursUsed} startFromHours=${startFromHours} endToClose=${endToClose} semanticClose=${semanticClose} categoryDefault=${categoryDefault} categoryDefaultFallback=${categoryDefaultFallback}`);
    } catch (sumErr) {
      console.log('Stage 5.5 Summary: (unable to compute)', sumErr);
    }

    return __processed;
  } catch (e) {
    console.error('resolveTimesWithOperatingHours: Error', e);
    return items;
  }
}

/**
 * Utility: bump a YYYY-MM-DD date by +1 day (naive, local)
 */
function bumpDateByOne(ymd) {
  try {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 1);
    const yy = dt.getFullYear();
    const mm = (dt.getMonth() + 1).toString().padStart(2, '0');
    const dd = dt.getDate().toString().padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  } catch (e) {
    return ymd;
  }
}

/**
 * Very small duration defaults by category (minutes).
 * Adjust these as you like (kept conservative).
 */
function inferDefaultDurationByCategory(category) {
  const c = (category || '').toLowerCase().trim();
  if (!c) return 0;
  if (c.includes('trivia') || c.includes('bingo')) return 120;
  if (c.includes('comedy')) return 90;
  if (c.includes('live music') || c.includes('concert')) return 120;
  if (c.includes('karaoke')) return 120;
  if (c.includes('open mic')) return 120;
  if (c.includes('dj')) return 180;
  if (c.includes('market') || c.includes('festival') || c.includes('fair')) return 240;
  if (c.includes('happy hour')) return 120; // safe default; overridden if "to close"
  return 120; // reasonable general default
}

/**
 * Add minutes to a "HH:MM:SS AM/PM" string (naive local).
 */
function addMinutesToTime(timeStr, minutes) {
  if (!timeStr) return timeStr;
  let hr, min, sec, isAmPm = false;

  // Try AM/PM "HH:MM:SS AM/PM"
  let m = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (m) {
    isAmPm = true;
    hr  = parseInt(m[1], 10);
    min = parseInt(m[2], 10);
    sec = parseInt(m[3], 10);
    const ap = m[4].toUpperCase();
    if (ap === 'PM' && hr !== 12) hr += 12;
    if (ap === 'AM' && hr === 12) hr = 0;
  } else {
    // Try 24h "HH:mm"
    m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      hr  = parseInt(m[1], 10);
      min = parseInt(m[2], 10);
      sec = 0;
    } else {
      // Unknown format → return as-is
      return timeStr;
    }
  }

  const dt = new Date(2000, 0, 1, hr, min, sec);
  dt.setMinutes(dt.getMinutes() + (parseInt(minutes, 10) || 0));

  const mm = dt.getMinutes().toString().padStart(2, '0');
  const ss = dt.getSeconds().toString().padStart(2, '0');
  const ap2 = dt.getHours() >= 12 ? 'PM' : 'AM';
  let h12 = dt.getHours() % 12; if (h12 === 0) h12 = 12;
  const hh = h12.toString().padStart(2, '0');

  // Always return "HH:MM:SS AM/PM" to match the rest of the pipeline
  return `${hh}:${mm}:${ss} ${ap2}`;
}

// ---- Time helpers for endDate handling ----
function _to24h(hhmmOrHmsAp) {
  // Accepts "HH:mm" or "HH:MM:SS AM/PM" → {h:0-23, m:0-59} or null
  const m = hhmmOrHmsAp && hhmmOrHmsAp.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1],10), min = parseInt(m[2],10);
  if (m[4]) { const ap = m[4].toUpperCase(); if (ap==='PM' && h!==12) h+=12; if (ap==='AM' && h===12) h=0; }
  return { h, m: min };
}
function _crossesMidnight(startTime, endTime) {
  const s = _to24h(startTime), e = _to24h(endTime);
  if (!s || !e) return false;
  return (e.h < s.h) || (e.h === s.h && e.m < s.m);
}
function _bumpDateYYYYMMDD(d) {
  try {
    const [y,mo,da] = d.split('-').map(n=>parseInt(n,10));
    const dt = new Date(y, mo-1, da);
    dt.setDate(dt.getDate()+1);
    const mm = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).toString().padStart(2,'0');
    return `${dt.getFullYear()}-${mm}-${dd}`;
  } catch(e){ return d; }
}


/**
 * Returns { open: "HH:MM:SS AM/PM", close: "HH:MM:SS AM/PM", crossesMidnight: boolean }
 * for a specific local date string "YYYY-MM-DD" using opening_hours.periods.
 */
function getPlaceHoursForDate(placeId, localDateYMD) {
  try {
    if (!placeId || !localDateYMD) return null;

    // Try cache first
    const cached = getCachedPlaceHours(placeId);
    let details = cached && cached.details ? cached.details : null;

    if (!details) {
      details = fetchPlaceDetails(placeId);
      if (!details || !details.opening_hours || !details.opening_hours.periods) {
        console.log('getPlaceHoursForDate: no opening_hours');
        return null;
      }
      // Cache details for reuse
      cachePlaceHours(placeId, { details });
    }

    const periods = details.opening_hours.periods || [];
    // JS Date: 0=Sun..6=Sat; Google also uses 0=Sun..6=Sat
    const d = new Date(localDateYMD + 'T12:00:00'); // midday to avoid DST edges
    const dow = d.getDay();

    // Find a period that covers this day. Google may represent overnight as open.day=X close.day=X+1
    // Strategy: prefer a period where open.day==dow; otherwise use previous day where close.day==dow (overnight).
    let candidate = periods.find(p => p.open && p.open.day === dow) || null;
    if (!candidate) {
      candidate = periods.find(p => p.close && p.close.day === dow) || null;
    }
    if (!candidate || !candidate.open || !candidate.close) {
      console.log('getPlaceHoursForDate: no matching period for date=' + localDateYMD);
      return null;
    }

    const openHHMM = candidate.open.time;   // "HHmm"
    const closeHHMM = candidate.close.time; // "HHmm"
    const crossesMidnight = candidate.close.day !== candidate.open.day;

    return {
      open: toAmPm(openHHMM),
      close: toAmPm(closeHHMM),
      crossesMidnight
    };
  } catch (e) {
    console.error('getPlaceHoursForDate: Error', e);
    return null;
  }
}


