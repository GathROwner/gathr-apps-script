import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePostDerivedCityLevelEventLocation} from './rowProcessor.js';
const base:any={name:'Halloween Costume Parade',establishment:'Centre Belle-Alliance',venue:'Centre Belle-Alliance',additionalLocation:'Centre Belle-Alliance',
  description:'Young and old are invited to trick-or-treat in the corridors of Centre Belle-Alliance between 9 a.m. and 12 p.m.',
  spatial:{kind:'single_location',locations:['Centre Belle-Alliance'],confirmedStreets:[],ordered:false}};
const row:any={text:'Summerside Pumpkin Festival October15–31',userName:'Carrefour ISJ',facebookUrl:'https://www.facebook.com/Carrefourdelislesaintjean/'};
test('an explicitly indoor single-venue costume parade is not a city route',()=>{
  assert.equal(resolvePostDerivedCityLevelEventLocation({item:base,row,establishment:'Carrefour ISJ'}),null);
});
test('a parade leaving the lobby for an actual street route stays spatial',()=>{
  const item={...base,description:'Meet indoors in the lobby; the parade follows a route along Water Street and finishes at Central Street.',spatial:{kind:'route',locations:['Centre Belle-Alliance','Water Street','Central Street'],confirmedStreets:['Water Street','Central Street'],ordered:true}};
  assert(resolvePostDerivedCityLevelEventLocation({item,row,establishment:'Carrefour ISJ'}));
});
