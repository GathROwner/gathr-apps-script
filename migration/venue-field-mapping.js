/**
 * venue-field-mapping.js
 *
 * Defines the mapping between Contact Info sheet columns and Firestore venue document fields.
 * Also includes transformation functions for data normalization.
 */

/**
 * Column name to Firestore field mapping
 * Key: Exact column header from Contact Info sheet
 * Value: Firestore field name
 *
 * Actual columns from sheet (as of 2026-01-30):
 * About_Me Text, About_Me Urls 0, About_Me Urls 1, Ad_Status, Address, Alternativesocialmedia,
 * Categories 0, Categories 1, Categories 2, Confirmed_Owner, Confirmed_Owner_Label, Creation_Date,
 * Email, Facebookid, Facebookurl, Followers, Info 0, Info 1, Info 2, Latitude, Likes, Longitude,
 * Messenger, Open_Hour_Details 0-6 (Day_In_Week Text, Hours_Text Text), Open_Hour_Setting,
 * Page_Categories 0 Text, Page_Categories 0 Url, Pageadlibrary Id, Pageadlibrary Is_Business_Page_Active,
 * Pageid, Pagename, Pageurl, Phone, Pricerange, Rating, Ratingcount, Ratingoverall, Services, Title,
 * Website, Were_Here_Count, Instagramurl, InstagramFollowers, Place ID, Place Details (JSON),
 * Operating Hours (JSON), Hours Source, Profile Image, Hours Fetched At
 */
const COLUMN_TO_FIELD_MAP = {
  // Core identification fields
  'Pagename': 'pagename',
  'Pageurl': 'pageurl',
  'Facebookurl': 'facebookUrl',
  'Facebookid': 'facebookId',
  'Pageid': 'pageId',
  'Title': 'title',

  // Location fields
  'Address': 'address',
  'Latitude': 'latitude',
  'Longitude': 'longitude',

  // Contact fields
  'Phone': 'phone',
  'Email': 'email',
  'Website': 'website',
  'Messenger': 'messenger',

  // Category fields (will be combined into array)
  'Categories 0': 'category0',
  'Categories 1': 'category1',
  'Categories 2': 'category2',
  'Page_Categories 0 Text': 'pageCategory',

  // Engagement metrics
  'Rating': 'rating',
  'Ratingcount': 'ratingCount',
  'Ratingoverall': 'ratingOverall',
  'Pricerange': 'priceRange',
  'Followers': 'followers',
  'Likes': 'likes',
  'Were_Here_Count': 'checkIns',

  // Media fields
  'Profile Image': 'profileImage',

  // Business information - About
  'About_Me Text': 'about',
  'About_Me Urls 0': 'aboutUrl0',
  'About_Me Urls 1': 'aboutUrl1',
  'Services': 'services',

  // Hours - structured (individual day columns)
  'Open_Hour_Details 0 Day_In_Week Text': 'hours0Day',
  'Open_Hour_Details 0 Hours_Text Text': 'hours0Text',
  'Open_Hour_Details 1 Day_In_Week Text': 'hours1Day',
  'Open_Hour_Details 1 Hours_Text Text': 'hours1Text',
  'Open_Hour_Details 2 Day_In_Week Text': 'hours2Day',
  'Open_Hour_Details 2 Hours_Text Text': 'hours2Text',
  'Open_Hour_Details 3 Day_In_Week Text': 'hours3Day',
  'Open_Hour_Details 3 Hours_Text Text': 'hours3Text',
  'Open_Hour_Details 4 Day_In_Week Text': 'hours4Day',
  'Open_Hour_Details 4 Hours_Text Text': 'hours4Text',
  'Open_Hour_Details 5 Day_In_Week Text': 'hours5Day',
  'Open_Hour_Details 5 Hours_Text Text': 'hours5Text',
  'Open_Hour_Details 6 Day_In_Week Text': 'hours6Day',
  'Open_Hour_Details 6 Hours_Text Text': 'hours6Text',
  'Open_Hour_Setting': 'hoursSettingRaw',
  'Operating Hours (JSON)': 'operatingHoursJson',
  'Hours Source': 'hoursSource',
  'Hours Fetched At': 'hoursFetchedAt',

  // Google Places integration
  'Place ID': 'placeId',
  'Place Details (JSON)': 'placeDetailsJson',

  // Instagram integration
  'Instagramurl': 'instagramUrl',
  'InstagramFollowers': 'instagramFollowers',

  // Alternative social media
  'Alternativesocialmedia': 'alternativeSocialMedia',

  // Page metadata
  'Ad_Status': 'adStatus',
  'Confirmed_Owner': 'confirmedOwner',
  'Confirmed_Owner_Label': 'confirmedOwnerLabel',
  'Creation_Date': 'creationDate',
  'Pageadlibrary Id': 'pageAdLibraryId',
  'Pageadlibrary Is_Business_Page_Active': 'isBusinessPageActive',

  // Info fields (additional text)
  'Info 0': 'info0',
  'Info 1': 'info1',
  'Info 2': 'info2',
};

/**
 * Fields that should be parsed as numbers
 */
const NUMERIC_FIELDS = [
  'latitude',
  'longitude',
  'rating',
  'ratingCount',
  'ratingOverall',
  'followers',
  'likes',
  'checkIns',
  'instagramFollowers',
];

/**
 * Fields that should be parsed as booleans
 */
const BOOLEAN_FIELDS = [
  'confirmedOwner',
  'isBusinessPageActive',
];

/**
 * Normalizes a venue name for search/matching purposes
 * Removes punctuation, normalizes whitespace, converts to lowercase
 * @param {string} name - The venue name to normalize
 * @returns {string} Normalized name
 */
function normalizeVenueName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '')          // Remove punctuation
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .trim();
}

/**
 * Generates search tokens from a venue name
 * @param {string} name - The venue name
 * @returns {string[]} Array of search tokens
 */
function generateSearchTokens(name) {
  const normalized = normalizeVenueName(name);
  return normalized.split(' ').filter(token => token.length > 0);
}

/**
 * Generates a URL-friendly slug from a Facebook URL or venue name
 * @param {string} facebookUrl - The Facebook page URL
 * @param {string} name - Fallback venue name
 * @returns {string} URL slug
 */
function generateSlug(facebookUrl, name) {
  if (facebookUrl) {
    // Extract page name from URL: https://facebook.com/omalleys-irish-pub
    const match = facebookUrl.match(/facebook\.com\/([^\/\?]+)/i);
    if (match && match[1]) {
      // Clean the slug - remove anything after ? or #
      return match[1].split(/[?#]/)[0].toLowerCase();
    }
  }
  // Fallback to name-based slug
  return normalizeVenueName(name).replace(/\s+/g, '-');
}

/**
 * Extracts Facebook Page ID from URL or ID field
 * @param {string} facebookId - Direct Facebook ID
 * @param {string} facebookUrl - Facebook page URL
 * @param {string} pageUrl - Alternative page URL
 * @returns {string|null} Facebook page ID or null
 */
function extractFacebookId(facebookId, facebookUrl, pageUrl) {
  // Direct ID takes precedence
  if (facebookId && /^\d+$/.test(String(facebookId).trim())) {
    return String(facebookId).trim();
  }

  // Try to extract from URL
  const url = facebookUrl || pageUrl;
  if (url) {
    // Match numeric ID in URL
    const numericMatch = url.match(/facebook\.com\/(\d+)/i);
    if (numericMatch) {
      return numericMatch[1];
    }

    // Match profile.php?id=
    const profileMatch = url.match(/profile\.php\?id=(\d+)/i);
    if (profileMatch) {
      return profileMatch[1];
    }
  }

  return null;
}

/**
 * Generates a venue document ID
 * Priority: Facebook ID > URL slug > normalized name
 * @param {Object} rowData - The row data object
 * @returns {string} Document ID
 */
function generateVenueId(rowData) {
  // Try Facebook ID first
  const fbId = extractFacebookId(
    rowData.facebookId,
    rowData.facebookUrl,
    rowData.pageurl
  );
  if (fbId) {
    return `fb_${fbId}`;
  }

  // Try URL slug
  const slug = generateSlug(rowData.facebookUrl || rowData.pageurl, rowData.pagename);
  if (slug && slug.length > 2) {
    return `slug_${slug}`;
  }

  // Fallback to normalized name hash
  const normalized = normalizeVenueName(rowData.pagename || rowData.title);
  if (normalized) {
    // Simple hash function for deterministic IDs
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `name_${Math.abs(hash).toString(36)}`;
  }

  // Last resort: timestamp-based ID
  return `venue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Parses a boolean value from various string representations
 * @param {*} value - The value to parse
 * @returns {boolean|null} Parsed boolean or null
 */
function parseBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const str = String(value).trim().toLowerCase();
  if (['true', 'yes', '1', 'y'].includes(str)) {
    return true;
  }
  if (['false', 'no', '0', 'n'].includes(str)) {
    return false;
  }
  return null;
}

/**
 * Parses features string into array
 * @param {string} featuresStr - Comma-separated features string
 * @returns {string[]} Array of features
 */
function parseFeatures(featuresStr) {
  if (!featuresStr) return [];
  return String(featuresStr)
    .split(',')
    .map(f => f.trim())
    .filter(f => f.length > 0);
}

/**
 * Cleans an address by removing URLs that may have been appended
 * @param {string} address - The raw address
 * @returns {string} Cleaned address
 */
function cleanAddress(address) {
  if (!address) return '';
  // Remove any URLs that might be in the address field
  return String(address).split('https://')[0].trim();
}

/**
 * Transforms a sheet row (as object) into a Firestore document
 * @param {Object} rowData - Row data with column headers as keys
 * @param {number} rowIndex - Original row index for error reporting
 * @returns {Object} Transformed document or error object
 */
function transformRowToDocument(rowData, rowIndex) {
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
        const parsed = parseBoolean(value);
        if (parsed !== null) {
          doc[fieldName] = parsed;
        }
      } else {
        doc[fieldName] = String(value).trim();
      }
    }
  }

  // Use pagename, fall back to title
  if (!doc.pagename && doc.title) {
    doc.pagename = doc.title;
  }

  // Validation: must have a name
  if (!doc.pagename) {
    errors.push(`Row ${rowIndex}: Missing venue name (Pagename or Title)`);
  }

  // Clean address
  if (doc.address) {
    doc.address = cleanAddress(doc.address);
  }

  // Build categories array from individual category fields
  const categories = [];
  if (doc.category0) categories.push(doc.category0);
  if (doc.category1) categories.push(doc.category1);
  if (doc.category2) categories.push(doc.category2);
  if (doc.pageCategory && !categories.includes(doc.pageCategory)) {
    categories.push(doc.pageCategory);
  }
  if (categories.length > 0) {
    doc.categories = categories;
  }
  // Keep legacy fields for backward compatibility

  // Build structured hours from individual day columns
  const hoursStructured = {};
  for (let i = 0; i <= 6; i++) {
    const dayKey = `hours${i}Day`;
    const textKey = `hours${i}Text`;
    if (doc[dayKey] && doc[textKey]) {
      hoursStructured[doc[dayKey]] = doc[textKey];
    }
    // Clean up individual day fields from doc (keep them in hoursStructured only)
    delete doc[dayKey];
    delete doc[textKey];
  }
  if (Object.keys(hoursStructured).length > 0) {
    doc.hoursStructured = hoursStructured;
  }

  // Parse Operating Hours JSON if present
  if (doc.operatingHoursJson) {
    try {
      const parsed = JSON.parse(doc.operatingHoursJson);
      if (parsed && typeof parsed === 'object') {
        doc.operatingHoursParsed = parsed;
      }
    } catch (e) {
      // Keep raw JSON string if parsing fails
    }
  }

  // Parse Place Details JSON if present
  if (doc.placeDetailsJson) {
    try {
      const parsed = JSON.parse(doc.placeDetailsJson);
      if (parsed && typeof parsed === 'object') {
        doc.placeDetailsParsed = parsed;
      }
    } catch (e) {
      // Keep raw JSON string if parsing fails
    }
  }

  // Parse services if present (may be comma-separated)
  if (doc.services && typeof doc.services === 'string') {
    doc.services = parseFeatures(doc.services);
  }

  // Generate derived fields
  if (doc.pagename) {
    doc.pagenameNormalized = normalizeVenueName(doc.pagename);
    doc.pagenameSearchTokens = generateSearchTokens(doc.pagename);
  }

  // Generate slug
  doc.pagenameSlug = generateSlug(doc.facebookUrl || doc.pageurl, doc.pagename);

  // Generate document ID
  const venueId = generateVenueId(doc);

  // Validate coordinates
  if (doc.latitude !== undefined && doc.longitude !== undefined) {
    if (doc.latitude < -90 || doc.latitude > 90) {
      errors.push(`Row ${rowIndex}: Invalid latitude ${doc.latitude}`);
    }
    if (doc.longitude < -180 || doc.longitude > 180) {
      errors.push(`Row ${rowIndex}: Invalid longitude ${doc.longitude}`);
    }
  }

  return {
    venueId,
    document: doc,
    errors,
    isValid: errors.length === 0,
  };
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
      // Store both original and normalized versions
      map[header.trim()] = index;
      map[header.trim().toLowerCase()] = index;
    }
  });
  return map;
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

module.exports = {
  COLUMN_TO_FIELD_MAP,
  NUMERIC_FIELDS,
  BOOLEAN_FIELDS,
  normalizeVenueName,
  generateSearchTokens,
  generateSlug,
  extractFacebookId,
  generateVenueId,
  parseNumeric,
  parseBoolean,
  parseFeatures,
  cleanAddress,
  transformRowToDocument,
  createHeaderMap,
  rowArrayToObject,
};
