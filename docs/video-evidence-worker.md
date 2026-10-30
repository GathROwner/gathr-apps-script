# Local video evidence comparison worker

Standalone manual-shadow experiment in `functions/scripts/video-evidence-worker.mjs`. It does not integrate with the parser, read credentials from files, fetch media, publish anything, write Firestore/Storage, or create legacy pilot approval records. The coordinating chat owns source acquisition/binding, auth, paid execution and independent human review. This implementation was developed and tested using only synthetic local media and mocked HTTP responses; no live API compatibility or real-source accuracy is claimed.

Requires the existing Node 22 runtime and installed `ffmpeg`/`ffprobe` on PATH. No dependency or package changes. Validated locally with Node's test runner and ffmpeg 8.1.1. Run from this worktree, not the saved project checkout.

## Accepted animation preference, October 30

Craig watched Royalty Crossing's complete five-second Halloween Artisan Market clip (source post `1621083896343590`, video `1582649633172659`) and explicitly requested it because its animation adds real value over a static image. That human decision supersedes the earlier visual-only low-value rejection. Useful animated posters and event promotions qualify; camera footage of a performance or activity is not required. Evaluate engagement, legibility and relevance rather than rejecting a clip merely because its starting material is a poster.

Preserve the original experiment's requests and responses. Under Craig's clarified preference, Luna's recommendation on this example was appropriate and Terra's rejection was too restrictive; it is not evidence of Terra being more accurate. Keep the later human adjudication separate from the original frozen reference labels, and do not invent an updated accuracy score.

The v1 schema and consistency check grouped static and animated posters under `poster_only`; that distinction was too coarse. The v2 implementation below now distinguishes useful animated promotion from low-value static repetition and retains source, schedule, audio, readability and content checks. Automatic publication remains off. No new paid requests were needed for this adjudication. The specific human example above is documentation only: no source IDs, clip IDs, expected answers or human adjudications are embedded in worker prompts or routing code.

## V2 behavior and artifact compatibility

`VERSION=video-evidence-v2`; `ROUTING_VERSION=luna-first-blind-terra-v1`. Preserve both accepted predecessor commits (`cac443c9`, `002e5aef`) and all original v1 experiment artifacts. The worker rejects v1 prepared evidence and directly supplied v1 transcript artifacts. Regenerate frames/audio in a new output directory: clips at most 12 seconds now use regular 0.5-second targets; longer clips retain 2-second targets. There is no relabeling or in-place artifact upgrade.

`rebind-transcripts` is an explicit **offline** migration into a new output directory. It verifies the prior artifact digest, matching clip ID, exact newly extracted audio SHA, transcript text hash, completed `gpt-transcribe` call, and request digest proving the same file+model-only settings. V1's settings are defined by its recorded worker version and digest; v2 records them explicitly. Native v2 transcripts and already rebound transcripts can also be rebound to another v2 prepared artifact after the same checks. It preserves original call provenance and binds a new transcript artifact to the new prepared digest, with zero requests. Any audio/model/settings mismatch fails closed rather than silently transcribing again. No-audio entries remain metadata only. Rebinding does not renew semantic audio review or source approval.

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

Use separate, absolute output directories for each phase. Preserve and reuse the SAME triage output directory for resume/cache reuse. The output directory must not contain its input manifest/media/artifact. All worker writes are inside the explicit output directory. There is no source-file deletion. Symlink/junction output paths, traversal, network/UNC video paths and media protocols are rejected. The coordinator selects a known-cohort manifest before running the unseen cohort; cohort labels never become model context. Use distinct prepared/transcript/triage directories per cohort and keep prompts/schema frozen.

```powershell
$worker = 'C:/Users/craig/.codex/worktrees/video-model-comparison/gathr-apps-script/functions/scripts/video-evidence-worker.mjs'
$experiment = 'C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison'
$trial = "$experiment/v2-trial"

# Parent selects the intended cohort manifest; this example points to the full retained input.
node $worker prepare --manifest "$experiment/INPUT_WORKER.json" --out "$trial/prepared"

# Offline: reuse v1 transcripts only after exact audio/model/settings verification.
node $worker rebind-transcripts --prepared "$trial/prepared/prepared.json" --transcripts "$experiment/transcripts/transcripts.json" --out "$trial/transcripts"

# Dry run: no key required and no HTTP request, even if a key is present.
node $worker triage --prepared "$trial/prepared/prepared.json" --transcripts "$trial/transcripts/transcripts.json" --out "$trial/triage" --dry-run

# Parent-only paid execution after independent review, with the existing key supplied in memory.
node $worker triage --prepared "$trial/prepared/prepared.json" --transcripts "$trial/transcripts/transcripts.json" --out "$trial/triage" --execute
```

Omitting `--execute` defaults to dry run for `transcribe`, `compare` and `triage`. Preparation and rebinding are offline and reject `--execute`. No `.env`, Firebase secret, base-URL environment override or credential file is loaded. The parent can import `prepare`, `rebindTranscripts`, `transcribe`, `compare` and `triage`; paid phases accept `{execute: true, apiKey}` without writing the key. `fetchImpl` is injectable for offline testing. `canonical`, `sha256`, `buildSharedEvidence` and `buildRequest` remain exported for independent parity verification. `compare` still runs both models for diagnostic paired testing in a separate output directory; it is not automatically called by triage. If new transcription is necessary, the parent must explicitly invoke `transcribe --execute` in a new transcription output directory after reviewing the mismatch.

## Evidence preparation

At most 12 clips per invocation. Each source must be a regular local `.mp4` with an initial `ftyp` box, at most **50,000,000 bytes** and **60 seconds**, one video stream and at most one audio stream. Video dimensions are bounded to 4096 per edge / 16,777,216 pixels; decoded frames to 7,201 and frame rate to approximately 120 fps. Unusual/offset timelines, multiple audio tracks, corrupt media and incomplete duration/decode checks fail closed rather than silently trimming or choosing an unknown track. Completeness here means internal container/timeline/decoder consistency of the supplied file; it cannot prove that upstream acquisition retained the original full source.

The worker probes all frames and performs a complete video decode with decoder errors fatal. MP4 demuxing is forced, only the local `file` protocol is enabled, and external data references are disabled. It samples the first and final decoded frames, the first decoded frame at/after each regular **0.5-second target for clips at most 12 seconds**, otherwise each 2-second target, plus scene changes crossing ffmpeg's `scene > 0.3` threshold. Equal selected frame timestamps are deduplicated. Regular samples and endpoints have priority; remaining scene capacity is distributed across the clip, with at most 48 JPEGs. The chosen regular interval and actual gaps are explicit in prepared metadata and the shared model evidence. Scene detection and denser sampling do not prove every meaningful animation or text change was captured. No trimming or seeking is performed.

Frames preserve display aspect ratio to pixel rounding, at most 640 pixels on the long edge. Each frame records its original probe PTS string, ffmpeg showinfo timestamp, relative timestamp, original decoded index, selection reasons, dimensions, byte count and SHA256. `prepared.json` includes source video hash/size, final-frame duration, all sample gaps, maximum gap, dropped scene count and coverage limitations. It omits source paths and parent labels. There is no contact sheet; individually timestamped JPEGs remain available for independent inspection.

If one audio stream exists, the worker decodes the complete track to mono 16 kHz PCM WAV, verifies duration against the source audio track, records hash/size/start offset/duration, and checks its coverage against the video timeline. No-audio metadata is explicitly `not_present_metadata_only`, never `transcriptionComplete`. Expected-audio mismatches remain visible and held. WAV is bounded to 25,000,000 bytes, JPEG to 1,000,000 bytes. A source hash is checked again after extraction. Failed preparation leaves its partial evidence in its output directory; inspect it and use a new preparation output rather than overwrite files.

## Transcription and comparison

Transcription uses only the official `https://api.openai.com/v1/audio/transcriptions` endpoint, `gpt-transcribe`, anonymous filename `audio.wav`, and file+model fields. No language guess, response-format option, prompt or timestamp option is sent. Its cache key includes exact WAV SHA, model, settings and worker version. At most 12 attempted transcriptions per invocation, sequentially; identical audio within the output cache shares one call. The transcript records safe request/client IDs, returned model if available, actual usage if supplied, elapsed time and limitations. Missing usage is `null`. There are no invented word timestamps. Empty speech output is held for audio review; music/no speech never establishes safe audio or music rights. A nonempty transcript is still only speech-to-text, not full semantic listening or a rights/safety assessment.

Comparison uses only the official `https://api.openai.com/v1/responses` endpoint and exactly `gpt-6-luna` and `gpt-6.1-terra`. Neither assessment model receives video/audio directly. Both receive the identical ordered JPEG bytes, frame timestamp labels, caption, whitelisted listing context, transcript, coverage metadata, system instructions and strict JSON schema, with `reasoning.effort=low`, `max_output_tokens=2500`, `store=false`. All clips/assets/transcript bindings/request bodies are preflighted before the first paid comparison. There are at most 24 attempted comparisons per invocation, sequentially; there are no hidden retries or generic URL fetches.

`evidence/<id>.json` is the canonical shared evidence plus its digest, proving model-independent parity. Each call's digest additionally binds the exact full request body including its model, instructions, schema, frame bytes, transcript and metadata. Prompt/clip/frame/transcript/model changes invalidate that call cache. Model content lives only in the user evidence role and cannot alter the system instructions. Instruction-injection resistance is a prompt boundary, not a claim that an LLM can never follow malicious media instructions; deterministic holds, strict schema checks and absent tools/publication capability remain independent.

Assessment fields: `contentDecision`, `listingAssociation`, `motionValue`, `motionEvidence[]`, `scheduleConflicts[]` (visible/spoken, date/time/venue, evidence, listing value, timestamp), `audioCoverageLimitations[]`, short evidence `reasoning`, and `recommendation`. `motionValue` is `actual_experience`, `promotion`, `animated_promotion`, `static_poster`, `unrelated`, or `uncertain`. An animated promotion may be useful with static text/background and decorative or atmospheric animation; it does not need camera footage. It must cite a visible change between two distinct supplied timestamps using `motionEvidence: [{startTimestampSeconds,endTimestampSeconds,evidence}]`. The worker validates those references and a nonempty description, not the truth of the visual interpretation. Clear low-value unchanging/repeated posters can be rejected; unclear sampled motion stays uncertain/held. Visible conflict times must equal a supplied frame's relative timestamp; spoken timestamps must be null. Unknown fields, bad enums, missing fields, invented timestamps, refusal/incomplete results and malformed JSON cannot produce accepted assessments.

Postchecks force hold for unconfirmed/missing/malformed source binding, incomplete essential listing context, missing required visual/audio/transcript evidence, unknown/mismatched source-audio expectation, empty transcript, any schedule/venue conflict, uncertain association/content/motion, or inconsistent recommendation. A confident model rejection of unmatched content can reject when the independently supplied source binding is confirmed; a model never supplies missing binding from a title. Existing assessment postchecks retain `manualReviewRequired: true` and `publicationAuthorized: false`. Sampled-still and speech-only limitations persist even when required evidence is present. Human review stays separate and null; no old pilot approval record is synthesized.

## Luna-first routing

Triage calls Luna once per clip. On clips with hard evidence blockers it retains that assessment only for diagnostics, keeps terminal `hold`, and skips Terra regardless of model confidence. Terra cannot repair missing source facts, listing context or audio. Malformed files, hashes or prepared/transcript artifact binding fail preflight before any call.

With complete required evidence, a clean Luna recommend/reject receives no Terra call. Uncertain content, motion or listing association; a requested hold; a claimed schedule/venue conflict; or invalid/inconsistent completed output triggers at most one Terra call. Terra gets exactly the same images, evidence, system prompt and schema, with no Luna output or rationale. Transport failures, HTTP errors, incomplete/refused responses and unresolved intents are not semantic uncertainty and stop execution without fallback or retry.

Terra can resolve a genuinely uncertain or invalid Luna assessment for manual review. Any claimed schedule/venue conflict from a valid assessment remains held even if the other model does not repeat it. Opposing non-uncertain content, association, motion classifications or recommendations remain held; invalid/uncertain Terra also remains held. Hard blockers always win. Final decisions are only `hold`, `reject`, or `recommend_for_manual_review`; no publication/approval permission is created.

Each record includes route/reasons, hard blockers, Luna and optional Terra assessments, escalation reasons, terminal decision and hold reasons. Counts distinguish processed/unprocessed clips, blocked clips, Terra escalation/skips, and dry-run maximum planned calls. Bounds remain 12 clips, 24 total requests, sequential. These resource limits and sampling intervals are not quality thresholds or accuracy evidence for 50-video operation.

## Durable calls, resume and costs

Before transmission, the worker exclusively creates and fsyncs `calls/<kind>-<digest>.intent.json`. Afterward it exclusively creates and fsyncs an integrity-checked result cache. Requests use a unique client request ID, reject redirects, and time out after 180 seconds. Network/parse/body failures are marked `outcome_uncertain_no_retry`; HTTP and incomplete responses are also cached and stop execution. An intent without a result blocks further requests. A saved failed result stops on rerun without requesting again. A completed cached response can be read without an API key. Invalid completed model JSON is cached and reported as held, never re-requested. Prior successful calls can resume after interruption; final transcript/report files are immutable and per-call/per-assessment evidence remains available if execution stops early.

Do not delete, edit, relocate selectively or bypass these files to retry uncertain billing. The coordinator must inspect request IDs and external billing/result evidence before deciding on a new attempt. The no-repeat guarantee applies to retained ledgers in the same output directory; a brand-new output directory or altered input represents a new experiment and can issue new billed requests. Phase, prepared/transcript digests, prompt, schema, model set and routing version bind the output directory; changed routing cannot silently reuse an old summary. Directory and file checks/exclusive creation protect routine concurrent invocations, but no claim is made against a malicious local process replacing filesystem entries during execution.

Every triage invocation writes an immutable `invocations/<invocationId>.json`; imported `triage()` also returns that exact current report. `triage.json` records the first complete executed invocation; `triage.plan.json` records the first plan. They are not overwritten on resume. Use the current invocation report to see fresh new/reused counts. A call failure writes a stopped invocation and returns `executionStatus=stopped_on_call_error`; CLI exits nonzero. Previous completed calls are reused on resume, while saved failed/uncertain outcomes stop again without a request. Per-call records and original assessments remain immutable.

The report retains actual returned usage and labels estimates using **October 30, 2026 standard rate assumptions**, USD per million: Luna input 0.10 / cached input 0.01 / output 0.50; Terra input 1.00 / cached input 0.05 / output 5.00. V1 omitted cache-write charges; do not use its cost field as a correct total. V2 calculates ordinary input as `input_tokens - cached_tokens - cache_write_tokens`; cached reads, 30-minute writes and 12-hour writes are disjoint buckets. Writes cost 1.25× input for 30 minutes or 2.5× for 12 hours. Returned `cache_write_tokens_details.ttl_30m_tokens` and `ttl_12h_tokens` must sum to `cache_write_tokens` and are each counted once. If the breakdown is absent, this unchanged request's documented default 30-minute lifetime is an explicit assumption. Missing/negative/fractional/overlapping buckets, unknown lifetime, or unmodeled long-context usage return null. See [official cache accounting](https://developers.openai.com/api/docs/guides/prompt-caching).

`callSummary` separates attempted/new requests from reused records, by model, and reports actual returned token totals, estimated new-request cost, estimated cost of referenced historical calls and unknown-cost count. A reused cached result retains its original usage but adds no new request; sums deduplicate request digests. These are rate calculations, not invoices or a projected 50-video bill, and exclude unknown regional/service adjustments. Transcription costs are separate; rebinding makes zero transcription requests. Failures without usage retain unknown cost rather than an invented zero historical charge.

The API shape and model boundaries were checked against official documentation: [transcription request and response](https://developers.openai.com/api/docs/guides/speech-to-text), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Luna modalities/pricing](https://developers.openai.com/api/docs/models/gpt-6-luna), [Terra modalities/pricing](https://developers.openai.com/api/docs/models/gpt-6.1-terra). Live model access, account permissions, billing and response behavior remain unverified until the coordinator's authorized calls.

## Focused offline verification

```powershell
node --check functions/scripts/video-evidence-worker.mjs
node --test functions/scripts/video-evidence-worker.test.mjs
git diff --check
```

Tests generate synthetic MP4s, extract real frames/audio with installed ffmpeg/ffprobe, and mock every HTTP call. Real global fetch is blocked for the suite. Cases cover paired exact request parity, scene/endpoints/caps, strict manifest bounds, source-audio mismatch, damaged/long/oversized media, output containment/junctions, source preservation, label/path/secret exclusion, injection role separation, missing audio/transcripts, schedule/timestamp/schema conflicts, transcript binding and image-byte tampering, dry-run zero network, durable intent before fetch, completed/failed/orphan cache behavior and honest cost arithmetic. These do not measure model quality, real clip relevance, source authenticity, semantic speech completeness, audio rights, continuous motion or publication readiness.

V1 historical run: 17/17 tests passed; read-only manifest validation accepted 10 entries. Final v2 focused run: **29/29 tests passed**, adding short-clip density and interval boundaries, animated/static/uncertain distinctions, timestamped motion references, Luna-only routing, blind Terra parity, all hard-blocker skips (including missing/empty transcripts), conflicts/disagreements/invalid outputs, failure/refusal/no-fallback/resume behavior, immutable invocation summaries, explicit transcript migration and chained reuse, corrected cache-write buckets, and preservation of actual TTL usage through response sanitization into the saved cost report. V2 development does not read or modify the parent's private trial artifacts or run real clips/API requests. Model quality and real animation interpretation still require the coordinator's independent review and small authorized trial.
