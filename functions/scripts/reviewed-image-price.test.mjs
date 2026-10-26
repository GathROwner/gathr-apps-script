import test from 'node:test';import assert from 'node:assert/strict';
import {validateReviewedImagePrice} from './reviewed-image-price.mjs';
const source={itemName:'Meatloaf Sandwich',imageSha256:'a'.repeat(64)};
const read={readable:true,itemText:'Meatloaf Sandwich',priceText:'16$ Kitchen Feature',regionText:'16$ Kitchen Feature\nMeatloaf Sandwich\nSide and small beverage'};
test('review binds a literal source price to the correct board region without digit rules',()=>{
 assert.equal(validateReviewedImagePrice(read,source).price,'$16');
 assert.equal(validateReviewedImagePrice({...read,priceText:'$18',regionText:'$18\nMeatloaf Sandwich'},source).price,'$18');
 assert.equal(validateReviewedImagePrice({...read,priceText:'$6.50',regionText:'$6.50\nMeatloaf Sandwich'},source).price,'$6.50');
});
test('unreadable, neighbour price, multiple prices or wrong title hold',()=>{
 for(const patch of [{readable:false},{itemText:'Soup'},{priceText:'$16 or $18'},{priceText:'$10'}])
  assert.throws(()=>validateReviewedImagePrice({...read,...patch},source),/hold/);
});
