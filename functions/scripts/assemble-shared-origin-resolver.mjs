// Resolver releases start from each endpoint's immutable live archive, not the
// parser checkout, preserving the separately deployed municipal identity fix.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const serving=path.resolve(process.argv[2]),readback=JSON.parse(fs.readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));
assert.equal(readback.state,'ACTIVE');
assert(['8bba926e50fce5f1bd5cfe3f4346b932e904937e','e1d70db8fe92cbc601a2cceccddf719f1188ff6f'].includes(readback.labels['firebase-functions-hash']));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(fs.readFileSync(path.resolve(serving,'../source.zip'))),'0b536ccd28808e65039a4a2ac0f9f9ed237c3af804bddee0b4253c2acc50f70d');
const target=path.join(serving,'src/services/unknownVenueResolver.ts');
const before=fs.readFileSync(target);assert.equal(sha(before),'4fda0b897041c60b41ca12b954a237684ee8bc8b43a4d07858b22f3fb9162193');
let text=before.toString('utf8');const nl=text.includes('\r\n')?'\r\n':'\n';
const replace=(from,to)=>{assert.equal(text.split(from).length,2,'Assembly anchor changed: '+from.slice(0,70));text=text.replace(from,to);};
replace("import { logger } from '../utils/logger.js';", "import { logger } from '../utils/logger.js';"+nl+"import {allowsPublisherAddressHydration} from './sourceLocationRole.js';");
replace(['async function hydrateSampleTopLevelUrls(','  record: UnrecognizedVenueRecord'].join(nl),[
 'export async function hydrateSampleTopLevelUrls(',
 '  record: UnrecognizedVenueRecord,',
 '  downloadDataset: typeof driveService.downloadAndParseDataset = driveService.downloadAndParseDataset,',
 '  saveSamples: (id: string, samples: UnrecognizedVenueSampleEvent[]) => Promise<void> = async (id, samples) => {',
 '    await firestoreService.updateUnrecognizedVenue(id, {sampleEvents: samples});',
 '  }'].join(nl));
replace('  const needsBackfill = samples.some((sample) => {','  const needsBackfill = samples.some((sample) => {'+nl+'    if (!allowsPublisherAddressHydration(sample)) return false;');
replace(['  for (const sample of samples) {',"    const topLevelUrl = String(sample.topLevelUrl || '').trim();"].join(nl),[
 '  for (const sample of samples) {',"    const topLevelUrl = String(sample.topLevelUrl || '').trim();",
 '    if (!allowsPublisherAddressHydration(sample)) {','      hydratedSamples.push(sample);','      continue;','    }'].join(nl));
replace('        const parsed = await driveService.downloadAndParseDataset(fileId);','        const parsed = await downloadDataset(fileId);');
replace(['  await firestoreService.updateUnrecognizedVenue(docId, {','    sampleEvents: hydratedSamples,','  });'].join(nl),'  await saveSamples(docId, hydratedSamples);');
assert(text.includes('export function getMunicipalPlaceNameVariants'));assert(text.includes('namedVenueCandidateIsCompatible'));
fs.writeFileSync(target,text);
const typeFile=path.join(serving,'src/types/index.ts');let types=fs.readFileSync(typeFile,'utf8');
assert.equal(types.split('export interface UnrecognizedVenueSampleEvent {').length,2);
types=types.replace('export interface UnrecognizedVenueSampleEvent {',"export interface UnrecognizedVenueSampleEvent {"+nl+"  sourceLocationRole?: 'shared_original_business';");fs.writeFileSync(typeFile,types);
for(const name of ['sourceLocationRole.ts','sourceLocationRole.test.ts'])fs.copyFileSync(path.join(root,'src/services',name),path.join(serving,'src/services',name));
const managed=/^(?:FUNCTION_|EVENTARC_|FIREBASE_|K_|GCLOUD_PROJECT$|GCP_PROJECT$|CLOUD_RUNTIME_CONFIG$|PORT$)/;
const env=Object.entries(readback.serviceConfig.environmentVariables||{}).filter(([key])=>!managed.test(key));
fs.writeFileSync(path.join(serving,'.env'),env.map(([key,value])=>`${key}=${JSON.stringify(String(value))}`).join('\n')+'\n');
const manifest={assembledAt:new Date().toISOString(),baselineHash:readback.labels['firebase-functions-hash'],storageSource:readback.buildConfig.source.storageSource,
 resolverBeforeSha256:sha(before),resolverAfterSha256:sha(fs.readFileSync(target)),configurationKeysPreserved:env.map(([key])=>key),municipalAndRoadGuardsPreserved:true};
fs.writeFileSync(path.resolve(serving,'../assembly.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({baselineHash:manifest.baselineHash,resolverAfterSha256:manifest.resolverAfterSha256,configurationKeys:env.length}));
