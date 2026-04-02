// additionalvenue.gs
// Functions for handling additional venues for events/specials

/**
 * Finds a venue in the Contact Info sheet based on name similarity.
 * Enhanced with advanced matching rules and bug fixes.
 * @param {string} venueName - The name of the venue to find.
 * @return {Object|null} Venue information if found, null otherwise.
 */
/**
 * Searches the “Contact Info” sheet for a matching venue based on name (and Facebook URL if available).
 * When normalizing names, any apostrophe (straight or curly) is removed (no space inserted).
 *
 * @param {string} venueName  The venue name to search (e.g. "Baba’s Lounge").
 * @return {Object|null}      An object containing the matched row’s name, Facebook URL, address, latitude, and longitude,
 *                            or null if no match is found.
 */
function findVenueInContactInfo(venueName) {
  console.log(`findVenueInContactInfo: Searching for venue: "${venueName}"`);

  // Get the Contact Info sheet by ID
  const spreadsheetId = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName('Contact Info');

  if (!sheet) {
    console.error('findVenueInContactInfo: Contact Info sheet not found');
    return null;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Find relevant column indices
  const nameIndex        = headers.indexOf('Pagename');
  const titleIndex       = headers.indexOf('Title');
  const pageUrlIndex     = headers.indexOf('Pageurl');
  const facebookUrlIndex = headers.indexOf('Facebookurl');
  const addressIndex     = headers.indexOf('Address');
  const latitudeIndex    = headers.indexOf('Latitude');
  const longitudeIndex   = headers.indexOf('Longitude');

  if ((nameIndex === -1 && titleIndex === -1) || (pageUrlIndex === -1 && facebookUrlIndex === -1)) {
    console.error('findVenueInContactInfo: Required columns (Pagename/Title or Pageurl/Facebookurl) not found');
    return null;
  }

  /**
   * Normalizes a venue name by:
   *  1. Removing any straight or curly apostrophes (no space inserted)
   *  2. Removing other punctuation characters (pipe, dash, comma, period, parentheses) by replacing with a space
   *  3. Converting to lowercase
   *  4. Collapsing multiple spaces into one and trimming
   */
  function normalizeVenueNameNoApostrophe(str) {
    if (!str) return '';
    // 1) Remove straight (') and curly (’) apostrophes entirely
    str = str.replace(/['’]/g, '');
    // 2) Replace other punctuation (| , . ( ) – – etc.) with a space
    str = str.replace(/[\|\–\,\.\(\)\–]/g, ' ');
    // 3) Convert to lowercase, collapse multiple spaces, and trim
    return str
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Normalize the search name (apostrophes removed, etc.)
  const normalizedSearchName = normalizeVenueNameNoApostrophe(venueName);
  const normalizedSearchCollapsed = normalizedSearchName.replace(/\s+/g, '');
  const normalizedSearchUrl = normalizeUrl_(venueName);
  console.log(`findVenueInContactInfo: Normalized venue name for comparison: "${normalizedSearchName}"`);

  function normalizeUrl_(u) {
    return String(u || '')
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/^m\./, '')
      .replace(/\/+$/, '');
  }

  function extractSlug_(u) {
    const cleaned = normalizeUrl_(u);
    if (!cleaned) return '';
    const parts = cleaned.split('/');
    return parts[parts.length - 1] || '';
  }

  // Split the normalized search name into words
  const searchWords = normalizedSearchName.split(' ');
  const primarySearchName   = searchWords[0] || '';
  const secondarySearchName = searchWords.length > 1 ? searchWords[1] : '';
  const tertiarySearchName  = searchWords.length > 2 ? searchWords[2] : '';

  console.log(`findVenueInContactInfo: Primary search word: "${primarySearchName}", Secondary: "${secondarySearchName}", Tertiary: "${tertiarySearchName}"`);

  // List of common words to de-emphasize
  const commonWords = [
    'city', 'the', 'downtown', 'uptown', 'new', 'old',
    'bar', 'restaurant', 'cafe', 'pub', 'lounge',
    'grill', 'eatery', 'kitchen', 'tavern', 'inn'
  ];

  // A shorter list of very common “food” words that should be nearly ignored
  const veryCommonWords = [
    'food', 'drink', 'menu', 'restaurant',
    'cafe', 'diner', 'coffee', 'beer', 'wine'
  ];

  const isCommonPrimaryWord    = commonWords.includes(primarySearchName);
  const isCommonSecondaryWord  = commonWords.includes(secondarySearchName);
  const isVeryCommonSecondary  = veryCommonWords.includes(secondarySearchName);

  if (isCommonPrimaryWord) {
   // console.log(`findVenueInContactInfo: Primary word "${primarySearchName}" is a common word, reducing its weight`);
  }
  if (isVeryCommonSecondary) {
   // console.log(`findVenueInContactInfo: Secondary word "${secondarySearchName}" is a VERY common word (almost ignored)`);
  } else if (isCommonSecondaryWord) {
   // console.log(`findVenueInContactInfo: Secondary word "${secondarySearchName}" is a common word, reducing its weight`);
  }

  let bestMatch      = null;
  let bestSimilarity = 0;
  const similarityThreshold = 0.60; // Minimum score to consider a match

  // Loop through each row in the Contact Info sheet (skipping header row)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = nameIndex !== -1 ? row[nameIndex] : '';
    const title = titleIndex !== -1 ? row[titleIndex] : '';
    const pageUrl = pageUrlIndex !== -1 ? row[pageUrlIndex] : '';
    const fbUrl = facebookUrlIndex !== -1 ? row[facebookUrlIndex] : '';
    const compareName = name || title;
    if (!compareName) continue;

    const normalizedName = normalizeVenueNameNoApostrophe(compareName);
    const normalizedNameCollapsed = normalizedName.replace(/\s+/g, '');

    const rowUrlNorm = normalizeUrl_(pageUrl || fbUrl);
    const rowSlug = extractSlug_(pageUrl || fbUrl);

    // Exact URL or slug match wins immediately
    if (normalizedSearchUrl && rowUrlNorm && normalizedSearchUrl === rowUrlNorm) {
      return {
        name:        compareName,
        facebookUrl: pageUrl || fbUrl,
        address:     row[addressIndex],
        latitude:    latitudeIndex !== -1 ? row[latitudeIndex] : '',
        longitude:   longitudeIndex !== -1 ? row[longitudeIndex] : ''
      };
    }

    if (normalizedSearchCollapsed && (normalizedSearchCollapsed === rowSlug || normalizedSearchCollapsed === normalizedNameCollapsed)) {
      return {
        name:        compareName,
        facebookUrl: pageUrl || fbUrl,
        address:     row[addressIndex],
        latitude:    latitudeIndex !== -1 ? row[latitudeIndex] : '',
        longitude:   longitudeIndex !== -1 ? row[longitudeIndex] : ''
      };
    }

    // Normalize the sheet’s venue name with the same apostrophe-stripping logic

    // Split the normalized sheet name into words
    const nameWords      = normalizedName.split(' ');
    const primaryName    = nameWords[0] || '';
    const secondaryName  = nameWords.length > 1 ? nameWords[1] : '';
    const tertiaryName   = nameWords.length > 2 ? nameWords[2] : '';

    // Debug output for comparison
    //console.log(`\nVenue comparison: "${normalizedName}" vs "${normalizedSearchName}"`);
    //console.log(`Primary words:   "${primaryName}" vs "${primarySearchName}"`);
    //console.log(`Secondary words: "${secondaryName}" vs "${secondarySearchName}"`);
    if (tertiaryName || tertiarySearchName) {
      //console.log(`Tertiary words:  "${tertiaryName}" vs "${tertiarySearchName}"`);
    }

    // 1) Base similarity (e.g., Levenshtein or other string‐similarity function)
    const baseSimilarity = calculateSimilarity(normalizedName, normalizedSearchName);

    // 2) Exact full match bonus
    const exactFullMatch      = normalizedName === normalizedSearchName;
    const exactFullMatchBonus = exactFullMatch ? 0.50 : 0;

    // 3) Primary word exact match bonus (reduce if it’s a very common primary word)
    const primaryNameMatch = primaryName === primarySearchName;
    const primaryNameBonus = primaryNameMatch
      ? (isCommonPrimaryWord ? 0.15 : 0.30)
      : 0;

    // 4) Secondary word exact match bonus (small if very common)
    const secondaryNameMatch = secondaryName && secondarySearchName &&
                               (secondaryName === secondarySearchName);
   //console.log(`Secondary word match: ${secondaryNameMatch ? 'YES' : 'NO'} (${secondaryName} === ${secondarySearchName})`);

    const secondaryNameBonus = secondaryNameMatch
      ? (isVeryCommonSecondary ? 0.01 :
         isCommonSecondaryWord ? 0.05 : 0.25)
      : 0;

    // 5) Substring bonus (if one is contained within the other)
    const isSubstring = normalizedName.includes(normalizedSearchName) ||
                        normalizedSearchName.includes(normalizedName);
    const substringBonus = isSubstring ? 0.15 : 0;

    // 6) Exact-word‐in‐list bonus for any distinctive word (capped at 0.30)
    let exactWordBonus    = 0;
    const exactWordMatches = [];
    for (const searchWord of searchWords) {
      // Skip very short or overly generic words
      if (
        searchWord.length <= 2 ||
        commonWords.includes(searchWord) ||
        veryCommonWords.includes(searchWord)
      ) continue;

      if (nameWords.includes(searchWord)) {
        exactWordBonus += 0.10;
        exactWordMatches.push(searchWord);
      }
    }
    exactWordBonus = Math.min(exactWordBonus, 0.30);

    // 7) Primary‐word‐similarity penalty if very different
    let primaryWordSimilarityScore = 0;
    if (!primaryNameMatch) {
      const primaryWordSimilarity = calculateSimilarity(primaryName, primarySearchName);
      if (primaryWordSimilarity < 0.30) {
        primaryWordSimilarityScore = -0.20;
      }
    }

    // 8) Secondary‐word‐similarity bonus if not exact match but highly similar
    let secondaryWordSimilarityBonus = 0;
    if (!secondaryNameMatch && secondaryName && secondarySearchName) {
      const secWordSimilarity = calculateSimilarity(secondaryName, secondarySearchName);
      if (secWordSimilarity > 0.60) {
        secondaryWordSimilarityBonus = secWordSimilarity * 0.20; // up to 0.20
      }
    }

    // 8.5) Secondary‐word‐mismatch penalty.  If the secondary words differ and are not even moderately similar,
    // apply a strong penalty.  This prevents false positives where only the primary word matches
    // (e.g. "Red Shores Charlottetown" vs "Red Island Cider").  When similarity < 0.50, subtract 0.75.
    let secondaryWordMismatchPenalty = 0;
    if (!secondaryNameMatch && secondaryName && secondarySearchName) {
      const secSimMismatch = calculateSimilarity(secondaryName, secondarySearchName);
      if (secSimMismatch < 0.50) {
        // Apply a stronger penalty when the secondary words are markedly different.
        secondaryWordMismatchPenalty = -0.75;
      }
    }

    // 9) Third‐word mismatch penalty (if first two words matched exactly)
    let thirdWordPenalty = 0;
    if (secondaryNameMatch && tertiaryName && tertiarySearchName) {
      if (tertiaryName !== tertiarySearchName) {
        thirdWordPenalty = -0.15;
        //console.log(`Third word mismatch penalty: "${tertiaryName}" ≠ "${tertiarySearchName}"`);
      }
    }

    // Compute final similarity score
    const finalScore = baseSimilarity
                     + exactFullMatchBonus
                     + primaryNameBonus
                     + secondaryNameBonus
                     + substringBonus
                     + exactWordBonus
                     + primaryWordSimilarityScore
                     + secondaryWordSimilarityBonus
                     + secondaryWordMismatchPenalty
                     + thirdWordPenalty;

    // Log detailed scoring if it’s potentially a match
    if (finalScore > 0.30 || primaryNameMatch) {
      //console.log(`Match analysis for "${name}" vs "${venueName}":`);
      //console.log(`  - Base similarity: ${baseSimilarity.toFixed(2)}`);
     // console.log(`  - Exact full match (${exactFullMatch ? 'YES' : 'NO'}): +${exactFullMatchBonus.toFixed(2)}`);
      //console.log(`  - Primary word match (${primaryNameMatch ? 'YES' : 'NO'}): +${primaryNameBonus.toFixed(2)}`);
     // console.log(`  - Secondary word match (${secondaryNameMatch ? 'YES' : 'NO'}): +${secondaryNameBonus.toFixed(2)}`);
     // console.log(`  - Substring bonus: +${substringBonus.toFixed(2)}`);
     // console.log(`  - Exact word bonus [${exactWordMatches.join(', ')}]: +${exactWordBonus.toFixed(2)}`);
      //console.log(`  - Primary word similarity penalty: ${primaryWordSimilarityScore.toFixed(2)}`);
      //console.log(`  - Secondary word similarity bonus: +${secondaryWordSimilarityBonus.toFixed(2)}`);
      //console.log(`  - Third word penalty: ${thirdWordPenalty.toFixed(2)}`);
      //console.log(`  - TOTAL SCORE: ${finalScore.toFixed(2)}`);
    }

    // If this is the best match so far above the threshold, store it
    if (finalScore >= similarityThreshold && finalScore > bestSimilarity) {
      bestSimilarity = finalScore;
      bestMatch = {
        name:        compareName,
        facebookUrl: (pageUrlIndex !== -1 ? row[pageUrlIndex] : '') || (facebookUrlIndex !== -1 ? row[facebookUrlIndex] : ''),
        address:     row[addressIndex],
        latitude:    latitudeIndex !== -1 ? row[latitudeIndex] : '',
        longitude:   longitudeIndex !== -1 ? row[longitudeIndex] : ''
      };
    }
  }

  if (bestMatch) {
    console.log(`findVenueInContactInfo: Found match: "${bestMatch.name}" with similarity ${bestSimilarity.toFixed(2)}`);
    return bestMatch;
  }

  console.log(`findVenueInContactInfo: No matching venue found for "${venueName}"`);
  return null;
}


/**
 * Records an unrecognized venue in the Unrecognized Venues sheet.
 * @param {string} venueName - The name of the unrecognized venue.
 * @param {string} aggregatorName - The name of the aggregator that posted about it.
 * @param {string} eventDetails - Optional additional event information.
 */
/**
 * Records an unrecognized venue in the Unrecognized Venues sheet.
 * Fixed version with improved error handling and debugging.
 * @param {string} venueName - The name of the unrecognized venue.
 * @param {string} aggregatorName - The name of the aggregator that posted about it.
 * @param {string} eventDetails - Optional additional event information.
 */
function recordUnrecognizedVenue(venueName, aggregatorName, eventDetails = '') {
  // ——————————————————————————————————————————————————————
  // Don’t log places already in Contact Info
  const existing = findVenueInContactInfo(venueName);
  if (existing) {
    console.log(
      `recordUnrecognizedVenue: "${venueName}" exists in Contact Info, skipping unrecognized log`
    );
    return;
  }
  // ——————————————————————————————————————————————————————

  console.log(
    `recordUnrecognizedVenue: Recording unrecognized venue: "${venueName}" from aggregator: "${aggregatorName}"`
  );
  
  try {
    // Find or create the Unrecognized Venues sheet
    const spreadsheetId = '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78'; // The main spreadsheet ID
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    
    if (!spreadsheet) {
      console.error('recordUnrecognizedVenue: Failed to open main spreadsheet');
      return;
    }
    
    console.log('recordUnrecognizedVenue: Successfully opened main spreadsheet');
    
    let sheet = spreadsheet.getSheetByName('Unrecognized Venues');
    
    // Create the sheet if it doesn't exist
    if (!sheet) {
      console.log('recordUnrecognizedVenue: Creating new Unrecognized Venues sheet');
      try {
        sheet = spreadsheet.insertSheet('Unrecognized Venues');
        
        // Add headers
        const headers = ["Venue Name","Aggregator","Date Found","Event Details","Status","Apify Run ID","Apify Dataset ID","Candidate Page Name","Candidate Page URL","Confidence","Website","Phone","Email","Address (scraped)","Latitude","Longitude","Last Checked","Attempt Count","Categories 1","Alt1 URL","Alt1 Conf","Alt2 URL","Alt2 Conf","Alt3 URL","Alt3 Conf"];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        
        // Format the sheet
        sheet.autoResizeColumns(1, headers.length); // APIFY INTEGRATION: auto-fit all staging columns
        sheet.getRange(1, 1, 1, headers.length).setBackground('#f3f3f3').setFontWeight('bold');
        
        console.log('recordUnrecognizedVenue: Successfully created and formatted Unrecognized Venues sheet');
      } catch (sheetCreateError) {
        console.error('recordUnrecognizedVenue: Error creating sheet:', sheetCreateError);
        return;
      }
    } else {
      console.log('recordUnrecognizedVenue: Found existing Unrecognized Venues sheet');
      ensureUnrecognizedVenuesHeaders_(sheet); // APIFY INTEGRATION: ensure extended staging columns
    }
    
    // Now that we have the sheet, check if this venue is already in it
    const data = sheet.getDataRange().getValues();
    let isExisting = false;
    
    for (let i = 1; i < data.length; i++) {
      const normalizedSheetVenue = normalizeVenueName(data[i][0]);
      const normalizedNewVenue = normalizeVenueName(venueName);
      
      if (normalizedSheetVenue === normalizedNewVenue) {
        console.log(`recordUnrecognizedVenue: Venue "${venueName}" already in Unrecognized Venues sheet, skipping`);
        isExisting = true;
        break;
      }
    }
    
    // Add the new venue if it doesn't exist
    if (!isExisting) {
      const newRow = [
        venueName,
        aggregatorName,
        new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
        eventDetails
      ];
      
      try {
        sheet.appendRow(newRow);
        console.log(`recordUnrecognizedVenue: Added venue "${venueName}" to Unrecognized Venues sheet`);
        
        // APIFY INTEGRATION (ANCHOR): initialize staging columns and launch Apify
        ensureUnrecognizedVenuesHeaders_(sheet);
        const rowIdx = sheet.getLastRow();
        const h = getHeaderMap_(sheet);
        
        // Initialize status columns
        const nowIso = new Date().toISOString();
        if (h['Status'])        sheet.getRange(rowIdx, h['Status']).setValue('NEW');
        if (h['Last Checked'])  sheet.getRange(rowIdx, h['Last Checked']).setValue(nowIso);
        if (h['Attempt Count']) sheet.getRange(rowIdx, h['Attempt Count']).setValue(0);
        
        // Kick off Apify search/scrape immediately (fire-and-forget)
        apifyLaunchSearch_(sheet, rowIdx, venueName, aggregatorName, eventDetails);
        
// Ensure the poller trigger exists (every 5 minutes) — TEMP DISABLED DURING DEBUG
// ensureApifyPollerTrigger_();

        
      } catch (appendError) {
        console.error('recordUnrecognizedVenue: Error appending row:', appendError);
      }
    }
  } catch (error) {
    console.error('recordUnrecognizedVenue: Error recording unrecognized venue:', error);
    console.error('recordUnrecognizedVenue: Error stack:', error.stack);
  }
}

/**
 * Normalizes a venue name for comparison.
 * @param {string} name - The venue name to normalize.
 * @return {string} The normalized venue name.
 */
function normalizeVenueName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()                      // Convert to lowercase
    .replace(/['']/g, '')               // Remove apostrophes
    .replace(/[^a-z0-9]/g, ' ')         // Replace non-alphanumeric with spaces
    .replace(/\s+/g, ' ')               // Normalize spaces
    .trim();                            // Remove leading/trailing spaces
}

/**
 * Cleans a venue name by removing common suffixes or additional information.
 * @param {string} name - The venue name to clean.
 * @return {string} The cleaned venue name.
 */
function cleanVenueName(name) {
  // Remove anything after a pipe character (common for location info)
  const cleanedName = name.split('|')[0].trim();
  
  // Remove common suffixes like "Est 1983"
  return cleanedName.replace(/\s+Est\s+\d{4}$/i, '').trim();
}

/**
 * Cleans an address from the Contact Info sheet.
 * @param {string} address - The raw address from Contact Info.
 * @return {string} The cleaned address.
 */
function cleanAddress(address) {
  if (!address) return '';
  
  // Remove any URLs that might be in the address field
  // The pattern is to split by "https://" and take only the first part
  return address.split('https://')[0].trim();
}

// === APIFY INTEGRATION (ANCHOR) — helpers and poller ===

/** Configuration for Apify actors. Update if you use different actors. */
const APIFY_FB_SEARCH_ACTOR_ID = 'apify/facebook-search-scraper'; // TODO: confirm actor ID in your Apify account
const APIFY_FB_PAGES_ACTOR_ID  = 'apify/facebook-pages-scraper';   // TODO: confirm actor ID in your Apify account

/** Reads a script property by key. */
function getScriptProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/** Ensure our extended staging headers exist on the 'Unrecognized Venues' sheet. */
function ensureUnrecognizedVenuesHeaders_(sheet) {
  const desired = [
    'Venue Name','Aggregator','Date Found','Event Details','Status','Apify Run ID','Apify Dataset ID',
    'Candidate Page Name','Candidate Page URL','Confidence','Website','Phone','Email','Address (scraped)','Latitude','Longitude',
    'Last Checked','Attempt Count','Categories 1','Alt1 URL','Alt1 Conf','Alt2 URL','Alt2 Conf','Alt3 URL','Alt3 Conf'
  ];
  const rng = sheet.getRange(1, 1, 1, sheet.getLastColumn() || desired.length);
  const existing = rng.getValues()[0].map(h => (h || '').toString().trim());
  if (!existing[0]) {
    sheet.getRange(1,1,1,desired.length).setValues([desired]);
    sheet.setFrozenRows(1);
    return;
  }
  const have = {};
  existing.forEach(h => have[h]=true);
  const finalHeaders = existing.slice();
  desired.forEach(h => { if (!have[h]) finalHeaders.push(h); });
  if (finalHeaders.length !== existing.length || finalHeaders.some((h,i)=>h!==existing[i])) {
    sheet.getRange(1,1,1,finalHeaders.length).setValues([finalHeaders]);
  }
}

/** Returns a header->columnIndex (1-based) map. */
function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => { map[(h||'').toString().trim()] = i+1; });
  return map;
}

/** Remove quotes and trim for search terms. */
function sanitizeSearchTerm_(str) {
  return String(str || '').replace(/["“”‘’']/g, '').trim();
}

/** Parse City + Province from address; allow tokens like "PE C1A 4A9"; city is token before province; no street fallback. */
function parseCityProvinceFromAddress_(address) {
  if (!address) return { city: '', province: '' };
  const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];

    // Province token like "PE" OR "PE C1A 4A9"
    const provMatch = t.match(/^(PE|NS|NB|QC|ON|MB|SK|AB|BC|NL|YT|NT|NU)\b/i);
    if (provMatch) {
      const province = provMatch[1].toUpperCase();
      const prev = i > 0 ? parts[i - 1] : '';
      const city = prev
        .replace(/\b(\d+|No\.?|Unit|Suite|Apt\.?)\b/gi, '')
        .replace(/\b(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Highway|Hwy)\b\.?/gi, '')
        .trim();
      if (city) return { city, province };
    }

    // Spelled-out province
    if (/Prince\s+Edward\s+Island/i.test(t)) {
      const prev = i > 0 ? parts[i - 1] : '';
      const city = prev
        .replace(/\b(\d+|No\.?|Unit|Suite|Apt\.?)\b/gi, '')
        .replace(/\b(St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Highway|Hwy)\b\.?/gi, '')
        .trim();
      if (city) return { city, province: 'PE' };
    }
  }

  // If we didn’t find a clean City + Province, return empty (don’t guess a street).
  return { city: '', province: '' };
}

/** Try to infer city/province from the aggregator's Contact Info address. */
// CITY-INFERENCE V2 (ANCHOR)
function inferCityFromAggregator_(aggregatorName) {
  try {
    if (!aggregatorName) return { city: '', province: '' };

    // 1) Best source: aggregator's Contact Info row address
    const hit = findVenueInContactInfo(aggregatorName);
    if (hit && hit.address) {
      const parsed = parseCityProvinceFromAddress_(hit.address);
      if (parsed.city && parsed.province) return parsed;
    }

    // 2) Fallbacks: lexical hints in aggregatorName itself (local/Atlantic pass)
    //    - expand common abbreviations (you mentioned CHTown)
    const raw = String(aggregatorName).toLowerCase();

    // simple abbreviation/alias normalization
    const alias = raw
      .replace(/\bch[\s\-]?town\b/gi, 'charlottetown')
      .replace(/\bch[\s\-]?town,?\s*pe\b/gi, 'charlottetown, pe');

    // known local city patterns → province
    const CITY_PROV = [
      { re: /\bcharlottetown\b/i, province: 'PE' },
      { re: /\bsummerside\b/i,   province: 'PE' },
      { re: /\bstratford\b/i,    province: 'PE' },
      { re: /\bcornwall\b/i,     province: 'PE' },
      { re: /\bmontague\b/i,     province: 'PE' },
      { re: /\bhalifax\b/i,      province: 'NS' },
      { re: /\btruro\b/i,        province: 'NS' },
      { re: /\bsydney\b/i,       province: 'NS' },
      { re: /\bmoncton\b/i,      province: 'NB' },
      { re: /\bsaint\s*john\b/i, province: 'NB' },
      { re: /\bfredericton\b/i,  province: 'NB' }
    ];

    for (const { re, province } of CITY_PROV) {
      const m = alias.match(re);
      if (m) {
        const city = m[0].replace(/\s+/g, ' ').trim();
        return { city, province };
      }
    }
  } catch (_) {}

  // 3) Unknown — don’t guess street-level; return empty to avoid bad filters
  return { city: '', province: '' };
}

/** Build categories and locations per your rules. */
// SEARCH-TERMS BUILDER V2 (ANCHOR)
function buildSearchCategoriesAndLocations_(venueName, aggregatorName) {
  const sanitized = sanitizeSearchTerm_(venueName);
  const cats = [sanitized];

  // infer a stable location
  const inferred = inferCityFromAggregator_(aggregatorName);
  const city = (inferred.city || '').trim();
  const province = (inferred.province || '').trim().toUpperCase();

  // Only include locations when BOTH city and province are known (keeps results tight)
  const locations = (city && province) ? [`${city}, ${province}`] : [];

  // Disambiguation: also add "<name> <city>" when we know the city (helps ranking upstream)
  if (city) cats.push(`${sanitized} ${city}`);

  // Legion/Library variants when city known
  if (city && /legion/i.test(sanitized)) {
    // prefer branch/official phrasing when present
    cats.push(`Royal Canadian Legion ${city}`);
    cats.push(`Royal Canadian Legion ${city} Branch`);
  }
  if (city && /library/i.test(sanitized)) {
    cats.push(`${city} Public Library`);
  }

  // unique & trimmed
  const uniq = Array.from(new Set(cats.map(s => s.trim()).filter(Boolean)));

  // Country hint: if province is Canadian, prefer Canada
  const CA_PROVS = new Set(['PE','NS','NB','QC','ON','MB','SK','AB','BC','NL','YT','NT','NU']);
  const country = CA_PROVS.has(province) ? 'CA' : '';

  // Return both for max compatibility with Apify actor inputs
  return {
    categories: uniq,
    searchTerms: uniq,
    locations,
    country
  };
}

/** Creates a single time-based trigger for the poller (every 5 minutes). */
function ensureApifyPollerTrigger_() {
  const func = 'pollApifyUnknownVenues';
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === func);
  if (triggers.length === 0) {
    ScriptApp.newTrigger(func).timeBased().everyMinutes(5).create();
    console.log('ensureApifyPollerTrigger_: created 5-minute poller trigger');
  }
}

/** Launches Apify Facebook Search, and if confident, also launches Pages Scraper. */
function apifyLaunchSearch_(sheet, rowIdx, venueName, aggregatorName, eventDetails) {
  const token = getScriptProp_('APIFY_TOKEN');
  if (!token) {
    console.warn('apifyLaunchSearch_: APIFY_TOKEN not set, leaving row in REVIEW.');
    const h = getHeaderMap_(sheet);
    if (h['Status']) sheet.getRange(rowIdx, h['Status']).setValue('REVIEW');
    return;
  }
  const h = getHeaderMap_(sheet);
  if (h['Status']) sheet.getRange(rowIdx, h['Status']).setValue('RUNNING');

  // Dedupe: if another active row is already tracking this venue, don’t start a new run
  const normalizedTarget = normalizeVenueName(venueName);
  for (let r = 2; r <= sheet.getLastRow(); r++) {
    if (r === rowIdx) continue;
    const rn = sheet.getRange(r, h['Venue Name']).getValue();
    const st = h['Status'] ? sheet.getRange(r, h['Status']).getValue() : '';
    if (normalizeVenueName(rn) === normalizedTarget && ['RUNNING','FOUND','REVIEW'].indexOf(String(st)) !== -1) {
      console.log('apifyLaunchSearch_: duplicate active venue detected, skipping launch for "' + venueName + '"');
      if (h['Status']) sheet.getRange(rowIdx, h['Status']).setValue('REVIEW');
      return;
    }
  }

  // Build search terms + inferred location (city, province) from the aggregator
  const built = buildSearchCategoriesAndLocations_(venueName, aggregatorName);
  const searchInput = {
    categories: built.categories,
    searchTerms: built.searchTerms,
    locations: built.locations,
    country: built.country || undefined,
    resultsLimit: 10
  };

  try { console.log('apifyLaunchSearch_: input=' + JSON.stringify(searchInput)); } catch(_) {}

  // Start the SEARCH actor only
  const run = apifyStartActorRun_(APIFY_FB_SEARCH_ACTOR_ID, token, searchInput);
  if (!run) {
    if (h['Status']) sheet.getRange(rowIdx, h['Status']).setValue('REVIEW');
    return;
  }
  if (h['Apify Run ID'])     sheet.getRange(rowIdx, h['Apify Run ID']).setValue(run.id);
  if (h['Apify Dataset ID']) sheet.getRange(rowIdx, h['Apify Dataset ID']).setValue(run.defaultDatasetId || run.data?.defaultDatasetId || '');
}

/** Starts an Apify actor run. Returns { id, defaultDatasetId } or null. */
function apifyStartActorRun_(actorId, token, inputObj) {
  try {
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}&waitForFinish=0`;
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      // IMPORTANT: send the input object itself (no { input: ... } wrapper)
      payload: JSON.stringify(inputObj),
      muteHttpExceptions: true
    });
    const code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      const body = JSON.parse(res.getContentText());
      const data = body.data || body;
      console.log(`apifyStartActorRun_: started ${actorId}, runId=${data.id}`);
      return { id: data.id, defaultDatasetId: data.defaultDatasetId };
    } else {
      console.error('apifyStartActorRun_: HTTP ' + code + ' — ' + res.getContentText());
      return null;
    }
  } catch (e) {
    console.error('apifyStartActorRun_: error', e);
    return null;
  }
}

/** Fetch run details by runId. */
/**** Fetch run details by runId. */
function apifyGetRun_(runId, token) {
  const url = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
    const body = JSON.parse(res.getContentText());
    return body.data || body;
  }
  console.error('apifyGetRun_: ' + res.getResponseCode() + ' — ' + res.getContentText());
  return null;
}

/** Abort (hard-stop) an Apify run by runId. */
function apifyAbortRun_(runId, token, statusMessage) {
  try {
    const url = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}/abort?token=${encodeURIComponent(token)}`;
    const payload = statusMessage ? { statusMessage: String(statusMessage) } : {};
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.warn('apifyAbortRun_: HTTP ' + code + ' — ' + res.getContentText());
    } else {
      console.log('apifyAbortRun_: aborted runId=' + runId + (statusMessage ? (' (' + statusMessage + ')') : ''));
    }
  } catch (e) {
    console.warn('apifyAbortRun_: error', e);
  }
}


/** Fetch dataset items (as array of objects). */
function apifyGetDatasetItems_(datasetId, token, limit) {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=1&format=json&limit=${limit||100}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
    return JSON.parse(res.getContentText());
  }
  console.error('apifyGetDatasetItems_: ' + res.getResponseCode() + ' — ' + res.getContentText());
  return [];
}

/** String similarity in [0,1] using normalized Levenshtein distance. */
function stringSimilarity_(a, b) {
  a = String(a||'').toLowerCase().trim();
  b = String(b||'').toLowerCase().trim();
  if (!a || !b) return 0;
  const al = a.length, bl = b.length;
  const d = [];
  for (let i=0;i<=al;i++){ d[i]=[i]; }
  for (let j=1;j<=bl;j++){ d[0][j]=j; }
  for (let i=1;i<=al;i++) {
    for (let j=1;j<=bl;j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+cost);
    }
  }
  const dist = d[al][bl];
  const maxLen = Math.max(al, bl);
  return maxLen ? (1 - dist/maxLen) : 0;
}

/** Picks top 3 page candidates from SEARCH results, writes them, and RETURNS the chosen top URL for downstream extraction. */
function processSearchResultsForRow_(sheet, rowIdx, venueName, datasetItems, token) {
  const h = getHeaderMap_(sheet);

  // Get aggregator name (for penalty) and inferred city (for bonus)
  const aggregatorName = h['Aggregator'] ? sheet.getRange(rowIdx, h['Aggregator']).getValue() : '';
  const inferred = inferCityFromAggregator_(aggregatorName); // { city, province }
  const city = (inferred && inferred.city) ? String(inferred.city) : '';
  const aggHit = aggregatorName ? findVenueInContactInfo(aggregatorName) : null;
  const aggregatorUrl = aggHit && (aggHit.facebookurl || aggHit.pageurl || aggHit.pageUrl || '');

  const STOP = new Set(['the','and','of','bar','pub','club','restaurant','lounge','cafe','café']);

  const candidates = [];
  datasetItems.forEach(item => {
    const url = item.facebookUrl || item.pageUrl || item.url || '';
    const name = item.title || item.pageName || item.name || '';
    const address = item.address || item.fullAddress || '';
    if (!url || !/facebook\.com\//i.test(url)) return;

    const cleanedTitle = String(name || '')
      .replace(/\s*\|\s*.+$/, '')
      .replace(/\s*\(\s*.*\s*\)\s*$/, '')
      .trim();
    const slug = String((url.split('/').filter(Boolean).pop() || '')).replace(/[-_]/g, ' ').trim();

    const baseA = stringSimilarity_(venueName, name || '');
    const baseB = stringSimilarity_(venueName, cleanedTitle);
    const baseC = stringSimilarity_(venueName, slug);

    let score = Math.max(baseA, baseB, baseC);

    const tokens = String(venueName).toLowerCase().replace(/["“”‘’']/g, '').split(/\s+/).filter(t => t && !STOP.has(t));
    const titleL = String(name || '').toLowerCase();
    const allTokensPresent = tokens.length ? tokens.every(t => titleL.includes(t)) : false;
    if (allTokensPresent) score += 0.20;

    if (city && String(address).toLowerCase().includes(city.toLowerCase())) score += 0.05;

    const catStr = (item.category || (Array.isArray(item.categories) ? item.categories.join(' ') : '') || '').toLowerCase();
    if (/(^|\s)(bar|pub|night\s*club|nightclub|restaurant|lounge|live\s*music\s*venue|venue)(\s|$)/i.test(catStr)) {
      score += 0.05;
    }

    const queryHasLegion = /legion/i.test(venueName);
    if (queryHasLegion) {
      const titleLc = String(name || '').toLowerCase();
      if (/\broyal\s+canadian\s+legion\b/i.test(titleLc) || /\bbranch\b/i.test(titleLc)) score += 0.10;
      if (/\bchoir\b/i.test(titleLc)) score -= 0.05;
    }

    if (aggregatorUrl && url.replace(/\/+$/,'') === String(aggregatorUrl).replace(/\/+$/,'')) score -= 0.10;

    if (score > 1) score = 1;
    if (score < 0) score = 0;

    candidates.push({ url, name, address, score });
  });

  candidates.sort((a,b)=>b.score-a.score);
  const top = candidates.slice(0,3);
  let best = top[0], alt1 = top[1], alt2 = top[2];

  try {
    console.log('processSearchResultsForRow_: raw search results for row ' + rowIdx + ': ' + JSON.stringify(datasetItems));
  } catch (err) {
    console.warn('processSearchResultsForRow_: logging error for raw search results', err);
  }

  const venueIsLegion = /legion/i.test(venueName);
  if (venueIsLegion && candidates.length) {
    const isBranchTitle = (nm) => /\broyal\s+canadian\s+legion\b/i.test(String(nm||'')) || /\bbranch\b/i.test(String(nm||''));
    const topScore = best ? best.score : 0;
    const branchIdx = candidates.findIndex(c => isBranchTitle(c.name));
    if (branchIdx >= 0) {
      const branchCand = candidates[branchIdx];
      if (branchCand && (branchCand.score >= (topScore - 0.25))) {
        best = branchCand;
        const others = candidates.filter((_, i) => i !== branchIdx).slice(0,2);
        alt1 = others[0] || null;
        alt2 = others[1] || null;
      }
    }
  }

  if (best) {
    if (h['Candidate Page Name']) sheet.getRange(rowIdx, h['Candidate Page Name']).setValue(best.name || '');
    if (h['Candidate Page URL'])  sheet.getRange(rowIdx, h['Candidate Page URL']).setValue(best.url || '');
    if (h['Confidence'])          sheet.getRange(rowIdx, h['Confidence']).setValue(Number(best.score).toFixed(3));
  }
  if (alt1) {
    if (h['Alt1 URL'])  sheet.getRange(rowIdx, h['Alt1 URL']).setValue(alt1.url || '');
    if (h['Alt1 Conf']) sheet.getRange(rowIdx, h['Alt1 Conf']).setValue(Number(alt1.score).toFixed(3));
  }
  if (alt2) {
    if (h['Alt2 URL'])  sheet.getRange(rowIdx, h['Alt2 URL']).setValue(alt2.url || '');
    if (h['Alt2 Conf']) sheet.getRange(rowIdx, h['Alt2 Conf']).setValue(Number(alt2.score).toFixed(3));
  }

  console.log('apifySearch select: top=' + (best ? (best.name + ' [' + best.url + '] score=' + best.score) : 'none')
    + ', alt1=' + (alt1 ? (alt1.name + ' score=' + alt1.score) : 'none')
    + ', alt2=' + (alt2 ? (alt2.name + ' score=' + alt2.score) : 'none')
    + (city ? (' city=' + city) : '')
    + (venueIsLegion ? ' (legion-tiebreak active)' : '')
  );

  // Return the chosen URL so the extractor can target the exact item
  return best ? { bestUrl: best.url || '', bestName: best.name || '', bestScore: best.score || 0 } : null;
}


/** Extracts page-like fields (website/phone/email/address/lat/lng/category) ONLY from the ranked/selected Search item. */
function processPagesResultsForRow_(sheet, rowIdx, datasetItems, targetUrl) {
  const h = getHeaderMap_(sheet);

  // normalize URLs for strict match (strip trailing slashes, lowercase)
  const norm = (u) => String(u || '').replace(/\/+$/,'').toLowerCase();

  let item = null;
  if (targetUrl) {
    const want = norm(targetUrl);
    item = (datasetItems || []).find(it => {
      const u = it.facebookUrl || it.pageUrl || it.url || '';
      return norm(u) === want;
    }) || null;
  }

  if (!item) {
    console.warn('processPagesResultsForRow_: selected URL not found in dataset; skipping extract for row ' + rowIdx);
    return; // do NOT fallback to first item
  }

  function pick(obj, key1, key2) {
    if (!obj) return '';
    if (key1 in obj && obj[key1]) return obj[key1];
    if (key2 && key2 in obj && obj[key2]) return obj[key2];
    return '';
  }

  // Common fields
  let pageInfo = item.pageInfo || item;

  // Prefer 'name', fallback to 'title'/'pageName'
  const name = pick(pageInfo, 'name') || item.title || item.pageName || '';

  // Prefer string website; otherwise first non-map in websites[]
  let website = pick(pageInfo, 'website');
  if (!website) {
    const websitesArr = (pageInfo && pageInfo.websites) || (item && item.websites);
    if (Array.isArray(websitesArr) && websitesArr.length > 0) {
      let preferred = '';
      for (let i = 0; i < websitesArr.length; i++) {
        const u = String(websitesArr[i] || '').toLowerCase();
        if (!/\bmaps\.google\.com\b/.test(u) && !/\bbing\.com\/maps\b/.test(u)) {
          preferred = websitesArr[i];
          break;
        }
      }
      website = preferred || websitesArr[0];
    }
  }

  const phone   = pick(pageInfo, 'phone');
  const email   = pick(pageInfo, 'email');
  const address = pick(pageInfo, 'address') || pick(pageInfo, 'fullAddress') || pick(item, 'address') || '';
  const lat     = pick(pageInfo, 'lat') || pick(pageInfo, 'latitude') || pick(item, 'lat') || pick(item, 'latitude');
  const lng     = pick(pageInfo, 'lng') || pick(pageInfo, 'longitude') || pick(item, 'lng') || pick(item, 'longitude');

  const category = (
    pick(pageInfo, 'category') ||
    (Array.isArray(pageInfo.categories) ? pageInfo.categories[0] : '') ||
    (Array.isArray(item.categories) ? item.categories[0] : '')
  );

  const url = pick(item, 'pageUrl') || pick(pageInfo, 'pageUrl') || pick(pageInfo, 'facebookUrl');

  if (name && h['Candidate Page Name']) sheet.getRange(rowIdx, h['Candidate Page Name']).setValue(name);
  if (url  && h['Candidate Page URL'])  sheet.getRange(rowIdx, h['Candidate Page URL']).setValue(url);

  if (website && h['Website'])           sheet.getRange(rowIdx, h['Website']).setValue(website);
  if (phone   && h['Phone'])             sheet.getRange(rowIdx, h['Phone']).setValue(phone);
  if (email   && h['Email'])             sheet.getRange(rowIdx, h['Email']).setValue(email);
  if (address && h['Address (scraped)']) sheet.getRange(rowIdx, h['Address (scraped)']).setValue(address);
  if (lat     && h['Latitude'])          sheet.getRange(rowIdx, h['Latitude']).setValue(lat);
  if (lng     && h['Longitude'])         sheet.getRange(rowIdx, h['Longitude']).setValue(lng);
  if (category&& h['Categories 1'])      sheet.getRange(rowIdx, h['Categories 1']).setValue(category);

  try {
    console.log('processPagesResultsForRow_: extracted fields for row ' + rowIdx
      + ' | name=' + name
      + ' | url=' + url
      + ' | website=' + website
      + ' | phone=' + phone
      + ' | email=' + email
      + ' | address=' + address
      + ' | lat=' + lat
      + ' | lng=' + lng
      + ' | category=' + category);
  } catch (err) {
    console.warn('processPagesResultsForRow_: logging error while reporting extracted fields', err);
  }

  // Only mark FOUND when we’ve successfully extracted from the ranked item
  if (h['Status']) sheet.getRange(rowIdx, h['Status']).setValue('FOUND');
}

/** Poller that advances NEW/RUNNING rows and writes results. */
function pollApifyUnknownVenues() {
  const token = getScriptProp_('APIFY_TOKEN');
  if (!token) {
    console.warn('pollApifyUnknownVenues: APIFY_TOKEN not set.');
    return;
  }

  const spreadsheetId = '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78';
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('Unrecognized Venues');
  if (!sheet) return;

  ensureUnrecognizedVenuesHeaders_(sheet);
  const h = getHeaderMap_(sheet);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowIdx = i + 1;
    const row = data[i];
    const status = h['Status'] ? row[h['Status'] - 1] : '';
    const venueName = row[h['Venue Name'] - 1];
    const runId = h['Apify Run ID'] ? row[h['Apify Run ID'] - 1] : '';
    const datasetId = h['Apify Dataset ID'] ? row[h['Apify Dataset ID'] - 1] : '';
    const attemptCount = h['Attempt Count'] ? Number(row[h['Attempt Count'] - 1] || 0) : 0;

    if (h['Last Checked']) sheet.getRange(rowIdx, h['Last Checked']).setValue(new Date().toISOString());

    if (!status || status === 'NEW') {
      apifyLaunchSearch_(sheet, rowIdx, venueName, row[h['Aggregator'] - 1], row[h['Event Details'] - 1]);
      continue;
    }

    if (status === 'RUNNING' && datasetId) {
      let items = apifyGetDatasetItems_(datasetId, token, 50);

      // EARLY-STOP: cap to first 10 results to keep ranking deterministic and cheap
      const MAX_SEARCH_RESULTS = 10;
      try {
        if (items && items.length > MAX_SEARCH_RESULTS) {
          apifyAbortRun_(runId, token, 'Auto-abort after first 10 results');
          items = items.slice(0, MAX_SEARCH_RESULTS);
          console.log('pollApifyUnknownVenues: aborted search run ' + runId + ' after ' + MAX_SEARCH_RESULTS + ' items.');
        }
      } catch (e) {
        console.warn('pollApifyUnknownVenues: abort failed', e);
      }

      // If we have any items, FIRST rank and capture the chosen URL, THEN extract fields from THAT exact item.
      if (items && items.length > 0) {
        const ranking = processSearchResultsForRow_(sheet, rowIdx, venueName, items, token); // writes Candidate/Alt columns; returns { bestUrl }
        const selectedUrl = ranking && ranking.bestUrl ? ranking.bestUrl : '';
        processPagesResultsForRow_(sheet, rowIdx, items, selectedUrl); // writes fields ONLY for the chosen item + FOUND
      } else {
        // If empty and terminal, mark REVIEW so a human can nudge it (no more hidden Pages runs)
        const run = runId ? apifyGetRun_(runId, token) : null;
        const isTerminal = run && /^(SUCCEEDED|FAILED|ABORTED|TIMED-OUT)$/i.test(String(run.status || ''));
        if (isTerminal) {
          if (h['Attempt Count']) sheet.getRange(rowIdx, h['Attempt Count']).setValue(attemptCount + 1);
          if (h['Status'])        sheet.getRange(rowIdx, h['Status']).setValue('REVIEW');
        }
      }
    }
  }
}

// ===== ADD-TO-CONTACT-INFO (MANUAL POST-POLL) =====
// ANCHOR: ADD_TO_CONTACT_INFO_BLOCK_START

/**
 * Manually add/update Contact Info rows for Unrecognized Venues flagged
 * with "Add to Contact Info" = Yes/True. Uses polled fields only.
 *
 * Sheets:
 *  - Unrecognized Venues: Processed Sheet IDs
 *      fileId: 1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78
 *      tab:    "Unrecognized Venues"
 *  - Contact Info: GPT Processed
 *      fileId: 1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ
 *      tab:    "Contact Info"
 *
 * Dedupe:
 *  1) Exact match on Facebook/Page URL (case/trim/ending-slash-insensitive)
 *  2) Fallback: normalized (Name + City) if URL missing
 *
 * Update rule:
 *  - Create if new
 *  - If exists, fill ONLY empty fields (no overwrites)
 *
 * After success:
 *  - Status := "ADDED_TO_CONTACTS"
 *  - Clear "Add to Contact Info" flag
 *  - Log one-liner summary
 */
function addSelectedUnrecognizedToContactInfo() {
  const UNREC_FILE_ID = '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78';
  const UNREC_SHEET_NAME = 'Unrecognized Venues';

  const CONTACT_FILE_ID = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';
  const CONTACT_SHEET_NAME = 'Contact Info';

  const unrecSheet = _getSheetByIdAndName_(UNREC_FILE_ID, UNREC_SHEET_NAME);
  const contactSheet = _getSheetByIdAndName_(CONTACT_FILE_ID, CONTACT_SHEET_NAME);

  const unrecHeaders = _getHeaders_(unrecSheet);
  const unrecH = _headerMap_(unrecHeaders);

  // Create the flag column if missing, for convenience
  const addFlagCol = _ensureHeader_(unrecSheet, unrecHeaders, unrecH, ['Add to Contact Info','Add_To_Contact_Info','Add to contacts']);

  const statusCol = _findCol_(unrecH, ['Status']);
  const nameCol   = _findCol_(unrecH, ['Candidate Page Name','Candidate Name','Title']);
  const urlCol    = _findCol_(unrecH, ['Candidate Page URL','Page URL','Facebook URL','Facebookurl','Pageurl']);
  const phoneCol  = _findCol_(unrecH, ['Phone']);
  const emailCol  = _findCol_(unrecH, ['Email']);
  const addrCol   = _findCol_(unrecH, ['Address (scraped)','Address']);
  const catCol    = _findCol_(unrecH, ['Categories 1','Category','Categories']);
  const latCol    = _findCol_(unrecH, ['Latitude']);
  const lngCol    = _findCol_(unrecH, ['Longitude']);

  const lastRow = unrecSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('[addSelectedUnrecognizedToContactInfo] No data rows found.');
    return;
  }

  const unrecValues = unrecSheet.getRange(2, 1, lastRow - 1, unrecHeaders.length).getValues();

  const contactHeaders = _getHeaders_(contactSheet);
  const contactH = _headerMap_(contactHeaders);

  // Common contact columns (many are optional; we only fill what exists)
  const cTitle      = _findCol_(contactH, ['Title']);
  const cFbUrl      = _findCol_(contactH, ['Facebookurl','Facebook URL']);
  const cPageUrl    = _findCol_(contactH, ['Pageurl','Page URL']);
  const cPhone      = _findCol_(contactH, ['Phone']);
  const cEmail      = _findCol_(contactH, ['Email']);
  const cAddress    = _findCol_(contactH, ['Address']);
  const cLat        = _findCol_(contactH, ['Latitude']);
  const cLng        = _findCol_(contactH, ['Longitude']);
  const cCat1       = _findCol_(contactH, ['Categories 1','Category']);
  const cFbId       = _findCol_(contactH, ['Facebookid','Facebook Id','FacebookID']);
  const cPageId     = _findCol_(contactH, ['Pageid','Page Id']);
  const cPageName   = _findCol_(contactH, ['Pagename','Page Name']);

  let added = 0, updated = 0, skipped = 0;
const restaurantsCandidates = new Set(); // collect FB URLs we touched this run

// RESTAURANTS.TXT sync (nested helpers)
// Requires: Advanced Google Services → Drive API enabled (Drive.Files.update).
// Set the Script Property "PEI_RESTAURANTS_GDRIVE_FILE_ID" to the Drive fileId
// of your mirrored "PEI Restaurants Full.txt".
function _appendRestaurantsUrlsIfMissing_(urls) {
  const funcName = '[restaurantsList]';
  try {
    Logger.log(`${funcName} Starting with ${urls ? urls.length : 0} URL(s) to check`);
    
    if (!urls || !urls.length) {
      Logger.log(`${funcName} SKIP: No URLs provided`);
      return;
    }
    
    const fileId = PropertiesService.getScriptProperties().getProperty('PEI_RESTAURANTS_GDRIVE_FILE_ID');
    Logger.log(`${funcName} Script property PEI_RESTAURANTS_GDRIVE_FILE_ID = "${fileId || '(not set)'}"`);
    
    if (!fileId) {
      Logger.log(`${funcName} SKIP: Script property "PEI_RESTAURANTS_GDRIVE_FILE_ID" not set.`);
      return;
    }

    Logger.log(`${funcName} Attempting to open file with ID: ${fileId}`);
    
    // Use DriveApp for plain text files
    const file = DriveApp.getFileById(fileId);
    Logger.log(`${funcName} Successfully opened file: ${file.getName()}, MIME type: ${file.getMimeType()}`);
    
    // Read current content as plain text
    const currentText = file.getBlob().getDataAsString('UTF-8');
    Logger.log(`${funcName} Current file has ${currentText.length} characters`);
    
    // Parse existing URLs
    const lines = currentText.split(/\r?\n/);
    const have = new Set(
      lines.map(s => s.trim()).filter(Boolean).map(_normalizeForList_)
    );
    Logger.log(`${funcName} Found ${have.size} existing URLs in file`);

    // Decide what needs to be appended
    const toAppend = [];
    for (const u of urls) {
      if (!u) continue;
      const norm = _normalizeForList_(u);
      if (!norm) continue;
      if (!have.has(norm)) {
        // Canonicalize for writing: strip /mentions and ensure https://
        let writeU = u.trim().replace(/\/mentions\/?$/i, '');
        if (!/^https?:\/\//i.test(writeU)) writeU = 'https://' + writeU.replace(/^\/+/, '');
        toAppend.push(writeU);
        have.add(norm);
        Logger.log(`${funcName} Will append new URL: ${writeU}`);
      } else {
        Logger.log(`${funcName} URL already exists (skipping): ${u}`);
      }
    }

    if (!toAppend.length) {
      Logger.log(`${funcName} No new URLs to append (all ${urls.length} URL(s) already exist).`);
      return;
    }

    Logger.log(`${funcName} Appending ${toAppend.length} new URL(s) to file...`);
    
    // Build new content with proper line endings
    let newContent = currentText;
    if (!newContent.endsWith('\n')) {
      newContent += '\n';
      Logger.log(`${funcName} Added trailing newline to content`);
    }
    newContent += toAppend.join('\n') + '\n';
    
    // ✅ CORRECTED: Write as plain string, not blob.getBytes()
    file.setContent(newContent);
    
    Logger.log(`${funcName} SUCCESS: Appended ${toAppend.length} URL(s) to PEI Restaurants list.`);
    Logger.log(`${funcName} File should now have ${lines.length + toAppend.length} total URLs`);
    
  } catch (err) {
    Logger.log(`${funcName} ERROR: ${err.toString()}`);
    Logger.log(`${funcName} Error name: ${err.name}`);
    Logger.log(`${funcName} Error message: ${err.message}`);
    if (err.stack) {
      Logger.log(`${funcName} Stack trace: ${err.stack}`);
    }
  }
}

// Normalization used only for comparison/deduping
function _normalizeForList_(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  s = s.replace(/[?#].*$/, '');         // drop query/hash
  s = s.replace(/\/mentions\/?$/i, ''); // drop /mentions
  s = s.replace(/^https?:\/\//i, '');   // drop protocol
  s = s.replace(/^www\./i, '');         // drop www
  s = s.replace(/\/+$/, '');            // drop trailing slash
  return s.toLowerCase();
}

  for (let r = 0; r < unrecValues.length; r++) {
    const rowIdx = r + 2;
    const row = unrecValues[r];

    const flagVal = _val(row, addFlagCol);
    if (!_truthyFlag_(flagVal)) continue; // not selected

    const candName = _val(row, nameCol);
    const candUrl  = _val(row, urlCol);
    const phone    = _val(row, phoneCol);
    const email    = _val(row, emailCol);
    const address  = _val(row, addrCol);
    const category = _val(row, catCol);
    const lat      = _val(row, latCol);
    const lng      = _val(row, lngCol);

    if (!candName || !candUrl) {
      Logger.log(`[addSelectedUnrecognizedToContactInfo] SKIP row ${rowIdx}: missing required fields (Name/URL).`);
      skipped++;
      continue;
    }

    const normUrl = _normUrl_(candUrl);
    const city = _extractCityFromAddress_(address);

    // Look for existing contact row
    const existingRow = _findContactRow_(contactSheet, contactHeaders, contactH, normUrl, candName, city);
    if (existingRow > 1) {
      // UPDATE: fill only empty cells
      const existingVals = contactSheet.getRange(existingRow, 1, 1, contactHeaders.length).getValues()[0];

      const patchPairs = [];
      _maybeSet_(existingVals, cTitle,    candName,                patchPairs);
      _maybeSet_(existingVals, cFbUrl,    candUrl,                 patchPairs);
      _maybeSet_(existingVals, cPageUrl,  candUrl,                 patchPairs);
      _maybeSet_(existingVals, cPhone,    _sanitizePhone_(phone),  patchPairs);
      _maybeSet_(existingVals, cEmail,    email,                   patchPairs);
      _maybeSet_(existingVals, cAddress,  address,                 patchPairs);
      _maybeSet_(existingVals, cLat,      lat,                     patchPairs);
      _maybeSet_(existingVals, cLng,      lng,                     patchPairs);
      _maybeSet_(existingVals, cCat1,     category,                patchPairs);
      // Optional IDs (only if present in Unrecognized in the future)
      // _maybeSet_(existingVals, cFbId,   fbId,    patchPairs);
      // _maybeSet_(existingVals, cPageId, pageId,  patchPairs);
      // _maybeSet_(existingVals, cPageName, pageName, patchPairs);

      if (patchPairs.length) {
        const writeRange = contactSheet.getRange(existingRow, 1, 1, contactHeaders.length);
        const newRowArr = existingVals.slice();
        for (const [colIndex1, val] of patchPairs) {
          newRowArr[colIndex1 - 1] = val;
        }
        writeRange.setValues([newRowArr]);
      }

      updated++;
      Logger.log(`[addSelectedUnrecognizedToContactInfo] UPDATED contact row ${existingRow} ← "${candName}" (${candUrl})`);
restaurantsCandidates.add(candUrl);
    } else {
      // CREATE: build a new row the same width as headers
      const newArr = new Array(contactHeaders.length).fill('');
      _safePut_(newArr, cTitle,   candName);
      _safePut_(newArr, cFbUrl,   candUrl);
      _safePut_(newArr, cPageUrl, candUrl);
      _safePut_(newArr, cPhone,   _sanitizePhone_(phone));
      _safePut_(newArr, cEmail,   email);
      _safePut_(newArr, cAddress, address);
      _safePut_(newArr, cLat,     lat);
      _safePut_(newArr, cLng,     lng);
      _safePut_(newArr, cCat1,    category);

      contactSheet.appendRow(newArr);
      const newRowIndex = contactSheet.getLastRow();
      added++;
      Logger.log(`[addSelectedUnrecognizedToContactInfo] ADDED contact row ${newRowIndex} ← "${candName}" (${candUrl})`);
restaurantsCandidates.add(candUrl);

    }

    // Stamp Unrecognized row: Status + clear flag
    const writePairs = [];
    if (statusCol) writePairs.push([rowIdx, statusCol, 'ADDED_TO_CONTACTS']);
    writePairs.push([rowIdx, addFlagCol, '']);
    for (const [rIdx, cIdx, val] of writePairs) {
      unrecSheet.getRange(rIdx, cIdx).setValue(val);
    }
  }

  _appendRestaurantsUrlsIfMissing_(Array.from(restaurantsCandidates));
Logger.log(`[addSelectedUnrecognizedToContactInfo] Done. Added=${added}, Updated=${updated}, Skipped=${skipped}`);
}

// ---------- Helpers (local to this block) ----------

function _getSheetByIdAndName_(fileId, sheetName) {
  const ss = SpreadsheetApp.openById(fileId);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error(`Sheet "${sheetName}" not found in ${fileId}`);
  return sh;
}

function _getHeaders_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function _headerMap_(headers) {
  const map = {};
  headers.forEach((h, idx) => {
    const k = _normHeader_(h);
    if (k) map[k] = idx + 1; // 1-based
  });
  return map;
}

function _normHeader_(h) {
  if (!h) return '';
  return String(h)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[()]/g, '')
    .replace(/[_-]/g, '')
    .replace(/\s/g, '');
}

function _findCol_(hmap, candidates) {
  if (!candidates) return 0;
  for (const c of candidates) {
    const key = _normHeader_(c);
    if (hmap[key]) return hmap[key];
  }
  return 0;
}

function _ensureHeader_(sheet, headers, hmap, candidates, defaultName) {
  const existing = _findCol_(hmap, candidates);
  if (existing) return existing;

  const name = defaultName || candidates[0];
  const newIndex = headers.length + 1;
  sheet.getRange(1, newIndex).setValue(name);
  // Update local view
  headers.push(name);
  hmap[_normHeader_(name)] = newIndex;
  return newIndex;
}

function _val(rowArr, col1) {
  if (!col1) return '';
  const v = rowArr[col1 - 1];
  return v == null ? '' : String(v).trim();
}

function _truthyFlag_(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === 'y' || s === '1';
}

/**
 * Ensures leading '+' phone numbers are treated as text in Sheets.
 * Google Sheets interprets '+...' as a number; a leading apostrophe forces text.
 */
function _sanitizePhone_(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.startsWith('+') ? ("'" + s) : s;
}

function _normUrl_(u) {
  if (!u) return '';
  try {
    const s = String(u).trim();
    const withoutSlash = s.endsWith('/') ? s.slice(0, -1) : s;
    return withoutSlash.toLowerCase();
  } catch (e) {
    return String(u).trim().toLowerCase();
  }
}

function _extractCityFromAddress_(address) {
  if (!address) return '';
  const parts = String(address).split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';

  // Try to find a token that looks like a city (alphabetic and not province/country/postal)
  const provinceTokens = new Set(['pe','pei','ns','nb','nl','qc','on','mb','sk','ab','bc','yT','nt','nu','prince edward island','nova scotia','new brunswick','canada']);
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i];
    const low = token.toLowerCase();
    const isPostal = /[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d/.test(token);
    if (!isPostal && !provinceTokens.has(low) && /^[a-z\s'.-]+$/i.test(token)) {
      // prefer token that contains "charlottetown" etc.
      if (/charlottetown/i.test(token)) return token.replace(/^downtown\s+/i, '').trim();
      // else keep first plausible
      return token.replace(/^downtown\s+/i, '').trim();
    }
  }

  // Fallback: second token if present
  if (parts.length >= 2) return parts[1].replace(/^downtown\s+/i, '').trim();
  return parts[0].replace(/^downtown\s+/i, '').trim();
}

function _maybeSet_(existingRow, col1, value, patchPairs) {
  if (!col1 || value == null || value === '') return;
  const curr = existingRow[col1 - 1];
  if (curr == null || String(curr).trim() === '') {
    patchPairs.push([col1, value]);
  }
}

function _safePut_(arr, col1, value) {
  if (!col1 || value == null) return;
  arr[col1 - 1] = value;
}

function _findContactRow_(sheet, headers, hmap, normUrl, name, city) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const fbUrlCol = _findCol_(hmap, ['Facebookurl','Facebook URL']);
  const pageUrlCol = _findCol_(hmap, ['Pageurl','Page URL']);
  const titleCol = _findCol_(hmap, ['Title']);
  const addrCol = _findCol_(hmap, ['Address']);

  // Pass 1: exact URL match
  if (normUrl) {
    const rng = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < rng.length; i++) {
      const row = rng[i];
      const fb = _normUrl_(row[fbUrlCol - 1] || '');
      const pg = _normUrl_(row[pageUrlCol - 1] || '');
      if ((fb && fb === normUrl) || (pg && pg === normUrl)) {
        return i + 2; // sheet row
      }
    }
  }

  // Pass 2: Name + City fallback
  if (name) {
    const targetName = String(name).trim().toLowerCase();
    const targetCity = String(city || '').trim().toLowerCase();
    const rng = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < rng.length; i++) {
      const row = rng[i];
      const n = String(row[titleCol - 1] || '').trim().toLowerCase();
      const addr = String(row[addrCol - 1] || '').trim();
      const city2 = _extractCityFromAddress_(addr).toLowerCase();
      if (n === targetName && city2 && targetCity && city2 === targetCity) {
        return i + 2;
      }
    }
  }

  return -1;
}

// ANCHOR: ADD_TO_CONTACT_INFO_BLOCK_END
