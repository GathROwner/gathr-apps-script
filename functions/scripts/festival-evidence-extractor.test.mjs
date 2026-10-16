import test from 'node:test';import assert from 'node:assert/strict';
import {validateFestivalEvidenceCapture,extractFestivalEvidence,extractFestivalEvidencePerImage,expandCaptionDateScope} from './festival-evidence-extractor.mjs';
const caption='Anchor Fest 2026 programme';
const row='Film One | October 16, 2026 | 7:00 PM | Cinema';
const input={caption,imageUrls:['https://example.test/poster.jpg']};
const fixture=()=>({complete:true,limitations:[],documents:[{index:-1,text:caption},{index:0,text:row}],activities:[{kind:'programme_row',sourceIndices:[-1,0],scopeText:row,membershipText:caption,eventText:'Film One',dateText:'October 16, 2026',timeText:'7:00 PM',venueText:'Cinema'}]});
test('requires complete ordered gallery and exact caption capture',()=>{assert(validateFestivalEvidenceCapture(fixture(),input));let x=fixture();x.documents.pop();assert.throws(()=>validateFestivalEvidenceCapture(x,input),/gallery_omitted/);x=fixture();x.documents[0].text='different';assert.throws(()=>validateFestivalEvidenceCapture(x,input),/caption/);});
test('cannot borrow a clock or venue from another card',()=>{const x=fixture();x.documents.push({index:1,text:'8:00 PM Other Hall'});x.activities[0].timeText='8:00 PM';assert.equal(validateFestivalEvidenceCapture(x,{...input,imageUrls:[...input.imageUrls,'https://example.test/two.jpg']}).activities[0].captureHoldReason,'cross_card_excerpt');});
test('unknown image indices and invented row scopes hold',()=>{let x=fixture();x.activities[0].sourceIndices=[2];assert.throws(()=>validateFestivalEvidenceCapture(x,input),/invalid_activity/);x=fixture();x.activities[0].scopeText='Made up';assert.throws(()=>validateFestivalEvidenceCapture(x,input),/invented/);});
test('missing or unreadable source never becomes caption-only',()=>{const x=fixture();x.complete=false;assert.throws(()=>validateFestivalEvidenceCapture(x,input),/source_incomplete/);});
test('large galleries hold instead of silently truncating',async()=>{await assert.rejects(extractFestivalEvidence({caption,imageUrls:Array(21).fill('https://example.test/a'),apiKey:'test'}),/source_size/);});
test('incomplete API responses cannot yield membership evidence',async()=>{await assert.rejects(extractFestivalEvidence({...input,edition:{},apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}),{status:200})}),/incomplete/);});
test('shared caption date heading expands as an exact original substring',()=>{const text='Thursday, October 15, 2026 events:\n7:00 PM Cinema: Film One\nFriday, October 16, 2026 events:\n8:00 PM Cinema: Film Two';const item={scopeText:'8:00 PM Cinema: Film Two',dateText:'Friday, October 16, 2026',sourceIndices:[-1]};const expanded=expandCaptionDateScope(item,[{index:-1,text}]);assert.equal(expanded.dateHeaderText,'Friday, October 16, 2026 events:');assert(text.includes(expanded.scopeText));assert.equal(expanded.activityRowText,item.scopeText);});
test('another day or a repeated identical row cannot supply governing date',()=>{const text='Thursday, October 15, 2026 events:\n7:00 PM Cinema: Film One\nFriday, October 16, 2026 events:\n8:00 PM Cinema: Film Two';const item={scopeText:'8:00 PM Cinema: Film Two',dateText:'Thursday, October 15, 2026',sourceIndices:[-1]};assert.equal(expandCaptionDateScope(item,[{index:-1,text}]).activityRowText,undefined);});
test('whole-row event quotes narrow only to a literal printed activity name',()=>{const x=fixture();x.activities[0].name='Film One';x.activities[0].eventText=row;const captured=validateFestivalEvidenceCapture(x,input);assert.equal(captured.activities[0].eventText,'Film One');assert.equal(captured.activities[0].originalEventText,row);const y=fixture();y.activities[0].name='Invented film';y.activities[0].eventText=row;assert.equal(validateFestivalEvidenceCapture(y,input).activities[0].eventText,row);});

test('identical conference rows under different dates retain their own literal offsets',()=>{
 const row='9:00 am - Cinema: ANCHOR Fest Conference',h15='Thursday, October 15, 2026 events:',h16='Friday, October 16, 2026 events:';
 const caption=`${h15}\n${row}\n${h16}\n${row}`;
 const value={complete:true,limitations:[],documents:[{index:-1,text:caption}],activities:[h15,h16].map(h=>({kind:'festival_activity',sourceIndices:[-1],scopeText:row,membershipText:'ANCHOR Fest Conference',name:'ANCHOR Fest Conference',eventText:'ANCHOR Fest Conference',dateText:h.replace(' events:',''),timeText:'9:00 am',venueText:'Cinema'}))};
 const result=validateFestivalEvidenceCapture(value,{caption,imageUrls:[]});
 assert(result.activities.every(x=>x.captionScope&&!x.captureHoldReason));
 assert(result.activities[0].captionScope.rowStart<result.activities[1].captionScope.rowStart);
});

test('image programme rows retain their own preceding French/English date heading',()=>{
 for(const [heading,time]of [['FRIDAY, OCTOBER 16','6 p.m.'],['VENDREDI 16 OCTOBRE','18 h']]){
  const row=`${time}\nShow\nLocation: Hall`,caption='Festival 2026 programme';
  const value={complete:true,limitations:[],documents:[{index:-1,text:caption},{index:0,text:heading+'\n'+row}],activities:[{kind:'programme_row',sourceIndices:[-1,0],scopeText:row,membershipText:caption,name:'Show',eventText:'Show',dateText:heading,timeText:time,venueText:'Hall'}]};
  const result=validateFestivalEvidenceCapture(value,{caption,imageUrls:['https://example.test/poster.jpg']});assert(result.activities[0].sourceScope);assert(!result.activities[0].captureHoldReason);
 }
});
test('shared caption venue is allowed only through exact caption context offsets',()=>{
 const caption='Harvest Fest\nJoin us Saturday, October 17, at Hall!\nSalty Sailors | 3–5 PM';
 const activity={kind:'festival_activity',sourceIndices:[-1],scopeText:'Salty Sailors | 3–5 PM',membershipText:'Harvest Fest',name:'Salty Sailors',eventText:'Salty Sailors',dateText:'Saturday, October 17',timeText:'3–5 PM',venueText:'Hall'};
 const result=validateFestivalEvidenceCapture({complete:true,limitations:[],documents:[{index:-1,text:caption}],activities:[activity]},{caption,imageUrls:[]});assert(!result.activities[0].captureHoldReason);assert(result.activities[0].sourceScope);
});
test('bounded image recovery requires an exact output-limit failure and preserves all original image indices',async()=>{
 const imageUrls=['https://example.test/french.jpg','https://example.test/english.jpg'];
 const failedCapture={capture:{caption,imageUrls},error:'evidence_response_incomplete',diagnostics:{rawResponses:[{incomplete_details:{reason:'max_output_tokens'}}]}};
 let calls=0;
 const result=await extractFestivalEvidencePerImage({caption,imageUrls,edition:{id:'fixture'},apiKey:'fixture',failedCapture,fetchImpl:async()=>{
  const pass=Math.floor(calls/2),extract=calls++%2===0;
  const value=extract?{complete:true,limitations:[],documents:[{index:-1,text:caption},{index:0,text:'FRIDAY, OCTOBER 16\n6 p.m.\nShow '+pass+'\nHall'}],activities:[{kind:'programme_row',sourceIndices:[-1,0],scopeText:'6 p.m.\nShow '+pass+'\nHall',membershipText:caption,name:'Show '+pass,eventText:'Show '+pass,dateText:'FRIDAY, OCTOBER 16',timeText:'6 p.m.',venueText:'Hall'}]}:{checks:[{index:0,accepted:true,reason:'literal source'}]};
  return new Response(JSON.stringify({status:'completed',output_text:JSON.stringify(value)}));
 }});
 assert.equal(calls,4);assert.deepEqual(result.documents.map(d=>d.index),[-1,0,1]);assert.deepEqual(result.activities.map(a=>a.sourceScope.documentIndex),[0,1]);assert.deepEqual(result.activities.map(a=>a.sourceIndices),[[-1,0],[-1,1]]);assert(result.activities.every(a=>a.verification.accepted));
 await assert.rejects(extractFestivalEvidencePerImage({caption,imageUrls,edition:{},apiKey:'test',failedCapture:{...failedCapture,error:'timeout'}}),/matching_output_limit/);
 await assert.rejects(extractFestivalEvidencePerImage({caption,imageUrls:[...imageUrls,'https://example.test/extra'],failedCapture}),/two_images/);
});
test('failure in a later image keeps earlier paid-call accounting and never yields partial complete evidence',async()=>{
 const imageUrls=['https://example.test/one.jpg','https://example.test/two.jpg'];let calls=0;
 const failedCapture={capture:{caption,imageUrls},error:'evidence_response_incomplete',diagnostics:{rawResponses:[{incomplete_details:{reason:'max_output_tokens'}}]}};
 await assert.rejects(extractFestivalEvidencePerImage({caption,imageUrls,edition:{},apiKey:'fixture',failedCapture,fetchImpl:async()=>{
  calls++;return calls===1?new Response(JSON.stringify({status:'completed',output_text:JSON.stringify({complete:true,limitations:[],documents:[{index:-1,text:caption},{index:0,text:'No member activities'}],activities:[]})})):new Response(JSON.stringify({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}));
 }}),error=>{assert.equal(error.evidenceDiagnostics.requests.length,2);assert.equal(error.evidenceDiagnostics.rawResponses.length,2);assert.equal(error.evidenceDiagnostics.sourcePasses.length,1);return true;});
});
test('revalidating derived legacy holds still requires an affirmative independent model check',()=>{
 const heading='FRIDAY, OCTOBER 16',row='6 p.m.\nShow\nHall';
 const value={complete:true,limitations:[],documents:[{index:-1,text:caption},{index:0,text:heading+'\n'+row}],activities:[{kind:'programme_row',sourceIndices:[-1,0],scopeText:row,membershipText:caption,name:'Show',eventText:'Show',dateText:heading,timeText:'6 p.m.',venueText:'Hall',captureHoldReason:'cross_card_excerpt',verification:{accepted:false},modelVerification:{accepted:true,reason:'literal source'}}]};
 const result=validateFestivalEvidenceCapture(value,input);assert(result.activities[0].verification.accepted);assert.equal(value.activities[0].captureHoldReason,'cross_card_excerpt','Original cache mutated');
 value.activities[0].modelVerification.accepted=false;assert(!validateFestivalEvidenceCapture(value,input).activities[0].verification.accepted);
 delete value.activities[0].modelVerification;assert(!validateFestivalEvidenceCapture(value,input).activities[0].verification.accepted);
});
