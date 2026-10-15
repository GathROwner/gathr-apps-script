import test from 'node:test';import assert from 'node:assert/strict';
import {classifySpatialEvent} from './spatialEventClassifier.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {resolvePostDerivedCityLevelEventLocation,fullParserEventLocationCheck} from '../processing/rowProcessor.js';
test('all brand locations in PEI is a multi-site offer rather than one source-page storefront',()=>{
  const result=classifySpatialEvent({name:'Two can dine',description:'Available at all A&W locations in PEI.',location:'A&W Charlottetown'});
  assert.equal(result.kind,'multi_location');assert.equal(result.representation,'area');assert.equal(result.ordered,false);
  assert.equal(classifySpatialEvent({name:'Two can dine',description:'Available at A&W Charlottetown.',location:'A&W Charlottetown'}).kind,'single_location');
});
test('bike-bus route remains a route review without invented streets or post-time clock',()=>{
  const source:any={name:'Morning Bike Bus',description:'Yellow route is cancelled this morning. The other routes run as usual.',date:'2026-10-15',startTime:'',endTime:'',spatial:{kind:'route',locations:[],confirmedStreets:[],ordered:true}};
  const constrained=constrainSourceTimes([source],'')[0];assert(constrained._sourceTimeConstraint);
  const item:any=rehydrateFormattedEventMetadata({...source,startDate:source.date,endDate:source.date,startTime:'10:17',endTime:'23:00',spatial:{kind:'single_location',locations:[{label:'School'}]}},constrained);
  assert.equal(item.startTime,'');assert.equal(item.spatial.kind,'route');
  const location=resolvePostDerivedCityLevelEventLocation({item,row:{text:source.description,userName:'School',mediaUrls:[],timestamp:'2026-10-15T13:17:00Z'} as any,establishment:'School'});
  assert.equal(location?.locationScope,'route');assert.equal(location?.spatialEvidence?.confirmedStreets.length,0);
  assert(location?.autoPublishReviewReasons.includes('route_candidate_requires_geometry_review'));
});
test('formatter cannot downgrade validated spatial evidence or borrow a clock for online sessions',()=>{
  const source:any={name:'Public Teams Information Session',date:'2026-10-19',startTime:'',endTime:'',spatial:{kind:'online',locations:[{label:'Microsoft Teams'}]}};
  const restored=rehydrateFormattedEventMetadata({...source,startTime:'09:00',endTime:'17:00',spatial:{kind:'single_location',locations:[{label:'Police office'}]}},constrainSourceTimes([source],'')[0]);
  assert.equal(restored.startTime,'');assert.equal(restored.endTime,'');assert.equal(restored.spatial?.kind,'online');
  const hold=fullParserEventLocationCheck({...restored,name:source.name,description:'Join our public Microsoft Teams session.'} as any,{text:'Public session via Microsoft Teams'} as any);
  assert.equal(hold.decision,'hold');assert.equal(hold.reason,'online_activity_requires_non_venue_publication');
  assert.notEqual(fullParserEventLocationCheck({...restored,name:'Hybrid public session',description:'Attend in person or on Zoom',spatial:{kind:'single_location'}} as any,{text:'Hybrid public session'} as any).reason,'online_activity_requires_non_venue_publication');
});
