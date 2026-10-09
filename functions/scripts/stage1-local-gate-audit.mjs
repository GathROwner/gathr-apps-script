import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applyStage1LocalDecisionGates, normalizeValidationResponse} from '../lib/parsing/contentValidator.js';

// Offline counterfactual only. Original API records and source labels are never changed.
const [manifestPath, resultsPath, outputPath, policy = 'evidence-backed-links'] = process.argv.slice(2);
if (!manifestPath || !resultsPath || !outputPath) throw new Error('Usage: node scripts/stage1-local-gate-audit.mjs MANIFEST RESULTS OUTPUT');
if (!['evidence-backed-links', 'source-offer-guards', 'source-offer-guards-v2', 'source-menu-guards'].includes(policy)) throw new Error('Unknown evaluation policy');
if ([manifestPath, resultsPath].map(p => path.resolve(p).toLowerCase()).includes(path.resolve(outputPath).toLowerCase())) throw new Error('Output must not replace an input');
const sha = data => createHash('sha256').update(data).digest('hex');
const manifestBytes = fs.readFileSync(manifestPath);
const resultsBytes = fs.readFileSync(resultsPath);
const manifest = JSON.parse(manifestBytes.toString().replace(/^\uFEFF/, ''));
const cases = new Map(manifest.cases.map(c => [c.caseId, c]));
const records = resultsBytes.toString().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const audit = {kind: 'offline_local_gate_counterfactual', policy,
  generatedAt: new Date().toISOString(), manifestPath, resultsPath,
  manifestSha256: sha(manifestBytes), resultsSha256: sha(resultsBytes),
  compiledValidatorSha256: sha(fs.readFileSync(new URL('../lib/parsing/contentValidator.js', import.meta.url))),
  paidCalls: 0, cases: [], skipped: []};
for (const record of records.filter(r => r.recordType === 'case_result')) {
  const source = cases.get(record.caseId);
  if (!source) throw new Error(`Unknown case ${record.caseId}`);
  const lastAttempt = record.requestAttempts?.at(-1);
  if (record.status !== 'completed' || !lastAttempt?.parsed) {
    audit.skipped.push({caseId: record.caseId, status: record.status});
    continue;
  }
  let modelResult;
  try {
    const text = lastAttempt.visibleOutput || '';
    modelResult = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    if (typeof modelResult.hasValidContent !== 'boolean' || !modelResult.validationDecision) throw new Error('Missing model decision');
  } catch (error) {
    audit.skipped.push({caseId: record.caseId, status: 'raw_output_not_replayable', reason: error.message});
    continue;
  }
  const value = normalizeValidationResponse(modelResult, source.caption, record.hasImages);
  const legacy = structuredClone(value);
  applyStage1LocalDecisionGates(legacy, source.caption, record.hasImages, record.localGatePolicy || 'production');
  if (legacy.hasValidContent !== record.finalNormalizedResult.hasValidContent) throw new Error(`Recorded-policy replay mismatch: ${record.caseId}`);
  applyStage1LocalDecisionGates(value, source.caption, record.hasImages, audit.policy);
  const candidateDecision = value.hasValidContent ? 'accept' : 'reject';
  const baselineDecision = record.finalNormalizedResult.hasValidContent ? 'accept' : 'reject';
  audit.cases.push({caseId: record.caseId, imageSet: record.imageSet,
    sourceIdentity: record.sourceIdentity, effectivePromptSha256: record.effectivePromptSha256,
    originalCompiledValidatorSha256: record.compiledContentValidatorSha256,
    baselineDecision, candidateDecision, changed: baselineDecision !== candidateDecision,
    originalTruth: source.sourceTruth, finalNormalizedResult: value});
}
audit.changed = audit.cases.filter(c => c.changed).map(c => ({caseId: c.caseId,
  baselineDecision: c.baselineDecision, candidateDecision: c.candidateDecision, originalTruth: c.originalTruth}));
fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));
console.log(JSON.stringify({scored: audit.cases.length, skipped: audit.skipped, changed: audit.changed, paidCalls: 0}));
