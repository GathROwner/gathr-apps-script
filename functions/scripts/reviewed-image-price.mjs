// A review tool, never a digit substitution rule or an automatic public writer.
export const IMAGE_PRICE_REVIEW_INSTRUCTIONS=`Read the original board image independently. Identify only the requested food item and its own price region. Transcribe that whole region verbatim, including its price/header and item name. Ignore prices in neighbouring columns, other menu items and the proposed stored price. Return itemText, priceText, regionText and readable. If unclear or more than one applicable price exists, return readable false and empty priceText. Never guess a handwritten digit or use a venue menu/default.`;
export function validateReviewedImagePrice(value,{itemName,imageSha256}){
 const literal=x=>x.toLowerCase().replace(/\s+/g,' ').trim();
 if(!/^[a-f0-9]{64}$/.test(imageSha256)||value?.readable!==true||
    !['itemText','priceText','regionText'].every(k=>typeof value[k]==='string'&&value[k].trim())||
    !literal(value.regionText).includes(literal(value.itemText))||!literal(value.regionText).includes(literal(value.priceText)))throw Error('price_source_hold');
 const key=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
 if(key(value.itemText)!==key(itemName)&&!literal(value.itemText).startsWith(literal(itemName)+' on '))throw Error('price_item_identity_hold');
 const amounts=[...value.priceText.matchAll(/(?:\$\s*(\d+(?:\.\d{2})?)|(\d+(?:\.\d{2})?)\s*\$)/g)].map(m=>m[1]||m[2]);
 if(amounts.length!==1)throw Error('price_amount_hold');
 return {itemName,price:'$'+amounts[0],imageSha256,literalPrice:value.priceText,regionText:value.regionText,verification:'independent_original_image_review'};
}
