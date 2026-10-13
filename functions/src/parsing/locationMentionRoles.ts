import type {ModelSpatialEvidence} from './spatialEventClassifier.js';

export type LocationMentionRole = 'event_venue' | 'complex_context' | 'ticketing_location' | 'organizer' | 'geographic_context' | 'unresolved';
export interface LocationMentionResolution {
  version: 1;
  eventVenue: string;
  venueId?: string;
  relationshipKey?: string;
  complexContext?: string;
  ticketingLocation?: string;
  mentions: Array<{label:string; role:LocationMentionRole; sourceText:string}>;
}

// Verified shared-facility relationship, not an alias or venue equivalence.
// https://www.eastlinkcentrepei.com/plan-your-visit/
export const KNOWN_LOCATION_RELATIONSHIPS = [{
  key:'red-shores-eastlink-charlottetown', venueId:'fb_100052606604879',
  venue:'Red Shores Charlottetown', context:'Eastlink Centre Charlottetown',
  childAliases:['Red Shores Charlottetown'],
  contextAliases:['Eastlink Centre Charlottetown','Eastlink Centre'],
}] as const;

const clean=(x:unknown)=>String(x||'').replace(/\s+/g,' ').trim();
export const locationMentionKey=(x:unknown)=>clean(x).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const escape=(x:string)=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const cities=new Set(['charlottetown','summerside','montague','cornwall','stratford','georgetown','souris','kensington']);
const ticketCue=/\b(?:box office|ticket outlet|ticket pickup|purchase tickets|tickets? (?:are |will be )?(?:available|sold)|tickets? (?:at|through|from))\b/i;
const routeOrMulti=/\b(?:parade|procession|route|multi[- ]?(?:venue|site|location)|(?:multiple|two|several) (?:venues|locations)|tour stops|at both|separate performances)\b/i;
const relocated=/\b(?:moved|relocated|changed venue|new venue|instead of|no longer|formerly|cancelled|canceled|not at)\b/i;
const sponsor=/\b(?:sponsor(?:ed)?|logo|presented by|supported by)\b/i;

export interface MentionInput {
  name?: unknown; description?: unknown; location?: unknown; combinedText?: unknown;
  modelSpatialEvidence?: ModelSpatialEvidence|null;
}

export function resolveLocationMentionRoles(input:MentionInput):LocationMentionResolution|null {
  const model=input.modelSpatialEvidence;
  const source=String(input.combinedText||'');
  const description=String(input.description||'');
  const notes=String(model?.evidenceNotes||'');
  const entries=(Array.isArray(model?.locations)?model!.locations:[]).map((x:any)=>({
    label:clean(typeof x==='string'?x:x?.label), sourceText:clean(x?.sourceText),
  })).filter(x=>x.label);
  const corpus=[source,description,notes,...entries.map(x=>x.sourceText)].join('\n');
  if(routeOrMulti.test(String(input.name||'')+'\n'+corpus) || model?.kind==='route') return null;
  // Two explicitly dated source venue lines are not made equivalent merely
  // because the buildings share a facility. Ticket-sale lines are not shows.
  const datedSourceLines=source.split(/[\n;]+/).filter(line=>
    /\b(?:20\d{2}-\d{2}-\d{2}|(?:jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)\s+\d{1,2})\b/i.test(line)&&!ticketCue.test(line));
  if(datedSourceLines.length>=2 && KNOWN_LOCATION_RELATIONSHIPS.some(r=>
    datedSourceLines.some(line=>r.childAliases.some(a=>locationMentionKey(line).includes(locationMentionKey(a)))) &&
    datedSourceLines.some(line=>r.contextAliases.some(a=>locationMentionKey(line).includes(locationMentionKey(a))))))return null;
  const statements=corpus.split(/[\n.!?;]+/).map(clean).filter(Boolean);
  const labels=[...new Set([...entries.map(x=>x.label),clean(input.location)].filter(Boolean))];
  const cityLabels=labels.filter(x=>cities.has(locationMentionKey(x)));
  const specificLabels=labels.filter(x=>!cities.has(locationMentionKey(x)));
  const evidenceFor=(label:string)=>entries.filter(x=>locationMentionKey(x.label)===locationMentionKey(label)).map(x=>x.sourceText).filter(Boolean);
  const statementsFor=(label:string)=>[...evidenceFor(label),...statements.filter(x=>locationMentionKey(x).includes(locationMentionKey(label)))];
  const ticketOnly=(label:string)=>{
    const snippets=statementsFor(label);
    if(!snippets.length)return false;
    // A business can be both venue and outlet. An explicit venue statement wins.
    const venueRe=new RegExp('(?:held at|takes place at|venue(?: is|:)?|location(?: is|:)?|dance at|performance at|concert at|event at|show at)\\s+(?:the\\s+)?'+escape(label),'i');
    return snippets.some(x=>ticketCue.test(x))&&!snippets.some(x=>venueRe.test(x));
  };
  for(const relation of KNOWN_LOCATION_RELATIONSHIPS){
    const child=relation.childAliases.find(a=>locationMentionKey(corpus).includes(locationMentionKey(a)));
    const context=relation.contextAliases.find(a=>locationMentionKey(corpus).includes(locationMentionKey(a)));
    if(!child||!context||relocated.test(corpus)||ticketOnly(child))continue;
    const childSnippets=statementsFor(child);
    const explicitlyExtracted=locationMentionKey(input.location)===locationMentionKey(child) &&
      entries.some(x=>locationMentionKey(x.label)===locationMentionKey(child)&&x.sourceText&&!sponsor.test(x.sourceText));
    const explicitPoster=new RegExp('poster.{0,35}(?:location|venue|lists|prints|identifies).{0,25}'+escape(child),'i');
    const explicitVenue=new RegExp('(?:held at|takes place at|venue(?: is|:)?|location(?: is|:)?|at)\\s+(?:the\\s+)?'+escape(child),'i');
    const explicitPlacement=childSnippets.some(x=>(explicitPoster.test(x)||explicitVenue.test(x))&&!sponsor.test(x));
    if(childSnippets.some(x=>sponsor.test(x))&&!explicitPlacement)continue;
    if(!explicitlyExtracted&&!explicitPlacement)continue;
    const unexpected=specificLabels.filter(x=>![...relation.childAliases,...relation.contextAliases].some(a=>locationMentionKey(x)===locationMentionKey(a))&&!ticketOnly(x));
    if(unexpected.length)continue;
    const mentions:LocationMentionResolution['mentions']=[{label:relation.venue,role:'event_venue',sourceText:clean(childSnippets.find(x=>!sponsor.test(x))||child).slice(0,240)},
      {label:relation.context,role:'complex_context',sourceText:clean(statementsFor(context)[0]||context).slice(0,240)}];
    const ticket=statementsFor(context).find(x=>ticketCue.test(x));
    if(ticket)mentions.push({label:relation.context+' box office',role:'ticketing_location',sourceText:ticket.slice(0,240)});
    for(const label of cityLabels)mentions.push({label,role:'geographic_context',sourceText:label});
    return {version:1,eventVenue:relation.venue,venueId:relation.venueId,relationshipKey:relation.key,complexContext:relation.context,
      ...(ticket?{ticketingLocation:relation.context+' box office'}:{}),mentions};
  }
  // Generic off-site ticket outlets are safe to separate only with a single
  // explicit event venue. Unknown competing venue relationships remain held.
  const organizerOnly=(label:string)=>{
    const cue=new RegExp('(?:(?:organized|presented|promoted) by\\s+'+escape(label)+'|'+escape(label)+'\\s+presents)','i');
    return statementsFor(label).some(x=>cue.test(x)) && !statementsFor(label).some(x=>new RegExp('(?:held at|venue(?: is|:)?|concert at)\\s+'+escape(label),'i').test(x));
  };
  const physical=specificLabels.filter(x=>!ticketOnly(x)&&!organizerOnly(x));
  if(physical.length!==1)return null;
  const venue=physical[0];
  const snippets=statementsFor(venue);
  const explicitVenue=new RegExp('(?:held at|takes place at|venue(?: is|:)?|location(?: is|:)?|at)\\s+(?:the\\s+)?'+escape(venue),'i');
  if(!snippets.some(x=>explicitVenue.test(x)&&!sponsor.test(x)))return null;
  const outlets=specificLabels.filter(ticketOnly);
  const organizers=specificLabels.filter(organizerOnly);
  if(!outlets.length&&!organizers.length)return null;
  return {version:1,eventVenue:venue,...(outlets.length?{ticketingLocation:outlets.join('; ')}:{}),mentions:[
    {label:venue,role:'event_venue',sourceText:(snippets.find(x=>explicitVenue.test(x))||venue).slice(0,240)},
    ...outlets.map(label=>({label,role:'ticketing_location' as const,sourceText:(statementsFor(label).find(x=>ticketCue.test(x))||label).slice(0,240)})),
    ...organizers.map(label=>({label,role:'organizer' as const,sourceText:(statementsFor(label)[0]||label).slice(0,240)})),
  ]};
}

export function applyLocationMentionResolution<T extends {name?:unknown;description?:unknown;venue?:string;establishment?:string;additionalLocation?:string;spatial?:ModelSpatialEvidence;_locationMentionResolution?:LocationMentionResolution}>(item:T,sourceText:string):T {
  if(relocated.test(sourceText+'\n'+String(item.description||'')))return item._locationMentionResolution?{...item,_locationMentionResolution:undefined}:item;
  const resolution=resolveLocationMentionRoles({name:item.name,description:item.description,location:item.additionalLocation||item.venue||item.establishment,
    combinedText:sourceText,modelSpatialEvidence:item.spatial}) || item._locationMentionResolution;
  if(!resolution)return item;
  return {...item,venue:resolution.eventVenue,establishment:resolution.eventVenue,additionalLocation:resolution.eventVenue,
    spatial:{kind:'single_location',locations:[{label:resolution.eventVenue,role:'location',certainty:'confirmed',sourceText:resolution.mentions[0].sourceText}]},
    _locationMentionResolution:resolution};
}
