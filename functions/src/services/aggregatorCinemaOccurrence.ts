type Cinema = {id?:string;name?:string;eventName?:string;category?:string;startDate?:string;startTime?:string;facebookUrl?:string};
const page=(url:unknown)=>String(url||'').toLowerCase().replace(/^https?:\/\/(?:www\.)?facebook\.com\//,'').replace(/[/?#].*$/,'');
const core=(e:Cinema)=>String(e.eventName||e.name||'').toLowerCase()
  .replace(/^anchor\s+fest\s*/,'').replace(/^opening\s+night\s+(?:film|screening)\s*[,:-]?\s*/,'')
  .replace(/^shorts?\s+program(?:me)?\s*[:,–—-]?\s*/,'')
  .split(/[—–]/)[0].replace(/[^a-z0-9]/g,'');
/** Only a known aggregator yields to the actual venue page. Different genuine
 * first-party screenings are never merged by a fuzzy clock. */
export function resolveAggregatorCinemaOccurrence(incoming:Cinema,existing:Cinema[],venuePage:string):
  {kind:'none'|'hold'|'match';existing?:Cinema} {
  if(incoming.category!=='Cinema' || page(incoming.facebookUrl)!=='downtowncharlottetowninc')return {kind:'none'};
  const key=core(incoming),owner=page(venuePage);
  if(key.length<6 || !owner)return {kind:'none'};
  const candidates=existing.filter(e=>e.category==='Cinema' && e.startDate===incoming.startDate &&
    core(e)===key && page(e.facebookUrl)===owner);
  const exact=candidates.filter(e=>e.startTime===incoming.startTime);
  if(exact.length===1)return {kind:'match',existing:exact[0]};
  if(exact.length>1)return {kind:'hold'};
  // A three-hour disagreement is at least as material as a thirty-minute one.
  // The aggregator alone cannot prove an additional screening of a film already
  // advertised by the venue that day. First-party additional screenings stay
  // independent because they never enter this aggregator-only path.
  return candidates.length ? {kind:'hold'} : {kind:'none'};
}
