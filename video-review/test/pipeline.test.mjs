import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {download,exactListings,scan,work} from '../pipeline.mjs';
test('download refuses redirect escape without requesting the destination',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'video-test-'));let calls=0;
  try{await assert.rejects(download('https://video.xx.fbcdn.net/a',join(dir,'v'),async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest'}});}));assert.equal(calls,1);}finally{await rm(dir,{recursive:true,force:true});}
});
test('download verifies MP4 bytes and preserves exact payload',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'video-test-'));const bytes=Buffer.from('0000ftyp0000payload');
  try{await download('https://video.xx.fbcdn.net/a',join(dir,'v'),async()=>new Response(bytes,{headers:{'content-type':'video/mp4'}}));assert.deepEqual(await readFile(join(dir,'v')),bytes);}finally{await rm(dir,{recursive:true,force:true});}
});
test('discovery and paid worker stay off without explicit activation',async()=>{
  const db={doc:()=>({get:async()=>({data:()=>({enabled:false})})})};assert.deepEqual(await scan({db}),{disabled:true});assert.deepEqual(await work({db},'unused'),{disabled:true});
});
test('exact listing query excludes private events and expired/cancelled listings',async()=>{
  const make=(path,data)=>({ref:{path,parent:{parent:{get:async()=>({data:()=>({name:'Venue'})})}}},updateTime:{seconds:1,nanoseconds:0},data:()=>data});
  const results=[make('users/private/events/a',{startDate:'2099-01-01'}),make('events/old',{startDate:'2000-01-01'}),make('events/cancel',{startDate:'2099-01-01',isCancelled:true}),make('venues/v/events/e',{startDate:'2099-01-01',startTime:'19:00',name:'Concert'})];
  const db={collectionGroup:name=>{assert.equal(name,'events');return{where:(field,op,id)=>{
    assert.equal(field,'sourceUniqueIds');assert.equal(op,'array-contains');assert.equal(id,'12345');
    return{limit:()=>({get:async()=>({size:results.length,docs:results})})};
  }};}};
  const matches=await exactListings(db,{sourcePostId:'12345'});assert.equal(matches.length,1);assert.equal(matches[0].venue,'Venue');assert.equal(matches[0].title,'Concert');
});
