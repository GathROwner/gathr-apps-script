// spreadsheetUtils.gs

/**
 * Opens a spreadsheet by its ID.
 * @param {string} id - The ID of the spreadsheet to open.
 * @return {GoogleAppsScript.Spreadsheet.Spreadsheet|null} The opened spreadsheet or null if an error occurs.
 */
function openSpreadsheetById(id) {
  try {
    return SpreadsheetApp.openById(id);
  } catch (error) {
    console.error(`Error opening spreadsheet with ID ${id}: ${error}`);
    return null;
  }
}

/**
 * Retrieves processed sheet IDs from a given sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet containing processed IDs.
 * @return {string[]} An array of processed sheet IDs.
 */
function getProcessedSheetIds(sheet) {
  if (!sheet) {
    console.error('Processed Sheet IDs sheet not found');
    return [];
  }
  return sheet.getDataRange().getValues().flat().filter(id => id !== '');
}

/**
 * Creates an address map from a contact info sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The contact info sheet.
 * @return {Object} A map of page URLs to addresses.
 */
function createAddressMap(sheet) {
  console.log('createAddressMap : Starting createAddressMap function');
  
  if (!sheet) {
    console.error('createAddressMap : Contact Info sheet not provided to createAddressMap');
    return {};
  }

  console.log('createAddressMap : Contact Info sheet provided. Sheet ID:', sheet.getSheetId());
  console.log('createAddressMap : Parent spreadsheet ID:', sheet.getParent().getId());

  const establishmentMap = {};
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const pageUrlIndex = headers.indexOf('Pageurl');
  const addressIndex = headers.indexOf('Address');
  const categoryIndex = headers.indexOf('Categories 1');

  if (pageUrlIndex === -1 || addressIndex === -1 || categoryIndex === -1) {
    console.error('createAddressMap : Required columns "Pageurl", "Address", or "Categories 1" not found in the Contact Info sheet.');
    console.log('createAddressMap : Available columns:', headers);
    return establishmentMap;
  }

  values.slice(1).forEach(row => {
    const pageUrl = row[pageUrlIndex];
    const address = row[addressIndex].split('https://')[0].trim();
    const category = row[categoryIndex] || '';
    if (pageUrl) {
      establishmentMap[pageUrl] = { address, category };
    }
  });

  console.log('createAddressMap : EstablishmentMap created with', Object.keys(establishmentMap).length, 'entries');
  console.log('createAddressMap : Finished createAddressMap function');

  return establishmentMap;
}

/**
 * Updates the processed sheet IDs in a given sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update.
 * @param {string[]} processedIds - The array of processed sheet IDs.
 */
function updateProcessedSheetIds(sheet, processedIds) {
  if (!sheet) {
    console.error('Processed Sheet IDs sheet not found');
    return;
  }

  console.log(
    `updateProcessedSheetIds: Writing ${processedIds.length} IDs to sheet "${sheet.getName()}" in spreadsheet ${sheet.getParent().getId()}`
  );

  sheet.clear();
  if (processedIds.length > 0) {

    const range = sheet.getRange(1, 1, processedIds.length, 1);
    range.setValues(processedIds.map(id => [id]));
  }
}

function addRelevantImageUrlColumn(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headerRange = sheet.getRange(1, lastColumn + 1);
  const currentHeader = headerRange.getValue();
  
  if (currentHeader !== "Relevant Image URL") {
    headerRange.setValue("Relevant Image URL");
    console.log("Added 'Relevant Image URL' column to the sheet");
  } else {
    console.log("'Relevant Image URL' column already exists");
  }
}

/**
 * Finds an existing event in the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to search.
 * @param {Object} data - The event data to match.
 * @return {number|null} The row index of the matching event, or null if not found.
 */
function findExistingEvent(sheet, data) {
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[5] === data.establishment && 
        row[7] === formatDate(data.startDate) && 
        row[9] === formatTime(data.startTime)) {
      return i + 1; // Adding 1 because array index is 0-based, but sheet rows are 1-based
    }
  }
  
  return null;
}

/**
 * Updates an existing event in the sheet.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update.
 * @param {number} rowIndex - The row index of the event to update.
 * @param {Object} data - The updated event data.
 */
function updateExistingEvent(sheet, rowIndex, data) {
  const updateRange = sheet.getRange(rowIndex, 1, 1, 19);
  updateRange.setValues([[
    data.isEvent,
    data.isFoodSpecial,
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
    data.operatingHours,
    data.tripAdvisorRating,
    data.tripAdvisorReviews,
    data.operatingHoursSourc
  ]]);
  console.log(`Updated existing event at row ${rowIndex}`);
}