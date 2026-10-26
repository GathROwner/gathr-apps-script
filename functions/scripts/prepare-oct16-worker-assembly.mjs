// Read-only serving source assembly. No deploys, API generations or data writes.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=path.join(root,'functions/artifacts/oct16-eight-group/worker-baseline');
const metadata=JSON.parse(fs.readFileSync(path.join(base,'function.json'),'utf8').replace(/^\uFEFF/,''));
if(metadata.labels['firebase-functions-hash']!=='f84328f133a8410265e2011bde5cbb35c4a474f0'||metadata.serviceConfig.revision!=='scheduledfestivallinker-00004-wul'||
 metadata.buildConfig.source.storageSource.generation!=='1792150054781468')throw Error('Worker serving baseline drift');
const zip=fs.readFileSync(path.join(base,'source.zip'));
const archiveSha=createHash('sha256').update(zip).digest('hex');
if(archiveSha!=='693e5ad3021409b92746bcaaecb58fc0d0d7636ac7a291e659827efe0b10aa9d')throw Error('Immutable archive changed');
const assembly=path.join(root,'functions/artifacts/oct16-eight-group/worker-assembly');
if(fs.existsSync(assembly))throw Error('Assembly exists; preserve prior evidence and choose a clean path');
fs.cpSync(path.join(base,'source'),assembly,{recursive:true});
const overlay=path.join(root,'release-patches/scheduledFestivalLinker');const files=[];
function copy(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const src=path.join(dir,entry.name);if(entry.isDirectory())copy(src);else{
 const relative=path.relative(overlay,src),dest=path.join(assembly,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
 files.push({path:relative.replaceAll('\\','/'),sha256:createHash('sha256').update(fs.readFileSync(src)).digest('hex')});}}}
copy(overlay);
// Node resolves an adjacent <directory>.json before the directory's package
// entrypoint. Keep the manifest stem distinct from this deploy source directory.
fs.writeFileSync(path.join(root,'functions/artifacts/oct16-eight-group/worker-assembly-manifest.json'),JSON.stringify({assembly,archiveSha,source:metadata.buildConfig.source.storageSource,servingHash:metadata.labels['firebase-functions-hash'],files},null,2));
console.log(JSON.stringify({assembly,archiveSha,overlayFiles:files.length,liveWrites:0}));
