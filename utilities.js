// ==========================================
// FEATURE FLAGS ADDITIONS (main.gs)
// ==========================================

// Add to existing FEATURE_FLAGS object
// const FEATURE_FLAGS = {
//   USE_GPT_FUNCTION_CALLING: PropertiesService.getScriptProperties().getProperty('USE_GPT_FUNCTION_CALLING') === 'true',
//   USE_ENHANCED_DUPLICATE_DETECTION: PropertiesService.getScriptProperties().getProperty('USE_ENHANCED_DUPLICATE_DETECTION') === 'true',
//   USE_OPTIMIZED_IMAGE_HANDLING: PropertiesService.getScriptProperties().getProperty('USE_OPTIMIZED_IMAGE_HANDLING') === 'true'
// };

// Function to enable/disable enhanced duplicate detection
function enableEnhancedDuplicateDetection(enable = true) {
  PropertiesService.getScriptProperties().setProperty('USE_ENHANCED_DUPLICATE_DETECTION', enable.toString());
  console.log(`Enhanced Duplicate Detection ${enable ? 'enabled' : 'disabled'}`);
}

// ==========================================
// FIELD COMPARISON UTILITIES (utilities.gs)
// ==========================================

/**
 * Compares two records to detect meaningful changes.
 * @param {Object} existingData - The existing record data.
 * @param {Object} newData - The new record data.
 * @return {Object} An object containing detected changes and their significance.
 */
function detectMeaningfulChanges(existingData, newData) {
  console.log('detectMeaningfulChanges: Comparing records for meaningful changes');
  
  // Initialize result object
  const result = {
    hasChanges: false,
    fields: {},
    significantChanges: false
  };
  
  // Define field importance for determining significance
  const fieldImportance = {
    'startDate': 'critical',    // Date changes are critical
    'endDate': 'critical',      // Date changes are critical
    'startTime': 'critical',    // Time changes are critical
    'endTime': 'critical',      // Time changes are critical
    'ticketPrice': 'critical',  // Price changes are critical (e.g., sold out)
    'description': 'important', // Description changes are important but not critical
    'name': 'important',        // Name changes are important but not critical
    'address': 'important',     // Address changes are important but not critical
    'relevantImageUrl': 'minor' // Image changes are minor
  };

  // Check if either object is falsy
  if (!existingData || !newData) {
    console.log('detectMeaningfulChanges: One of the objects is null or undefined');
    return result;
  }

  // Get all unique keys from both objects
  const allKeys = [...new Set([...Object.keys(existingData), ...Object.keys(newData)])];
  
  // Compare each field
  for (const key of allKeys) {
    // Skip fields that shouldn't be compared
    if (key === 'id' || key === 'cachedImageUrl') continue;
    
    // Normalize values for comparison
    const existingValue = normalizeFieldForComparison(existingData[key], key);
    const newValue = normalizeFieldForComparison(newData[key], key);
    
    // Check if there's a difference in the field
    if (!areFieldValuesEqual(existingValue, newValue, key)) {
      // Record the difference
      result.fields[key] = {
        oldValue: existingValue,
        newValue: newValue,
        importance: fieldImportance[key] || 'minor'
      };
      
      // Mark that changes were found
      result.hasChanges = true;
      
      // Check if this is a significant change
      if ((fieldImportance[key] === 'critical') || 
          (fieldImportance[key] === 'important' && isSubstantialImprovement(newValue, existingValue, key))) {
        result.significantChanges = true;
      }
      
      console.log(`detectMeaningfulChanges: Found ${fieldImportance[key] || 'minor'} change in ${key}`);
      console.log(`  Old: ${existingValue}`);
      console.log(`  New: ${newValue}`);
    }
  }

  // Check for sold out status (special case)
  if (newData.ticketPrice && newData.ticketPrice.toLowerCase().includes('sold out') &&
      !(existingData.ticketPrice && existingData.ticketPrice.toLowerCase().includes('sold out'))) {
    result.fields['ticketPrice'] = {
      oldValue: existingData.ticketPrice,
      newValue: newData.ticketPrice,
      importance: 'critical'
    };
    result.hasChanges = true;
    result.significantChanges = true;
    console.log('detectMeaningfulChanges: Detected SOLD OUT status change - critical update');
  }
  
  console.log(`detectMeaningfulChanges: Analysis complete. Has changes: ${result.hasChanges}, Significant: ${result.significantChanges}`);
  return result;
}

/**
 * Normalizes field values for comparison.
 * @param {*} value - The field value to normalize.
 * @param {string} fieldName - The name of the field.
 * @return {*} The normalized value.
 */
function normalizeFieldForComparison(value, fieldName) {
  // Handle undefined or null values
  if (value === undefined || value === null) return '';
  
  // Convert to string for most fields
  const strValue = String(value).trim();
  
  // Apply field-specific normalization
  switch (fieldName) {
    case 'startDate':
    case 'endDate':
      return formatDate(strValue);
      
    case 'startTime':
    case 'endTime':
      return normalizeTime(formatTime(strValue));
      
    case 'description':
      return strValue.toLowerCase().replace(/\s+/g, ' ');
      
    case 'ticketPrice':
      return strValue.toLowerCase().replace(/\$/g, '').replace(/\s+/g, ' ');
      
    default:
      return strValue;
  }
}

/**
 * Compares two field values for equality.
 * @param {*} value1 - The first value.
 * @param {*} value2 - The second value.
 * @param {string} fieldName - The name of the field.
 * @return {boolean} True if the values are equal, false otherwise.
 */
function areFieldValuesEqual(value1, value2, fieldName) {
  // Special case for description - use similarity rather than exact match
  if (fieldName === 'description') {
    return calculateSimilarity(value1, value2) > 0.9;
  }
  
  // For other fields, do direct comparison
  return value1 === value2;
}

/**
 * Determines if a new value is a substantial improvement over an existing one.
 * @param {string} newValue - The new field value.
 * @param {string} existingValue - The existing field value.
 * @param {string} fieldName - The name of the field.
 * @return {boolean} True if the new value is a substantial improvement.
 */
function isSubstantialImprovement(newValue, existingValue, fieldName) {
  // Empty new values are never improvements
  if (!newValue) return false;
  
  // New values for previously empty fields are always improvements
  if (!existingValue) return true;
  
  // For descriptions, compare length and content richness
  if (fieldName === 'description') {
    // If the new description is significantly longer, it's likely more detailed
    if (newValue.length > existingValue.length * 1.5) return true;
    
    // Check for indicators of richer content
    const richContentIndicators = [
      'performer', 'lineup', 'featuring', 'presented by', 'hosted by',
      'tickets', 'admission', 'price', 'cost',
      'special guest', 'headliner'
    ];
    
    for (const indicator of richContentIndicators) {
      if (newValue.toLowerCase().includes(indicator) && 
          !existingValue.toLowerCase().includes(indicator)) {
        return true;
      }
    }
  }
  
  // For tickets, check for more specific pricing information
  if (fieldName === 'ticketPrice') {
    // If new price includes specific amount but old one doesn't
    if (/\d+/.test(newValue) && !/\d+/.test(existingValue)) return true;
    
    // If new price has more specific information (e.g., "VIP: $50, GA: $25" vs "$25")
    if (newValue.includes(':') && !existingValue.includes(':')) return true;
  }
  
  // For images, we'll handle this separately through the image comparison function
  
  return false;
}

// ==========================================
// RECORD RETRIEVAL FUNCTIONS (utilities.gs)
// ==========================================

/**
 * Retrieves an existing record either from the destination sheet or current run entries.
 * @param {Object} matchInfo - Information about the matched duplicate.
 * @param {string} matchInfo.source - The source of the match ('sheet' or 'currentRun').
 * @param {number|Object} matchInfo.reference - For 'sheet', the row index; for 'currentRun', the entry object or index.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The destination sheet.
 * @param {Array} currentRunEntries - The current run entries array.
 * @return {Object} The retrieved record.
 */
function retrieveExistingRecord(matchInfo, destinationSheet, currentRunEntries) {
  console.log(`retrieveExistingRecord: Retrieving record from ${matchInfo.source}`);
  
  if (matchInfo.source === 'sheet') {
    return retrieveRecordFromSheet(matchInfo.reference, destinationSheet);
  } else if (matchInfo.source === 'currentRun') {
    return retrieveRecordFromCurrentRun(matchInfo.reference, currentRunEntries);
  } else {
    console.error(`retrieveExistingRecord: Unknown source: ${matchInfo.source}`);
    return null;
  }
}

/**
 * Retrieves a record from the destination sheet by row index.
 * @param {number} rowIndex - The row index in the sheet (1-based).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet containing the record.
 * @return {Object} The retrieved record.
 */
function retrieveRecordFromSheet(rowIndex, sheet) {
  try {
    console.log(`retrieveRecordFromSheet: Retrieving record from row ${rowIndex}`);
    
    // Get the header row to determine field positions
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Get the data row
    const dataRow = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Create object mapping header names to data values
    const record = {};
    headers.forEach((header, index) => {
      record[header] = dataRow[index];
    });
    
    console.log(`retrieveRecordFromSheet: Successfully retrieved record from row ${rowIndex}`);
    return record;
  } catch (error) {
    console.error(`retrieveRecordFromSheet: Error retrieving record from row ${rowIndex}: ${error}`);
    return null;
  }
}

/**
 * Retrieves a record from the current run entries.
 * @param {number|Object} reference - The index in the array or the entry object itself.
 * @param {Array} currentRunEntries - The current run entries array.
 * @return {Object} The retrieved record.
 */
function retrieveRecordFromCurrentRun(reference, currentRunEntries) {
  try {
    // If reference is already an object, just return it
    if (typeof reference === 'object') {
      console.log('retrieveRecordFromCurrentRun: Using provided entry object');
      return reference;
    }
    
    // Otherwise, treat it as an index
    console.log(`retrieveRecordFromCurrentRun: Retrieving entry at index ${reference}`);
    return currentRunEntries[reference];
  } catch (error) {
    console.error(`retrieveRecordFromCurrentRun: Error retrieving entry: ${error}`);
    return null;
  }
}

// ==========================================
// MODIFIED DUPLICATE DETECTION (utilities.gs and main.gs)
// ==========================================

/**
 * Updated function that checks if new data is a duplicate and optionally updates existing data.
 * @param {Object} newData - The new data to check.
 * @param {Array} destinationSheetData - The existing data in the destination sheet.
 * @param {Array} currentRunEntries - The entries processed in the current run.
 * @param {Array} allImageUrls - All image URLs associated with the new data.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The destination sheet.
 * @return {Object} Result object with isDuplicate flag and match information.
 */
/**
 * Updated function that checks if new data is a duplicate and optionally updates existing data.
 * Now includes GPT-assisted determination for complex cases.
 */
/**
 * Checks if the new data is a duplicate with comprehensive diagnostic logging.
 * This function will determine if a new event/special entry is a duplicate of existing entries
 * and provide detailed logging about the comparison process.
 * 
 * @param {Object} newData - The new data to check.
 * @param {Array} destinationSheetData - The existing data in the destination sheet.
 * @param {Array} currentRunEntries - The entries processed in the current run.
 * @param {Array} allImageUrls - All image URLs associated with the new data.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The destination sheet (optional).
 * @param {string} openaiApiKey - The OpenAI API key (optional).
 * @return {Object} Result object with isDuplicate flag and match information.
 */
/**
 * Processing a single row of data from the source sheet.
 * Enhanced with robust handling of different isDuplicate return types.
 * @param {Array} row - The row data to process.
 * @param {number} rowIndex - The index of the row being processed.
 * @param {Object} columnIndexMap - Map of column headers to their indices.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The sheet to store processed data.
 * @param {Array} destinationData - Existing data in the destination sheet.
 * @param {Array} currentRunEntries - Entries processed in the current run.
 * @param {string} openaiApiKey - The OpenAI API key.
 * @param {Object} addressMap - Map of Facebook URLs to addresses.
 * @param {Set} processedIdsCache - Cache of processed event IDs.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} destinationSpreadsheet - The parent spreadsheet object.
 */
function processRow(row, rowIndex, columnIndexMap, destinationSheet, destinationData, currentRunEntries, openaiApiKey, addressMap, processedIdsCache, destinationSpreadsheet) {
  console.log(`Enhanced processRow: Processing row ${rowIndex + 2}`);
  
  const extractedData = extractRowData(row, columnIndexMap);

  if (!extractedData.id) {
    extractedData.id = generateUniqueId(extractedData);
    console.log(`Enhanced processRow: Generated unique ID for row ${rowIndex + 2}: ${extractedData.id}`);
  }

  const currentId = String(extractedData.id);
  
  console.log(`Enhanced processRow: Processing data with ID: ${currentId}`);

  const combinedText = `${extractedData.sharedPostText}\n${extractedData.text}`;

  const parsedData = parsePostData(
    combinedText, 
    extractedData.mediaUrls, 
    extractedData.sharedPostThumbnails,
    extractedData.userName, 
    extractedData.pageName, 
    extractedData.timestamp, 
    extractedData.cleanedFacebookUrl, 
    openaiApiKey, 
    addressMap,
    extractedData.profilePicUrl,
    extractedData
  );
  
  if (parsedData && parsedData.length > 0) {
    parsedData.forEach(data => {
      console.log("Enhanced processRow: Checking for duplicate with enhanced isDuplicate function");
      
      // Check for duplicates using the enhanced function
      const duplicateResult = isDuplicate(
        data, 
        destinationData, 
        currentRunEntries, 
        extractedData.mediaUrls, 
        destinationSheet,
        openaiApiKey
      );
      
      // Determine if this is a duplicate, handling both boolean and object return types
      const isDuplicateFlag = typeof duplicateResult === 'boolean' ? 
                             duplicateResult : 
                             (duplicateResult && duplicateResult.isDuplicate);
      
      console.log(`Enhanced processRow: isDuplicate result type: ${typeof duplicateResult}`);
      console.log(`Enhanced processRow: isDuplicate flag: ${isDuplicateFlag}`);
      
      if (isDuplicateFlag) {
        console.log("Enhanced processRow: Duplicate found, checking for updates");
        
        // Force enhanced detection for testing
        const useEnhancedDetection = true;
        
        if (useEnhancedDetection) {
          // MODIFIED CONDITION: Check if it's an object with matchInfo property
          if (typeof duplicateResult === 'object' && duplicateResult !== null && duplicateResult.matchInfo) {
            console.log("Enhanced processRow: Match info available, processing update");
            // Process update for duplicate entry with structured data
            processUpdateForDuplicate(
              data, 
              duplicateResult.matchInfo, 
              extractedData, 
              openaiApiKey, 
              destinationSheet, 
              currentRunEntries,
              destinationSpreadsheet,
              duplicateResult.gptAssessment
            );
          } else {
            // Handle boolean result - no match info available
            console.log('Enhanced processRow: Duplicate detected but no match info available');
            cleanupAllImages(extractedData);
          }
        } else {
          // Use original behavior - skip duplicate and clean up images
          console.log('Enhanced processRow: Duplicate found and feature flag disabled. Using original behavior.');
          console.log('Enhanced processRow: Skipping duplicate and cleaning up images.');
          
          // Clean up all images including profile picture for duplicate entries
          cleanupAllImages(extractedData);
        }
      } else {
        console.log("Enhanced processRow: Data is not a duplicate, proceeding with processing");
        
        // Handle the relevant image
        if (data.relevantImageIndex !== undefined && data.relevantImageIndex !== -1) {
          const relevantImageUrl = extractedData.mediaUrls[data.relevantImageIndex];
          if (relevantImageUrl) {
            console.log(`Enhanced processRow: Using existing Cloud Storage URL for relevant image: ${relevantImageUrl}`);
            data.relevantImageUrl = relevantImageUrl;
            data.cachedImageUrl = relevantImageUrl;  // Use the same URL for cachedImageUrl

            // Clean up non-relevant images
            if (FEATURE_FLAGS.USE_OPTIMIZED_IMAGE_HANDLING) {
              delayedCleanupForNonRelevantImages(extractedData.mediaUrls, relevantImageUrl);
            } else {
              cleanupNonRelevantImages(extractedData.mediaUrls, relevantImageUrl);
            }
          } else {
            console.log(`Enhanced processRow: Relevant image URL not found for index ${data.relevantImageIndex}`);
            data.relevantImageUrl = '';
            data.cachedImageUrl = '';
          }
        } else {
          console.log(`Enhanced processRow: No relevant image index provided for row ${rowIndex + 2}`);
          data.relevantImageUrl = '';
          data.cachedImageUrl = '';
        }

        appendToDestinationSheet(destinationSheet, data, destinationSpreadsheet);
        currentRunEntries.push(data);
        
        // Add the processed ID to the cache
        processedIdsCache.add(String(data.id));
        
        console.log(`Enhanced processRow: Added new ID to cache: ${data.id}`);
      }
    });
  } else {
    console.log(`Enhanced processRow: No valid data parsed for row ${rowIndex + 2}`);
    // Clean up all images including profile picture when no valid data is parsed
    cleanupAllImages(extractedData);
  }
}

/**
 * Determines if a potential match should be further analyzed by GPT.
 * @param {Object} newData - New event data.
 * @param {Object} existingData - Existing event data.
 * @return {boolean} True if GPT analysis is recommended.
 */
function shouldTriggerGptAssessment(newData, existingData) {
  // Check for establishment name match
  const existingEstablishment = existingData.establishment || existingData[7] || '';
  const newEstablishment = newData.establishment || '';
  
  const establishmentSimilarity = calculateSimilarity(
    normalize(existingEstablishment),
    normalize(newEstablishment)
  );
  
  // Check for description similarity
  const existingDescription = existingData.description || existingData[4] || '';
  const newDescription = newData.description || '';
  
  const descriptionSimilarity = calculateSimilarity(
    normalize(existingDescription),
    normalize(newDescription)
  );
  
  // We want to trigger GPT assessment when:
  // 1. Establishment names are highly similar (>90%)
  // 2. Descriptions show moderate similarity (40-80%)
  
  const highEstablishmentMatch = establishmentSimilarity > 0.9;
  const moderateDescriptionMatch = descriptionSimilarity >= 0.4 && descriptionSimilarity <= 0.8;
  
  console.log(`shouldTriggerGptAssessment: Establishment similarity: ${establishmentSimilarity.toFixed(2)}, Description similarity: ${descriptionSimilarity.toFixed(2)}`);
  console.log(`shouldTriggerGptAssessment: High establishment match: ${highEstablishmentMatch}, Moderate description match: ${moderateDescriptionMatch}`);
  
  // Return decision on whether to trigger GPT assessment
  return highEstablishmentMatch && moderateDescriptionMatch;
}

/**
 * Uses GPT to determine if two event records represent the same event with updates.
 * @param {Object} existingRecord - The existing event record.
 * @param {Object} newRecord - The new event record.
 * @param {string} openaiApiKey - The OpenAI API key.
 * @return {Object} GPT's assessment of the relationship between the events.
 */
function assessEventsWithGpt(existingRecord, newRecord, openaiApiKey) {
  console.log('assessEventsWithGpt: Using GPT to assess potential event relationship');
  
  const prompt = `Analyze these two event records and determine if they represent the same event with updates or two distinct events:

EVENT RECORD 1:
${JSON.stringify(existingRecord, null, 2)}

EVENT RECORD 2:
${JSON.stringify(newRecord, null, 2)}

Consider these factors:
1. Do the time differences represent a rescheduling or a different event?
2. Do description variations provide additional details or describe a different event?
3. Is there evidence in the text of postponement, cancellation, or rescheduling?
4. Would a reasonable person consider these to be the same event?

Focus particularly on the establishment name and the semantic meaning of the descriptions. The date is NOT a determining factor - events can be rescheduled.

Provide your determination in this format:
{
  "sameCoreEvent": true/false,
  "confidenceLevel": 0-100,
  "reasonForDetermination": "explanation",
  "recommendedAction": "update_existing/create_new/request_human_review",
  "fieldsToUpdate": ["field1", "field2"]
}`;

  // Create the function schema for GPT
  const functionSchema = [
    {
      "name": "assessEventDuplication",
      "description": "Determine if two events are the same event with updates or distinct events",
      "parameters": {
        "type": "object",
        "properties": {
          "sameCoreEvent": {
            "type": "boolean",
            "description": "Whether these records represent the same core event"
          },
          "confidenceLevel": {
            "type": "integer",
            "description": "Confidence level from 0-100"
          },
          "reasonForDetermination": {
            "type": "string",
            "description": "Explanation for the determination"
          },
          "recommendedAction": {
            "type": "string",
            "enum": ["update_existing", "create_new", "request_human_review"],
            "description": "Recommended action to take"
          },
          "fieldsToUpdate": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "List of fields that should be updated if records represent the same event"
          }
        },
        "required": ["sameCoreEvent", "confidenceLevel", "reasonForDetermination", "recommendedAction"]
      }
    }
  ];

  try {
    // Prepare the API payload
    const payload = {
      'model': 'gpt-4o-mini',
      'messages': [
        {
          'role': 'user',
          'content': prompt
        }
      ],
      'functions': functionSchema,
      'function_call': { 'name': 'assessEventDuplication' },
      'max_tokens': 16384
    };

    // Prepare the request options
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify(payload),
      'headers': {
        'Authorization': `Bearer ${openaiApiKey}`
      },
      'muteHttpExceptions': true
    };
    
    console.log('assessEventsWithGpt: Sending request to OpenAI API');
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`assessEventsWithGpt: Error from OpenAI API: ${responseCode} ${responseBody}`);
      return null;
    }

    const json = JSON.parse(responseBody);
    
    if (json.choices[0].message.function_call) {
      console.log('assessEventsWithGpt: Received function call response');
      const functionArgs = JSON.parse(json.choices[0].message.function_call.arguments);
      console.log('assessEventsWithGpt: Parsed assessment:', JSON.stringify(functionArgs, null, 2));
      return functionArgs;
    } else {
      console.log('assessEventsWithGpt: No function call in response');
      return null;
    }
  } catch (error) {
    console.error(`assessEventsWithGpt: Error assessing events: ${error}`);
    console.error(`assessEventsWithGpt: Error stack: ${error.stack}`);
    return null;
  }
}

/**
 * Determines if two entries match based on key identifiers.
 * This is a more focused version of the original isDuplicateEntry function.
 * @param {Object} newData - The new data entry.
 * @param {Object} existingData - The existing data entry.
 * @return {boolean} True if they match, false otherwise.
 */
function isMatchingEntry(newData, existingData) {
  // Get establishment names
  const establishmentMatch = normalize(existingData.establishment || existingData[7]) === 
                             normalize(newData.establishment);
  
  if (establishmentMatch) {
    // Check for date match
    const existingStartDate = formatDate(existingData.startDate || existingData[9]);
    const startDateMatch = existingStartDate === newData.startDate;
    
    if (startDateMatch) {
      // Check for time match
      const existingStartTime = normalizeTime(formatTime(existingData.startTime || existingData[11]));
      const newStartTime = normalizeTime(formatTime(newData.startTime));
      const startTimeMatch = existingStartTime === newStartTime;
      
      if (startTimeMatch) {
        // For events with matching establishment, date, and time, compare names and descriptions
        const existingName = normalize((existingData.name || existingData[5]));
        const newName = normalize(newData.name);
        
        const existingDesc = normalize((existingData.description || existingData[6]));
        const newDesc = normalize(newData.description);
        
        // Use similarity threshold for name and description
        const nameSimilarity = calculateSimilarity(existingName, newName);
        const descSimilarity = calculateSimilarity(existingDesc, newDesc);
        
        console.log(`isMatchingEntry: Name similarity: ${nameSimilarity.toFixed(2)}, Description similarity: ${descSimilarity.toFixed(2)}`);
        
        // If either name or description is similar enough, consider it a match
        return nameSimilarity > 0.5 || descSimilarity > 0.5;
      }
    }
  }
  
  return false;
}

/**
 * Original duplicate detection function (kept for fallback).
 * Moved to a separate function to maintain backward compatibility.
 */
function originalIsDuplicate(newData, destinationSheetData, currentRunEntries, allImageUrls) {
  console.log('originalIsDuplicate: New Data Entering Duplicate Checker:', newData);

  if (destinationSheetData.some(entry => isDuplicateEntry(newData, entry))) {
    console.log('originalIsDuplicate: Duplicate found in existing data:', newData);
    return true;
  }

  if (currentRunEntries.some(entry => isDuplicateEntry(newData, entry))) {
    console.log('originalIsDuplicate: Duplicate found in current run entries:', newData);
    return true;
  }

  console.log('originalIsDuplicate: No duplicate found for:', newData);
  return false;
}

// ==========================================
// GPT-BASED RECORD COMPARISON (openAiUtils.gs)
// ==========================================

/**
 * Creates a function schema for record comparison.
 * @return {Array} The function schema for GPT.
 */
/**
 * Creates a function schema for record comparison.
 * Updated to include social engagement metrics.
 * @return {Array} The function schema for GPT.
 */
function createRecordComparisonSchema() {
  return [
    {
      "name": "compareEventRecords",
      "description": "Compare two event records and recommend updates",
      "parameters": {
        "type": "object",
        "properties": {
          "fields": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "fieldName": {
                  "type": "string",
                  "description": "Name of the field being compared"
                },
                "updateAction": {
                  "type": "string",
                  "enum": ["keep_existing", "use_new", "merge"],
                  "description": "Recommended action for this field"
                },
                "reason": {
                  "type": "string",
                  "description": "Explanation for the recommendation"
                }
              },
              "required": ["fieldName", "updateAction", "reason"]
            },
            "description": "Array of field comparison results"
          },
          "imagePreference": {
            "type": "string",
            "enum": ["keep_existing", "use_new", "indeterminate"],
            "description": "Recommendation for which image to use"
          },
          "imageReason": {
            "type": "string",
            "description": "Explanation for the image preference"
          },
          "overallAssessment": {
            "type": "string",
            "description": "Summary of the comparison and recommendations"
          },
          "socialMetricsStrategy": {
            "type": "string",
            "enum": ["highest_value", "latest_value", "keep_existing"],
            "description": "Strategy to use for social engagement metrics (likes, shares, comments, topReactionsCount)"
          }
        },
        "required": ["fields", "imagePreference", "imageReason", "overallAssessment"]
      }
    }
  ];
}

/**
 * Compares two event records using GPT to determine which fields to update.
 * Updated to include social engagement metrics.
 * @param {Object} existingRecord - The existing event record.
 * @param {Object} newRecord - The new event record.
 * @param {string} openaiApiKey - The OpenAI API key.
 * @return {Object} GPT's recommendations for updates.
 */
function compareRecordsWithGPT(existingRecord, newRecord, openaiApiKey) {
  console.log('compareRecordsWithGPT: Comparing records using GPT');
  
  // Create a mapping of important field names to ensure consistency
  const fieldKeys = {
    isEvent: "isEvent", 
    isFoodSpecial: "isFoodSpecial",
    category: "category",
    name: "name",
    description: "description",
    establishment: "establishment",
    address: "address",
    startDate: "startDate",
    endDate: "endDate",
    startTime: "startTime",
    endTime: "endTime",
    ticketPrice: "ticketPrice",
    icon: "icon",
    image: "image",
    cleanedFacebookUrl: "cleanedFacebookUrl",
    ticketLink: "ticketLink",
    latitude: "latitude",
    longitude: "longitude",
    city: "city",
    streetAddress: "streetAddress",
    organizedBy: "organizedBy",
    usersResponded: "usersResponded", 
    utcStartDate: "utcStartDate",
    ticketsBuyUrl: "ticketsBuyUrl",
    ticketProvider: "ticketProvider",
    id: "id",
    relevantImageUrl: "relevantImageUrl",
    // New social engagement metrics
    likes: "likes",
    shares: "shares",
    comments: "comments",
    topReactionsCount: "topReactionsCount"
  };
  
  // Create a list of specific fields to focus on
  const importantFields = Object.keys(fieldKeys).join(", ");
  
  const prompt = `Compare these two records for the same event and recommend which fields to update.
Use EXACTLY these field names in your response: ${importantFields}.

EXISTING RECORD:
${JSON.stringify(existingRecord, null, 2)}

NEW RECORD:
${JSON.stringify(newRecord, null, 2)}

For each field that differs, recommend one of these actions:
1. keep_existing - The existing data is better or more reliable
2. use_new - The new data is better or contains important updates
3. merge - Both records contain valuable information that should be combined

"IMPORTANT: Never recommend 'use_new' or 'merge' for the address field if the new address is empty or blank or contains non-address like text (for example establishment names are not useful). 
Always prefer to keep an existing address over a blank one."

Pay special attention to:
- Image URLs (icon, image, relevantImageUrl) - Always recommend updating these if the new record has values and existing record doesn't
ICON / PROFILE IMAGE POLICY (STRICT):
- Treat Icon as belonging to the venue/establishment, not the posting page (aggregator).
- If the existing Icon looks venue-specific and the new candidate looks like an aggregator/chamber/city/tourism avatar (e.g., generic “Shop Local” graphics, page name like “Downtown/City/Tourism/Discover”), recommend keep_existing for Icon.
- Only replace Icon when the existing is blank/broken OR clearly the aggregator avatar and the new candidate appears venue-specific.
- Prefer venue-branded assets over aggregator/generic ones. Never downgrade a venue asset to an aggregator asset.
- Example: keep a “Baba’s Lounge” logo over “Downtown Charlottetown Inc.” generic text avatar.

- Dates and times - These are critical information that may indicate schedule changes
- Ticket prices - Especially changes to "Sold Out" status
- Descriptions - Consider detail level and information coverage
- Social engagement metrics (likes, shares, comments, topReactionsCount) - These should typically be updated to the highest values as they reflect the most recent engagement data

For images, determine if the new image is likely to be better than the existing one based on:
- Whether the existing image URL is empty or missing
- Official promotional material vs casual photos
- Image relevance to the event
- Information content (e.g., contains schedule, lineup, prices)



Provide reasons for each recommendation.`;

  // Prepare API call
  const payload = {
    'model': 'gpt-4o-mini',
    'messages': [
      {
        'role': 'user',
        'content': prompt
      }
    ],
    'max_tokens': 16384,
    'functions': createRecordComparisonSchema(),
    'function_call': { 'name': 'compareEventRecords' }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'headers': {
      'Authorization': `Bearer ${openaiApiKey}`
    },
    'muteHttpExceptions': true
  };

  try {
    console.log('compareRecordsWithGPT: Sending request to OpenAI API');
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`compareRecordsWithGPT: Error from OpenAI API: ${responseCode} ${responseBody}`);
      return null;
    }

    const json = JSON.parse(responseBody);
    
    if (json.choices[0].message.function_call) {
      console.log('compareRecordsWithGPT: Received function call response');
      const functionArgs = JSON.parse(json.choices[0].message.function_call.arguments);
      console.log('compareRecordsWithGPT: Parsed function arguments:', JSON.stringify(functionArgs, null, 2));
      return functionArgs;
    } else {
      console.log('compareRecordsWithGPT: No function call in response, using text response');
      return {
        fields: [],
        imagePreference: 'keep_existing',
        imageReason: 'Unable to compare images',
        overallAssessment: 'Failed to get structured comparison. Defaulting to keeping existing record.'
      };
    }
  } catch (error) {
    console.error(`compareRecordsWithGPT: Error comparing records: ${error}`);
    console.error(`compareRecordsWithGPT: Error stack: ${error.stack}`);
    return null;
  }
}
/**
 * Determines if a potential match should be further analyzed by GPT.
 * @param {Object} newData - New event data.
 * @param {Object} existingData - Existing event data.
 * @return {boolean} True if GPT analysis is recommended.
 */
function shouldTriggerGptAssessment(newData, existingData) {
  // Check for establishment name match
  const establishmentSimilarity = calculateSimilarity(
    normalize(existingData.establishment || existingData[7]),
    normalize(newData.establishment)
  );
  
  // Check for description similarity
  const descriptionSimilarity = calculateSimilarity(
    normalize(existingData.description || existingData[4]),
    normalize(newData.description)
  );
  
  // We want to trigger GPT assessment when:
  // 1. Establishment names are highly similar (>90%)
  // 2. Descriptions show moderate similarity (40-80%)
  // 3. There are potential meaningful updates to evaluate

  const highEstablishmentMatch = establishmentSimilarity > 0.9;
  const moderateDescriptionMatch = descriptionSimilarity >= 0.4 && descriptionSimilarity <= 0.8;
  
  console.log(`shouldTriggerGptAssessment: Establishment similarity: ${establishmentSimilarity.toFixed(2)}, Description similarity: ${descriptionSimilarity.toFixed(2)}`);
  
  // Return decision on whether to trigger GPT assessment
  return highEstablishmentMatch && moderateDescriptionMatch;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

/**
 * Normalizes field names to handle case-insensitive matching and common variations.
 * This function can be added to utilities.gs.
 * @param {string} fieldName - The field name to normalize.
 * @return {string} The normalized field name.
 */
function normalizeFieldName(fieldName) {
  if (!fieldName) return '';
  
  // Convert to lower case, remove spaces and question marks
  const normalized = fieldName.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[?#]/g, '');
  
  // Map common variations to standard property names
  const fieldNameMap = {
    // General fields
    'event': 'isEvent',
    'foodspecial': 'isFoodSpecial',
    'eventname': 'name',
    'hostingestablishment': 'establishment',
    'startdate': 'startDate',
    'enddate': 'endDate',
    'starttime': 'startTime',
    'endtime': 'endTime',
    'ticketprice': 'ticketPrice',
    'profileurl': 'cleanedFacebookUrl',
    'eventid': 'id',
    
    // Image fields - these are particularly important
    'profilepicture': 'icon',
    'profilepic': 'icon',
    'profileimage': 'icon',
    'icon': 'icon',
    'image': 'image',
    'eventimage': 'image',
    'postimage': 'image',
    'relevantimageurl': 'relevantImageUrl',
    'relevantimageurlcolumn': 'relevantImageUrl',
    'relevantimage': 'relevantImageUrl',
    'relevantimageindex': 'relevantImageIndex',
    'cachedimageurl': 'cachedImageUrl'
  };
  
  return fieldNameMap[normalized] || normalized;
}

function formatTime(timeString) {
  if (!timeString) return '';
  
  // If timeString is a Date object, extract time components directly
  if (timeString instanceof Date) {
    const date = timeString;
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const period = hours >= 12 ? 'PM' : 'AM';
    const adjustedHours = hours % 12 || 12; // Convert 0 to 12

    // Use 12-hour format consistently with AM/PM
    return `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${period}`;
  }

  // Normalize input
  if (typeof timeString !== 'string') {
    timeString = timeString.toString();
  }
  
  timeString = timeString.trim().toUpperCase();

  // Try to parse timeString as a Date object
  const date = new Date(timeString);
  if (!isNaN(date.getTime())) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const period = hours >= 12 ? 'PM' : 'AM';
    const adjustedHours = hours % 12 || 12;

    // Use 12-hour format consistently
    return `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${period}`;
  }
  
  // Handle existing 12-hour format with AM/PM
  if (timeString.includes('AM') || timeString.includes('PM')) {
    // If already in 12-hour format, standardize formatting
    const timeParts = timeString.split(' ');
    const timeComponent = timeParts[0];
    const period = timeParts[1];
    
    let [hours, minutes, seconds] = timeComponent.split(':');
    hours = parseInt(hours, 10).toString().padStart(2, '0');
    minutes = (minutes ? parseInt(minutes, 10) : 0).toString().padStart(2, '0');
    seconds = (seconds ? parseInt(seconds, 10) : 0).toString().padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds} ${period}`;
  }
  
  // Handle 24-hour format inputs
  if (timeString.includes(':')) {
    let [hours, minutes, seconds] = timeString.split(':');
    hours = parseInt(hours, 10);
    minutes = minutes ? parseInt(minutes, 10) : 0;
    seconds = seconds ? parseInt(seconds, 10) : 0;
    
    const period = hours >= 12 ? 'PM' : 'AM';
    const adjustedHours = hours % 12 || 12;
    
    return `${adjustedHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${period}`;
  }
  
  return timeString; // Return original if no format matched
}


function hasCostSavings(text) {
  console.log('Checking for cost savings in text:', text);

  const keywords = ['half-priced', 'half price', 'half priced', 'two for one', 'discounted', 'staff-priced', 'reduced price', 'reduced prices', 'special price', 'deal', 'by donation', 'with donation', 'happy hour', 'promo', 'sale', 'bargain', 'free', 'discount'];
  const lowercaseText = text.toLowerCase();

  // Pricing patterns to identify specific discount offers
  const pricingPatterns = [
    /\$\d+(\.\d{1,2})?\b/, // e.g., $10, $10.99
    /\b\d{1,2}(\.\d{1,2})?\s*(?:dollar|buck|bucks)/, // e.g., 10 dollars, 10 bucks
    /\b\d{1,2}(\.\d{1,2})?\s*(?:percent|%) off/, // e.g., 10% off
    /\bbuy\s+one\s+get\s+one\s+free\b/, // e.g., Buy one get one free
    /\bfree\s+\w+\b/, // e.g., Free drink, Free appetizer
  ];

  // Keywords and phrases that likely indicate a menu description rather than a special
  const nonSpecialIndicators = [
    'menu', 'featuring', 'choice of', 'prepared by', 'served with', 'includes', 'dining experience', 
    'gourmet', 'chef\'s', 'course'
  ];

  // Initialize discount detection variables
  const hasKeywordDiscount = keywords.some(keyword => lowercaseText.includes(keyword));
  const hasPricingPatternDiscount = pricingPatterns.some(pattern => pattern.test(lowercaseText));

  // Check if the text contains any non-special indicators
  const hasNonSpecialIndicator = nonSpecialIndicators.some(indicator => lowercaseText.includes(indicator));
  if (hasNonSpecialIndicator && !hasKeywordDiscount && !hasPricingPatternDiscount) {
    console.log('Post identified as a menu description with no discount:', text);
    return false; // Skip this post
  }

  // Check for discounts
  if (hasKeywordDiscount || hasPricingPatternDiscount) {
    console.log('Cost savings identified:', text);
    return true;
  }

  console.log('No cost savings detected in text:', text);
  return false;
}



// Helper functions
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


function isSimilarName(existingName, newName, existingDescription, newDescription, useOverlapDenominator /* optional */) {
  try {
    const combined1 = normalize((existingName || '') + ' - ' + (existingDescription || ''));
    const combined2 = normalize((newName || '') + ' - ' + (newDescription || ''));

    const words1 = combined1.split(/\s+/).filter(Boolean);
    const words2 = combined2.split(/\s+/).filter(Boolean);

    const set2 = new Set(words2);
    const common = words1.filter(w => set2.has(w));

    const denom = (useOverlapDenominator ? Math.min(words1.length, words2.length)
                                         : Math.max(words1.length, words2.length)) || 1;
    const ratio = common.length / denom;

    Logger.log('utilities.gs : isSimilarName : Combined Name 1: ' + combined1);
    Logger.log('utilities.gs : isSimilarName : Combined Name 2: ' + combined2);
    Logger.log('utilities.gs : isSimilarName : Common Words: ' + JSON.stringify(common));
    Logger.log('utilities.gs : isSimilarName : Similarity Ratio: ' + ratio + ' (denom=' + (useOverlapDenominator ? 'min' : 'max') + ')');
    Logger.log('utilities.gs : isSimilarName : (helper has no fixed numeric threshold; denom=' + (useOverlapDenominator ? 'min' : 'max') + ')');


    return ratio;
  } catch (e) {
    Logger.log('utilities.gs : isSimilarName : ERROR ' + e);
    return 0;
  }
}


// Main duplicate detection function
function isDuplicate(newData, destinationSheetData, currentRunEntries,allImageUrls) {
  console.log('utilities : isDuplicate : New Data Entering Duplicate Checker:', newData);

  // First, check against existing data in the destination sheet
  for (let i = 0; i < destinationSheetData.length; i++) {
    if (isDuplicateEntry(newData, destinationSheetData[i])) {
      console.log('utilities : isDuplicate : Duplicate found in existing data:', newData);
      return true;
    }
  }

  // Then, check against entries added during the current run
  for (let i = 0; i < currentRunEntries.length; i++) {
    if (isDuplicateEntry(newData, currentRunEntries[i])) {
      console.log('utilities : isDuplicate : Duplicate found in current run entries:', newData);
      return true;
    }
  }

  console.log('utilities : isDuplicate : No duplicate found for:', newData);
  return false;
}


/**
 * Checks if two entries are duplicates with comprehensive logging.
 * Enhanced to properly handle various time formats, especially Google Sheets date objects.
 * @param {Object} newData - The new data entry.
 * @param {Object} existingData - The existing data entry.
 * @return {boolean} True if they are duplicates, false otherwise.
 */
/**
 * Determines whether a new event (newData) matches an existing row in the sheet (existingData).
 * Only returns true if all of these line up:
 *   1. establishment (normalized) is identical
 *   2. startDate is identical
 *   3. startTime (or within 3 hours) AND combined name/description is similar enough
 *
 * If any of those fail, it returns false (meaning “not a match against this row”).
 */
function isDuplicateEntry(newData, existingData) {
  // --- Step 1: Establishment must match exactly (after normalization) ---
  // First check if events are at different additional locations (different venues)
  // Sheet rows store "Sub Venue" at index 39; in object-form it may be additionalLocation or subVenue
  const existingAdditionalLocation =
    (existingData && (existingData.additionalLocation || existingData.subVenue || existingData[39])) || '';
  const newAdditionalLocation =
    (newData && (newData.additionalLocation || newData.subVenue)) || '';

  // Grab an ID for tracing (sheet col 32 = Event ID in your header map)
  const existingEventId = (existingData && (existingData.eventId || existingData[32])) || '';

  // If both have additional locations and they're different, not a duplicate
  if (existingAdditionalLocation && newAdditionalLocation) {
  const normExistingSub = normalize(existingAdditionalLocation).replace(/\s*\|\s*charlottetown\s+pe\b/i, '');
  const normNewSub      = normalize(newAdditionalLocation).replace(/\s*\|\s*charlottetown\s+pe\b/i, '');

  if (normExistingSub !== normNewSub) {
    console.log(`🏢 [DupCheck:SubVenue] Different additional locations → NOT DUP
    ↳ existing(eventId=${existingEventId}) = "${existingAdditionalLocation}" → "${normExistingSub}"
    ↳ new = "${newAdditionalLocation}" → "${normNewSub}"`);
    return false;
  }
}


  // Read existing establishment from object or sheet col H (index 7)
  const rawExistingEstablishment =
    (existingData && (existingData.establishment || existingData[7])) || '';
  const normalizedExistingEstablishment = normalize((rawExistingEstablishment || '')
  .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u2018\u2019\uFF07']/g, ''));
  

  // Establishment selection for new data (with explicit source tag):
  // 1) Prefer establishment (canonicalized pre-dup)
  // 2) Else use additionalLocation if present
  // 3) Else empty
  const newEstablishmentSource = ((newData && newData.establishment && newData.establishment.trim() !== '')
        ? 'new.establishment'
        : (newAdditionalLocation
            ? 'new.additionalLocation'
            : 'new.establishment(blank)'));

  const effectiveNewEstablishment = ((newData && newData.establishment && newData.establishment.trim() !== '')
        ? newData.establishment.trim()
        : (newAdditionalLocation
            ? newAdditionalLocation
            : ''));

  const rawNewEstablishment = effectiveNewEstablishment;
  const normalizedNewEstablishment = normalize((rawNewEstablishment || '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\u2018\u2019\uFF07']/g, ''));

  // Compare keys: drop trailing " | Charlottetown PE" after normalization
  const cmpExistingEstablishment = normalizedExistingEstablishment.replace(/\s*\|\s*charlottetown\s+pe\b/, '');
  const cmpNewEstablishment = normalizedNewEstablishment.replace(/\s*\|\s*charlottetown\s+pe\b/, '');


  // Date values for smarter logging (no logic changes)
  const existingStartDateRaw = (existingData && (existingData.startDate || existingData[9])) || '';
  const newStartDateRaw = (newData && newData.startDate) || '';
  const datesAppearEqual = (formatDate ? (formatDate(existingStartDateRaw) === formatDate(newStartDateRaw)) : (existingStartDateRaw === newStartDateRaw));

  // Per-new-item throttle: only log first 3 mismatches; always log matches & sub-venue conflicts
  if (typeof newData.__estLogCount === 'undefined') newData.__estLogCount = 0;
  const shouldLogThisComparison =
    // Always log when establishments match (useful to trace the happy path)
    (cmpExistingEstablishment === cmpNewEstablishment)
    // Or when dates match (so we can debug time/similarity next)
    || datesAppearEqual
    // Or for the first 3 comparisons for this new item (to sample mismatches)
    || (newData.__estLogCount < 3);

  if (shouldLogThisComparison) {
  console.log(`🏛️ [DupCheck:Establishment]
  ↳ existing(eventId=${existingEventId}) [source=establishment] raw="${rawExistingEstablishment}" | norm="${normalizedExistingEstablishment}"
  ↳ new [source=${newEstablishmentSource}] raw="${rawNewEstablishment}" | norm="${normalizedNewEstablishment}"
  ↳ cmpExisting="${cmpExistingEstablishment}" cmpNew="${cmpNewEstablishment}"
  ↳ match=${cmpExistingEstablishment === cmpNewEstablishment}
  ↳ datesEqual=${datesAppearEqual}`);
}



  if (cmpExistingEstablishment !== cmpNewEstablishment) {
  if (shouldLogThisComparison) console.log('❌ [DupCheck:Establishment] MISMATCH → NOT DUP (cmp)');
  newData.__estLogCount++;
  return false; // Not the same venue
} else {
  console.log('✅ [DupCheck:Establishment] MATCH (cmp)');
}


    // --- Step 2: Date must match exact
  const existingStartDateRaw2 = (existingData && (existingData.startDate || existingData[9])) || '';
  const newStartDateRaw2 = (newData && newData.startDate) || '';
  const existingStartDate = formatDate ? formatDate(existingStartDateRaw2) : existingStartDateRaw2;
  const newStartDate = formatDate ? formatDate(newStartDateRaw2) : newStartDateRaw2;

  // throttle bucket for date/time logs (separate from __estLogCount)
  if (typeof newData.__dupTimeLogCount === 'undefined') newData.__dupTimeLogCount = 0;

  if (existingStartDate !== newStartDate) {
    // Log only a sample of date mismatches
    if (newData.__dupTimeLogCount < 5) {
      console.log(`📅 [DupCheck:Date] NOT DUP (date mismatch)
      ↳ existing="${existingStartDate}" (raw="${existingStartDateRaw2}")
      ↳ new     ="${newStartDate}" (raw="${newStartDateRaw2}")`);
      newData.__dupTimeLogCount++;
    }
    return false;
  } else {
    // Dates match — log details about time/adjacency/similarity for a small sample
    if (newData.__dupTimeLogCount < 5) {
  // Pull start/end times from sheet/object
  const exStartTimeRaw = (existingData && (existingData.startTime || existingData[11])) || '';
  const exEndTimeRaw   = (existingData && (existingData.endTime   || existingData[12])) || '';
  const nwStartTimeRaw = (newData && newData.startTime) || '';
  const nwEndTimeRaw   = (newData && newData.endTime)   || '';

  const exStart = formatTime ? formatTime(exStartTimeRaw) : exStartTimeRaw;
  const exEnd   = formatTime ? formatTime(exEndTimeRaw)   : exEndTimeRaw;
  const nwStart = formatTime ? formatTime(nwStartTimeRaw) : nwStartTimeRaw;
  const nwEnd   = formatTime ? formatTime(nwEndTimeRaw)   : nwEndTimeRaw;

  // minutes since midnight from raw+formatted values
  const minutesFrom = (raw, formatted) => {
    const [h, m] = parseTimeString(raw, formatted);
    return (h * 60) + m;
  };

  const exStartMin = minutesFrom(exStartTimeRaw, exStart);
  const exEndMin   = minutesFrom(exEndTimeRaw,   exEnd);
  const nwStartMin = minutesFrom(nwStartTimeRaw, nwStart);
  const nwEndMin   = minutesFrom(nwEndTimeRaw,   nwEnd);

  const timeEqual   = (exStart && nwStart) ? (exStart === nwStart) : false;
  const minutesDiff = (Number.isFinite(exStartMin) && Number.isFinite(nwStartMin))
    ? Math.abs(exStartMin - nwStartMin)
    : NaN;

  // adjacency (<= 15 min gap between an end and the other start)
  const endStartDiff1 = (Number.isFinite(exEndMin) && Number.isFinite(nwStartMin)) ? Math.abs(exEndMin - nwStartMin) : NaN;
  const endStartDiff2 = (Number.isFinite(nwEndMin) && Number.isFinite(exStartMin)) ? Math.abs(nwEndMin - exStartMin) : NaN;
  const looksAdjacent = (Number.isFinite(endStartDiff1) && endStartDiff1 <= 15) || (Number.isFinite(endStartDiff2) && endStartDiff2 <= 15);

  // which similarity threshold your logic will use next (for tracing only)
  let thresholdUsed = null;
  if (timeEqual) {
    thresholdUsed = 0.4; // equal start times
  } else if (Number.isFinite(minutesDiff) && minutesDiff <= 180) {
    thresholdUsed = 0.7; // within 3 hours
  } else {
    thresholdUsed = null; // > 3 hours apart → your logic will NOT consider as dup
  }

  // Build approximate combined strings like your code does
  const exName = (existingData && (existingData.name || existingData[5])) || '';
  const exDesc = (existingData && (existingData.description || existingData[6])) || '';
  const nwName = (newData && newData.name) || '';
  const nwDesc = (newData && newData.description) || '';

  // lightweight similarity approximation to show WHY it might fail (LOG ONLY)
  const tokenize = (s) => (s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
  const exTokens = new Set(tokenize(`${exName} ${exDesc}`));
  const nwTokens = new Set(tokenize(`${nwName} ${nwDesc}`));
  let overlap = 0;
  for (const w of nwTokens) if (exTokens.has(w)) overlap++;
  const denom = Math.max(exTokens.size, nwTokens.size) || 1;
  const approxSimilarity = overlap / denom;

  console.log(`⏱️ [DupCheck:Time]
  ↳ exStart="${exStart}" exEnd="${exEnd}" | newStart="${nwStart}" newEnd="${nwEnd}"
  ↳ timeEqual=${timeEqual} minutesDiff=${minutesDiff} looksAdjacent=${looksAdjacent}
  ↳ thresholdUsed=${thresholdUsed === null ? '>3h (none)' : thresholdUsed}`);

  if (thresholdUsed !== null) {
    console.log(`🧮 [DupCheck:Similarity] approx=${approxSimilarity.toFixed(3)} (threshold=${thresholdUsed})
    ↳ exName="${exName}"
    ↳ newName="${nwName}"`);
  } else {
    console.log('🧮 [DupCheck:Similarity] skipped (start times > 3 hours apart)');
  }

  newData.__dupTimeLogCount++;
}

    // continue into your existing time/similarity logic unchanged
  }


  // --- Step 3: Time comparison setup ---
  const formattedExistingTime = formatTime(existingData.startTime || existingData[11]); // <-- 11 = Start Time
  const formattedNewTime = formatTime(newData.startTime);

  let [existingHours, existingMinutes] = parseTimeString(existingData.startTime, formattedExistingTime);
  let [newHours, newMinutes] = parseTimeString(newData.startTime, formattedNewTime);

  const normalizedExistingTime = `${existingHours.toString().padStart(2, '0')}:${existingMinutes.toString().padStart(2, '0')}`;
  const normalizedNewTime = `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;

  // --- Step 4: End time normalization (if needed for adjacency or time diff checks) ---
  let [existingEndHours, existingEndMinutes] = parseTimeString(
    existingData.endTime,
    formatTime(existingData.endTime || existingData[12]), // <-- 12 = End Time
    existingHours
  );
  let [newEndHours, newEndMinutes] = parseTimeString(
    newData.endTime,
    formatTime(newData.endTime),
    newHours
  );

  const normalizedExistingEndTime = `${existingEndHours.toString().padStart(2, '0')}:${existingEndMinutes.toString().padStart(2, '0')}`;
  const normalizedNewEndTime = `${newEndHours.toString().padStart(2, '0')}:${newEndMinutes.toString().padStart(2, '0')}`;


  // --- Step 5: If start times match exactly, compare name/description ---
// Add venue as a fallback when a description is missing to improve similarity on terse posts
  if (normalizedExistingTime === normalizedNewTime) {
    const estFallbackExisting = (rawExistingEstablishment || '').replace(/\s*\|\s*charlottetown\s+pe\b/i, '');
    const estFallbackNew = (effectiveNewEstablishment || '').replace(/\s*\|\s*charlottetown\s+pe\b/i, '');

    const existingDescOrFallback = (existingData.description || existingData[6] || estFallbackExisting);
    const newDescOrFallback = (newData.description || estFallbackNew);

    const existingCombinedName = normalize(((existingData.name || existingData[5]) || '') + ' - ' + (existingDescOrFallback || ''));
    const newCombinedName = normalize(((newData.name || '') + ' - ' + (newDescOrFallback || '')));
    // Use the “min” denominator ONLY when start times are equal
    if (isSimilarName(existingCombinedName, newCombinedName, '', '', true)) {
      return true;
    }

  } else {

    // --- Step 6: If times are adjacent (no overlap), it's not a duplicate ---
    if (checkAdjacentTimeSlots(
      normalizedExistingTime,
      normalizedExistingEndTime,
      normalizedNewTime,
      normalizedNewEndTime
    )) {
      return false;
    }

    // --- Step 7: If within 3 hours, compare similarity ratio on name/description ---
    const existingTimeInMinutes = existingHours * 60 + existingMinutes;
    const newTimeInMinutes = newHours * 60 + newMinutes;
    const timeDifferenceMinutes = Math.abs(existingTimeInMinutes - newTimeInMinutes);

    if (timeDifferenceMinutes <= 180) {
      const estFallbackExisting = (rawExistingEstablishment || '').replace(/\s*\|\s*charlottetown\s+pe\b/i, '');
      const estFallbackNew = (effectiveNewEstablishment || '').replace(/\s*\|\s*charlottetown\s+pe\b/i, '');

      const existingDescOrFallback = (existingData.description || existingData[6] || estFallbackExisting);
      const newDescOrFallback = (newData.description || estFallbackNew);

      const existingCombinedName = normalize(((existingData.name || existingData[5]) || '') + ' - ' + (existingDescOrFallback || ''));
      const newCombinedName = normalize(((newData.name || '') + ' - ' + (newDescOrFallback || '')));

      const words1 = existingCombinedName.split(/\W+/);
      const words2 = newCombinedName.split(/\W+/);
      const commonWords = words1.filter(word => words2.includes(word));
      const similarityRatio = commonWords.length / Math.max(words1.length, words2.length);

      if (similarityRatio >= 0.7) {
        return true;
      }
    }

  }

  // --- Step 8: Not a duplicate ---
  return false;
}

function parseTimeString(rawValue, formattedValue, fallbackHour = 0) {
  if (rawValue instanceof Date) {
    return [rawValue.getHours(), rawValue.getMinutes()];
  }

  const parts = formattedValue.match(/(\d+):(\d+):\d+\s*(AM|PM)/i);
  if (parts) {
    let hours = parseInt(parts[1], 10);
    const minutes = parseInt(parts[2], 10);
    const period = parts[3].toUpperCase();

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return [hours, minutes];
  } else {
    const [h, m] = normalizeTime(formattedValue).split(':').map(Number);
    return [h || fallbackHour, m || 0];
  }
}


/**
 * Attempts to extract a performer name from a description string, but
 * never returns the venue/establishment itself.
 *
 * @param {string} description      The full event description text.
 * @param {string} establishment    The venue/establishment name to exclude.
 * @return {string}                 The first valid performer name found, or "" if none.
 */
function extractPerformer(description, establishment) {
  const desc = (description || "").trim();
  const venue = (establishment || "").trim();
  const venueLower = venue.toLowerCase();

  // 1) Pattern: "- <Venue>: <Performer>"
  //    e.g. "8:00 pm - Trailside Music Hall: Matt Minglewood Band - Thru the Years"
  const dashColonRegex = /-\s*([^:]+?):\s*([\s\S]+)/;
  let m = desc.match(dashColonRegex);
  if (m) {
    const candVenue = m[1].trim();
    let candPerformer = m[2].trim();

    // Clean up the performer name
    candPerformer = cleanPerformerName(candPerformer, venue);

    if (candPerformer.toLowerCase() !== venueLower && candPerformer.length > 0) {
      console.log(`extractPerformer: Found performer with '- Venue: Performer' pattern: "${candPerformer}"`);
      return candPerformer;
    }
    console.log(`extractPerformer: Skipped candidate "${candPerformer}" because it matched venue`);
  }

  // 2) Pattern: "<Performer> at <Venue>"
  //    e.g. "Boney Oaks at Hunter's Ale House starting at 11:00 pm."
  const atVenueRegex = new RegExp(`^([\\s\\S]+?)\\s+at\\s+${escapeRegExp(venue)}\\b`, "i");
  m = desc.match(atVenueRegex);
  if (m) {
    let candidate = m[1].trim();
    
    // Clean up the performer name
    candidate = cleanPerformerName(candidate, venue);
    
    if (candidate.toLowerCase() !== venueLower && candidate.length > 0) {
      console.log(`extractPerformer: Found performer with '<Performer> at <Venue>' pattern: "${candidate}"`);
      return candidate;
    }
    console.log(`extractPerformer: Skipped candidate "${candidate}" because it matched venue`);
  }

  // 3) Fallback: take everything after the last colon (":")
  if (desc.includes(":")) {
    const parts = desc.split(":");
    let candidate = parts[parts.length - 1].trim();

    // Clean up the performer name
    candidate = cleanPerformerName(candidate, venue);

    if (candidate.toLowerCase() !== venueLower && candidate.length > 0) {
      console.log(`extractPerformer: Found performer in fallback last-colon: "${candidate}"`);
      return candidate;
    }
    console.log(`extractPerformer: Skipped fallback candidate "${candidate}" because it matched venue`);
  }

  // 4) Final fallback: pick first multi-word capitalized phrase that isn't the venue
  //    e.g. "Matt Minglewood Band"
  const capitalizedRegex = /([A-Z][A-Za-z0-9'' &-]{3,}(?:\s+[A-Z][A-Za-z0-9'' &-]{3,})+)/g;
  const capsMatches = [...desc.matchAll(capitalizedRegex)].map(c => c[1].trim());
  for (let candidate of capsMatches) {
    // Clean up the performer name
    candidate = cleanPerformerName(candidate, venue);
    
    if (candidate.toLowerCase() !== venueLower && candidate.length > 0) {
      console.log(`extractPerformer: Found performer using fallback capitalized pattern: "${candidate}"`);
      return candidate;
    }
    console.log(`extractPerformer: Skipped fallback candidate "${candidate}" because it matched venue`);
  }

  console.log("extractPerformer: No performer found that differs from venue");
  return "";
}

/**
 * Cleans up a performer name by removing common suffixes and normalizing.
 * @param {string} performer - The raw performer name to clean.
 * @param {string} venue - The venue name to avoid including.
 * @return {string} The cleaned performer name.
 */
function cleanPerformerName(performer, venue) {
  if (!performer) return "";
  
  // Remove common suffixes and patterns
  performer = performer
    // Remove "- Thru the Years" and similar tour names
    .replace(/\s*-\s*(Thru|Through)\s+the\s+Years.*$/i, '')
    // Remove "live" suffix
    .replace(/\s+live$/i, '')
    // Remove "performing on [date]" patterns
    .replace(/\s+performing\s+on\s+.+$/i, '')
    // Remove "on [date]" patterns
    .replace(/\s+on\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+.+$/i, '')
    // Remove time patterns at the end
    .replace(/\s+at\s+\d{1,2}:\d{2}\s*(am|pm)?.*$/i, '')
    // Remove "starting at" patterns
    .replace(/\s+starting\s+at\s+.+$/i, '')
    // Remove trailing periods, commas, and extra spaces
    .replace(/[.,]\s*$/, '')
    .trim();
  
  // If the cleaned performer contains "at <Venue>", remove it
  const atVenuePattern = new RegExp(`\\b(at\\s+${escapeRegExp(venue)})\\b`, "i");
  performer = performer.replace(atVenuePattern, "").trim();
  
  // Normalize "The" prefix - standardize by removing it
  if (performer.toLowerCase().startsWith('the ')) {
    performer = performer.substring(4);
  }
  
  // Final cleanup - remove any double spaces
  performer = performer.replace(/\s+/g, ' ').trim();
  
  return performer;
}

/**
 * Escapes special regex characters in a string so it can be used inside a RegExp.
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * Checks if two time slots are adjacent (one ends when the other begins).
 * This helps identify consecutive events at the same venue.
 * 
 * @param {string} startTime1 - Normalized start time of first event (24h format HH:MM).
 * @param {string} endTime1 - Normalized end time of first event (24h format HH:MM).
 * @param {string} startTime2 - Normalized start time of second event (24h format HH:MM).
 * @param {string} endTime2 - Normalized end time of second event (24h format HH:MM).
 * @return {boolean} True if the time slots are adjacent, false otherwise.
 */
/**
 * Checks if two time slots are adjacent (one ends when or close to when the other begins).
 * This helps identify consecutive events at the same venue.
 * Works with your existing time format and normalizeTime function.
 * 
 * @param {string} time1 - Normalized start time of first event (24h format HH:MM).
 * @param {string} endTime1 - Normalized end time of first event (24h format HH:MM).
 * @param {string} time2 - Normalized start time of second event (24h format HH:MM).
 * @param {string} endTime2 - Normalized end time of second event (24h format HH:MM).
 * @return {boolean} True if the time slots are adjacent, false otherwise.
 */
function checkAdjacentTimeSlots(time1, endTime1, time2, endTime2) {
  console.log(`checkAdjacentTimeSlots: Checking if time slots are adjacent`);
  console.log(`  Slot 1: ${time1} to ${endTime1}`);
  console.log(`  Slot 2: ${time2} to ${endTime2}`);
  
  // Convert times to minutes for easier comparison
  const time1Minutes = convertTimeToMinutes(time1);
  const endTime1Minutes = convertTimeToMinutes(endTime1);
  const time2Minutes = convertTimeToMinutes(time2);
  const endTime2Minutes = convertTimeToMinutes(endTime2);
  
  console.log(`  Time 1: ${time1} (${time1Minutes} minutes)`);
  console.log(`  End Time 1: ${endTime1} (${endTime1Minutes} minutes)`);
  console.log(`  Time 2: ${time2} (${time2Minutes} minutes)`);
  console.log(`  End Time 2: ${endTime2} (${endTime2Minutes} minutes)`);
  
  // Check if one time slot ends within 15 minutes of when the other begins
  const isFirstThenSecond = Math.abs(endTime1Minutes - time2Minutes) <= 15;
  const isSecondThenFirst = Math.abs(endTime2Minutes - time1Minutes) <= 15;
  
  const areAdjacent = isFirstThenSecond || isSecondThenFirst;
  
  console.log(`  First then Second: ${isFirstThenSecond}`);
  console.log(`  Second then First: ${isSecondThenFirst}`);
  console.log(`  Time slots are ${areAdjacent ? 'adjacent' : 'not adjacent'}`);
  
  return areAdjacent;
}

/**
 * Converts a time string in HH:MM format to minutes since midnight.
 * Helper function for checkAdjacentTimeSlots.
 * 
 * @param {string} timeString - Time in HH:MM format (24-hour).
 * @return {number} Minutes since midnight.
 */
function convertTimeToMinutes(timeString) {
  if (!timeString) return 0;
  
  // Split the time string into hours and minutes
  const [hours, minutes] = timeString.split(':').map(Number);
  
  // Calculate total minutes
  return (hours * 60) + (minutes || 0);
}

/**
 * Checks if two time slots overlap significantly.
 * This helps identify potential duplicate events with slightly different times.
 * 
 * @param {string} startTime1 - Normalized start time of first event (24h format HH:MM).
 * @param {string} endTime1 - Normalized end time of first event (24h format HH:MM).
 * @param {string} startTime2 - Normalized start time of second event (24h format HH:MM).
 * @param {string} endTime2 - Normalized end time of second event (24h format HH:MM).
 * @return {boolean} True if the time slots overlap significantly, false otherwise.
 */
function areOverlappingTimeSlots(startTime1, endTime1, startTime2, endTime2) {
  // Convert times to minutes
  const time1Start = timeToMinutes(startTime1);
  const time1End = timeToMinutes(endTime1);
  const time2Start = timeToMinutes(startTime2);
  const time2End = timeToMinutes(endTime2);
  
  console.log(`areOverlappingTimeSlots: Checking for overlap between time slots`);
  console.log(`  Slot 1: ${startTime1} to ${endTime1} (${time1Start} to ${time1End} minutes)`);
  console.log(`  Slot 2: ${startTime2} to ${endTime2} (${time2Start} to ${time2End} minutes)`);
  
  // Calculate the overlap
  const overlapStart = Math.max(time1Start, time2Start);
  const overlapEnd = Math.min(time1End, time2End);
  const overlapMinutes = Math.max(0, overlapEnd - overlapStart);
  
  // Calculate the duration of each slot
  const duration1 = time1End - time1Start;
  const duration2 = time2End - time2Start;
  
  // Calculate overlap as a percentage of the shorter event
  const shorterDuration = Math.min(duration1, duration2);
  const overlapPercentage = shorterDuration > 0 ? (overlapMinutes / shorterDuration) * 100 : 0;
  
  console.log(`  Overlap: ${overlapMinutes} minutes (${overlapPercentage.toFixed(1)}% of shorter event)`);
  
  // Consider events overlapping if they share at least 25% of the shorter event's time
  const result = overlapPercentage >= 25;
  console.log(`  Time slots ${result ? 'do' : 'do not'} significantly overlap`);
  
  return result;
}

/**
 * Converts a time string in HH:MM format to minutes since midnight.
 * @param {string} timeString - Time in HH:MM format (24-hour).
 * @return {number} Minutes since midnight.
 */
function timeToMinutes(timeString) {
  if (!timeString) return 0;
  
  const [hours, minutes] = timeString.split(':').map(Number);
  return (hours * 60) + minutes;
}