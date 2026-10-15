import test from 'node:test';import assert from 'node:assert/strict';
import {applyCategoryCorrectionsForRegression} from './finalFormatter.js';
test('Thriller Book Club discussion is a social activity rather than live music',()=>{
  const result=applyCategoryCorrectionsForRegression({name:'Thriller Book Club',description:'Join us for a discussion of our October book.',category:'Live Music',isEvent:'Yes',isFoodSpecial:'No'} as any);
  assert.equal(result.category,'Gatherings & Parties');
});
test('explicit live performance at a book club retains its music identity',()=>{
  const result=applyCategoryCorrectionsForRegression({name:'Book Club Live Music Night',description:'A live band performance following the book discussion.',category:'Live Music',isEvent:'Yes',isFoodSpecial:'No'} as any);
  assert.equal(result.category,'Live Music');
});
