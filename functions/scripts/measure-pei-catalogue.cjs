const fs=require('node:fs');const path=require('node:path');const {performance}=require('node:perf_hooks');
const {lookupPeiOsmCatalogue}=require('../lib/social/peiOsmCatalogue.js');
const {parsePublicNearbyPlaces}=require('../lib/social/nearbyCheckInPlaces.js');
global.gc?.();const before=process.memoryUsage();
const nativePoint={latitude:46.2382,longitude:-63.1311,accuracyMeters:17,preparation:true};
const start=performance.now();const initial=lookupPeiOsmCatalogue(nativePoint,Date.now());
const coldMs=performance.now()-start;const initialCandidates=parsePublicNearbyPlaces({elements:initial.elements},nativePoint);
global.gc?.();const after=process.memoryUsage();
const records=initial.elements||[];const pub=records.find(item=>item.type==='node'&&item.tags.amenity==='pub'&&item.tags['addr:street']);
const testPoint=pub?{latitude:pub.lat,longitude:pub.lon,accuracyMeters:17,preparation:true}:nativePoint;
const times=[];let candidates=[];
for(let index=0;index<200;index++){const begin=performance.now();const result=lookupPeiOsmCatalogue(testPoint,Date.now());candidates=parsePublicNearbyPlaces({elements:result.elements},testPoint);times.push(performance.now()-begin);}
times.sort((a,b)=>a-b);
const report={checkedAt:new Date().toISOString(),catalogueBytes:fs.statSync(path.join(__dirname,'../lib/social/data/pei-osm-catalogue.json')).size,
 version:initial.version,sourceTimestamp:initial.sourceTimestamp,coldLoadMs:coldMs,addedHeapBytes:after.heapUsed-before.heapUsed,addedExternalBytes:after.external-before.external,addedRssBytes:after.rss-before.rss,
 warmLookupAndParser200:{medianMs:times[100],p95Ms:times[190],maxMs:times[199]},
 previousSyntheticPointRealCandidates:initialCandidates.map(item=>({name:item.name,id:item.osmElementKey})),
 nativeActualOsmPoint:pub?{id:`node:${pub.id}`,name:pub.tags.name,...testPoint}:null,
 actualNearbyCandidates:candidates.map(item=>({id:item.osmElementKey,name:item.name,distanceMetres:item.distanceMetres,hasBoundary:!!item.checkInBoundary})),
 payloadBytes:Buffer.byteLength(JSON.stringify(candidates))};
fs.writeFileSync(path.join(__dirname,'../../../pei-catalogue-measurements-20261031.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
