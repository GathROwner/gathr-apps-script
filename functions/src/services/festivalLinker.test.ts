import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFestivalMembership} from './festivalLinker.js';
import type {FestivalEdition,FestivalSourceEvidence,FestivalCanonicalVenue,FestivalCanonicalRecord} from './festivalLinker.js';

const edition=():FestivalEdition=>({id:'festival_fixture',name:'ANCHOR Fest',year:2026,startDate:'2026-10-14',endDate:'2026-10-18',
  organizerId:'organizer_fixture',organizerNames:['AMPA'],sourceIds:['programme_source']});
const venue=():FestivalCanonicalVenue=>({id:'tivoli_fixture',label:'The Tivoli Cinema',aliases:['Tivoli Cinema'],latitude:46.2,longitude:-63.1});
const child=():FestivalCanonicalRecord=>({path:'venues/tivoli_fixture/events/screening_fixture',data:{eventName:'Unholy Night',venueId:'tivoli_fixture',
  startDate:'2026-10-17',endDate:'2026-10-17',startTime:'19:00',isRecurring:'No'}});
const programme=():FestivalSourceEvidence=>{
  const header='ANCHOR Fest 2026 Programme',row='Unholy Night | October 17 | 7:00 pm | Tivoli Cinema';
  return {id:'row_fixture',source:{id:'programme_source',url:'https://festival.example/film',text:header+'\n'+row,publisherId:'publisher_fixture',organizerId:'organizer_fixture',revision:'revision_fixture'},
    kind:'programme_row',scopeText:row,membershipText:header,festivalNameText:'ANCHOR Fest',yearText:'2026',
    activity:{name:'Unholy Night',venueId:'tivoli_fixture',startDate:'2026-10-17',startTime:'19:00'},eventText:'Unholy Night',dateText:'October 17',timeText:'7:00 pm',venueText:'Tivoli Cinema'};
};
const cross=():FestivalSourceEvidence=>{
  const e=programme();e.id='cross_fixture';e.kind='festival_activity';e.membershipText='This screening is part of ANCHOR Fest 2026, presented by AMPA.';
  e.organizerText='AMPA';e.scopeText+='\n'+e.membershipText;e.source={...e.source,id:'tivoli_post',organizerId:undefined,url:'https://social.example/posts/cross_fixture',text:e.scopeText};return e;
};
const input=()=>({umbrella:edition(),sources:[programme()],candidates:[child()],venues:[venue()]});
const reason=async(e:FestivalSourceEvidence)=>(await resolveFestivalMembership({...input(),sources:[e]})).outcomes[0].reason;
function changeText(e:FestivalSourceEvidence,from:string,to:string):void{
  e.scopeText=e.scopeText.replaceAll(from,to);e.membershipText=e.membershipText.replaceAll(from,to);e.source.text=e.source.text.replaceAll(from,to);
}

test('same-source programme header binds the complete scoped row to one canonical child',async()=>{
  const result=await resolveFestivalMembership(input());assert.equal(result.links.length,1);assert.equal(result.outcomes[0].status,'eligible');
  assert.equal(result.links[0].eventPath,child().path);assert.equal(result.links[0].point.id,'venue_tivoli_fixture');
  assert.equal(result.links[0].evidence[0].sourceText,programme().membershipText+'\n'+programme().scopeText);
  assert.match(result.links[0].fingerprint,/^[a-f0-9]{64}$/);assert.equal(result.links[0].provenance[0].sourceText,programme().source.text);
});
test('separate original venue post explicitly binding activity to edition and organizer qualifies',async()=>{
  const result=await resolveFestivalMembership({...input(),sources:[cross()]});assert.equal(result.links.length,1);assert.equal(result.outcomes[0].status,'eligible');
});
test('separately posted festival-named heading with organizer and full occurrence facts qualifies',async()=>{
  const e=cross();e.membershipText='ANCHOR Fest 2026: Unholy Night\nPresented by AMPA';e.scopeText=programme().scopeText+'\n'+e.membershipText;e.source.text=e.scopeText;
  assert.equal(await reason(e),'eligible');
});
test('unrelated Tivoli activity at same venue/date/time is not a festival member',async()=>{
  const e=cross();e.membershipText='Tivoli Cinema presents Unholy Night. AMPA festival visitors welcome.';e.scopeText=programme().scopeText+'\n'+e.membershipText;e.source.text=e.scopeText;
  assert.notEqual(await reason(e),'eligible');
});
test('festival branding, publisher, source ID, and homepage/domain alone cannot qualify',async()=>{
  const homepage=programme();homepage.source.url='https://festival.example/';assert.equal(await reason(homepage),'invalid_source');
  const branding=cross();branding.membershipText='ANCHOR Fest 2026 AMPA';branding.scopeText=programme().scopeText+'\n'+branding.membershipText;branding.source.text=branding.scopeText;
  assert.equal(await reason(branding),'membership_not_explicit');
  const idOnly=programme();idOnly.membershipText='Programme';idOnly.source.text='Programme\n'+idOnly.scopeText;assert.equal(await reason(idOnly),'edition_conflict');
});
test('wrong year, different festival and same-name different organizer fail closed',async()=>{
  const year=programme();changeText(year,'2026','2025');year.yearText='2025';assert.equal(await reason(year),'edition_conflict');
  const name=programme();changeText(name,'ANCHOR Fest','Other Festival');name.festivalNameText='Other Festival';assert.equal(await reason(name),'edition_conflict');
  const organizer=programme();organizer.source.organizerId='different_organizer';assert.equal(await reason(organizer),'edition_conflict');
  const crossOrganizer=cross();changeText(crossOrganizer,'AMPA','Other Org');crossOrganizer.organizerText='Other Org';assert.equal(await reason(crossOrganizer),'edition_conflict');
});
test('incidental cast/director history and festival mention cannot assert current membership',async()=>{
  for(const subject of ['The director previously','A cast member previously','Our sponsor previously']) {
    const e=cross();e.membershipText=`${subject} appeared as part of ANCHOR Fest 2026, presented by AMPA.`;e.scopeText=programme().scopeText+'\n'+e.membershipText;e.source.text=e.scopeText;
    assert.equal(await reason(e),'membership_not_explicit');
  }
});
test('programme source must be edition-bound; identical domain or publisher is insufficient',async()=>{
  const e=programme();e.source.id='unbound_source';assert.equal(await reason(e),'unbound_programme');
  e.source.id='programme_source';e.source.organizerId=undefined;assert.equal(await reason(e),'unbound_programme');
});
test('title/date/time/venue excerpts must all occur in the same row/card, not elsewhere in gallery',async()=>{
  for(const field of ['eventText','dateText','timeText','venueText'] as const){
    const e=programme();e.scopeText=e.scopeText.replace(e[field],'');e.source.text=e.membershipText+'\n'+e.scopeText+'\nOther card: '+e[field];
    assert.equal(await reason(e),'evidence_missing');
  }
  const missing=programme();missing.scopeText='not in the original source';assert.equal(await reason(missing),'evidence_missing');
});
test('a different programme heading before the row prevents header borrowing',async()=>{
  const e=programme();e.source.text=e.membershipText+'\nAnother Festival 2026 Programme\n'+e.scopeText;
  assert.equal(await reason(e),'unbound_programme');
});
test('source clocks and dates must match extracted canonical occurrence, not claimed structured fields',async()=>{
  const time=programme();changeText(time,'7:00 pm','8:00 pm');time.timeText='8:00 pm';assert.equal(await reason(time),'source_occurrence_conflict');
  const date=programme();changeText(date,'October 17','October 16');date.dateText='October 16';assert.equal(await reason(date),'source_occurrence_conflict');
});
test('missing or malformed clocks and out-of-range/invalid dates are held without invention',async()=>{
  const missing=programme();missing.timeText='';missing.activity.startTime='';assert.equal(await reason(missing),'missing_clock');
  const bad=programme();bad.activity.startTime='7pm';assert.equal(await reason(bad),'missing_clock');
  const range=programme();range.activity.startDate='2026-10-20';assert.equal(await reason(range),'outside_edition');
  const invalid=programme();invalid.activity.startDate='2026-02-30';assert.equal(await reason(invalid),'invalid_occurrence');
});
test('unknown or duplicate venue identity is held; aliases are exact and vetted',async()=>{
  const e=programme();e.activity.venueId='unknown';assert.equal(await reason(e),'unknown_venue');
  const fuzzy=programme();changeText(fuzzy,'Tivoli Cinema','Tivoli Cinemas nearby');fuzzy.venueText='Tivoli Cinemas nearby';assert.equal(await reason(fuzzy),'unknown_venue');
  const duplicate=await resolveFestivalMembership({...input(),venues:[venue(),venue()]});assert.equal(duplicate.outcomes[0].reason,'unknown_venue');
});
test('multiple canonical matches and conflicting snapshots cannot be chosen by input order or expected path',async()=>{
  const c=child(),other={...child(),path:'venues/tivoli_fixture/events/other_fixture'};const e=programme();e.activity.eventPath=c.path;
  const result=await resolveFestivalMembership({...input(),sources:[e],candidates:[c,other]});assert.equal(result.links.length,0);assert.equal(result.outcomes[0].reason,'ambiguous_canonical');
  const drift=await resolveFestivalMembership({...input(),candidates:[c,{...child(),data:{...c.data,description:'changed snapshot'}}]});assert.equal(drift.outcomes[0].reason,'ambiguous_canonical');
});
test('missing child is pending; mismatched expected path, changed time or venue never rematches',async()=>{
  const pending=await resolveFestivalMembership({...input(),candidates:[]});assert.equal(pending.outcomes[0].status,'unmatched');assert.equal(pending.outcomes[0].pending,true);assert.equal(pending.links.length,0);
  for(const change of [{startTime:'20:00'},{venueId:'other_venue'}]) {
    const e=programme();e.activity.eventPath=child().path;const result=await resolveFestivalMembership({...input(),sources:[e],candidates:[{...child(),data:{...child().data,...change}}]});
    assert.equal(result.outcomes[0].reason,'canonical_identity_conflict');assert.equal(result.links.length,0);
  }
});
test('recurring, generated, deleted, cancelled and rejected children cannot link',async()=>{
  for(const change of [{isRecurring:true},{isRecurring:'Yes'},{originalEventId:'parent_fixture'},{isRecurringInstance:true},
    {deleted:true},{cancelled:true},{status:'cancelled'},{status:'canceled'},{status:'deleted'},{status:'rejected'},
    {isCancelled:true},{isExpired:true},{canceled:'yes'},{expired:'true'},{recurringPattern:'weekly_friday'}]) {
    const result=await resolveFestivalMembership({...input(),candidates:[{...child(),data:{...child().data,...change}}]});assert.equal(result.outcomes[0].reason,'inactive_or_noncanonical_child');assert.equal(result.links.length,0);
  }
});
test('false cancellation/expiry strings are not coerced to true',async()=>{
  const c={...child(),data:{...child().data,canceled:'false',isCancelled:'no',isExpired:false,isRecurringInstance:'false'}};
  assert.equal((await resolveFestivalMembership({...input(),candidates:[c]})).links.length,1);
});
test('canonical child end outside edition is held by existing publication validator',async()=>{
  const result=await resolveFestivalMembership({...input(),candidates:[{...child(),data:{...child().data,endDate:'2026-10-20'}}]});assert.equal(result.outcomes[0].reason,'source_occurrence_conflict');
});
test('exact ticket identity can resolve differing tickets, but homepage or unprinted ticket cannot',async()=>{
  const e=programme(),url='https://tickets.example/events/42/old-slug';e.activity.ticketUrl=url;e.scopeText+=' '+url;e.source.text=e.membershipText+'\n'+e.scopeText;
  const c={...child(),data:{...child().data,ticketsBuyUrl:'https://tickets.example/events/42/new-slug'}};
  const other={path:'venues/tivoli_fixture/events/other_fixture',data:{...child().data,ticketsBuyUrl:'https://tickets.example/events/99/other'}};
  assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[other,c]})).links[0].eventPath,c.path);
  e.activity.ticketUrl='https://tickets.example/';assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).outcomes[0].reason,'ticket_identity_conflict');
});
test('distinct same-clock titles/sessions remain separate and co-located canonical venues never merge',async()=>{
  const e=programme(),other=programme();other.id='other_row';changeText(other,'Unholy Night','Another Film');other.activity.name='Another Film';other.eventText='Another Film';
  other.activity.venueId='city_fixture';changeText(other,'Tivoli Cinema','City Cinema');other.venueText='City Cinema';
  const v={...venue(),id:'city_fixture',label:'City Cinema',aliases:[]};const c={path:'venues/city_fixture/events/other_film',data:{...child().data,eventName:'Another Film',venueId:'city_fixture'}};
  const result=await resolveFestivalMembership({...input(),sources:[e,other],venues:[venue(),v],candidates:[child(),c]});assert.equal(result.links.length,2);assert.notEqual(result.links[0].point.id,result.links[1].point.id);assert.deepEqual(result.links[0].point.coordinates,result.links[1].point.coordinates);
});
test('typography and director suffix normalization does not extend to fuzzy or substring titles',async()=>{
  const e=programme();changeText(e,'Unholy Night',"L’Autre (The Other)");e.activity.name="L'Autre (The Other)";e.eventText='L’Autre (The Other)';
  const c={...child(),data:{...child().data,eventName:"L'Autre (The Other) — Director Fixture"}};
  assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).links.length,1);
  c.data.eventName='Other';assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).links.length,0);
});
test('replay, retries and input order produce identical sorted immutable proposals without mutating snapshots',async()=>{
  const a=programme(),b=cross(),c=child(),v=venue();const original=JSON.stringify({a,b,c,v});
  const first=await resolveFestivalMembership({...input(),sources:[a,b,a],candidates:[c,c],venues:[v]});
  const second=await resolveFestivalMembership({...input(),sources:[b,a],candidates:[c],venues:[v]});
  assert.deepEqual(first,second);assert.equal(first.links.length,1);assert.equal(first.links[0].provenance.length,2);
  assert.equal(JSON.stringify({a,b,c,v}),original);assert(Object.isFrozen(first.links[0].provenance[0]));
  assert.throws(()=>{first.links[0].provenance[0].sourceText='mutated';});
  assert.deepEqual(Object.keys(first),Object.keys(first).sort());
});
test('conflicting revisions of one source activity are held rather than selected by source order',async()=>{
  const a=programme(),b=programme();b.source.revision='changed';const result=await resolveFestivalMembership({...input(),sources:[a,b]});
  assert.equal(result.links.length,0);assert(result.outcomes.every(x=>x.reason==='conflicting_source_evidence'));
});
test('shared exact ticket with contradictory occurrence claims holds every source',async()=>{
  const a=programme(),b=cross();for(const e of [a,b]){e.activity.ticketUrl='https://tickets.example/events/42/film';e.scopeText+=' '+e.activity.ticketUrl;e.source.text=e.kind==='programme_row'?e.membershipText+'\n'+e.scopeText:e.scopeText;}
  changeText(b,'7:00 pm','8:00 pm');b.timeText='8:00 pm';b.activity.startTime='20:00';
  const result=await resolveFestivalMembership({...input(),sources:[a,b]});assert.equal(result.links.length,0);assert(result.outcomes.every(x=>x.reason==='source_occurrence_conflict'));
});
test('wrong printed weekday, doors clock and incidental named-heading substrings are held',async()=>{
  const day=programme();changeText(day,'October 17','Sunday October 17');day.dateText='Sunday October 17';assert.equal(await reason(day),'source_occurrence_conflict');
  const doors=programme();changeText(doors,'7:00 pm','Doors 7:00 pm');assert.equal(await reason(doors),'source_occurrence_conflict');
  const e=cross();e.membershipText='ANCHOR Fest 2026: A talk about Unholy Night\nPresented by AMPA';e.scopeText=programme().scopeText+'\n'+e.membershipText;e.source.text=e.scopeText;assert.equal(await reason(e),'membership_not_explicit');
});
test('source identities remain opaque and edition-set ordering does not change fingerprints',async()=>{
  const e=programme();e.id='snapshot:row|item';e.source.id='dataset:post|edition';e.source.publisherId='facebook:publisher';
  const umbrella={...edition(),sourceIds:[e.source.id,'other'],organizerNames:['AMPA','Full Organizer Name']};
  const a=await resolveFestivalMembership({...input(),umbrella,sources:[e]});
  const b=await resolveFestivalMembership({...input(),umbrella:{...umbrella,sourceIds:[...umbrella.sourceIds].reverse(),organizerNames:[...umbrella.organizerNames].reverse()},sources:[e]});
  assert.equal(a.links.length,1);assert.deepEqual(a,b);
});
test('bound literal screenings headers may put the printed full edition year elsewhere in the card',async()=>{
  for(const header of ['ANCHOR FEST SCREENINGS AT TIVOLI CINEMA\n2026','ANCHOR FEST — TIVOLI CINEMA SCREENINGS — 2026']) {
    const e=programme();e.membershipText=header;e.festivalNameText='ANCHOR FEST';e.source.text=header+'\n'+e.scopeText;
    assert.equal(await reason(e),'eligible');
  }
});
test('bound programme typography can join festival name spacing and retain the literal alias in provenance',async()=>{
  const e=programme();e.membershipText='ANCHORFEST SCREENINGS AT TIVOLI CINEMA\n2026';e.festivalNameText='ANCHORFEST';e.source.text=e.membershipText+'\n'+e.scopeText;
  const result=await resolveFestivalMembership({...input(),sources:[e]});assert.equal(result.links.length,1);
  assert.equal(result.links[0].evidence[0].festivalName,'ANCHORFEST');assert.equal(result.links[0].provenance[0].sourceText,e.source.text);
});
test('bound separate-line or name-adjacent short logo year may identify this exact edition',async()=>{
  for(const header of ["ANCHOR FEST SCREENINGS AT TIVOLI CINEMA\n26","ANCHORFEST '26 SCREENINGS AT TIVOLI CINEMA"]) {
    const e=programme();e.membershipText=header;e.festivalNameText=header.startsWith('ANCHORFEST')?'ANCHORFEST':'ANCHOR FEST';e.yearText='26';e.source.text=header+'\n'+e.scopeText;
    assert.equal(await reason(e),'eligible');
  }
});
test('short year cannot come from a day, minutes, runtime, address or a larger number',async()=>{
  for(const suffix of ['October 26','26 October','7:26 pm','7 : 26 pm','26:00','26 minutes','126','2026-10-26','26 Kent Street','26 screenings']) {
    const e=programme();e.membershipText='ANCHOR FEST SCREENINGS AT TIVOLI CINEMA\n'+suffix;e.festivalNameText='ANCHOR FEST';e.yearText='26';e.source.text=e.membershipText+'\n'+e.scopeText;
    assert.notEqual(await reason(e),'eligible');
  }
  for(const suffix of ['26:00 SCREENINGS','26 October SCREENINGS','26 minutes SCREENINGS','26 Kent Street SCREENINGS']) {
    const e=programme();e.membershipText='ANCHOR FEST '+suffix;e.festivalNameText='ANCHOR FEST';e.yearText='26';e.source.text=e.membershipText+'\n'+e.scopeText;
    assert.notEqual(await reason(e),'eligible');
  }
});
test('historical/conflicting year and past performer headings never borrow the edition',async()=>{
  for(const header of ['ANCHOR FEST SCREENINGS AT TIVOLI CINEMA 2019','ANCHOR FEST SCREENINGS 2019\n26',
    'ANCHOR FEST SCREENINGS 2026\n2019','Performer previously at ANCHOR FEST 2026 SCREENINGS']) {
    const e=programme();e.membershipText=header;e.festivalNameText='ANCHOR FEST';e.yearText=header.endsWith('26')?'26':'2026';e.source.text=header+'\n'+e.scopeText;
    assert.notEqual(await reason(e),'eligible');
  }
});
test('short logo years require both edition-source and organizer binding; cross-source remains full-year strict',async()=>{
  for(const change of [{id:'unbound_source'},{organizerId:'other_organizer'}]) {
    const e=programme();e.membershipText='ANCHOR FEST SCREENINGS\n26';e.festivalNameText='ANCHOR FEST';e.yearText='26';e.source.text=e.membershipText+'\n'+e.scopeText;e.source={...e.source,...change};
    assert.notEqual(await reason(e),'eligible');
  }
  const e=cross();changeText(e,'2026','26');e.yearText='26';assert.equal(await reason(e),'edition_conflict');
});
function sharedDateCaption(){
  const e=programme();const wednesday='Wednesday, October 14, 2026 events:',thursday='Thursday, October 15, 2026 events:';
  const first='6:00 pm - Tivoli Cinema: Another Film',row='7:00 pm - Tivoli Cinema: Unholy Night';
  e.dateHeaderText=thursday;e.activityRowText=row;e.scopeText=thursday+'\n'+first+'\n'+row;e.dateText='Thursday, October 15, 2026';e.activity.startDate='2026-10-15';
  e.source.text=e.membershipText+'\n'+wednesday+'\n5:00 pm - Tivoli Cinema: Wednesday Film\n'+e.scopeText;
  const c=child();c.data.startDate='2026-10-15';c.data.endDate='2026-10-15';return {e,c,wednesday,thursday,row};
}
test('literal shared date heading governs multiple rows while occurrence quotes remain in the selected row',async()=>{
  const {e,c}=sharedDateCaption();const result=await resolveFestivalMembership({...input(),sources:[e],candidates:[c]});
  assert.equal(result.links.length,1);assert.equal(result.links[0].evidence[0].sourceDateText,'Thursday, October 15, 2026');
  assert(e.source.text.includes(e.scopeText));assert(result.links[0].evidence[0].sourceText.includes(e.scopeText));
});
test('a Wednesday heading cannot govern a Thursday row across an intervening date header',async()=>{
  const {e,c,wednesday,row}=sharedDateCaption();e.dateHeaderText=wednesday;e.dateText='Wednesday, October 14, 2026';
  e.scopeText=e.source.text.slice(e.source.text.indexOf(wednesday),e.source.text.indexOf(row)+row.length);
  const result=await resolveFestivalMembership({...input(),sources:[e],candidates:[c]});assert.equal(result.outcomes[0].reason,'source_occurrence_conflict');assert.equal(result.links.length,0);
});
test('shared date support cannot borrow another row clock or venue, or concatenate noncontiguous quotes',async()=>{
  const {e,c,thursday,row}=sharedDateCaption();e.timeText='6:00 pm';e.activity.startTime='18:00';
  assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).outcomes[0].reason,'evidence_missing');
  e.timeText='7:00 pm';e.activity.startTime='19:00';e.scopeText=thursday+'\n'+row;
  assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).outcomes[0].reason,'evidence_missing');
});
test('malformed, ranged, ambiguous or incomplete shared-date headers are held',async()=>{
  for(const header of ['Dates to be announced','October 15–16, 2026 events:','October 15 and 16, 2026 events:','October 14, 2026 and October 15, 2026']) {
    const {e,c,row}=sharedDateCaption();e.dateHeaderText=header;e.dateText=header;e.scopeText=header+'\n'+row;e.source.text=e.membershipText+'\n'+e.scopeText;
    assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).outcomes[0].reason,'source_occurrence_conflict');
  }
  const {e,c}=sharedDateCaption();e.dateHeaderText=undefined;
  assert.equal((await resolveFestivalMembership({...input(),sources:[e],candidates:[c]})).outcomes[0].reason,'evidence_missing');
});
