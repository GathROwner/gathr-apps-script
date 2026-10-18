const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'functions/artifacts/oct18-audit-fixes/festival-followup-release');
const cliEnv=require('C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/functions/env.js');
const assemblies=JSON.parse(fs.readFileSync(path.join(out,'assemblies.json')));
const automatic=new Set(['K_SERVICE','K_REVISION','K_CONFIGURATION','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE','FUNCTION_NAME','FUNCTION_MEMORY_MB','FUNCTION_TIMEOUT_SEC','FUNCTION_IDENTITY','FUNCTION_REGION','FIREBASE_CONFIG','CLOUD_RUNTIME_CONFIG','ENTRY_POINT','GCP_PROJECT','GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FUNCTION_TRIGGER_TYPE','EVENTARC_CLOUD_EVENT_SOURCE','PORT']);
for(const a of assemblies){
 const fn=JSON.parse(fs.readFileSync(path.join(out,'before-'+a.sourceFunction+'-function.json'))),env=fn.serviceConfig.environmentVariables||{},secrets=fn.serviceConfig.secretEnvironmentVariables||[];
 const user=Object.fromEntries(Object.entries(env).filter(([k])=>!automatic.has(k)&&!k.startsWith('X_GOOGLE_')&&!k.startsWith('FIREBASE_')&&!k.startsWith('EXT_')));
 for(const k of Object.keys(user)){assert(!secrets.some(s=>s.key===k),'Secret has plaintext duplicate');assert(!/PRIVATE_KEY|SERVICE_ACCOUNT_JSON|CREDENTIAL_JSON/.test(k),'Credential-bearing env');}
 const encoded=Object.entries(user).sort().map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n';assert.deepEqual(cliEnv.parseStrict(encoded),user);
 fs.writeFileSync(path.join(a.folder,'.env.gathr-migrated'),encoded);
 const modules=path.join(a.folder,'node_modules');if(!fs.existsSync(modules))fs.symlinkSync(path.join(root,'functions/artifacts/oct17-eight-group-release/parser-release/node_modules'),modules,'junction');
 console.log(JSON.stringify({function:a.sourceFunction,preservedUserEnvKeys:Object.keys(user).length,secretBindings:secrets.length,roundTrip:true}));
}
