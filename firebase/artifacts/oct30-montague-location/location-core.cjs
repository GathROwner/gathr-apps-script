'use strict';
// One venue plus its seven retained existing event IDs. No creation/migration.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const CORE='C:/Users/craig/.codex/skills/gathr-event-data-repair/scripts/writer/repair-core.cjs';
const OWNER='01a0ea83-7031-7423-b853-966f2180d186';
const C=require(CORE).createCore({dir:__dirname,executorTaskId:OWNER});
const VENUE='venues/slug_montague-rotary-library', ADDRESS='21 Sullivan Lane, Montague, PE C0A 1R0, Canada';
const IDS=['3H50fuhBWwyw6Bqsi0vx','U4IS4d7IFjYtM37odNMQ','UmVlijvvpFWCcTrta2Jz','VDzdrSvyrBr3JTz1xuMI','cTAvdSJPjZHWpILvtruE','o29_nov18_fb4fb349e701','rl0irUSqj6onSYHpfpA5'].sort();
const REMOVED=['P8uHDjNq511ZFk8jZxnR','hlGVI00ospByjpXXAIJP','lksae4cA4h8Hc5gSwYVb','nVtnXJ9Bo4MWW8kaRPhc'].sort();
const AUDIT='C:/Users/craig/Documents/Codex/2026-10-30/parse-audit';
const EVIDENCE='C:/Users/craig/Documents/Codex/2026-10-30/remediation';
const clone=x=>JSON.parse(JSON.stringify(x)),sv=stringValue=>({stringValue}),nv=doubleValue=>({doubleValue}),read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
const seal=o=>({...o,digest:C.hash(o)});
const decode=v=>v.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):v.arrayValue?(v.arrayValue.values||[]).map(decode):v.stringValue??v.timestampValue??v.integerValue??v.doubleValue??v.booleanValue??null;
function make(venue,events,feed,places,atUTC){
 assert.equal(venue.path,VENUE);assert(venue.exists&&venue.createTime&&venue.updateTime);
 assert.equal(venue.fields.name.stringValue,'Montague Rotary Library');
 assert.equal(venue.fields.address.stringValue,'53 Wood Islands Rd, Montague, PE C0A 1R0, Canada');
 assert.deepEqual(events.map(d=>d.path.split('/').at(-1)).sort(),IDS,'Complete retained venue list required after duplicate repair');
 const place=places.results[0].response.places[0];
 assert.equal(place.id,'ChIJC1u6sIdoXksRH-9YCFtll9I');assert.equal(place.displayName.text,'Montague Rotary Library');assert.equal(place.nationalPhoneNumber,'(902) 838-2928');assert.equal(place.businessStatus,'OPERATIONAL');
 assert.equal(place.location.latitude,46.156867999999996);assert.equal(place.location.longitude,-62.644596299999996);
 const location={latitude:nv(place.location.latitude),longitude:nv(place.location.longitude)};
 const actions=[venue,...events].map(d=>{
  assert(d.exists&&d.createTime&&d.updateTime);
  if(d.path!==VENUE){assert(d.path.startsWith(VENUE+'/events/'));assert.equal(d.fields.venueId.stringValue,VENUE.split('/')[1]);assert.equal(d.fields.address.stringValue,'53 Wood Islands Rd, Montague, PE C0A 1R0, Canada');}
  const patch={address:sv(ADDRESS),latitude:location.latitude,longitude:location.longitude,addressSource:sv('reviewed_official_library_and_google_places'),addressUpdatedAt:{timestampValue:atUTC},updatedAt:{timestampValue:atUTC}};
  if(d.path===VENUE){patch.coordinates={mapValue:{fields:location}};patch.googlePlaceId=sv(place.id);}
  else{patch.rawAddress=sv(ADDRESS);patch.normalizedAddress=sv(ADDRESS);patch.addressNormalizationIssues={arrayValue:{values:[]}};}
  const afterFields={...clone(d.fields),...patch},mask=Object.keys(patch).sort();
  return{path:d.path,before:clone(d),afterFields,mask,archivePath:'event_integrity_backups/o30_montague_'+C.hash(d.path).slice(0,20)};
 });
 const boundFiles={};for(const f of [CORE,__filename,path.join(EVIDENCE,'PLACES_EVIDENCE.json'),path.join(EVIDENCE,'OFFICIAL_LOCATION_SOURCES.json'),path.join(AUDIT,'media/126-media-5.img')])boundFiles[f]=C.fileHash(f);
 return validate(seal({kind:'O30_MONTAGUE_CANONICAL_LOCATION_ONLY',ownerTaskId:OWNER,preparedUTC:atUTC,venuePath:VENUE,actions,expectedVenueEventPaths:events.map(d=>d.path).sort(),protectedRemovedPaths:REMOVED.map(id=>VENUE+'/events/'+id),boundFiles,feedVersion:C.feedVersion(feed),writeAccounting:{updates:8,archives:8,forward:17},authority:'Requires current direct user scope, independent exact review, exclusive root lane and fresh transactional native/parser guards.'}));
}
function validate(p){
 C.verifyDigest(p);assert.equal(p.kind,'O30_MONTAGUE_CANONICAL_LOCATION_ONLY');assert.equal(p.ownerTaskId,OWNER);assert.equal(p.actions.length,8);assert.equal(p.writeAccounting.forward,17);
 assert.deepEqual(p.actions.map(a=>a.path).sort(),[VENUE,...IDS.map(id=>VENUE+'/events/'+id)].sort());
 assert.deepEqual(p.expectedVenueEventPaths,IDS.map(id=>VENUE+'/events/'+id).sort());assert.deepEqual(p.protectedRemovedPaths,REMOVED.map(id=>VENUE+'/events/'+id));
 for(const a of p.actions){
  assert(a.before.exists&&a.before.updateTime&&a.before.createTime);assert.equal(a.before.path,a.path);assert.deepEqual(a.mask,[...new Set(a.mask)].sort());
  const allowed=a.path===VENUE?['address','addressSource','addressUpdatedAt','coordinates','googlePlaceId','latitude','longitude','updatedAt']:['address','addressNormalizationIssues','addressSource','addressUpdatedAt','latitude','longitude','normalizedAddress','rawAddress','updatedAt'];
  assert.deepEqual(a.mask,allowed.sort());
  for(const k of new Set([...Object.keys(a.before.fields),...Object.keys(a.afterFields)]))if(!a.mask.includes(k))assert.deepEqual(a.before.fields[k],a.afterFields[k],'Unreviewed field '+k);
  assert.equal(a.afterFields.address.stringValue,ADDRESS);assert.equal(a.afterFields.latitude.doubleValue,46.156867999999996);assert.equal(a.afterFields.longitude.doubleValue,-62.644596299999996);
  assert.equal(a.afterFields.addressSource.stringValue,'reviewed_official_library_and_google_places');
  assert.equal(a.afterFields.addressUpdatedAt.timestampValue,p.preparedUTC);assert.equal(a.afterFields.updatedAt.timestampValue,p.preparedUTC);
  if(a.path===VENUE){
   assert.deepEqual(a.afterFields.coordinates,{mapValue:{fields:{latitude:nv(46.156867999999996),longitude:nv(-62.644596299999996)}}});
   assert.equal(a.afterFields.googlePlaceId.stringValue,'ChIJC1u6sIdoXksRH-9YCFtll9I');
  }else{
   assert.equal(a.afterFields.rawAddress.stringValue,ADDRESS);assert.equal(a.afterFields.normalizedAddress.stringValue,ADDRESS);
   assert.deepEqual(a.afterFields.addressNormalizationIssues,{arrayValue:{values:[]}});
  }
  assert.equal(a.archivePath,'event_integrity_backups/o30_montague_'+C.hash(a.path).slice(0,20));
 }
 return p;
}
function writes(p,feed){validate(p);return[...p.actions.flatMap(a=>[
 {update:{name:C.PREFIX+a.archivePath,fields:{reviewId:sv(p.kind),planDigest:sv(p.digest),originalPath:sv(a.path),originalCreateTime:sv(a.before.createTime),originalUpdateTime:sv(a.before.updateTime),nativeFieldsJSON:sv(JSON.stringify(a.before.fields)),maskJSON:sv(JSON.stringify(a.mask))}},currentDocument:{exists:false}},
 {update:{name:C.PREFIX+a.path,fields:Object.fromEntries(a.mask.map(k=>[k,a.afterFields[k]]))},updateMask:{fieldPaths:a.mask},currentDocument:{updateTime:a.before.updateTime}}
 ]),C.feedWrite(feed)];}
function equivalent(a,b){return C.hash(normalize(a))===C.hash(normalize(b));}
function normalize(x){if(Array.isArray(x))return x.map(normalize);if(!x||typeof x!=='object')return x;const o=Object.fromEntries(Object.entries(x).map(([k,v])=>[k,normalize(v)]));if('arrayValue'in o&&Object.keys(o.arrayValue).length===0)o.arrayValue.values=[];return o;}
function check(p,documents,events,mode='before',receipt){
 validate(p);assert(['before','after'].includes(mode));const m=new Map(documents.map(d=>[d.path,d]));
 assert.deepEqual(events.map(d=>d.path).sort(),p.expectedVenueEventPaths,'Venue routing drift');
 for(const a of p.actions){const d=m.get(a.path);assert(d?.exists,'Target absent '+a.path);assert(equivalent(d.fields,mode==='before'?a.before.fields:a.afterFields),'Native fields drift '+a.path);assert.equal(d.updateTime,mode==='before'?a.before.updateTime:receipt.response.writeResults[p.actions.indexOf(a)*2+1].updateTime);const ar=m.get(a.archivePath);assert(ar,'Archive absence/read guard missing');if(mode==='before')assert.equal(ar.exists,false);else {assert(ar.exists);assert.deepEqual(JSON.parse(ar.fields.nativeFieldsJSON.stringValue),a.before.fields);assert.equal(ar.fields.planDigest.stringValue,p.digest);}}
 for(const key of p.protectedRemovedPaths)assert.equal(m.get(key)?.exists,false,'Retired duplicate reappeared '+key);
 return true;
}
module.exports={C,CORE,OWNER,VENUE,IDS,REMOVED,AUDIT,EVIDENCE,read,clone,seal,make,validate,writes,check,equivalent,decode};
