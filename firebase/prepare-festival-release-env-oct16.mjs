// Preserve exact current USER configuration without printing or committing it.
import fs from 'node:fs/promises';import path from 'node:path';import {exec} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),cliEnv=require('C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/functions/env.js'),run=promisify(exec),group=process.argv[2];assert(['worker','parser','finalizer','shared'].includes(group));
const dir='functions/artifacts/pumpkin-overview-oct16',assembly=JSON.parse(await fs.readFile(dir+'/assembly-'+group+'.json','utf8')),before=JSON.parse(await fs.readFile(dir+'/serving-before.json','utf8'));
const targets=group==='parser'?['processDataset','processDatasetResume','processDatasetSelectedRows']:group==='shared'?['processSharedEventPublicCandidates','scheduledSharedEventPublicCandidateProcessor']:[assembly.sourceFunction];
const automatic=new Set(['FIREBASE_CONFIG','CLOUD_RUNTIME_CONFIG','ENTRY_POINT','GCP_PROJECT','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE','FUNCTION_TRIGGER_TYPE','FUNCTION_NAME','FUNCTION_MEMORY_MB','FUNCTION_TIMEOUT_SEC','FUNCTION_IDENTITY','FUNCTION_REGION','EVENTARC_CLOUD_EVENT_SOURCE','K_SERVICE','K_REVISION','K_CONFIGURATION','PORT']);
const hash=v=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');let user;
for(const name of targets){const old=before.rows.find(r=>r.name===name);const fn=JSON.parse((await run(`gcloud functions describe ${name} --gen2 --project=gathr-migrated --region=${old.region} --format=json`,{maxBuffer:4194304})).stdout);assert.equal(fn.labels['firebase-functions-hash'],old.hash,'Serving source changed');
 const secretNames=new Set((fn.serviceConfig.secretEnvironmentVariables||[]).map(s=>s.key));const values=Object.fromEntries(Object.entries(fn.serviceConfig.environmentVariables||{}).filter(([key])=>!automatic.has(key)&&!['X_GOOGLE_','FIREBASE_','EXT_'].some(p=>key.startsWith(p))));
 if(Object.keys(values).some(k=>secretNames.has(k)||/PRIVATE_KEY|SERVICE_ACCOUNT_KEY|APPLICATION_CREDENTIALS/i.test(k)))throw Error('Credential-bearing environment requires separate handling');
 if(user&&hash(user)!==hash(values))throw Error('Grouped functions have different user configuration');user=values;
}
const encoded=Object.entries(user).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)||typeof value!=='string')throw Error('Invalid environment definition');return key+'='+JSON.stringify(value);}).join('\n')+'\n';
if(hash(cliEnv.parseStrict(encoded))!==hash(user))throw Error('Environment roundtrip mismatch');
await run(`git -C "${assembly.root}" check-ignore -- functions/.env.gathr-migrated`);
const file=path.join(assembly.root,'functions/.env.gathr-migrated');await fs.writeFile(file,encoded,{mode:0o600});
const result={group,targets,environmentEntries:Object.keys(user).length,environmentFingerprint:hash(user),file,valuesPrinted:false,liveWrites:0};await fs.writeFile(dir+'/env-'+group+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
