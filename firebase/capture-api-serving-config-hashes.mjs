// Pipe gcloud service JSON directly here. Never persist or print raw environment
// values or inline credentials; retain only configuration fingerprints.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
assert.equal(process.argv.length,3,'Explicit output path required');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
let input='';for await(const part of process.stdin)input+=part;
let service;try{service=JSON.parse(input);}catch{throw Error('Cloud Run configuration input unavailable or invalid');}input='';
assert.equal(service.metadata?.name,'gathr-backend');
const template=service.spec?.template;assert(template?.spec?.containers?.length===1);
const spec=structuredClone(template.spec);const image=spec.containers[0].image;delete spec.containers[0].image;
const annotations={...(template.metadata?.annotations||{})};for(const k of ['run.googleapis.com/client-name','run.googleapis.com/client-version','run.googleapis.com/operation-id'])delete annotations[k];
const env=template.spec.containers[0].env||[];
const result={capturedAt:new Date().toISOString(),service:service.metadata.name,readyRevision:service.status?.latestReadyRevisionName,image,traffic:service.status?.traffic,
 configurationSha256:hash(spec),runtimeAnnotationsSha256:hash(annotations),environmentEntries:env.length,environment:env.map(e=>({name:e.name,definitionSha256:hash(e)})).sort((a,b)=>a.name.localeCompare(b.name)),liveWrites:0};
service=null;await fs.writeFile(process.argv[2],JSON.stringify(result,null,2));
console.log(JSON.stringify({out:process.argv[2],readyRevision:result.readyRevision,configurationSha256:result.configurationSha256,environmentEntries:result.environmentEntries,liveWrites:0}));
