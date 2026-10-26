// Assemble only from the independently read immutable worker archive.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.join(root,'functions/artifacts/oct16-five-followups');
const base=path.join(dir,'worker-baseline'),m=JSON.parse(fs.readFileSync(path.join(base,'function.json'),'utf8'));
assert.equal(m.state,'ACTIVE');assert.equal(m.serviceConfig.revision,'scheduledfestivallinker-00005-bay');assert.equal(m.labels['firebase-functions-hash'],'63607e9458047a742d0990ab56a703ebb680434f');assert.equal(m.buildConfig.source.storageSource.generation,'1792184707022161');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert.equal(sha(path.join(base,'source.zip')),'7beae1546ad542ca11e5f0b4728aaa1678f37c442a6e3cdf9eda1d28c77f8124');
const name=process.argv[2]||'worker-release-final';assert(/^worker-release-[a-z0-9-]+$/.test(name),'Invalid local assembly name');
const out=path.join(dir,name);assert(!fs.existsSync(out),'Preserve previous assembly evidence');fs.cpSync(path.join(base,'source'),out,{recursive:true});
const overlay=path.join(root,'release-patches/scheduledFestivalLinker'),files=[];
function copy(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())copy(p);else{const relative=path.relative(overlay,p),dest=path.join(out,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);files.push({path:relative.replaceAll('\\','/'),sha256:sha(p)});}}}copy(overlay);
assert.equal(sha(path.join(out,'.env')),sha(path.join(base,'source/.env')));assert.equal(sha(path.join(out,'.env.gathr-migrated')),sha(path.join(base,'source/.env.gathr-migrated')));
fs.writeFileSync(path.join(dir,name+'-manifest.json'),JSON.stringify({assembly:out,servingRevision:m.serviceConfig.revision,servingHash:m.labels['firebase-functions-hash'],archiveSha256:sha(path.join(base,'source.zip')),storageSource:m.buildConfig.source.storageSource,overlayFiles:files,envPreserved:true,liveWrites:0},null,2));
console.log(JSON.stringify({assembly:out,overlayFiles:files.length,envPreserved:true,liveWrites:0}));
