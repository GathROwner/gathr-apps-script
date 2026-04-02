/**
 * event-field-mapping.js
 *
 * Defines the mapping between GPT Processed Sheet1 columns and Firestore event document fields.
 * Also includes transformation functions for data normalization.
 */

/**
 * Column name to Firestore field mapping
 * Key: Column header from Sheet1 (ACTUAL headers from sheet)
 * Value: Firestore field name
 *
 * Sheet1 actual columns (from dry-run output):
 * Event?, Food Special?, Recurring?, Recurrence Pattern, Category, Event Name,
 * Description, Hosting Establishment, Address, Start Date, End Date, Start Time,
 * End Time, Ticket Price, Icon, Image, Facebook URL, Shared Post Thumbnail,
 * Operating Hours, TripAdvisor Rating, TripAdvisor Reviews, Operating Hours Source,
 * Ticket Link, Latitude, Longitude, City, Street Address, Organized By,
 * Users Responded, UTC Start Date, Tickets Buy URL, Ticket Provider, Event ID,
 * Relevant Image URL, Cached Image URL, Likes, Shares, Comments, Top Reactions Count
 */
const COLUMN_TO_FIELD_MAP = {
  // Event type flags (note the ? in column names)
  'Event?': 'isEvent',
  'Food Special?': 'isFoodSpecial',
  'Recurring?': 'isRecurring',
  'Recurrence Pattern': 'recurringPattern',

  // Core event fields
  'Category': 'category',
  'Event Name': 'name',
  'Description': 'description',
  'Hosting Establishment': 'establishment',

  // Location fields
  'Address': 'address',
  'Latitude': 'latitude',
  'Longitude': 'longitude',
  'City': 'city',
  'Street Address': 'streetAddress',

  // Date/time fields
  'Start Date': 'startDate',
  'End Date': 'endDate',
  'Start Time': 'startTime',
  'End Time': 'endTime',
  'UTC Start Date': 'utcStartDate',

  // Pricing fields
  'Ticket Price': 'ticketPrice',
  'Ticket Link': 'ticketLink',
  'Tickets Buy URL': 'ticketsBuyUrl',
  'Ticket Provider': 'ticketProvider',

  // Media fields
  'Icon': 'icon',
  'Image': 'image',
  'Relevant Image URL': 'relevantImageUrl',
  'Cached Image URL': 'cachedImageUrl',
  'Shared Post Thumbnail': 'sharedPostThumbnail',

  // Facebook/source fields
  'Facebook URL': 'facebookUrl',
  'Event ID': 'eventId',

  // Engagement metrics
  'Likes': 'likes',
  'Shares': 'shares',
  'Comments': 'comments',
  'Top Reactions Count': 'topReactionsCount',
  'Users Responded': 'usersResponded',

  // Additional metadata
  'Organized By': 'organizedBy',
  'Operating Hours': 'operatingHours',
  'Operating Hours Source': 'operatingHoursSource',
  'TripAdvisor Rating': 'tripAdvisorRating',
  'TripAdvisor Reviews': 'tripAdvisorReviews',
};

/**
 * Array of column headers in exact order (for index-based access)
 */
const COLUMN_ORDER = [
  'Event?',
  'Food Special?',
  'Recurring?',
  'Recurrence Pattern',
  'Category',
  'Event Name',
  'Description',
  'Hosting Establishment',
  'Address',
  'Start Date',
  'End Date',
  'Start Time',
  'End Time',
  'Ticket Price',
  'Icon',
  'Image',
  'Facebook URL',
  'Shared Post Thumbnail',
  'Operating Hours',
  'TripAdvisor Rating',
  'TripAdvisor Reviews',
  'Operating Hours Source',
  'Ticket Link',
  'Latitude',
  'Longitude',
  'City',
  'Street Address',
  'Organized By',
  'Users Responded',
  'UTC Start Date',
  'Tickets Buy URL',
  'Ticket Provider',
  'Event ID',
  'Relevant Image URL',
  'Cached Image URL',
  'Likes',
  'Shares',
  'Comments',
  'Top Reactions Count',
];

/**
 * Fields that should be parsed as numbers
 */
const NUMERIC_FIELDS = [
  'latitude',
  'longitude',
  'likes',
  'shares',
  'comments',
  'topReactionsCount',
  'usersResponded',
  'tripAdvisorRating',
  'tripAdvisorReviews',
];

/**
 * Fields that should be parsed as booleans (from Yes/No strings)
 */
const BOOLEAN_FIELDS = [
  'isEvent',
  'isFoodSpecial',
  'isRecurring',
];

/**
 * Normalizes an establishment name for matching purposes
 * Removes punctuation, normalizes whitespace, converts to lowercase
 * @param {string} name - The establishment name to normalize
 * @returns {string} Normalized name
 */
function normalizeEstablishmentName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/['']/g, '')              // Remove apostrophes (straight and curly)
    .replace(/[^\w\s]/g, ' ')          // Replace other punctuation with space
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .trim();
}

/**
 * Parses a numeric value safely
 * @param {*} value - The value to parse
 * @returns {number|null} Parsed number or null
 */
function parseNumeric(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * Parses a Yes/No string to boolean
 * @param {*} value - The value to parse
 * @returns {boolean} Parsed boolean
 */
function parseYesNo(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  const str = String(value).trim().toLowerCase();
  return str === 'yes' || str === 'true' || str === '1' || str === 'y';
}

/**
 * Parses a date string and converts to ISO format
 * Handles various formats like YYYY-MM-DD, MM/DD/YYYY, etc.
 * @param {*} value - The date value
 * @returns {string|null} ISO date string or null
 */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;

  const rawNumeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isFinite(rawNumeric) && rawNumeric > 20000 && rawNumeric < 60000) {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = Math.round(rawNumeric * 86400000);
    const date = new Date(excelEpoch + ms);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }

  const str = String(value).trim();
  if (!str) return null;

  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // Try to parse as Date
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return str; // Return original if parsing fails
}

/**
 * Parses a time string and normalizes to HH:MM format
 * @param {*} value - The time value
 * @returns {string|null} Normalized time string or null
 */
function parseTime(value) {
  if (value === null || value === undefined || value === '') return null;

  const rawNumeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (Number.isFinite(rawNumeric) && rawNumeric >= 0 && rawNumeric < 1) {
    // Excel serial time (fraction of day)
    const totalMinutes = Math.round(rawNumeric * 24 * 60);
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Already in HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // HH:MM:SS format
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }

  // 12-hour format like "7:00 PM" or "07:00:00 PM"
  const match12h = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match12h) {
    let hour = parseInt(match12h[1], 10);
    const minute = match12h[2];
    const period = match12h[3].toUpperCase();

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  return str; // Return original if parsing fails
}

/**
 * Cleans an address by removing URLs that may have been appended
 * @param {string} address - The raw address
 * @returns {string} Cleaned address
 */
function cleanAddress(address) {
  if (!address) return '';
  return String(address).split('https://')[0].trim();
}

function normalizeMonthToken(token) {
  return String(token || '').toLowerCase().replace(/[^a-z]/g, '');
}

function toIsoDateFromParts(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt.toISOString().split('T')[0];
}

function extractMonthDayRange(text, fallbackYear) {
  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const monthPattern =
    '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const rangeRe = new RegExp(
    `\\b${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|\\u2013|\\u2014|to|through|thru)\\s*(?:${monthPattern}\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`,
    'i'
  );
  const m = String(text || '').match(rangeRe);
  if (!m) return null;

  const startMonth = monthMap[normalizeMonthToken(m[1])];
  const endMonth = monthMap[normalizeMonthToken(m[3] || m[1])] || startMonth;
  const startDay = Number(m[2]);
  const endDay = Number(m[4]);
  const baseYear = m[5] ? Number(m[5]) : fallbackYear;

  if (!startMonth || !endMonth || !Number.isFinite(startDay) || !Number.isFinite(endDay)) {
    return null;
  }

  const startDate = toIsoDateFromParts(baseYear, startMonth, startDay);
  if (!startDate) return null;

  let endYear = baseYear;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) {
    endYear += 1;
  }
  const endDate = toIsoDateFromParts(endYear, endMonth, endDay);
  if (!endDate) return null;

  return { startDate, endDate };
}

function applyDescriptionDateRange(doc) {
  const text = `${doc.name || ''} ${doc.description || ''}`.toLowerCase().trim();
  if (!text) return;

  const cue = /\b(each day|daily|from|through|thru|runs?|running|week)\b/.test(text);
  if (!cue) return;

  const startYear = doc.startDate && /^\d{4}-\d{2}-\d{2}$/.test(doc.startDate)
    ? Number(doc.startDate.slice(0, 4))
    : new Date().getUTCFullYear();
  const range = extractMonthDayRange(text, startYear);
  if (!range) return;

  const hasSingleDayWindow = !doc.endDate || doc.endDate === doc.startDate;
  if (!hasSingleDayWindow) return;

  doc.startDate = range.startDate;
  doc.endDate = range.endDate;
}

/**
 * Generates a unique event document ID
 * @param {Object} eventData - The event data object
 * @param {number} rowIndex - The row index for guaranteed uniqueness
 * @returns {string} Document ID
 */
function generateEventId(eventData, rowIndex) {
  // Build unique ID from: eventId (if exists) + name + date + time
  // This handles the case where multiple events share the same Facebook post ID
  const parts = [
    eventData.eventId ? String(eventData.eventId).trim() : '',
    normalizeEstablishmentName(eventData.establishment),
    normalizeEstablishmentName(eventData.name),
    eventData.startDate || '',
    eventData.startTime || '',
  ].filter(Boolean);

  if (parts.length >= 2) {
    // Create a hash-like ID from the parts
    const combined = parts.join('_').replace(/\s+/g, '-').substring(0, 150);
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    // Use fb_ prefix if we have a Facebook eventId, otherwise evt_
    const prefix = eventData.eventId ? 'fb' : 'evt';
    return `${prefix}_${Math.abs(hash).toString(36)}`;
  }

  // Fallback: use row index for uniqueness
  return `evt_row_${rowIndex}`;
}

/**
 * Transforms a sheet row (as object) into a Firestore event document
 * @param {Object} rowData - Row data with column headers as keys
 * @param {number} rowIndex - Original row index for error reporting
 * @returns {Object} Transformed document or error object
 */
function transformRowToEventDocument(rowData, rowIndex) {
  const errors = [];
  const doc = {};

  // Map basic fields
  for (const [colName, fieldName] of Object.entries(COLUMN_TO_FIELD_MAP)) {
    const value = rowData[colName];
    if (value !== undefined && value !== null && value !== '') {
      if (NUMERIC_FIELDS.includes(fieldName)) {
        const parsed = parseNumeric(value);
        if (parsed !== null) {
          doc[fieldName] = parsed;
        }
      } else if (BOOLEAN_FIELDS.includes(fieldName)) {
        doc[fieldName] = parseYesNo(value);
      } else {
        doc[fieldName] = String(value).trim();
      }
    }
  }

  // Validation: must have a name
  if (!doc.name) {
    errors.push(`Row ${rowIndex}: Missing event name`);
  }

  // Validation: must have establishment for venue matching
  if (!doc.establishment) {
    errors.push(`Row ${rowIndex}: Missing establishment name`);
  }

  // Clean address
  if (doc.address) {
    doc.address = cleanAddress(doc.address);
  }

  // Parse and normalize dates
  if (doc.startDate) {
    doc.startDate = parseDate(doc.startDate);
  }
  if (doc.endDate) {
    doc.endDate = parseDate(doc.endDate);
  }

  // Parse and normalize times
  if (doc.startTime) {
    doc.startTime = parseTime(doc.startTime);
  }
  if (doc.endTime) {
    doc.endTime = parseTime(doc.endTime);
  }

  applyDescriptionDateRange(doc);

  // Parse UTC start date
  if (doc.utcStartDate) {
    try {
      const utcDate = new Date(doc.utcStartDate);
      if (!isNaN(utcDate.getTime())) {
        doc.utcStartDate = utcDate.toISOString();
      }
    } catch (e) {
      // Keep original value
    }
  }

  // Generate normalized establishment name for matching
  if (doc.establishment) {
    doc.establishmentNormalized = normalizeEstablishmentName(doc.establishment);
  }

  // Generate document ID (pass rowIndex for fallback uniqueness)
  const eventId = generateEventId(doc, rowIndex);

  // Validate coordinates if present
  if (doc.latitude !== undefined && doc.longitude !== undefined) {
    if (doc.latitude < -90 || doc.latitude > 90) {
      errors.push(`Row ${rowIndex}: Invalid latitude ${doc.latitude}`);
    }
    if (doc.longitude < -180 || doc.longitude > 180) {
      errors.push(`Row ${rowIndex}: Invalid longitude ${doc.longitude}`);
    }
  }

  return {
    eventId,
    document: doc,
    errors,
    isValid: errors.length === 0,
    establishment: doc.establishment,
    establishmentNormalized: doc.establishmentNormalized,
  };
}

/**
 * Converts a sheet row array to an object using header map
 * @param {any[]} row - Row data array
 * @param {string[]} headers - Header array
 * @returns {Object} Row as object with header keys
 */
function rowArrayToObject(row, headers) {
  const obj = {};
  headers.forEach((header, index) => {
    if (header && row[index] !== undefined) {
      obj[header.trim()] = row[index];
    }
  });
  return obj;
}

/**
 * Creates header index map from sheet headers
 * @param {string[]} headers - Array of column headers
 * @returns {Object} Map of column name to index
 */
function createHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    if (header) {
      map[header.trim()] = index;
      map[header.trim().toLowerCase()] = index;
    }
  });
  return map;
}

module.exports = {
  COLUMN_TO_FIELD_MAP,
  COLUMN_ORDER,
  NUMERIC_FIELDS,
  BOOLEAN_FIELDS,
  normalizeEstablishmentName,
  parseNumeric,
  parseYesNo,
  parseDate,
  parseTime,
  cleanAddress,
  generateEventId,
  transformRowToEventDocument,
  rowArrayToObject,
  createHeaderMap,
};
