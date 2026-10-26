import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),art=path.join(root,'functions/artifacts/oct16-eight-group');
const targets=[['scheduledUnknownVenueResolver','c4444a96e69c6a70fa2f45fd12381db7e4a8148a','1792017864214064','ebfba309967d7c3b6be35b0cc286e1018ca113f08d331f4db5621e65a2382f32'],
 ['processUnrecognizedVenues','e9df136f0868f360f12cb394753fd576b7f00f1b','1792018022391705','9294b50e0e2331fad221d34755951815c6fbf8ab3328d7127a4f3563a6af6930']];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),results=[];
for(const [name,servingHash,generation,archiveSha]of targets){
 const base=path.join(art,'resolver-baselines',name),metadata=JSON.parse(fs.readFileSync(path.join(base,'function.json'),'utf8').replace(/^\uFEFF/,''));
 if(metadata.state!=='ACTIVE'||metadata.labels['firebase-functions-hash']!==servingHash||metadata.buildConfig.source.storageSource.generation!==generation||sha(fs.readFileSync(path.join(base,'source.zip')))!==archiveSha)throw Error('Resolver baseline drift '+name);
 const dest=path.join(art,'resolver-assemblies',name);if(fs.existsSync(dest))throw Error('Preserve prior assembly '+name);fs.cpSync(path.join(base,'source'),dest,{recursive:true});
 const file=path.join(dest,'src/services/unknownVenueResolver.ts'),before=fs.readFileSync(file,'utf8');
 const original="function normalizeCity(value?: string): string {\n  return String(value || '').trim();\n}";
 const normalized=before.replaceAll('\r\n','\n');if(normalized.split(original).length!==2)throw Error('Unknown city normalization baseline '+name);
 const after=normalized.replace(original,"function normalizeCity(value?: string): string {\n  return cityGranularityHint(value) || '';\n}")
  .replace("import { logger } from '../utils/logger.js';","import { logger } from '../utils/logger.js';\nimport {cityGranularityHint} from './locationHintGranularity.js';");
 if(!after.includes("import {cityGranularityHint}"))throw Error('Resolver import anchor missing');fs.writeFileSync(file,after);
 for(const relative of ['src/services/locationHintGranularity.ts','src/services/locationHintGranularity.test.ts'])fs.copyFileSync(path.join(root,'functions',relative),path.join(dest,relative));
 // All other source/config/dependency bytes remain from this own immutable archive.
 const changed=['src/services/unknownVenueResolver.ts','src/services/locationHintGranularity.ts','src/services/locationHintGranularity.test.ts'];
 results.push({name,assembly:dest,servingHash,revision:metadata.serviceConfig.revision,archiveSha,source:metadata.buildConfig.source.storageSource,
  baselineSourceSha256:sha(before),candidateSourceSha256:sha(after),changedFiles:changed,runtimeSnapshot:path.join(base,'function.json'),configurationChanged:false,liveWrites:0});
}
fs.writeFileSync(path.join(art,'resolver-assemblies.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(x=>({name:x.name,assembly:x.assembly,changedFiles:x.changedFiles,liveWrites:0}))));
