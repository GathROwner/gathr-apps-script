import type {EventData} from '../types/index.js';

// Reviewed identities only. A source shared by several dates/performers is
// never sufficient. These rules corroborate an existing keeper without letting
// generic incoming text repaint its approved identity, timing or media.
const rules=[
  {source:'1947068440080491',venue:'nvQTJXSbDsSfJTCxDKCH',name:'Decor',date:'2026-11-12',start:'18:00',
    path:'venues/nvQTJXSbDsSfJTCxDKCH/events/4dAjYh8KuZLMx2S4EtIr',keeper:'Christmas Decor',keeperSources:['1938244704296198','1942582787195723']},
  {source:'1946140366839965',venue:'nvQTJXSbDsSfJTCxDKCH',name:'Coffee',date:'2026-11-02',start:'10:00',
    path:'venues/nvQTJXSbDsSfJTCxDKCH/events/B4quH6FgnyykcpuiI2uK',keeper:'Coffee Club',keeperSources:['1943285337125468']},
  {source:'1869669937859249',venue:'V7zQ5unfTY1GtNKUvR7c',name:'Laughs for a Friend',date:'2026-11-06',start:'20:00',
    path:'venues/DZ4nQZQnOKCkTotuKYVv/events/Ljjecf1dIs2fxihzkNfE',keeper:'Stand Up Comedy at the Factory',keeperSources:['10176142294500537']},
];
const sources=(event:Partial<EventData>)=>new Set([
  ...(event.sourceUniqueIds||[]),String(event.uniqueId||'').split('_')[0],
].filter(Boolean));
export function reviewedSourceDuplicateRule(event:Partial<EventData>,venueId:string){
  const roots=sources(event);
  return rules.find(rule=>roots.has(rule.source)&&venueId===rule.venue&&
    (event.eventName||event.name)===rule.name&&event.startDate===rule.date&&event.startTime===rule.start);
}
export function matchesReviewedSourceKeeper(rule:NonNullable<ReturnType<typeof reviewedSourceDuplicateRule>>,keeper:Partial<EventData>):boolean{
  const roots=sources(keeper);
  return keeper.venueId===rule.path.split('/')[1]&&
    (keeper.eventName||keeper.name)===rule.keeper&&keeper.startDate===rule.date&&keeper.startTime===rule.start&&
    !['true','yes'].includes(String(keeper.isRecurring||'').toLowerCase())&&
    ['none',''].includes(String(keeper.recurringPattern||''))&&
    rule.keeperSources.some(source=>roots.has(source));
}
