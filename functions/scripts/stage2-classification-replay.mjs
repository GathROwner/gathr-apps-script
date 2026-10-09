// Reapply current deterministic Stage 2 guards to captured model responses.
// No network, credentials, image service or database access. This does not
// re-evaluate images or claim fresh model output from the changed guards.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const [inputFile, responseDir, outputDir] = process.argv.slice(2);
if (!inputFile || !responseDir || !outputDir) throw new Error('Usage: input.json responses-dir output-dir');
let captured;
globalThis.fetch = async () => new Response(JSON.stringify({
  id: 'offline_stage2_replay', object: 'response', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: captured }] }],
}), { status: 200, headers: { 'content-type': 'application/json' } });
process.env.OPENAI_API_KEY = 'offline-replay-not-a-key';
createRequire(import.meta.url)('openai/shims/web');
const { classifyContent } = await import('../lib/parsing/contentClassifier.js');
const { resolveStage2ScoreRouting } = await import('../lib/parsing/stage2Routing.js');
if (process.env.AUDIT_ENVIRONMENT_FILE) {
  const env = JSON.parse(await fs.readFile(process.env.AUDIT_ENVIRONMENT_FILE, 'utf8')).serviceConfig.environmentVariables;
  for (const [key, value] of Object.entries(env)) if (/^(STAGE|ENABLE_STAGE2|LUNA_)/.test(key)) process.env[key] = String(value);
}
const sources = JSON.parse(await fs.readFile(inputFile, 'utf8'));
await fs.mkdir(outputDir, { recursive: true });
let count = 0, changed = [];
for (const file of await fs.readdir(responseDir)) {
  if (!file.endsWith('.json')) continue;
  const record = JSON.parse(await fs.readFile(path.join(responseDir, file), 'utf8'));
  const source = sources.find(x => x.caseId === record.caseId);
  if (!source || record.error || record.fallback || record.requests.length < 1 || record.requests.length > 2 || record.requests.some(x=>x.status !== 'completed')) throw new Error('Unusable captured result: ' + file);
  captured = record.requests.at(-1).outputText;
  const classification = await classifyContent(source.caption, [], source.venue, { utcStartDate: source.utcStartDate }, { stage2ModelOverride: record.model });
  if (/\| GPT error:/.test(classification.classificationReason)) throw new Error('Raw-response parse failed: ' + file);
  const routing = resolveStage2ScoreRouting(source.caption, classification, source.validation);
  const resolvedContentType = routing.shouldUseRoutedContentType ? routing.routedContentType : classification.contentType;
  const passesConfidenceGate = classification.confidence >= .6;
  if (resolvedContentType !== record.resolvedContentType || passesConfidenceGate !== record.passesConfidenceGate) changed.push({ caseId: source.caseId, arm: record.arm, previousRoute: record.resolvedContentType, resolvedContentType, previousPass: record.passesConfidenceGate, passesConfidenceGate });
  await fs.writeFile(path.join(outputDir, file), JSON.stringify({ ...record, classification, routing, resolvedContentType, passesConfidenceGate, offlineRawResponseReplay: true }, null, 2));
  count++;
}
console.log(JSON.stringify({ replayed: count, changed }, null, 2));
