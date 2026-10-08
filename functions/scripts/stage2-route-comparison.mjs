import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compareStage2RouteArms } from '../lib/parsing/stage2Routing.js';
import { appendJsonlRecord, getCaseSourceIdentity, loadAndValidateManifest } from './stage1-evaluation-lib.mjs';

function parseArgs(argv) {
  const options = { manifest: null, inputs: [], output: null, baselineVariant: null, candidateVariant: null, environmentPath: null, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    const separator = arg.indexOf('=');
    const flag = separator >= 0 ? arg.slice(0, separator) : arg;
    const value = separator >= 0 ? arg.slice(separator + 1) : argv[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--manifest') options.manifest = value;
    else if (flag === '--input') options.inputs.push(...value.split(',').map((item) => item.trim()).filter(Boolean));
    else if (flag === '--output') options.output = value;
    else if (flag === '--baseline-variant') options.baselineVariant = value;
    else if (flag === '--candidate-variant') options.candidateVariant = value;
    else if (flag === '--environment') options.environmentPath = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

function printHelp() {
  console.log(`Offline Stage 2 route comparison

Usage:
  node scripts/stage2-route-comparison.mjs [options]

Required:
  --manifest PATH                   Frozen source manifest for caption lookup
  --input PATH[,PATH...]            Downstream replay JSONL files
  --output PATH                     JSONL comparison report destination
  --baseline-variant ID             Stage 1 baseline arm, e.g. mini-current
  --candidate-variant ID            Stage 1 candidate arm, e.g. luna-compact-v2

Optional:
  --environment PATH                JSON object with Stage 2 route environment values

The report calls the production resolveStage2ScoreRouting and
selectLunaDenseFrameIndices implementations. It makes no model or network calls.`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Input not found: ${filePath}`);
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

function actualDecisionMatchesSnapshot(result, snapshot) {
  if (!snapshot?.stage2Routing) return false;
  return isDeepStrictEqual(result.routing, snapshot.stage2Routing) &&
    result.resolvedContentType === snapshot.resolvedContentType;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  if (!options.manifest || options.inputs.length === 0 || !options.output ||
      !options.baselineVariant || !options.candidateVariant) {
    throw new Error('--manifest, --input, --output, --baseline-variant, and --candidate-variant are required.');
  }

  const { manifest, sourceRoot } = loadAndValidateManifest(options.manifest);
  const outputPath = path.resolve(options.output);
  const relativeOutput = path.relative(sourceRoot, outputPath);
  if (relativeOutput === '' || (!path.isAbsolute(relativeOutput) && relativeOutput !== '..' && !relativeOutput.startsWith(`..${path.sep}`))) {
    throw new Error('Choose an output file outside the manifest sourceRoot.');
  }
  const caseByIdentity = new Map();
  for (const item of manifest.cases) {
    caseByIdentity.set(getCaseSourceIdentity(item), item);
    caseByIdentity.set(item.caseId, item);
  }
  const records = options.inputs.flatMap((input) => readJsonl(path.resolve(input)));
  const pairs = new Map();
  let invalidSnapshotCount = 0;
  for (const record of records) {
    if (record.recordType !== 'downstream_replay' || record.status !== 'completed' || !record.routeSnapshot) continue;
    if (![options.baselineVariant, options.candidateVariant].includes(record.variantId)) continue;
    const key = `${record.sourceIdentity || record.caseId}\u0000${record.imageSet || ''}`;
    const pair = pairs.get(key) || { imageSet: record.imageSet };
    const side = record.variantId === options.baselineVariant ? 'baseline' : 'candidate';
    if (pair[side]) throw new Error(`Duplicate ${side} replay for ${record.sourceIdentity || record.caseId}.`);
    const snapshot = record.routeSnapshot;
    if (!snapshot.stage1Validation || !snapshot.stage2Classification || !snapshot.stage2Routing) {
      invalidSnapshotCount++;
      continue;
    }
    const identity = record.sourceIdentity || record.caseId;
    const caseData = caseByIdentity.get(identity) || caseByIdentity.get(record.caseId);
    if (!caseData) throw new Error(`Manifest has no source record for ${identity}.`);
    pair[side] = {
      record,
      snapshot,
      combinedText: caseData.caption || '',
    };
    pairs.set(key, pair);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  let comparedCount = 0;
  let changedRouteCount = 0;
  let changedDenseFrameCount = 0;
  let missingBaselineCount = 0;
  let missingCandidateCount = 0;
  const overrides = options.environmentPath
    ? JSON.parse(fs.readFileSync(path.resolve(options.environmentPath), 'utf8'))
    : null;

  for (const [key, pair] of pairs) {
    if (!pair.baseline) {
      missingBaselineCount++;
      continue;
    }
    if (!pair.candidate) {
      missingCandidateCount++;
      continue;
    }
    const sharedText = pair.candidate.combinedText || pair.baseline.combinedText;
    const environment = overrides || pair.candidate.snapshot.stage2RoutingEnvironment || process.env;
    const report = compareStage2RouteArms(
      sharedText,
      {
        classification: pair.baseline.snapshot.stage2Classification,
        validation: pair.baseline.snapshot.stage1Validation,
        lunaAnalysisFrames: pair.baseline.snapshot.imageFrameManifest || [],
        productionDenseFrameIndices: pair.baseline.snapshot.lunaDenseFrameIndices || [],
        lunaFullImageReady: pair.baseline.snapshot.lunaFullImageReady,
      },
      {
        classification: pair.candidate.snapshot.stage2Classification,
        validation: pair.candidate.snapshot.stage1Validation,
        lunaAnalysisFrames: pair.candidate.snapshot.imageFrameManifest || [],
        productionDenseFrameIndices: pair.candidate.snapshot.lunaDenseFrameIndices || [],
        lunaFullImageReady: pair.candidate.snapshot.lunaFullImageReady,
      },
      environment,
    );
    const routeMatchesActual = {
      baseline: actualDecisionMatchesSnapshot(report.baseline, pair.baseline.snapshot),
      candidate: actualDecisionMatchesSnapshot(report.candidate, pair.candidate.snapshot),
    };
    const record = {
      recordType: 'stage2_route_comparison',
      recordVersion: 1,
      sourceIdentity: pair.candidate.record.sourceIdentity || pair.candidate.record.caseId,
      caseId: pair.candidate.record.caseId,
      sourceRow: pair.candidate.record.sourceRow,
      imageSet: pair.imageSet,
      baselineVariant: options.baselineVariant,
      candidateVariant: options.candidateVariant,
      stage2EnvironmentMatches: isDeepStrictEqual(
        pair.baseline.snapshot.stage2RoutingEnvironment || null,
        pair.candidate.snapshot.stage2RoutingEnvironment || null,
      ),
      routeMatchesActual,
      ...report,
    };
    appendJsonlRecord(outputPath, record);
    comparedCount++;
    if (Object.values(report.changed).some(Boolean)) changedRouteCount++;
    if (report.changed.denseFrameSelection) changedDenseFrameCount++;
  }

  console.log(JSON.stringify({
    recordType: 'stage2_route_comparison_summary',
    comparedCount,
    changedRouteCount,
    changedDenseFrameCount,
    missingBaselineCount,
    missingCandidateCount,
    invalidSnapshotCount,
    outputPath,
    resolver: 'production resolveStage2ScoreRouting',
    denseFramePredicate: 'production selectLunaDenseFrameIndices',
  }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
