import test from 'node:test';import assert from 'node:assert/strict';
import {resolveVenueForFullParserEventWithMatcherForRegression,fullParserEventLocationCheck} from './rowProcessor.js';
test('first-party golf Course wording resolves its existing Club without geocoding',async()=>{
 const venue:any={id:'fixture',name:'Example Creek Golf Club',facebookUrl:'https://www.facebook.com/fixture-golf',address:'12 Golf Road, Kensington, PE'};
 const result=await resolveVenueForFullParserEventWithMatcherForRegression({item:{name:'End of Season Bash',venue:'Example Creek Golf Course',startDate:'2026-10-24',startTime:'13:00',endTime:'16:00'} as any,rowVenue:venue,
  row:{text:'Join us at Example Creek Golf Course.',facebookUrl:venue.facebookUrl} as any,establishment:venue.name,rowIndex:1,
  matcher:async name=>name===venue.name?{isMatch:true,matchType:'exact',matchedVenue:venue} as any:{isMatch:false} as any});
 assert.equal(result?.id,venue.id);
});
test('online-only Recruiting sessions cannot acquire the publisher office',()=>{
 const item:any={name:'Recruiting Info Session',description:'The session is online via Microsoft Teams.',startDate:'2026-10-19',spatial:{kind:'online',locations:[{label:'Microsoft Teams'}]}};
 const result=fullParserEventLocationCheck(item,{text:'Virtual sessions October 19/26 at 8pm. Email for the join link.',address:'450 Office Street, Charlottetown, PE'} as any);
 assert.equal(result.decision,'hold');assert.equal(result.reason,'online_activity_requires_non_venue_publication');
});
test('a webinar with unknown spatial kind still cannot geocode Zoom as a venue',()=>{
 for(const text of ['Sign up for the free webinar.','Join us at 8pm on Zoom.','Join us at noon for the webinar.']){
  const result=fullParserEventLocationCheck({name:'Energy drinks webinar',venue:'Zoom',spatial:{kind:'unknown'}} as any,{text} as any);
  assert.equal(result.decision,'hold');assert.equal(result.reason,'online_activity_requires_non_venue_publication');
 }
});
test('online registration, hybrid attendance and virtual-reality activities preserve physical routing',()=>{
 for(const[name,caption]of [['Art class','Register online. Class held at Community Hall.'],['Webinar','Webinar held at Community Hall. Register online.'],['Webinar','Hybrid session: attend in person or via Zoom.'],['Virtual reality gaming','Join us at the arcade.']])
  assert.notEqual(fullParserEventLocationCheck({name} as any,{text:caption} as any).reason,'online_activity_requires_non_venue_publication');
});
