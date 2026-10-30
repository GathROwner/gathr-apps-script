import type {ExtractedItem} from './types.js';

/** Item eligibility is independent of a mixed post's Stage 1 eligibility. */
export function isAdministrativePollingItem(item: Pick<ExtractedItem,'name'|'description'|'extractionReason'>): boolean {
  const name=String(item.name||'').trim();
  if (!/^(?:advance poll(?:ing)?|election (?:day|voting|poll(?:ing)?)|(?:municipal )?polling (?:station|hours|notice)|voting hours)$/i.test(name)) return false;
  return /\b(?:election|vot(?:e|ing)|poll(?:ing)?)\b/i.test(`${item.description||''} ${item.extractionReason||''}`);
}

// The October 30 audit independently read these original image footers. Bind
// literal source/item/date/clock identities to the original image object, never
// a model's gallery index or its asserted branch/footer. Unknown items stay out
// of this bounded rule. Existing venue occurrence constraints still apply.
const libraryBindings = [
  {venue:'Montague Rotary Library',address:'21 Sullivan Lane',image:'870504146_1161918926296270_3742366626072016617_n.png',items:[
    ['Santas for Seniors Card-making Station','2026-11-12',''],
    ['DIY Bookmarks','2026-11-16','14:30'],['Afternoon Book Club','2026-11-18','14:00'],
    ['Chess Club','2026-11-04','16:30'],['Chess Club','2026-11-11','16:30'],
    ['Chess Club','2026-11-18','16:30'],['Chess Club','2026-11-25','16:30'],
    ['Digital Health Week Info Sessions','2026-11-19','14:00']]},
  {venue:'Morell Public Library',address:'89 Red Head Road',image:'873993795_1123379773817204_440410728489851795_n.png',items:[
    ['Watercolour & Wishes: Holiday Card Making','2026-11-24','18:00'],
    ['Button Art','2026-11-06','14:00'],['Colourful Foil Prints','2026-11-27','14:00'],
    ['Colour Lab: Mix It Up!','2026-11-14','10:00']]},
];
const clock=(value:string)=>{
  const m=/^(\d{1,2}):([0-5]\d)\s*(AM|PM)?$/i.exec(value.trim());
  return m?`${String(m[3]?+m[1]%12+(/pm/i.test(m[3])?12:0):+m[1]).padStart(2,'0')}:${m[2]}`:value;
};

export function applyReviewedSourceItems(items:ExtractedItem[],sourceId:string,imageUrls:string[]):ExtractedItem[]{
  return items.map(item=>{
    if(isAdministrativePollingItem(item))return {...item,
      _sourcePublicationHold:'ineligible_election_administration',_itemEligibility:'ineligible'} as ExtractedItem;
    if(sourceId==='1763164659144120' && item.name==='Sobeys Handpie Sale' &&
        item.price==='$9.99' && item.venue==='Sobeys')return {...item,
      _sourcePublicationHold:'retailer_offer_branch_date_clock_unverified',
      _sourceReviewMissing:['retailer_branch','date_weekday_conflict','service_window'],
      _sourceId:sourceId} as ExtractedItem;
    if(sourceId!=='1448322924150044')return item;
    const binding=libraryBindings.find(b=>b.items.some(([name,date,start])=>
      item.name===name && item.date===date && clock(String(item.startTime||''))===start));
    if(!binding)return item;
    const indices=imageUrls.flatMap((url,index)=>{
      try {return new URL(url).pathname.split('/').pop()===binding.image?[index]:[];}catch{return [];}
    });
    if(indices.length!==1)return {...item,_sourcePublicationHold:'reviewed_library_image_identity_unavailable'} as ExtractedItem;
    return {...item,venue:binding.venue,relevantImageIndex:indices[0],
      _reviewedSourceImageLocation:{sourceId,imageObject:binding.image,venue:binding.venue,address:binding.address},
      spatial:{kind:'single_location',locations:[{label:binding.venue,address:binding.address,
        role:'location',certainty:'confirmed',sourceText:`${binding.venue}; ${binding.address}`}],
        confirmedStreets:[binding.address],ordered:false,
        evidenceNotes:'Reviewed original image footer, bound to exact source object and occurrence.'}} as ExtractedItem;
  });
}
