type Trivia = {id?: string; venueId?: string | null; eventName?: string; name?: string;
  category?: string; startDate?: string; startTime?: string; endTime?: string;
  description?: string; facebookUrl?: string; additionalLocation?: string; subVenue?: string};
const page=(url:unknown)=>String(url||'').toLowerCase().replace(/^https?:\/\/(?:www\.)?/,'').replace(/[?#].*$/,'').replace(/\/$/,'');
export const isGenericTrivia = (event: Trivia): boolean => event.category === 'Trivia Night' &&
  /^(?:general\s+)?trivia(?:\s+night)?$/i.test(String(event.eventName||event.name||'').trim());
const host=(event:Trivia)=>String(event.description||'').match(/\b(?:staff\s+host|hosted\s+by(?:\s+staff(?:\s+member)?)?|with\s+(?:staff\s+)?host)\s+([a-z]+(?:[-'][a-z]+)?)\b/i)?.[1]?.toLowerCase() || '';
/** Exact same-session proof, not a title-similarity score. */
export function resolveGenericTriviaOccurrence(incoming:Trivia, existing:Trivia[], venuePage:string):
  {kind:'none'|'match'|'hold';existing?:Trivia} {
  if(!isGenericTrivia(incoming) || !incoming.venueId || !/^\d{4}-\d{2}-\d{2}$/.test(incoming.startDate||'') ||
    !/^\d{2}:\d{2}$/.test(incoming.startTime||'') || !host(incoming) ||
    !page(venuePage) || page(incoming.facebookUrl)!==page(venuePage)) return {kind:'none'};
  const matches=existing.filter(event=>isGenericTrivia(event) && event.venueId===incoming.venueId &&
    event.startDate===incoming.startDate && event.startTime===incoming.startTime &&
    (!event.endTime || !incoming.endTime || event.endTime===incoming.endTime) &&
    page(event.facebookUrl)===page(venuePage) && host(event)===host(incoming) &&
    String(event.subVenue||event.additionalLocation||'').trim().toLowerCase()===String(incoming.subVenue||incoming.additionalLocation||'').trim().toLowerCase());
  return matches.length===1 ? {kind:'match',existing:matches[0]} : matches.length>1 ? {kind:'hold'} : {kind:'none'};
}
