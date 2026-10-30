# Local video evidence comparison worker

Standalone manual-shadow experiment in `functions/scripts/video-evidence-worker.mjs`. It does not integrate with the parser, read credentials from files, fetch media, publish anything, write Firestore/Storage, or create legacy pilot approval records. The coordinating chat owns source acquisition/binding, auth, paid execution and independent human review. This implementation was developed and tested using only synthetic local media and mocked HTTP responses; no live API compatibility or real-source accuracy is claimed.

Requires the existing Node 22 runtime and installed `ffmpeg`/`ffprobe` on PATH. No dependency or package changes. Validated locally with Node's test runner and ffmpeg 8.1.1. Run from this worktree, not the saved project checkout.

## Accepted animation preference, October 30

Craig watched Royalty Crossing's complete five-second Halloween Artisan Market clip (source post `1621083896343590`, video `1582649633172659`) and explicitly requested it because its animation adds real value over a static image. That human decision supersedes the earlier visual-only low-value rejection. Useful animated posters and event promotions qualify; camera footage of a performance or activity is not required. Evaluate engagement, legibility and relevance rather than rejecting a clip merely because its starting material is a poster.

Preserve the original experiment's requests and responses. Under Craig's clarified preference, Luna's recommendation on this example was appropriate and Terra's rejection was too restrictive; it is not evidence of Terra being more accurate. Keep the later human adjudication separate from the original frozen reference labels, and do not invent an updated accuracy score.

The v1 schema and consistency check group static and animated posters under `poster_only`; that distinction is too coarse for the next trial. This documentation records the accepted policy, not a changed model prompt or automatic gate. Before further automated screening, distinguish useful animated promotion from low-value static repetition and retain exact source, schedule, audio, readability and content checks. Automatic publication remains off. No new paid requests were needed for this adjudication.

## Manifest contract

Parent-supplied normalized file: `C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/INPUT_WORKER.json` (the initial request called it `INPUT.json`). The worker takes the path explicitly and has no hardcoded source cohort. The parent runs known cases before unseen cases with frozen prompts/evidence.

```json
{
  "clips": [{
    "id": "clip_01",
    "videoPath": "C:/absolute/local/source.mp4",
    "sourcePostId": "123456",
    "sourceVideoId": "789012",
    "caption": "Exact retained caption, treated as untrusted evidence.",
    "listingContext": {
      "title": "Listing title",
      "date": "2026-10-30",
      "time": "19:00",
      "venue": "Verified attendee venue",
      "sourceMatched": true,
      "notes": "Source evidence only. No expected decision or human labels."
    },
    "sourceAudio": true,
    "cohort": "parent-only metadata"
  }]
}
```

`sourceAudio` accepts `true`/`false`, `"present"`/`"absent"`, `null`/`"unknown"`, or `{ "expected": true|false|null }`. It describes what source retention evidence says to expect, independently of probing the local file. Unknown expectation, an unexpected track, or missing expected audio forces hold. Missing source IDs or malformed non-string/path-like IDs also forces hold. IDs must be ordinary bounded identifier strings; they are not sent to either assessment model. `sourceMatched` must be boolean or null. Its truth is supplied by the coordinator, not established by decoding or model confidence.

The parent can add metadata anywhere. Only the listed caption/context fields and normalized audio expectation enter evidence. `cohort`, expected answers, review labels, unknown fields and human-review data are excluded. Do not put labels inside caption, context notes, media or transcript: arbitrary prose cannot be reliably distinguished from authentic source evidence. `id` is a unique safe filename identifier (letters/digits/underscore/hyphen, 1–64 chars). Use stable opaque IDs rather than expected-answer labels. Local media/manifest paths stay out of API inputs and logs. Text URLs (including signed URLs), recognizable local paths and credential patterns are redacted. This is not a guarantee that an arbitrary secret embedded in a photograph or unconstrained prose can be detected; select source evidence accordingly.

## Commands

Use separate, absolute output directories for each phase. Preserve and reuse the SAME transcription/comparison output directory for resume/cache reuse. The output directory must not contain its input manifest/media/artifact. All worker writes are inside the explicit output directory. There is no source-file deletion. Symlink/junction output paths, traversal, network/UNC video paths and media protocols are rejected.

```powershell
$worker = 'C:/Users/craig/.codex/worktrees/video-model-comparison/gathr-apps-script/functions/scripts/video-evidence-worker.mjs'
$experiment = 'C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison'

node $worker prepare --manifest "$experiment/INPUT_WORKER.json" --out "$experiment/prepared-v1"

# These are dry runs; no key and no HTTP requests are used.
node $worker transcribe --prepared "$experiment/prepared-v1/prepared.json" --out "$experiment/transcription-v1" --dry-run
node $worker compare --prepared "$experiment/prepared-v1/prepared.json" --out "$experiment/comparison-v1" --dry-run

# Parent-only paid execution, after source and code review, with the existing key supplied in memory.
node $worker transcribe --prepared "$experiment/prepared-v1/prepared.json" --out "$experiment/transcription-v1" --execute
node $worker compare --prepared "$experiment/prepared-v1/prepared.json" --transcripts "$experiment/transcription-v1/transcripts.json" --out "$experiment/comparison-with-transcripts-v1" --execute
```

Omitting `--execute` defaults to dry run for the paid phases. No `.env`, Firebase secret, base-URL environment override or credential file is loaded. The parent can instead import `prepare`, `transcribe` and `compare`; the latter two accept `{execute: true, apiKey}` without writing the key. `fetchImpl` is injectable for offline testing. A comparison output is bound to its prepared digest, transcript artifact digest, prompt, schema and models: the dry-run example without transcripts intentionally uses a different comparison output from the final transcript-backed run. To dry-run the final exact cohort, supply `--transcripts` and the final output directory after transcription is available.

## Evidence preparation

At most 12 clips per invocation. Each source must be a regular local `.mp4` with an initial `ftyp` box, at most **50,000,000 bytes** and **60 seconds**, one video stream and at most one audio stream. Video dimensions are bounded to 4096 per edge / 16,777,216 pixels; decoded frames to 7,201 and frame rate to approximately 120 fps. Unusual/offset timelines, multiple audio tracks, corrupt media and incomplete duration/decode checks fail closed rather than silently trimming or choosing an unknown track. Completeness here means internal container/timeline/decoder consistency of the supplied file; it cannot prove that upstream acquisition retained the original full source.

The worker probes all frames and performs a complete video decode with decoder errors fatal. MP4 demuxing is forced, only the local `file` protocol is enabled, and external data references are disabled. It samples the first and final decoded frames, the first decoded frame at/after each regular 2-second target, and scene changes crossing ffmpeg's `scene > 0.3` threshold. Equal selected frame timestamps are deduplicated. Regular samples and endpoints have priority; remaining scene capacity is distributed across the clip, with at most 48 JPEGs. Scene detection uses changes in image content/luminance; it does not guarantee detection of every meaningful semantic change. Subtle text changes and brief events can be missed. No trimming or seeking is performed.

Frames preserve display aspect ratio to pixel rounding, at most 640 pixels on the long edge. Each frame records its original probe PTS string, ffmpeg showinfo timestamp, relative timestamp, original decoded index, selection reasons, dimensions, byte count and SHA256. `prepared.json` includes source video hash/size, final-frame duration, all sample gaps, maximum gap, dropped scene count and coverage limitations. It omits source paths and parent labels. There is no contact sheet; individually timestamped JPEGs remain available for independent inspection.

If one audio stream exists, the worker decodes the complete track to mono 16 kHz PCM WAV, verifies duration against the source audio track, records hash/size/start offset/duration, and checks its coverage against the video timeline. No-audio metadata is explicitly `not_present_metadata_only`, never `transcriptionComplete`. Expected-audio mismatches remain visible and held. WAV is bounded to 25,000,000 bytes, JPEG to 1,000,000 bytes. A source hash is checked again after extraction. Failed preparation leaves its partial evidence in its output directory; inspect it and use a new preparation output rather than overwrite files.

## Transcription and comparison

Transcription uses only the official `https://api.openai.com/v1/audio/transcriptions` endpoint, `gpt-transcribe`, anonymous filename `audio.wav`, and file+model fields. No language guess, response-format option, prompt or timestamp option is sent. Its cache key includes exact WAV SHA, model, settings and worker version. At most 12 attempted transcriptions per invocation, sequentially; identical audio within the output cache shares one call. The transcript records safe request/client IDs, returned model if available, actual usage if supplied, elapsed time and limitations. Missing usage is `null`. There are no invented word timestamps. Empty speech output is held for audio review; music/no speech never establishes safe audio or music rights. A nonempty transcript is still only speech-to-text, not full semantic listening or a rights/safety assessment.

Comparison uses only the official `https://api.openai.com/v1/responses` endpoint and exactly `gpt-6-luna` and `gpt-6.1-terra`. Neither assessment model receives video/audio directly. Both receive the identical ordered JPEG bytes, frame timestamp labels, caption, whitelisted listing context, transcript, coverage metadata, system instructions and strict JSON schema, with `reasoning.effort=low`, `max_output_tokens=2500`, `store=false`. All clips/assets/transcript bindings/request bodies are preflighted before the first paid comparison. There are at most 24 attempted comparisons per invocation, sequentially; there are no hidden retries or generic URL fetches.

`evidence/<id>.json` is the canonical shared evidence plus its digest, proving model-independent parity. Each call's digest additionally binds the exact full request body including its model, instructions, schema, frame bytes, transcript and metadata. Prompt/clip/frame/transcript/model changes invalidate that call cache. Model content lives only in the user evidence role and cannot alter the system instructions. Instruction-injection resistance is a prompt boundary, not a claim that an LLM can never follow malicious media instructions; deterministic holds, strict schema checks and absent tools/publication capability remain independent.

Assessment fields: `contentDecision`, `listingAssociation`, `motionValue`, `scheduleConflicts[]` (visible/spoken, date/time/venue, evidence, listing value, timestamp), `audioCoverageLimitations[]`, short evidence `reasoning`, and `recommendation`. Visible conflict times must equal a supplied frame's relative timestamp. Spoken conflict timestamps must be null. Unknown fields, bad enums, missing fields, invented timestamps, refusal/incomplete results and malformed JSON cannot produce accepted assessments.

Postchecks force hold for unconfirmed/missing/malformed source binding, incomplete listing context, missing required visual/audio/transcript evidence, unknown/mismatched source-audio expectation, empty transcript, any schedule/venue conflict, uncertain association/content/motion, or inconsistent recommendation. A recommendation always remains `manualReviewRequired: true` and `publicationAuthorized: false`. Sampled-still coverage and speech-only limitations persist even when required evidence is present. Human review is an independent null field; save the coordinator's eventual review separately rather than treating these records as old pilot approvals.

## Durable calls, resume and costs

Before transmission, the worker exclusively creates and fsyncs `calls/<kind>-<digest>.intent.json`. Afterward it exclusively creates and fsyncs an integrity-checked result cache. Requests use a unique client request ID, reject redirects, and time out after 180 seconds. Network/parse/body failures are marked `outcome_uncertain_no_retry`; HTTP and incomplete responses are also cached and stop execution. An intent without a result blocks further requests. A saved failed result stops on rerun without requesting again. A completed cached response can be read without an API key. Invalid completed model JSON is cached and reported as held, never re-requested. Prior successful calls can resume after interruption; final transcript/report files are immutable and per-call/per-assessment evidence remains available if execution stops early.

Do not delete, edit, relocate selectively or bypass these files to retry uncertain billing. The coordinator must inspect request IDs and external billing/result evidence before deciding on a new attempt. The no-repeat guarantee applies to retained ledgers in the same output directory; a brand-new output directory or altered input represents a new experiment and can issue new billed requests. Directory and file checks/exclusive creation protect routine concurrent invocations, but no claim is made against a malicious local process replacing filesystem entries during execution.

The report retains actual returned token usage and labels estimates using **October 30, 2026 standard token price assumptions**, USD per million: Luna input 0.10 / cached input 0.01 / output 0.50; Terra input 1.00 / cached input 0.05 / output 5.00. Estimates are not invoices, do not imply real requests occurred, and exclude unknown regional/service/cache-write adjustments. Missing token counts or cached-token breakdown returns null rather than inventing usage. Cached worker reuse reports the original call's usage with `cacheHit: true`; do not sum it again as new spend. Transcription usage is retained when returned, without inventing a token or invoice cost. Repeated identical audio entries can reference the same request digest; deduplicate that digest when totaling historical costs.

The API shape and model boundaries were checked against official documentation: [transcription request and response](https://developers.openai.com/api/docs/guides/speech-to-text), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Luna modalities/pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [Terra modalities/pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra). Live model access, account permissions, billing and response behavior remain unverified until the coordinator's authorized calls.

## Focused offline verification

```powershell
node --check functions/scripts/video-evidence-worker.mjs
node --test functions/scripts/video-evidence-worker.test.mjs
git diff --check
```

Tests generate synthetic MP4s, extract real frames/audio with installed ffmpeg/ffprobe, and mock every HTTP call. Real global fetch is blocked for the suite. Cases cover paired exact request parity, scene/endpoints/caps, strict manifest bounds, source-audio mismatch, damaged/long/oversized media, output containment/junctions, source preservation, label/path/secret exclusion, injection role separation, missing audio/transcripts, schedule/timestamp/schema conflicts, transcript binding and image-byte tampering, dry-run zero network, durable intent before fetch, completed/failed/orphan cache behavior and honest cost arithmetic. These do not measure model quality, real clip relevance, source authenticity, semantic speech completeness, audio rights, continuous motion or publication readiness.

Final focused run: **17/17 tests passed**. Read-only validation of `INPUT_WORKER.json` accepted its 10 entries (7 expect audio, 3 expect no audio); no real media preparation or API call was performed by this worker task.
