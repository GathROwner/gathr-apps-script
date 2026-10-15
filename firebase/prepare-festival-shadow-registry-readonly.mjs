// Bootstrap edition identities ONLY from already reviewed, published area data.
// This does not approve new festivals, venues, source bindings, or events.
import fs from 'node:fs/promises';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../functions/package.json',import.meta.url)),admin=require('firebase-admin');
const {festivalShadowFingerprint}=require('../functions/lib/services/festivalLinkShadowJob.js');
const args=process.argv.slice(2),opt=n=>args.find(x=>x.startsWith(`--${n}=`))?.slice(n.length+3);
const asOf=opt('as-of');assert(/^20\d{2}-\d{2}-\d{2}$/.test(asOf||''),'Explicit local audit date required');
const output=path.resolve(opt('out'));const credential=JSON.parse(await fs.readFile(process.env.ANCHOR_CREDENTIAL_PATH,'utf8'));assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:credential.project_id});const db=admin.firestore();
try{
 const area=await db.collection('events').where('locationScope','==','area').limit(1001).get();assert(area.size<=1000,'Incomplete umbrella scan');const editions=[],held=[];
 for(const doc of area.docs){const e=doc.data();if(!e.startDate||!e.endDate||e.endDate<asOf||!e.areaData?.locations?.length)continue;
  if(!e.cityLevelReviewId||!/^20\d{2}/.test(e.startDate)||e.startDate.slice(0,4)!==e.endDate.slice(0,4)){held.push({id:doc.id,reason:'edition_identity_unreviewed_or_cross_year'});continue;}
  const review=await db.doc(`city_level_event_reviews/${e.cityLevelReviewId}`).get(),r=review.data();
  if(!r||r.status!=='published'||r.publishedEventPath!==doc.ref.path||r.finalization?.action!=='approve_publish'||!r.finalization?.manual?.areaData){held.push({id:doc.id,reason:'reviewed_edition_authority_missing'});continue;}
  let name=String(e.eventName||'').replace(/\s+20\d{2}\s*$/,'').trim();if(!/\b(?:fest|festival|week)\b/i.test(name)){held.push({id:doc.id,reason:'not_a_verified_festival_edition'});continue;}
  const reviewedName=(r.areaEventLinks||[]).map(p=>p.festivalName).find(n=>String(n||'').toLowerCase()===name.toLowerCase());if(reviewedName)name=reviewedName;
  const organizerId='edition_authority_'+festivalShadowFingerprint({review:review.ref.path,name}).slice(0,24);
  const sourceBindings={};let official;
  try{official=new URL(e.areaData.sourceUrl);}catch{}
  for(const proof of r.areaEventLinks||[]){let url;try{url=new URL(proof.sourceUrl);}catch{continue;}
   if(!official||url.origin!==official.origin||!url.pathname.replace(/\//g,''))continue;
   const sourceId=url.toString();sourceBindings[sourceId]={organizerId,sourceUrl:sourceId,authority:review.ref.path};
  }
  editions.push({id:doc.id,name,year:Number(e.startDate.slice(0,4)),startDate:e.startDate,endDate:e.endDate,organizerId,organizerNames:[name],sourceIds:Object.keys(sourceBindings).sort(),sourceBindings,
   venueIds:[...new Set(e.areaData.locations.filter(x=>x.certainty==='confirmed'&&x.venueId).map(x=>x.venueId))].sort(),
   venueAliases:Object.fromEntries(e.areaData.locations.filter(x=>x.certainty==='confirmed'&&x.venueId).map(p=>[p.venueId,[...new Set([p.label,...(r.areaEventLinks||[]).filter(x=>x.venueId===p.venueId).map(x=>x.sourceVenueText)])].filter(Boolean).sort()])),
   authority:{kind:'reviewed_edition',reviewPath:review.ref.path,reviewRevision:review.updateTime.toDate().toISOString(),eventPath:doc.ref.path,eventRevision:doc.updateTime.toDate().toISOString()}});
 }
 const registry={version:1,capturedAt:new Date().toISOString(),asOf,editions:editions.sort((a,b)=>a.id.localeCompare(b.id)),held,mode:'shadow',eventWrites:0};
 await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(registry,null,2));console.log(JSON.stringify({editions:editions.length,held:held.length,eventWrites:0,output}));
}finally{await admin.app().delete();}
