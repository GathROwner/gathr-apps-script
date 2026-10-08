import fs from 'node:fs';
import path from 'node:path';
import { parsePostData } from '../lib/parsing/postParser.js';
import {
  appendJsonlRecord,
  getCaseSourceIdentity,
  loadAndValidateManifest,
  readImagesAsDataUrls,
  selectCases,
  selectImagesForCase,
  selectVariants,
} from './stage1-evaluation-lib.mjs';

function parseArgs(argv) {
  const options = {
    manifest: null,
    results: [],
    output: null,
    caseIds: null,
    variantIds: null,
    imageSet: null,
    execute: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    const separator = arg.indexOf('=');
    const flag = separator >= 0 ? arg.slice(0, separator) : arg;
    const value = separator >= 0 ? arg.slice(separator + 1) : argv[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--manifest') options.manifest = value;
    else if (flag === '--results') options.results = value.split(',').map((item) => item.trim()).filter(Boolean);
    else if (flag === '--output') options.output = value;
    else if (flag === '--case-ids') options.caseIds = value.split(',').map((item) => item.trim());
    else if (flag === '--variants') options.variantIds = value.split(',').map((item) => item.trim());
    else if (flag === '--image-set') options.imageSet = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  console.log(`No-write Stage 1 candidate downstream replay

Usage:
  node scripts/stage1-candidate-downstream-replay.mjs --execute [options]

Required options:
  --manifest PATH              Frozen Stage 1 source manifest
  --results PATH[,PATH...]     Stage 1 evaluation JSONL result files
  --output PATH                Append replay snapshots to this JSONL file
  --case-ids ID,...            Explicit bounded list of cases to replay
  --variants ID,...            Explicit evaluation variant IDs to replay
  --image-set initial|full     Select the matching Stage 1 result image set
  --execute                    Make downstream Stage 2-5 API calls

Safety requirements:
  DRY_RUN=true and PARSER_DRY_RUN_LOCAL_IMAGES=true must be set.
  IMAGE_UPLOAD_URL and IMAGE_DELETE_URL must be unset. Text-only cases bypass Luna canary selection.
  The Stage 1 validation override is accepted by parsePostData only under these guards.
  Image cases select Luna through one exact canary post ID, disable legacy fallback, and use the full saved gallery.
  Text-only cases retain GPT-5.2 at Stage 3 with its default reasoning settings.
  Other downstream stages use Mini / Nano / Nano; Stage 5 batches 9 items.
  No database write path is used by this replay script.`);
}

function readJsonlRecords(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Result file not found: ${filePath}`);
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${index + 1} of ${filePath}: ${error.message}`);
      }
    });
}

function assertOutputOutsideSourceRoot(outputPath, sourceRoot) {
  const relative = path.relative(sourceRoot, outputPath);
  if (relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('Choose an output file outside the manifest sourceRoot.');
  }
}

function assertSafeReplayEnvironment() {
  if (process.env.DRY_RUN !== 'true' || process.env.PARSER_DRY_RUN_LOCAL_IMAGES !== 'true') {
    throw new Error('Set DRY_RUN=true and PARSER_DRY_RUN_LOCAL_IMAGES=true before replay.');
  }
  if (process.env.IMAGE_UPLOAD_URL || process.env.IMAGE_DELETE_URL) {
    throw new Error('Unset IMAGE_UPLOAD_URL and IMAGE_DELETE_URL to prevent image writes/deletes.');
  }
  if (!String(process.env.OPENAI_API_KEY || '').trim()) {
    throw new Error('OPENAI_API_KEY is required for the requested Stage 2-5 calls.');
  }
}

async function withTemporaryEnvironment(overrides, worker) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = String(value);
  }
  try {
    return await worker();
  } finally {
    for (const [key, value] of previous) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function validateOptions(options) {
  if (options.help) return;
  if (!options.execute) throw new Error('Pass --execute to authorize downstream model calls.');
  if (!options.manifest || options.results.length === 0 || !options.output) {
    throw new Error('--manifest, --results, and --output are required.');
  }
  if (!Array.isArray(options.caseIds) || options.caseIds.length === 0) {
    throw new Error('--case-ids is required so replay stays explicitly scoped.');
  }
  if (options.caseIds.length > 50) throw new Error('Select no more than 50 case IDs per replay run.');
  if (!Array.isArray(options.variantIds) || options.variantIds.length === 0) {
    throw new Error('--variants is required.');
  }
  if (!['initial', 'full'].includes(options.imageSet)) {
    throw new Error('--image-set must be initial or full.');
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  validateOptions(options);
  assertSafeReplayEnvironment();

  const outputPath = path.resolve(options.output);
  const { manifest, sourceRoot } = loadAndValidateManifest(options.manifest);
  assertOutputOutsideSourceRoot(outputPath, sourceRoot);
  const cases = selectCases(manifest, options.caseIds);
  const variants = selectVariants(options.variantIds);
  const variantIds = new Set(variants.map((variant) => variant.id));
  const inputRecords = options.results.flatMap((filePath) => readJsonlRecords(path.resolve(filePath)));
  const resultByKey = new Map();
  for (const record of inputRecords) {
    if (record.recordType !== 'case_result' || record.imageSet !== options.imageSet) continue;
    if (!variantIds.has(record.variantId) || !cases.some((item) => item.caseId === record.caseId)) continue;
    resultByKey.set(`${record.caseId}\u0000${record.variantId}`, record);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const completedKeys = new Set(readJsonlRecordsIfPresent(outputPath)
    .filter((record) => record.recordType === 'downstream_replay' && record.status === 'completed')
    .map((record) => `${record.caseId}\u0000${record.variantId}\u0000${record.imageSet}`));

  let completedCount = 0;
  let rejectedCount = 0;
  let missingResultCount = 0;
  let errorCount = 0;
  for (const caseData of cases) {
    for (const variant of variants) {
      const outputKey = `${caseData.caseId}\u0000${variant.id}\u0000${options.imageSet}`;
      if (completedKeys.has(outputKey)) continue;
      const result = resultByKey.get(`${caseData.caseId}\u0000${variant.id}`);
      const baseRecord = {
        recordType: 'downstream_replay',
        recordVersion: 1,
        completedAt: new Date().toISOString(),
        caseId: caseData.caseId,
        sourceIdentity: getCaseSourceIdentity(caseData),
        fileId: caseData.fileId || caseData.sourceFileId || null,
        postId: caseData.postId || null,
        sourceRow: caseData.sourceRow,
        variantId: variant.id,
        imageSet: options.imageSet,
        model: variant.model,
      };

      if (!result) {
        appendJsonlRecord(outputPath, { ...baseRecord, status: 'missing_stage1_result' });
        missingResultCount++;
        continue;
      }
      if (result.status !== 'completed' || !result.finalNormalizedResult) {
        appendJsonlRecord(outputPath, {
          ...baseRecord,
          status: 'stage1_inconclusive',
          stage1Status: result.status,
        });
        errorCount++;
        continue;
      }
      if (!result.finalNormalizedResult.hasValidContent ||
          result.finalNormalizedResult.validationDecision === 'VALIDATION_FAILED') {
        appendJsonlRecord(outputPath, {
          ...baseRecord,
          status: 'stage1_rejected',
          stage1Decision: 'reject',
          stage1DecisionAudit: result.stage1DecisionAudit || null,
        });
        rejectedCount++;
        continue;
      }

      const stage1Images = selectImagesForCase(caseData, options.imageSet);
      const requestedIndexes = result.selectedSourceGalleryIndexes || stage1Images.map((image) => image.sourceGalleryIndex);
      const requestedIndexSet = new Set(requestedIndexes);
      const selectedStage1Images = stage1Images.filter((image) => requestedIndexSet.has(image.sourceGalleryIndex));
      if (selectedStage1Images.length !== requestedIndexes.length || selectedStage1Images.length !== result.selectedImageCount) {
        throw new Error(`Selected image list drifted for ${caseData.caseId}/${variant.id}.`);
      }
      const replayGallery = selectImagesForCase(caseData, 'full');
      const mediaUrls = readImagesAsDataUrls(replayGallery, sourceRoot);
      const postId = String(caseData.postId || caseData.caseId);
      const exactImageCanary = replayGallery.length > 0;
      const canaryEnvironment = exactImageCanary
        ? {
            LUNA_CANARY_ENABLED: 'true',
            LUNA_CANARY_POST_IDS: postId,
            LUNA_CANARY_STAGE3_ONLY: 'true',
            LUNA_CANARY_STAGE3_REASONING_EFFORT: 'high',
            LUNA_CANARY_LEGACY_FALLBACK_ENABLED: 'false',
          }
        : {
            LUNA_CANARY_ENABLED: 'false',
            LUNA_CANARY_POST_IDS: '',
            LUNA_CANARY_STAGE3_ONLY: 'true',
            LUNA_CANARY_STAGE3_REASONING_EFFORT: 'high',
            LUNA_CANARY_LEGACY_FALLBACK_ENABLED: 'false',
          };
      const stage3Model = exactImageCanary ? 'gpt-6-luna' : 'gpt-5.2';
      const stage3ReasoningEffort = exactImageCanary
        ? 'high'
        : (process.env.STAGE3_COMPARISON_REASONING_EFFORT || 'medium');
      const input = {
        combinedText: caseData.caption,
        mediaUrls,
        sharedPostThumbnails: [],
        userName: caseData.venue || 'Unknown venue',
        pageName: caseData.venue || 'Unknown venue',
        timestamp: caseData.postedAt || '',
        facebookUrl: caseData.sourceEvidence?.url || '',
        extractedData: {
          id: postId,
          postId,
        },
      };
      const stageSnapshots = [];
      const skipReasons = [];
      const usage = [];
      let finalEvents = [];
      let replayError = null;
      try {
        finalEvents = await withTemporaryEnvironment(canaryEnvironment, () => parsePostData(input, {}, {
          gptModelFast: 'gpt-5-mini',
          gptModelReasoning: stage3Model,
          stage2ModelOverride: 'gpt-5-mini',
          stage3ModelOverride: stage3Model,
          ...(exactImageCanary ? {
            stage3ReasoningEffort: 'high',
            stage3ImageDetail: 'original',
            lunaCalendarLiteralSourcePrompt: true,
          } : {}),
          stage4ModelOverride: 'gpt-5-nano',
          stage5ModelOverride: 'gpt-5-nano',
          stage5BatchSize: 9,
          lunaCanaryBypass: !exactImageCanary,
          stage1EvaluationValidationOverride: result.finalNormalizedResult,
          stageArtifactsHandler: (snapshot) => stageSnapshots.push(snapshot),
          skipReasonHandler: (skipReason) => skipReasons.push(skipReason),
          gptUsageHandler: (usageRecord) => usage.push(usageRecord),
        }));
      } catch (error) {
        replayError = error instanceof Error ? error.message : String(error);
      }

      const routeSnapshot = [...stageSnapshots].reverse().find((snapshot) => snapshot.stage2Routing);
      const routeSnapshotData = routeSnapshot ? {
        resolvedContentType: routeSnapshot.contentType || null,
        stage1Validation: routeSnapshot.stage1Validation,
        stage2Classification: routeSnapshot.stage2Classification,
        stage2Routing: routeSnapshot.stage2Routing,
        stage2RoutingEnvironment: routeSnapshot.stage2RoutingEnvironment || null,
        imageFrameManifest: routeSnapshot.imageFrameManifest || [],
        lunaFullImageReady: Boolean(routeSnapshot.lunaFullImageReady),
        lunaDenseFrameIndices: routeSnapshot.lunaDenseFrameIndices || [],
      } : null;
      const status = replayError
        ? 'request_error'
        : routeSnapshotData
          ? 'completed'
          : 'no_stage2_route';
      appendJsonlRecord(outputPath, {
        ...baseRecord,
        status,
        stage1Decision: 'accept',
        stage1DecisionAudit: result.stage1DecisionAudit || null,
        downstreamModelPlan: {
          stage2: 'gpt-5-mini',
          stage3: stage3Model,
          stage3ReasoningEffort,
          stage3ImageDetail: exactImageCanary ? 'original' : null,
          stage4: 'gpt-5-nano',
          stage5: 'gpt-5-nano',
          stage5BatchSize: 9,
          replayGalleryImageCount: replayGallery.length,
          exactImageCanary,
          lunaCanaryLegacyFallbackEnabled: false,
        },
        routeSnapshot: routeSnapshotData,
        stage3Items: [...stageSnapshots].reverse().find((snapshot) => Array.isArray(snapshot.stage3Items))?.stage3Items || [],
        stage4Items: [...stageSnapshots].reverse().find((snapshot) => Array.isArray(snapshot.stage4Items))?.stage4Items || [],
        finalEvents,
        skipReasons,
        usage,
        actualModelUsage: [...new Set(usage.map((entry) => `${entry.stage || 'unknown'}:${entry.model || 'unknown'}`))],
        error: replayError,
      });
      if (status === 'completed') completedCount++;
      else errorCount++;
    }
  }

  console.log(JSON.stringify({
    recordType: 'downstream_replay_summary',
    selectedCaseCount: cases.length,
    selectedVariantIds: variants.map((variant) => variant.id),
    imageSet: options.imageSet,
    completedCount,
    stage1RejectedCount: rejectedCount,
    missingStage1ResultCount: missingResultCount,
      errorCount,
      outputPath,
      noWriteGuards: {
      dryRun: process.env.DRY_RUN,
      localImages: process.env.PARSER_DRY_RUN_LOCAL_IMAGES,
      imageUploadUrlUnset: !process.env.IMAGE_UPLOAD_URL,
      imageDeleteUrlUnset: !process.env.IMAGE_DELETE_URL,
      imageCasesUseExactCanaryPostIds: true,
      textOnlyCasesBypassImageCanary: true,
      lunaCanaryLegacyFallbackDisabledForReplay: true,
    },
  }));
}

function readJsonlRecordsIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return readJsonlRecords(filePath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
