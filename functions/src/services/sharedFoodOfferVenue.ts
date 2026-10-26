import type {RawRowData, VenueData, QueueUnrecognizedVenueInput} from '../types/index.js';
import type {ProcessedEvent} from '../parsing/types.js';
import {normalizeVenueName} from '../utils/similarity.js';

const identity = (value: unknown): string => normalizeVenueName(String(value || '')).replace(/\s/g,'');
function isPageUrl(value: string): boolean {
  try {
    const url=new URL(value);
    return /(^|\.)facebook\.com$/i.test(url.hostname) &&
      Boolean(url.pathname.replace(/\//g,'')) && !/\/(?:events|groups|posts|photo|permalink\.php)(?:\/|$)/i.test(url.pathname);
  } catch {return false;}
}

/** A first-person food offer belongs to its structured original author when
 * the item has merely repeated the sharing page. Explicit other locations and
 * non-food activities keep their existing resolution path. No address/name
 * alias is invented, and an unavailable original venue remains unresolved. */
export function sharedFoodOfferOwner(item: ProcessedEvent, row: RawRowData, publisher?: VenueData | null): string | undefined {
  if(row.sourceScraperType==='events' || item.category!=='Food Special')return undefined;
  const owner=String(row.sharedPostAuthorName || '').trim();
  if(!owner || !isPageUrl(row.sharedPostAuthorUrl || '') || !row.sharedPostText?.trim() ||
    !/\b(?:our|we|us)\b/i.test(row.sharedPostText))return undefined;
  const sharingNames=new Set([row.userName,row.pageName,publisher?.name].map(identity).filter(Boolean));
  if(sharingNames.has(identity(owner)))return undefined;
  // A fundraising organizer can share a dinner explicitly hosted by the
  // publishing restaurant. A standalone named host in the original caption
  // is attendee evidence; the organizer's first-person wording is not a venue.
  const publisherNames = new Set([publisher?.name,publisher?.name?.split('|')[0]].map(identity).filter(Boolean));
  const explicitPublisherHost = publisher?.name && row.sharedPostText.split(/\r?\n/)
    .some(line => publisherNames.has(identity(line)));
  if (explicitPublisherHost && /\bfundraiser\b/i.test(row.sharedPostText) &&
      /\b\d{1,2}(?::\d{2})?\s*(?:[-–—]\s*\d{1,2}(?::\d{2})?)?\s*[ap]m\b/i.test(row.sharedPostText) &&
      [item.venue,item.establishment].some(value => publisherNames.has(identity(value)))) return undefined;
  if(['city','area','route','province'].includes(String(item.locationScope || '')))return undefined;
  if(item.additionalLocation && !sharingNames.has(identity(item.additionalLocation)) && identity(item.additionalLocation)!==identity(owner))return undefined;
  const locations=[item.establishment,item.venue].filter(Boolean).map(identity);
  if(locations.some(location=>!sharingNames.has(location) && location!==identity(owner)))return undefined;
  return owner;
}

export function applySharedFoodOfferVenue(item: ProcessedEvent, row: RawRowData, publisher?: VenueData | null): ProcessedEvent {
  const owner=sharedFoodOfferOwner(item,row,publisher);if(!owner)return item;
  const next={...item,establishment:owner,venue:owner};
  if(next.additionalLocation)next.additionalLocation='';
  if(next.address && [row.address,publisher?.address].some(address=>address && identity(address)===identity(next.address)))next.address='';
  const flags=(item.timeFlags || {}) as {start?:{source?:string;evidence?:string};end?:{source?:string;evidence?:string;toClose?:boolean}};
  const resolution=(item.timeResolution || {}) as Record<string,unknown>;
  const startFromPublisherHours=flags.start?.source!=='explicit' && Boolean(resolution.startFromHours ||
    /\b(?:venue hours|opens)\b/i.test(flags.start?.evidence || ''));
  const endFromPublisherHours=flags.end?.source!=='explicit' && Boolean(resolution.endFromHours);
  if(startFromPublisherHours)next.startTime='';
  if(endFromPublisherHours)next.endTime='';
  if(startFromPublisherHours || endFromPublisherHours){
    next.timeResolution={hoursUsed:false};
    next.timeFlags={...flags,
      ...(startFromPublisherHours?{start:{source:'none',evidence:''}}:{}),
      ...(endFromPublisherHours?{end:{source:'none',evidence:'',toClose:false}}:{})} as ProcessedEvent['timeFlags'];
  }
  return next;
}

export function sharedPostMetadata(row: RawRowData): Record<string,unknown> {
  if(!row.sharedPostAuthorName)return {};
  return {sharedPostAuthorName:row.sharedPostAuthorName,
    ...(row.sharedPostAuthorUrl?{sharedPostAuthorUrl:row.sharedPostAuthorUrl}:{}),
    ...(row.sharedPostUrl?{sharedPostUrl:row.sharedPostUrl}:{}),
    ...(row.sharedPostTimestamp?{sharedPostTimestamp:row.sharedPostTimestamp}:{})};
}

/** Keep original venue evidence and outer sharing provenance separate. */
export function sharedFoodOfferReviewContext(item: ProcessedEvent, row: RawRowData, publisher?: VenueData | null): Partial<QueueUnrecognizedVenueInput> | undefined {
  const owner=sharedFoodOfferOwner(item,row,publisher);if(!owner)return undefined;
  return {sourceLocationRole:'shared_original_business',aggregatorName:owner,
    aggregatorFacebookUrl:row.sharedPostAuthorUrl,aggregatorAddress:undefined,
    topLevelUrl:row.sharedPostUrl || row.sharedPostAuthorUrl,sourceUniqueId:row.uniqueId,
    sharingPageName:row.pageName || row.userName,sharingPageFacebookUrl:row.facebookUrl,
    sharingPostUrl:row.topLevelUrl,originalPostTimestamp:row.sharedPostTimestamp};
}
