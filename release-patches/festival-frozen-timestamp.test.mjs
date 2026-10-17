import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {FrozenDatabase} from '../firebase/festival-frozen-database.mjs';
const require=createRequire(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/package.json',import.meta.url));
const {Timestamp}=require('firebase-admin/firestore');
for(const nanoseconds of [0,499999,500000,758999000,999999999])test('frozen SDK timestamp parity at '+nanoseconds+'ns',()=>{
 const seconds=1792231874,version={seconds,nanoseconds},db=new FrozenDatabase([{path:'source/test',version,data:{at:{_seconds:seconds,_nanoseconds:nanoseconds}}}]);
 const d=db.snapshot('source/test'),sdk=new Timestamp(seconds,nanoseconds);
 assert.equal(d.updateTime.toDate().toISOString(),sdk.toDate().toISOString());assert.equal(d.updateTime.toMillis(),sdk.toMillis());assert.equal(d.updateTime.nanoseconds,nanoseconds);
 assert.deepEqual(JSON.parse(JSON.stringify(d.data().at)),JSON.parse(JSON.stringify(sdk)));assert.equal(d.data().at.toDate().toISOString(),sdk.toDate().toISOString());
});
test('native Date truncation reproduces the discovered one-millisecond mismatch',()=>{const sdk=new Timestamp(1792231874,758999000);assert.notEqual(new Date(sdk.toMillis()).toISOString(),sdk.toDate().toISOString());});
