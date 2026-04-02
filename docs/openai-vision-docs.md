# OpenAI Vision & Responses API Documentation

> Compiled: February 2026
> Sources: OpenAI Platform Documentation, Community Forums, API Reference

---

## Table of Contents
1. [Model Capability Matrix](#model-capability-matrix)
2. [Responses API Documentation](#responses-api-documentation)
3. [Chat Completions API (Comparison)](#chat-completions-api-comparison)
4. [Vision/Image Input Documentation](#visionimage-input-documentation)
5. [Rate Limits & Usage](#rate-limits--usage)
6. [Migration Guide: Chat Completions → Responses](#migration-guide-chat-completions--responses)
7. [Node SDK Examples](#node-sdk-examples)

---

## Model Capability Matrix

### GPT-5 Series Models

| Model | Model ID | Vision Support | Endpoints | Context Length | Max Output Tokens |
|-------|----------|----------------|-----------|----------------|-------------------|
| GPT-5 | `gpt-5` | ✅ Yes | Responses, Chat Completions | 400K | 128K |
| GPT-5 Instant | `gpt-5-instant` | ✅ Yes | Responses, Chat Completions | 400K | 128K |
| GPT-5 Thinking | `gpt-5-thinking` | ✅ Yes | Responses, Chat Completions | 400K | 128K |

### GPT-5.2 Series Models (Latest)

| Model | Model ID | Vision Support | Endpoints | Context Length | Notes |
|-------|----------|----------------|-----------|----------------|-------|
| GPT-5.2 Thinking | `gpt-5.2` | ✅ Yes (strongest) | Responses, Chat Completions | 256K | Best for vision tasks |
| GPT-5.2 Instant | `gpt-5.2-chat-latest` | ✅ Yes | Responses, Chat Completions | 256K | Fast responses |
| GPT-5.2 Pro | `gpt-5.2-pro` | ✅ Yes | **Responses API only** | 256K | Advanced features |
| GPT-5.2 Codex | `gpt-5.2-codex` | ✅ Yes | **Responses API only** | 256K | Coding tasks |

### Reasoning Effort Levels by Model

| Model | Available Levels |
|-------|------------------|
| GPT-5 | `minimal`, `low`, `medium`, `high` |
| GPT-5.1 | `none` (default), `low`, `medium`, `high` |
| GPT-5.2 | `none` (default), `low`, `medium`, `high`, `xhigh` |

### Other Vision-Enabled Models

| Model | Vision Support | Endpoints |
|-------|----------------|-----------|
| GPT-4.1 | ✅ Yes | Responses, Chat Completions |
| GPT-4.1 mini | ✅ Yes | Responses, Chat Completions |
| GPT-4.5 | ✅ Yes | Responses, Chat Completions |
| GPT-4o | ✅ Yes | Responses, Chat Completions |
| GPT-4o mini | ✅ Yes | Responses, Chat Completions |
| o3 | ✅ Yes | Responses, Chat Completions |
| o4-mini | ✅ Yes | Responses, Chat Completions |

> **Note:** GPT-4o, GPT-4.1, GPT-4.1 mini, o4-mini, and GPT-5 (Instant/Thinking) will be retired from ChatGPT on February 13, 2026.

---

## Responses API Documentation

### Endpoint
```
POST /v1/responses
```

### Request Schema for Mixed Text + Image Input

```json
{
  "model": "gpt-5.2",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "What's in this image?"
        },
        {
          "type": "input_image",
          "image_url": "https://example.com/image.jpg",
          "detail": "high"
        }
      ]
    }
  ],
  "max_output_tokens": 4096,
  "temperature": 0.7
}
```

### Image Input Variations

**1. URL Input:**
```json
{
  "type": "input_image",
  "image_url": "https://example.com/image.jpg"
}
```

**2. Base64 Encoded:**
```json
{
  "type": "input_image",
  "image_url": "data:image/jpeg;base64,{base64_encoded_image}"
}
```

**3. File ID (uploaded via Files API):**
```json
{
  "type": "input_image",
  "file_id": "file-abc123"
}
```

### Key Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model ID (e.g., `gpt-5.2`, `gpt-4.1-mini`) |
| `input` | array | Array of message items with role and content |
| `max_output_tokens` | integer | Max tokens for response (alias: `max_completion_tokens`) |
| `temperature` | float | Sampling temperature (0-2). Higher = more random |
| `top_p` | float | Nucleus sampling (0-1). Alternative to temperature |
| `instructions` | string | System/developer message |
| `previous_response_id` | string | Chain responses together |
| `stream` | boolean | Enable streaming responses |
| `truncation` | string | `"auto"` or `"disabled"` (default) |
| `parallel_tool_calls` | boolean | Allow parallel tool execution |
| `reasoning_effort` | string | `none`, `low`, `medium`, `high`, `xhigh` (GPT-5.2) |
| `text` | object | Text output configuration (structured outputs) |

### Output Structure

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1706828000,
  "model": "gpt-5.2",
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "The image shows a scenic nature boardwalk...",
          "annotations": [],
          "logprobs": null
        }
      ]
    }
  ],
  "output_text": "The image shows a scenic nature boardwalk...",
  "usage": {
    "input_tokens": 1250,
    "output_tokens": 150,
    "total_tokens": 1400
  }
}
```

**Key output properties:**
- `output` - Array of content items (may include reasoning, tool calls, messages)
- `output_text` - Convenience property aggregating all text outputs (SDK feature)
- `usage` - Token counts

> ⚠️ **Important:** The `output` array can contain multiple items. Don't assume text is at `output[0].content[0].text`. Use `output_text` for convenience.

### Streaming Format

Enable streaming with `stream: true`. Events are Server-Sent Events (SSE).

**Key Streaming Events:**

| Event Type | Description |
|------------|-------------|
| `response.created` | Response started |
| `response.in_progress` | Response being generated |
| `response.output_item.added` | New output item added |
| `response.output_text.delta` | Text chunk received |
| `response.output_text.done` | Text generation complete |
| `response.completed` | Response finished |
| `response.failed` | Error occurred |
| `response.incomplete` | Response truncated |
| `error` | Error event |

**Delta Event Structure:**
```json
{
  "event_id": "event_4142",
  "type": "response.output_text.delta",
  "response_id": "resp_001",
  "item_id": "msg_007",
  "output_index": 0,
  "content_index": 0,
  "delta": "Sure, I can h"
}
```

---

## Chat Completions API (Comparison)

### Endpoint
```
POST /v1/chat/completions
```

### Request Schema for Image Input

```json
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe this picture:"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg",
            "detail": "high"
          }
        }
      ]
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.7
}
```

### Key Differences: Responses vs Chat Completions

| Feature | Responses API | Chat Completions API |
|---------|---------------|----------------------|
| Image content type | `input_image` | `image_url` |
| Image URL field | `image_url` (string) | `image_url.url` (nested object) |
| Text content type | `input_text` | `text` |
| Max tokens param | `max_output_tokens` | `max_tokens` |
| Conversation state | `previous_response_id` or Conversations API | Manual management |
| Chain of Thought | ✅ Supported (better with GPT-5) | ❌ Not supported |
| Built-in tools | ✅ Web search, file search, code interpreter | ❌ None |
| Output property | `output` array + `output_text` | `choices[0].message.content` |

> **Recommendation:** Use Responses API for new projects, especially with GPT-5+ models.

---

## Vision/Image Input Documentation

### Supported Image Formats

| Format | Supported | Notes |
|--------|-----------|-------|
| JPEG/JPG | ✅ Yes | Most common |
| PNG | ✅ Yes | Supports transparency |
| GIF | ✅ Yes | **Non-animated only** |
| WebP | ✅ Yes | Modern format |

### Size Limits

| Limit Type | Value |
|------------|-------|
| Max file size | **20 MB** |
| Max payload (total) | 50 MB |
| Max images per request | **500 images** (GPT-4o+) |
| Images over 8MB in Chat Completions | Dropped/rejected |

### URL vs Base64 Rules

**URL Input:**
- Must be publicly accessible HTTP/HTTPS URL
- OpenAI fetches the image server-side
- Faster for large images
- URL must be valid at request time

**Base64 Input:**
- Format: `data:image/{format};base64,{encoded_data}`
- Embedded in request payload
- Counts toward payload size limit
- More reliable (no network fetch issues)
- Slightly slower for large images

```javascript
// Base64 format example
const imageUrl = `data:image/jpeg;base64,${base64EncodedString}`;
```

### Detail Parameter Behavior

| Value | Description | Token Cost | Use Case |
|-------|-------------|------------|----------|
| `low` | 512×512px thumbnail | **85 tokens** (fixed) | Quick classification, simple questions |
| `high` | Full resolution analysis | **Variable** (see calculation) | Detailed analysis, text reading, diagrams |
| `auto` | Model decides | Variable | Default - let model choose |

**High Detail Token Calculation:**

1. Scale image to fit 2048×2048 (maintain aspect ratio)
2. Scale shortest side to 768px
3. Count 512×512 tiles needed
4. **Formula:** `tokens = 85 + (170 × num_tiles)`

**Examples:**

| Image Size | Tiles | Token Cost |
|------------|-------|------------|
| 1024×1024 | 4 | 765 tokens |
| 2048×4096 | 6 | 1105 tokens |
| 512×512 | 1 | 255 tokens |
| 4096×4096 | 12 | 2125 tokens |

> ⚠️ **Known Issue (as of late 2025):** GPT-5 may ignore `detail: "low"` and use high detail regardless. Works correctly on o3 and other models.

---

## Rate Limits & Usage

### Rate Limit Metrics

| Metric | Description |
|--------|-------------|
| RPM | Requests per minute |
| RPD | Requests per day |
| TPM | Tokens per minute |
| TPD | Tokens per day |
| IPM | Images per minute |

### Image Token Counting

- Images are metered as tokens
- Count toward TPM (tokens per minute) limit
- Billed at model's input token rate
- Low detail: 85 tokens/image
- High detail: Variable (see calculation above)
- Max 1536 patches (tiles) per image

### Project Rate Limit Configuration

Configure via API:
- `max_images_per_1_minute`
- `max_requests_per_1_minute`
- `max_tokens_per_1_minute`

### Pricing (GPT-5 Example)

| Tier | Input | Output |
|------|-------|--------|
| Lowest | $0.05/1M tokens | $0.40/1M tokens |
| Highest | $1.25/1M tokens | $10.00/1M tokens |

---

## Migration Guide: Chat Completions → Responses

### Quick Migration Steps

1. **Update endpoint:** `POST /v1/chat/completions` → `POST /v1/responses`
2. **Rename parameters:**
   - `messages` → `input`
   - `max_tokens` → `max_output_tokens`
3. **Update content types:**
   - `"type": "text"` → `"type": "input_text"`
   - `"type": "image_url"` → `"type": "input_image"`
4. **Update image URL structure:**
   - Chat: `"image_url": { "url": "..." }`
   - Responses: `"image_url": "..."`
5. **Update response handling:**
   - Chat: `response.choices[0].message.content`
   - Responses: `response.output_text` or `response.output[0].content[0].text`

### Before (Chat Completions)

```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What's in this image?" },
        {
          type: "image_url",
          image_url: {
            url: "https://example.com/image.jpg",
            detail: "high"
          }
        }
      ]
    }
  ],
  max_tokens: 1000
});

console.log(response.choices[0].message.content);
```

### After (Responses API)

```javascript
const response = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "What's in this image?" },
        {
          type: "input_image",
          image_url: "https://example.com/image.jpg",
          detail: "high"
        }
      ]
    }
  ],
  max_output_tokens: 1000
});

console.log(response.output_text);
```

### Benefits of Migrating

| Benefit | Details |
|---------|---------|
| Better intelligence | 3% improvement on SWE-bench with GPT-5 |
| Lower costs | 40-80% better cache utilization |
| Chain of Thought | Pass reasoning between turns |
| Built-in tools | Web search, file search, code interpreter |
| Conversations API | Persistent conversation state |
| Compaction | Extended context via `/compact` endpoint |

### Codex CLI Migration Tool

```bash
# Auto-upgrade your codebase
codex migrate-to-responses
```

This tool:
- Finds legacy Chat Completions usage
- Proposes and applies edits
- Updates import/request shapes
- Runs tests/lints
- Creates a clean branch

---

## Node SDK Examples

### Installation

```bash
npm install openai
```

### Basic Image Analysis

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

// Responses API with URL
const response = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "What's in this image?" },
        {
          type: "input_image",
          image_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
        }
      ]
    }
  ]
});

console.log(response.output_text);
```

### Base64 Image Input

```javascript
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI();

// Read and encode image
const imagePath = "path/to/your/image.jpg";
const base64Image = fs.readFileSync(imagePath, "base64");

const response = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Describe this image in detail." },
        {
          type: "input_image",
          image_url: `data:image/jpeg;base64,${base64Image}`,
          detail: "high"
        }
      ]
    }
  ],
  max_output_tokens: 1000
});

console.log(response.output_text);
```

### Multiple Images

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

const response = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Compare these two images:" },
        {
          type: "input_image",
          image_url: "https://example.com/image1.jpg",
          detail: "high"
        },
        {
          type: "input_image",
          image_url: "https://example.com/image2.jpg",
          detail: "high"
        }
      ]
    }
  ]
});

console.log(response.output_text);
```

### Streaming with Images

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

const stream = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Describe this image:" },
        {
          type: "input_image",
          image_url: "https://example.com/image.jpg"
        }
      ]
    }
  ],
  stream: true
});

for await (const event of stream) {
  if (event.type === "response.output_text.delta") {
    process.stdout.write(event.delta);
  }
}
```

### Using File ID (Pre-uploaded Image)

```javascript
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI();

// First, upload the file
const file = await openai.files.create({
  file: fs.createReadStream("image.jpg"),
  purpose: "vision"
});

// Then use the file ID
const response = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "What's in this image?" },
        {
          type: "input_image",
          file_id: file.id
        }
      ]
    }
  ]
});

console.log(response.output_text);
```

### Chat Completions (Fallback/Comparison)

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

// Chat Completions API (older approach)
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What's in this image?" },
        {
          type: "image_url",
          image_url: {
            url: "https://example.com/image.jpg",
            detail: "high"
          }
        }
      ]
    }
  ],
  max_tokens: 1000
});

console.log(response.choices[0].message.content);
```

### With Detail Parameter

```javascript
import OpenAI from "openai";

const openai = new OpenAI();

// Low detail - faster, cheaper (85 tokens)
const quickResponse = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Is there a cat in this image? Yes or no." },
        {
          type: "input_image",
          image_url: "https://example.com/image.jpg",
          detail: "low"  // Fixed 85 tokens
        }
      ]
    }
  ]
});

// High detail - for text reading, detailed analysis
const detailedResponse = await openai.responses.create({
  model: "gpt-5.2",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: "Read all the text in this screenshot." },
        {
          type: "input_image",
          image_url: "https://example.com/screenshot.png",
          detail: "high"  // Variable tokens based on size
        }
      ]
    }
  ]
});
```

---

## Quick Reference Card

### Responses API Image Input
```json
{
  "type": "input_image",
  "image_url": "https://..." | "data:image/jpeg;base64,...",
  "file_id": "file-...",  // Alternative to image_url
  "detail": "low" | "high" | "auto"
}
```

### Chat Completions Image Input
```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://..." | "data:image/jpeg;base64,...",
    "detail": "low" | "high" | "auto"
  }
}
```

### Supported Formats
`PNG`, `JPEG`, `GIF` (non-animated), `WebP`

### Size Limits
- Max file: 20 MB
- Max images/request: 500
- Max payload: 50 MB

### Token Costs
- Low detail: 85 tokens (fixed)
- High detail: 85 + (170 × tiles)

---

## Sources

- [OpenAI Responses API Reference](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI Images and Vision Guide](https://platform.openai.com/docs/guides/images-vision)
- [OpenAI Migration Guide](https://platform.openai.com/docs/guides/migrate-to-responses)
- [OpenAI Models Documentation](https://platform.openai.com/docs/models)
- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)
- [OpenAI Streaming Events](https://platform.openai.com/docs/api-reference/responses-streaming)
- [Introducing GPT-5.2](https://openai.com/index/introducing-gpt-5-2/)
- [GPT-5.2 Model Documentation](https://platform.openai.com/docs/models/gpt-5.2)
