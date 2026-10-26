import type {RawRowData,VenueData} from '../types/index.js';
import type {ProcessedEvent} from '../parsing/types.js';
const key=(v:unknown)=>String(v || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');

/** A sharing page is not evidence that a first-person original programme is
 * held there. Explicit other venues still use normal exact venue resolution. */
export function sharedEventRequiresOriginalHost(item: ProcessedEvent,row:RawRowData,publisher?:VenueData|null):boolean {
  if(row.sourceScraperType==='events' || item.isFoodSpecial==='Yes')return false;
  const owner=String(row.sharedPostAuthorName || '').trim(),original=String(row.sharedPostText || '');
  if(!owner || !row.sharedPostAuthorUrl || !original || !/\b(?:our|we|us)\b/i.test(original))return false;
  const names=[row.userName,row.pageName,publisher?.name].map(key).filter(Boolean);
  if(names.includes(key(owner)))return false;
  const locations=[item.venue,item.establishment,item.additionalLocation].filter(Boolean).map(key);
  if(locations.some(location=>!names.includes(location)))return false;
  // Original author can explicitly name the sharing venue as its actual host.
  if([row.userName,publisher?.name].filter(Boolean).some(name=>
    key(original).includes(key(name))))return false;
  return true;
}

/** An outdoor programme is not hosted by a council office/arena merely
 * because that page shared its poster. Explicit source host names still win. */
export function outdoorProgrammeRequiresHost(item:ProcessedEvent,row:RawRowData):boolean {
  if(!/\b(?:scream park|haunted woods|open farm day)\b/i.test(`${item.name} ${item.description || ''}`))return false;
  const sourceNames=[row.userName,row.pageName].filter(Boolean).map(String);
  if(!sourceNames.some(name=>/\b(?:town|hall|centre|center|arena)\b/i.test(name)))return false;
  const locations=[item.venue,item.establishment,item.additionalLocation].filter(Boolean).map(key);
  if(locations.some(location=>!sourceNames.map(key).includes(location)))return false;
  const captions=key([row.text,row.sharedPostText].filter(Boolean).join('\n'));
  return !sourceNames.some(name=>captions.includes(key(name)));
}
