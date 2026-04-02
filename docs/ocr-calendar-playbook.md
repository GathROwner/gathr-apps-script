# Calendar OCR Playbook (Soul Fit PEI February 2026)

Purpose
This document captures the steps and pitfalls we hit while getting reliable OCR
and extraction for calendar-style images (e.g., monthly grids with colored text).
It is written so future agents can avoid repeating the same dead ends.

Problem Summary
- Source images from Facebook were low resolution (example: 514x720).
- Apify-provided `ocrText` was low quality and incomplete.
- GPT image extraction often returned no items or truncated JSON.
- Stage 3 fallback tended to collapse items into recurrences or return partial
  lists, which caused large event loss.

What Finally Worked (in order of impact)
1) Calendar OCR preprocessing in gathr-backend
   - Added calendar-specific preprocessing: stronger normalize + sharpen.
   - Added a color-preserving pipeline for faint purple/pink text:
     - Higher saturation/contrast and slight brightness lift.
     - Lowered saturation threshold for detection.
     - Forced inclusion of all calendar cells (not just high-density tiles),
       so faint text does not get dropped.
   - Result: tiles retained faint colored text and OCR became much more complete.

2) Do not trust embedded Apify OCR for calendars
   - Apify `ocrText` is often incomplete and should not be the primary OCR
     source for calendar extraction.
   - We now treat embedded OCR as usable only if it is "complete enough"
     (long enough and with sufficient time tokens).
   - Otherwise, we re-run OCR directly on the uploaded image.

3) Calendar OCR supplement (Stage 3)
   - Even when GPT returns 0 or partial items, we parse OCR text with a
     deterministic calendar parser.
   - The parser reads month/year + day cells and extracts per-date items.
   - We merge OCR-derived items with GPT-derived items using a
     date+time+name key.

Critical Implementation Details
- gathr-backend (image upload / tile generator)
  - Calendar preprocess settings tuned for faint colored text:
    - Saturation, contrast, brightness, and sat-threshold adjustments.
    - Always include all calendar cells when total <= 42.
    - Use color tiles when any saturation is present.
  - This is required for calendars with low-contrast, colored text.

- functions parsing pipeline
  - `supplementCalendarWithOcr` now:
    - Uses embedded OCR only if it is long and has enough time tokens.
    - Otherwise calls OCR directly on the uploaded base image.
    - Parses OCR text via `parseCalendarOcrText` and merges results.
  - This avoids false confidence from noisy embedded OCR.

Why This Was Hard
- The OCR text embedded in Apify rows looked "present" but was incomplete, so
  early fixes mistakenly relied on it and masked the real issue.
- GPT calendar extraction often returns incomplete or truncated JSON for long
  lists. This meant the parser "worked" but silently dropped most events.
- The most legible text was colored (purple/pink) and almost invisible to
  grayscale OCR, so simple grayscale preprocessing failed.

How to Validate Quickly
1) Ensure the OCR debug text includes all calendar rows.
   - Look for multiple occurrences of each class across dates.
2) A full row-238 dry-run should extract 34 events (for February 2026).
3) If extraction count is low:
   - Check if embedded OCR is being used accidentally.
   - Confirm backend tiles include colored text.
   - Ensure the OCR supplement runs and merges items.

Known Caveats
- If OPENAI_API_KEY is not set in the environment, OCR fallback will silently
  fail and extraction will collapse to a few items.
- Places API is currently disabled; this only affects time inference, not OCR.

Suggested Future Improvements
- Consider a dedicated calendar OCR endpoint that always returns raw OCR text
  + tile metadata in a predictable schema.
- Consider a secondary model specialized for OCR if vision models regress.
