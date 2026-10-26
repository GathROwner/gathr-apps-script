// Local validation only. A release must still use a fresh immutable serving readback.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=path.join(root,'functions/artifacts/oct16-eight-group/worker-assembly');
const out=path.join(root,'functions/artifacts/oct16-five-followups/worker-test-assembly');
if(fs.existsSync(out))throw Error('Preserve prior assembly; output already exists');
fs.mkdirSync(out,{recursive:true});
for(const name of ['src','scripts','package.json','package-lock.json','tsconfig.json'])if(fs.existsSync(path.join(baseline,name)))fs.cpSync(path.join(baseline,name),path.join(out,name),{recursive:true});
const overlay=path.join(root,'release-patches/scheduledFestivalLinker');
fs.cpSync(overlay,out,{recursive:true});
console.log(JSON.stringify({out,releaseReady:false,reason:'CLI reauthentication required for fresh serving archive'}));
