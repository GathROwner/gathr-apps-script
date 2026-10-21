const assert=require('assert/strict'),a=require('../ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
module.exports=function repairTypedFields(original,patch,at){
  const fields=a.fields({...patch,updatedAt:at});
  if(!Object.hasOwn(patch,'imageProvenance'))return fields;
  const typed=original.fields.imageProvenance;assert(typed?.mapValue?.fields,'Original typed provenance missing');
  const before=a.decode(typed),after=patch.imageProvenance;
  const withoutMedia=object=>Object.fromEntries(Object.entries(object).filter(([k])=>k!=='media'));
  assert.deepEqual(sorted(withoutMedia(after)),sorted(withoutMedia(before)),'Primary/scalar provenance change is not authorized');
  const oldMedia=typed.mapValue.fields.media?.arrayValue?.values||[];
  assert(Array.isArray(after.media)&&after.media.length>=oldMedia.length,'Media removal is not authorized');
  assert.deepEqual(sorted(after.media.slice(0,oldMedia.length)),sorted(before.media),'Existing media provenance changed');
  fields.imageProvenance={mapValue:{fields:{...typed.mapValue.fields,
    media:{arrayValue:{values:[...oldMedia,...after.media.slice(oldMedia.length).map(a.encode)]}}}}};
  return fields;
};
