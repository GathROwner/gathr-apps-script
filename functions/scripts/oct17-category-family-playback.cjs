// Offline saved-source verification and exact repair preparation. No network,
// credentials, model calls, or mutation mode. Generated reports stay local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {parseArgs} = require('node:util');
const {execFileSync} = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const {applyCategoryCorrectionsForRegression, rehydrateFamilyAudienceMetadata} = require('../lib/parsing/finalFormatter.js');
const {scoreFamilyFriendly} = require('../lib/utils/familyFriendlyScoring.js');

const {values} = parseArgs({options:{
  'evidence-dir':{type:'string'}, 'out-dir':{type:'string'},
}});
assert(values['evidence-dir'], 'Pass --evidence-dir with the read-only captured audit folder.');
const evidenceDir = path.resolve(values['evidence-dir']);
const outputDir = path.resolve(values['out-dir'] || path.join(__dirname, '../tmp/oct17-category-family'));
assert(outputDir !== evidenceDir && !outputDir.startsWith(evidenceDir + path.sep), 'Never write into captured evidence.');
const read = name => JSON.parse(fs.readFileSync(path.join(evidenceDir, name), 'utf8').replace(/^\uFEFF/, ''));
const ledger = read('ledger.json');
const events = read('live-events.json');
const controls = read('reviewed-family-controls.json');
// Compare rule changes to the actual accepted code, separately from manually
// reviewed stored numbers. A stored score is not scorer execution evidence.
const baselineSource = execFileSync('git', ['-C','C:/Users/craig/.codex/worktrees/a2af/gathr-apps-script','show', 'dd6fe2cdffa587456d8c4e1db627f94337ab5fd6:functions/src/utils/familyFriendlyScoring.ts'], {encoding:'utf8'});
const baselinePath = path.resolve(__dirname, '../lib/utils/familyFriendlyScoring.baseline.cjs');
const baselineModule = new Module(baselinePath, module);
baselineModule.filename = baselinePath;
baselineModule.paths = module.paths;
baselineModule._compile(ts.transpileModule(baselineSource, {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText, baselinePath);
const baselineScore = baselineModule.exports.scoreFamilyFriendly;
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const capture = target => {
  const matches = events.filter(event => event.path === target);
  assert.equal(matches.length, 1, `Expected exactly one captured target: ${target}`);
  return matches[0];
};
const specs = [
  {row:69, name:'HALLOWEEN ARTISAN MARKET', path:'venues/slug_royaltycrossing/events/6idnDEErpAB7Ex2skVxQ', category:'Gatherings & Parties', family:85},
  {row:123, name:'Sterling Farmers Market', path:'venues/qUg3AMPeXX9URM0UrXEA/events/4ZxbxygV32qUmnT7Pbt7', category:'Gatherings & Parties', family:15},
  {row:157, name:"Charlottetown Y's Club Free Swim", path:'venues/slug_bellaliantcentre/events/jjOj9C8U4xuOe87fdmGV', category:'Sports', family:15},
  {row:318, name:'Family/Public Skate — Skate', path:'venues/LglliE42SPFssmoU01su/events/MaC5HZv3CVQR5M6koJCO', category:'Sports', family:85},
  {row:343, name:'My First Sports Program', path:'venues/slug_cornwallciviccentre/events/NvtBo0lQs208nlxrHSYH', category:'Sports', family:80},
];
const familyKeys = ['familyAudienceEvidence','familyFriendlyScore','familyFriendlyLevel',
  'familyFriendlyReasons','familyFriendlyScoringVersion','familyFriendlyContentHash'];
const targets = specs.map(spec => {
  const record = capture(spec.path);
  const row = ledger.find(row => row.row === spec.row);
  assert(row, `Missing source row ${spec.row}`);
  const items = row.artifacts.stage4Items;
  const candidates = items.filter(item => item.name === spec.name);
  assert.equal(candidates.length, 1, `Ambiguous source item ${spec.name}`);
  const item = candidates[0];
  const sourceRoot = row.events[0].id;
  assert(record.data.sourceUniqueIds?.includes(sourceRoot) || record.data.uniqueId.startsWith(sourceRoot + '_'), 'Target source ownership drift');
  assert.equal(record.data.startDate, item.date);
  // Use the captured formatted clocks for calendar cells with meridiem text.
  const formatted = row.events.find(event => event.name === item.name && event.startDate === record.data.startDate);
  assert(formatted, 'Missing aligned formatted item');
  assert.equal(record.data.startTime, formatted.startTime);
  assert.equal(record.data.endTime, formatted.endTime);
  const before = record.data;
  const corrected = applyCategoryCorrectionsForRegression({...before, name:before.eventName || before.name}, item);
  assert.equal(corrected.category, spec.category);
  assert.equal(corrected.isEvent, 'Yes');
  assert.equal(corrected.isFoodSpecial, 'No');
  const rehydrated = rehydrateFamilyAudienceMetadata(corrected, item, items, '');
  const scored = {...rehydrated, ...scoreFamilyFriendly(rehydrated)};
  assert.equal(scored.familyFriendlyScore, spec.family, spec.name);
  const patch = {};
  if (before.category !== scored.category) patch.category = scored.category;
  for (const key of ['isEvent','isFoodSpecial']) {
    const value = typeof before[key] === 'boolean' ? scored[key] === 'Yes' : scored[key];
    if (before[key] !== value) patch[key] = value;
  }
  for (const key of familyKeys) if (JSON.stringify(before[key]) !== JSON.stringify(scored[key])) patch[key] = scored[key];
  const siblings = events.filter(event => event.data.uniqueId?.startsWith(sourceRoot + '_') || event.data.sourceUniqueIds?.includes(sourceRoot))
    .map(event => ({path:event.path, title:event.data.eventName || event.data.name,
      startDate:event.data.startDate, startTime:event.data.startTime, endTime:event.data.endTime}));
  const fingerprintKeys = ['eventName','name','uniqueId','sourceUniqueId','sourceUniqueIds','venueId',
    'startDate','endDate','startTime','endTime','isRecurring','recurringPattern','totalOccurrences','recurrenceUntilDate',
    'category','isEvent','isFoodSpecial','description', ...familyKeys];
  return {path:spec.path, row:spec.row, sourceRoot, sourceItemDigest:digest(item),
    capturedUpdateTime:record.updateTime, capturedFullDocumentDigest:digest(before),
    expected:Object.fromEntries(fingerprintKeys.filter(key => key in before).map(key => [key,before[key]])),
    beforeScore:before.familyFriendlyScore, afterScore:scored.familyFriendlyScore,
    patch, capturedExactSourceSiblings:siblings};
});

// Same captured market post: soup remains a distinct special; all public pool
// slots retain their printed clocks and Sports category.
const preserved = [];
for (const rowNumber of [123,157]) {
  const row = ledger.find(row => row.row === rowNumber);
  for (const item of row.artifacts.stage4Items) {
    const original = row.events.find(event => event.name === item.name && event.startTime === item.startTime);
    assert(original, 'Missing captured control');
    const result = applyCategoryCorrectionsForRegression(original, item);
    const special = item._sourceType === 'special';
    assert.equal(result.category, special ? 'Food Special' : rowNumber === 157 ? 'Sports' : 'Gatherings & Parties');
    assert.equal(result.isEvent, special ? 'No' : 'Yes');
    assert.equal(result.isFoodSpecial, special ? 'Yes' : 'No');
    assert.equal(result.startTime, original.startTime);
    assert.equal(result.endTime, original.endTime);
    preserved.push({row:rowNumber, name:item.name, category:result.category});
  }
}
const approvedControls = controls.filter(control => control.present).map(control => {
  const record = capture(control.path);
  const result = scoreFamilyFriendly(record.data);
  const baseline = baselineScore(record.data);
  assert.equal(record.data.familyFriendlyScore, control.expectedScore, `Stored reviewed score drift: ${control.path}`);
  assert.equal(result.familyFriendlyScore, baseline.familyFriendlyScore, `Rule change affected approved control: ${control.path}`);
  return {path:control.path, storedScore:control.expectedScore, baselineScore:baseline.familyFriendlyScore,
    score:result.familyFriendlyScore, preexistingStoredDifference:control.expectedScore !== baseline.familyFriendlyScore};
});
const heldRecord = capture('venues/RJ9iYyEWcYUr91hcGSeL/events/2DjVdRAtNrcyKPPgjjQU');
const heldScore = scoreFamilyFriendly(heldRecord.data);
assert.equal(heldScore.familyFriendlyScore, 15);
assert(heldScore.familyFriendlyReasons.includes('beneficiary_not_audience'));
const report = {mode:'offline-preparation-only', paidCalls:0, liveReads:0, liveWrites:0,
  targets, preservedControls:preserved, approvedControls,
  preexistingStoredScoreDifferences:approvedControls.filter(control => control.preexistingStoredDifference),
  held:[{path:heldRecord.path, proposedAction:'HOLD under group 5; no patch in this plan',
    sourceRow:283, beforeScore:heldRecord.data.familyFriendlyScore, diagnosticScore:heldScore,
    reason:'Collection-partner location is not distribution-event venue proof; beneficiary campaign name is not child participation.'}],
  applicationRequirements:[
    'Coordinator must live-reread each target and exact-source siblings, fail closed on missing/drifted records, and retain complete prewrite backups.',
    'Reconcile My First Sports with group 6 recurrence plan; this plan changes no dates/clocks/recurrence/location/media.',
    'Coordinator owns one atomic combined patch batch with update-time preconditions, reread postconditions and detail/feed verification.',
    'Offline captures are not current live state and this report does not authorize apply.',
  ]};
fs.mkdirSync(outputDir,{recursive:true});
const outputPath = path.join(outputDir,'repair-plan.json');
fs.writeFileSync(outputPath,JSON.stringify(report,null,2) + '\n');
console.log(JSON.stringify({outputPath,targets:targets.length,categoryCorrections:3,familyMisses:3,
  preservedControls:preserved.length,approvedControls:approvedControls.length,held:report.held.length,
  liveWrites:0,paidCalls:0},null,2));
