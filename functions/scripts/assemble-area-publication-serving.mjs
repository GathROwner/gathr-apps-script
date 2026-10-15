// Apply only the reviewed city publisher delta to immutable endpoint archives.
// Private archives, environment files and raw readbacks remain local.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const functionsRoot=path.resolve(import.meta.dirname,'..'),repo=path.dirname(functionsRoot);
const serving=path.resolve(process.argv[2]),readbackFile=path.resolve(process.argv[3]),zip=path.resolve(process.argv[4]);
const readback=JSON.parse(fs.readFileSync(readbackFile,'utf8').replace(/^\uFEFF/,''));
const allowed={
 '9da2aaf2edc38a0bc0a2494505cc516db7f113c3':'c000e69c7f4479a31da4d09af9647a3928271f9a3e649276854c41f219fb8177',
 '32c823c113f4be94bddac277faa88c67e6048cbd':'82dc11f9c1187660ef1acdeb7539a505ce935e8d0bd0cdc31e0db278b8d3fd73',
 'ebde32d828dd6d0b77b15e690e78d34beb7a9637':'82dc11f9c1187660ef1acdeb7539a505ce935e8d0bd0cdc31e0db278b8d3fd73',
};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(readback.state,'ACTIVE');assert.equal(sha(fs.readFileSync(zip)),allowed[readback.labels['firebase-functions-hash']],'Immutable source archive differs');
const normal=x=>x.replace(/\r\n/g,'\n');
const base=normal(execFileSync('git',['show','d5f72979e1e078e64d75195f2bdc54c259e5c557:functions/src/services/firestoreService.ts'],{cwd:repo,encoding:'utf8',maxBuffer:5e6}));
const current=normal(fs.readFileSync(path.join(functionsRoot,'src/services/firestoreService.ts'),'utf8'));
const sourcePath=path.join(serving,'src/services/firestoreService.ts');
const original=fs.readFileSync(sourcePath),old=normal(original.toString());
const ast=text=>ts.createSourceFile('source.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const find=(file,name)=>file.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
const baseAst=ast(base),currentAst=ast(current),oldAst=ast(old);
const names=['queueCityLevelEventReview','buildPublishedCityLevelEventData','writePublishedCityLevelEvent','finalizeCityLevelEventReview'];
const once=(value,from,to)=>{assert.equal(value.split(from).length,2,'Serving anchor changed: '+from.slice(0,70));return value.replace(from,to);};
const province="    // Province scope uses a geographic reference anchor for discovery only;\n    // it must never render as a claimed physical location marker.\n    mapMode: locationScope === 'province' || locationPrecision === 'none' ? 'none' : 'area',";
const legacyProvince="    mapMode: locationPrecision === 'none' ? 'none' : 'area',";
const replacements=names.map(name=>{
 const b=find(baseAst,name),n=find(currentAst,name),o=find(oldAst,name);assert(b&&n&&o,'Missing publisher function '+name);
 let replacement=n.getText(currentAst);
 if(name==='queueCityLevelEventReview'){
  // These archives predate unrelated source-ID and spatial extraction guards.
  // Preserve their queue implementation; add only clean description storage.
  replacement=once(o.getText(oldAst),'  const descriptionPreview = trimCityLevelEventPreview(input.description);','  const description = publicCityLevelDescription(input.description);\n  const descriptionPreview = trimCityLevelEventPreview(description);');
  replacement=once(replacement,'        locationScope,','        observedLocationName: input.observedLocationName,\n        description,\n        locationScope,');
  replacement=once(replacement,'        locationScope: existing.locationScope || locationScope,','        observedLocationName: input.observedLocationName || existing.observedLocationName,\n        description: description || existing.description,\n        locationScope: existing.locationScope || locationScope,');
 }else if(name==='buildPublishedCityLevelEventData'){
  assert.equal(sha(o.getText(oldAst)),sha(once(b.getText(baseAst),province,legacyProvince)),'Serving builder changed beyond known province-mode difference');
  replacement=once(replacement,province,legacyProvince);
 }else assert.equal(sha(o.getText(oldAst)),sha(b.getText(baseAst)),'Serving publisher differs from reviewed prepatch baseline: '+name);
 return {start:o.getStart(oldAst),end:o.getEnd(),text:replacement,name};
});
let patched=old;for(const r of replacements.sort((a,b)=>b.start-a.start))patched=patched.slice(0,r.start)+r.text+patched.slice(r.end);
const helper=find(currentAst,'reviewedCityLevelManual');assert(helper);assert(!find(oldAst,'reviewedCityLevelManual'));
patched=helper.getText(currentAst)+'\n\n'+patched;
const helperImports=currentAst.statements.filter(n=>ts.isImportDeclaration(n)&&['./areaEventPublication.js','./areaDateRangeTiming.js'].includes(n.moduleSpecifier.text));
assert.equal(helperImports.length,2,'Both reviewed helper imports are required');
patched=helperImports.map(n=>n.getText(currentAst)).join('\n')+'\n'+patched;
const typesPath=path.join(serving,'src/types/index.ts');let types=normal(fs.readFileSync(typesPath,'utf8'));
const appendInterface=(name,fields)=>{const a=ast(types),n=a.statements.find(x=>ts.isInterfaceDeclaration(x)&&x.name.text===name);assert(n,'Missing interface '+name);fields=fields.filter(field=>{const present=n.members.some(m=>m.name?.getText(a)===field.split('?')[0]);if(present&&field.startsWith('spatialEvidence?'))return false;assert(!present,'Existing added field '+name+'.'+field);return true;});const index=n.getEnd()-1;types=types.slice(0,index)+fields.map(x=>'  '+x).join('\n')+'\n'+types.slice(index);};
appendInterface('EventData',["areaData?: import('../services/areaEventPublication.js').EventAreaData;","timing?: unknown;"]);
appendInterface('CityLevelEventReviewRecord',["areaData?: import('../services/areaEventPublication.js').EventAreaData;","areaEventLinks?: import('../services/areaEventPublication.js').AreaEventLinkEvidence[];","observedLocationName?: string;","description?: string;","spatialEvidence?: {kind?: string};","timing?: unknown;"]);
const typeAst=ast(types),finalize=typeAst.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='FinalizeCityLevelEventReviewInput');
const manual=finalize?.members.find(n=>n.name?.getText(typeAst)==='manual');assert(manual&&ts.isTypeLiteralNode(manual.type));
const insert=manual.type.getEnd()-1;types=types.slice(0,insert)+"    areaData?: import('../services/areaEventPublication.js').EventAreaData;\n    areaEventLinks?: import('../services/areaEventPublication.js').AreaEventLinkEvidence[];\n    timing?: unknown;\n  "+types.slice(insert);
fs.writeFileSync(sourcePath,patched);fs.writeFileSync(typesPath,types);
for(const file of ['areaEventPublication.ts','areaEventPublication.test.ts','areaDateRangeTiming.ts','areaDateRangeTiming.test.ts']){
 let content=fs.readFileSync(path.join(functionsRoot,'src/services',file),'utf8');
 // The oldest finalizer's record type predates route reviews. Its negative
 // runtime fixture deliberately supplies an invalid route; do not widen the
 // endpoint's production type/normalizer merely to express that test input.
 if(file.endsWith('.test.ts'))content=content.replace("record({locationScope:'route',areaData:","record({locationScope:'route' as any,areaData:");
 fs.writeFileSync(path.join(serving,'src/services',file),content);
}
const managed=/^(?:FUNCTION_|EVENTARC_|FIREBASE_|K_|GCLOUD_PROJECT$|GCP_PROJECT$|CLOUD_RUNTIME_CONFIG$|PORT$)/;
const env=Object.entries(readback.serviceConfig.environmentVariables||{}).filter(([key])=>!managed.test(key));
fs.writeFileSync(path.join(serving,'.env'),env.map(([key,value])=>`${key}=${JSON.stringify(String(value))}`).join('\n')+'\n');
const configPath=path.join(serving,'firebase.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
for(const f of config.functions)f.ignore=[...new Set([...(f.ignore||[]),'artifacts','tmp','sandbox','tmp_*','*.bak*','area-*.txt','date-range-*.txt','area-publication-assembly.json'])];
fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
if(!fs.existsSync(path.join(serving,'node_modules')))fs.symlinkSync(path.join(functionsRoot,'node_modules'),path.join(serving,'node_modules'),'junction');
const manifest={assembledAt:new Date().toISOString(),baselineHash:readback.labels['firebase-functions-hash'],storageSource:readback.buildConfig.source.storageSource,archiveSha256:sha(fs.readFileSync(zip)),publisherBeforeSha256:sha(original),publisherAfterSha256:sha(fs.readFileSync(sourcePath)),functionsChanged:names,addedHelper:'reviewedCityLevelManual',configurationKeysPreserved:env.map(([key])=>key),privatePackagingExcluded:true};
fs.writeFileSync(path.join(serving,'area-publication-assembly.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({...manifest,storageSource:undefined,configurationKeysPreserved:env.length}));
