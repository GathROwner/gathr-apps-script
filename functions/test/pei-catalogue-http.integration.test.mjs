import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import {writeFileSync} from 'node:fs';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8097');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9098');
const project = 'demo-gathr-checkin-http';
const app = initializeApp({projectId: project}, 'real-pei-http-integration');
const db = getFirestore(app);
after(() => deleteApp(app));
// Real public OSM node6835691382 from the verified extract, not a user location.
const point = {latitude:46.2571607,longitude:-63.1406688,accuracyMeters:17,speedMetersPerSecond:0};
async function callable(name, data, token) {
  const response = await fetch(`http://127.0.0.1:5008/${project}/northamerica-northeast1/${name}`, {
    method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
    body:JSON.stringify({data}),signal:AbortSignal.timeout(30_000),
  });
  const json=await response.json();
  assert.equal(response.status,200,JSON.stringify(json));
  return json.result??json.data;
}

test('real timed90s arrival and actual PEI catalogue pass HTTP wrappers, binding, idempotent creation and readback', {timeout:240_000}, async () => {
  const signed=await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({email:`pei-proof-${Date.now()}@fixture.invalid`,password:'LocalProofOnly2026!',returnSecureToken:true}),
  });
  const auth=await signed.json(); assert.equal(signed.ok,true,JSON.stringify(auth));
  const uid=auth.localId, token=auth.idToken, sessionId='real-timed-pei-arrival';
  await db.doc(`users/${uid}`).set({displayName:'Synthetic PEI HTTP proof'});
  let receipt=await callable('recordCheckInReadinessSampleCallable',{protocolVersion:1,reset:false,
    sessionId,sequence:0,...point,capturedAtMs:Date.now()},token);
  const started=Date.now();
  const lookupStarted=Date.now();
  const places=await callable('discoverNearbyCheckInPlacesCallable',{preparation:true,...point,capturedAtMs:Date.now()},token);
  const discoveryMs=Date.now()-lookupStarted;
  assert.equal(places.externalLookupStatus,'complete');
  assert.equal(places.catalogSource,'osm_regional_snapshot');
  assert.equal(places.preparationRadiusMetres,175);
  const chosen=places.candidates.find(place=>place.name==='The Fox & Crow'&&place.type==='external_place');
  assert.ok(chosen,JSON.stringify(places));
  const prepared=(await db.doc(`checkInPlaceCandidates/${chosen.id}`).get()).data();
  assert.equal(prepared.uid,uid);
  assert.equal(prepared.source,'openstreetmap_overpass');
  assert.equal(prepared.catalogSource,'osm_regional_snapshot');
  assert.equal(prepared.catalogVersion,places.catalogVersion);
  // No readiness, arrival or elapsed counters are seeded/edited in this proof.
  for(let sequence=1;sequence<=10&&!receipt.arrival?.place;sequence++) {
    await new Promise(resolve=>setTimeout(resolve,10_000));
    receipt=await callable('recordCheckInReadinessSampleCallable',{protocolVersion:1,reset:false,
      sessionId,sequence,...point,capturedAtMs:Date.now()},token);
    console.log(JSON.stringify({phase:'actual-timed-arrival',elapsedMs:Date.now()-started,
      hereQualifyingMs:receipt.hereQualifyingMs,placeQualifyingMs:receipt.placeQualifyingMs,place:receipt.arrival?.place??false}));
  }
  assert.equal(receipt.arrival?.place,true);
  const bound=await callable('bindCheckInReadinessCallable',{protocolVersion:1,readinessSessionId:sessionId,
    useQualifiedArrival:true,operationId:'real-pei-bind',placeCandidateId:chosen.id,
    latitude:0,longitude:0,accuracyMeters:999,capturedAtMs:1},token);
  assert.equal(bound.locationType,'external_place');
  const input={operationId:'real-pei-create',eligibilitySessionId:bound.eligibilitySessionId,
    placeCandidateId:chosen.id,durationMinutes:30,audienceMode:'all_friends',shareExactLocation:false,message:'Synthetic local real-OSM proof'};
  const created=await callable('createCheckInCallable',input,token);
  const retry=await callable('createCheckInCallable',input,token);
  assert.equal(retry.revision,created.revision);
  const active=(await db.doc(`activeCheckIns/${uid}`).get()).data();
  const consumed=(await db.doc(`checkInPlaceCandidates/${chosen.id}`).get()).data();
  assert.equal(active.venueNameSnapshot,'The Fox & Crow');
  assert.equal(active.venueLocationKey,consumed.place.locationKey);
  assert.ok(consumed.consumedAt);
  const proof={checkedAt:new Date().toISOString(),project,uid,catalogVersion:places.catalogVersion,
    catalogSourceTimestamp:places.catalogSourceTimestamp,discoveryMs,
    actualArrivalElapsedMs:Date.now()-started,hereQualifyingMs:receipt.hereQualifyingMs,placeQualifyingMs:receipt.placeQualifyingMs,
    actualOsmIdentity:'node:6835691382',chosen,candidateSource:consumed.source,catalogSource:consumed.catalogSource,
    revision:created.revision,idempotentReplay:true,candidateConsumed:true,
    candidates:places.candidates.map(p=>({id:p.id,name:p.name,type:p.type})),httpResponseBytes:Buffer.byteLength(JSON.stringify(places))};
  writeFileSync('../../pei-catalogue-http-integration-receipt-20261031.json',JSON.stringify(proof,null,2));
  const checkout=await callable('checkOutCallable',{expectedRevision:created.revision},token);
  assert.equal(checkout.checkedOut,true);
});
