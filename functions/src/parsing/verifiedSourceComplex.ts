import type {RawRowData,VenueData} from '../types/index.js';
import {sourcePageIdentifiesVenue} from '../services/venueIdentity.js';
import {locationMentionKey,type LocationMentionResolution} from './locationMentionRoles.js';

// Verified first-party store address and classroom relationship. This is not a
// mall alias: unrelated mall events and off-site store workshops remain separate.
const relationships=[{venueId:'name_6387om',context:'The Confederation Court Mall',
 contexts:['The Confederation Court Mall','Confederation Court Mall'],domain:'blankcanvasartsupplies.ca'}];
export function applyVerifiedSourceComplexVenue<T extends {name?:unknown;description?:unknown;venue?:string;establishment?:string;additionalLocation?:string;ticketLink?:string;spatial?:any;_locationMentionResolution?:LocationMentionResolution}>(item:T,row:RawRowData,venue:VenueData|null):T{
 if(!venue||!sourcePageIdentifiesVenue(row,venue)||row.sharedPostAuthorUrl)return item;
 const relation=relationships.find(r=>r.venueId===venue.id);if(!relation)return item;
 const text=[row.text,item.name,item.description].join('\n');
 if(!/\b(?:class|workshop|course)\b/i.test(text)||/\b(?:moved|relocated|instead of|new venue|at both|multiple venues|tour stops)\b/i.test(text)||
   ['route','multi_location','separate_occurrences','online'].includes(String(item.spatial?.kind||'')))return item;
 let domain='';try{domain=new URL(/^https?:/i.test(item.ticketLink||'')?item.ticketLink!:'https://'+item.ticketLink).hostname.replace(/^www\./,'');}catch{return item;}
 if(domain!==relation.domain)return item;
 const labels=[item.venue,item.establishment,item.additionalLocation,...(item.spatial?.locations||[]).map((x:any)=>typeof x==='string'?x:x.label)].filter(Boolean) as string[];
 const context=(label:string)=>relation.contexts.some(c=>locationMentionKey(label.split(',')[0])===locationMentionKey(c));
 if(!labels.some(context)||!labels.every(label=>context(label)||locationMentionKey(label)===locationMentionKey(venue.name)))return item;
 if(item.spatial?.locations?.some((x:any)=>x.address&&venue.address&&!String(venue.address).includes(String(x.address))))return item;
 return {...item,venue:venue.name,establishment:venue.name,additionalLocation:venue.name,
  spatial:{kind:'single_location',locations:[{label:venue.name,role:'location',certainty:'confirmed',sourceText:'Exact source business and verified classroom within '+relation.context}]},
  _locationMentionResolution:{version:1,eventVenue:venue.name,venueId:venue.id,relationshipKey:'verified-source-store-classroom',complexContext:relation.context,
   mentions:[{label:venue.name,role:'event_venue',sourceText:'Exact original store page and first-party class registration'},
    {label:relation.context,role:'complex_context',sourceText:labels.find(context)||relation.context}]}};
}
