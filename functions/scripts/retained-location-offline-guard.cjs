// Mandatory preload: no credential reads, external network, filesystem mutation or child processes.
const fs=require('node:fs');
const state=globalThis.__retainedSafety={networkAttempts:0,writeAttempts:0,credentialReadAttempts:0,childProcessAttempts:0};
const deny=(kind)=>function(){state[kind]++;throw Error('Offline retained-output harness blocked '+kind);};
for(const mod of ['node:http','node:https'])for(const k of ['request','get'])require(mod)[k]=deny('networkAttempts');
for(const[mod,keys]of [['node:net',['connect','createConnection']],['node:tls',['connect']],['node:http2',['connect']],['node:dgram',['createSocket']],['node:dns',['lookup','resolve','resolve4','resolve6']]])for(const k of keys)require(mod)[k]=deny('networkAttempts');
globalThis.fetch=deny('networkAttempts');
for(const k of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])require('node:child_process')[k]=deny('childProcessAttempts');
for(const k of ['writeFile','writeFileSync','appendFile','appendFileSync','createWriteStream','unlink','unlinkSync','rm','rmSync','rmdir','rmdirSync','mkdir','mkdirSync','rename','renameSync','copyFile','copyFileSync','truncate','truncateSync','link','linkSync','symlink','symlinkSync'])fs[k]=deny('writeAttempts');
for(const k of ['writeFile','appendFile','unlink','rm','rmdir','mkdir','rename','copyFile','truncate','link','symlink'])fs.promises[k]=deny('writeAttempts');
const credentialPath=p=>/(?:service[-_]account|application_default_credentials|gcloud[\\/]credentials|[\\/]\.env(?:\.|$)|\.codex[\\/](?:auth\.json|secrets(?:\.|[\\/]))|[\\/]credentials(?:\.json|[\\/]))/i.test(String(p));
for(const k of ['readFile','readFileSync','createReadStream']){const orig=fs[k];fs[k]=function(p,...args){if(credentialPath(p))return deny('credentialReadAttempts')();return orig.call(this,p,...args);};}
for(const k of ['readFile','open']){const orig=fs.promises[k];fs.promises[k]=function(p,...args){if(credentialPath(p))return deny('credentialReadAttempts')();if(k==='open'&&args[0]&&!/^r$/.test(String(args[0])))return deny('writeAttempts')();return orig.call(this,p,...args);};}
for(const k of ['open','openSync']){const orig=fs[k];fs[k]=function(p,flags,...args){if(credentialPath(p))return deny('credentialReadAttempts')();if(flags!==undefined&&flags!=='r'&&flags!==0)return deny('writeAttempts')();return orig.call(this,p,flags,...args);};}
for(const k of Object.keys(process.env))if(!['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','PATH','PATHEXT','COMSPEC','NODE_TEST_CONTEXT'].includes(k))delete process.env[k];
