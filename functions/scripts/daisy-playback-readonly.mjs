import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
const credential=JSON.parse(await fs.readFile(process.env.DAISY_CREDENTIAL_PATH,'utf8'));
assert.equal(credential.project_id,'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(credential),projectId:'gathr-migrated'});
const {parseXlsxFile}=await import('../lib/services/driveService.js');
const {applySharedFoodOfferVenue,sharedFoodOfferOwner,sharedPostMetadata,sharedFoodOfferReviewContext}=await import('../lib/services/sharedFoodOfferVenue.js');
const {buildUnrecognizedVenueSample}=await import('../lib/services/firestoreService.js');
const {hydrateSampleTopLevelUrls}=await import('../lib/services/unknownVenueResolver.js');
const {resolveVenueForFullParserEventWithMatcherForRegression}=await import('../lib/processing/rowProcessor.js');
const {findMatchingVenue}=await import('../lib/services/firestoreService.js');
const out='artifacts/daisy-oct14',capture=JSON.parse(await fs.readFile(`${out}/capture.json`,'utf8'));
const events=JSON.parse(await fs.readFile(`${out}/all-events.json`,'utf8'));
const venues=JSON.parse(await fs.readFile(`${out}/all-venues.json`,'utf8'));
const parsed=await parseXlsxFile(await fs.readFile(`${out}/original-dataset.xlsx`));
const row=parsed.rows.find(x=>x.uniqueId==='1738543821054078');assert(row);
assert.equal(row.sharedPostAuthorName,'Daisy’s Dairy Bar and Grill');
const source=capture.snapshots[0].data.stages.find(x=>x.stage==='format').output;
const publisher={id:'slug_peifoodies',...capture.venues.find(x=>x.path.endsWith('/slug_peifoodies')).data};
const playback=[];for(const item of source.events){
 const corrected=applySharedFoodOfferVenue(item,row,publisher);const attempts=[];
 const selected=await resolveVenueForFullParserEventWithMatcherForRegression({item,row,rowVenue:publisher,establishment:publisher.name,rowIndex:29,
  matcher:async(name,url,context)=>{const result=await findMatchingVenue(name,url,context);attempts.push({name,url,result});return result;}});
 assert.equal(selected,null);assert.equal(corrected.startTime,'');assert.equal(corrected.endTime,'');assert.equal(corrected.establishment,row.sharedPostAuthorName);
 const review=buildUnrecognizedVenueSample({venueName:row.sharedPostAuthorName,source:'full5stage_event',fileId:'captured-source-only',rowIndex:29,
   ...sharedFoodOfferReviewContext(corrected,row,publisher)},'daisys dairy bar and grill');
 assert.equal(review.aggregatorAddress,undefined);assert.equal(review.aggregatorFacebookUrl,row.sharedPostAuthorUrl);assert.equal(review.topLevelUrl,row.sharedPostUrl);
 const held={id:'read-only-fixture',establishment:row.sharedPostAuthorName,establishmentNormalized:'daisys dairy bar and grill',status:'manual_review',occurrences:1,sampleEvents:[review]};
 const hydrated=await hydrateSampleTopLevelUrls(held,async()=>{throw new Error('Publisher read forbidden');},async()=>{throw new Error('Write forbidden');});
 assert.equal(hydrated,held);
 playback.push({original:item,corrected,selected,attempts,review});
}
const paired=[];for(const event of events){if(event.data.category!=='Food Special')continue;
 const sourceRow=parsed.rows.find(x=>x.uniqueId===String(event.data.uniqueId||'').split('_')[0]);if(!sourceRow)continue;
 const venueId=event.data.venueId||event.path.split('/')[1];const venue=venues.find(x=>x.path===`venues/${venueId}`);
 const owner=sharedFoodOfferOwner(event.data,sourceRow,venue?.data);if(owner)paired.push({path:event.path,source:sourceRow.uniqueId,publisher:venue?.data.name,originalAuthor:owner,originalAuthorUrl:sourceRow.sharedPostAuthorUrl});
}
const otherSources=parsed.rows.filter(x=>x.sharedPostAuthorName && x.sharedPostAuthorName!==x.userName);
const result={checkedAt:new Date().toISOString(),project:'gathr-migrated',sourceFile:'1I3vDBQk5prUtMaNBDvfM9TaZHWkKHQkM',sourceRows:parsed.rows.length,sharedAuthorRows:otherSources.length,
  preservedSource:sharedPostMetadata(row),playback,scan:{liveDocuments:events.length,paired,limits:'Live source identity compared with the complete original August14 workbook only. Other source workbooks and shared-post categories remain outside this bounded scan; no global zero-issue claim.'}};
await fs.writeFile(`${out}/playback-and-scan.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({sourceRows:parsed.rows.length,sharedAuthorRows:otherSources.length,playback:playback.map(x=>({name:x.corrected.establishment,pattern:x.corrected.recurringPattern,start:x.corrected.startTime,end:x.corrected.endTime,selected:x.selected,attempts:x.attempts.map(y=>({name:y.name,type:y.result.matchType,id:y.result.matchedVenue?.id}))})),paired}));
