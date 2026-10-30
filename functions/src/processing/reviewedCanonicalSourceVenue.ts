import type {RawRowData,VenueData} from '../types/index.js';
export const ISLAND_CHEF_DOWNTOWN_VENUE='slug_islandchefdowntownloungeandeatery';

/** Only the reviewed current downtown page identity qualifies. Historical
 * Cavendish activity, bare page IDs and a generic Island Chef name do not. */
export function requestsReviewedDowntownVenue(row:RawRowData):boolean{
  if(row.sourceScraperType==='events')return false;
  const name=String(row.userName||'').trim().toLowerCase().replace(/\s+/g,' ');
  const url=String(row.facebookUrl||'').replace(/\/$/,'');
  const page=String(row.pageName||'').toLowerCase();
  const date=String(row.timestamp||'').slice(0,10);
  const caption=[row.text,row.sharedPostText].filter(Boolean).join('\n');
  return name==='island chef down town' && page==='islandchefatthepier' &&
    /^https:\/\/(?:www\.)?facebook\.com\/(?:100090273050576|islandchefatthepier)$/i.test(url) &&
    Number.isFinite(Date.parse(String(row.timestamp||''))) && date>='2026-10-29' && /\b62\s+queen\s+(?:street|st\b)/i.test(caption) &&
    /\bcharlottetown\b/i.test(caption) && !/\bcavendish\b/i.test(caption);
}
export function isReviewedDowntownVenue(venue:VenueData|null):boolean{
  return Boolean(venue && venue.id===ISLAND_CHEF_DOWNTOWN_VENUE &&
    venue.googlePlaceId==='ChIJ0xyPItG_X0sRdhKfPeWKDK4' &&
    /^62\s+queen\s+(?:street|st\b)/i.test(venue.address||'') &&
    /charlottetown/i.test(`${venue.city||''} ${venue.address||''}`) &&
    typeof venue.latitude==='number'&&Math.abs(venue.latitude-46.2327961)<0.001 &&
    typeof venue.longitude==='number'&&Math.abs(venue.longitude+63.1255936)<0.001);
}
