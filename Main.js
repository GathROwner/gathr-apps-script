// main.gs

const FEATURE_FLAGS = {
  USE_GPT_FUNCTION_CALLING: PropertiesService.getScriptProperties().getProperty('USE_GPT_FUNCTION_CALLING') === 'true',
  USE_ENHANCED_DUPLICATE_DETECTION: PropertiesService.getScriptProperties().getProperty('USE_ENHANCED_DUPLICATE_DETECTION') === 'true',
  USE_OPTIMIZED_IMAGE_HANDLING: PropertiesService.getScriptProperties().getProperty('USE_OPTIMIZED_IMAGE_HANDLING') === 'true',
  USE_GPT_ASSISTED_DUPLICATE_DETECTION: PropertiesService.getScriptProperties().getProperty('USE_GPT_ASSISTED_DUPLICATE_DETECTION') === 'true'
};

// Functions to control feature flags
function enableGptFunctionCalling(enable = true) {
  PropertiesService.getScriptProperties().setProperty('USE_GPT_FUNCTION_CALLING', enable.toString());
  console.log(`GPT Function Calling ${enable ? 'enabled' : 'disabled'}`);
}

function checkFeatureFlags() {
  console.log('Current feature flag status:');
  console.log(`- GPT Function Calling: ${FEATURE_FLAGS.USE_GPT_FUNCTION_CALLING ? 'Enabled' : 'Disabled'}`);
  console.log(`- Enhanced Duplicate Detection: ${FEATURE_FLAGS.USE_ENHANCED_DUPLICATE_DETECTION ? 'Enabled' : 'Disabled'}`);
  console.log(`- Optimized Image Handling: ${FEATURE_FLAGS.USE_OPTIMIZED_IMAGE_HANDLING ? 'Enabled' : 'Disabled'}`);
  console.log(`- GPT Assisted Duplicate Detection: ${FEATURE_FLAGS.USE_GPT_ASSISTED_DUPLICATE_DETECTION ? 'Enabled' : 'Disabled'}`);
}

function enableEnhancedDuplicateDetection(enable = true) {
  PropertiesService.getScriptProperties().setProperty('USE_ENHANCED_DUPLICATE_DETECTION', enable.toString());
  console.log(`Enhanced Duplicate Detection ${enable ? 'enabled' : 'disabled'}`);
}

// Function to enable/disable GPT-assisted duplicate detection
function enableGptAssistedDuplicateDetection(enable = true) {
  PropertiesService.getScriptProperties().setProperty('USE_GPT_ASSISTED_DUPLICATE_DETECTION', enable.toString());
  console.log(`GPT-Assisted Duplicate Detection ${enable ? 'enabled' : 'disabled'}`);
}
function enableAllFeatures() {
  enableEnhancedDuplicateDetection(true);
  enableGptAssistedDuplicateDetection(true);
  checkFeatureFlags();  // This will confirm the flags are enabled
}
function enableTripAdvisorAPI() {
  toggleTripAdvisorAPI(true);
}

//Turns Trip Advisor off and on (True / False)
const ENABLE_TRIPADVISOR_API = PropertiesService.getScriptProperties().getProperty('ENABLE_TRIPADVISOR_API') === 'false';

function toggleTripAdvisorAPI(enable) {
  PropertiesService.getScriptProperties().setProperty('ENABLE_TRIPADVISOR_API', enable ? 'true' : 'false');
  console.log(`TripAdvisor API ${enable ? 'enabled' : 'disabled'}`);
}

function checkTripAdvisorAPIStatus() {
  const status = PropertiesService.getScriptProperties().getProperty('ENABLE_TRIPADVISOR_API') === 'true';
  console.log(`TripAdvisor API is currently ${status ? 'enabled' : 'disabled'}`);
  return status;
}

const columnMapping = {
  "sharedpost/media/0/url": "Sharedpost Media 0 Url",
  "sharedpost/media/0/thumbnail": "Sharedpost Media 0 Thumbnail",
  "sharedpost/media/0/image/height": "Sharedpost Media 0 Image Height",
  "sharedpost/media/0/image/width": "Sharedpost Media 0 Image Width",
  "sharedpost/media/0/owner/id": "Sharedpost Media 0 Owner Id",
  "sharedpost/media/0/thumbnail": "Sharedpost Media 0 Thumbnail"
  // Add more mappings as needed
};

/**
 * Maps columns based on the provided mapping.
 * @param {Array} row - The row data to map.
 * @param {Object} columnIndexMap - The column index map.
 * @param {Object} columnMapping - The column mapping configuration.
 * @return {Object} The mapped row data.
 */
function mapColumns(row, columnIndexMap, columnMapping) {
  return withErrorHandling(function() {
    const mappedRow = {};
    for (const [originalHeader, newHeader] of Object.entries(columnMapping)) {
      const index = columnIndexMap[originalHeader.toLowerCase()];
      if (index !== undefined) {
        mappedRow[newHeader] = row[index];
      }
    }
    return mappedRow;
  }, 'mapColumns')();
}

/**
 * Processes new datasets.
 */
function processNewDatasets() {
  return withErrorHandling(function() {
    CacheService.getScriptCache().remove('addressMap');
  
    const MAIN_SPREADSHEET_ID = '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78';
    const DESTINATION_SPREADSHEET_ID = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';
    const PROCESSED_SHEET_NAME = 'Processed Sheet IDs';
    const CONTACT_INFO_SHEET_NAME = 'Contact Info';

    logMessage(LogLevel.INFO, 'Starting processNewDatasets');
    console.log(`TripAdvisor API status: ${ENABLE_TRIPADVISOR_API ? 'enabled' : 'disabled'}`);
    
    const mainSpreadsheet = openSpreadsheetById(MAIN_SPREADSHEET_ID);
    const destinationSpreadsheet = openSpreadsheetById(DESTINATION_SPREADSHEET_ID);

    if (!mainSpreadsheet || !destinationSpreadsheet) {
      throw new Error('Error opening spreadsheets');
    }

    const processedIds = getProcessedSheetIds(mainSpreadsheet.getSheetByName(PROCESSED_SHEET_NAME));
    const openaiApiKey = getOpenAIApiKey();
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not found');
    }

    const addressMap = cachedFetch('addressMap', () => createAddressMap(destinationSpreadsheet.getSheetByName(CONTACT_INFO_SHEET_NAME)), 3600);
    
    const scriptProperties = PropertiesService.getScriptProperties();
    const currentFileId = scriptProperties.getProperty('CURRENT_FILE_ID');

    if (currentFileId) {
      // Resume processing the current file
      resumeProcessing(destinationSpreadsheet, addressMap, openaiApiKey, processedIds, MAIN_SPREADSHEET_ID);
    } else {
      // Start processing a new file
      const newFiles = findNewApifyDatasetFiles(processedIds);

      if (newFiles.length === 0) {
        logMessage(LogLevel.INFO, 'No new files to process');
        return;
      }

      logMessage(LogLevel.INFO, `Found ${newFiles.length} new APIFY Dataset files`);

      // Process only the first new file
      processFile(newFiles[0], destinationSpreadsheet, addressMap, openaiApiKey, processedIds, MAIN_SPREADSHEET_ID);
    }

    logMessage(LogLevel.INFO, 'Finished processNewDatasets');
  }, 'processNewDatasets')();
}

/**
 * Resumes batch processing from where it left off.
 */
function resumeProcessing() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const fileId = scriptProperties.getProperty('CURRENT_FILE_ID');
  const currentRowIndex = scriptProperties.getProperty('CURRENT_ROW_INDEX');
  
  console.log(`Resuming processing. Beginning at row ${currentRowIndex}`);

  if (fileId) {
    const file = DriveApp.getFileById(fileId);
    const DESTINATION_SPREADSHEET_ID = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';
    const MAIN_SPREADSHEET_ID = '1ppUWGHkpuSGfhsEK2Q9FpFSwdauEwRtHKuqLkIY8U78';
    
    // Clean up any existing triggers before starting
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'resumeProcessing') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    try {
      const destinationSpreadsheet = SpreadsheetApp.openById(DESTINATION_SPREADSHEET_ID);
      const mainSpreadsheet = SpreadsheetApp.openById(MAIN_SPREADSHEET_ID);
      
      // Refresh caches and get necessary data
      CacheService.getScriptCache().remove('addressMap');
      const addressMap = cachedFetch('addressMap', () => createAddressMap(destinationSpreadsheet.getSheetByName('Contact Info')), 3600);
      const openaiApiKey = getOpenAIApiKey();
      const processedIds = getProcessedSheetIds(mainSpreadsheet.getSheetByName('Processed Sheet IDs'));

      // Process the file
      processFile(file, destinationSpreadsheet, addressMap, openaiApiKey, processedIds, MAIN_SPREADSHEET_ID);
    } catch (error) {
      console.error('Error in resumeProcessing:', error);
      console.error('Error stack:', error.stack);
      
      // Clean up properties on error to prevent stuck state
      scriptProperties.deleteProperty('CURRENT_ROW_INDEX');
      scriptProperties.deleteProperty('CURRENT_FILE_ID');
      
      // Create error recovery trigger if needed
      ScriptApp.newTrigger('resumeProcessing')
        .timeBased()
        .after(5 * 60 * 1000)  // Try again in 5 minutes
        .create();
    }
  } else {
    console.log('No file in progress. Starting with a new file if available.');
    processNewDatasets();
  }
}

function buildProcessedIdsCache(destinationSpreadsheet) {
  const sheet = destinationSpreadsheet.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  console.log(`buildProcessedIdsCache : Reading IDs from column with header 'Event ID'`);

  // Get header row values
  const headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  // Find the index of 'Event ID' in the header row
  const idColumnIndex = headerRow.indexOf('Event ID') + 1; // +1 because sheet columns are 1-based

  if (idColumnIndex === 0) {
    throw new Error("buildProcessedIdsCache : Column 'Event ID' not found in header row");
  }

  // Check if there's data beyond the header row
  if (lastRow <= 1) {
    console.log('buildProcessedIdsCache : No data found in the sheet (only header row). Starting with an empty cache.');
    return new Set();
  }

  const idRange = sheet.getRange(2, idColumnIndex, lastRow - 1, 1);
  const ids = idRange.getValues().flat();

  //console.log(`buildProcessedIdsCache : Raw IDs from sheet: ${ids.join(', ')}`);

  const filteredIds = ids.filter(id => id !== '').map(String); // Convert to strings
  //console.log(`buildProcessedIdsCache : Filtered IDs: ${filteredIds.join(', ')}`);

  return new Set(filteredIds);
}


/**
 * Retrieves the OpenAI API key from script properties.
 * @return {string|null} The OpenAI API key or null if not found.
 */
function getOpenAIApiKey() {
  return withErrorHandling(function() {
    const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    if (!apiKey) {
      logMessage(LogLevel.ERROR, 'OpenAI API key not found in script properties');
    }
    return apiKey;
  }, 'getOpenAIApiKey')();
}



/**
 * Appends a new row to the destination sheet and performs:
 *   1) Contact Info lookup for an existing address
 *   2) (If still no address) Google Places lookup
 *   3) Builds and appends the row—including recurrence columns—
 *   4) Updates the Contact Info sheet with any new information
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet}          sheet       The destination sheet.
 * @param {Object}                                      data        The data to append, now including:
 *                                                                    - isRecurring {boolean}
 *                                                                    - recurringPattern {string}
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}    spreadsheet The parent spreadsheet object.
 */
/**
 * Appends a new row to the destination sheet and performs:
 *   1) Contact Info lookup for an existing address
 *   2) (If still no address) Google Places lookup
 *   3) Builds and appends the row—including recurrence columns— 
 *   4) Updates the Contact Info sheet with any new information
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet}          sheet       The destination sheet.
 * @param {Object}                                      data        The data to append, now including:
 *                                                                    - isRecurring {boolean|string}
 *                                                                    - recurringPattern {string}
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}    spreadsheet The parent spreadsheet object.
 */
function appendToDestinationSheet(sheet, data, spreadsheet) {
    ['establishment','additionalLocation','description','address','name'].forEach(function(k){
    if (data && data[k]) {
      data[k] = String(data[k])
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[\u2018\u2019\u02BC]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014\u2212]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
    }
  });

  return withErrorHandling(function() {
    console.log('Starting appendToDestinationSheet function');
    console.log('Input data:', JSON.stringify(data, null, 2));

    // 1) Check if the existing parsed address is acceptable
    if (!isAddressAcceptable(data.address)) {
      console.log('appendToDestinationSheet : Address not acceptable. Performing CONTACT INFO lookup first.');

      // --- Try existing Contact Info entry ---
      const contactInfoSheet = spreadsheet.getSheetByName('Contact Info');
      if (contactInfoSheet) {
        // 1) Prefer Stage 5.5 location if we have it (placeId or lat/lng)
        let usedStage55Location = false;
        if ((data.placeId && String(data.placeId).trim() !== '') || (data.latitude && data.longitude)) {
          console.log('appendToDestinationSheet : Skipping Contact Info; Stage 5.5 provided placeId/coords.');
          // If address is still empty, try to fetch from Place Details
          if ((!data.address || String(data.address).trim() === '') && data.placeId) {
            try {
              const det = fetchPlaceDetails(data.placeId);
              if (det && det.formatted_address) {
                data.address = det.formatted_address;
                console.log(`appendToDestinationSheet : Filled address from Place Details: "${data.address}"`);
              }
            } catch (e) {
              console.error('appendToDestinationSheet : Error fetching Place Details for address', e);
            }
          }
          usedStage55Location = isAddressAcceptable(data.address);
          if (usedStage55Location) {
            console.log('appendToDestinationSheet : Using Stage 5.5 location; NOT consulting Contact Info.');
          }
        }

        // 2) If we still don’t have an acceptable address, consult Contact Info (with a SAFE Facebook URL)
        if (!usedStage55Location) {
          console.log('appendToDestinationSheet : Address not acceptable. Performing CONTACT INFO lookup.');
          const safePageUrl =
            (typeof data.cleanedFacebookUrl === 'string' && data.cleanedFacebookUrl.indexOf('facebook.com/') !== -1)
              ? data.cleanedFacebookUrl
              : '';

          const existingEntry = findExistingContactInfoEntry(
            contactInfoSheet,
            data.establishment,
            safePageUrl
          );

          // Extra logging to see WHAT we matched in Contact Info
          try {
            const headersCI = contactInfoSheet.getDataRange().getValues()[0] || [];
            const pagenameIdxCI = headersCI.indexOf('Pagename');
            const pageurlIdxCI  = headersCI.indexOf('Pageurl');
            console.log(`appendToDestinationSheet : Contact Info lookup for establishment="${data.establishment}", pageUrl="${safePageUrl}" (pagenameIdx=${pagenameIdxCI}, pageurlIdx=${pageurlIdxCI})`);
            if (existingEntry) {
              const rv = existingEntry.data || [];
              const foundName = (pagenameIdxCI >= 0 ? rv[pagenameIdxCI] : '(unknown)');
              const foundUrl  = (pageurlIdxCI  >= 0 ? rv[pageurlIdxCI]  : '(unknown)');
              console.log(`appendToDestinationSheet : Contact Info MATCH rowIndex=${existingEntry.rowIndex} name="${foundName}" url="${foundUrl}"`);
            } else {
              console.log('appendToDestinationSheet : Contact Info lookup returned NO MATCH');
            }
          } catch (e) {
            console.error('appendToDestinationSheet : Error logging Contact Info match context', e);
          }

          if (existingEntry) {
            const rowValues    = existingEntry.data;
            const foundAddress = rowValues[4];   // "Address" column
            const foundLat     = rowValues[19];  // "Latitude" column
            const foundLng     = rowValues[21];  // "Longitude" column

            console.log(`appendToDestinationSheet : Contact Info candidate address="${foundAddress}" lat=${foundLat} lng=${foundLng}`);
            if (isAddressAcceptable(foundAddress)) {
              // Always trust CI for the canonical ADDRESS text, but prefer Places GEOMETRY if we already have it.
              data.address = foundAddress;

              const hasPlacesCoords =
                (typeof data.latitude  !== 'undefined' && data.latitude  !== null && String(data.latitude).trim()  !== '') &&
                (typeof data.longitude !== 'undefined' && data.longitude !== null && String(data.longitude).trim() !== '');

              if (!hasPlacesCoords) {
                // Only fall back to CI coords when we truly have no coords yet
                data.latitude  = foundLat;
                data.longitude = foundLng;
                console.log('appendToDestinationSheet : Using Contact Info coords (no Places coords present).');
              } else {
                console.log('appendToDestinationSheet : Keeping existing Places coords; will update Contact Info with these.');
              }
            } else {
              console.log('appendToDestinationSheet : Found Contact Info address is NOT acceptable. Will proceed to Places.');
            }
          }
        }

      } else {
        console.warn(
          'appendToDestinationSheet : Contact Info sheet not found; skipping Contact Info lookup.'
        );
      }

      // 2) If still not acceptable, perform Google Places lookup
      if (!isAddressAcceptable(data.address)) {
        console.log(
          'appendToDestinationSheet : Address still not acceptable. Performing Google Places lookup.'
        );
        console.log('appendToDestinationSheet : Preparing Google Places lookup…');
        const gpCacheKey = data.cleanedFacebookUrl || data.establishment;
        console.log(`appendToDestinationSheet : Google Places cache key = "${gpCacheKey}"`);
        let placeDetails = getCachedGooglePlacesResult(gpCacheKey);
        if (!placeDetails) {
          placeDetails = searchGooglePlaces(data.establishment, data.address);
          if (placeDetails) {
            cacheGooglePlacesResult(data.establishment, placeDetails);
          }
        } else {
          console.log(
            'appendToDestinationSheet : Using cached Google Places result'
          );
        }

        if (placeDetails) {
          data.address   = placeDetails.formatted_address;
          data.latitude  = placeDetails.geometry.location.lat;
          data.longitude = placeDetails.geometry.location.lng;
          console.log(
            'appendToDestinationSheet : Updated data with Google Places info:',
            JSON.stringify(data)
          );
        } else {
          console.log(
            'appendToDestinationSheet : Google Places lookup failed. Using original data.'
          );
        }
      }
    }

    // 3) Build the new row array—**including** the two recurrence columns

    const newRow = [
      data.isEvent,
      data.isFoodSpecial,

      // --- NEW: Recurrence metadata ---
      // only mark “Yes” if it’s literally true or the string "Yes"
      (data.isRecurring === true || data.isRecurring === 'Yes') ? 'Yes' : 'No',
      data.recurringPattern,

      data.category,
      data.name,
      data.description,
      data.establishment,
      data.address,
      formatDate(data.startDate),
      formatDate(data.endDate),
      formatTime(data.startTime),
      formatTime(data.endTime),
      data.ticketPrice,
      data.icon,
      data.image,
      data.cleanedFacebookUrl,
      data.sharedPostThumbnail,
      data.operatingHours,
      data.tripAdvisorRating,
      data.tripAdvisorReviews,
      data.operatingHoursSource,
      data.ticketLink,
      data.latitude,
      data.longitude,
      data.city,
      data.streetAddress,
      data.organizedBy,
      data.usersResponded,
      data.utcStartDate,
      data.ticketsBuyUrl,
      data.ticketProvider,
      data.id,
      data.relevantImageUrl,
      data.cachedImageUrl,
      data.likes,
      data.shares,
      data.comments,
      data.topReactionsCount
    ];

    console.log(
      'appendToDestinationSheet : New row to be appended:',
      newRow.join(', ')
    );
    sheet.appendRow(newRow);
    logMessage(
      LogLevel.INFO,
      `appendToDestinationSheet : Added new row to the destination sheet: ${newRow.join(
        ', '
      )}`
    );

    // 4) Update the Contact Info sheet with any new info
    updateContactInfoSheet(data, spreadsheet);

    console.log('appendToDestinationSheet : Finished appendToDestinationSheet function');
  }, 'appendToDestinationSheet')();
}


//function addCachedImageColumn(sheet) {
//  const lastColumn = sheet.getLastColumn();
//  const headerRange = sheet.getRange(1, lastColumn + 1);
//  const currentHeader = headerRange.getValue();
  
//  if (currentHeader !== "Cached Image") {
//    headerRange.setValue("Cached Image");
//    console.log("addCachedImageColumn : Added 'Cached Image' column to the sheet");
//  } else {
//    console.log("'addCachedImageColumn : Cached Image' column already exists");
//  }
//}

/**
 * Checks if the given address is acceptable (contains some meaningful information).
 * @param {string} address - The address to validate.
 * @return {boolean} True if the address is acceptable, false otherwise.
 */
function isAddressAcceptable(address) {
  console.log('Checking address acceptability:', address);
  
  if (!address || address.trim() === '' || address.toLowerCase() === 'n/a') {
    console.log('Address is empty or N/A');
    return false;
  }

  // Remove common filler words and normalize
  const normalizedAddress = address.toLowerCase()
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Check if the address contains any meaningful information
  const hasMeaningfulInfo = /[a-z0-9]/.test(normalizedAddress);

  // Check for presence of common address components
  const hasStreet = /\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr|circle|cir|court|ct|place|pl|boulevard|blvd)\b/i.test(address);
  const hasNumber = /\d+/.test(address);
  const hasCity = /[A-Z][a-z]+(\s+[A-Z][a-z]+)*/.test(address);
  const hasPostalCode = /[A-Z]\d[A-Z]\s*\d[A-Z]\d/.test(address); // Canadian postal code format


  const isAcceptable = hasMeaningfulInfo && hasNumber && hasStreet && hasCity;
  //const isAcceptable = hasMeaningfulInfo && (hasStreet || hasNumber || hasCity || hasPostalCode); // this is old code that use to be acceptable to only have meanignful info and one of the conditions || means or.
  console.log(`Address acceptability result: ${isAcceptable}`);
  console.log(`Meaningful info: ${hasMeaningfulInfo}, Street: ${hasStreet}, Number: ${hasNumber}, City: ${hasCity}, Postal Code: ${hasPostalCode}`);
  return isAcceptable;
}



/**
 * Updates the Contact Info sheet with new establishment data.
 * @param {Object} data - The establishment data.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - The parent spreadsheet object.
 */
function updateContactInfoSheet(data, spreadsheet) {
  console.log('updateContactInfoSheet : Starting updateContactInfoSheet function');
  console.log('updateContactInfoSheet : Data to be added:', JSON.stringify(data));

  try {
    console.log('updateContactInfoSheet : Using provided spreadsheet. Spreadsheet ID:', spreadsheet.getId());

    const contactInfoSheet = spreadsheet.getSheetByName('Contact Info');
    if (!contactInfoSheet) {
      console.error('updateContactInfoSheet : Contact Info sheet not found in spreadsheet');
      const sheetNames = spreadsheet.getSheets().map(sheet => sheet.getName());
      console.log('updateContactInfoSheet : Available sheets:', sheetNames);
      return;
    }

    console.log('updateContactInfoSheet : Contact Info sheet found. Sheet ID:', contactInfoSheet.getSheetId());

    // Check if the establishment already exists in the Contact Info sheet
    const existingEntry = findExistingContactInfoEntry(contactInfoSheet, data.establishment, data.cleanedFacebookUrl);
    if (existingEntry) {
      console.log('updateContactInfoSheet : Existing entry found:', JSON.stringify(existingEntry));
      updateExistingContactInfoEntry(contactInfoSheet, existingEntry, data);
      return;
    }

    console.log('updateContactInfoSheet : No existing entry found. Adding new entry.');

    const newRow = [
      '', // About_Me Text
      '', // About_Me Urls 0
      '', // About_Me Urls 1
      '', // Ad_Status
      data.address,
      '', // Alternativesocialmedia
      '', // Categories 0
      '', // Categories 1
      '', // Categories 2
      '', // Confirmed_Owner
      '', // Confirmed_Owner_Label
      '', // Creation_Date
      '', // Email
      '', // Facebookid
      data.cleanedFacebookUrl, // Facebookurl
      '', // Followers
      '', // Info 0
      '', // Info 1
      '', // Info 2
      data.latitude,
      '', // Likes
      data.longitude,
      '', // Messenger
      '', // Open_Hour_Details 0 Day_In_Week Text
      '', // Open_Hour_Details 0 Hours_Text Text
      '', // ... (other Open_Hour_Details fields)
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', //
      '', // Open_Hour_Setting
      '', // Page_Categories 0 Text
      '', // Page_Categories 0 Url
      '', // Pageadlibrary Id
      '', // Pageadlibrary Is_Business_Page_Active
      '', // Pageid
      data.establishment, // Pagename
      data.cleanedFacebookUrl, // Pageurl
      '', // Phone
      '', // Pricerange
      '', // Rating
      '', // Ratingcount
      '', // Ratingoverall
      '', // Services
      '', // Title
      '', // Website
      '', // Were_Here_Count
      '', // Wifi
      data.icon  // Profile picture URL (now a Cloud Storage URL)
    ];

    console.log('updateContactInfoSheet : Attempting to append row to Contact Info sheet');
    contactInfoSheet.appendRow(newRow);
    console.log('updateContactInfoSheet : Row appended successfully to Contact Info sheet');
  } catch (error) {
    console.error('updateContactInfoSheet : Error in updateContactInfoSheet:', error.message);
    console.error('updateContactInfoSheet : Error stack:', error.stack);
  }

  console.log('updateContactInfoSheet : Finished updateContactInfoSheet function');
}

function updateExistingContactInfoEntry(sheet, existingEntry, newData) {
  console.log('updateExistingContactInfoEntry : Updating existing Contact Info entry');
  console.log('updateExistingContactInfoEntry : Existing entry:', JSON.stringify(existingEntry));
  console.log('updateExistingContactInfoEntry : New data:', JSON.stringify(newData));

  const row = existingEntry.rowIndex;
  const data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Update fields if new data is available (map by headers to avoid index drift)
  try {
    const headersCI = sheet.getDataRange().getValues()[0] || [];
    const idx = {
      Address: headersCI.indexOf('Address'),
      Facebookurl: headersCI.indexOf('Facebookurl'),
      Pageurl: headersCI.indexOf('Pageurl'),
      Pagename: headersCI.indexOf('Pagename'),
      Latitude: headersCI.indexOf('Latitude'),
      Longitude: headersCI.indexOf('Longitude'),
      ProfileImage: headersCI.indexOf('Profile Image')
    };
    console.log('updateExistingContactInfoEntry : header indices used = ' + JSON.stringify(idx));

    if (newData.address && idx.Address >= 0) {
      data[idx.Address] = newData.address;
    }
    if (newData.cleanedFacebookUrl) {
      if (idx.Facebookurl >= 0) data[idx.Facebookurl] = newData.cleanedFacebookUrl;
      if (idx.Pageurl >= 0)     data[idx.Pageurl]     = newData.cleanedFacebookUrl;
    }
    if (idx.Latitude >= 0  && newData.latitude  !== undefined && newData.latitude  !== null && String(newData.latitude).trim()  !== '') {
      data[idx.Latitude] = newData.latitude;
    }
    if (idx.Longitude >= 0 && newData.longitude !== undefined && newData.longitude !== null && String(newData.longitude).trim() !== '') {
      data[idx.Longitude] = newData.longitude;
    }

    // Only set Pagename if it's empty (avoid overwriting correct, more-specific names)
    if (newData.establishment && idx.Pagename >= 0) {
      const cur = (data[idx.Pagename] || '').toString().trim();
      if (!cur) data[idx.Pagename] = newData.establishment;
    }

    if (newData.icon && idx.ProfileImage >= 0) {
      data[idx.ProfileImage] = newData.icon;
    }
  } catch (e) {
    console.error('updateExistingContactInfoEntry : header mapping error', e);
  }

  sheet.getRange(row, 1, 1, data.length).setValues([data]);

  console.log('updateExistingContactInfoEntry : Updated existing entry in Contact Info sheet');
}

/**
 * Finds an existing entry in the Contact Info sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The Contact Info sheet.
 * @param {string} establishmentName - The name of the establishment (used as a fallback).
 * @param {string} pageUrl - The Facebook Page URL of the establishment.
 * @return {Object|null} The existing entry if found, null otherwise.
 */

/**
 * Finds an existing entry in the Contact Info sheet.
 * First tries to match by Pagename, then falls back to Pageurl.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet         The Contact Info sheet.
 * @param {string} establishmentName  The display name of the venue.
 * @param {string} pageUrl            The Facebook Page URL of the venue.
 * @return {{rowIndex: number, data: Array}|null}  The matching row index (1-based) and data, or null if none found.
 */
function findExistingContactInfoEntry(sheet, establishmentName, pageUrl) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const pagenameIdx = headers.indexOf('Pagename');
  const pageurlIdx  = headers.indexOf('Pageurl');

  // 1) Try matching by establishment name first (exact + fuzzy)
  const targetNameRaw = establishmentName || '';
  const targetName = normalize(targetNameRaw);
  const targetBase = targetName
    .replace(/\s*\|.*$/, '')        // drop suffix after " | "
    .replace(/\s*\(.*?\)\s*$/, '')  // drop trailing "(...)"
    .trim();

  // 1a) Exact normalized match
  for (let i = 1; i < data.length; i++) {
    const rowName = normalize(data[i][pagenameIdx]);
    if (rowName === targetName) {
      // console.log('findExistingContactInfoEntry: exact match on Pagename');
      return {
        rowIndex: i + 1,
        data: data[i]
      };
    }
  }

  // 1b) Fuzzy match: compare base names and token overlap
  for (let i = 1; i < data.length; i++) {
    const rowNorm = normalize(data[i][pagenameIdx]);
    const rowBase = rowNorm
      .replace(/\s*\|.*$/, '')
      .replace(/\s*\(.*?\)\s*$/, '')
      .trim();

    // Guard: skip blank Pagename rows to avoid false positives on containment
    if (!rowBase) {
      continue;
    }

    // base-name equality
    if (rowBase === targetBase) {
      // console.log('findExistingContactInfoEntry: base-name equality match on Pagename');
      return {
        rowIndex: i + 1,
        data: data[i]
      };
    }

    // containment (handles "Name | City ST")
    if (rowBase && targetBase && (rowBase.indexOf(targetBase) !== -1 || targetBase.indexOf(rowBase) !== -1)) {
      // console.log('findExistingContactInfoEntry: containment match on Pagename');
      return {
        rowIndex: i + 1,
        data: data[i]
      };
    }

    // token-overlap Jaccard similarity
    const t1 = targetBase.split(/\s+/).filter(Boolean);
    const t2 = rowBase.split(/\s+/).filter(Boolean);
    if (t1.length && t2.length) {
      const set1 = new Set(t1);
      const set2 = new Set(t2);
      let inter = 0;
      set1.forEach(tok => { if (set2.has(tok)) inter++; });
      const union = new Set([...set1, ...set2]).size;
      const jaccard = inter / union;
      if ((inter >= 2 && jaccard >= 0.5) || jaccard >= 0.7) {
        // console.log(`findExistingContactInfoEntry: token match on Pagename (J=${jaccard.toFixed(2)})`);
        return {
          rowIndex: i + 1,
          data: data[i]
        };
      }
    }
  }

  // 2) Fallback: match by Facebook Page URL
  if (pageUrl) {
    for (let i = 1; i < data.length; i++) {
      if (data[i][pageurlIdx] === pageUrl) {
        return {
          rowIndex: i + 1,
          data: data[i]
        };
      }
    }
  }

  // No match found
  return null;
}

/**
 * Normalizes a string for comparison: trims and lowercases.
 * @param {string} str
 * @return {string}
 */
function normalize(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u0000-\u001F\u007F]/g, '') // strip control chars (incl. \u001F)
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly apostrophes → '
    .replace(/[\u201C\u201D]/g, '"')       // curly quotes → "
    .replace(/[\u2013\u2014\u2212]/g, '-') // en/em/minus → hyphen
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}



/**
 * Normalizes a time string for comparison.
 * @param {string} timeString - The time string to normalize.
 * @return {string} The normalized time string.
 */
function normalizeTime(timeString) {
  // Always return 24-hour "HH:MM"
  if (!timeString) return '00:00';

  // Handle Date objects directly
  if (timeString instanceof Date) {
    const h = timeString.getHours();
    const m = timeString.getMinutes();
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // Normalize to string
  const s = String(timeString).trim();

  // Try to standardize via formatTime to "HH:MM:SS AM/PM"
  const formatted = formatTime(s);
  const m12 = formatted && formatted.match(/(\d+):(\d+):\d+\s*(AM|PM)/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const period = m12[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // Fallback: parse 24h forms like "H:MM", "HH:MM", or "HH:MM:SS"
  const head = s.split(' ')[0]; // drop any stray AM/PM text
  const [hRaw, mRaw = '0'] = head.split(':');
  const h = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0));
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}


/**
 * Checks if two names are similar.
 * @param {string} name1 - The first name.
 * @param {string} name2 - The second name.
 * @return {boolean} True if the names are similar, false otherwise.
 */
function isSimilarName(name1, name2) {
  return withErrorHandling(function() {
    const words1 = name1.split(/\W+/);
    const words2 = name2.split(/\W+/);
    const commonWords = words1.filter(word => words2.includes(word));
    const similarityRatio = commonWords.length / Math.max(words1.length, words2.length);
    return similarityRatio >= 0.4;
  }, 'isSimilarName')();
}

function removeOutdatedEvents(destinationSpreadsheet) {
  const sheet = destinationSpreadsheet.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  const header = data[0];

  // Normalize header: trim and remove question marks
  const normalizedHeader = header.map(h => h.toString().trim().replace(/\?/g, ''));

  // Helper to find column index by name (case-insensitive)
  const getIndex = name => normalizedHeader.findIndex(h => h.toLowerCase() === name.toLowerCase());

  // Determine primary column indices
  const endDateIndex        = getIndex('End Date');
  const endTimeIndex        = getIndex('End Time');
  const startDateIndex      = getIndex('Start Date');
  let   isRecurringIndex    = getIndex('Is Recurring');
  let   recurringPatternIndex = getIndex('Recurring Pattern');
  const eventNameIndex      = getIndex('Event Name');
  const relevantImageUrlIdx = getIndex('RelevantImageUrlColumn');
  const iconIndex           = getIndex('Icon');

  // Fallbacks for recurring columns
  if (isRecurringIndex === -1) {
    isRecurringIndex = getIndex('Recurring');
  }
  if (recurringPatternIndex === -1) {
    recurringPatternIndex = getIndex('Recurrence Pattern');
  }

  // Verify required columns exist
  const missing = [];
  [
    ['End Date', endDateIndex],
    ['End Time', endTimeIndex],
    ['Start Date', startDateIndex],
    ['Recurring', isRecurringIndex],
    ['Recurrence Pattern', recurringPatternIndex],
    ['Event Name', eventNameIndex],
    ['RelevantImageUrlColumn', relevantImageUrlIdx],
    ['Icon', iconIndex]
  ].forEach(([name, idx]) => { if (idx === -1) missing.push(name); });

  if (missing.length) {
    console.log(`removeOutdatedEvents: Missing columns: ${missing.join(', ')}. Aborting.`);
    return;
  }

  const currentDate = new Date();
  console.log(`removeOutdatedEvents: Current datetime: ${currentDate.toLocaleString()}`);

  const allImages       = [];
  const outdatedMap     = new Map();
  const rowsToDelete    = [];

  // First pass: identify outdated events
  for (let i = 1; i < data.length; i++) {
    const rowNum            = i + 1;
    const row               = data[i];
    const eventName         = row[eventNameIndex];
    const endDateValue      = row[endDateIndex];
    const endTimeValue      = row[endTimeIndex];
    const startDateValue    = row[startDateIndex];
    const isRecurringCell   = row[isRecurringIndex];
    const recurringPattern  = row[recurringPatternIndex];
    const relevantImageUrl  = row[relevantImageUrlIdx];
    const iconUrl           = row[iconIndex];

    // Track images
    if (relevantImageUrl) allImages.push(relevantImageUrl);
    if (iconUrl)          allImages.push(iconUrl);

    // Recurring events: 30-day window
    const isRecurring = isRecurringCell && isRecurringCell.toString().toLowerCase() === 'yes';
    if (isRecurring) {
      let startObj;
      try {
        startObj = startDateValue instanceof Date ? new Date(startDateValue) : new Date(startDateValue);
      } catch (e) {
        console.log(`removeOutdatedEvents: Row ${rowNum} bad start date: ${e.message}`);
        continue;
      }
      const threshold = new Date(startObj);
      threshold.setDate(threshold.getDate() + 30);
      if (currentDate > threshold) {
        rowsToDelete.push(rowNum);
        [relevantImageUrl, iconUrl].forEach(url => {
          if (url) outdatedMap.set(url, (outdatedMap.get(url) || []).concat(eventName));
        });
        console.log(`removeOutdatedEvents: Recurring "${eventName}" older than 30 days. Marked.`);
      }
      continue;
    }

    // Non-recurring: parse end date & time with fallback logic
    let endDateObj = null;
    if (endDateValue) {
      endDateObj = endDateValue instanceof Date
        ? new Date(endDateValue)
        : new Date(endDateValue);
    }

    let hasTime = false;
    if (endDateObj && typeof endTimeValue === 'string') {
      const timeStr = endTimeValue.toUpperCase().trim();
      const isPM    = timeStr.includes('PM');
      const isAM    = timeStr.includes('AM');
      const parts   = timeStr.replace(/\s*[AP]M\s*$/, '').split(':');
      const h       = parseInt(parts[0], 10);
      const m       = parseInt(parts[1] || '0', 10);
      if (!isNaN(h)) {
        let hours = h + (isPM && h < 12 ? 12 : 0);
        if (isAM && h === 12) hours = 0;
        endDateObj.setHours(hours, m);
        hasTime = true;
      }
    } else if (endDateObj && endTimeValue instanceof Date) {
      endDateObj.setHours(endTimeValue.getHours(), endTimeValue.getMinutes());
      hasTime = true;
    }

    console.log(`removeOutdatedEvents: Row ${rowNum} parsed endDateObj: ${endDateObj}`);

    // Build date-only “today” at midnight
    const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

    if (endDateObj) {
      // Event date at midnight
      const eventDateOnly = new Date(
        endDateObj.getFullYear(),
        endDateObj.getMonth(),
        endDateObj.getDate()
      );

      if (hasTime) {
        if (endDateObj < currentDate) {
          rowsToDelete.push(rowNum);
          [relevantImageUrl, iconUrl].forEach(url => {
            if (url) outdatedMap.set(url, (outdatedMap.get(url) || []).concat(eventName));
          });
          console.log(`removeOutdatedEvents: "${eventName}" ended with time. Marked.`);
        }
      } else {
        if (eventDateOnly < today) {
          rowsToDelete.push(rowNum);
          [relevantImageUrl, iconUrl].forEach(url => {
            if (url) outdatedMap.set(url, (outdatedMap.get(url) || []).concat(eventName));
          });
          console.log(`removeOutdatedEvents: "${eventName}" ended (date only). Marked.`);
        } else {
          console.log(`removeOutdatedEvents: "${eventName}" is today/future (date only). Keeping.`);
        }
      }
    } else {
      console.log(`removeOutdatedEvents: Row ${rowNum} invalid end date; not deleting.`);
    }
  }

  console.log(`removeOutdatedEvents: Total to remove: ${rowsToDelete.length}`);

  // Initialize image tracking
  initializeImageTracking([...new Set(allImages)]);

  // Mark remaining images as relevant
  for (let i = 1; i < data.length; i++) {
    const rowNum = i + 1;
    if (rowsToDelete.includes(rowNum)) continue;
    const relevantImageUrl = data[i][relevantImageUrlIdx];
    const iconUrl          = data[i][iconIndex];
    if (relevantImageUrl) markImageAsRelevant(relevantImageUrl);
    if (iconUrl)          markImageAsRelevant(iconUrl);
  }

  // Delete rows in reverse order
  rowsToDelete.sort((a, b) => b - a).forEach(r => sheet.deleteRow(r));

  // Finalize image cleanup
  const { deleted, preserved } = finalizeImageProcessing();
  console.log(`removeOutdatedEvents: Deleted ${deleted.length}, Preserved ${preserved.length}`);

  // Summary at bottom
  console.log(`removeOutdatedEvents: Removed ${rowsToDelete.length} outdated event records.`);
}


function generateUniqueId(rowData) {
  // Create a string from the row data, excluding empty values
  const dataString = Object.values(rowData)
    .filter(value => value !== '')
    .join('|');
  
  // Create a hash of the data string
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString)
    .map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2))
    .join('');
  
  // Return the ID with a prefix
  return 'GEN-' + hash;
}


// ==========================================
// UPDATE APPLICATION LOGIC (main.gs)
// ==========================================

/**
 * Applies updates to an existing record based on GPT's recommendations.
 * Enhanced to handle social engagement metrics.
 * @param {Object} existingRecord - The existing record to update.
 * @param {Object} newRecord - The new record with potential updates.
 * @param {Object} updateRecommendations - GPT's update recommendations.
 * @param {Object} imageInfo - Information about both record's images.
 * @return {Object} The updated record and change summary.
 */
function applyRecommendedUpdates(existingRecord, newRecord, updateRecommendations, imageInfo) {
  console.log('applyRecommendedUpdates: Applying recommended updates');
  console.log('applyRecommendedUpdates: Update recommendations:', JSON.stringify(updateRecommendations, null, 2));

  console.log('applyRecommendedUpdates: Starting');
  
  // Log full objects for diagnosis
  console.log('applyRecommendedUpdates: Retrieved existingRecord object:', JSON.stringify(existingRecord, null, 2));
  console.log('applyRecommendedUpdates: Provided newRecord object:', JSON.stringify(newRecord, null, 2));
  
  // Specifically log the address fields
  console.log('applyRecommendedUpdates: existingRecord.address =', existingRecord.address);
  console.log('applyRecommendedUpdates: newRecord.address =', newRecord.address);
  
  // Define field name mappings (GPT field names to actual property names)
  const fieldNameMapping = {
    'icon': 'icon',
    'image': 'image',
    'relevantimageurl': 'relevantImageUrl',
    'relevantimageindex': 'relevantImageIndex',
    'relevantimageindex#': 'relevantImageIndex',
    'relevantimageurl#': 'relevantImageUrl',
    'relevantimageurlcolumn': 'relevantImageUrl',
    'starttime': 'startTime',
    'endtime': 'endTime',
    'startdate': 'startDate',
    'enddate': 'endDate',
    'likes': 'likes',
    'shares': 'shares',
    'comments': 'comments',
    'topreactionscount': 'topReactionsCount',
    'address': 'address'
  };
  
  // Create a copy of the existing record to update
  const updatedRecord = JSON.parse(JSON.stringify(existingRecord));
  
  // Track changes for logging
  const changes = [];
  
  // Process each field recommendation
  if (updateRecommendations.fields && Array.isArray(updateRecommendations.fields)) {
    console.log(`applyRecommendedUpdates: Processing ${updateRecommendations.fields.length} field recommendations`);
    
    updateRecommendations.fields.forEach(field => {
      const fieldName = field.fieldName;
      const action = field.updateAction;
      
      // Normalize field name (case-insensitive lookup)
      const normalizedFieldName = fieldName.toLowerCase().replace(/\s+/g, '').replace(/\?/g, '');
      const propertyName = fieldNameMapping[normalizedFieldName] || normalizedFieldName;
      
      console.log(`applyRecommendedUpdates: Processing field ${fieldName} (mapped to ${propertyName}), action: ${action}`);
      
      // If action is "use_new" and newRecord has this property
      if (action === 'use_new' && newRecord[propertyName] !== undefined) {
        // Special attention for time fields
        if (propertyName === 'startTime' || propertyName === 'endTime') {
          console.log(`applyRecommendedUpdates: Updating time field ${propertyName} from "${existingRecord[propertyName]}" to "${newRecord[propertyName]}"`);
        }
        
        // Record the change
        changes.push({
          field: fieldName,
          from: existingRecord[propertyName],
          to: newRecord[propertyName],
          action: 'replaced',
          reason: field.reason
        });
        
        // Apply the update
        updatedRecord[propertyName] = newRecord[propertyName];
        
        console.log(`applyRecommendedUpdates: Updated ${fieldName} to new value: ${newRecord[propertyName]}`);
      
      // If action is "merge"
      } else if (action === 'merge') {
        // *** NEW: If merging "address" but newRecord.address is empty, skip entirely
        if (propertyName === 'address' && (!newRecord.address || newRecord.address.trim() === '')) {
          console.log(`applyRecommendedUpdates: Skipping address merge because new address is empty`);
          return; // skip to next field recommendation
        }
        
        // Otherwise, merge normally
        const mergedValue = mergeFieldValues(existingRecord[propertyName], newRecord[propertyName], propertyName);
        
        // Record the change
        changes.push({
          field: fieldName,
          from: existingRecord[propertyName],
          to: mergedValue,
          action: 'merged',
          reason: field.reason
        });
        
        // Apply the update
        updatedRecord[propertyName] = mergedValue;
        
        console.log(`applyRecommendedUpdates: Merged ${fieldName} to: ${mergedValue}`);
      }
      // For 'keep_existing', do nothing
    });
  } else {
    console.log('applyRecommendedUpdates: Warning - No fields array in recommendations or it is not an array');
  }
  
  // Special handling for social engagement metrics - always use the highest values
  const socialMetrics = ['likes', 'shares', 'comments', 'topReactionsCount'];
  socialMetrics.forEach(metric => {
    // If this metric wasn't handled in the recommendations but exists in the new record
    if (!changes.some(change => change.field.toLowerCase() === metric) && 
        newRecord[metric] !== undefined && existingRecord[metric] !== undefined) {
      
      // Parse as numbers for comparison
      const existingValue = parseInt(existingRecord[metric], 10);
      const newValue = parseInt(newRecord[metric], 10);
      
      // If both are valid numbers and the new value is higher, update it
      if (!isNaN(existingValue) && !isNaN(newValue) && newValue > existingValue) {
        console.log(`applyRecommendedUpdates: Automatically updating social metric ${metric} from ${existingValue} to ${newValue}`);
        
        // Record the change
        changes.push({
          field: metric,
          from: existingRecord[metric],
          to: newRecord[metric],
          action: 'auto-updated',
          reason: 'Social engagement metrics are always updated to the highest values'
        });
        
        // Apply the update
        updatedRecord[metric] = newRecord[metric];
      }
    }
  });
  
  // Handle image preference based on imagePreference field
  if (imageInfo) {
    console.log(`applyRecommendedUpdates: Handling images with preference: ${updateRecommendations.imagePreference}`);
    console.log(`applyRecommendedUpdates: Existing image: ${imageInfo.existingImageUrl}, New image: ${imageInfo.newImageUrl}`);
    
    if (updateRecommendations.imagePreference === 'use_new' && imageInfo.newImageUrl) {
      // Record the change
      changes.push({
        field: 'relevantImageUrl',
        from: imageInfo.existingImageUrl,
        to: imageInfo.newImageUrl,
        action: 'replaced',
        reason: updateRecommendations.imageReason
      });
      
      // Apply the update
      updatedRecord.relevantImageUrl = imageInfo.newImageUrl;
      updatedRecord.cachedImageUrl = imageInfo.newImageUrl; // Also update cached image URL
      console.log(`applyRecommendedUpdates: Updated image to: ${imageInfo.newImageUrl}`);
    } 
    else if (updateRecommendations.imagePreference === 'keep_existing') {
      // IMPROVED: Check if existing image is empty before deciding to keep it
      if (!imageInfo.existingImageUrl || imageInfo.existingImageUrl === '') {
        if (imageInfo.newImageUrl) {
          console.log(`applyRecommendedUpdates: Existing image is empty, using new image instead`);
          
          changes.push({
            field: 'relevantImageUrl',
            from: imageInfo.existingImageUrl,
            to: imageInfo.newImageUrl,
            action: 'replaced (empty existing)',
            reason: "Using new image because existing image is empty"
          });
          
          updatedRecord.relevantImageUrl = imageInfo.newImageUrl;
          updatedRecord.cachedImageUrl = imageInfo.newImageUrl;
        }
      } else {
        console.log(`applyRecommendedUpdates: Keeping existing image: ${imageInfo.existingImageUrl}`);
      }
    }
    else if (updateRecommendations.imagePreference === 'merge') {
      // For merge, use new image if existing is empty or use the better quality one
      if (!imageInfo.existingImageUrl && imageInfo.newImageUrl) {
        // If existing image is empty but new one exists, use new one
        updatedRecord.relevantImageUrl = imageInfo.newImageUrl;
        updatedRecord.cachedImageUrl = imageInfo.newImageUrl;
        
        changes.push({
          field: 'relevantImageUrl',
          from: imageInfo.existingImageUrl,
          to: imageInfo.newImageUrl,
          action: 'merged (new image used)',
          reason: "Existing image was empty, new image was available"
        });
        
        console.log(`applyRecommendedUpdates: Merged images (empty existing): using new image: ${imageInfo.newImageUrl}`);
      } 
      // If we have profile or image URLs that need updating, do that too
      if (newRecord.icon && (!updatedRecord.icon || updatedRecord.icon === '')) {
        updatedRecord.icon = newRecord.icon;
        changes.push({
          field: 'icon',
          from: existingRecord.icon,
          to: newRecord.icon,
          action: 'merged (profile image)',
          reason: "Profile image updated"
        });
        console.log(`applyRecommendedUpdates: Updated profile icon to: ${newRecord.icon}`);
      }
      
      if (newRecord.image && (!updatedRecord.image || updatedRecord.image === '')) {
        updatedRecord.image = newRecord.image;
        changes.push({
          field: 'image',
          from: existingRecord.image,
          to: newRecord.image,
          action: 'merged (post image)',
          reason: "Post image updated"
        });
        console.log(`applyRecommendedUpdates: Updated post image to: ${newRecord.image}`);
      }
    }
  }
  
  // Add update metadata
  updatedRecord.lastUpdated = new Date().toISOString();
  updatedRecord.updateSource = 'automated_update';
  
  // Log the changes
  console.log(`applyRecommendedUpdates: Applied ${changes.length} updates to record`);
  console.log('applyRecommendedUpdates: Change summary:', JSON.stringify(changes, null, 2));
  
  return {
    updatedRecord: updatedRecord,
    changes: changes,
    changesMade: changes.length > 0
  };
}


/**
 * Merges values from two fields based on field type.
 * Enhanced to handle social engagement metrics.
 * @param {*} existingValue - The existing field value.
 * @param {*} newValue - The new field value.
 * @param {string} fieldName - The name of the field.
 * @return {*} The merged value.
 */
function mergeFieldValues(existingValue, newValue, fieldName) {
  // Handle null or undefined values
  if (!existingValue) return newValue;
  if (!newValue) return existingValue;
  
  // Convert both to strings for consistency
  const existingStr = String(existingValue);
  const newStr = String(newValue);
  
  // Field-specific merging logic
  switch (fieldName) {
    case 'description':
      // For descriptions, merge text without duplicating information
      if (existingStr.includes(newStr)) return existingStr;
      if (newStr.includes(existingStr)) return newStr;
      
      // Check for common substrings to avoid duplication
      const commonPhrases = findCommonPhrases(existingStr, newStr);
      if (commonPhrases.length > 0) {
        // Use the new value as the base and remove common phrases from the existing value
        let mergedText = newStr;
        let remainingText = existingStr;
        
        commonPhrases.forEach(phrase => {
          remainingText = remainingText.replace(phrase, '');
        });
        
        // Add non-duplicative content from the existing description
        const addedContent = remainingText.trim();
        if (addedContent) {
          mergedText += ' ' + addedContent;
        }
        
        return mergedText.trim();
      }
      
      // If no significant overlap, concatenate with a separator
      return `${newStr} ${existingStr}`;
      
    case 'ticketPrice':
      // For ticket price, prefer the most specific/detailed information
      if (newStr.length > existingStr.length * 1.5) return newStr;
      if (existingStr.length > newStr.length * 1.5) return existingStr;
      
      // If both mention "sold out", ensure that's preserved
      if (newStr.toLowerCase().includes('sold out')) return newStr;
      if (existingStr.toLowerCase().includes('sold out')) return existingStr;
      
      // If both have similar length, combine unique information
      return `${newStr} (also listed as: ${existingStr})`;
    
    // Special handling for social engagement metrics
    case 'likes':
    case 'shares':
    case 'comments':
    case 'topReactionsCount':
      // For social metrics, use the highest numeric value
      const existingNum = parseInt(existingStr, 10);
      const newNum = parseInt(newStr, 10);
      
      console.log(`mergeFieldValues: Comparing ${fieldName} values - Existing: ${existingNum}, New: ${newNum}`);
      
      // If both are valid numbers, return the higher value
      if (!isNaN(existingNum) && !isNaN(newNum)) {
        const result = Math.max(existingNum, newNum);
        console.log(`mergeFieldValues: Using higher value for ${fieldName}: ${result}`);
        return String(result);
      }
      
      // If only one is a valid number, return that one
      if (!isNaN(existingNum)) {
        console.log(`mergeFieldValues: Only existing value is valid for ${fieldName}: ${existingNum}`);
        return existingStr;
      }
      if (!isNaN(newNum)) {
        console.log(`mergeFieldValues: Only new value is valid for ${fieldName}: ${newNum}`);
        return newStr;
      }
      
      // If neither are valid numbers, prefer the new value
      console.log(`mergeFieldValues: Neither value is a valid number for ${fieldName}, using new value: ${newStr}`);
      return newStr;
      
    default:
      // For most fields, prefer the longer value as it likely contains more information
      return newStr.length >= existingStr.length ? newStr : existingStr;
  }
}

/**
 * Finds common phrases between two strings.
 * @param {string} str1 - The first string.
 * @param {string} str2 - The second string.
 * @return {Array} Array of common phrases.
 */
function findCommonPhrases(str1, str2) {
  const minLength = 15; // Minimum phrase length to consider
  const commonPhrases = [];
  
  // Normalize strings
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Simple sliding window approach
  for (let windowSize = minLength; windowSize <= s1.length; windowSize++) {
    for (let i = 0; i <= s1.length - windowSize; i++) {
      const phrase = s1.substring(i, i + windowSize);
      if (s2.includes(phrase)) {
        commonPhrases.push(phrase);
      }
    }
  }
  
  // Sort by length, longest first
  return commonPhrases.sort((a, b) => b.length - a.length);
}