// fileProcessing.gs

/**
 * Finds new APIFY Dataset files that haven't been processed yet.
 * @param {string[]} processedIds - Array of already processed file IDs.
 * @return {GoogleAppsScript.Drive.File[]} Array of new files to process.
 */
function findNewApifyDatasetFiles(processedIds) {
  const query = 'title contains "APIFY Dataset" and (mimeType contains "spreadsheet" or mimeType contains "excel" or mimeType contains "sheet")';
  const files = DriveApp.searchFiles(query);
  const newFiles = [];

  while (files.hasNext()) {
    const file = files.next();
    const fileId = file.getId();
    if (!processedIds.includes(fileId)) {
      newFiles.push(file);
    }
  }

  console.log(`Found ${newFiles.length} new APIFY Dataset files`);
  return newFiles;
}


/**
 * Processes a single file and extracts data from it.
 * @param {GoogleAppsScript.Drive.File} file - The file to process.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} destinationSpreadsheet - The spreadsheet to store processed data.
 * @param {Object} addressMap - Map of Facebook URLs to addresses.
 * @param {string} openaiApiKey - The OpenAI API key.
 * @param {string[]} processedIds - Array of already processed file IDs.
 * @param {string} mainSpreadsheetId - ID of the main spreadsheet.
 */
function processFile(file, destinationSpreadsheet, addressMap, openaiApiKey, processedIds, mainSpreadsheetId) {
  const PROCESSING_CONFIG = {
    BATCH_SIZE: 25,          // Number of valid rows to process per batch
    PAUSE_MINUTES: 5,        // Minutes to wait between batches
    VALID_ROW_COUNT: 0,      // Tracks valid rows processed in current batch
    DEBUG_MODE: false        // For testing with smaller batches
  };

  const sourceSheetId = file.getId();
  const fileName = file.getName();
  const mimeType = file.getMimeType();

  console.log(`Processing file: ${fileName} (ID: ${sourceSheetId}, MIME Type: ${mimeType})`);

  let sourceSheet;
  try {
    sourceSheet = openSourceSheet(file, mimeType);
  } catch (error) {
    console.error(`Processing file: Error opening or converting file ${fileName}: ${error}`);
    return;
  }

  if (!sourceSheet) {
    console.error(`Processing file: Unable to open sheet for file ${fileName}`);
    return;
  }

  const sourceData = sourceSheet.getDataRange().getValues();
  const headers = sourceData[0];
  const columnIndexMap = createColumnIndexMap(headers);

  const destinationSheet = destinationSpreadsheet.getSheetByName('Sheet1');
  const destinationData = destinationSheet.getDataRange().getValues().slice(1); // Skip the header row
  const currentRunEntries = []; // Array to store entries processed in this run

  // Build cache of processed event IDs
  const processedIdsCache = buildProcessedIdsCache(destinationSpreadsheet);
  console.log(`Built cache of ${processedIdsCache.size} processed event IDs`);

  let processedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  // Get the starting position from script properties
  const scriptProperties = PropertiesService.getScriptProperties();
  const startIndex = parseInt(scriptProperties.getProperty('CURRENT_ROW_INDEX') || '1');
  console.log(`Starting processing from row ${startIndex}`);

  // Process rows sequentially from the start position
  for (let rowIndex = startIndex; rowIndex < sourceData.length; rowIndex++) {
    try {
      // Skip header row
      if (rowIndex === 0) continue;

      const row = sourceData[rowIndex];
      const rowId = extractRowId(row, columnIndexMap);

      // Handle invalid rows
      if (rowId === null) {
        console.log(`Invalid row at source position ${rowIndex}`);
        invalidCount++;
        continue;
      }

      // Check if already processed
      if (processedIdsCache.has(rowId)) {
        console.log(`Skipping already processed row ${rowIndex} with ID ${rowId}`);
        skippedCount++;
        continue;
      }

      // Process the valid row
      processRow(row, rowIndex, columnIndexMap, destinationSheet, destinationData, 
                currentRunEntries, openaiApiKey, addressMap, processedIdsCache, 
                destinationSpreadsheet);
      processedCount++;
      PROCESSING_CONFIG.VALID_ROW_COUNT++;

      console.log(`Processing valid row #${PROCESSING_CONFIG.VALID_ROW_COUNT} at source row ${rowIndex}`);

      // Check if we've hit our batch size of valid processed rows
      if (PROCESSING_CONFIG.VALID_ROW_COUNT >= PROCESSING_CONFIG.BATCH_SIZE) {
        // Save our position and schedule next run
        scriptProperties.setProperty('CURRENT_ROW_INDEX', (rowIndex + 1).toString());
        scriptProperties.setProperty('CURRENT_FILE_ID', file.getId());

        // Clean up any existing triggers
        const triggers = ScriptApp.getProjectTriggers();
        triggers.forEach(trigger => {
          if (trigger.getHandlerFunction() === 'resumeProcessing') {
            ScriptApp.deleteTrigger(trigger);
          }
        });

        // Create new trigger for next batch
        ScriptApp.newTrigger('resumeProcessing')
          .timeBased()
          .after(PROCESSING_CONFIG.PAUSE_MINUTES * 60 * 1000)
          .create();

        console.log(`Batch complete at row ${rowIndex}. Processed ${PROCESSING_CONFIG.VALID_ROW_COUNT} valid rows.`);
        console.log(`Processed: ${processedCount}, Skipped: ${skippedCount}, Invalid: ${invalidCount}`);
        console.log(`Will resume in ${PROCESSING_CONFIG.PAUSE_MINUTES} minutes`);
        return;
      }
    } catch (error) {
      console.error(`Error processing row ${rowIndex + 1}: ${error}`);
      console.error(`Error stack: ${error.stack}`);
    }
  }

  // If we've reached here, we've processed the entire file
  console.log(`Completed processing file: ${fileName}`);
  scriptProperties.deleteProperty('CURRENT_ROW_INDEX');
  scriptProperties.deleteProperty('CURRENT_FILE_ID');
  processedIds.push(sourceSheetId);
  updateProcessedSheetIds(SpreadsheetApp.openById(mainSpreadsheetId)
    .getSheetByName('Processed Sheet IDs'), processedIds);

  // Remove outdated events after the entire file has been processed
  removeOutdatedEvents(destinationSpreadsheet);

  console.log(`Processing file: Total rows processed: ${processedCount}`);
  console.log(`Total rows skipped: ${skippedCount}`);
  console.log(`Total invalid rows: ${invalidCount}`);
}

function extractRowId(row, columnIndexMap) {
  // Log the start of the function
  console.log('extractRowId : Starting extractRowId function');

  // Array of possible ID column headers
  const idHeaders = ['id', 'ID', 'Id', 'event_id', 'Event ID', 'EventId', `postId`];

  // Loop through possible headers and return the first match
  for (const header of idHeaders) {
    const index = columnIndexMap[header.toLowerCase()];
    if (index !== undefined) {
      const id = row[index];
      console.log(`ID found: ${id} in column: ${header}`);
      return id ? String(id) : null;
    }
  }

  // Log if no ID was found
  console.log('extractRowId : No ID found in the row');
  return null;
}

/**
 * Opens the source sheet based on its file type.
 * @param {GoogleAppsScript.Drive.File} file - The file to open.
 * @param {string} mimeType - The MIME type of the file.
 * @return {GoogleAppsScript.Spreadsheet.Sheet} The opened sheet.
 */
function openSourceSheet(file, mimeType) {
  if (mimeType === MimeType.GOOGLE_SHEETS) {
    return SpreadsheetApp.openById(file.getId()).getActiveSheet();
  } else if (mimeType === MimeType.MICROSOFT_EXCEL || mimeType === MimeType.MICROSOFT_EXCEL_LEGACY) {
    // Read Excel file using Drive API
    const fileId = file.getId();
    const url = `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?tqx=out:csv`;
    const response = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + ScriptApp.getOAuthToken()
      }
    });
    const csvData = Utilities.parseCsv(response.getContentText());
    
    // Create an object that mimics a Google Sheets object
    return {
      getDataRange: function() {
        return {
          getValues: function() {
            return csvData;
          }
        };
      },
      getRange: function(row, column, numRows, numColumns) {
        return {
          getValues: function() {
            return csvData.slice(row - 1, row - 1 + numRows).map(r => r.slice(column - 1, column - 1 + numColumns));
          }
        };
      }
    };
  } else {
    throw new Error(`Unsupported file type: ${mimeType} for file ${file.getName()}`);
  }
}

// REPLACE the existing processRow function with this version

/**
 * Processes a single row of data from the source sheet.
 */
/**
 * Processes a single row of data from the source sheet.
 */

// changing on Oct 31 
// ==========================================
// MODIFIED PROCESS ROW FUNCTION (fileProcessing.gs)
// ==========================================


/**
 * Processes a single row of data from the source sheet.
 * Enhanced with improved image reference tracking and proper profile picture handling.
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
  console.log(`processRow: Processing row ${rowIndex + 2}`);
  
  const extractedData = extractRowData(row, columnIndexMap);

  if (!extractedData.id) {
    extractedData.id = generateUniqueId(extractedData);
    console.log(`processRow: Generated unique ID for row ${rowIndex + 2}: ${extractedData.id}`);
  }

  const currentId = String(extractedData.id);
  
  console.log(`processRow: Processing data with ID: ${currentId}`);

  // Initialize the image tracking system with all images from this post
  const allImages = [
    ...extractedData.mediaUrls,
    extractedData.profilePicUrl
  ].filter(Boolean); // Filter out any null/undefined/empty values
  
  initializeImageTracking(allImages);
  console.log(`processRow: Initialized image tracking with ${allImages.length} images`);

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

  parsedData.forEach(item => {
    const pageName = extractedData.pageName.trim().toLowerCase();
    const venueName = (item.establishment || '').trim().toLowerCase();

    // 1) If GPT gave us an explicit additionalLocation, blank it…
    // 2) …OR if the establishment name isn’t exactly the page name, blank it too.
    if (
      item.additionalLocation ||
      (venueName && venueName !== pageName)
    ) {
      item.address = '';
    }
  });
  
  if (parsedData && parsedData.length > 0) {
    console.log(`processRow: Successfully parsed ${parsedData.length} events/specials from the post`);
    
    // Process each event/special
    parsedData.forEach(data => {
      console.log("processRow: Processing parsed data item:", data.name);
      
                      // Canonicalize establishment from Contact Info before duplicate detection (logging-only change)
        (function () {
          try {
            const pageNameLog = (extractedData.pageName || '').trim();
            const estBefore  = (data.establishment || '').trim();
            const addlBefore = (data.additionalLocation || '').trim();

            console.log(
              `processRow[pre-dup]: pageName="${pageNameLog}" | establishment(raw)="${estBefore}" | additionalLocation(raw)="${addlBefore}"`
            );

            const rawVenue = data.establishment || data.additionalLocation || '';
            const venueSource = data.establishment ? 'establishment'
                              : (data.additionalLocation ? 'additionalLocation' : 'none');

            console.log(
              `processRow[pre-dup]: venue source chosen for canonicalization: ${venueSource} → "${rawVenue}"`
            );

            if (rawVenue && typeof findVenueInContactInfo === 'function') {
              const v = findVenueInContactInfo(rawVenue);
              // Try common property names we’ve seen the lookup return
              const canon =
                (v && (v.name || v.canonicalName || v.matchedName || v.entryName)) ||
                (typeof v === 'string' ? v : null);

              console.log(
                `processRow[pre-dup]: findVenueInContactInfo("${rawVenue}") → canonical="${canon || ''}"`
              );

              if (canon && canon !== data.establishment) {
                var cleanedCanon = (typeof normalizeEstablishmentForCmp === 'function')
                  ? normalizeEstablishmentForCmp(canon)
                  : String(canon).replace(/\s*\|\s*charlottetown\s*pe\s*$/i, '');

                Logger.log(
                  'processRow: Canonicalized establishment for dup-check: "' +
                    rawVenue +
                    '" → "' +
                    cleanedCanon +
                    '" (stripped from "' + canon + '")'
                );

                data.establishment = cleanedCanon;
              }

            }

            console.log(
              `processRow[pre-dup]: final fields for dup-check → establishment="${(data.establishment || '').trim()}", additionalLocation="${(data.additionalLocation || '').trim()}"`
            );
          } catch (e) {
            console.log('processRow[pre-dup]: venue canonicalization skipped (' + e + ')');
          }
        })();


                // Check for duplicates and either update or append (add logging-only prelude)
        console.log(
          `processRow[dup-check]: calling isDuplicate with → ` +
          `name="${(data.name || '').trim()}", ` +
          `desc="${(data.description || '').trim()}", ` +
          `est="${(data.establishment || '').trim()}", ` +
          `addLoc="${(data.additionalLocation || '').trim()}", ` +
          `date="${(data.startDate || '').trim()}", ` +
          `start="${(data.startTime || '').trim()}", end="${(data.endTime || '').trim()}"`
        );

        const duplicateResult = isDuplicate(
          data,
          destinationData,
          currentRunEntries,
          extractedData.mediaUrls || []
        );



      
      if (duplicateResult === true) {
        console.log("processRow: Duplicate found for:", data.name);
        
        // Find the matching entry that caused the duplicate
        const matchingEntry = findMatchingEntry(data, destinationData, currentRunEntries);
        
        if (matchingEntry) {
          console.log(`processRow: Found matching entry in ${matchingEntry.source}`);
          
          // Create the matchInfo object
          const matchInfo = {
            source: matchingEntry.source, // 'sheet' or 'currentRun'
            reference: matchingEntry.reference,
            existingData: matchingEntry.data
          };
          
          // Process updates for the duplicate
          processUpdateForDuplicate(
            data, 
            matchInfo, 
            extractedData, 
            openaiApiKey, 
            destinationSheet, 
            currentRunEntries,
            destinationSpreadsheet,
            null // No GPT assessment available
          );
        } else {
          console.log('processRow: Duplicate found but matching entry not identified');
        }
      } else {
        console.log("processRow: Not a duplicate, adding as new entry:", data.name);
        
        // Handle the relevant image - mark it as relevant so it won't be deleted
        if (data.relevantImageIndex !== undefined && data.relevantImageIndex !== -1) {
          const relevantImageUrl = extractedData.mediaUrls[data.relevantImageIndex];
          if (relevantImageUrl) {
            console.log(`processRow: Using image at index ${data.relevantImageIndex} as relevant image: ${relevantImageUrl}`);
            data.relevantImageUrl = relevantImageUrl;
            data.cachedImageUrl = relevantImageUrl;  // Use the same URL for cachedImageUrl
            
            // Mark this image as relevant (increment its reference count)
            markImageAsRelevant(relevantImageUrl);
          } else {
            console.log(`processRow: Relevant image URL not found for index ${data.relevantImageIndex}`);
            data.relevantImageUrl = '';
            data.cachedImageUrl = '';
          }
        } else {
          console.log(`processRow: No relevant image index provided for this event`);
          data.relevantImageUrl = '';
          data.cachedImageUrl = '';
        }
        
        // IMPORTANT FIX: Also mark the profile picture as relevant for this event
        if (extractedData.profilePicUrl) {
          console.log(`processRow: Marking profile picture as relevant: ${extractedData.profilePicUrl}`);
          markImageAsRelevant(extractedData.profilePicUrl);
          
          // Ensure the profile pic is assigned to the event's icon field
          data.icon = extractedData.profilePicUrl;
        }

        // Add the event to the destination sheet
        appendToDestinationSheet(destinationSheet, data, destinationSpreadsheet);
        currentRunEntries.push(data);
        
        // Add the processed ID to the cache
        processedIdsCache.add(String(data.id));
        
        console.log(`processRow: Successfully added new event: ${data.name}`);
      }
    });
    
    // After processing all events from this row, finalize image processing
    // This will delete images with zero references and preserve those with references
    console.log("processRow: All events processed, finalizing image handling");
    const imageResults = finalizeImageProcessing();
    console.log(`processRow: Image finalization complete. Deleted ${imageResults.deleted.length} unused images, preserved ${imageResults.preserved.length} images.`);
  } else {
    console.log(`processRow: No valid data parsed for row ${rowIndex + 2}`);
    
    // No valid events were parsed, so all images can be deleted
    console.log("processRow: No valid events found, deleting all images");
    allImages.forEach(imageUrl => {
      if (imageUrl) {
        deleteCloudStorageImage(imageUrl, true); // Force delete since no events need these images
      }
    });
  }
  
  console.log(`processRow: Finished processing row ${rowIndex + 2}`);
}
/**
 * Helper function to find the matching entry that triggered the duplicate detection.
 * Searches through both destinationData and currentRunEntries.
 * 
 * @param {Object} newData - The new data being checked
 * @param {Array} destinationSheetData - Existing data in the destination sheet
 * @param {Array} currentRunEntries - Entries processed in the current run
 * @return {Object|null} Object with source, reference, and data of the matching entry, or null if not found
 */
function findMatchingEntry(newData, destinationSheetData, currentRunEntries) {
  console.log("findMatchingEntry: Searching for the matching entry that caused the duplicate detection");
  
  // First check destinationSheetData
  for (let i = 0; i < destinationSheetData.length; i++) {
    if (isDuplicateEntry(newData, destinationSheetData[i])) {
      console.log(`findMatchingEntry: Found match in destination sheet at index ${i}`);
      return {
        source: 'sheet',
        reference: i + 2, // +2 because sheet is 1-based and has a header row
        data: destinationSheetData[i]
      };
    }
  }
  
  // Then check currentRunEntries
  for (let i = 0; i < currentRunEntries.length; i++) {
    if (isDuplicateEntry(newData, currentRunEntries[i])) {
      console.log(`findMatchingEntry: Found match in current run entries at index ${i}`);
      return {
        source: 'currentRun',
        reference: currentRunEntries[i], // Use the actual entry as the reference
        data: currentRunEntries[i]
      };
    }
  }
  
  console.log("findMatchingEntry: No matching entry found. This is unexpected since isDuplicate returned true.");
  return null;
}

/**
 * Processes an update for a duplicate entry with improved image handling including profile pictures.
 * @param {Object} newData - The new data from the current post.
 * @param {Object} matchInfo - Information about the match.
 * @param {Object} extractedData - The extracted data from the row.
 * @param {string} openaiApiKey - The OpenAI API key.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The destination sheet.
 * @param {Array} currentRunEntries - The current run entries array.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} destinationSpreadsheet - The parent spreadsheet object.
 * @param {Object} gptAssessment - The GPT assessment of the duplicate relationship (optional).
 */
function processUpdateForDuplicate(newData, matchInfo, extractedData, openaiApiKey, destinationSheet, currentRunEntries, destinationSpreadsheet, gptAssessment) {
  console.log('processUpdateForDuplicate: Processing potential update for duplicate');
  
  // Retrieve the full existing record
  const existingRecord = retrieveExistingRecord(matchInfo, destinationSheet, currentRunEntries);
  
  if (!existingRecord) {
    console.error('processUpdateForDuplicate: Failed to retrieve existing record');
    return;
  }
  
  // Log the existing and new record data for comparison
  console.log('processUpdateForDuplicate: Existing record:', JSON.stringify({
    name: existingRecord.name || existingRecord[3],
    startDate: existingRecord.startDate || existingRecord[7],
    startTime: existingRecord.startTime || existingRecord[9],
    endTime: existingRecord.endTime || existingRecord[10]
  }, null, 2));
  
  console.log('processUpdateForDuplicate: New record:', JSON.stringify({
    name: newData.name,
    startDate: newData.startDate,
    startTime: newData.startTime,
    endTime: newData.endTime
  }, null, 2));
  
  // Prepare image information for comparison
  const imageInfo = {
    existingImageUrl: existingRecord.relevantImageUrl || '',
    newImageUrl: extractedData.mediaUrls[newData.relevantImageIndex] || ''
  };
  
  // Ensure all image URLs are accessible
  newData.icon = extractedData.profilePicUrl || '';
  newData.image = extractedData.mediaUrls[0] || '';
  
  console.log('processUpdateForDuplicate: Existing image URL:', imageInfo.existingImageUrl);
  console.log('processUpdateForDuplicate: New image URL:', imageInfo.newImageUrl);
  console.log('processUpdateForDuplicate: New profile icon URL:', newData.icon);
  console.log('processUpdateForDuplicate: New post image URL:', newData.image);
  
  let updateRecommendations;
  
  // If we have GPT assessment results, use them directly
  if (gptAssessment) {
    console.log('processUpdateForDuplicate: Using GPT assessment results');
    
    // Convert the GPT assessment into the update recommendations format
    updateRecommendations = {
      fields: gptAssessment.fieldsToUpdate.map(fieldName => ({
        fieldName: fieldName,
        updateAction: 'use_new',
        reason: `GPT recommended update for ${fieldName}`
      })),
      imagePreference: 'use_new', // Default to using new image when GPT recommends updates
      imageReason: 'Using latest image based on GPT recommendation',
      overallAssessment: gptAssessment.reasonForDetermination
    };
  } else {
    // Otherwise, use the standard GPT comparison
    console.log('processUpdateForDuplicate: No GPT assessment available, using standard comparison');
    updateRecommendations = compareRecordsWithGPT(existingRecord, newData, openaiApiKey);
  }
  
    // ---- Guard: prevent blank new description from overwriting existing ----
  try {
    if (updateRecommendations && Array.isArray(updateRecommendations.fields)) {
      updateRecommendations.fields = updateRecommendations.fields.map(f => {
        // Handle both object form ({ fieldName, updateAction, ... }) and string form ("description")
        const fname = (f && typeof f === 'object') ? f.fieldName : String(f || '');
        const newDescBlank = String(newData && newData.description || '').trim() === '';

        if (fname === 'description' && newDescBlank) {
          console.log('processUpdateForDuplicate: Blank new description detected; preserving existing description.');
          return {
            fieldName: 'description',
            updateAction: 'keep_existing',
            reason: 'New description is blank; preserving existing.'
          };
        }
        return f;
      });
    }
  } catch (e) {
    console.log('processUpdateForDuplicate: description blank-guard skipped (' + e + ')');
  }

  if (!updateRecommendations) {

    console.error('processUpdateForDuplicate: Failed to get update recommendations');
    
    // Without recommendations, fall back to manual field detection
    console.log('processUpdateForDuplicate: Falling back to basic change detection');
    const changes = detectMeaningfulChanges(existingRecord, newData);
    
    if (changes.significantChanges) {
      console.log('processUpdateForDuplicate: Significant changes detected through fallback method');
      // Apply critical updates using simple rules
      applyBasicUpdates(existingRecord, newData, matchInfo, destinationSheet, currentRunEntries);
    } else {
      console.log('processUpdateForDuplicate: No significant changes detected through fallback method');
      
      // Check if we have profile icon to update
      if (newData.icon && (!existingRecord.icon || existingRecord.icon === '')) {
        console.log('processUpdateForDuplicate: Found new profile icon to update');
        existingRecord.icon = newData.icon;
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
        
        // IMPORTANT FIX: Mark the profile picture as relevant
        if (newData.icon) {
          console.log(`processUpdateForDuplicate: Marking profile icon as relevant: ${newData.icon}`);
          markImageAsRelevant(newData.icon);
        }
      }
      
      // Check if we have relevant image to update
      if (imageInfo.newImageUrl && (!imageInfo.existingImageUrl || imageInfo.existingImageUrl === '')) {
        console.log('processUpdateForDuplicate: Found new relevant image to update');
        existingRecord.relevantImageUrl = imageInfo.newImageUrl;
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
        
        // Mark this image as relevant since we're using it
        markImageAsRelevant(imageInfo.newImageUrl);
      }
    }
    
    return;
  }
  
  // Add image-specific fields if they're missing
  const ensureImageFields = updateRecommendations.fields.some(f => 
    f.fieldName.toLowerCase().includes('icon') || 
    f.fieldName.toLowerCase().includes('image'));
  
  if (!ensureImageFields) {
    // Add image fields if they're not already in the recommendations
    if (newData.icon && (!existingRecord.icon || existingRecord.icon === '')) {
      updateRecommendations.fields.push({
        fieldName: 'icon',
        updateAction: 'use_new',
        reason: 'New profile image available'
      });
    }
    
    if (imageInfo.newImageUrl && (!imageInfo.existingImageUrl || imageInfo.existingImageUrl === '')) {
      updateRecommendations.fields.push({
        fieldName: 'relevantImageUrl',
        updateAction: 'use_new',
        reason: 'New relevant image available'
      });
    }
  }
  
  // Apply the recommended updates
  const updateResult = applyRecommendedUpdates(existingRecord, newData, updateRecommendations, imageInfo);
  
  if (updateResult.changesMade) {
    console.log('processUpdateForDuplicate: Changes were made, applying updates');
    
    // Apply the updates based on where the duplicate was found
    if (matchInfo.source === 'sheet') {
      // Update the record in the destination sheet
      updateRecordInSheet(matchInfo.reference, updateResult.updatedRecord, destinationSheet);
      console.log(`processUpdateForDuplicate: Updated record in sheet at row ${matchInfo.reference}`);
    } else if (matchInfo.source === 'currentRun') {
      // Update the record in the current run entries array
      const index = currentRunEntries.indexOf(matchInfo.reference);
      if (index !== -1) {
        currentRunEntries[index] = updateResult.updatedRecord;
        console.log(`processUpdateForDuplicate: Updated record in current run entries at index ${index}`);
      } else {
        console.error('processUpdateForDuplicate: Failed to find entry in currentRunEntries');
      }
    }
    
    // If we're using a new image from this post, mark it as relevant
    if (updateRecommendations.imagePreference === 'use_new' && imageInfo.newImageUrl) {
      console.log(`processUpdateForDuplicate: Marking new image as relevant: ${imageInfo.newImageUrl}`);
      markImageAsRelevant(imageInfo.newImageUrl);
    }
    
    // IMPORTANT FIX: Mark the profile picture as relevant if we're keeping it
    const updatedIcon = updateResult.updatedRecord.icon;
    if (updatedIcon) {
      console.log(`processUpdateForDuplicate: Marking profile icon as relevant: ${updatedIcon}`);
      markImageAsRelevant(updatedIcon);
    }
  } else {
    console.log('processUpdateForDuplicate: No changes were made, checking for image updates');
    
    // Special handling - even if no content changes, check if we need to update images
    if ((!existingRecord.relevantImageUrl || existingRecord.relevantImageUrl === '') && 
        (imageInfo.newImageUrl && imageInfo.newImageUrl !== '')) {
      console.log('processUpdateForDuplicate: No content changes, but adding missing image');
      existingRecord.relevantImageUrl = imageInfo.newImageUrl;
      existingRecord.cachedImageUrl = imageInfo.newImageUrl;
      
      if (matchInfo.source === 'sheet') {
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
        console.log(`processUpdateForDuplicate: Updated image in record at row ${matchInfo.reference}`);
      }
      
      // Mark this image as relevant since we're using it
      markImageAsRelevant(imageInfo.newImageUrl);
    }
    
    // IMPORTANT FIX: Also check if we need to update profile icon
        if (
          (!existingRecord.icon || existingRecord.icon === '') &&
          newData.icon &&
          newData.icon !== '' &&
          newData.facebookUrl === existingRecord.facebookUrl
        ) {
      console.log('processUpdateForDuplicate: No content changes, but adding missing profile icon');
      existingRecord.icon = newData.icon;
      
      if (matchInfo.source === 'sheet') {
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
        console.log(`processUpdateForDuplicate: Updated profile icon in record at row ${matchInfo.reference}`);
      }
      
      // Mark the profile icon as relevant
      markImageAsRelevant(newData.icon);
    }
  }
  
  console.log('processUpdateForDuplicate: Finished processing duplicate');
}

/**
 * Safely cleans up images, ensuring that images used in a record are not deleted.
 * This is a helper function that can be added to fileProcessing.gs
 * 
 * @param {Array} allImageUrls - Array of all image URLs to consider for cleanup
 * @param {Object} record - The record object that might reference some images
 * @param {Array} additionalImagesToKeep - Optional array of extra image URLs to preserve
 */
function safeCleanupImages(allImageUrls, record, additionalImagesToKeep = []) {
  console.log('safeCleanupImages: Starting safe image cleanup process');
  
  // Early return if no images to process
  if (!allImageUrls || allImageUrls.length === 0) {
    console.log('safeCleanupImages: No images to process');
    return;
  }
  
  // Collect all image URLs from the record
  const imageFieldNames = [
    'icon', 'image', 'relevantImageUrl', 'cachedImageUrl', 
    'profilePicUrl', 'thumbnail', 'sharedPostThumbnail'
  ];
  
  // Get all image URLs from the record
  const usedImages = [];
  
  // Add images from explicit fields
  imageFieldNames.forEach(fieldName => {
    if (record[fieldName]) {
      usedImages.push(record[fieldName]);
    }
  });
  
  // Add any additional images we want to keep
  if (additionalImagesToKeep && additionalImagesToKeep.length > 0) {
    usedImages.push(...additionalImagesToKeep);
  }
  
  // Also check for any field that might contain an image URL
  Object.keys(record).forEach(key => {
    const value = record[key];
    if (typeof value === 'string' && 
        (value.includes('image') || value.includes('photo') || value.includes('thumbnail')) &&
        (value.startsWith('http') || value.startsWith('https'))) {
      usedImages.push(value);
    }
  });
  
  // Get unique used images
  const uniqueUsedImages = [...new Set(usedImages)].filter(Boolean);
  
  // Find images that aren't used in the record
  const unusedImages = allImageUrls.filter(url => !uniqueUsedImages.includes(url));
  
  console.log(`safeCleanupImages: Found ${uniqueUsedImages.length} images used in record`);
  console.log(`safeCleanupImages: Found ${unusedImages.length} unused images that can be safely deleted`);
  
  // Log the images we're keeping
  if (uniqueUsedImages.length > 0) {
    console.log('safeCleanupImages: Keeping these images:');
    uniqueUsedImages.forEach((url, index) => {
      console.log(`  [${index + 1}/${uniqueUsedImages.length}] ${url}`);
    });
  }
  
  // Delete unused images
  if (unusedImages.length > 0) {
    console.log('safeCleanupImages: Deleting these unused images:');
    unusedImages.forEach((url, index) => {
      console.log(`  [${index + 1}/${unusedImages.length}] ${url}`);
      if (url) {
        deleteCloudStorageImage(url);
      }
    });
  }
  
  console.log('safeCleanupImages: Safe image cleanup complete');
}

/**
 * Processes an update for a duplicate entry with improved image handling.
 * Ensures that any image chosen for the updated record is explicitly marked as “referenced”
 * before finalizeImageProcessing() runs, so it won’t be deleted in this pass.
 * @param {Object} newData
 * @param {Object} matchInfo
 * @param {Object} extractedData
 * @param {string} openaiApiKey
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet
 * @param {Array} currentRunEntries
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} destinationSpreadsheet
 * @param {Object} gptAssessment
 */
function processUpdateForDuplicate(newData, matchInfo, extractedData, openaiApiKey, destinationSheet, currentRunEntries, destinationSpreadsheet, gptAssessment) {
  console.log('processUpdateForDuplicate: Processing potential update for duplicate');
  console.log('processUpdateForDuplicate: Match info:', JSON.stringify(matchInfo, null, 2));

  // Retrieve the full existing record
  const existingRecord = retrieveExistingRecord(matchInfo, destinationSheet, currentRunEntries);
  if (!existingRecord) {
    console.error('processUpdateForDuplicate: Failed to retrieve existing record');
    return;
  }

  // Log the existing and new record data for comparison
  console.log('processUpdateForDuplicate: Existing record:', JSON.stringify({
    name: existingRecord.name || existingRecord[3],
    startDate: existingRecord.startDate || existingRecord[7],
    startTime: existingRecord.startTime || existingRecord[9],
    endTime: existingRecord.endTime || existingRecord[10]
  }, null, 2));
  console.log('processUpdateForDuplicate: New record:', JSON.stringify({
    name: newData.name,
    startDate: newData.startDate,
    startTime: newData.startTime,
    endTime: newData.endTime
  }, null, 2));

  // Prepare image information for comparison
  const imageInfo = {
    existingImageUrl: existingRecord.relevantImageUrl || '',
    newImageUrl: extractedData.mediaUrls[newData.relevantImageIndex] || ''
  };

  // Ensure all image URLs are accessible
  newData.icon = extractedData.profilePicUrl || '';
  newData.image = extractedData.mediaUrls[0] || '';

  console.log('processUpdateForDuplicate: Existing image URL:', imageInfo.existingImageUrl);
  console.log('processUpdateForDuplicate: New image URL:', imageInfo.newImageUrl);
  console.log('processUpdateForDuplicate: New profile icon URL:', newData.icon);
  console.log('processUpdateForDuplicate: New post image URL:', newData.image);

  let updateRecommendations;

  if (gptAssessment) {
    console.log('processUpdateForDuplicate: Using GPT assessment results');
    updateRecommendations = {
      fields: gptAssessment.fieldsToUpdate.map(fieldName => ({
        fieldName: fieldName,
        updateAction: 'use_new',
        reason: `GPT recommended update for ${fieldName}`
      })),
      imagePreference: 'use_new',
      imageReason: 'Using latest image based on GPT recommendation',
      overallAssessment: gptAssessment.reasonForDetermination
    };
    console.log('processUpdateForDuplicate: Generated update recommendations from GPT assessment:', JSON.stringify(updateRecommendations, null, 2));
  } else {
    console.log('processUpdateForDuplicate: No GPT assessment available, using standard comparison');
    updateRecommendations = compareRecordsWithGPT(existingRecord, newData, openaiApiKey);
  }

  // Helper to mark every URL we end up keeping as “referenced” (so finalizer won’t delete it)
  function markAllUsedImagesAsReferenced(recordLike, extraUrls = []) {
    const candidateUrls = [
      recordLike && recordLike.icon,
      recordLike && recordLike.image,
      recordLike && recordLike.relevantImageUrl,
      recordLike && recordLike.cachedImageUrl,
      newData.icon,
      imageInfo.newImageUrl,
      extractedData.profilePicUrl,
      ...extraUrls
    ].filter(Boolean);

    const unique = Array.from(new Set(candidateUrls));
    if (unique.length) {
      console.log('processUpdateForDuplicate: Marking these images as referenced so they are preserved:');
      unique.forEach((url, i) => {
        console.log(`  [keep ${i + 1}] ${url}`);
        markImageAsRelevant(url);
      });
    }
    return unique;
  }

  if (!updateRecommendations) {
    console.error('processUpdateForDuplicate: Failed to get update recommendations');
    console.log('processUpdateForDuplicate: Falling back to basic change detection');

    const changes = detectMeaningfulChanges(existingRecord, newData);
    if (changes.significantChanges) {
      console.log('processUpdateForDuplicate: Significant changes detected through fallback method');
      applyBasicUpdates(existingRecord, newData, matchInfo, destinationSheet, currentRunEntries);
    } else {
      console.log('processUpdateForDuplicate: No significant changes detected through fallback method');

      if (
        newData.icon &&
        (!existingRecord.icon || existingRecord.icon === '') &&
        newData.facebookUrl === existingRecord.facebookUrl
      ) {
        console.log('processUpdateForDuplicate: Found new profile icon to update');
        existingRecord.icon = newData.icon;
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
      }

      if (imageInfo.newImageUrl && (!imageInfo.existingImageUrl || imageInfo.existingImageUrl === '')) {
        console.log('processUpdateForDuplicate: Found new relevant image to update');
        existingRecord.relevantImageUrl = imageInfo.newImageUrl;
        existingRecord.cachedImageUrl = imageInfo.newImageUrl;
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
      }
    }

    // PRESERVE used images, only mark others for deletion
    const usedNow = markAllUsedImagesAsReferenced(existingRecord);
    const toMaybeDelete = extractedData.mediaUrls.filter(u => u && !usedNow.includes(u));
    toMaybeDelete.forEach(url => {
      console.log(`processUpdateForDuplicate: Marking unused image for potential deletion: ${url}`);
      markImageForDeletion(url);
    });
    return;
  }

  // Ensure icon/image fields are considered in recommendations
  const ensureImageFields = updateRecommendations.fields.some(f =>
    f.fieldName.toLowerCase().includes('icon') || f.fieldName.toLowerCase().includes('image')
  );
  if (!ensureImageFields) {
    if (newData.icon && (!existingRecord.icon || existingRecord.icon === '')) {
      updateRecommendations.fields.push({
        fieldName: 'icon',
        updateAction: 'use_new',
        reason: 'New profile image available'
      });
    }
    if (imageInfo.newImageUrl && (!imageInfo.existingImageUrl || imageInfo.existingImageUrl === '')) {
      updateRecommendations.fields.push({
        fieldName: 'relevantImageUrl',
        updateAction: 'use_new',
        reason: 'New relevant image available'
      });
    }
  }

  const updateResult = applyRecommendedUpdates(existingRecord, newData, updateRecommendations, imageInfo);

  if (updateResult.changesMade) {
    console.log('processUpdateForDuplicate: Changes were made, applying updates');

    if (matchInfo.source === 'sheet') {
      updateRecordInSheet(matchInfo.reference, updateResult.updatedRecord, destinationSheet);
      console.log(`processUpdateForDuplicate: Updated record in sheet at row ${matchInfo.reference}`);
    } else if (matchInfo.source === 'currentRun') {
      const index = currentRunEntries.indexOf(matchInfo.reference);
      if (index !== -1) {
        currentRunEntries[index] = updateResult.updatedRecord;
        console.log(`processUpdateForDuplicate: Updated record in current run entries at index ${index}`);
      } else {
        console.error('processUpdateForDuplicate: Failed to find entry in currentRunEntries');
      }
    }

    // 1) Explicitly mark all used URLs as referenced
    const usedImages = markAllUsedImagesAsReferenced(updateResult.updatedRecord);

    // 2) Only mark *other* media from this row for potential deletion
    const imagesToMarkForDeletion = extractedData.mediaUrls.filter(url => url && !usedImages.includes(url));
    console.log(`processUpdateForDuplicate: Marking ${imagesToMarkForDeletion.length} unused images for potential deletion`);
    imagesToMarkForDeletion.forEach(url => {
      console.log(`  [delete?] ${url}`);
      markImageForDeletion(url);
    });
  } else {
    console.log('processUpdateForDuplicate: No content changes were made, checking for image updates');

    if ((!existingRecord.relevantImageUrl || existingRecord.relevantImageUrl === '') &&
        (imageInfo.newImageUrl && imageInfo.newImageUrl !== '')) {
      console.log('processUpdateForDuplicate: No content changes, but adding missing image');
      existingRecord.relevantImageUrl = imageInfo.newImageUrl;
      existingRecord.cachedImageUrl = imageInfo.newImageUrl;

      if (matchInfo.source === 'sheet') {
        updateRecordInSheet(matchInfo.reference, existingRecord, destinationSheet);
        console.log(`processUpdateForDuplicate: Updated image in record at row ${matchInfo.reference}`);
      }
    }

    // Mark used images as referenced (icon, chosen post image, etc.)
    const usedNow = markAllUsedImagesAsReferenced(existingRecord);

    // Mark all other media from this row for potential deletion
    const otherImages = extractedData.mediaUrls.filter(url => url && !usedNow.includes(url));
    otherImages.forEach(url => {
      console.log(`processUpdateForDuplicate: Marking unused image for potential deletion: ${url}`);
      markImageForDeletion(url);
    });
  }

  console.log('processUpdateForDuplicate: Finished processing duplicate');
}

/**
 * Updates a record in the destination sheet with improved logging and support for social metrics.
 * Enhanced to handle social engagement metrics.
 * @param {number} rowIndex - The row index in the sheet (1-based).
 * @param {Object} updatedRecord - The updated record data.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet containing the record.
 */
function updateRecordInSheet(rowIndex, updatedRecord, sheet) {
  try {
    console.log(`updateRecordInSheet: Updating record at row ${rowIndex}`);
    console.log(`updateRecordInSheet: Updated record data:`, JSON.stringify(updatedRecord, null, 2));
    
    // Get the header row to determine field positions
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log(`updateRecordInSheet: Sheet headers:`, headers);
    
    // Create a map for headers and their positions
    const headerMap = {};
    headers.forEach((header, index) => {
      headerMap[header.toLowerCase()] = index;
    });
    
    // Time fields to pay special attention to
    const timeFields = ['start time', 'end time', 'start date', 'end date'];
    
    // Get current values
    const currentValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    
    // Create a copy of current values to prepare updated version
    const updatedValues = [...currentValues];
    
    // Track what fields were actually updated
    const fieldsUpdated = [];
    
    // Map of important field names to their object property names
    const fieldMapping = {
      'start time': 'startTime',
      'end time': 'endTime',
      'start date': 'startDate',
      'end date': 'endDate',
      'event name': 'name',
      'description': 'description',
      'establishment': 'establishment',
      'address': 'address',
      'ticket price': 'ticketPrice',
      'ticket link': 'ticketLink',
      'icon': 'icon',
      'image': 'image',
      'relevantimageurl': 'relevantImageUrl',
      'relevantimageUrlcolumn': 'relevantImageUrl',
      // Add social engagement metrics mappings
      'likes': 'likes',
      'shares': 'shares',
      'comments': 'comments',
      'topreactionscount': 'topReactionsCount'
    };
    
    // Update specific fields
    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase();
      const propertyName = fieldMapping[headerLower];
      
      if (propertyName && updatedRecord[propertyName] !== undefined) {
        let newValue;
        
        // Format values based on field type
        if (headerLower === 'start time' || headerLower === 'end time') {
          newValue = formatTime(updatedRecord[propertyName]);
          console.log(`updateRecordInSheet: Formatting time for ${header}: ${updatedRecord[propertyName]} -> ${newValue}`);
        }
        else if (headerLower === 'start date' || headerLower === 'end date') {
          newValue = formatDate(updatedRecord[propertyName]);
          console.log(`updateRecordInSheet: Formatting date for ${header}: ${updatedRecord[propertyName]} -> ${newValue}`);
        }
        // Special handling for social engagement metrics
        else if (['likes', 'shares', 'comments', 'topreactionscount'].includes(headerLower)) {
          // Make sure we're storing the numeric value if possible
          const numValue = parseInt(updatedRecord[propertyName], 10);
          newValue = isNaN(numValue) ? updatedRecord[propertyName] : numValue;
          console.log(`updateRecordInSheet: Formatting social metric ${header}: ${updatedRecord[propertyName]} -> ${newValue}`);
        }
        else {
          newValue = updatedRecord[propertyName];
        }
        
        // Set the value if it's different
        if (currentValues[index] !== newValue) {
          updatedValues[index] = newValue;
          fieldsUpdated.push({
            header: header,
            oldValue: currentValues[index],
            newValue: newValue
          });
        }
        
        // Special attention to time fields
        if (timeFields.includes(headerLower)) {
          console.log(`updateRecordInSheet: Time field "${header}" - Current value: "${currentValues[index]}", New value: "${newValue}"`);
        }
      }
    });
    
    // Double-check important fields directly by name to ensure they're updated
    // This handles cases where the field mapping might not match exactly
    const criticalFields = [
      { header: 'Start Time', property: 'startTime' },
      { header: 'End Time', property: 'endTime' },
      { header: 'Start Date', property: 'startDate' },
      { header: 'End Date', property: 'endDate' },
      /* UPDATED FIELD MAPPING HERE */
      { header: 'RelevantImageUrlColumn', property: 'relevantImageUrl' },
      { header: 'Event ID', property: 'id' },
      // Add social engagement metrics
      { header: 'Likes', property: 'likes' },
      { header: 'Shares', property: 'shares' },
      { header: 'Comments', property: 'comments' },
      { header: 'TopReactionsCount', property: 'topReactionsCount' }
    ];
    
    criticalFields.forEach(field => {
      const index = headers.findIndex(h => h.toLowerCase() === field.header.toLowerCase());
      if (index !== -1 && updatedRecord[field.property] !== undefined) {
        let formattedValue = updatedRecord[field.property];
        
        // Format times and dates appropriately
        if (field.property === 'startTime' || field.property === 'endTime') {
          formattedValue = formatTime(updatedRecord[field.property]);
        } else if (field.property === 'startDate' || field.property === 'endDate') {
          formattedValue = formatDate(updatedRecord[field.property]);
        } else if (['likes', 'shares', 'comments', 'topReactionsCount'].includes(field.property)) {
          // Make sure we're storing the numeric value if possible for metrics
          const numValue = parseInt(updatedRecord[field.property], 10);
          formattedValue = isNaN(numValue) ? updatedRecord[field.property] : numValue;
        }
        
        // Always update critical fields to ensure they're set correctly
        updatedValues[index] = formattedValue;
        
        console.log(`updateRecordInSheet: Critical field "${field.header}" set to "${formattedValue}"`);
        
        // Add to updated fields list if it changed
        if (currentValues[index] !== formattedValue) {
          fieldsUpdated.push({
            header: field.header,
            oldValue: currentValues[index],
            newValue: formattedValue
          });
        }
      }
    });
    
    // Check if there are any changes
    if (fieldsUpdated.length === 0) {
      console.log(`updateRecordInSheet: No fields were updated for row ${rowIndex}`);
      return;
    }
    
    // Write all values at once
    sheet.getRange(rowIndex, 1, 1, updatedValues.length).setValues([updatedValues]);
    
    // Log all the field updates
    console.log(`updateRecordInSheet: Updated ${fieldsUpdated.length} fields in row ${rowIndex}:`);
    fieldsUpdated.forEach(field => {
      console.log(`- Field '${field.header}' updated from '${field.oldValue}' to '${field.newValue}'`);
    });
    
    console.log(`updateRecordInSheet: Successfully updated record at row ${rowIndex}`);
  } catch (error) {
    console.error(`updateRecordInSheet: Error updating record at row ${rowIndex}: ${error}`);
    console.error(`updateRecordInSheet: Error stack: ${error.stack}`);
  }
}

/**
 * Helper function to convert a time string to a Date object.
 * @param {string} timeString - Time string in format 'HH:MM:SS AM/PM'.
 * @return {Date} A Date object representing the time.
 */
function convertTimeStringToDate(timeString) {
  try {
    // Check if the timeString is already a Date object
    if (timeString instanceof Date) {
      return timeString;
    }
    
    // Parse the time string
    let hours, minutes, seconds, isPM;
    
    if (timeString.includes('AM') || timeString.includes('PM')) {
      // Format: '12:34:56 AM/PM'
      const [timePart, period] = timeString.split(' ');
      [hours, minutes, seconds] = timePart.split(':').map(part => parseInt(part, 10));
      isPM = period.toUpperCase() === 'PM';
    } else {
      // Format: '12:34:56' (24-hour)
      [hours, minutes, seconds] = timeString.split(':').map(part => parseInt(part, 10));
      isPM = hours >= 12;
    }
    
    // Create a Date object with today's date and the time from the string
    const date = new Date();
    
    // Adjust hours for 12-hour format with AM/PM
    if (isPM && hours < 12) {
      hours += 12; // Convert 1 PM - 11 PM to 13-23
    } else if (!isPM && hours === 12) {
      hours = 0; // Convert 12 AM to 0
    }
    
    date.setHours(hours, minutes, seconds || 0, 0);
    
    console.log(`convertTimeStringToDate: Converted '${timeString}' to ${date.toLocaleString()}`);
    return date;
  } catch (error) {
    console.error(`convertTimeStringToDate: Error converting time string '${timeString}': ${error}`);
    // Return the original string if conversion fails
    return timeString;
  }
}

/**
 * Apply basic updates without GPT assistance (fallback method).
 * @param {Object} existingRecord - The existing record to update.
 * @param {Object} newRecord - The new record with potential updates.
 * @param {Object} matchInfo - Information about the match.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} destinationSheet - The destination sheet.
 * @param {Array} currentRunEntries - The current run entries array.
 */
function applyBasicUpdates(existingRecord, newRecord, matchInfo, destinationSheet, currentRunEntries) {
  console.log('applyBasicUpdates: Applying basic updates using fallback method');
  
  // Create a copy of the existing record to update
  const updatedRecord = JSON.parse(JSON.stringify(existingRecord));
  let changesMade = false;
  
  // Critical fields to check for updates
  const criticalFields = [
    { name: 'ticketPrice', condition: newValue => newValue && newValue.toLowerCase().includes('sold out') },
    { name: 'startTime', condition: () => true }, // Always check start time
    { name: 'endTime', condition: () => true },   // Always check end time
    { name: 'startDate', condition: () => true }, // Always check start date
    { name: 'endDate', condition: () => true }    // Always check end date
  ];
  
  // Check each critical field
  criticalFields.forEach(field => {
    if (newRecord[field.name] && field.condition(newRecord[field.name])) {
      // Apply the update
      updatedRecord[field.name] = newRecord[field.name];
      changesMade = true;
      console.log(`applyBasicUpdates: Updated ${field.name} to: ${newRecord[field.name]}`);
    }
  });
  
  if (changesMade) {
    // Apply the updates based on where the duplicate was found
    if (matchInfo.source === 'sheet') {
      // Update the record in the destination sheet
      updateRecordInSheet(matchInfo.reference, updatedRecord, destinationSheet);
    } else if (matchInfo.source === 'currentRun') {
      // Update the record in the current run entries array
      const index = currentRunEntries.indexOf(matchInfo.reference);
      if (index !== -1) {
        currentRunEntries[index] = updatedRecord;
      }
    }
  }
  
  console.log(`applyBasicUpdates: Fallback update process complete. Changes made: ${changesMade}`);
}


/**
 * Extracts relevant data from a row.
 * @param {Array} row - The row data.
 * @param {Object} columnIndexMap - Map of column headers to their indices.
 * @return {Object} Extracted data from the row.
 */
function extractRowData(row, columnIndexMap) {
  console.log('Starting extractRowData function');
  
  const extractedData = {
    sharedPostText: getColumnValue(row, columnIndexMap, ['Sharedpost Text', 'sharedPost/text', 'name']) || '',
    text: getColumnValue(row, columnIndexMap, ['Text', 'text', 'description']) || '',
    mediaUrls: [],
    sharedPostThumbnails: [],
    userName: (() => {
      const locationName = getColumnValue(row, columnIndexMap, ['location/name']) || '';
      const organizerName = getColumnValue(row, columnIndexMap, ['organizators/0/name']) || '';
      
      // Enhanced function to check if a string looks like an address
      if (isLikelyAddress(locationName)) {
        console.log(`Identified as address: ${locationName}`);
        console.log(`Using organizer name: ${organizerName}`);
        return organizerName || getColumnValue(row, columnIndexMap, ['User Name', 'user/name']) || locationName;
      } else {
        console.log(`Not identified as address: ${locationName}`);
        return locationName || organizerName || getColumnValue(row, columnIndexMap, ['User Name', 'user/name']) || '';
      }
    })(),
    pageName: getColumnValue(row, columnIndexMap, ['Pagename', 'pageName']) || '',
    timestamp: getColumnValue(row, columnIndexMap, ['Time', 'time', 'utcStartDate']) || '',
    facebookUrl: getColumnValue(row, columnIndexMap, ['Facebookurl', 'facebookUrl']) || '',
    cleanedFacebookUrl: (getColumnValue(row, columnIndexMap, ['Facebookurl', 'facebookUrl']) || '').replace(/^https:\/\/m\./, 'https://www.'),
    profilePicUrl: getColumnValue(row, columnIndexMap, ['user/profilePic']) || '',
    id: getColumnValue(row, columnIndexMap, ['id', 'ID', 'postId']) || '',
    latitude: getColumnValue(row, columnIndexMap, ['location/latitude', 'Latitude']) || '',
    longitude: getColumnValue(row, columnIndexMap, ['location/longitude', 'Longitude']) || '',
    city: getColumnValue(row, columnIndexMap, ['location/city', 'City']) || '',
    streetAddress: getColumnValue(row, columnIndexMap, ['location/name', 'location/streetAddress', 'streetAddress', 'Street Address']) || '',
    organizedBy: getColumnValue(row, columnIndexMap, ['organizedBy', 'Organized By']) || '',
    usersResponded: getColumnValue(row, columnIndexMap, ['usersResponded', 'Users Responded']) || '',
    utcStartDate: getColumnValue(row, columnIndexMap, ['utcStartDate', 'UTC Start Date']) || '',
    ticketsBuyUrl: getColumnValue(row, columnIndexMap, ['ticketsBuyUrl', 'ticketsInfo/buyUrl']) || '',
    ticketProvider: getColumnValue(row, columnIndexMap, ['ticketProvider', 'Ticket Provider']) || '',
    
    // New fields added for social engagement metrics
    likes: getColumnValue(row, columnIndexMap, ['likes', 'Likes', 'likesCount', 'likes/count']) || '0',
    shares: getColumnValue(row, columnIndexMap, ['shares', 'Shares', 'sharesCount', 'shares/count']) || '0',
    comments: getColumnValue(row, columnIndexMap, ['comments', 'Comments', 'commentsCount', 'comments/count']) || '0',
    topReactionsCount: getColumnValue(row, columnIndexMap, ['topReactionsCount', 'topReactions/count', 'Top Reactions Count']) || '0'
  };

  console.log('Extracted basic data:', JSON.stringify(extractedData, null, 2));

  // Handle profile picture
  if (extractedData.profilePicUrl) {
    console.log(`Uploading profile picture: ${extractedData.profilePicUrl}`);
    const uploadedProfilePicUrl = downloadAndStoreImage(
      extractedData.profilePicUrl, 
      extractedData.userName, 
      'profilepictures', 
      extractedData.timestamp, 
      extractedData.id
    );
    if (uploadedProfilePicUrl) {
      extractedData.profilePicUrl = uploadedProfilePicUrl;
      console.log(`Replaced profile picture URL: ${extractedData.profilePicUrl} with ${uploadedProfilePicUrl}`);
    } else {
      console.log(`Failed to upload profile picture: ${extractedData.profilePicUrl}`);
    }
  }

  // Process both regular and shared post thumbnails
  for (let mediaIndex = 0; mediaIndex < 10; mediaIndex++) {
    const regularThumbnailKey = `media/${mediaIndex}/thumbnail`;
    const sharedThumbnailKey = `sharedpost/media/${mediaIndex}/thumbnail`;
    
    const regularThumbnailUrl = getColumnValue(row, columnIndexMap, [regularThumbnailKey]);
    const sharedThumbnailUrl = getColumnValue(row, columnIndexMap, [sharedThumbnailKey]);

    // Process regular thumbnail
    if (regularThumbnailUrl) {
      console.log(`Found regular thumbnail for media/${mediaIndex}: ${regularThumbnailUrl}`);
      const uploadedUrl = downloadAndStoreImage(
        regularThumbnailUrl, 
        extractedData.userName, 
        'postimages', 
        extractedData.timestamp, 
        extractedData.id
      );
      if (uploadedUrl) {
        extractedData.mediaUrls.push(uploadedUrl);
        console.log(`Uploaded and added regular thumbnail URL to mediaUrls: ${uploadedUrl}`);
      } else {
        extractedData.mediaUrls.push(regularThumbnailUrl);
        console.log(`Failed to upload regular thumbnail: ${regularThumbnailUrl}. Using original URL in mediaUrls.`);
      }
    }

    // Process shared post thumbnail
    if (sharedThumbnailUrl) {
      console.log(`Found shared post thumbnail for media/${mediaIndex}: ${sharedThumbnailUrl}`);
      const uploadedUrl = downloadAndStoreImage(
        sharedThumbnailUrl, 
        extractedData.userName, 
        'postimages', 
        extractedData.timestamp, 
        extractedData.id
      );
      if (uploadedUrl) {
        extractedData.mediaUrls.push(uploadedUrl);
        extractedData.sharedPostThumbnails.push(uploadedUrl); // For backward compatibility
        console.log(`Uploaded and added shared post thumbnail URL to mediaUrls: ${uploadedUrl}`);
      } else {
        extractedData.mediaUrls.push(sharedThumbnailUrl);
        extractedData.sharedPostThumbnails.push(sharedThumbnailUrl); // For backward compatibility
        console.log(`Failed to upload shared post thumbnail: ${sharedThumbnailUrl}. Using original URL in mediaUrls.`);
      }
    }
  }

  // Process imageUrl
  const imageUrl = getColumnValue(row, columnIndexMap, ['imageUrl']);
  if (imageUrl) {
    console.log(`Found imageUrl: ${imageUrl}`);
    const uploadedUrl = downloadAndStoreImage(
      imageUrl,
      extractedData.userName,
      'postimages',
      extractedData.timestamp,
      extractedData.id
    );
    if (uploadedUrl) {
      extractedData.mediaUrls.push(uploadedUrl);
      console.log(`Uploaded and added imageUrl to mediaUrls: ${uploadedUrl}`);
    } else {
      extractedData.mediaUrls.push(imageUrl);
      console.log(`Failed to upload imageUrl: ${imageUrl}. Using original URL in mediaUrls.`);
    }
  } else {
    console.log('No imageUrl found in the row');
  }

  console.log(`Total media thumbnails found and processed: ${extractedData.mediaUrls.length}`);
  console.log(`Total shared post thumbnails found and processed: ${extractedData.sharedPostThumbnails.length}`);
  console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
  return extractedData;
}

/**
 * Creates a map of column headers to their indices.
 * @param {Array} headers - The header row from the source sheet.
 * @return {Object} Map of processed headers to their column indices.
 */
function createColumnIndexMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[header.toLowerCase().replace(/\s+/g, '').replace(/\//g, '')] = index;
  });
  
  //console.log('Extracted headers:', JSON.stringify(headers, null, 2));
  //console.log('Created column index map:', JSON.stringify(map, null, 2));
  
  return map;
}

/**
 * Gets the value of a column based on possible header names.
 * @param {Array} row - The row data.
 * @param {Object} columnIndexMap - Map of column headers to their indices.
 * @param {string[]} possibleHeaders - Possible header names for the desired column.
 * @return {*} The value of the column, or null if not found.
 */

// This is where we confirm headers are beinh found ****
function getColumnValue(row, columnIndexMap, possibleHeaders) {
  //console.log('getColumnValue : Searching for headers:', possibleHeaders);
  for (const header of possibleHeaders) {
    const processedHeader = header.toLowerCase().replace(/\s+/g, '').replace(/\//g, '');
    const index = columnIndexMap[processedHeader];
    if (index !== undefined) {
      //console.log(`getColumnValue : Found matching header: ${header}, Value: ${row[index]}`);
      return row[index];
    }
  }
  //console.warn(`getColumnValue : Column not found. Tried these headers: ${possibleHeaders.join(', ')}`);
  return null;
}