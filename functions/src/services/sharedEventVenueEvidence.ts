import type {RawRowData,VenueData} from '../types/index.js';
import type {ProcessedEvent} from '../parsing/types.js';
const key=(v:unknown)=>String(v || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const venueKey=(v:unknown)=>key(String(v||'').replace(/\bsaint\b/gi,'st'));
const venueBase=(v:unknown)=>venueKey(String(v||'').split(',')[0].replace(/\s+(?:PEI|PE|Prince Edward Island)\s*$/i,''));
const words=(v:unknown)=>String(v||'').normalize('NFKD').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
function hasAttendeePhrase(text:string,name:string):boolean {
  const nameWords=words(name);
  return Boolean(nameWords && new RegExp(`\\b(?:at|into) (?:the )?${nameWords}\\b`).test(words(text)));
}

/** Only an aligned source item's quoted, confirmed single venue can cancel
 * publisher-fallback protection. A copied address or model label alone cannot. */
export function hasExplicitItemVenueEvidence(item:ProcessedEvent,caption=''):boolean {
  const spatial=item.spatial;
  if(spatial?.kind!=='single_location'||!Array.isArray(spatial.locations)||spatial.locations.length!==1)return false;
  const location=spatial.locations[0],label=venueKey(location.label),quote=venueKey(location.sourceText);
  if(location.role!=='location'||location.certainty!=='confirmed'||label.length<10||!quote.includes(label))return false;
  return [item.venue,item.establishment,item.additionalLocation].filter(Boolean).some(value=>{
    const candidate=venueKey(value);
    // A locality suffix is not part of the venue's name. Keep exact base-name
    // equality, quoted evidence and confirmed single-location requirements.
    const base=venueBase(location.label),candidateBase=venueBase(value);
    return candidate===label||candidate.startsWith(label)&&candidate.length-label.length<=20 ||
      base.length>=10&&base===candidateBase&&hasAttendeePhrase(caption,String(location.label).split(',')[0]);
  });
}

/** A sharing page is not evidence that a first-person original programme is
 * held there. Explicit other venues still use normal exact venue resolution. */
export function sharedEventRequiresOriginalHost(item: ProcessedEvent,row:RawRowData,publisher?:VenueData|null):boolean {
  if(row.sourceScraperType==='events' || item.isFoodSpecial==='Yes')return false;
  if(hasExplicitItemVenueEvidence(item,[row.text,row.sharedPostText].filter(Boolean).join('\n')))return false;
  const owner=String(row.sharedPostAuthorName || '').trim(),original=String(row.sharedPostText || '');
  if(!owner || !row.sharedPostAuthorUrl || !original || !/\b(?:our|we|us)\b/i.test(original))return false;
  const names=[row.userName,row.pageName,publisher?.name].map(key).filter(Boolean);
  if(names.includes(key(owner)))return false;
  const locations=[item.venue,item.establishment,item.additionalLocation].filter(Boolean).map(key);
  if(locations.some(location=>!names.includes(location)))return false;
  // Original author can explicitly name the sharing venue as its actual host.
  if([row.userName,publisher?.name].filter(Boolean).some(name=>hasAttendeePhrase(original,String(name))))return false;
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
