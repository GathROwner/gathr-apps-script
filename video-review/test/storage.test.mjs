import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {uploadDirectory,cleanup} from '../pipeline.mjs';
import {discover} from '../policy.mjs';
test('unchanged evidence is uploaded once and cannot overwrite a different object',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'evidence-upload-'));let writes=0;const objects=new Map();
 const bucket={file:key=>({save:async(bytes,options)=>{writes++;assert.equal(options.preconditionOpts.ifGenerationMatch,0);if(objects.has(key))throw Object.assign(Error('exists'),{code:412});objects.set(key,{bytes,metadata:options.metadata.metadata});},getMetadata:async()=>[{metadata:objects.get(key).metadata,size:objects.get(key).bytes.length}]})};
 try{await writeFile(join(dir,'intent.json'),'first');await writeFile(join(dir,'input.mp4'),'not evidence');const uploaded=new Map();await uploadDirectory(bucket,dir,'evidence/id',uploaded);await uploadDirectory(bucket,dir,'evidence/id',uploaded);assert.equal(writes,1);
 await uploadDirectory(bucket,dir,'evidence/id',new Map());assert.equal(writes,2); // Identical existing bytes are recognized without overwrite.
 await writeFile(join(dir,'intent.json'),'changed');await assert.rejects(uploadDirectory(bucket,dir,'evidence/id',uploaded),/evidence_object_drift/);assert.equal(objects.get('evidence/id/intent.json').bytes.toString(),'first');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('an empty SD field does not hide an available HD rendition',()=>{
 const [c]=discover([{postId:'123456', 'media/0/__typename':'Video','media/0/videoId':'765432','media/0/videoDeliveryLegacyFields/browser_native_sd_url':'','media/0/videoDeliveryLegacyFields/browser_native_hd_url':'https://video.xx.fbcdn.net/hd.mp4'}],'f');assert.equal(c.state,'queued');assert.match(c.sourceUrl,/hd.mp4/);
});
test('cleanup refuses a changed clip and deletes only an owned matching generation',async()=>{
 const id='a'.repeat(64),sha='b'.repeat(64);let deleted=0,updated=0;
 const doc={id,data:()=>({state:'held',object:`clips/${id}.mp4`,sha256:sha}),ref:{update:async()=>{updated++;}}};
 const db={collection:()=>({where:()=>({limit:()=>({get:async()=>({docs:[doc]})})})})};
 let metadata={owner:'daily-video-review-v1',sha256:'c'.repeat(64)};
 const bucket={file:()=>({getMetadata:async()=>[{generation:'123',metadata}],delete:async o=>{assert.equal(o.ifGenerationMatch,'123');deleted++;}})};
 await assert.rejects(cleanup({db,bucket}),/cleanup_owner_drift/);assert.equal(deleted,0);assert.equal(updated,0);
 metadata={owner:'daily-video-review-v1',sha256:sha};await cleanup({db,bucket});assert.equal(deleted,1);assert.equal(updated,1);
});
