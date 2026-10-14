import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {parseXlsxFile} from './driveService.js';
import {mapApifyDatasetItemToDriveRow} from './apifyService.js';
import {applySharedFoodOfferVenue, sharedFoodOfferOwner, sharedPostMetadata} from './sharedFoodOfferVenue.js';
import {resolveVenueForFullParserEventWithMatcherForRegression} from '../processing/rowProcessor.js';
import type {ProcessedEvent} from '../parsing/types.js';
import type {RawRowData, VenueData} from '../types/index.js';
const publisher={id:'fixture-publisher',name:'Fixture Foodies',address:'17 Publisher St',facebookUrl:'https://www.facebook.com/FixtureFoodies'} as VenueData;
const owner={id:'fixture-owner',name:'Fixture Dairy Bar',facebookUrl:'https://www.facebook.com/FixtureDairyBar'} as VenueData;
const row={uniqueId:'fixture-source',userName:'Fixture Foodies',pageName:'FixtureFoodies',facebookUrl:publisher.facebookUrl,
  text:'Great deal and great food!',sharedPostText:'Every Monday & Wednesday, grab our Burger Basket for only $11.99!',
  sharedPostAuthorName:owner.name,sharedPostAuthorUrl:owner.facebookUrl,sharedPostUrl:'https://www.facebook.com/FixtureDairyBar/posts/123',
  sharedPostTimestamp:'2026-08-10T14:01:10Z',timestamp:'2026-08-13T22:47:35Z',mediaUrls:[]} as RawRowData;
const item={name:'Burger Basket Day (Burger Basket)',category:'Food Special',isFoodSpecial:'Yes',isEvent:'No',
  establishment:publisher.name,startDate:'2026-08-19',endDate:'2026-08-19',startTime:'11:00',endTime:'21:00',
  address:publisher.address,isRecurring:'Yes',recurringPattern:'weekly_wednesday',
  timeResolution:{hoursUsed:true,startFromHours:true,endFromHours:'category_default'},
  timeFlags:{start:{source:'semantic',evidence:'Start from venue hours (opens 11:00)'},end:{source:'none',evidence:'',toClose:false}}} as ProcessedEvent;
const workbook=(record:Record<string,unknown>)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([record]),'Data');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'}) as Buffer;};
test('XLSX preserves original shared-business metadata without replacing the sharing-page identity',async()=>{
  const parsed=await parseXlsxFile(workbook({id:'fixture-source',text:row.text,'sharedPost/text':row.sharedPostText,'user/name':row.userName,pageName:row.pageName,
    'sharedPost/pageName/name':owner.name,'sharedPost/pageName/profileUrl':owner.facebookUrl,'sharedPost/url':row.sharedPostUrl,'sharedPost/time':row.sharedPostTimestamp}));
  assert.equal(parsed.rows[0].userName,row.userName);assert.equal(parsed.rows[0].sharedPostAuthorName,owner.name);
  assert.equal(parsed.rows[0].sharedPostAuthorUrl,owner.facebookUrl);assert.equal(parsed.rows[0].sharedPostTimestamp,row.sharedPostTimestamp);
});
test('direct Apify fallback carries the same original publisher evidence',async()=>{
  const mapped=mapApifyDatasetItemToDriveRow({id:'fixture-source',text:row.text,user:{name:row.userName},sharedPost:{text:row.sharedPostText,user:{name:owner.name,profileUrl:owner.facebookUrl},url:row.sharedPostUrl,time:row.sharedPostTimestamp}})!;
  const parsed=await parseXlsxFile(workbook(mapped));assert.equal(parsed.rows[0].sharedPostAuthorName,owner.name);assert.equal(parsed.rows[0].sharedPostText,row.sharedPostText);
});
test('original offer identity drops only publisher-derived address and clocks and preserves Monday/Wednesday',()=>{
  const corrected=applySharedFoodOfferVenue(item,row,publisher);
  assert.equal(corrected.establishment,owner.name);assert.equal(corrected.venue,owner.name);assert.equal(corrected.address,'');
  assert.equal(corrected.startTime,'');assert.equal(corrected.endTime,'');assert.equal(corrected.recurringPattern,'weekly_wednesday');
  assert.equal(applySharedFoodOfferVenue({...item,recurringPattern:'weekly_monday'},row,publisher).recurringPattern,'weekly_monday');
  assert.equal(item.startTime,'11:00');
  assert.equal(applySharedFoodOfferVenue({...item,additionalLocation:publisher.name},row,publisher).additionalLocation,'');
});
test('explicit original-source clocks survive the venue correction',()=>{
  const corrected=applySharedFoodOfferVenue({...item,timeFlags:{start:{source:'explicit',evidence:'11 AM'},end:{source:'explicit',evidence:'9 PM',toClose:false}}},row,publisher);
  assert.equal(corrected.startTime,'11:00');assert.equal(corrected.endTime,'21:00');
});
for(const[label,patch]of Object.entries({event:{category:'Live Music'},otherVenue:{venue:'Other Restaurant'},room:{additionalLocation:'Room A'},route:{locationScope:'route'}})){
 test(`shared author does not override ${label}`,()=>assert.equal(sharedFoodOfferOwner({...item,...patch} as ProcessedEvent,row,publisher),undefined));
}
test('same publisher, missing original identity and unsafe shared URLs do not trigger redirection',()=>{
  for(const patch of [{sharedPostAuthorName:publisher.name},{sharedPostAuthorName:undefined},{sharedPostAuthorUrl:'https://www.facebook.com/events/123'},
    {sharedPostAuthorUrl:'https://example.com/not-facebook'},{sourceScraperType:'events' as const}])assert.equal(sharedFoodOfferOwner(item,{...row,...patch},publisher),undefined);
  assert.deepEqual(sharedPostMetadata({...row,sharedPostAuthorName:undefined}),{});
});
test('an exact original-business venue wins before the sharing-page fallback',async()=>{
  const attempts:string[]=[];const result=await resolveVenueForFullParserEventWithMatcherForRegression({item,row,rowVenue:publisher,establishment:publisher.name,rowIndex:1,
    matcher:async(name,url)=>{attempts.push(`${name}|${url}`);return {isMatch:true,matchType:'exact',similarity:1,matchedVenue:owner};}});
  assert.equal(result?.id,owner.id);assert.deepEqual(attempts,[`${owner.name}|${owner.facebookUrl}`]);
});
test('missing or fuzzy original-business matches hold instead of adopting the publisher',async()=>{
  for(const match of [{isMatch:false,matchType:'none' as const,similarity:0},{isMatch:true,matchType:'fuzzy' as const,similarity:.9,matchedVenue:owner},
    {isMatch:true,matchType:'exact' as const,similarity:1,matchedVenue:publisher}]){
    const result=await resolveVenueForFullParserEventWithMatcherForRegression({item,row,rowVenue:publisher,establishment:publisher.name,rowIndex:1,matcher:async()=>match});assert.equal(result,null);
  }
});
