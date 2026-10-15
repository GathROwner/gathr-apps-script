import test from 'node:test';import assert from 'node:assert/strict';
import {previewDuplicateMerge} from './rowProcessor.js';
const event:any={uniqueId:'1111111111111_fixture',venueId:'fixture',eventName:'Corn and Bacon Chowder',name:'Corn and Bacon Chowder',startDate:'2026-10-15',endDate:'2026-10-15',startTime:'',endTime:'',price:'$6.50',ticketPrice:'$6.50',isRecurring:'No',recurringPattern:'none'};
const merge=(patch:any)=>({...event,...previewDuplicateMerge({existingEvent:event,incomingEvent:{...event,...patch},venue:{id:'fixture',name:'Fixture Counter'} as any}).updates});
test('longer text cannot replace a source-correct decimal price with a different amount',()=>{
 for(const price of ['$6 per bowl','$16 lunch feature']){const x=merge({price,ticketPrice:price});assert.equal(x.price,'$6.50');assert.equal(x.ticketPrice,'$6.50');}
});
test('compatible price detail and explicit sold-out status remain mergeable',()=>{
 assert.equal(merge({price:'$6.50 per bowl plus tax'}).price,'$6.50 per bowl plus tax');
 assert.match(merge({price:'Sold out'}).price,/sold out/i);
});
