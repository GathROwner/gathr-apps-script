// openAiUtils.gs

// ENHANCED SCHEMA FUNCTIONS FOR NEW MULTI-STAGE SYSTEM
// These support the new validation and classification stages

// Content Validation Schema (Stage 1)


// Enhanced Content Classification Schema (Stage 2)




// Legacy compatibility function - maps to new system
function createGptFunctionSchema(userName) {
  // For backward compatibility during transition
  return createEnhancedClassificationSchema();
}

// Legacy compatibility function - maps to new system  
function createContentClassificationSchema() {
  // For backward compatibility during transition
  return createEnhancedClassificationSchema();
}



function callOpenAIWithImage(prompt, imageBlobs, openaiApiKey) {
  const imageParts = (imageBlobs || []).map(blob => ({
    'type': 'input_image',
    'image_url': `data:${blob.getContentType()};base64,${Utilities.base64Encode(blob.getBytes())}`
  }));

  const input = [
    { 'role': 'user', 'content': prompt },
    { 'role': 'user', 'content': imageParts }
  ];

  const tools = (FEATURE_FLAGS.USE_GPT_FUNCTION_CALLING ? (createGptFunctionSchema() || []) : [])
    .map(fn => ({ type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters, strict: true }));

  const payload = {
    'model': 'gpt-5-nano',
    'input': input,
    ...(tools.length ? { 'tools': tools, 'tool_choice': { 'type': 'function', 'name': 'extractMultipleEvents' }
     } : {}),
    'max_output_tokens': 32768
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

  console.log('Sending request to OpenAI Responses API with image(s)');
  console.log(`Function calling mode: ${FEATURE_FLAGS.USE_GPT_FUNCTION_CALLING ? 'Enabled' : 'Disabled'}`);
  return fetchOpenAIResponse(options);
}

function callOpenAI(prompt, openaiApiKey) {
  const tools = (FEATURE_FLAGS.USE_GPT_FUNCTION_CALLING ? (createGptFunctionSchema() || []) : [])
    .map(fn => ({ type: 'function', name: fn.name, description: fn.description, parameters: fn.parameters, strict: true }));

  const payload = {
    'model': 'gpt-5-nano',
    'input': prompt,
    ...(tools.length ? { 'tools': tools, 'tool_choice': { 'type': 'function', 'name': 'extractMultipleEvents' }
 } : {}),
    'max_output_tokens': 32768
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

  console.log('Sending request to OpenAI Responses API without image');
  console.log(`Function calling mode: ${FEATURE_FLAGS.USE_GPT_FUNCTION_CALLING ? 'Enabled' : 'Disabled'}`);
  return fetchOpenAIResponse(options);
}

// Updated function to handle both regular and function call responses (Responses API)
function fetchOpenAIResponse(options) {
  try {
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', options);
    console.log('OpenAI Responses API response received');
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`Error from OpenAI Responses API: ${responseCode} ${responseBody}`);
      return '';
    }

    const json = JSON.parse(responseBody);

    // Tool call result
    if (json.output && json.output.length) {
      const tool = json.output.find(it => it.type === 'tool_call');
      if (tool && tool.arguments) {
        try {
          const functionArgs = JSON.parse(tool.arguments);
          console.log('Function arguments parsed successfully');
          return JSON.stringify(functionArgs);
        } catch (parseError) {
          console.error(`Error parsing tool arguments: ${parseError}`);
        }
      }

      // Otherwise return concatenated message text
      const msg = json.output.find(it => it.type === 'message');
      if (msg && Array.isArray(msg.content)) {
        const text = msg.content.map(c => (c.text || c.output_text || '')).join('');
        if (text) return text;
      }
    }

    // Fallback to output_text if present
    return json.output_text || '';
  } catch (error) {
    console.error(`Error fetching or parsing OpenAI Responses: ${error}`);
    console.error(`Error stack: ${error.stack}`);
    return '';
  }
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

ASSET IMAGE DECISION POLICY (apply only to fields that actually exist in the records):
- Profile image candidates (check both records): profilePicUrl, profilePictureUrl, profileImageUrl (or similarly named keys).
- Post image candidates (check both records): relevantImageUrl, postImageUrl, imageUrl, mediaThumbnailUrl (or similarly named keys).
- Prefer venue-branded or venue-named images over generic/aggregator images. Heuristics (string-based; you are NOT fetching images):
  • If a candidate URL/filename contains the establishment/venue name from the record, prefer it over a candidate whose URL/filename contains generic or aggregator terms (e.g., “downtown”, “whatshappening”, “events”, “today”, “calendar”).
  • Prefer event-informative post images (filenames containing “poster”, “show”, “gig”, “event”, dates like “2025-09” or month names) over generic scenery/city images.
- Never downgrade a clearly venue-branded image to a generic/aggregator image. If existing is venue-branded and new looks generic, do NOT update that image field.
- If existing is empty or clearly generic and new is plausibly venue-branded/event-informative, DO update that image field.
- If both are equivalent/unclear, keep existing (stability) and do NOT update that image field.

COUNTS UPDATE POLICY (for social freshness):
- If newRecord has newer timestamp OR higher counts, include likes, comments, shares, topReactionsCount in fieldsToUpdate.

Focus particularly on the establishment name and the semantic meaning of the descriptions. The date is NOT a determining factor - events can be rescheduled.

Provide your determination in this format:
{
  "sameCoreEvent": true/false,
  "confidenceLevel": 0-100,
  "reasonForDetermination": "explanation",
  "recommendedAction": "update_existing/create_new/request_human_review",
  "fieldsToUpdate": ["field1", "field2"]
}

Instructions for fieldsToUpdate:
- Include ONLY the field names from newRecord that should overwrite existingRecord.
- For images, follow the ASSET IMAGE DECISION POLICY above:
  • If new image is preferred → include that image field (e.g., "profilePicUrl", "relevantImageUrl") in fieldsToUpdate.
  • If existing image should be kept → do NOT include that image field in fieldsToUpdate.
- For social counts freshness, include "likes", "comments", "shares", "topReactionsCount" when newRecord is fresher or has higher values.

}`;

  // Create the function schema for GPT
  const functionSchema = [
    {
      "name": "assessEventDuplication",
      "description": "Determine if two events are the same event with updates or distinct events",
      "parameters": {
        "type": "object",
        "additionalProperties": false,
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

  // Prepare the API payload (Responses API + function tool)
  const tools = functionSchema.map(fn => ({
    type: 'function',
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
    strict: true
  }));

  const payload = {
    'model': 'gpt-5-nano',
    'input': prompt,
    'tools': tools,
    'tool_choice': { 'type': 'function', 'name': 'assessEventDuplication' },
    'max_output_tokens': 32768
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

  try {
    console.log('assessEventsWithGpt: Sending request to OpenAI Responses API');
    const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`assessEventsWithGpt: Error from OpenAI: ${responseCode} ${responseBody}`);
      return null;
    }

    const json = JSON.parse(responseBody);

    if (json.output && json.output.length) {
      const tool = json.output.find(it => it.type === 'tool_call' && it.name === 'assessEventDuplication');
      if (tool && tool.arguments) {
        const functionArgs = JSON.parse(tool.arguments);
        console.log('assessEventsWithGpt: Parsed assessment:', JSON.stringify(functionArgs, null, 2));
        return functionArgs;
      }
    }

    console.log('assessEventsWithGpt: No tool_call in response');
    return null;
  } catch (error) {
    console.error(`assessEventsWithGpt: Error assessing events: ${error}`);
    console.error(`assessEventsWithGpt: Error stack: ${error.stack}`);
    return null;
  }
}