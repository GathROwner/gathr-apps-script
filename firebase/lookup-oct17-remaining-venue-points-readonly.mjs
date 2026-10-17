/** Eight bounded read-only Places lookups, cached locally; no Firestore writes. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const proposal=JSON.parse(await fs.readFile(new URL('./artifacts/oct17-remaining-followups/venue-evidence/reviewed-recovery-proposal.json',import.meta.url),'utf8'));
assert.equal(proposal.venueCandidates.length,8);assert.equal(proposal.existingCanonicalMatches.length,0);
const out=new URL('./artifacts/oct17-remaining-followups/venue-points-readonly.json',import.meta.url);
try {await fs.access(out);console.log('Existing saved Places results; no lookup repeated.');process.exit(0);}catch(error){if(error.code!=='ENOENT')throw error;}
const env=await fs.readFile(new URL('../functions/artifacts/oct17-eight-group-release/parser-release/.env',import.meta.url),'utf8');
const match=env.match(/^GOOGLE_PLACES_API_KEY\s*=\s*(.+)$/m);assert(match,'Existing Places configuration unavailable');
const key=match[1].trim().replace(/^(['"])(.*)\1$/,'$2');assert(key.length>10);
const results=[];
for(const c of proposal.venueCandidates){
 const query=`${c.name} ${c.address}, ${c.city}, Prince Edward Island Canada`;
 const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,
  'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus'},
  body:JSON.stringify({textQuery:query,maxResultCount:3,regionCode:'CA'}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();results.push({candidateKey:c.key,query,status:response.status,places:data.places||[],errorCode:data.error?.code,errorStatus:data.error?.status});
 await fs.writeFile(out,JSON.stringify({checkedAt:new Date().toISOString(),lookupLimit:8,actualLookups:results.length,complete:results.length===8,results,liveWrites:0,modelCalls:0},null,2));
 if(!response.ok)break;
}
console.log(JSON.stringify({lookups:results.length,results:results.map(r=>({key:r.candidateKey,status:r.status,places:r.places.map(p=>({id:p.id,name:p.displayName?.text,address:p.formattedAddress,point:p.location,status:p.businessStatus,types:p.types}))})),liveWrites:0,modelCalls:0}));
