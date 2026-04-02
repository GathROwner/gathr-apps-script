// testSuite.gs

/**
 * Runs all tests and reports results.
 */
function runAllTests() {
  const tests = [
    testProcessNewDatasets,
    testFileProcessing,
    testDataParsing,
    testSpreadsheetOperations,
    testErrorHandling,
    testPerformanceOptimizations
  ];

  let passedTests = 0;
  let failedTests = 0;

  tests.forEach(test => {
    try {
      test();
      passedTests++;
      logMessage(LogLevel.INFO, `Test passed: ${test.name}`);
    } catch (error) {
      failedTests++;
      logMessage(LogLevel.ERROR, `Test failed: ${test.name}`, { error: error.message });
    }
  });

  logMessage(LogLevel.INFO, 'Test results', { passed: passedTests, failed: failedTests, total: tests.length });
}

function testProcessNewDatasets() {
  // Mock necessary functions and test processNewDatasets
  // This is a high-level integration test
  // Implementation details depend on your specific setup
}

function testFileProcessing() {
  // Test findNewApifyDatasetFiles and processFile functions
  // You may need to create mock files for this test
}

function testDataParsing() {
  // Test parsePostData function with various input scenarios
  const testData = {
    combinedText: "Test event happening tonight!",
    mediaUrl: "https://example.com/image.jpg",
    userName: "Test User",
    pageName: "Test Page",
    timestamp: "2024-08-01T19:00:00.000Z",
    facebookUrl: "https://www.facebook.com/testpage",
    openaiApiKey: "test_api_key",
    addressMap: { "https://www.facebook.com/testpage": "123 Test St, Test City" },
    profilePicUrl: "https://example.com/profile.jpg"
  };

  const result = parsePostData(
    testData.combinedText,
    testData.mediaUrl,
    testData.userName,
    testData.pageName,
    testData.timestamp,
    testData.facebookUrl,
    testData.openaiApiKey,
    testData.addressMap,
    testData.profilePicUrl
  );

  if (!result || result.length === 0) {
    throw new Error("parsePostData failed to return a result");
  }

  // Add more assertions here to verify the correctness of the parsed data
}

function testSpreadsheetOperations() {
  // Test spreadsheet utility functions
  // You may need to create a test spreadsheet for this
}

function testErrorHandling() {
  // Test error handling functions
  try {
    withErrorHandling(() => {
      throw new Error("Test error");
    }, "testFunction")();
    throw new Error("Error handling failed to catch the error");
  } catch (error) {
    if (error.message !== "Test error") {
      throw new Error("Unexpected error message");
    }
  }
}

function testPerformanceOptimizations() {
  // Test batch processing and caching functions
  const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const processedData = [];

  batchProcess(testData, (batch) => {
    processedData.push(...batch);
  }, 3);

  if (processedData.length !== testData.length) {
    throw new Error("Batch processing failed to process all data");
  }

  // Test caching
  const cachedResult = cachedFetch("testKey", () => "testValue");
  if (cachedResult !== "testValue") {
    throw new Error("Caching failed");
  }
}

/**
 * Debug helper: re-runs parser on a single dataset row without writing to destination sheet.
 * @param {string} fileId Drive file ID of the APIFY dataset.
 * @param {number} rowNumber 1-based row number in the source sheet (header row is 1).
 * @return {Object} Summary of parse output for quick verification in clasp run output.
 */
function debugReparseSingleRow(fileId, rowNumber) {
  const targetFileId = fileId || '1oJUytO-MCCrrGO9zIsZihPv4R7V_JGRE';
  const targetRow = Number(rowNumber || 26);
  const DESTINATION_SPREADSHEET_ID = '1w0h7TjgP551ZJ5qkb1yU6eRQVlqc6SjTDVGHDZ1qFCQ';

  console.log(`Starting processing row ${targetRow}`);
  console.log(`Debug parse target file: ${targetFileId}`);

  const file = DriveApp.getFileById(targetFileId);
  const sourceSheet = openSourceSheet(file, file.getMimeType());
  const sourceData = sourceSheet.getDataRange().getValues();

  if (targetRow < 2 || targetRow > sourceData.length) {
    throw new Error(`Row ${targetRow} is out of range. Valid rows: 2-${sourceData.length}`);
  }

  const headers = sourceData[0];
  const columnIndexMap = createColumnIndexMap(headers);
  const row = sourceData[targetRow - 1];
  const extractedData = extractRowData(row, columnIndexMap);

  if (!extractedData.id) {
    extractedData.id = generateUniqueId(extractedData);
  }

  CacheService.getScriptCache().remove('addressMap');
  const destinationSpreadsheet = SpreadsheetApp.openById(DESTINATION_SPREADSHEET_ID);
  const addressMap = cachedFetch(
    'addressMap',
    () => createAddressMap(destinationSpreadsheet.getSheetByName('Contact Info')),
    3600
  );

  const openaiApiKey = getOpenAIApiKey();
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not found');
  }

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

  const summary = {
    fileId: targetFileId,
    rowNumber: targetRow,
    parsedCount: parsedData.length,
    stage4HappyHourNoPriceOverrides: parsedData._happyHourNoPriceOverrideCount || 0,
    items: parsedData.map(item => ({
      name: item.name,
      category: item.category,
      isEvent: item.isEvent,
      isFoodSpecial: item.isFoodSpecial
    }))
  };

  console.log(`Debug row ${targetRow}: parsed ${summary.parsedCount} item(s)`);
  console.log(`Debug row ${targetRow}: Stage 4 Happy Hour no-price overrides = ${summary.stage4HappyHourNoPriceOverrides}`);
  summary.items.forEach((item, idx) => {
    console.log(`Debug row ${targetRow}: Final ${idx + 1}: "${item.name}" | ${item.category} | isEvent=${item.isEvent} | isFoodSpecial=${item.isFoodSpecial}`);
  });
  console.log(`Row ${targetRow}: processed`);

  return summary;
}

function debugReparseDatasetRow26() {
  return debugReparseSingleRow('1oJUytO-MCCrrGO9zIsZihPv4R7V_JGRE', 26);
}
