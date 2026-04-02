// postParser.gs - SIMPLIFIED 5-STAGE PARSING SYSTEM

// Configuration
const PARSING_CONFIG = {
  BATCH_SIZE: 50,
  MAX_RETRIES: 3,
  CONFIDENCE_THRESHOLD: 0.6
};

// MAIN ENTRY POINT
function parsePostData(combinedText, mediaUrls, sharedPostThumbnails, userName, pageName, timestamp, facebookUrl, openaiApiKey, establishmentMap, profilePicUrl, extractedData) {
  console.log('parsePostData: Starting SIMPLIFIED 5-stage parsing system');
  console.log('parsePostData: Input parameters:', JSON.stringify({ 
    combinedText: combinedText.substring(0, 100) + '...', 
    mediaUrlsCount: mediaUrls.length, 
    userName, 
    timestamp
  }, null, 2));

  // Setup address information
  const establishmentInfo = establishmentMap[facebookUrl] || {};
  let partialAddress = establishmentInfo.address || '';
  const category = establishmentInfo.category || '';
  
  // Address validation
  if (!isAddressAcceptable(partialAddress)) {
    console.log(`parsePostData: Address not acceptable. Attempting to find better address.`);
    const placeDetails = searchGooglePlaces(userName, partialAddress, extractedData.streetAddress || '', extractedData.city || '', category);
    if (placeDetails) {
      partialAddress = placeDetails.formatted_address;
    }
  }

  // Prepare image data
  const allImageUrls = [...new Set(mediaUrls)];
  console.log(`parsePostData: Total unique images to process: ${allImageUrls.length}`);

  // Early exit for empty content
  if (allImageUrls.length === 0 && !combinedText.trim()) {
    console.log('parsePostData: No content to process.');
    return [];
  }

  try {
    // STAGE 1: Content Validation
    console.log('\n=== STAGE 1: CONTENT VALIDATION ===');
    const validation = validateContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
    
    if (!validation.hasValidContent || validation.validationDecision === 'VALIDATION_FAILED') {
      console.log(`parsePostData: Content validation failed. Reason: ${validation.reason}`);
      cleanupAllImages(extractedData);
      return [];
    }

    // STAGE 2: Content Classification
    console.log('\n=== STAGE 2: CONTENT CLASSIFICATION ===');
    const classification = classifyContent(combinedText, allImageUrls, userName, openaiApiKey, extractedData);
    
    if (!classification || classification.confidence < PARSING_CONFIG.CONFIDENCE_THRESHOLD) {
      console.log(`parsePostData: Classification confidence too low: ${classification?.confidence || 0}`);
      cleanupAllImages(extractedData);
      return [];
    }

    console.log(`parsePostData: Content classified as: ${classification.contentType}`);

    console.log(`\n=== STAGE 2 RESULT ===`);
    console.log(`Content Type: ${classification.contentType}`);
    console.log(`Estimated Items: ${classification.estimatedItemCount}`);
    console.log(`Confidence: ${classification.confidence}`);

    // STAGE 3: Content Extraction
    console.log('\n=== STAGE 3: CONTENT EXTRACTION ===');
    const rawExtractedData = extractContentByType(
      classification.contentType,
      combinedText,
      allImageUrls,
      userName,
      timestamp,
      openaiApiKey
    );

    if (!rawExtractedData || rawExtractedData.length === 0) {
      console.log('parsePostData: No content extracted');
      cleanupAllImages(extractedData);
      return [];
    }

    console.log(`parsePostData: Extracted ${rawExtractedData.length} raw items`);

    // Add pipeline indices to each item for tracking through the pipeline
    rawExtractedData.forEach((item, idx) => {
      item._pipelineIndex = idx + 1;
      item._pipelineTotalStage3 = rawExtractedData.length;
    });
    console.log(`parsePostData: Assigned pipeline indices [1-${rawExtractedData.length}] to Stage 3 items`);

    // STAGE 3.5: Use Facebook Events utcStartDate as authoritative source for date/time
    // Facebook Events scrapes have dedicated date/time fields that are MORE RELIABLE than GPT extraction
    // or any weekday-based date correction logic. ALWAYS use utcStartDate when available.
    if (extractedData && extractedData.utcStartDate) {
      console.log('\n=== STAGE 3.5: FACEBOOK EVENTS TIME RESOLUTION ===');
      console.log(`Found utcStartDate in extractedData: ${extractedData.utcStartDate}`);

      // Use the script's timezone for consistent local time conversion
      const tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone && Session.getScriptTimeZone())
        ? Session.getScriptTimeZone()
        : 'America/Halifax';

      rawExtractedData.forEach((item, i) => {
        const needsTime = !item.startTime || item.startTime === 'unknown' || item.startTime === '';

        try {
          const utcDate = new Date(extractedData.utcStartDate);
          if (!isNaN(utcDate.getTime())) {
            // Convert UTC to local time using Utilities.formatDate for proper timezone handling
            const localTime = (typeof Utilities !== 'undefined' && Utilities.formatDate)
              ? Utilities.formatDate(utcDate, tz, 'HH:mm')
              : String(utcDate.getHours()).padStart(2, '0') + ':' + String(utcDate.getMinutes()).padStart(2, '0');

            const localDate = (typeof Utilities !== 'undefined' && Utilities.formatDate)
              ? Utilities.formatDate(utcDate, tz, 'yyyy-MM-dd')
              : utcDate.toISOString().split('T')[0];

          const hasMultipleExplicitDates = rawExtractedData.length > 1 && item.timeFlags && item.timeFlags.start && item.timeFlags.start.source === 'explicit';
          // ALWAYS override the date from utcStartDate when we don't already have multiple explicit dates captured
          if (!hasMultipleExplicitDates) {
            // This fixes cases where GPT or date correction logic got the date wrong
            // (e.g., "Fri Feb 14th" when Feb 14 is actually a Saturday)
            if (item.date !== localDate) {
              console.log(`Stage 3.5: Item "${item.name}" - OVERRIDING date from utcStartDate: "${item.date}" → "${localDate}" (utcStartDate is authoritative)`);
              item.date = localDate;
              item._dateSourcedFromUtcStartDate = true;
            } else {
              console.log(`Stage 3.5: Item "${item.name}" - date already matches utcStartDate: "${localDate}"`);
            }
          } else {
            console.log(`Stage 3.5: Item "${item.name}" - keeping extracted date "${item.date}" because multiple explicit dates were provided`);
          }

            // Set time if needed
            if (needsTime) {
              console.log(`Stage 3.5: Item "${item.name}" - Setting startTime from utcStartDate: "${item.startTime || 'unknown'}" → "${localTime}"`);
              item.startTime = localTime;
              item._timeSourcedFromUtcStartDate = true;
            } else {
              console.log(`Stage 3.5: Item "${item.name}" - already has startTime="${item.startTime}", keeping it`);
            }
          }
        } catch (e) {
          console.error(`Stage 3.5: Error parsing utcStartDate for item "${item.name}":`, e);
        }
      });
    }

    console.log(`\n=== STAGE 3 RESULT ===`);
    rawExtractedData.forEach((item, i) => {
      console.log(`Item [${item._pipelineIndex}/${item._pipelineTotalStage3}]: "${item.name}" | Type: ${item._sourceType || 'unknown'} | Date: ${item.date} | Time: ${item.startTime || 'none'}`);
    });

    // STAGE 4: Secondary Validation
    console.log('\n=== STAGE 4: SECONDARY VALIDATION ===');
    const validatedData = performSecondaryValidation(rawExtractedData, userName, timestamp, openaiApiKey);
    
    if (!validatedData || validatedData.length === 0) {
      console.log('parsePostData: No items passed secondary validation');
      cleanupAllImages(extractedData);
      return [];
    }

    console.log(`parsePostData: ${validatedData.length} items passed secondary validation`);

    console.log(`\n=== STAGE 4 RESULT ===`);
    console.log(`Items before validation: ${rawExtractedData.length}`);
    console.log(`Items after validation: ${validatedData.length}`);
    console.log(`Items rejected: ${rawExtractedData.length - validatedData.length}`);
    console.log(`Stage 4 Happy Hour no-price overrides: ${validatedData._happyHourNoPriceOverrideCount || 0}`);

    // STAGE 5: Final Formatting
    console.log('\n=== STAGE 5: FINAL FORMATTING ===');
    const formattedEvents = performFinalFormatting(validatedData, userName, partialAddress, timestamp, openaiApiKey);
    
    if (!formattedEvents || formattedEvents.length === 0) {
      console.log('parsePostData: No events formatted successfully');
      cleanupAllImages(extractedData);
      return [];
    }

    console.log(`\n=== STAGE 5 RESULT ===`);
    formattedEvents.forEach((item, i) => {
      console.log(`Final ${i+1}: "${item.name}" | ${item.isEvent === 'Yes' ? 'EVENT' : 'SPECIAL'} | ${item.category} | ${item.establishment}`);
    });

    // Merge Stage-4 timeFlags back if Stage-5 omitted them
    const formattedEventsWithFlags = formattedEvents.map((it, i) => {
      try {
        if (!it.timeFlags && validatedData && validatedData[i] && validatedData[i].timeFlags) {
          it.timeFlags = validatedData[i].timeFlags;
        }
      } catch (e) { /* ignore */ }
      return it;
    });

    // STAGE 5.5: HOURS-BASED TIME RESOLUTION (after venue is locked in Stage 5)
    console.log('\n=== STAGE 5.5: HOURS-BASED TIME RESOLUTION ===');
    const timeResolvedEvents = resolveTimesWithOperatingHours(formattedEventsWithFlags, userName, partialAddress, timestamp);

    // STAGE 5.5 LOG SUMMARY
    try {
      const total = timeResolvedEvents.length;
      let used = 0, toClose = 0, startFromHours = 0, catDefault = 0, noPlace = 0, noHours = 0, noDate = 0;
      timeResolvedEvents.forEach(it => {
        if (it.timeResolution && it.timeResolution.hoursUsed) used++;
        if (it.timeResolution && it.timeResolution.endFromHours === 'to_close') toClose++;
        if (it.timeResolution && it.timeResolution.startFromHours) startFromHours++;
        if (it.timeResolution && it.timeResolution.endFromHours === 'category_default') catDefault++;
        const reason = it.timeResolution && it.timeResolution.reason;
        if (reason === 'no_place_match') noPlace++;
        if (reason === 'no_hours') noHours++;
        if (reason === 'no_date') noDate++;
      });
      console.log(`Stage 5.5 summary: total=${total} hoursUsed=${used} startFromHours=${startFromHours} endToClose=${toClose} categoryDefault=${catDefault} no_place_match=${noPlace} no_hours=${noHours} no_date=${noDate}`);
    } catch (e) {
      console.error('Stage 5.5 summary logging error', e);
    }

// Assign startTime for specials when missing (use post timestamp; timestamps are already local), then normalize overnight endDate.
const postedHHMM = (() => {
  try {
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch (e) {
    return '';
  }
})();

const normalizedEvents = (timeResolvedEvents || []).map((ev, i) => {
  try {
    if (!ev) return ev;

// ---- 1) Synthesize startTime from post time when missing & not explicit (specials, and certain events with clear "today/tonight") ----
const isSpecial =
  ev.isFoodSpecial === true ||
  String(ev.isFoodSpecial || '').toLowerCase() === 'yes' ||
  /special/i.test(String(ev.category || ''));

// Event categories we consider safe to default to "posted time" when clearly about today/tonight
const eventCategoriesForFallback = [
  "Live Music", "Comedy", "Trivia Night", "Open Mic", "Karaoke", "DJ/Nightlife", "Gatherings & Parties"
];

const isEventLikely =
  String(ev.isEvent || '').toLowerCase() === 'yes' ||
  eventCategoriesForFallback.includes(String(ev.category || ''));

// Simple semantic cue that the post refers to the current day
const hasTodayCue = /today|tonight|this\s*(evening|afternoon|morning|weekend)/i.test(
  `${ev.description || ''} ${ev.extractionReason || ''}`
);

const hasExplicitStart = !!(ev.timeFlags && ev.timeFlags.start && ev.timeFlags.start.source === 'explicit');
const hasStartClock = !!(ev.startTime && String(ev.startTime).trim() !== '');

if ((isSpecial || (isEventLikely && hasTodayCue)) && !hasStartClock && !hasExplicitStart && postedHHMM) {
  ev.startTime = postedHHMM;

  // provenance (non-breaking if timeFlags missing)
  ev.timeFlags = ev.timeFlags || {};
  ev.timeFlags.start = ev.timeFlags.start || {};
  ev.timeFlags.start.source = 'semantic';             // we synthesized it from the post time
  if (!ev.timeFlags.start.evidence) ev.timeFlags.start.evidence = 'posted time';

  if (ev.extractionReason) {
    ev.extractionReason += ` | Start from post time ${postedHHMM}`;
  } else {
    ev.extractionReason = `Start from post time ${postedHHMM}`;
  }
}

    // ---- 2) Overnight normalize: if end clock < start clock, bump endDate exactly +1 day ----
    if (!ev.startDate || !ev.startTime) return ev;

    const endStr = String(ev.endTime || '');
    if (!endStr) return ev;

// Normalize end to HH:mm (prefer AM/PM if present; fallback to 24h)
let endHHMM = '';
const m12 = endStr.match(/(\d{1,2}):([0-5]\d):\d{2}\s*(AM|PM)/i);
if (m12) {
  let hh = parseInt(m12[1], 10);
  const mm = m12[2];
  const mer = m12[3].toUpperCase();
  if (mer === 'PM' && hh !== 12) hh += 12;
  if (mer === 'AM' && hh === 12) hh = 0;
  endHHMM = `${String(hh).padStart(2, '0')}:${mm}`;
} else {
  const m24 = endStr.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m24) {
    endHHMM = `${String(parseInt(m24[1], 10)).padStart(2, '0')}:${m24[2]}`;
  }
}

    if (!endHHMM) return ev;

    const startHHMM = /^\d{2}:\d{2}$/.test(String(ev.startTime)) ? String(ev.startTime) : '';
    if (!startHHMM) return ev;

    if (endHHMM < startHHMM) {
      const expected = (function(ymd) {
        const d = new Date(`${ymd}T00:00:00`);
        d.setDate(d.getDate() + 1);
        return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      })(ev.startDate);
      if (ev.endDate !== expected) {
        console.log(`Stage5.5 normalize: "${ev.name}" crosses midnight (${startHHMM}→${endStr}). endDate ${ev.endDate || '<empty>'} → ${expected}`);
        ev.endDate = expected;
      }
    }
  } catch (e) {
    console.warn('Stage5.5 normalize: error on event', i, e);
  }
  return ev;
});

// Process formatted events with metadata
const processedEvents = processEvents(normalizedEvents, userName, facebookUrl, profilePicUrl, mediaUrls, sharedPostThumbnails, extractedData);
processedEvents._happyHourNoPriceOverrideCount = validatedData._happyHourNoPriceOverrideCount || 0;

    
    console.log(`parsePostData: Completed. Final events: ${processedEvents.length}`);
    return processedEvents;




  } catch (error) {
    console.error('parsePostData: Error in parsing system:', error);
    cleanupAllImages(extractedData);
    return [];
  }
}

// ==========================
// STAGE 1: CONTENT VALIDATION
// ==========================

function validateContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log('validateContent: Starting content validation');
  
  const validationPrompt = createValidationPrompt(combinedText, allImageUrls.length > 0, userName, timestamp);
  
  try {
    let response = callGPTWithSchema(validationPrompt, allImageUrls, openaiApiKey, 'validateContent', createValidationSchema());
if (typeof response === 'string') {
  try {
    response = JSON.parse(response);
  } catch (e) {
    response = {
      imageAnalysis: [],
      hasValidContent: false,
      confidence: 0,
      validationDecision: 'VALIDATION_FAILED',
      reason: response || 'Model returned unstructured text'
    };
  }
}
    
    // Log image analysis
    if (response.imageAnalysis && response.imageAnalysis.length > 0) {
      console.log('validateContent: Image analysis results:');
      response.imageAnalysis.forEach(img => {
        console.log(`  - Image ${img.imageIndex}: ${img.description}`);
        console.log(`    Relevance: ${img.relevanceToPost}`);
      });
    } else {
      console.log('validateContent: No images to analyze');
    }

    // Local text signals (calendar/roundup heuristics)
    const textSignals = detectCalendarSignals(combinedText);
    console.log(`validateContent: TextSignals hasCalendar=${textSignals.hasCalendar} timeLines=${textSignals.timeLines} distinctVenues=${textSignals.distinctVenues} weekdayCount=${textSignals.weekdayCount} atCount=${textSignals.atCount}`);

    // Merge policy: if model rejected but text clearly looks like a calendar/roundup, override to PASS
    if ((!response.hasValidContent || response.validationDecision === 'VALIDATION_FAILED') && textSignals.hasCalendar) {
      const prevReason = String(response.reason || '').trim();
      response.hasValidContent = true;
      response.validationDecision = 'VALIDATION_PASSED';
      response.confidence = Math.max(Number(response.confidence || 0), 0.8);
      response.reason = (prevReason ? prevReason + ' | ' : '') + 'Text calendar/roundup detected (override PASS)';
      console.log('validateContent: Decision overridden to PASS due to strong text calendar signals');
    }
    
    // Log validation decision
    console.log(`validateContent: ${response.validationDecision}: ${response.reason}`);
    console.log(`validateContent: Confidence: ${response.confidence}`);

    return response;
  } catch (error) {
    console.error('validateContent: Error during validation:', error);
    return {
      imageAnalysis: [],
      hasValidContent: false,
      confidence: 0,
      validationDecision: 'VALIDATION_FAILED',
      reason: `Validation error: ${error.message}`
    };
  }
}

function createValidationPrompt(combinedText, hasImages, userName, timestamp) {
  return `You are the first stage of a 5 stage Social Media post processer. Your job is to determine if this social media post contains valid events or food/drink specials worth extracting.

POST DETAILS:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"
- Has images: ${hasImages}

Image Preprocessing
- Preprocess this image for OCR: crop to content, de-skew/dewarp, denoise, convert to high-contrast grayscale, sharpen text edges, and export a clean, straight 300+ DPI version.
- If the poster shows separate weekday tiles/lines (e.g., Thursday / Friday / Saturday), treat EACH tile/line as its own region. Read the time from WITHIN the same region as the act for that day.

VALID CONTENT:
✓ Events: Live music, trivia, comedy, workshops, parties WITH specific timing
✓ Food Specials: Happy hour, wing nights, drink deals WITH cost savings, food deal WITH cost savings
✓ Calendars or schedules showing multiple events/specials

INVALID CONTENT:
✗ Business hours only
✗ Holiday greetings without events
✗ General marketing without specifics
✗ Menu announcements without deals
✗ "Visit us" without events/specials

ANALYSIS REQUIREMENTS:
1. First, analyze any images present and describe what you see
2. Then analyze the text content
3. Determine if valid content exists
4. Provide clear reasoning for your decision

DECISION POLICY (MUST FOLLOW):
- Never reject a post solely because the image appears decorative or generic if the TEXT clearly lists events (e.g., multiple lines with times and venues).
- Calendars/roundups that enumerate multiple events/venues in text are VALID even if the image has no event info.
- Reject only when BOTH image and text lack extractable events/specials.

Analyze the content and determine if it contains valid extractable information.`;
}

function createValidationSchema() {
  return [{
    "name": "validateContent",
    "description": "Validate if content contains extractable events or specials with image analysis",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "imageAnalysis": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "imageIndex": {
                "type": "integer",
                "description": "0-based index of the image"
              },
              "description": {
                "type": "string",
                "description": "What is shown in this image"
              },
              "relevanceToPost": {
                "type": "string",
                "description": "How this image relates to events/specials"
              }
            },
            "required": ["imageIndex", "description", "relevanceToPost"]
          },
          "description": "Analysis of each image in the post"
        },
        "hasValidContent": {
          "type": "boolean",
          "description": "Whether content contains valid events or specials"
        },
        "confidence": {
          "type": "number",
          "description": "Confidence level 0.0 to 1.0"
        },
        "validationDecision": {
          "type": "string",
          "enum": ["VALIDATION_PASSED", "VALIDATION_FAILED"],
          "description": "Clear pass/fail decision"
        },
        "reason": {
          "type": "string",
          "description": "Detailed reason for the validation decision"
        }
      },
      "required": ["imageAnalysis", "hasValidContent", "confidence", "validationDecision", "reason"]
    }
  }];
}

// Heuristic: detect calendar/roundup structure in text (multiple times + multiple venues/lines)
function detectCalendarSignals(text) {
  try {
    const t = String(text || '');
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const time12 = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i;
    const time24 = /\b[01]?\d:[0-5]\d\b/;
    const weekdayRe = /\b(mon|tue|wed|thu|thur|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const headerRe = /\bevents?\s*:/i;

    let timeLines = 0;
    let weekdayCount = 0;
    let atCount = 0;
    const venues = new Set();

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (time12.test(l) || time24.test(l)) timeLines++;
      if (weekdayRe.test(l)) weekdayCount++;

      // Pattern A: "11:00 am - Venue Name: Title"
      let m = l.match(/^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)|[01]?\d:[0-5]\d)\s*[–-]\s*([^:]+?):/i);
      if (m && m[2]) {
        const v = m[2].replace(/\s+/g, ' ').trim();
        if (v && v.length >= 3) venues.add(v);
        continue;
      }

      // Pattern B: "... at Venue Name"
      m = l.match(/\b(?:at|@)\s+([A-Z][\w'&\- ]{2,})/i);
      if (m && m[1]) {
        const v = m[1].replace(/\s+/g, ' ').trim();
        venues.add(v);
        atCount++;
      }
    }

    const hasHeader = headerRe.test(t) || /what[’']?s happening/i.test(t);

    // Calendar if: many time lines AND >=2 venues, or header + many time lines, or weekday cues + venues
    const hasCalendar =
      (timeLines >= 3 && venues.size >= 2) ||
      (hasHeader && timeLines >= 5) ||
      (weekdayCount >= 2 && (venues.size >= 2 || atCount >= 2));

    return { hasCalendar, timeLines, distinctVenues: venues.size, weekdayCount, atCount };
  } catch (e) {
    return { hasCalendar: false, timeLines: 0, distinctVenues: 0, weekdayCount: 0, atCount: 0 };
  }
}

// ============================
// STAGE 2: CONTENT CLASSIFICATION
// ============================

function classifyContent(combinedText, allImageUrls, userName, openaiApiKey, extractedData) {
  console.log('classifyContent: Starting content classification');

  const classificationPrompt = createClassificationPrompt(combinedText, allImageUrls.length > 0, userName, extractedData);
  
  try {
    let response = callGPTWithSchema(classificationPrompt, allImageUrls, openaiApiKey, 'classifyContent', createClassificationSchema());
if (typeof response === 'string') {
  try {
    response = JSON.parse(response);
  } catch (e) {
    response = {
      contentAnalysis: {
        hasEvents: false,
        hasFoodSpecials: false,
        hasMultipleItems: false,
        organizationStyle: 'unknown'
      },
      contentType: 'unknown',
      confidence: 0,
      classificationReason: response || 'Model returned unstructured text',
      estimatedItemCount: 0
    };
  }
}
    
    // Log content analysis
    if (response.contentAnalysis) {
      console.log('classifyContent: Content analysis:');
      console.log(`  - Has events: ${response.contentAnalysis.hasEvents}`);
      console.log(`  - Has food specials: ${response.contentAnalysis.hasFoodSpecials}`);
      console.log(`  - Has multiple items: ${response.contentAnalysis.hasMultipleItems}`);
      console.log(`  - Organization style: ${response.contentAnalysis.organizationStyle}`);
    }
    
    // POST-PROCESSING: Fix contradictory classifications
    // If GPT says MIXED_EVENTS_AND_SPECIALS but hasFoodSpecials is false, correct to EVENT
    if (response.contentType === 'MIXED_EVENTS_AND_SPECIALS' &&
        response.contentAnalysis &&
        response.contentAnalysis.hasFoodSpecials === false) {
      console.log('classifyContent: CORRECTING contradictory classification - MIXED but no food specials');
      console.log(`  Original: MIXED_EVENTS_AND_SPECIALS with confidence ${response.confidence}`);
      response.contentType = 'EVENT';
      response.classificationReason = (response.classificationReason || '') + ' | Corrected: No food specials detected, reclassified as EVENT.';
      // Boost confidence since it's clearly an event
      response.confidence = Math.max(response.confidence, 0.75);
      console.log(`  Corrected: EVENT with confidence ${response.confidence}`);
    }

    // POST-PROCESSING: Boost confidence for confirmed Facebook Events
    // When utcStartDate exists, this is a structured Facebook Event with reliable metadata
    if (extractedData && extractedData.utcStartDate && response.contentAnalysis && response.contentAnalysis.hasEvents) {
      const minConfidenceForFBEvent = 0.8;
      if (response.confidence < minConfidenceForFBEvent) {
        console.log(`classifyContent: Boosting confidence for Facebook Event (utcStartDate present)`);
        console.log(`  Original confidence: ${response.confidence} → ${minConfidenceForFBEvent}`);
        response.confidence = minConfidenceForFBEvent;
        response.classificationReason = (response.classificationReason || '') + ' | Confidence boosted: Facebook Event with structured date/time data.';
      }
    }

    // Log classification decision
    console.log(`classifyContent: CLASSIFICATION DECISION: ${response.contentType}`);
    console.log(`classifyContent: Reason: ${response.classificationReason}`);
    console.log(`classifyContent: Confidence: ${response.confidence}`);
    console.log(`classifyContent: Estimated items: ${response.estimatedItemCount}`);

    return response;
  } catch (error) {
    console.error('classifyContent: Error during classification:', error);
    return {
      contentAnalysis: {
        hasEvents: false,
        hasFoodSpecials: false,
        hasMultipleItems: false,
        organizationStyle: 'unknown'
      },
      contentType: 'unknown',
      confidence: 0,
      classificationReason: `Classification error: ${error.message}`,
      estimatedItemCount: 0
    };
  }
}

function createClassificationPrompt(combinedText, hasImages, userName, extractedData) {
  // Build Facebook Events context if available
  let facebookEventContext = '';
  if (extractedData && extractedData.utcStartDate) {
    const eventDate = extractedData.utcStartDate.split('T')[0]; // YYYY-MM-DD
    const eventTime = extractedData.utcStartDate.split('T')[1]?.substring(0, 5) || ''; // HH:mm
    facebookEventContext = `
- FACEBOOK EVENT DATA (from Facebook's event system):
  - Event Date: ${eventDate}
  - Event Time (UTC): ${eventTime}
  - This is a confirmed Facebook Event with structured date/time data.`;
  }

  return `Classify this validated content into ONE of these categories:

CONTENT:
- Posted by: ${userName}
- Text: "${combinedText}"
- Has images: ${hasImages}${facebookEventContext}

CLASSIFICATION CATEGORIES:

1. EVENT - Single or few entertainment activities
   Examples: "Live music tonight 8pm", "Trivia Tuesday at 7"
   NOTE: If FACEBOOK EVENT DATA is present above, this is likely an EVENT even if the text is promotional/biographical.

2. FOOD_SPECIAL - Food/drink deals only
   Examples: "Happy hour 5-7pm half price apps", "$0.50 wings tonight"

3. MIXED_EVENTS_AND_SPECIALS - Both events AND specials together
   Examples: "Live music 8pm plus happy hour 5-7pm"

4. CALENDAR - Date-organized content with many events
   Examples: Monthly calendars, weekly schedules by date

5. SCHEDULE - Time-organized content with many events
   Examples: "Monday: Band A, Tuesday: Band B", performance lineups

ANALYSIS REQUIREMENTS:
1. Analyze what content elements are present
2. Determine which category best fits
3. Provide detailed reasoning for your classification choice
4. If FACEBOOK EVENT DATA is present, factor that into your confidence level

Analyze and classify into exactly ONE category.`;
}

function createClassificationSchema() {
  return [{
    "name": "classifyContent",
    "description": "Classify content into one of five routing categories with reasoning",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "contentAnalysis": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "hasEvents": {
              "type": "boolean",
              "description": "Whether entertainment/activities are present"
            },
            "hasFoodSpecials": {
              "type": "boolean",
              "description": "Whether food/drink deals are present"
            },
            "hasMultipleItems": {
              "type": "boolean",
              "description": "Whether multiple events/specials are listed"
            },
            "organizationStyle": {
              "type": "string",
              "description": "How content is organized (by date, time, or unstructured)"
            }
          },
          "required": ["hasEvents", "hasFoodSpecials", "hasMultipleItems", "organizationStyle"]
        },
        "contentType": {
          "type": "string",
          "enum": ["EVENT", "FOOD_SPECIAL", "MIXED_EVENTS_AND_SPECIALS", "CALENDAR", "SCHEDULE"],
          "description": "Content classification"
        },
        "confidence": {
          "type": "number",
          "description": "Classification confidence 0.0 to 1.0"
        },
        "classificationReason": {
          "type": "string",
          "description": "Detailed reasoning for why this classification was chosen"
        },
        "estimatedItemCount": {
          "type": "integer",
          "description": "Estimated number of events/specials to extract"
        }
      },
      "required": ["contentAnalysis", "contentType", "confidence", "classificationReason", "estimatedItemCount"]
    }
  }];
}

// ==========================
// STAGE 3: CONTENT EXTRACTION
// ==========================

function extractContentByType(contentType, combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log(`extractContentByType: Processing ${contentType}`);

  try {
    let rawData = [];

    switch (contentType) {
      case 'EVENT':
        rawData = extractEvents(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
        break;
        
      case 'FOOD_SPECIAL':
        rawData = extractFoodSpecials(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
        break;
        
      case 'MIXED_EVENTS_AND_SPECIALS':
        // Run both extractors independently
        const events = extractEvents(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
        const specials = extractFoodSpecials(combinedText, allImageUrls, userName, timestamp, openaiApiKey);

        // Tag each item with its source to help Stage 4 validation
        const taggedEvents = events.map(event => ({ ...event, _sourceType: 'event' }));
        const taggedSpecials = specials.map(special => ({ ...special, _sourceType: 'special' }));

        // Deduplicate: If both extractors found the same FOOD item, prefer the food special extractor's version
        // This handles cases where event extractor incorrectly extracts food items despite being told to ignore them
        const foodKeywordsRe = /\b(wrap|soup|burger|pizza|wings|sandwich|salad|taco|tacos|fries|special|appetizer|entree|dinner|lunch|breakfast|brunch|steak|chicken|fish|seafood|pasta|nachos|quesadilla|burrito|poutine|platter|ribs|bbq|grill|happy hour|wing night)\b/i;

        const specialNames = new Map();
        taggedSpecials.forEach(special => {
          if (special && special.name) {
            const key = String(special.name).toLowerCase().trim();
            const desc = String(special.description || '').toLowerCase();
            const isFoodRelated = foodKeywordsRe.test(key) || foodKeywordsRe.test(desc);
            specialNames.set(key, isFoodRelated);
          }
        });

        const deduplicatedEvents = taggedEvents.filter(event => {
          if (!event || !event.name) return true;
          const key = String(event.name).toLowerCase().trim();
          const desc = String(event.description || '').toLowerCase();
          const eventIsFoodRelated = foodKeywordsRe.test(key) || foodKeywordsRe.test(desc);

          if (specialNames.has(key) && specialNames.get(key) && eventIsFoodRelated) {
            console.log(`extractContentByType: Removing food-related duplicate "${event.name}" from events (already in food specials)`);
            return false;
          }
          return true;
        });

        rawData = [...deduplicatedEvents, ...taggedSpecials];
        break;
        
      case 'CALENDAR':
        rawData = extractCalendarContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
        break;
        
      case 'SCHEDULE':
        rawData = extractScheduleContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey);
        break;
        
      default:
        console.log(`extractContentByType: Unknown content type: ${contentType}`);
        return [];
    }

    console.log(`extractContentByType: Extracted ${rawData.length} items from ${contentType}`);
    return rawData;

  } catch (error) {
    console.error(`extractContentByType: Error processing ${contentType}:`, error);
    return [];
  }
}

// EVENT EXTRACTOR
function extractEvents(combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log('extractEvents: Starting event-only extraction');

  // Compute local posted date/time for correct weekday → date mapping
  const _tzRef = (Session.getScriptTimeZone && Session.getScriptTimeZone()) ? Session.getScriptTimeZone() : 'America/Halifax';
  const _postedLocalPretty = (() => { try { return Utilities.formatDate(new Date(timestamp), _tzRef, "yyyy-MM-dd EEE HH:mm:ss"); } catch(e){ return "(format failed)"; } })();
  const _postedLocalDate = (() => { try { return Utilities.formatDate(new Date(timestamp), _tzRef, "yyyy-MM-dd"); } catch(e){ return ""; } })();

const prompt = `Extract ONLY EVENTS (entertainment/activities) from this content. IGNORE all food/drink specials.

- When a single session or workshop block lists multiple explicit dates/times (e.g., "Session 1: Jan 14 & 28, 6-8 pm"), emit a separate event object for each listed date/time pair instead of collapsing them into one. Only treat it as a recurring event if the language explicitly says "every" or "weekly" with a weekday.

CONTENT:
- Posted by: ${userName}
- Posted at (UTC ISO): ${timestamp}
- Reference timezone: ${_tzRef}
- Posted at (local): ${_postedLocalPretty}
- Text: "${combinedText}"

Image Preprocessing
- Preprocess this image for OCR: crop to content, de-skew/dewarp, denoise, convert to high-contrast grayscale, sharpen text edges, and export a clean, straight 300+ DPI version.
- If the poster shows separate weekday tiles/lines (e.g., Thursday / Friday / Saturday), treat EACH tile/line as its own region. Read the time from WITHIN the same region as the act for that day.

DATE RESOLUTION RULES (MANDATORY — EXACT ALGORITHM):
- Timezone: use ${_tzRef}. Convert ${timestamp} to the posted LOCAL date = ${_postedLocalDate} and weekday = ${_postedLocalPretty.split(' ')[2]}.
- For each weekday term printed on the poster (e.g., "Thursday", "Friday", "Saturday"):
  1) Compute the calendar date for the **next occurrence ON OR AFTER** the posted local date in ${_tzRef}.
     - If the weekday equals the posted weekday, use the posted date (same day) unless the text clearly says "next".
     - Otherwise, move forward to the coming occurrence within the next 6 days.
  2) Do **not** roll into the following week unless the post explicitly says so ("next Friday", a future explicit month/day, etc.).
- If the poster lists consecutive weekdays (e.g., "Thu / Fri / Sat"), the resulting dates **must be consecutive days** in ascending order.
- If an explicit month/day is printed anywhere, that explicit date overrides weekday math.
- Output "date" in YYYY-MM-DD computed in ${_tzRef}.

CONSISTENCY SELF-CHECK (MANDATORY):
- For each extracted event: if timeFlags.start.source="explicit", ensure startTime strictly matches the time token inside timeFlags.start.evidence after normalization (e.g., “From 9 pm” → 21:00). If there is any mismatch, correct startTime to match the evidence.

Concrete example for THIS post:
- Reference (local) = **2025-09-24 (Wed)** in ${_tzRef}.
- Therefore: **Thursday → 2025-09-25**, **Friday → 2025-09-26**, **Saturday → 2025-09-27**.
- Do **NOT** return Thu=2025-09-26, Fri=2025-09-27, Sat=2025-09-28.

Concrete example for THIS post — TIMES:
- Thursday: startTime **22:00** (explicit "From 10 pm")
- Friday:   startTime **22:00** (explicit "From 10 pm")
- Saturday: startTime **21:00** (explicit "From 9 pm")

- If timeFlags.start.source is "explicit", startTime MUST equal the normalized time parsed from timeFlags.start.evidence.



TIME ASSOCIATION RULES (MANDATORY — PER-DAY REGION):
- Use ONLY times that are visibly present in the post TEXT or IMAGE. Do not infer or estimate.
- **Per-day rule:** Assign the start time that appears in the SAME tile/line/region as that weekday’s act. **Do NOT** copy a time from another day’s region.
- If the poster includes a single GLOBAL time **and** none of the per-day regions show a different time, you may apply the global time to all acts. **If ANY per-day region shows its own time (e.g., “From 9 pm”), that per-day time MUST override the global time for that day.**
- Normalize colloquial phrases: “From 9 pm”, “Starting at 9pm” → startTime “21:00”.
- Never output “22:00” unless you actually read a “10 pm/10:00 PM/22:00” token in the SAME region for that day.
- Accepted formats include: "9pm", "9 pm", "9 p.m.", "9PM", "9:00 PM", or phrases like "From 9 pm". Normalize to 24h "HH:mm" in ${_tzRef} (e.g., "From 9 pm" → "21:00").
- Evidence requirement: set timeFlags.start.source="explicit" and timeFlags.start.evidence to the exact substring you read, and this substring **MUST include a time token** matching /(\d{1,2}(:\d{2})?\s*(AM|PM)|\b\d{1,2}:\d{2}\b)/i.
- Prefer evidence that includes the nearby weekday/label when possible (e.g., "Saturday — From 9 pm").
- **If your evidence does not contain a time token from the SAME region, set startTime="unknown" and timeFlags.start.source="none". Do not guess or copy a global time in this case.**
- Never fabricate an end time. If none is visible, set endTime="unknown" and timeFlags.end.toClose=false.

HARD CONSISTENCY INVARIANTS (apply per item before emitting JSON):
1) If timeFlags.start.source === "explicit":
   - Parse the hour/minute from timeFlags.start.evidence and set startTime = normalized "HH:mm".
   - If parsing fails (no time token), set timeFlags.start.source="none", timeFlags.start.evidence="", and set startTime="unknown".
   - It is an ERROR for explicit evidence to contradict startTime. Do not emit contradictory JSON.
2) If timeFlags.start.source !== "explicit":
   - Do NOT copy a global time into startTime when any per-day time exists.
3) Assert examples:
   - Evidence containing “from 9 pm” / “9 p.m.” ⇒ startTime MUST be “21:00”.
   - Evidence containing “from 10 pm” / “10 p.m.” ⇒ startTime MUST be “22:00”.

EXTRACT ONLY:
✓ Live music, bands, DJs
✓ Trivia nights, comedy shows
✓ Workshops, classes
✓ Sports events, parties
✓ Any entertainment activity

IGNORE COMPLETELY:
✗ Food specials, happy hours, food menus
✗ Drink deals, wing nights
✗ Any cost savings on food/drinks

For each EVENT found, extract:
- name: Event name
- description: Full details - IMPORTANT: If the original text has a weekday prefix (e.g., "Friday-", "Thursday-", "Saturday-"), you MUST preserve it at the start of the description field for date validation.
- date: Specific date (YYYY-MM-DD) - NEVER use "recurring" here. For recurring events, use the first occurrence date or posted date.
- When a single session block lists multiple explicit dates (and times) in one paragraph, emit a separate event object for every date/time pair instead of collapsing them into one repeated recurrence.
- Example: “Session 1: Jan 14 & Jan 28, 6-8 pm” should produce two output objects, one dated 2026-01-14 and another 2026-01-28, both describing the same workshop but kept distinct.
- startTime: Start time.
- endTime: End time (only if shown), If no end time is shown, set endTime="" (empty string).
- venue: Venue name if different from ${userName}
- price: if no specific price mentioned, use empty string
- recurringPattern: Set to "daily" ONLY if text says "Everyday" or "Daily". Set to "weekly_monday" through "weekly_sunday" ONLY if text says "Every Monday", "Every Tuesday", etc. Otherwise set to "none".
- extractionReason: Why this was identified as an event
- timeFlags: {
      start: { source: "explicit" | "implied" | "semantic", evidence: "string" },
      end:   { source: "explicit" | "implied" | "semantic" | "none", toClose: boolean, evidence: "string" }
    }

VENUE EXTRACTION:
- Look for hints that the event is at a different venue ("at [Location]")
- If no specific venue mentioned, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with two arrays
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedEvents": [...array of events...],
  "extractionSummary": {
    "totalFound": number,
    "extractionNotes": "Overall notes about what was found and why"
  }
}

Run the HARD CONSISTENCY INVARIANTS above before returning. If any invariant fails, fix the affected item(s) and re-emit corrected JSON.
Return pure JSON with events and extraction reasoning.`;


  console.log('extractEvents: Prompt text:', prompt);
  const response = callGPT(prompt, allImageUrls, openaiApiKey);
  console.log('extractEvents: Raw GPT response:', response);
  
  try {
    const parsed = JSON.parse(response);

    // Recurring pattern detection for events
    if (parsed && Array.isArray(parsed.extractedEvents)) {
      parsed.extractedEvents.forEach(event => {
        if (!event || !event.description) return;

        // Sanitize recurringPattern from GPT (may be garbled or have trailing punctuation)
        if (event.recurringPattern) {
          const VALID_RECURRING_PATTERNS_S3 = ['none', 'daily', 'weekly_monday', 'weekly_tuesday', 'weekly_wednesday', 'weekly_thursday', 'weekly_friday', 'weekly_saturday', 'weekly_sunday'];
          const cleanedPattern = event.recurringPattern.toString().trim().replace(/[,;]+$/, '').toLowerCase();
          if (!VALID_RECURRING_PATTERNS_S3.includes(cleanedPattern)) {
            console.log(`extractEvents: ⚠️ SANITIZED garbled recurringPattern from GPT: "${event.recurringPattern.substring(0, 80)}..." → "none"`);
            event.recurringPattern = 'none';
          } else {
            event.recurringPattern = cleanedPattern;
          }
        }

        // Date correction: ONLY correct if GPT's date doesn't match the weekday in the description
        // This prevents overriding correct explicit dates (e.g., "Feb 14") with incorrect weekday-based calculations
        const dateInfo = _extractDateFromText(event.description, _postedLocalDate);
        if (dateInfo.hasExplicitDayPrefix && dateInfo.date && event.date !== dateInfo.date) {
          // Validate: check if GPT's extracted date actually matches the weekday mentioned
          // If GPT says "2026-02-14" and description says "Friday-", check if Feb 14 IS a Friday
          const gptDate = new Date(event.date + 'T00:00:00');
          const gptDayOfWeek = gptDate.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
          const descriptionDayOfWeek = _getDayOfWeekFromPrefix(event.description);

          if (descriptionDayOfWeek !== null && gptDayOfWeek === descriptionDayOfWeek) {
            // GPT's date already falls on the correct weekday - don't "correct" it
            console.log(`extractEvents: 📅 Skipping date correction for "${event.name}"`);
            console.log(`  ↳ GPT extracted: ${event.date} (${_dayName(gptDayOfWeek)})`);
            console.log(`  ↳ Description weekday prefix matches GPT's date - keeping GPT's date`);
          } else {
            // Weekday mismatch - apply correction
            console.log(`extractEvents: 📅 Correcting GPT event "${event.name}"`);
            console.log(`  ↳ GPT extracted: ${event.date} (${_dayName(gptDayOfWeek)})`);
            console.log(`  ↳ Description has explicit day prefix (${descriptionDayOfWeek !== null ? _dayName(descriptionDayOfWeek) : 'unknown'}), correcting to: ${dateInfo.date}`);
            event.date = dateInfo.date;
          }
        }

        // Check for recurring pattern in description first, then fall back to original post text
        let detectedPattern = _detectRecurringPattern(event.description);
        if (detectedPattern === 'none') {
          // Description didn't have recurring keywords - check the original post text
          detectedPattern = _detectRecurringPattern(combinedText);
        }

        if (detectedPattern !== 'none') {
          // Apply detected pattern if GPT didn't set one, or CORRECT it if GPT got the wrong day
          if (!event.recurringPattern || event.recurringPattern === 'none') {
            console.log(`extractEvents: 🔁 Detected recurring pattern for "${event.name}": ${detectedPattern}`);
            event.recurringPattern = detectedPattern;
          } else if (event.recurringPattern !== detectedPattern && event.recurringPattern.startsWith('weekly_')) {
            // GPT set a weekly pattern but got the day wrong - correct it
            console.log(`extractEvents: 🔁 CORRECTING recurring pattern for "${event.name}": GPT said "${event.recurringPattern}" but text says "${detectedPattern}"`);
            event.recurringPattern = detectedPattern;
          }
        }
      });
    }

    // Log extraction summary
    if (parsed.extractionSummary) {
      console.log(`extractEvents: Found ${parsed.extractionSummary.totalFound} events`);
      console.log(`extractEvents: Extraction notes: ${parsed.extractionSummary.extractionNotes}`);
    }

    // Log individual event reasoning
    if (parsed.extractedEvents && parsed.extractedEvents.length > 0) {
      parsed.extractedEvents.forEach((event, index) => {
        console.log(`extractEvents: Event ${index + 1} - "${event.name}"`);
        console.log(`  Extraction reason: ${event.extractionReason || 'No reason provided'}`);
      });
    }

    return parsed.extractedEvents || [];
  } catch (error) {
    console.error('extractEvents: Error parsing response:', error);
    return parseJSONResponse(response, 'events');
  }
}

// Helper function to get day of week number from a weekday prefix in text
function _getDayOfWeekFromPrefix(text) {
  const t = String(text || '').toLowerCase();
  const dayMap = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5, saturday: 6, sat: 6
  };

  const dayMatch = t.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[\s\-–—:;,]/i);
  if (!dayMatch) return null;

  const dayName = dayMatch[1].toLowerCase();
  return dayMap[dayName] !== undefined ? dayMap[dayName] : null;
}

// Helper function to get day name from day number
function _dayName(dayNum) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[dayNum] || 'Unknown';
}

// Helper function to detect recurring pattern from text
function _detectRecurringPattern(text) {
  const t = String(text || '').toLowerCase();

  // Check for daily/everyday patterns FIRST - these are the clearest recurring indicators
  if (/\b(everyday|daily)\b/i.test(t)) {
    return 'daily';
  }

  // IMPORTANT: ONLY match recurring weekday patterns with explicit keywords
  // Bare weekday names like "Thursday-" are specific dates, NOT recurring events!
  const dayMap = {
    'monday': 'weekly_monday', 'mon': 'weekly_monday',
    'tuesday': 'weekly_tuesday', 'tue': 'weekly_tuesday', 'tues': 'weekly_tuesday',
    'wednesday': 'weekly_wednesday', 'wed': 'weekly_wednesday',
    'thursday': 'weekly_thursday', 'thu': 'weekly_thursday', 'thur': 'weekly_thursday', 'thurs': 'weekly_thursday',
    'friday': 'weekly_friday', 'fri': 'weekly_friday',
    'saturday': 'weekly_saturday', 'sat': 'weekly_saturday',
    'sunday': 'weekly_sunday', 'sun': 'weekly_sunday'
  };

  // ONLY match when preceded by explicit recurring keywords: "every", "weekly", "each"
  const weeklyMatch = t.match(/\b(every|weekly|each)\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i);
  if (weeklyMatch) {
    const day = weeklyMatch[2].toLowerCase().replace(/s$/, ''); // Remove trailing 's' from group 2
    if (dayMap[day]) {
      return dayMap[day];
    }
  }

  // Secondary pattern: "weekly" appears somewhere AND "on [day] nights/evenings" appears
  // This handles: "Weekly from January 7th until March 11th, on Wednesday nights"
  if (/\bweekly\b/i.test(t)) {
    const onDayMatch = t.match(/\bon\s+(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\s*(nights?|evenings?|mornings?|afternoons?)?\b/i);
    if (onDayMatch) {
      const day = onDayMatch[1].toLowerCase().replace(/s$/, '');
      if (dayMap[day]) {
        return dayMap[day];
      }
    }
  }

  return 'none';
}

// Helper function to extract date from text with day-of-week patterns
function _extractDateFromText(text, postedDate) {
  const t = String(text || '').toLowerCase();

  if (/\b(everyday|daily)\b/i.test(t)) {
    return { date: postedDate, isRecurring: true, hasExplicitDayPrefix: false };
  }

  const dayMap = {
    sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5, saturday: 6, sat: 6
  };

  const dayMatch = t.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[\s\-–—:;,]/i);
  if (!dayMatch) return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };

  const dayName = dayMatch[1].toLowerCase();
  const targetDay = dayMap[dayName];
  if (targetDay === undefined) return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };

  try {
    const posted = new Date(postedDate);
    const postedDay = posted.getDay();

    let daysToAdd = targetDay - postedDay;
    if (daysToAdd < 0) daysToAdd += 7;

    const targetDate = new Date(posted);
    targetDate.setDate(posted.getDate() + daysToAdd);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');

    return { date: `${year}-${month}-${day}`, isRecurring: false, hasExplicitDayPrefix: true };
  } catch (e) {
    return { date: postedDate, isRecurring: false, hasExplicitDayPrefix: false };
  }
}

// FOOD SPECIAL EXTRACTOR
function extractFoodSpecials(combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log('extractFoodSpecials: Starting food special-only extraction');

// Timezone + posted-time helpers used inside the prompt (e.g., “Normalize to 24h in ${_tzRef}”)
const _tzRef = (Session.getScriptTimeZone && Session.getScriptTimeZone()) ? Session.getScriptTimeZone() : 'America/Halifax';
const _postedLocalPretty = (() => { try { return Utilities.formatDate(new Date(timestamp), _tzRef, "yyyy-MM-dd EEE HH:mm:ss"); } catch(e){ return "(format failed)"; } })();
const _postedLocalDate   = (() => { try { return Utilities.formatDate(new Date(timestamp), _tzRef, "yyyy-MM-dd"); } catch(e){ return ""; } })();
  
  const prompt = `Your job is to Extract ALL FOOD/DRINK SPECIALS that have cost savings from this content. IGNORE all events/entertainment.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

EXTRACT ALL SPECIALS (each MUST have pricing/savings):

TIME & EVIDENCE RULES (FOR SPECIALS — SAME AS EVENTS):
- Read times ONLY from the text or image regions relevant to the special. Do not infer.
- Explicit examples: “from 4 pm”, “4–6”, “4:00–6:00”, “till close”, “until close”, “open to close”, “all day”.
- Normalize to 24h "HH:mm" in ${_tzRef} (e.g., “from 9 pm” → “21:00”).
- If a poster/list shows a single GLOBAL time and a per-item time, the per-item time MUST override.
- Evidence requirement: set timeFlags.start.source to "explicit" when you read a concrete start time token; set timeFlags.start.evidence to the exact substring.
- If evidence does NOT include a time token from the same region, set timeFlags.start.source="none" and startTime="".
- “to close / till close / until close” ⇒ set timeFlags.end.toClose=true and leave endTime="" (the resolver will use venue hours).
- “all day / open to close / open ’til close” ⇒ set timeFlags.start.source="semantic" and startTime=""; set timeFlags.end.toClose=true and endTime="".

HARD CONSISTENCY INVARIANTS (apply per item before emitting JSON):
1) If timeFlags.start.source === "explicit":
   - Parse the time from timeFlags.start.evidence and set startTime to the normalized "HH:mm".
   - It is an ERROR for explicit evidence to contradict startTime; do not emit contradictory JSON.
2) If timeFlags.start.source !== "explicit", do NOT copy any global time into startTime.
3) Assert examples: “from 9 pm” ⇒ startTime “21:00”; “from 10 pm” ⇒ “22:00”.

✓ Happy hour deals (including "Everyday" happy hours)
✓ Wing nights with prices
✓ Drink specials
✓ Food discounts
✓ Breakfast/brunch specials (BREKKIE, pancakes, breakfast items, brunch items)
✓ Daily/recurring food specials (e.g., "Everyday- [special]", "Daily- [special]")
✓ Any cost savings on food/drinks

CRITICAL: Extract ALL food/drink specials even if they say "Everyday", "Daily", or appear at the end of the post text.

IGNORE COMPLETELY:
✗ Live music, trivia, entertainment
✗ Menu items without deals
✗ "All You Can Eat" without price

For each SPECIAL found, extract:
- name: Special name
- description: Full details WITH pricing - IMPORTANT: If the original text has a weekday prefix (e.g., "Friday-", "Thursday-", "Saturday-"), you MUST preserve it at the start of the description field for date validation.
- date: Specific date (YYYY-MM-DD) - NEVER use "recurring" here. For recurring specials, use the first occurrence date or posted date.
- startTime: Start time
- endTime: End time
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- pricing: Specific prices/discounts. - price: if no specific price mentioned, use empty string.
- recurringPattern: Set to "daily" ONLY if text says "Everyday" or "Daily". Set to "weekly_monday" through "weekly_sunday" ONLY if text says "Every Monday", "Every Tuesday", etc. Otherwise set to "none".
- extractionReason: Why this was identified as a valid special with cost savings

VENUE EXTRACTION - Use this priority order:

1. CHECK IMAGES FIRST: Look at the provided images for venue signs, logos, or venue names
   - Example: If images show "Hopyard" signage, that's the venue for all items

2. CHECK POST TEXT: Look for venue indicators at the start of the post text
   - Example: "THIS WEEK @ HOP!", "@ [venue name]", "[Venue] presents"

3. MAINTAIN CONSISTENCY: If extracting multiple items from this post, they should typically share the same venue based on steps 1-2
   - If images/post text indicate one venue, ALL items should use that venue unless step 4 applies

4. ITEM-SPECIFIC OVERRIDES: Only use a different venue if the individual item's description explicitly mentions a different location
   - Examples: "at [Location]", "@ [Location]", "[Day]- [Event] - [Location]", "[Location]: [Event]"
   - This venue override applies ONLY to that specific item

5. FALLBACK: If no venue found in images, post text, or item description, use empty string
   - NEVER default to ${userName} unless the post/images explicitly indicate ${userName} is the venue

CRITICAL: The poster (${userName}) may be SHARING content about another venue. Always prioritize venue evidence from images and post text over the poster's name.

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with two arrays
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
Use this exact structure:
{
  "extractedSpecials": [
    {
      "name": "string",
      "description": "string",
      "price": "string",
      "discount": "string",
      "venue": "string",
      "additionalLocation": "string",
      "date": "YYYY-MM-DD",
      "startTime": "HH:mm",            // empty "" if unknown
      "endTime": "HH:mm",              // empty "" if unknown
      "timeFlags": {
        "start": { "source": "explicit|semantic|none", "evidence": "string" },
        "end":   { "toClose": true|false, "evidence": "string" }
      },
      "reason": "why this is a special"
    }
  ],
  "extractionSummary": {
    "totalFound": number,
    "extractionNotes": "Overall notes about what was found and why"
  }
}

Run the HARD CONSISTENCY INVARIANTS above before returning.
Return pure JSON with specials and extraction reasoning.`;


  const response = callGPT(prompt, allImageUrls, openaiApiKey);
  console.log('extractFoodSpecials: Raw GPT response:', response);
  
  try {
    const parsed = JSON.parse(response);

    // Date correction: Check if GPT-extracted specials have explicit day-of-week prefixes in their descriptions
    if (parsed && Array.isArray(parsed.extractedSpecials)) {
      parsed.extractedSpecials.forEach(special => {
        if (!special || !special.description) return;

        // Sanitize recurringPattern from GPT (may be garbled or have trailing punctuation)
        if (special.recurringPattern) {
          const VALID_RECURRING_PATTERNS_FS = ['none', 'daily', 'weekly_monday', 'weekly_tuesday', 'weekly_wednesday', 'weekly_thursday', 'weekly_friday', 'weekly_saturday', 'weekly_sunday'];
          const cleanedPattern = special.recurringPattern.toString().trim().replace(/[,;]+$/, '').toLowerCase();
          if (!VALID_RECURRING_PATTERNS_FS.includes(cleanedPattern)) {
            console.log(`extractFoodSpecials: ⚠️ SANITIZED garbled recurringPattern from GPT: "${special.recurringPattern.substring(0, 80)}..." → "none"`);
            special.recurringPattern = 'none';
          } else {
            special.recurringPattern = cleanedPattern;
          }
        }

        const dateInfo = _extractDateFromText(special.description, _postedLocalDate);
        if (dateInfo.hasExplicitDayPrefix && dateInfo.date && special.date !== dateInfo.date) {
          console.log(`extractFoodSpecials: 📅 Correcting GPT special "${special.name}"`);
          console.log(`  ↳ GPT extracted: ${special.date}`);
          console.log(`  ↳ Description has explicit day prefix, correcting to: ${dateInfo.date}`);
          special.date = dateInfo.date;
        }

        // Recurring pattern detection: Check if description indicates recurring pattern
        const detectedPattern = _detectRecurringPattern(special.description);
        if (detectedPattern !== 'none' && (!special.recurringPattern || special.recurringPattern === 'none')) {
          console.log(`extractFoodSpecials: 🔁 Detected recurring pattern for "${special.name}": ${detectedPattern}`);
          special.recurringPattern = detectedPattern;
        }
      });
    }

    // Log extraction summary
    if (parsed.extractionSummary) {
      console.log(`extractFoodSpecials: Found ${parsed.extractionSummary.totalFound} specials`);
      console.log(`extractFoodSpecials: Extraction notes: ${parsed.extractionSummary.extractionNotes}`);
    }

    // Log individual special reasoning
    if (parsed.extractedSpecials && parsed.extractedSpecials.length > 0) {
      parsed.extractedSpecials.forEach((special, index) => {
        console.log(`extractFoodSpecials: Special ${index + 1} - "${special.name}"`);
        console.log(`  Extraction reason: ${special.extractionReason || 'No reason provided'}`);
        console.log(`  Pricing: ${special.pricing || 'No pricing specified'}`);
      });
    }

    return parsed.extractedSpecials || [];
  } catch (error) {
    console.error('extractFoodSpecials: Error parsing response:', error);
    return parseJSONResponse(response, 'specials');
  }
}

// CALENDAR EXTRACTOR
function extractCalendarContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log('extractCalendarContent: Starting calendar extraction');

    // [LOG][CAL] Surface exactly which images are being passed into the Calendar extractor
  const _calImgCount = Array.isArray(allImageUrls) ? allImageUrls.length : 0;
  console.log(`CAL: incoming allImageUrls size=${_calImgCount}`);
  if (_calImgCount > 0) {
    allImageUrls.forEach((u, i) => console.log(`CAL: image[${i}]=${u}`));
  } else {
    console.log('CAL: no images attached to calendar extraction');
  }

  
  const prompt = `Extract ALL events and specials from this CALENDAR content, ensure you process all attached images.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

This appears to be a calendar with multiple dates and activities.
Extract EVERY event/special listed for EVERY date shown.

IMPORTANT (Calendar grids with lineups):
- You are given 1+ images; use the images as the PRIMARY source. Read (OCR) the text in the image(s).
- Create ONE item per performance in the grid. Set name to the performer/act, not the series title.
- Include the date (or day-of-week if that’s all that’s shown), start_time and end_time when present, and the stage/venue exactly as shown in the grid.
- For lineup grids, set type="event" (do NOT use "special" unless there is an explicit price/discount).
- Do NOT infer items from the caption if they do not appear in the image; only use caption to disambiguate dates when the grid shows day-of-week only.
- If performer names in the image are unreadable, return no items and note "image_unreadable" in notes rather than guessing.


For each item found, extract:
- name: Event/special name
- type: "event" or "special"
- date: Specific date (YYYY-MM-DD)
- startTime: Time if shown
- endTime: End time if shown
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- price: if no specific price mentioned, use empty string
- description: Any additional details
- extractionReason: Why this was identified as a calendar item

Pay special attention to:
- Calendar grids in images
- Date headers
- Multiple events per date
- Venue/location information for each event

VENUE EXTRACTION:
- Look for venue names after event names
- Check for "at [Location]" patterns
- Extract venue names from event descriptions
- If no specific venue mentioned, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with extraction summary
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedItems": [...array of calendar items...],
  "extractionSummary": {
    "totalFound": number,
    "eventsFound": number,
    "specialsFound": number,
    "extractionNotes": "Overall notes about the calendar extraction"
  }
}

Return pure JSON with ALL calendar items.`;

    console.log(`CAL: calling callGPT for extraction | promptChars=${prompt.length} | imageParts=${_calImgCount}`);
  const response = callGPT(prompt, allImageUrls, openaiApiKey);

  console.log('extractCalendarContent: Raw GPT response:', response);
  
  let parsed;
  try {
    parsed = parseJsonObjectWithRepair(response, 'extractCalendarContent');
  } catch (error) {
    console.error('extractCalendarContent: Error parsing response:', error);
    return parseJSONResponse(response, 'calendar');
  }

  // Log extraction summary
  if (parsed.extractionSummary) {
    console.log(`extractCalendarContent: Calendar extraction summary:`);
    console.log(`  - Total items: ${parsed.extractionSummary.totalFound}`);
    console.log(`  - Events: ${parsed.extractionSummary.eventsFound}`);
    console.log(`  - Specials: ${parsed.extractionSummary.specialsFound}`);
    console.log(`  - Notes: ${parsed.extractionSummary.extractionNotes}`);
  }

  // Log compact item list to see what GPT actually returned vs claimed count
  if (parsed.extractedItems && parsed.extractedItems.length > 0) {
    console.log(`extractCalendarContent: GPT returned ${parsed.extractedItems.length} items (claimed ${parsed.extractionSummary?.totalFound || 'unknown'}):`);
    parsed.extractedItems.forEach((item, i) => {
      console.log(`  CalItem [${i+1}/${parsed.extractedItems.length}]: "${item.name}" | ${item.type || 'unknown'} | ${item.date} | ${item.startTime || 'no time'}`);
    });
  }

  const items = parsed.extractedItems || [];
  
  // Validate calendar extraction for completeness
  if (items.length < 5) { // Calendars typically have many items
    console.log('extractCalendarContent: Few items extracted, attempting secondary extraction');
    return performCalendarValidation(combinedText, allImageUrls, items, userName, timestamp, openaiApiKey);
  }
  
  return items;
}

// SCHEDULE EXTRACTOR
function extractScheduleContent(combinedText, allImageUrls, userName, timestamp, openaiApiKey) {
  console.log('extractScheduleContent: Starting schedule extraction');
  
  const prompt = `Extract ALL events from this SCHEDULE content.

CONTENT:
- Posted by: ${userName}
- Posted at: ${timestamp}
- Text: "${combinedText}"

This appears to be a schedule/lineup with multiple performances.
Extract EVERY performance/event listed.

For each item found, extract:
- name: Performer/event name
- day: Day of week if shown
- date: Date if available (YYYY-MM-DD)
- startTime: Performance time
- venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
- price: if no specific price mentioned, use empty string
- description: Any additional details
- extractionReason: Why this was identified as a scheduled item

Look for patterns like:
- "Monday: Band A at 8pm"
- "8pm - Venue: Performer"
- Time-based lineups

VENUE EXTRACTION:
- Look for venue names after event names
- Check for "at [Location]" patterns
- Extract venue names from event descriptions
- If no specific venue mentioned, use empty string

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object with extraction summary
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "extractedItems": [...array of scheduled items...],
  "extractionSummary": {
    "totalFound": number,
    "venuesFound": number,
    "extractionNotes": "Overall notes about the schedule extraction"
  }
}

Return pure JSON with ALL scheduled items.`;

  const response = callGPT(prompt, allImageUrls, openaiApiKey);
  console.log('extractScheduleContent: Raw GPT response:', response);
  
  try {
    const parsed = JSON.parse(response);
    
    // Log extraction summary
    if (parsed.extractionSummary) {
      console.log(`extractScheduleContent: Schedule extraction summary:`);
      console.log(`  - Total items: ${parsed.extractionSummary.totalFound}`);
      console.log(`  - Venues found: ${parsed.extractionSummary.venuesFound}`);
      console.log(`  - Notes: ${parsed.extractionSummary.extractionNotes}`);
    }
    
    return parsed.extractedItems || [];
  } catch (error) {
    console.error('extractScheduleContent: Error parsing response:', error);
    return parseJSONResponse(response, 'schedule');
  }
}

// Calendar validation helper
function performCalendarValidation(combinedText, allImageUrls, initialItems, userName, timestamp, openaiApiKey) {
  console.log('performCalendarValidation: Validating calendar extraction completeness');
  
  const validationPrompt = `This calendar extraction found only ${initialItems.length} items. 
  Please verify ALL dates and events are captured.
  
  Initial extraction: ${JSON.stringify(initialItems)}
  
  Re-examine the calendar and extract any missed items.
  
  For each additional item found, include:
  - name: Event/special name
  - type: "event" or "special"
  - date: Specific date (YYYY-MM-DD)
  - startTime: Time if shown
  - endTime: End time if shown
  - venue: Venue name if different from ${userName} (look for location names, venue names, "at [location]")
  - price: if no specific price mentioned, use empty string
  - description: Any additional details

    VENUE EXTRACTION:
  - Look for venue names after event names
  - Check for "at [Location]" patterns
  - Extract venue names from event descriptions
  - If no specific venue mentioned, use empty string
  
  CRITICAL JSON FORMATTING REQUIREMENTS:
  - Return ONLY valid JSON array of ADDITIONAL items found
  - NO markdown code blocks, NO '''json''' wrappers
  - NO explanatory text before or after JSON
  - Start with [ and end with ]
  - Return empty array [] if no additional items found
  
  Return pure JSON array with any additional calendar items.`;
  
  const response = callGPT(validationPrompt, allImageUrls, openaiApiKey);
  console.log('performCalendarValidation: Raw GPT response:', response);
  
  const additionalItems = parseJSONResponse(response, 'validation');
  
  return [...initialItems, ...additionalItems];
}

// ==============================
// STAGE 4: SECONDARY VALIDATION
// ==============================

function performSecondaryValidation(rawData, userName, timestamp, openaiApiKey) {
  console.log('performSecondaryValidation: Starting secondary validation');

  // Capture the original Stage 3 count before any GPT processing
  // This ensures we preserve the correct count even if GPT reorders/drops items
  const originalStage3Count = rawData.length;

  console.log('performSecondaryValidation: Items to validate:', JSON.stringify(rawData, null, 2));

  // Get current date for holiday detection context
  const currentYear = new Date().getFullYear();

  function hasNonEmptyValue(value) {
    if (value === undefined || value === null) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized !== '' && normalized !== 'unknown';
  }

  function hasPricingOrDiscount(item) {
    if (!item) return false;
    const fields = [item.price, item.pricing, item.discount];
    return fields.some(hasNonEmptyValue);
  }

  function isTimeBoundHappyHourSpecial(item) {
    if (!item) return false;
    if (String(item._sourceType || '').toLowerCase() !== 'special') return false;

    const name = String(item.name || '');
    const description = String(item.description || '');
    const combinedText = `${name} ${description}`;
    if (!/\bhappy\s*hour\b/i.test(combinedText)) return false;

    const hasStartTime = hasNonEmptyValue(item.startTime);
    const hasEndTime = hasNonEmptyValue(item.endTime);
    const hasToCloseFlag = Boolean(item.timeFlags && item.timeFlags.end && item.timeFlags.end.toClose === true);
    const hasExplicitStartEvidence = Boolean(
      item.timeFlags &&
      item.timeFlags.start &&
      item.timeFlags.start.source === 'explicit' &&
      hasNonEmptyValue(item.timeFlags.start.evidence)
    );

    // Catch plain-language time windows in case structured fields are missing.
    const hasTimeRangeInText =
      /\b\d{1,2}(:\d{2})?\s*(am|pm)\s*(to|-)\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(combinedText) ||
      /\bfrom\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i.test(combinedText) ||
      /\b\d{1,2}\s*-\s*\d{1,2}\b/.test(combinedText);

    return hasStartTime || hasEndTime || hasToCloseFlag || hasExplicitStartEvidence || hasTimeRangeInText;
  }
  
  const validationPrompt = `Validate these extracted items. Analyze each item and determine if it should be kept or removed.

CURRENT CONTEXT:
- Current year: ${currentYear}
- Posting timestamp: ${timestamp}

ITEMS TO VALIDATE:
${JSON.stringify(rawData, null, 2)}

IMPORTANT CONTEXT:
Items may have a "_sourceType" field indicating which extractor produced them:
- "_sourceType": "event" = came from event-only extractor
- "_sourceType": "special" = came from food special-only extractor
- "_sourceType": "calendar" = came from calendar extractor
- Items without _sourceType should be validated based on content

VALIDATION RULES:

REMOVE items that are:
✗ Business hours or operating schedules only
✗ General announcements without specific timing
✗ Holiday greetings WITHOUT events (e.g., "Happy Father's Day!")
✗ Menu items without discounts or deals
✗ Food specials without specific pricing or cost savings
✗ Items from event extractor that aren't real events (e.g., forced interpretation of food as "celebration")
✗ Items from special extractor that have no actual pricing/discount

EXCEPTION RULE (APPLY BEFORE REJECTING SPECIALS):
- For _sourceType="special", if the item is a Happy Hour and has a clear time window
  (start/end time, explicit range like "3-6", "from 3 PM to 6 PM", or "to close"),
  KEEP the item even when price/discount is missing.

KEEP items that are:
✓ Actual events with specific dates/times
✓ Events that happen to occur on holidays (e.g., "Father's Day Movie at 5pm")
✓ Food specials with specified cost savings and pricing
✓ Any activity with specific timing and details
✓ Recurring specials (date="recurring") ARE VALID - these are daily/weekly specials like happy hours that happen regularly
✓ Items with date="recurring" should be KEPT if they have valid pricing, timing, and description

IMPORTANT - MINIMUM REQUIRED FIELDS FOR REGULAR EVENTS (no _sourceType or _sourceType="event"):
Regular events only need these fields to be valid:
- name (required)
- date (required) - must be a specific YYYY-MM-DD date
- startTime (required) - can come from any source including _timeSourcedFromUtcStartDate

These fields are OPTIONAL and should NEVER cause rejection if missing:
- venue (optional - empty venue means the event is AT the posting venue/page)
- endTime (optional - many events don't list end times)
- price (optional - free events won't have pricing)
- description (optional - though usually present for regular events)

DO NOT reject events just because venue is empty. An empty venue means the event takes place at the posting page's own venue.
DO NOT reject events just because endTime or price are missing.
A regular event with a name, date, and startTime is VALID even if all other fields are empty.

IMPORTANT - MINIMUM REQUIRED FIELDS FOR CALENDAR EVENTS:
Calendar events (_sourceType="calendar") only need these fields to be valid:
- name (required)
- date (required)
- startTime (required)
- venue (required)

These fields are OPTIONAL and should NOT cause rejection if missing:
- endTime (optional - many events don't list end times)
- price (optional - free events won't have pricing)
- description (optional - brief listings often omit descriptions)

DO NOT reject calendar events just because endTime, price, or description are empty/missing.

DUPLICATE DETECTION RULES:
- Same venue + SAME time = likely duplicate (reject one)
- Same venue + DIFFERENT times = separate events (keep both)
- Multiple sessions/workshops at same venue are common and valid
- Multiple movie showings at same cinema are normal
- Don't reject events just because they're at the same location
- Only reject TRUE duplicates where the name, venue, AND time are identical

SPECIAL VALIDATION FOR MIXED CONTENT:
When _sourceType indicates the item came from a specific extractor:
- Be extra critical of "events" that seem to be about food
- Be extra critical of "specials" without clear pricing
- Exception: time-bounded Happy Hour specials can still be valid without explicit pricing
- The extractors may have forced interpretations that don't make sense

HOLIDAY-SPECIFIC RECURRING PATTERN CORRECTION:
Many venues modify their regular recurring specials for holidays. Check for these patterns:
- If an item is marked as "recurring" or "daily" BUT:
  * The date matches a known holiday (Father's Day, Mother's Day, Christmas, etc.) AND
  * The description contains explicit holiday keywords (Father's Day, Mother's Day, Christmas, Valentine's, Easter, Halloween, Thanksgiving, New Year, St. Patrick's, etc.) OR
  * The description contains holiday-specific phrases ("treat dad", "mom deserves", "valentine special", "christmas menu", "holiday menu", "festive menu")
  * DO NOT trigger on generic promotional language like "new menu", "try our menu", "special offer", "come visit"
- THEN: Change recurringPattern to "none" because this is a one-day holiday variation
- Note this correction in your reasoning

IMPORTANT: Generic promotional language ("Come try our new greek menu", "Check out our specials") is NOT holiday-specific. Only trigger this correction when you see actual holiday names or explicit holiday context.

Common holidays to check:
- Father's Day (third Sunday in June)
- Mother's Day (second Sunday in May)
- Valentine's Day (February 14)
- St. Patrick's Day (March 17)
- Christmas Day (December 25)
- New Year's Eve/Day (December 31/January 1)

For each item:
1. Consider the _sourceType to understand extraction context
2. Determine if it truly passes validation
3. Check if recurring pattern needs holiday correction
4. Provide clear reasoning for the decision
5. Categorize as either "kept" or "rejected"

CRITICAL JSON FORMATTING REQUIREMENTS:
- Return ONLY valid JSON object
- NO markdown code blocks, NO '''json''' wrappers
- NO explanatory text before or after JSON
- Use this exact structure:
{
  "validatedItems": [
    {
      "item": {...original item with any corrections...},
      "decision": "KEPT" or "REJECTED",
      "reason": "Clear explanation of why this item was kept or rejected",
      "corrections": {
        "recurringPattern": "If corrected from recurring to none, show the new value here",
        "correctionReason": "Explanation of why the correction was made"
      }
    }
  ],
  "validationSummary": {
    "totalItems": number,
    "itemsKept": number,
    "itemsRejected": number,
    "recurringCorrections": number,
    "overallNotes": "Summary of validation decisions"
  }
}

Return pure JSON with validation results.`;

  try {
    const response = callGPT(validationPrompt, [], openaiApiKey);
    
    // Log raw GPT response
    console.log('performSecondaryValidation: Raw GPT response:', response);
    
    const validationResult = parseSecondaryValidationResponse(response);
    
    // Log validation summary
    if (validationResult.validationSummary) {
      console.log('performSecondaryValidation: Validation summary:');
      console.log(`  - Total items: ${validationResult.validationSummary.totalItems}`);
      console.log(`  - Items kept: ${validationResult.validationSummary.itemsKept}`);
      console.log(`  - Items rejected: ${validationResult.validationSummary.itemsRejected}`);
      console.log(`  - Recurring corrections: ${validationResult.validationSummary.recurringCorrections || 0}`);
      console.log(`  - Overall notes: ${validationResult.validationSummary.overallNotes}`);
    }
    
    // Log individual item decisions
    const keptItems = [];
    const rejectedItems = [];
    let recurringCorrectionsCount = 0;
    let happyHourNoPriceOverrideCount = 0;
    
    if (validationResult.validatedItems) {
      validationResult.validatedItems.forEach((validatedItem, index) => {
        let decision = validatedItem.decision;
        const item = validatedItem.item;
        const reason = validatedItem.reason;

        // Preserve pipeline metadata - use the captured Stage 3 count for all items
        // GPT may reorder or drop items, so we can't rely on index matching
        item._pipelineTotalStage3 = originalStage3Count;
        // Try to preserve _pipelineIndex if GPT returned it, otherwise try to get from rawData
        if (!item._pipelineIndex && rawData[index] && rawData[index]._pipelineIndex) {
          item._pipelineIndex = rawData[index]._pipelineIndex;
        }

        // Contradiction detection: GPT sometimes sets decision="REJECTED" but the reasoning
        // clearly states the item should be kept. Trust the reasoning over the enum value.
        if (decision === 'REJECTED' && reason) {
          const reasonLower = String(reason).toLowerCase();
          const keptIndicators = [
            'should be kept', 'correct decision is kept', 'this should be kept',
            'keep as', 'kept as', 'therefore, kept', 'therefore kept',
            'decision is kept', 'should be kept as', 'valid event',
            'valid as a regular event', 'keeping this item', 'recommend keeping'
          ];
          const hasKeptIntent = keptIndicators.some(phrase => reasonLower.includes(phrase));

          if (hasKeptIntent) {
            console.log(`performSecondaryValidation: CONTRADICTION DETECTED for "${item.name || 'Unnamed'}"`);
            console.log(`  Decision field says REJECTED but reasoning says to keep. Overriding to KEPT.`);
            decision = 'KEPT';
          }
        }

        // Targeted exception:
        // Keep Happy Hour specials when a concrete time window exists, even if pricing is omitted.
        if (decision === 'REJECTED' && isTimeBoundHappyHourSpecial(item) && !hasPricingOrDiscount(item)) {
          console.log(`performSecondaryValidation: TARGETED HAPPY HOUR OVERRIDE for "${item.name || 'Unnamed'}"`);
          console.log(`  Rejected special is time-bounded Happy Hour without pricing. Overriding to KEPT.`);
          decision = 'KEPT';
          happyHourNoPriceOverrideCount++;
        }

        console.log(`performSecondaryValidation: Item ${index + 1} - "${item.name || 'Unnamed'}"`);
        console.log(`  Decision: ${decision}`);
        console.log(`  Reason: ${reason}`);

        // Check for recurring pattern corrections
        if (validatedItem.corrections && validatedItem.corrections.recurringPattern) {
          const VALID_RECURRING_PATTERNS_S4 = ['none', 'daily', 'weekly_monday', 'weekly_tuesday', 'weekly_wednesday', 'weekly_thursday', 'weekly_friday', 'weekly_saturday', 'weekly_sunday'];
          const correctedPattern = (validatedItem.corrections.recurringPattern || '').toString().trim().replace(/[,;]+$/, '').toLowerCase();
          if (VALID_RECURRING_PATTERNS_S4.includes(correctedPattern)) {
            console.log(`  RECURRING PATTERN CORRECTED: ${item.recurringPattern} → ${correctedPattern}`);
            console.log(`  Correction reason: ${validatedItem.corrections.correctionReason}`);
            item.recurringPattern = correctedPattern;
            recurringCorrectionsCount++;
          } else {
            console.log(`  ⚠️ REJECTED garbled recurringPattern correction: "${(validatedItem.corrections.recurringPattern || '').substring(0, 80)}..." → keeping "${item.recurringPattern}"`);
          }
        }

        if (decision === 'KEPT') {
          keptItems.push(item);
        } else {
          rejectedItems.push({ item, reason });
        }
      });
    }
    
    // Log final counts
    console.log(`performSecondaryValidation: Final result - ${keptItems.length} items kept, ${rejectedItems.length} items rejected`);
    console.log(`performSecondaryValidation: Happy Hour no-price overrides applied: ${happyHourNoPriceOverrideCount}`);
    if (recurringCorrectionsCount > 0) {
      console.log(`performSecondaryValidation: Corrected recurring patterns for ${recurringCorrectionsCount} items`);
    }

    // Log pipeline index tracking
    const keptIndices = keptItems.map(item => item._pipelineIndex).filter(Boolean).join(', ');
    const rejectedIndices = rejectedItems.map(r => r.item._pipelineIndex).filter(Boolean).join(', ');
    console.log(`performSecondaryValidation: Pipeline indices KEPT: [${keptIndices || 'none'}]`);
    console.log(`performSecondaryValidation: Pipeline indices REJECTED: [${rejectedIndices || 'none'}]`);

    // Attach targeted override count so parsePostData can include it in Stage 4 summary logs.
    keptItems._happyHourNoPriceOverrideCount = happyHourNoPriceOverrideCount;

    return keptItems;
  } catch (error) {
    console.error('performSecondaryValidation: Error during validation:', error);
    console.error('performSecondaryValidation: Returning original data due to validation error');
    return rawData; // Return original if validation fails
  }
}

// Helper function to parse secondary validation response
function parseSecondaryValidationResponse(response) {
  console.log('parseSecondaryValidationResponse: Parsing validation response');

  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];

      // First try to parse the original JSON without repair
      try {
        const parsed = JSON.parse(jsonStr);
        console.log('parseSecondaryValidationResponse: Successfully parsed validation result (no repair needed)');
        return parsed;
      } catch (originalError) {
        // Original parse failed, try to repair
        console.log('parseSecondaryValidationResponse: Original parse failed, attempting repair');
        const repairedStr = repairMalformedJson(jsonStr);

        if (repairedStr !== jsonStr) {
          // Repair made changes, try parsing the repaired version
          try {
            const parsed = JSON.parse(repairedStr);
            console.log('parseSecondaryValidationResponse: Successfully parsed after repair');
            return parsed;
          } catch (repairError) {
            // Repair didn't help
            console.error('parseSecondaryValidationResponse: Repair did not fix the JSON');
            console.error('parseSecondaryValidationResponse: Original error:', originalError);
            console.error('parseSecondaryValidationResponse: Repair error:', repairError);
            console.error('parseSecondaryValidationResponse: Original JSON:', jsonStr);
            console.error('parseSecondaryValidationResponse: Repaired JSON:', repairedStr);
          }
        } else {
          // No repairs were made, log the original error
          console.error('parseSecondaryValidationResponse: No repairs applicable');
          console.error('parseSecondaryValidationResponse: Parse error:', originalError);
          console.error('parseSecondaryValidationResponse: JSON:', jsonStr);
        }
      }
    } else {
      // No JSON match found, try parsing the whole response
      const parsed = JSON.parse(response);
      return parsed;
    }

  } catch (error) {
    console.error('parseSecondaryValidationResponse: Error parsing validation response:', error);
    console.error('parseSecondaryValidationResponse: Raw response that failed to parse:', response);

    // Return safe default
    return {
      validatedItems: [],
      validationSummary: {
        totalItems: 0,
        itemsKept: 0,
        itemsRejected: 0,
        recurringCorrections: 0,
        overallNotes: 'Failed to parse validation response'
      }
    };
  }
}

/**
 * Attempts to repair common JSON syntax errors produced by GPT models.
 * @param {string} jsonStr - The potentially malformed JSON string.
 * @return {string} The repaired JSON string.
 */
function repairMalformedJson(jsonStr) {
  let repaired = jsonStr;
  let previousRepaired;
  let iterations = 0;
  const maxIterations = 15; // Safety limit
  const changesApplied = [];

  // Keep applying repairs until no more changes are made
  do {
    previousRepaired = repaired;
    iterations++;
    const iterationChanges = [];

    // Pattern 1: Extra } before , in arrays: "} }," -> "},"
    // Handles: corrections object closes, then extra brace, then comma
    let before = repaired;
    repaired = repaired.replace(/\}(\s*)\}(\s*),/g, '}$1,');
    if (repaired !== before) iterationChanges.push('P1:}} -> }');

    // Pattern 2: Extra } before ] (end of array): "} }]" -> "}]"
    // Handles: last item in array has extra closing brace
    before = repaired;
    repaired = repaired.replace(/\}(\s*)\}(\s*)\]/g, '}$1]');
    if (repaired !== before) iterationChanges.push('P2:}}] -> }]');

    // Pattern 3: Extra } before ], (array followed by more content): "} }]," -> "}],"
    // This is slightly different - the ] has a comma after it
    before = repaired;
    repaired = repaired.replace(/\}(\s*)\}(\s*)\](\s*),/g, '}$1]$3,');
    if (repaired !== before) iterationChanges.push('P3:}}], -> }],');

    // Pattern 4: Triple braces (deeply nested): "} } }," -> "},"
    before = repaired;
    repaired = repaired.replace(/\}(\s*)\}(\s*)\}(\s*),/g, '}$1,');
    if (repaired !== before) iterationChanges.push('P4:}}} -> }');

    // Pattern 5: Fix trailing commas before closing brackets: ",]" -> "]"
    before = repaired;
    repaired = repaired.replace(/,(\s*)\]/g, '$1]');
    if (repaired !== before) iterationChanges.push('P5:,] -> ]');

    // Pattern 6: Fix trailing commas before closing braces: ",}" -> "}"
    before = repaired;
    repaired = repaired.replace(/,(\s*)\}/g, '$1}');
    if (repaired !== before) iterationChanges.push('P6:,} -> }');

    // Pattern 7: Escape unescaped double quotes within strings to keep JSON valid
    before = repaired;
    repaired = escapeUnescapedQuotesInStrings(repaired);
    if (repaired !== before) iterationChanges.push('P7:escapeQuotes');

    if (iterationChanges.length > 0) {
      changesApplied.push(`iter${iterations}:[${iterationChanges.join(',')}]`);
    }

  } while (repaired !== previousRepaired && iterations < maxIterations);

  if (repaired !== jsonStr) {
    console.log(`repairMalformedJson: Applied repairs in ${iterations} iteration(s): ${changesApplied.join(' ')}`);
  }

  return repaired;
}

function escapeUnescapedQuotesInStrings(jsonStr) {
  let result = '';
  let inString = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (char === '"') {
      const escaped = isQuoteEscaped(jsonStr, i);
      if (!escaped) {
        if (!inString) {
          inString = true;
          result += char;
          continue;
        }

        const nextNonWhitespace = findNextNonWhitespaceChar(jsonStr, i + 1);
        if (!nextNonWhitespace || [',', '}', ']', ':'].includes(nextNonWhitespace)) {
          inString = false;
          result += char;
          continue;
        }

        result += '\\\"';
        continue;
      }
    }

    result += char;
  }

  return result;
}

function findNextNonWhitespaceChar(str, startIndex) {
  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return null;
}

function isQuoteEscaped(str, index) {
  let backslashCount = 0;
  for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

// ==========================
// STAGE 5: FINAL FORMATTING
// ==========================

function performFinalFormatting(validatedData, userName, partialAddress, timestamp, openaiApiKey) {
  console.log('performFinalFormatting: Starting final formatting');
  
/* === [ANCHOR:STAGE5-BATCH-HEADER] === */
const __expectedCount = Array.isArray(validatedData) ? validatedData.length : 0;
const __inputItemsJson = JSON.stringify(validatedData);

// A tiny, explicit header that forces one formatted item per input, in order.
const __batchHeader =
  `BATCH COUNT ENFORCEMENT: You are formatting exactly ${__expectedCount} validated items.\n` +
  `Return exactly ${__expectedCount} objects in formattedEvents (one-to-one with the input order).\n` +
  `Do not drop, merge, or reorder items. Never return arrays of values for an item; each must be a JSON object.`;

const __formattingPromptBatch = __batchHeader + "\n\n" +
  createFormattingPrompt(validatedData, userName, partialAddress, timestamp);

try {
  var response = callGPTWithSchema(__formattingPromptBatch, [], openaiApiKey, 'formatEvents', createFormattingSchema());
  if (typeof response === 'string') {
    try { response = JSON.parse(response); }
    catch (e) { response = { formattedEvents: [], formattingDecisions: [] }; }
  }


    // Validate response structure and filter out malformed entries
    console.log('performFinalFormatting: Validating response structure...');

// === Count enforcement & soft-coercion ===
// Expect exactly one formattedEvents item per input item.
try {
  const __expectedCount = Array.isArray(validatedData) ? validatedData.length : 0;

  // Start from model output (may be missing or short)
  let __fe = (response && Array.isArray(response.formattedEvents)) ? response.formattedEvents : [];
  if (!Array.isArray(__fe)) __fe = [];

  // Deduplicate GPT response before truncating (GPT sometimes hallucinates duplicates)
  if (__fe.length > __expectedCount) {
    console.log('performFinalFormatting: GPT returned ' + __fe.length + ' items but expected ' + __expectedCount + '. Deduplicating before truncation.');

    const seen = new Map();
    const deduplicated = [];

    for (const item of __fe) {
      if (!item || !item.name) {
        deduplicated.push(item);
        continue;
      }

      // Create dedup key: normalized name + date + start time
      const normName = String(item.name || '').toLowerCase().trim();
      const date = String(item.startDate || '').trim();
      const time = String(item.startTime || '').trim();
      const key = `${normName}|${date}|${time}`;

      if (!seen.has(key)) {
        seen.set(key, true);
        deduplicated.push(item);
      } else {
        console.log(`performFinalFormatting: Removing GPT duplicate: "${item.name}" (${date} ${time})`);
      }
    }

    console.log(`performFinalFormatting: After deduplication: ${deduplicated.length} unique items (removed ${__fe.length - deduplicated.length} duplicates)`);
    __fe = deduplicated;
  }

  // Truncate extras if the model returned more than expected
  if (__fe.length > __expectedCount) {
    console.log('performFinalFormatting: truncating extras formatted=' + __fe.length + ' expected=' + __expectedCount);
    __fe = __fe.slice(0, __expectedCount);
  }

  // Soft-coerce: add any missing keys with safe defaults so schema checks pass
  for (let i = 0; i < __fe.length; i++) {
    const e = __fe[i] || {};
    if (!('isEvent' in e)) e.isEvent = "Yes";
    if (!('isFoodSpecial' in e)) e.isFoodSpecial = "No";
    if (!('category' in e)) e.category = "Gatherings & Parties";
    if (!('name' in e)) e.name = "";
    if (!('description' in e)) e.description = "";
    if (!('establishment' in e)) e.establishment = e.venue || "";
    if (!('address' in e)) e.address = "";
    if (!('startDate' in e)) e.startDate = "";
    if (!('endDate' in e)) e.endDate = e.startDate || "";
    if (!('startTime' in e)) e.startTime = "";
    if (!('endTime' in e)) e.endTime = "";
    if (!('ticketPrice' in e)) e.ticketPrice = "";
    if (!('ticketLink' in e)) e.ticketLink = "";
    if (!('relevantImageIndex' in e)) e.relevantImageIndex = 0;
    if (!('venue' in e)) e.venue = e.establishment || "";
    if (!('additionalLocation' in e)) e.additionalLocation = e.venue || "";
    if (!('isRecurring' in e)) e.isRecurring = false;
    if (!('recurringPattern' in e)) e.recurringPattern = "none";

    // Guard against garbled recurringPattern values from GPT
    const VALID_RECURRING_PATTERNS = ['none', 'daily', 'weekly_monday', 'weekly_tuesday', 'weekly_wednesday', 'weekly_thursday', 'weekly_friday', 'weekly_saturday', 'weekly_sunday'];
    const rawPattern = (e.recurringPattern || '').toString().trim().replace(/[,;]+$/, '').toLowerCase();
    if (!VALID_RECURRING_PATTERNS.includes(rawPattern)) {
      console.log(`  ⚠️ SANITIZED recurringPattern: garbled value "${(e.recurringPattern || '').substring(0, 80)}..." → "none"`);
      e.recurringPattern = 'none';
    } else {
      e.recurringPattern = rawPattern;
    }

    __fe[i] = e;
  }

  // Top-off: if the model returned fewer than expected, append placeholders mapped from the inputs
  if (__fe.length < __expectedCount) {
    const __missing = __expectedCount - __fe.length;
    console.log('performFinalFormatting: top-off placeholders for missing=' + __missing);
    for (let i = __fe.length; i < __expectedCount; i++) {
      const src = validatedData[i] || {};
      __fe.push({
        isEvent: "Yes",
        isFoodSpecial: "No",
        category: "Gatherings & Parties",
        name: src.name || "",
        description: src.description || "",
        establishment: (src.venue || ""),
        address: "",
        startDate: src.date || "",
        endDate: (src.endTime ? src.date : (src.date || "")),
        startTime: src.startTime || "",
        endTime: src.endTime || "",
        ticketPrice: "",
        ticketLink: "",
        relevantImageIndex: 0,
        venue: (src.venue || ""),
        additionalLocation: (src.venue || ""),
        isRecurring: false,
        recurringPattern: "none"
      });
    }
  }

  // Write back into response so downstream code uses the enforced list
  response.formattedEvents = __fe;
} catch (enfErr) {
  console.log('performFinalFormatting: count-enforcement skipped', enfErr);
}
    
    if (!response.formattedEvents || !Array.isArray(response.formattedEvents)) {
      console.error('performFinalFormatting: Response missing formattedEvents array!');
      return [];
    }
    
    // Filter out malformed entries (arrays returned as objects)
    const validFormattedEvents = [];
    const malformedIndices = [];
    
    response.formattedEvents.forEach((event, idx) => {
      // Check if this is actually an object with proper keys (not an array with numeric keys)
      const keys = Object.keys(event || {});
      const hasNumericKeys = keys.some(k => /^\d+$/.test(k));
      const hasProperKeys = keys.includes('name') && keys.includes('category');
      
      if (hasNumericKeys || !hasProperKeys) {
        console.error(`performFinalFormatting: Item ${idx} is malformed (array-as-object or missing required keys). Keys: ${keys.join(', ')}`);
        malformedIndices.push(idx);
      } else {
        validFormattedEvents.push(event);
      }
    });
    
    if (malformedIndices.length > 0) {
      console.error(`performFinalFormatting: Found ${malformedIndices.length} malformed entries at indices: ${malformedIndices.join(', ')}`);
      console.error(`performFinalFormatting: Expected ${validatedData.length} items, got ${validFormattedEvents.length} valid items`);
      
      // If we lost more than half the data, this is a critical failure
      if (validFormattedEvents.length < validatedData.length / 2) {
        console.error('performFinalFormatting: Too many items lost to malformed response. Aborting.');
        return [];
      }
    }
    
    // Update response to only include valid events
    response.formattedEvents = validFormattedEvents;
    
    console.log(`performFinalFormatting: Validated ${validFormattedEvents.length} properly formatted items`);

// Inspect keys on the first formatted event (one-time schema sanity check)
try {
  const keys0 = Object.keys((response && response.formattedEvents && response.formattedEvents[0]) || {});
  console.log('performFinalFormatting: keys present on formattedEvents[0]: ' + JSON.stringify(keys0));
} catch (e) {
  console.log('performFinalFormatting: keys inspect failed: ' + e);
}
    
    // Log formatting decisions

    if (response.formattingDecisions && response.formattingDecisions.length > 0) {
      console.log('performFinalFormatting: Formatting decisions:');
      response.formattingDecisions.forEach((decision, index) => {
        console.log(`  Item ${index + 1} - "${decision.itemName}"`);
        console.log(`    Type decision: ${decision.typeDecision}`);
        console.log(`    Category decision: ${decision.categoryDecision}`);
        if (decision.assumptions) {
          console.log(`    Assumptions: ${decision.assumptions}`);
        }
      });
    }
    
    // Handle the recurring pattern properly in formatted events
    const formattedEvents = response.formattedEvents || [];
const processedEvents = formattedEvents.map((event, index) => {
  // CRITICAL FIX: Always restore venue information from validatedData
  // GPT in Stage 5 ignores the venue field and uses userName instead, so we must force-restore it
  const originalItem = validatedData[index];
  if (originalItem && originalItem.venue && originalItem.venue.trim() !== '') {
    // Only restore if the original had a venue AND it's different from the current one
    const originalVenue = originalItem.venue.trim();
    const currentVenue = (event.venue || '').trim();

    if (currentVenue !== originalVenue) {
      console.log(`  🔧 RESTORING VENUE: GPT changed venue from "${originalVenue}" to "${currentVenue}", restoring correct value`);
      event.venue = originalVenue;
      event.additionalLocation = originalVenue; // Also set additionalLocation for venue override logic
    }
  }

  // Log what we're actually formatting
console.log(`performFinalFormatting: Processing event ${index + 1}:`);

// [TIME-FIX: Special/Happy Hour date fallback + hours hint]
// If this item is a Food Special, Drink Special, or Happy Hour with no startDate,
// set startDate from the post timestamp (same day) and prefer venue closing time for endTime.
// This enables Stage 5.5 to use venue hours instead of "no_date".
(function ensureDateForSpecialsOrHappyHour(evt) {
  try {
    const isFS = String(evt.isFoodSpecial || '').toLowerCase() === 'yes';
    const cat  = String(evt.category || '').trim();
    const qualifies = isFS || cat === 'Drink Special' || cat === 'Happy Hour';

    const noStartDate = !(evt.startDate && String(evt.startDate).trim() !== '');
    if (qualifies && noStartDate && timestamp) {
      const tz = (typeof Session !== 'undefined' && Session.getScriptTimeZone)
        ? Session.getScriptTimeZone()
        : 'America/Halifax';
      const postDay = Utilities.formatDate(new Date(timestamp), tz, 'yyyy-MM-dd');
      evt.startDate = postDay;

      // Ask hours resolver to use opening time for start, and closing time for end.
      evt.timeFlags = evt.timeFlags || {};
      evt.timeFlags.start = evt.timeFlags.start || {};
      evt.timeFlags.start.source = 'semantic';
      evt.timeFlags.start.evidence = ((evt.timeFlags.start.evidence || '') + (evt.timeFlags.start.evidence ? '; ' : '') + 'start date from post timestamp').trim();

      evt.timeFlags.end = evt.timeFlags.end || {};
      if (evt.timeFlags.end.toClose !== true) {
        evt.timeFlags.end.toClose = true;
        evt.timeFlags.end.evidence = ((evt.timeFlags.end.evidence || '') + (evt.timeFlags.end.evidence ? '; ' : '') + 'end missing → default to close').trim();
      }

      const tag = isFS ? 'Food Special' : (cat === 'Drink Special' ? 'Drink Special' : 'Happy Hour');
      console.log(`  ⏱️ ${tag} had no date → using post date ${postDay}; enabling hours-based start/end`);
    }
  } catch (e) {
    console.log('  (Special/Happy Hour date fallback skipped)', e);
  }
})(event);


  console.log(`  Name: "${event.name}"`);
  console.log(`  Category from response: "${event.category}"`);
  console.log(`  isEvent: "${event.isEvent}", isFoodSpecial: "${event.isFoodSpecial}"`);
  // Extra visibility: what fields did GPT actually return?
  try {
    console.log('  Keys: ' + Object.keys(event).join(', '));
  } catch (e) {
    console.log('  Keys: <error obtaining keys> ' + e);
  }
  console.log(`  Raw venue fields → venue="${event.venue || ''}", additionalLocation="${event.additionalLocation || ''}"`);

      
      // Find the corresponding decision
      const decision = response.formattingDecisions?.find(d => 
        d.itemName === event.name || 
        // Fallback match on partial name
        event.name.includes(d.itemName) || 
        d.itemName.includes(event.name)
      );
      
      if (decision) {
        console.log(`  Found matching decision - Category should be: "${decision.categoryDecision}"`);
        
        // Only override if the decision has a valid value
        if (decision.categoryDecision && decision.categoryDecision !== 'undefined' && event.category !== decision.categoryDecision) {
          console.log(`  WARNING: Category mismatch!`);
          console.log(`    Decision said: "${decision.categoryDecision}"`);
          console.log(`    But event has: "${event.category}"`);
          
          event.category = decision.categoryDecision;
          console.log(`  CORRECTED category to: "${event.category}"`);
        } else if (!decision.categoryDecision || decision.categoryDecision === 'undefined') {
          console.log(`  INFO: Decision category is undefined/invalid, keeping GPT's category: "${event.category}"`);
        }
      } else {
        console.log(`  WARNING: No matching decision found for this event!`);
      }

      // POST-PROCESSING CATEGORY CORRECTIONS
      // These run in a specific order to avoid conflicts between correction rules.
      // Art Party check runs FIRST because it's more specific than Comedy (which has broad indicators like "hilarious")

      // 1. Art Party events → Gatherings & Parties (MUST RUN FIRST)
      // GPT often miscategorizes art party/paint night events as "Family Friendly" or "Live Music"
      // when they should be "Gatherings & Parties" (adult social painting events at bars/breweries)
      if (event.category === 'Family Friendly' || event.category === 'Live Music') {
        const textToCheck = `${event.name || ''} ${event.description || ''}`.toLowerCase();
        const artPartyIndicators = [
          'art party', 'paint party', 'paint night', 'paint your partner',
          'paint and sip', 'sip and paint', 'canvas and cocktails',
          'wine and canvas', 'paint nite', 'painting party'
        ];
        const hasArtPartyIndicator = artPartyIndicators.some(indicator => textToCheck.includes(indicator));

        if (hasArtPartyIndicator) {
          console.log(`  🎨 CATEGORY CORRECTION: "${event.name}" has art party/paint night indicators in text`);
          console.log(`    Changing from "${event.category}" to "Gatherings & Parties"`);
          event.category = 'Gatherings & Parties';
        }
      }

      // 2. Comedy vs Live Music
      // GPT often miscategorizes comedy shows as "Live Music" because they contain "LIVE" in the title.
      // This code-level check is more reliable than prompt-based exclusion rules.
      // IMPORTANT: Skip if this is an art party (already handled above, and "hilarious" in descriptions shouldn't trigger Comedy)
      if (event.category === 'Live Music') {
        const textToCheck = `${event.name || ''} ${event.description || ''} ${originalItem?.extractionReason || ''}`.toLowerCase();

        // Check for art party indicators first - if present, skip the comedy check
        const artPartyExclusions = ['art party', 'paint party', 'paint night', 'paint your partner', 'sip and paint', 'paint and sip'];
        const isArtParty = artPartyExclusions.some(indicator => textToCheck.includes(indicator));

        if (!isArtParty) {
          const comedyIndicators = [
            'comedy', 'comedian', 'comic', 'stand-up', 'standup', 'improv',
            'comedy award', 'just for laughs', 'the debaters', 'last comic standing',
            'yuk yuk', 'yukyuk', 'comedy club', 'comedy night', 'laugh factory',
            'funny', 'jokes', 'hilarious'
          ];
          const hasComedyIndicator = comedyIndicators.some(indicator => textToCheck.includes(indicator));

          if (hasComedyIndicator) {
            console.log(`  🎭 CATEGORY CORRECTION: "${event.name}" has comedy indicators in text`);
            console.log(`    Changing from "Live Music" to "Comedy"`);
            event.category = 'Comedy';
          }
        }
      }

      // 3. Book Clubs → Gatherings & Parties
      // GPT often miscategorizes book clubs as "Family Friendly" when they should be "Gatherings & Parties"
      if (event.category === 'Family Friendly') {
        const textToCheck = `${event.name || ''} ${event.description || ''}`.toLowerCase();
        const gatheringsIndicators = [
          'book club', 'bookclub', 'discussion group', 'discussion club',
          'meetup', 'meet-up', 'meet up', 'networking', 'mixer',
          'social club', 'club meeting', 'club gathering'
        ];
        const hasGatheringsIndicator = gatheringsIndicators.some(indicator => textToCheck.includes(indicator));

        if (hasGatheringsIndicator) {
          console.log(`  📚 CATEGORY CORRECTION: "${event.name}" has gatherings/club indicators in text`);
          console.log(`    Changing from "Family Friendly" to "Gatherings & Parties"`);
          event.category = 'Gatherings & Parties';
        }
      }

            // If the model set establishment to the page name, prefer the detected venue (additionalLocation) (logging-only)
      if (
        event.establishment &&
        userName &&
        event.establishment.trim().toLowerCase() === userName.trim().toLowerCase() &&
        event.additionalLocation &&
        event.additionalLocation.trim() !== ''
      ) {
        console.log(`  (Stage5) establishment matched pageName "${userName}". Overriding with additionalLocation="${event.additionalLocation}"`);
        event.establishment = event.additionalLocation;
      }

      // Ensure venue is also set as establishment if not already set (logging-only)
      if (!event.establishment || event.establishment.trim() === '') {
        const beforeEst = event.establishment || '';
        const sourceVenue = event.venue || '';
        console.log(`  (Stage5) establishment was blank. About to set from event.venue="${sourceVenue}"`);
        event.establishment = sourceVenue;
      }



      // Validate and correct isEvent/isFoodSpecial based on category
      const foodCategories = ["Happy Hour", "Wing Night", "Food Special", "Drink Special"];
      const eventCategories = ["Live Music", "Trivia Night", "Comedy", "Cinema", "Workshops & Classes", "Religious", "Sports", "Family Friendly", "Gatherings & Parties"];
      
      if (event.category && foodCategories.includes(event.category)) {
        // This is a food special
        if (event.isEvent !== "No" || event.isFoodSpecial !== "Yes") {
          console.log(`  CORRECTING: "${event.name}" is category "${event.category}" → isEvent="No", isFoodSpecial="Yes"`);
          event.isEvent = "No";
          event.isFoodSpecial = "Yes";
        }
      } else if (event.category && eventCategories.includes(event.category)) {
        // This is an event
        if (event.isEvent !== "Yes" || event.isFoodSpecial !== "No") {
          console.log(`  CORRECTING: "${event.name}" is category "${event.category}" → isEvent="Yes", isFoodSpecial="No"`);
          event.isEvent = "Yes";
          event.isFoodSpecial = "No";
        }
      } else if (!event.category || event.category === 'undefined') {
        console.error(`  ERROR: "${event.name}" has invalid category: "${event.category}" - cannot validate isEvent/isFoodSpecial`);
      }
      
      // Ensure isRecurring is a string "Yes" or "No" for compatibility
      const processedEvent = {
        ...event,
        isRecurring: event.isRecurring === true || (event.recurringPattern && event.recurringPattern !== "none") ? "Yes" : "No"
      };

      console.log(`  🏷️ Set event.establishment to venue: "${event.establishment}"`);

      console.log(`performFinalFormatting: Formatted "${event.name}" as ${event.isEvent === "Yes" ? "EVENT" : "SPECIAL"} - Category: ${event.category}`);
      if (processedEvent.isRecurring === "Yes") {
        console.log(`  Recurring pattern: ${event.recurringPattern}`);
      }
      
      return processedEvent;
    });
    
    console.log(`performFinalFormatting: Successfully formatted ${processedEvents.length} items`);
    
    // Final validation pass
    console.log('performFinalFormatting: Running final validation checks...');
    let validationErrors = 0;
    processedEvents.forEach((evt, idx) => {
      if (!evt.category || evt.category === 'undefined') {
        console.error(`  ERROR: Event ${idx+1} "${evt.name}" has invalid category: "${evt.category}"`);
        validationErrors++;
      }
      if (evt.isEvent === "Yes" && evt.isFoodSpecial === "Yes") {
        console.error(`  ERROR: Event ${idx+1} "${evt.name}" has both isEvent and isFoodSpecial set to Yes!`);
        validationErrors++;
      }
      if (evt.isEvent !== "Yes" && evt.isEvent !== "No") {
        console.error(`  ERROR: Event ${idx+1} "${evt.name}" has invalid isEvent value: "${evt.isEvent}"`);
        validationErrors++;
      }
      if (evt.isFoodSpecial !== "Yes" && evt.isFoodSpecial !== "No") {
        console.error(`  ERROR: Event ${idx+1} "${evt.name}" has invalid isFoodSpecial value: "${evt.isFoodSpecial}"`);
        validationErrors++;
      }
    });
    
    if (validationErrors > 0) {
      console.error(`performFinalFormatting: Found ${validationErrors} validation errors in formatted events!`);
    } else {
      console.log('performFinalFormatting: All validation checks passed.');
    }
    
    return processedEvents;
    
  } catch (error) {
    console.error('performFinalFormatting: Error during formatting:', error);
    return [];
  }
}

function createFormattingPrompt(items, userName, partialAddress, timestamp) {
  return `Format these validated items into standardized event records.

CONTEXT:
- Posted by: ${userName}
- Default address: ${partialAddress}
- Posted at: ${timestamp}

CRITICAL VENUE PRESERVATION:
BEFORE formatting each item, check if it has a "venue" field with a value.
If venue exists and is not empty, you MUST set additionalLocation = venue value.

CRITICAL VENUE PRESERVATION & TIME PROVENANCE:
BEFORE formatting each item, check if it has a "venue" field with a value.
If venue exists and is not empty, you MUST set additionalLocation = venue value.
Do NOT leave additionalLocation blank if the original item had venue information.

TIME FLAGS (provenance) — REQUIRED FIELDS IN OUTPUT (do not invent content, only label what is present in the text):
- timeFlags.start.source: "explicit" | "implied" | "semantic"
- timeFlags.start.evidence: short phrase from the post that led to this (or "")
- timeFlags.end.source: "explicit" | "implied" | "semantic" | "none"
- timeFlags.end.toClose: boolean (true only if text clearly says "to close"/"till close"/"until close")
- timeFlags.end.evidence: short phrase (or "")
Do NOT convert "to close" or "all day" into clock times here. Just set the flags and keep times empty when applicable; Stage 5.5 will resolve using venue hours.

Do NOT leave additionalLocation blank if the original item had venue information.

ITEMS TO FORMAT:
${JSON.stringify(items, null, 2)}

CRITICAL CATEGORIZATION INSTRUCTION:
Before formatting each event, assess the full event name/description and choose the category that best matches the observable context. Use keywords as clues, not rigid ranking rules—the model should weigh every hint in the text (description, extractionReason, venue, time flags) before committing to a category.

Special guidance:
- Only select **Trivia Night** when the name or description explicitly mentions core trivia cues (e.g., "trivia", "quiz", "game show", "name that tune", "pub quiz", "kahoot-style"). Do not reclassify more general Q&A, info sessions, or book club titles as Trivia Night unless one of those keywords is actually present.
- If the venue text includes “Cinema” or the poster mentions “movie”, “film”, or “screening,” select **Cinema**.
- If you see music-specific keywords (band, music, concert, singer, festival, DJ, performance, session, matinee, trio/duo) or performer names, **Live Music** is the best fit unless a stronger keyword points elsewhere.
- Comedy should be reserved for shows/mentions of stand-up, improv, comedian, or laughter-driven promotions.
- Workshops & Classes are for educational, hands-on, or creation-focused activities (workshop, class, course, lesson, seminar, craft, art, learn, creation, print, paint, design).
- Religious sessions require faith-related wording (church, service, mass, prayer, bible, worship).
- Sports events include game/match/tournament/league/marathon/championship/finals or anything tied to athletic activity, training, or live viewing of competitions.
- "Gatherings & Parties" is the catch-all for social meet-ups that do not fit any other category; use it when the event reads like a general community, networking, or book club gathering without any of the stronger keywords above.
- Reserve **Family Friendly** for general all-ages community events or children-focused activities when no other category applies.
- For food/drink specials, select the appropriate special category (Happy Hour, Wing Night, Food Special, Drink Special) based on the offer, not the event categories.

FORMAT REQUIREMENTS:

2. Map venue field to additionalLocation:
   - If item has "venue" field and it's different from ${userName}, set additionalLocation = venue
   - If no venue field or venue is empty/null, set additionalLocation = ""
3. Convert dates to YYYY-MM-DD format
  - If no end date is available, LEAVE IT EMPTY. Do not invent an end date here.
4. Times — OUTPUT FORMAT (STRICT)
   - Always return 24-hour "HH:mm" (e.g., "21:00").
   - Never include seconds.
   - Never include "AM"/"PM".
   - If no end time is shown, set endTime="".
   - If the post clearly says "to close"/"till close"/"until close", set timeFlags.end.toClose=true and keep endTime="".
   - If the post clearly says "all day" or "open to close" for the start, set timeFlags.start.source="semantic" and keep startTime="".
   - Invariant for BOTH events and specials: if timeFlags.start.source="explicit", startTime MUST equal the normalized time parsed from timeFlags.start.evidence.
5. Set isEvent="Yes" for events, "No" for specials
6. Set isFoodSpecial="Yes" for specials, "No" for events
6.5 isEvent and isFoodSpecial can not both be "Yes". If both would be yes, create seperate entries for each. 
7. Choose appropriate category based on type - Appoint the most appropriate category to all Events , and / or Specials. 
8. Handle recurring items:
   - If recurringPattern exists, set isRecurring = true
   - Otherwise, set isRecurring = false
   - Map recurringPattern or set to "none" if not recurring
9. Include formatting reasoning for each item

CATEGORY MAPPING RULES:

IMPORTANT: Use the guidance above to pick the most fitting category, but do not assume any single category is the default; let the text, venue, and formattingDecisions justify the choice.

FOR EVENTS (when isFoodSpecial="No"):

**Event CATEGORIES:

*Trivia Night:
- Keywords: "trivia", "quiz", "game show", "name that tune", "pub quiz", "kahoot"
- Use Trivia Night **only** when the post explicitly calls out one of these cues. Q&A, info sessions, or educational meetings are unlikely to qualify unless they literally mention trivia.

* Live Music:
- Keywords: "band", "music", "singer", "concert", "performance", "sessions", "matinee", "duo", "trio", "music festival"
- Performer names (e.g., "Ben Aitken & Emma Clark", "Gordon Belsher")
- Venues known for music (pubs, lounges, cafes with performer names, festivals)
- EXCLUDE: Events at "Cinema" venues or with "movie"/"film"/"screening" keywords
- EXCLUDE: If description mentions "comedy", "comedian", "Comedy Award", "The Debaters", "Last Comic Standing", "Just For Laughs", or "Yuk Yuk's" → use Comedy instead

* Comedy:
- Keywords: "comedy", "stand-up", "improv", "comedian", "comic", "laugh", "funny", "jokes"
- Comedy shows/references: "Comedy Award", "Just For Laughs", "The Debaters", "Last Comic Standing", "Yuk Yuk's", "comedy club", "comedy night"
- Note: A comedian performing live is COMEDY, not Live Music. If description mentions comedy awards, comedy TV shows, or comedy venues, use Comedy.

* Workshops & Classes:
- Keywords: "workshop", "class", "courses", "educational", "lesson", "seminar", "create", "creation", "print", "paint", "craft", "art", "learn"
- Activities that involve education or learning, like: "3D Print & Paint", "Clay Creation Sessions"

* Religious:
- Keywords: "church", "service", "mass", "prayer", "faith", "bible"

* Sports:
- Keywords: "game", "match", "tournament", "league", "athletic", "marathon", "championships", "finals".
- Includes activities like training for events, watching sporting events live or on tv. 

* Gatherings & Parties:
- Keywords: "party", "mixer", "networking", "social" (but NOT trivia), "club gatherings", "book clubs", "discussion group", "meetup".
- This is a larger catch all for social events that do not fall into trivia nights, live music, workshops, or sporting categories. When the name or description explicitly mentions "book club", "book discussion", "club gathering", "discussion group", or similar meetup language (and no stronger keyword category already applies), choose Gatherings & Parties before defaulting to Family Friendly.

* Family Friendly (use ONLY when no other category fits):
- General all-ages events appropriate for families with children under age 18. 
- Children's activities
- Community events without specific category.
- Must be appropriate for children. 

DEFAULT FOR EVENTS: Use "Family Friendly" only when every other category lacks a clear match; never inflate Family Friendly to cover ambiguous cases that have stronger keywords.

** Specials CATEGORIES FOR FOOD/DRINK SPECIALS (when isFoodSpecial="Yes"):

* Happy Hour: Time-specific drink discounts (usually 3-7pm)
* Wing Night: Wing specials specifically
* Food Special: All non-wing food deals, discounts, and special menus
* Drink Special: Drink deals outside of happy hour times
DEFAULT FOR SPECIALS: When in doubt, use "Food Special"

CRITICAL: 
- "Name That Tune Trivia" MUST be categorized as "Trivia Night", NOT "Gatherings & Parties"
- For "trivia" in event name/description, ALWAYS use "Trivia Night" category, NEVER "Gatherings & Parties"
- Check specific keywords BEFORE defaulting to Family Friendly
- NEVER use event categories for food specials or vice versa!
- Multiple events at same venue (different times) should maintain appropriate individual categories
- ENSURE formattedEvents array uses the EXACT categories from formattingDecisions
- If category is deemed as a Food Special, or, Drink Special, or Food/Drink ensure isSpecial? = Yes

VENUE MAPPING RULES:
- Always check if the venue field exists in the item
- additionalLocation should be the venue name if it differs from ${userName}
- Leave additionalLocation empty if venue matches ${userName} or is not specified
RESPONSE STRUCTURE:
Return a JSON object with:
1. "formattedEvents": array of formatted event records
2. "formattingDecisions": array of objects explaining key formatting choices for each item

CRITICAL: formattingDecisions MUST have these fields properly filled for EVERY item:
- itemName: The exact name from the input item (REQUIRED)
- typeDecision: MUST be either "Event" or "Food Special" (NEVER "undefined" or empty)
- categoryDecision: MUST be one of the valid categories from CATEGORY MAPPING RULES (NEVER "undefined" or empty)
- assumptions: Any assumptions made during formatting
- venueDecision: Explanation of venue determination
- establishmentDecision: Explanation of establishment determination
- additionalLocationDecision: Explanation of additionalLocation determination

Example formattingDecisions entry:
{
  "itemName": "Fresh soft shell clams",
  "typeDecision": "Food Special",
  "categoryDecision": "Food Special",
  "assumptions": "Price indicates a food item for sale",
  "venueDecision": "No separate venue indicated",
  "establishmentDecision": "Set to Water Prince Corner Shop",
  "additionalLocationDecision": "Empty - no additional location"
}
RESPONSE STRUCTURE:
Return a JSON object with:
1. "formattedEvents": array of formatted event records
2. "formattingDecisions": array of objects explaining key formatting choices for each item

HARD SHAPE & COUNT INVARIANTS:
- The length of formattedEvents MUST equal items.length (one output object per input), and the order MUST be identical.
- Every formattedEvents[i] MUST be a JSON OBJECT (not an array/tuple). Do NOT emit rows with numeric keys (0,1,2…).
- Do NOT fabricate extra items or placeholders. If unsure, still return one object per input with empty strings for unknown fields.
- Required keys for each formattedEvents[i]:
  isEvent, isFoodSpecial, category, name, description, establishment, address, startDate, endDate, startTime, endTime, ticketPrice, ticketLink, relevantImageIndex, venue, additionalLocation, isRecurring, recurringPattern, timeFlags
- Time normalization:
  • startTime/endTime MUST be "HH:mm" 24-hour.
  • If no end time is shown OR if endTime was "unknown", set endTime="" (empty string), NEVER "unknown".
- Mirror decisions:
  • formattingDecisions MUST also have exactly items.length entries, each with itemName EXACTLY matching the input item’s name.

Include reasoning for:
- Why each item was classified as event vs special
- Why specific categories were chosen
- Any assumptions made during formatting
- Venue/establishment decisions: explain what venue (if any) was identified and why
- Establishment decisions: explain why establishment was set to the chosen value
- Additional location decisions: explain why additionalLocation was set to the chosen value`;
}

function createFormattingSchema() {
  return [{
    "name": "formatEvents",
    "description": "Format items into standardized event records. CRITICAL: Each item in formattedEvents MUST be a complete JSON object with ALL required fields, never an array of values.",
    "parameters": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "formattedEvents": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "isEvent": { "type": "string", "enum": ["Yes", "No"] },
              "isFoodSpecial": { "type": "string", "enum": ["Yes", "No"] },
              "category": { 
                "type": "string", 
                "enum": ["Live Music", "Trivia Night", "Comedy", "Cinema", "Workshops & Classes", "Religious", "Sports", "Family Friendly", "Gatherings & Parties", "Happy Hour", "Wing Night", "Food Special", "Drink Special"] 
              },
              "name": { "type": "string" },
              "description": { "type": "string" },
              "establishment": { "type": "string" },
              "address": { "type": "string" },
              "startDate": { "type": "string" },
              "endDate": { "type": "string" },
              "startTime": { "type": "string" },
              "endTime": { "type": "string" },
              "ticketPrice": { "type": "string" },
              "ticketLink": { "type": "string" },
              "relevantImageIndex": { "type": "integer" },
              "venue": { "type": "string" },
              "additionalLocation": { "type": "string" },
              "isRecurring": { "type": "boolean" },
              "recurringPattern": { "type": "string" }
            },
            "required": ["isEvent", "isFoodSpecial", "category", "name", "description", "establishment", "address", "startDate", "endDate", "startTime", "endTime", "ticketPrice", "ticketLink", "relevantImageIndex", "venue", "additionalLocation", "isRecurring", "recurringPattern"]
          }
        },
        "formattingDecisions": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "itemName": { "type": "string" },
              "typeDecision": { "type": "string" },
              "categoryDecision": { "type": "string" },
              "assumptions": { "type": "string" },
              "venueDecision": { "type": "string" },
              "establishmentDecision": { "type": "string" }, 
              "additionalLocationDecision": { "type": "string" }
            },
            "required": ["itemName", "typeDecision", "categoryDecision", "assumptions", "venueDecision", "establishmentDecision", "additionalLocationDecision"]
          }
        }
      },
      "required": ["formattedEvents", "formattingDecisions"]
    }
  }];
}

// ====================
// HELPER FUNCTIONS
// ====================

function callGPT(prompt, imageUrls, openaiApiKey) {
  // Convert image URLs to data URIs to avoid remote download timeouts at the API
  const imageParts = (imageUrls || []).map((url, idx) => {
    try {
      const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      const code = r.getResponseCode();
      if (code === 200) {
        const blob = r.getBlob();
        const ct = blob.getContentType() || 'image/jpeg';
        const b64 = Utilities.base64Encode(blob.getBytes());
        return { type: 'input_image', image_url: `data:${ct};base64,${b64}` };
      } else {
        console.log(`callGPT: image[${idx}] fetch ${code}, falling back to remote URL`);
        return { type: 'input_image', image_url: url };
      }
    } catch (e) {
      console.log(`callGPT: image[${idx}] fetch error: ${e} — falling back to remote URL`);
      return { type: 'input_image', image_url: url };
    }
  });

  const input = (imageParts.length > 0)
    ? [
        { role: 'user', content: prompt },
        { role: 'user', content: imageParts }
      ]
    : prompt;

  // [LOG][GPT] Message composition summary
  const _imgCount = Array.isArray(imageUrls) ? imageUrls.length : 0;
  const _contentType = Array.isArray(input) ? 'array' : typeof input;
  console.log(`callGPT: model=${MODEL_CONFIG.FAST_MODEL} | contentType=${_contentType} | textParts=1 | imageParts=${_imgCount}`);
  if (_imgCount > 0) {
    imageUrls.forEach((u, i) => console.log(`callGPT: image[${i}]=${u}`));
  }

  const payload = {
    'model': MODEL_CONFIG.FAST_MODEL,
    'input': input,
    'max_output_tokens': 32768,
    'reasoning': { 'effort': MODEL_CONFIG.REASONING_EFFORT }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'headers': { 'Authorization': `Bearer ${openaiApiKey}` },
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', options);
  const status = response.getResponseCode();
  const body = response.getContentText();

  console.log(`callGPT: HTTP status ${status}`);

  if (status !== 200) {
    const preview = body && body.length > 2000 ? body.slice(0, 2000) + '…' : body;
    console.error(`callGPT: non-200 response body preview: ${preview}`);
    throw new Error(`OpenAI API error: ${status}`);
  }

  const json = JSON.parse(body);

  // Prefer structured output_text if present
  if (json.output_text) return json.output_text;

  // Fallback: join any message text chunks
  if (json.output && json.output.length) {
    let text = '';
    json.output.forEach(item => {
      if (item.type === 'message' && Array.isArray(item.content)) {
        item.content.forEach(c => {
          if (c && (c.text || c.output_text)) text += (c.text || c.output_text);
        });
      }
    });
    if (text) return text;
  }

  return '';
}


function callGPTWithSchema(prompt, imageUrls, openaiApiKey, functionName, schema) {
  const content = imageUrls && imageUrls.length > 0 ? 
    [
      { 'type': 'text', 'text': prompt },
      ...imageUrls.map(url => ({
        'type': 'input_image',
        'image_url': url
      }))
    ] : prompt;

  // [LOG][GPT+SCHEMA] Message composition summary
  const _imgCount = Array.isArray(imageUrls) ? imageUrls.length : 0;
  const _contentType = Array.isArray(content) ? 'array' : typeof content;
  console.log(`callGPTWithSchema: fn=${functionName} | model=${MODEL_CONFIG.FAST_MODEL} | contentType=${_contentType} | textParts=1 | imageParts=${_imgCount}`);
  if (_imgCount > 0) {
    imageUrls.forEach((u, i) => console.log(`callGPTWithSchema: image[${i}]=${u}`));
  }

  // Convert legacy function schema to Responses tools (strict)
const tools = (schema || []).map(fn => ({
  type: 'function',
  name: fn.name,
  description: fn.description,
  parameters: fn.parameters,
  // Keep strict for all tools EXCEPT formatEvents to avoid hard schema failures in Stage 5
  strict: true
}));


  const input = Array.isArray(content)
    ? [
        { 'role': 'user', 'content': content.find(p => p.type === 'text')?.text || '' },
        { 'role': 'user', 'content': (Array.isArray(imageUrls) ? imageUrls : []).map(url => ({ 'type': 'input_image', 'image_url': url })) }
      ]
    : prompt;

  const payload = {
    'model': MODEL_CONFIG.FAST_MODEL,
    'input': input,
    'tools': tools,
    'tool_choice': { 'type': 'function', 'name': functionName },
    'max_output_tokens': 32768,
    'reasoning': { 'effort': MODEL_CONFIG.REASONING_EFFORT }
  };

  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'headers': { 'Authorization': `Bearer ${openaiApiKey}` },
    'muteHttpExceptions': true
  };

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', options);
  const status = response.getResponseCode();
  const body = response.getContentText();

  console.log(`callGPTWithSchema: HTTP status ${status}`);

  if (status !== 200) {
    const preview = body && body.length > 2000 ? body.slice(0, 2000) + '…' : body;
    console.error(`callGPTWithSchema: non-200 response body preview: ${preview}`);
    throw new Error(`OpenAI API error: ${status}`);
  }

  const json = JSON.parse(body);

  // 1) Tool/function call path (Responses can use "tool_call" or "function_call")
  if (json.output && json.output.length) {
    const callItem = json.output.find(it => it && (it.type === 'tool_call' || it.type === 'function_call'));
    if (callItem && callItem.arguments !== undefined) {
      try {
        if (typeof callItem.arguments === 'string') {
          return JSON.stringify(JSON.parse(callItem.arguments));
        } else if (typeof callItem.arguments === 'object' && callItem.arguments !== null) {
          return JSON.stringify(callItem.arguments);
        }
      } catch (e) {
        console.error('callGPTWithSchema: failed to parse call arguments', e);
        throw new Error('Failed to parse tool/function call arguments');
      }
    }

// 2) Direct output_text (some Responses return this)
if (typeof json.output_text === 'string' && json.output_text.trim()) {
  const txt = json.output_text.trim();
  try {
    return JSON.parse(txt); // already an object
  } catch (e) {
    // Return a structured fallback so callers don't crash
    return {
      imageAnalysis: [],
      hasValidContent: false,
      confidence: 0,
      validationDecision: 'VALIDATION_FAILED',
      reason: txt
    };
  }
}


// 3) Message fallback: collect any text-like chunks (then try to parse JSON)
const msg = json.output.find(it => it && it.type === 'message');
if (msg && Array.isArray(msg.content)) {
  const chunks = [];
  for (var i = 0; i < msg.content.length; i++) {
    var c = msg.content[i];
    if (!c) continue;
    if (typeof c.text === 'string' && c.text) {
      chunks.push(c.text);
    } else if (c.text && typeof c.text.value === 'string') {
      chunks.push(c.text.value);
    } else if (typeof c.output_text === 'string' && c.output_text) {
      chunks.push(c.output_text);
    }
  }
  const text = chunks.join('').trim();
  if (text) {
    try {
      return JSON.parse(text); // already an object
    } catch (e) {
      // Return a structured fallback so callers don't crash
      return {
        imageAnalysis: [],
        hasValidContent: false,
        confidence: 0,
        validationDecision: 'VALIDATION_FAILED',
        reason: text
      };
    }
  }
}

  }

  // 4) Final fallback: return output_text if present, else raise with preview
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text;
  }

  console.error('callGPTWithSchema: unexpected response shape. Preview:', JSON.stringify(json).slice(0, 1500));
  throw new Error('OpenAI API: unexpected response shape');
}


function parseJSONResponse(response, extractorType) {
  console.log(`parseJSONResponse: Parsing ${extractorType} response`);
  
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log(`parseJSONResponse: Successfully parsed ${parsed.length} items`);
      return parsed;
    }
    
    // Try parsing the whole response
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.events) {
      return parsed.events;
    } else if (parsed.specials) {
      return parsed.specials;
    } else if (parsed.items) {
      return parsed.items;
    }
    
    console.log(`parseJSONResponse: Could not parse response for ${extractorType}`);
    return [];
  } catch (error) {
    console.error(`parseJSONResponse: Error parsing ${extractorType} response:`, error);
    return [];
  }
}

function parseJsonObjectWithRepair(response, logLabel) {
  const prefix = logLabel ? `${logLabel}: ` : '';
  const jsonMatch = response.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    try {
      return JSON.parse(response);
    } catch (error) {
      console.error(`${prefix}Failed to parse response as JSON object:`, error);
      throw error;
    }
  }

  const jsonStr = jsonMatch[0];

  try {
    return JSON.parse(jsonStr);
  } catch (originalError) {
    console.log(`${prefix}Original parse failed, attempting repair`);
    const repairedStr = repairMalformedJson(jsonStr);

    if (repairedStr !== jsonStr) {
      try {
        const parsed = JSON.parse(repairedStr);
        console.log(`${prefix}Successfully parsed after repair`);
        return parsed;
      } catch (repairError) {
        console.error(`${prefix}Repair did not fix the JSON`);
        console.error(`${prefix}Original error:`, originalError);
        console.error(`${prefix}Repair error:`, repairError);
        console.error(`${prefix}Original JSON:`, jsonStr);
        console.error(`${prefix}Repaired JSON:`, repairedStr);
        throw repairError;
      }
    }

    console.error(`${prefix}No repairs applicable`);
    console.error(`${prefix}Parse error:`, originalError);
    console.error(`${prefix}JSON:`, jsonStr);
    throw originalError;
  }
}

// ====================
// EXISTING FUNCTIONS
// ====================

function processEvents(parsedData, userName, facebookUrl, profilePicUrl, mediaUrls, sharedPostThumbnails, extractedData) {
  console.log('processEvents: Processing formatted events');
  console.log(`processEvents: Processing ${parsedData.length} events`);

  // Track events skipped due to unrecognized venues
  let skippedUnrecognizedVenue = 0;

  const result = parsedData.flatMap(event => {
    try {
      // Override the establishment with the userName
      // Preserve establishment from GPT if available, otherwise fallback
      if (!event.establishment || event.establishment === '') {
        event.establishment = userName;
      }
      console.log(`🏷️ Final establishment set for "${event.name}": "${event.establishment}"`);


      // Handle additional location
      if (event.additionalLocation) {
        console.log(`processEvents: Event has additionalLocation: "${event.additionalLocation}"`);

        const venueInfo = findVenueInContactInfo(event.additionalLocation);

        if (venueInfo) {
          console.log(`processEvents: Found venue information for "${event.additionalLocation}"`);

          // CRITICAL: Mark this event as using a venue override
          // This flag prevents updateContactInfoSheet from mixing post author (aggregator) URL
          // with event venue establishment, which would pollute Contact Info with wrong URLs
          event.isAggregatorPost = true;

          // Update establishment name
          const cleanedName = cleanVenueName(venueInfo.name);
          event.establishment = cleanedName;

          // Update Facebook URL (will be overwritten by addMetadata later with post author URL)
          if (venueInfo.facebookUrl) {
            event.cleanedFacebookUrl = venueInfo.facebookUrl;
          }

          // Update address
          if (venueInfo.address) {
            const cleanedAddress = venueInfo.address.split('https://')[0].trim();
            event.address = cleanedAddress;
          }

          // Update coordinates
          if (venueInfo.latitude) event.latitude = venueInfo.latitude;
          if (venueInfo.longitude) event.longitude = venueInfo.longitude;

        } else {
          console.log(`processEvents: Venue "${event.additionalLocation}" not found. Recording as unrecognized.`);

          const eventDetails = `${event.name} | ${event.startDate} ${event.startTime} | ${event.description}`;
          recordUnrecognizedVenue(event.additionalLocation, userName, eventDetails);

          skippedUnrecognizedVenue++;
          return []; // Skip this event
        }
      }

      // Add metadata
      console.log('processEvents: typeof extractedData = ' + (typeof extractedData));
      event = addMetadata(event, profilePicUrl, mediaUrls[0], facebookUrl, sharedPostThumbnails[0], extractedData);
      
      // Add relevant image URL
      if (event.relevantImageIndex >= 0 && event.relevantImageIndex < mediaUrls.length) {
        event.relevantImageUrl = mediaUrls[event.relevantImageIndex];
      } else {
        event.relevantImageUrl = '';
      }

      return [event];
    } catch (error) {
      console.error('processEvents: Error processing event:', error);
      return [];
    }
  });

  // Attach skip count to first event for pipeline tracking
  if (result.length > 0) {
    result[0]._skippedUnrecognizedVenue = skippedUnrecognizedVenue;
  }

  if (skippedUnrecognizedVenue > 0) {
    console.log(`processEvents: ${skippedUnrecognizedVenue} event(s) skipped due to unrecognized venue`);
  }

  return result;
}

function addMetadata(event, profilePicUrl, mediaUrl, facebookUrl, sharedPostThumbnail, extractedData) {
  event.icon = profilePicUrl;
  event.image = mediaUrl;
  event.cleanedFacebookUrl = facebookUrl ? facebookUrl.replace(/^https:\/\/m\./, 'https://www.') : '';
  event.sharedPostThumbnail = sharedPostThumbnail;
  
  // Add fields from extractedData (defensive: extractedData may be undefined)
  extractedData = extractedData || {};
  try {
    event.id = (extractedData.id || extractedData.postId || event.id || '').toString();
    event.latitude = extractedData.latitude || event.latitude || '';
    event.longitude = extractedData.longitude || event.longitude || '';
    event.city = extractedData.city || event.city || '';
    event.streetAddress = extractedData.streetAddress || event.streetAddress || '';
    event.organizedBy = extractedData.organizedBy || event.organizedBy || '';
    event.usersResponded = extractedData.usersResponded || event.usersResponded || '';
    event.utcStartDate = extractedData.utcStartDate || event.utcStartDate || '';
    event.ticketsBuyUrl = extractedData.ticketsBuyUrl || event.ticketsBuyUrl || '';
// Bridge Stage 5 "ticketLink" → sheet's ticketsBuyUrl if not provided upstream
if ((!event.ticketsBuyUrl || String(event.ticketsBuyUrl).trim() === '') && event.ticketLink) {
  event.ticketsBuyUrl = event.ticketLink;
}
  } catch (e) {
    console.error('addMetadata: extractedData missing or malformed', e);
  }
  event.ticketProvider = extractedData.ticketProvider;
  event.likes = extractedData.likes;
  event.shares = extractedData.shares;
  event.comments = extractedData.comments;
  event.topReactionsCount = extractedData.topReactionsCount;

  return event;
}

// Stub functions - implement these elsewhere
// (stub removed — use main.gs implementation of isAddressAcceptable)

// (stub removed — use googlePlacesUtils.gs implementation of searchGooglePlaces)

function cleanupAllImages(extractedData) {
  console.log('cleanupAllImages: Cleaning up image resources');
}

// (stub removed — use additionalvenue.gs implementation of findVenueInContactInfo)

function cleanVenueName(name) {
  return name;
}

// (stub removed — use additionalvenue.gs implementation of recordUnrecognizedVenue)
