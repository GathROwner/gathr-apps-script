// Global image reference system
// This should be added at the top of imageUtils.gs

// Store image URL references with counts
let imageReferenceCounter = {};

// Store images for potential deletion
let pendingImageDeletions = new Set();

// Store all images from the current post for tracking
let currentPostImages = [];

/**
 * Initializes the image reference tracking system for a new post.
 * Must be called at the beginning of processing a new post.
 * @param {Array} imageUrls - All image URLs from the current post.
 */
function initializeImageTracking(imageUrls) {
  console.log(`initializeImageTracking: Starting new tracking session with ${imageUrls.length} images`);
  
  // Reset the tracking system
  imageReferenceCounter = {};
  pendingImageDeletions.clear();
  currentPostImages = [];
  
  // Register all images from this post with initial count of 0
  imageUrls.forEach(url => {
    if (url) {
      imageReferenceCounter[url] = 0;
      currentPostImages.push(url);
      console.log(`initializeImageTracking: Registered image with initial count 0: ${url}`);
    }
  });
}

/**
 * Marks an image as relevant to an event, incrementing its reference counter.
 * @param {string} imageUrl - The URL of the relevant image.
 */
function markImageAsRelevant(imageUrl) {
  if (!imageUrl) return;
  
  console.log(`markImageAsRelevant: Marking as relevant: ${imageUrl}`);
  
  // Initialize counter if not already present
  if (imageReferenceCounter[imageUrl] === undefined) {
    imageReferenceCounter[imageUrl] = 0;
    console.log(`markImageAsRelevant: Image not previously registered, initializing counter`);
  }
  
  // Increment reference counter
  imageReferenceCounter[imageUrl]++;
  
  console.log(`markImageAsRelevant: New reference count for ${imageUrl}: ${imageReferenceCounter[imageUrl]}`);
}

/**
 * Notes an image that we *might* delete at the end of this row.
 * We do not delete here; finalizeImageProcessing() will remove any current-post
 * images that finish the row with 0 references.
 */
function markImageForDeletion(url) {
  if (!url) return;
  console.log('markImageForDeletion: queued ' + url);
  // Intentionally do nothing else. finalizeImageProcessing() will delete
  // any current-post images that end with 0 references.
}

/**
 * Processes all images from the current post and deletes those with zero references.
 * Must be called after all events from a post have been processed.
 */

function finalizeImageProcessing() {
  console.log(`finalizeImageProcessing: Processing all images from current post`);
  console.log(`finalizeImageProcessing: Current reference counts:`);
  
  // Log current reference counts for debugging
  Object.entries(imageReferenceCounter).forEach(([url, count]) => {
    console.log(`  ${url}: ${count} references`);
  });
  
  const deletedImages = [];
  const preservedImages = [];
  
  // Process each image from the current post
  currentPostImages.forEach(imageUrl => {
    if (!imageUrl) return;
    
    const referenceCount = imageReferenceCounter[imageUrl] || 0;
    
    if (referenceCount <= 0) {
      // Safe to delete - no references
      console.log(`finalizeImageProcessing: Deleting image with 0 references: ${imageUrl}`);
      deleteCloudStorageImage(imageUrl, true); // Force delete
      deletedImages.push(imageUrl);
    } else {
      // Cannot delete - has references
      console.log(`finalizeImageProcessing: Preserving image with ${referenceCount} references: ${imageUrl}`);
      preservedImages.push(imageUrl);
    }
  });
  
  // Clear the tracking for next post
  imageReferenceCounter = {};
  pendingImageDeletions.clear();
  currentPostImages = [];
  
  console.log(`finalizeImageProcessing: Completed. Deleted ${deletedImages.length} unused images, preserved ${preservedImages.length} images with references.`);
  
  return {
    deleted: deletedImages,
    preserved: preservedImages
  };
}

/**
 * Gets the current reference count for an image.
 * @param {string} imageUrl - The URL of the image.
 * @return {number} The current reference count.
 */
function getImageReferenceCount(imageUrl) {
  return imageReferenceCounter[imageUrl] || 0;
}

/**
 * Logs the current state of all image references.
 * Useful for debugging.
 */
function logImageReferenceCounts() {
  console.log(`===== CURRENT IMAGE REFERENCE COUNTS =====`);
  console.log(`Total tracked images: ${Object.keys(imageReferenceCounter).length}`);
  
  Object.entries(imageReferenceCounter).forEach(([url, count]) => {
    console.log(`Image: ${url}`);
    console.log(`Reference count: ${count}`);
    console.log(`--------------------`);
  });
  
  console.log(`============================================`);
}

function downloadAndStoreImage(imageUrl, establishmentName, folder, startDate, uniqueIdentifier, maxRetries = 1) {
  if (!imageUrl) {
    console.log('imageUtils: downloadAndStoreImage : No image URL provided. Skipping image download.');
    return null;
  }

  console.log(`imageUtils: downloadAndStoreImage : Starting image upload process for URL: ${imageUrl}`);
  console.log(`imageUtils: downloadAndStoreImage : Params: establishmentName=${establishmentName}, folder=${folder}, startDate=${startDate}, uniqueIdentifier=${uniqueIdentifier}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Fetch the image
      console.log(`imageUtils: downloadAndStoreImage : Attempt ${attempt}: Sending fetch request...`);
      const response = UrlFetchApp.fetch(imageUrl, {muteHttpExceptions: true});
      const responseCode = response.getResponseCode();
      const contentType = response.getHeaders()['Content-Type'];
      
      console.log(`imageUtils: downloadAndStoreImage : Fetch response received. Response code: ${responseCode}, Content-Type: ${contentType}`);
      
      if (responseCode !== 200) {
        console.error(`imageUtils: downloadAndStoreImage : Failed to download image. Response code: ${responseCode}`);
        if (attempt < maxRetries) {
          console.log(`Retrying in ${attempt * 2} seconds...`);
          Utilities.sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      
      const imageBlob = response.getBlob();
      console.log(`imageUtils: downloadAndStoreImage : Image blob created. Content type: ${imageBlob.getContentType()}, Size: ${imageBlob.getBytes().length} bytes`);
      
      // Generate a filename
      const fileExtension = imageBlob.getContentType().split('/')[1];
      const fileName = `${establishmentName}-${folder}-${startDate}-${uniqueIdentifier}.${fileExtension}`;
      
      console.log(`imageUtils: downloadAndStoreImage : Generated filename: ${fileName}`);
      
      // Upload to Cloud Run server
      const uploadUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/upload-image/';
      const formData = {
        'image': imageBlob,
        'folder': folder,
        'filename': fileName
      };
      
      const uploadOptions = {
        method: 'post',
        payload: formData,
        muteHttpExceptions: true
      };
      
      console.log('imageUtils: downloadAndStoreImage : Uploading image to Cloud Run server...');
      const uploadResponse = UrlFetchApp.fetch(uploadUrl, uploadOptions);
      const uploadResponseCode = uploadResponse.getResponseCode();
      
      if (uploadResponseCode !== 200) {
        console.error(`imageUtils: downloadAndStoreImage : Failed to upload image. Response code: ${uploadResponseCode}`);
        console.error(`imageUtils: downloadAndStoreImage : Response content: ${uploadResponse.getContentText()}`);
        if (attempt < maxRetries) {
          console.log(`imageUtils: downloadAndStoreImage : Retrying in ${attempt * 2} seconds...`);
          Utilities.sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      
      const uploadResult = JSON.parse(uploadResponse.getContentText());
      const publicUrl = uploadResult.imageUrl;
      
      if (!publicUrl) {
        console.error('imageUtils: downloadAndStoreImage : Public URL not found in upload response');
        console.log('imageUtils: downloadAndStoreImage : Upload response:', uploadResult);
        return null;
      }
      
      console.log(`imageUtils: downloadAndStoreImage : Image uploaded successfully. Public URL: ${publicUrl}`);
      
      return publicUrl;
    } catch (error) {
      console.error(`imageUtils: downloadAndStoreImage : Error in downloadAndStoreImage (Attempt ${attempt}): ${error}`);
      console.error(`imageUtils: downloadAndStoreImage : Error stack trace: ${error.stack}`);
      
      if (attempt < maxRetries) {
        console.log(`imageUtils: Retrying in ${attempt * 2} seconds...`);
        Utilities.sleep(attempt * 2000);
      } else {
        console.error(`imageUtils: downloadAndStoreImage : Max retries (${maxRetries}) reached. Giving up on downloading image.`);
        return null;
      }
    }
  }
  
  return null;
}

function uploadProfileImage(imageUrl, establishmentName, maxRetries = 3) {
  if (!imageUrl) {
    console.log('imageUtils: uploadProfileImage : No profile image URL provided. Skipping image upload.');
    return null;
  }

  console.log(`imageUtils: uploadProfileImage : Starting profile image upload process for establishment: ${establishmentName}`);
  console.log(`imageUtils: uploadProfileImage : Image URL: ${imageUrl}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Fetch the image
      console.log(`imageUtils: uploadProfileImage : Attempt ${attempt}: Sending fetch request...`);
      const response = UrlFetchApp.fetch(imageUrl, {muteHttpExceptions: true});
      const responseCode = response.getResponseCode();
      const contentType = response.getHeaders()['Content-Type'];
      
      console.log(`imageUtils: uploadProfileImage : Fetch response received. Response code: ${responseCode}, Content-Type: ${contentType}`);
      
      if (responseCode !== 200) {
        console.error(`imageUtils: uploadProfileImage : Failed to download profile image. Response code: ${responseCode}`);
        if (attempt < maxRetries) {
          console.log(`imageUtils: uploadProfileImage : Retrying in ${attempt * 2} seconds...`);
          Utilities.sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      
      const imageBlob = response.getBlob();
      console.log(`imageUtils: uploadProfileImage : Profile image blob created. Content type: ${imageBlob.getContentType()}, Size: ${imageBlob.getBytes().length} bytes`);
      
      // Generate a filename
      const fileExtension = imageBlob.getContentType().split('/')[1];
      const fileName = `${establishmentName}-profile.${fileExtension}`;
      
      console.log(`imageUtils: uploadProfileImage : Generated filename: ${fileName}`);
      
      // Upload to Cloud Run server
      const uploadUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/upload-image/';
      const formData = {
        'image': imageBlob,
        'folder': 'profilepictures',
        'filename': fileName
      };
      
      const uploadOptions = {
        method: 'post',
        payload: formData,
        muteHttpExceptions: true
      };
      
      console.log('imageUtils: uploadProfileImage : Uploading profile image to Cloud Run server...');
      const uploadResponse = UrlFetchApp.fetch(uploadUrl, uploadOptions);
      const uploadResponseCode = uploadResponse.getResponseCode();
      
      if (uploadResponseCode !== 200) {
        console.error(`imageUtils: uploadProfileImage : Failed to upload profile image. Response code: ${uploadResponseCode}`);
        console.error(`imageUtils: uploadProfileImage : Response content: ${uploadResponse.getContentText()}`);
        if (attempt < maxRetries) {
          console.log(`imageUtils: uploadProfileImage : Retrying in ${attempt * 2} seconds...`);
          Utilities.sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      
      const uploadResult = JSON.parse(uploadResponse.getContentText());
      const publicUrl = uploadResult.publicUrl;
      
      console.log(`imageUtils: uploadProfileImage : Profile image uploaded successfully. Public URL: ${publicUrl}`);
      
      return publicUrl;
    } catch (error) {
      console.error(`imageUtils: uploadProfileImage : Error in uploadProfileImage (Attempt ${attempt}): ${error}`);
      console.error(`imageUtils: uploadProfileImage : Error stack trace: ${error.stack}`);
      
      if (attempt < maxRetries) {
        console.log(`imageUtils: uploadProfileImage : Retrying in ${attempt * 2} seconds...`);
        Utilities.sleep(attempt * 2000);
      } else {
        console.error(`imageUtils: uploadProfileImage : Max retries (${maxRetries}) reached. Giving up on uploading profile image.`);
        return null;
      }
    }
  }
  
  return null;
}

function compressImage(imageBlob) {
  const maxSizeBytes = 512 * 1024; // 512 KB
  let quality = 0.9;
  let compressedBlob = imageBlob;
  
  while (compressedBlob.getBytes().length > maxSizeBytes && quality > 0.1) {
    const base64Image = Utilities.base64Encode(imageBlob.getBytes());
    
    const htmlTemplate = HtmlService.createTemplate(`
      <!DOCTYPE html>
      <html>
        <head><base target="_top"></head>
        <body>
          <img id="img" src="data:${imageBlob.getContentType()};base64,${base64Image}" style="display:none;">
          <canvas id="canvas"></canvas>
          <script>
            const img = document.getElementById('img');
            const canvas = document.getElementById('canvas');
            const ctx = canvas.getContext('2d');
            
            img.onload = function() {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              const dataUrl = canvas.toDataURL('image/jpeg', ${quality});
              document.body.innerText = dataUrl;
            };
          </script>
        </body>
      </html>
    `);
    
    const htmlOutput = htmlTemplate.evaluate();
    const dataUrl = htmlOutput.getContent().split('<body>')[1].split('</body>')[0].trim();
    
    if (dataUrl.startsWith('data:image/jpeg;base64,')) {
      const base64Data = dataUrl.split(',')[1];
      compressedBlob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', 'compressed_image.jpg');
    } else {
      break; // If compression fails, exit the loop
    }
    
    quality -= 0.1;
  }
  
  console.log(`imageUtils: compressImage : Image compressed. Original size: ${imageBlob.getBytes().length} bytes, New size: ${compressedBlob.getBytes().length} bytes, Final quality: ${quality.toFixed(1)}`);
  return compressedBlob;
}

/**
 * Safely cleans up all images associated with extracted data.
 * Improved to check if any images are currently in use before deleting.
 * 
 * @param {Object} extractedData - The extracted data containing image URLs
 * @param {Object|Array} recordsToCheck - Record(s) that might be using some of these images
 */
function cleanupAllImages(extractedData, recordsToCheck = null) {
  const allImages = [
    extractedData.profilePicUrl,
    ...extractedData.mediaUrls,
    ...extractedData.sharedPostThumbnails
  ].filter(Boolean); // Remove any undefined or null values

  console.log(`cleanupAllImages: Found ${allImages.length} images to potentially clean up`);
  
  // If no records to check, delete all images
  if (!recordsToCheck) {
    console.log('cleanupAllImages: No records provided to check for image usage, proceeding with caution');
    console.log('cleanupAllImages: Checking for images with ".cached." in URL which should always be preserved');
    
    // Only delete images that don't have ".cached." in their URL
    // This is a safety measure to preserve cached images
    allImages.forEach(url => {
      if (url && !url.includes('.cached.')) {
        console.log(`cleanupAllImages: Deleting non-cached image: ${url}`);
        deleteCloudStorageImage(url);
      } else if (url) {
        console.log(`cleanupAllImages: Preserving cached image: ${url}`);
      }
    });
    return;
  }
  
  // Convert single record to array for consistent processing
  const recordArray = Array.isArray(recordsToCheck) ? recordsToCheck : [recordsToCheck];
  
  // Collect all image URLs currently in use across all records
  const usedImages = [];
  recordArray.forEach(record => {
    if (!record) return;
    
    // Check common image fields
    ['icon', 'image', 'relevantImageUrl', 'cachedImageUrl', 'profilePicUrl'].forEach(field => {
      if (record[field]) {
        usedImages.push(record[field]);
      }
    });
    
    // Check any other fields that might contain image URLs
    Object.keys(record).forEach(key => {
      const value = record[key];
      if (typeof value === 'string' && 
          value.startsWith('https://storage.googleapis.com/gathr-uploaded-images/')) {
        usedImages.push(value);
      }
    });
  });
  
  // Get unique used images
  const uniqueUsedImages = [...new Set(usedImages)].filter(Boolean);
  console.log(`cleanupAllImages: Found ${uniqueUsedImages.length} images in use by records`);
  
  // Only delete images that aren't in use
  const imagesToDelete = allImages.filter(url => !uniqueUsedImages.includes(url));
  
  console.log(`cleanupAllImages: Found ${imagesToDelete.length} images safe to delete`);
  
  // Now delete unused images
  imagesToDelete.forEach(url => {
    if (url) {
      console.log(`cleanupAllImages: Deleting unused image: ${url}`);
      deleteCloudStorageImage(url);
    }
  });
  
  // Log which images we're keeping
  if (uniqueUsedImages.length > 0) {
    console.log('cleanupAllImages: Preserving these images that are in use:');
    uniqueUsedImages.forEach(url => console.log(`  - ${url}`));
  }
}

// beginging to change on Oct 31

// Global variables for tracking images across function calls
let relevantImageUrls = new Set();  // Stores URLs of images marked as relevant
let allImagesList = null;           // Stores all images from current row
let profilePicToHandle = null;      // Stores profile picture URL for current row

/**
 * Collects and tracks relevant images instead of immediately deleting them.
 * Called multiple times during row processing as relevant images are identified.
 * 
 * @param {Array} allImageUrls - Array of all image URLs from current row
 * @param {string} relevantImageUrl - Single image URL identified as relevant
 * @param {string} profilePicUrl - Profile picture URL for current row
 */

// ==========================================
// MODIFIED IMAGE HANDLING (imageUtils.gs)
// ==========================================

/**
 * Delays cleanup of non-relevant images until after processing.
 * @param {Array} allImageUrls - All image URLs.
 * @param {string} relevantImageUrl - The URL of the relevant image to keep.
 */
function delayedCleanupForNonRelevantImages(allImageUrls, relevantImageUrl) {
  console.log('delayedCleanupForNonRelevantImages: Storing image URLs for delayed cleanup');
  
  // Store the cleanup information for later execution
  const cleanupInfo = {
    allUrls: allImageUrls,
    keepUrl: relevantImageUrl,
    timestamp: new Date().toISOString()
  };
  
  // Get the current cleanup queue
  let cleanupQueue = [];
  const storedQueue = PropertiesService.getScriptProperties().getProperty('IMAGE_CLEANUP_QUEUE');
  
  if (storedQueue) {
    try {
      cleanupQueue = JSON.parse(storedQueue);
    } catch (error) {
      console.error('delayedCleanupForNonRelevantImages: Error parsing cleanup queue:', error);
      cleanupQueue = [];
    }
  }
  
  // Add the new cleanup info
  cleanupQueue.push(cleanupInfo);
  
  // Store the updated queue
  PropertiesService.getScriptProperties().setProperty('IMAGE_CLEANUP_QUEUE', JSON.stringify(cleanupQueue));
  
  console.log(`delayedCleanupForNonRelevantImages: Added cleanup task for ${allImageUrls.length} images, keeping ${relevantImageUrl}`);
  console.log(`delayedCleanupForNonRelevantImages: Current queue size: ${cleanupQueue.length}`);
}

/**
 * Processes the delayed image cleanup queue.
 * This function should be called at the end of processing.
 */
function processImageCleanupQueue() {
  console.log('processImageCleanupQueue: Processing image cleanup queue');
  
  // Get the cleanup queue
  const storedQueue = PropertiesService.getScriptProperties().getProperty('IMAGE_CLEANUP_QUEUE');
  
  if (!storedQueue) {
    console.log('processImageCleanupQueue: No cleanup queue found');
    return;
  }
  
  try {
    const cleanupQueue = JSON.parse(storedQueue);
    console.log(`processImageCleanupQueue: Found ${cleanupQueue.length} cleanup tasks`);
    
    let processedCount = 0;
    
    // Process each cleanup task
    cleanupQueue.forEach(task => {
      console.log(`processImageCleanupQueue: Processing task from ${task.timestamp}`);
      
      const imagesToDelete = task.allUrls.filter(url => url !== task.keepUrl);
      
      console.log(`processImageCleanupQueue: Keeping ${task.keepUrl}`);
      console.log(`processImageCleanupQueue: Deleting ${imagesToDelete.length} images`);
      
      // Delete the non-relevant images
      imagesToDelete.forEach(url => {
        deleteCloudStorageImage(url);
      });
      
      processedCount++;
    });
    
    // Clear the queue
    PropertiesService.getScriptProperties().deleteProperty('IMAGE_CLEANUP_QUEUE');
    
    console.log(`processImageCleanupQueue: Processed ${processedCount} cleanup tasks`);
  } catch (error) {
    console.error('processImageCleanupQueue: Error processing cleanup queue:', error);
    console.error('processImageCleanupQueue: Error stack:', error.stack);
  }
}

// ==========================================
// TESTING FUNCTIONS
// ==========================================

/**
 * Tests the enhanced duplicate detection with a sample event.
 */
function testEnhancedDuplicateDetection() {
  // Save current state
  const currentState = FEATURE_FLAGS.USE_ENHANCED_DUPLICATE_DETECTION;
  
  try {
    // Enable enhanced duplicate detection
    enableEnhancedDuplicateDetection(true);
    console.log('Testing with enhanced duplicate detection ENABLED');
    
    // Create sample records
    const existingRecord = {
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      category: 'Live Music',
      name: 'Saturday Night Band',
      description: 'Join us for live music with The Local Band.',
      establishment: 'The Venue Bar & Grill',
      address: '123 Main Street, Charlottetown PE',
      startDate: '2025-03-22',
      startTime: '08:00:00 PM',
      endTime: '11:00:00 PM',
      endDate: '2025-03-22',
      ticketPrice: '$15',
      ticketLink: 'N/A',
      relevantImageUrl: 'https://storage.googleapis.com/example/image1.jpg'
    };
    
    const newRecord = {
      isEvent: 'Yes',
      isFoodSpecial: 'No',
      category: 'Live Music',
      name: 'Saturday Night with The Local Band',
      description: 'Join us for live music with The Local Band. This event is now SOLD OUT!',
      establishment: 'The Venue Bar & Grill',
      address: '123 Main Street, Charlottetown PE',
      startDate: '2025-03-22',
      startTime: '08:00:00 PM',
      endTime: '11:30:00 PM', // Note the time change
      endDate: '2025-03-22',
      ticketPrice: 'SOLD OUT',
      ticketLink: 'N/A',
      relevantImageIndex: 0
    };
    
    // Test matching function
    const isMatch = isMatchingEntry(newRecord, existingRecord);
    console.log(`isMatchingEntry result: ${isMatch}`);
    
    if (isMatch) {
      // Test field comparison
      const changes = detectMeaningfulChanges(existingRecord, newRecord);
      console.log('detectMeaningfulChanges result:', JSON.stringify(changes, null, 2));
      
      // Test GPT comparison
      const openaiApiKey = getOpenAIApiKey();
      if (openaiApiKey) {
        const comparisonResult = compareRecordsWithGPT(existingRecord, newRecord, openaiApiKey);
        console.log('compareRecordsWithGPT result:', JSON.stringify(comparisonResult, null, 2));
        
        // Test update application
        const imageInfo = {
          existingImageUrl: existingRecord.relevantImageUrl,
          newImageUrl: 'https://storage.googleapis.com/example/image2.jpg'
        };
        
        const updateResult = applyRecommendedUpdates(existingRecord, newRecord, comparisonResult, imageInfo);
        console.log('applyRecommendedUpdates result:', JSON.stringify(updateResult, null, 2));
      } else {
        console.log('OpenAI API key not found. Skipping GPT comparison test.');
      }
    }
    
    return 'Test completed. Check logs for results.';
  } catch (error) {
    console.error(`Error testing enhanced duplicate detection: ${error}`);
    return `Test failed: ${error.message}`;
  } finally {
    // Restore original state
    enableEnhancedDuplicateDetection(currentState);
    console.log(`Restored enhanced duplicate detection to original state: ${currentState ? 'Enabled' : 'Disabled'}`);
  }
}

// Call processImageCleanupQueue at the end of processing
// Add this to the end of the processFile function:
// if (FEATURE_FLAGS.USE_OPTIMIZED_IMAGE_HANDLING) {
//   processImageCleanupQueue();
// }
function cleanupNonRelevantImages(allImageUrls, relevantImageUrl, profilePicUrl) {
    console.log('\n=== Starting cleanupNonRelevantImages Collection Process ===');
    console.log(`Relevant image received: ${relevantImageUrl}`);

    // First call for this row - initialize tracking
    if (!allImagesList) {
        // Create a copy of all image URLs for tracking
        allImagesList = [...allImageUrls];

        // If there's a profile picture, add it to tracking
        if (profilePicUrl) {
            profilePicToHandle = profilePicUrl;
            allImagesList.push(profilePicUrl);
            console.log('\nProfile Picture Registration:');
            console.log(`Added to tracking: ${profilePicUrl}`);
        }

        // Log all images being tracked
        console.log('\nInitial storage of all images:');
        allImagesList.forEach((url, index) => {
            console.log(`[${index + 1}/${allImagesList.length}] ${url}`);
        });
    }

    // Add the new relevant image to our tracking set
    relevantImageUrls.add(relevantImageUrl);
    
    // Log current state of relevant images
    console.log('\nCurrent collection of relevant images:');
    Array.from(relevantImageUrls).forEach((url, index) => {
        console.log(`[${index + 1}/${relevantImageUrls.size}] ${url}`);
    });

    console.log('\nAwaiting more relevant images or execution command...');
    console.log('=== Collection Process Complete ===\n');
}

/**
 * Executes final cleanup of non-relevant images after row processing is complete.
 * Handles both event images and profile pictures based on event validity.
 */
function executeImageCleanup() {
    console.log('\n=== Starting Final Image Cleanup Execution ===');

    // Check if we have any images to process
    if (!allImagesList) {
        console.log('No images registered for cleanup');
        return;
    }

    // Log initial state before cleanup
    console.log('\nFinal tally before cleanup:');
    console.log(`Total images in row: ${allImagesList.length}`);
    console.log(`Total relevant images: ${relevantImageUrls.size}`);

    // Check if any events were successfully processed
    const hasValidEvents = relevantImageUrls.size > 0;
    
    // Handle profile picture relevance
    if (hasValidEvents && profilePicToHandle) {
        // If we have valid events, mark profile pic as relevant
        relevantImageUrls.add(profilePicToHandle);
        console.log('\nProfile Picture Status:');
        console.log('Valid Event/Special Appended to Destinationsheet - Keeping Profile Image:');
        console.log(`Profile Image: ${profilePicToHandle}`);
    } else if (profilePicToHandle) {
        console.log('\nProfile Picture Status:');
        console.log('No Valid Events/Specials - Profile Picture will be deleted:');
        console.log(`Profile Image: ${profilePicToHandle}`);
    }

    // Display all collected relevant images
    console.log('\nAll relevant images collected:');
    Array.from(relevantImageUrls).forEach((url, index) => {
        console.log(`[${index + 1}] ${url}`);
    });

    // Determine which images need to be deleted
    const imagesToDelete = allImagesList.filter(url => !relevantImageUrls.has(url));
    
    // Log deletion candidates
    console.log('\nImages marked for deletion:');
    if (imagesToDelete.length === 0) {
        console.log('No images to delete - all images are relevant');
    } else {
        imagesToDelete.forEach((url, index) => {
            console.log(`[${index + 1}/${imagesToDelete.length}] ${url}`);
        });
    }

    // Execute deletion of non-relevant images
    console.log('\nExecuting deletion:');
    imagesToDelete.forEach((url, index) => {
        console.log(`Deleting image ${index + 1}/${imagesToDelete.length}: ${url}`);
        if (url === profilePicToHandle) {
            console.log('Deleting profile picture...');
        }
        deleteNonRelevantCloudStorageImage(url);
    });

    // Reset all tracking variables for next row
    console.log('\nResetting image tracking for next row');
    relevantImageUrls.clear();
    allImagesList = null;
    profilePicToHandle = null;

    console.log('=== Final Image Cleanup Complete ===\n');
}

// temportarily commenting out to see if this fixes double deleting error.

//function cleanupNonRelevantImages(allImageUrls, relevantImageUrl) {
  //allImageUrls.forEach(imageUrl => {
    //if (imageUrl !== relevantImageUrl) {
      //deleteCloudStorageImage(imageUrl);
    //}
  //});
//}


/**
 * Safe version of image deletion that only deletes when forced or during final processing.
 * This should replace the existing deleteCloudStorageImage function.
 * @param {string} imageUrl - The URL of the image to delete.
 * @param {boolean} forceDelete - Set to true to delete regardless of reference count (use with caution).
 */
function deleteCloudStorageImage(imageUrl, forceDelete = false) {
  if (!imageUrl) {
    console.log('imageUtils: deleteCloudStorageImage: No image URL provided. Skipping image deletion.');
    return;
  }

  // Check reference count before deleting unless forceDelete is true
  if (!forceDelete && imageReferenceCounter[imageUrl] > 0) {
    console.log(`imageUtils: deleteCloudStorageImage: Image still has ${imageReferenceCounter[imageUrl]} references. Skipping deletion: ${imageUrl}`);
    return;
  }

  // Add to pending deletions set if not forcing deletion
  if (!forceDelete) {
    pendingImageDeletions.add(imageUrl);
    console.log(`imageUtils: deleteCloudStorageImage: Added to pending deletions set: ${imageUrl}`);
    return;
  }

  console.log(`imageUtils: deleteCloudStorageImage: Attempting to delete image: ${imageUrl}`);

  try {
    const deleteUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/delete-image/';
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify({ imageUrl: imageUrl }),
      'muteHttpExceptions': true
    };

    const response = UrlFetchApp.fetch(deleteUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      console.log(`imageUtils: deleteCloudStorageImage: Successfully deleted image: ${imageUrl}`);
      
      // Update the reference counter to reflect the deletion
      if (imageReferenceCounter[imageUrl] !== undefined) {
        imageReferenceCounter[imageUrl] = 0;
      }
    } else {
      console.error(`imageUtils: deleteCloudStorageImage: Failed to delete image. Response code: ${responseCode}`);
      console.error(`imageUtils: deleteCloudStorageImage: Response content: ${response.getContentText()}`);
    }
  } catch (error) {
    console.error(`imageUtils: deleteCloudStorageImage: Error in deleteCloudStorageImage: ${error}`);
    console.error(`imageUtils: deleteCloudStorageImage: Error stack trace: ${error.stack}`);
  }
}



function deleteNonRelevantCloudStorageImage(imageUrl) {
  if (!imageUrl) {
    console.log('imageUtils: deleteNonRelevantCloudStorageImage : No image URL provided. Skipping image deletion.');
    return;
  }

  console.log(`imageUtils: deleteNonRelevantCloudStorageImage : Attempting to delete image: ${imageUrl}`);

  try {
    const deleteUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/delete-image/';
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify({ imageUrl: imageUrl }),
      'muteHttpExceptions': true
    };

    const response = UrlFetchApp.fetch(deleteUrl, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      console.log(`imageUtils: deleteNonRelevantCloudStorageImage : Successfully deleted image: ${imageUrl}`);
    } else {
      console.error(`imageUtils: deleteNonRelevantCloudStorageImage : Failed to delete image. Response code: ${responseCode}`);
      console.error(`imageUtils: deleteNonRelevantCloudStorageImage : Response content: ${response.getContentText()}`);
    }
  } catch (error) {
    console.error(`imageUtils: deleteNonRelevantCloudStorageImage : Error in deleteNonRelevantCloudStorageImage: ${error}`);
    console.error(`imageUtils: deleteNonRelevantCloudStorageImage : Error stack trace: ${error.stack}`);
  }
}