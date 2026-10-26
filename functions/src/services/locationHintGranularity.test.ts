import test from 'node:test';import assert from 'node:assert/strict';
import {cityGranularityHint} from './locationHintGranularity.js';
test('country/province cannot partition the Three Oaks city queue identity',()=>{
 for(const x of ['Canada','CA','Prince Edward Island','PEI','Ontario','United States'])assert.equal(cityGranularityHint(x),undefined);
 assert.equal(cityGranularityHint('Summerside'),'Summerside');assert.equal(cityGranularityHint('Souris'),'Souris');
 assert.equal(cityGranularityHint('  Halifax  '),'Halifax');
});
