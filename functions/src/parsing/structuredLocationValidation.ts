import {STRUCTURED_LOCATION_VALIDATION_VERSION, structuredMediaSignature, StructuredLocationValidation, StructuredPosterEvidence} from '../services/structuredLocationContract.js';
export {STRUCTURED_LOCATION_VALIDATION_VERSION, structuredMediaSignature, hasCurrentStructuredValidation, protectedStructuredReview, isRetiredVenueReview} from '../services/structuredLocationContract.js';
export type {StructuredLocationValidation, StructuredPosterEvidence} from '../services/structuredLocationContract.js';
import type {RawRowData, VenueData} from '../types/index.js';
import type {TimeFlags} from './types.js';
import {normalizeVenueName} from '../utils/similarity.js';
import {normalizeTime, utcToLocal} from '../utils/dateTime.js';
import {listVenueAliases} from '../services/venueAliases.js';
import {classifySpatialEvent} from './spatialEventClassifier.js';
import {numberedStreetKey, firstLocationSentence, compatibleStreetLocality, postalStreetIdentity} from '../utils/numberedStreetIdentity.js';

export const STRUCTURED_POSTER_MAX_IMAGES = 4;
export const STRUCTURED_POSTER_MAX_OUTPUT_TOKENS = 6000;

const clean = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();
const nameKey = (value: unknown): string => normalizeVenueName(clean(value).replace(/^the\s+/i, '').replace(/\s*\([A-Z]{2,6}\)\s*$/, ''));
const broadLabel = (value: string): boolean => /^(?:charlottetown|summerside|montague|cornwall|stratford|georgetown|souris|kensington|pei|prince edward island)(?:[ ,]+(?:pe|pei|canada))*$/i.test(clean(value));

export function anchoredVenueMentions(title: string, caption: string): string[] {
  const mentions: string[] = [];
  for (const line of [title, ...String(caption || '').split(/\r?\n/)].filter(Boolean)) {
    for (const match of line.matchAll(/\b(?:held at|takes place at|located at|venue\s*[:\-]|location\s*[:\-]|address\s*[:\-]|at)\s+([^\n;!?]+)/gi)) {
      const before = line.slice(0, match.index);
      if (/\b(?:tickets?|box office|outlet|organized|presented|sponsored)\b[^.!?;]*$/i.test(before)) continue;
      const candidate = clean(firstLocationSentence(match[1]).split(/\s+[–—]\s+|,\s+(?:this|the|an?|our|where|with)\b|\s+(?:on|from|starting|doors|tickets)\b/i)[0]).replace(/[.,]+$/, '');
      if (!candidate || /^\d{1,2}(?::\d{2})?(?:\s|$)/.test(candidate) && !numberedStreetKey(candidate) || broadLabel(candidate)) continue;
      if (/@|https?:\/\//i.test(candidate)) continue;
      mentions.push(candidate);
    }
  }
  return [...new Set(mentions)];
}

function exactVenues(mention: string, venues: VenueData[]): VenueData[] {
  const key = nameKey(mention), street = numberedStreetKey(mention);
  return venues.filter(venue => {
    const record = venue as VenueData & {pagename?: string; title?: string; aliases?: string[]};
    const names = [venue.name, record.pagename, record.title, ...(record.aliases || [])].filter(Boolean) as string[];
    const aliases = listVenueAliases().filter(alias => names.some(name => nameKey(name) === nameKey(alias.canonical))).map(alias => alias.alias);
    return [...names, ...aliases].some(name => nameKey(name) === key) ||
      Boolean(street && postalStreetIdentity(mention) && street === numberedStreetKey(venue.address) && compatibleStreetLocality(mention, venue.address || ''));
  });
}

/** Independent exact candidates must all resolve to the same existing venue. */
export function reconcileExplicitVenues(mentions: string[], venues: VenueData[]): {venue?: VenueData; reasons: string[]} {
  const resolved = mentions.map(mention => exactVenues(mention, venues));
  if (resolved.some(matches => matches.length !== 1)) return {reasons: ['unresolved_explicit_venue']};
  const ids = new Set(resolved.map(matches => matches[0].id));
  if (ids.size > 1) return {reasons: ['competing_explicit_venues']};
  return {venue: resolved[0]?.[0], reasons: []};
}

function printedClock(text: string): string | undefined {
  if (!text) return undefined;
  // Bare 1–12 clocks do not establish meridiem. Never use doors to invent showtime.
  if (!/^(?:\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?|(?:[01]\d|2[0-3]):[0-5]\d)$/i.test(clean(text))) return undefined;
  return normalizeTime(text) || undefined;
}

/** A printed range can share its explicit meridiem; an isolated bare clock cannot. */
export function resolvePosterClocks(poster: StructuredPosterEvidence): {start?: string; end?: string; doors?: string} {
  let start = printedClock(poster.startText), end = printedClock(poster.endText), doors = printedClock(poster.doorsText);
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const meridiem = poster.endText.match(/([ap])\.?\s*m\.?$/i)?.[1];
  if (!start && end && meridiem && /^\d{1,2}(?::\d{2})?$/.test(poster.startText) &&
      new RegExp(`${escape(poster.startText)}\\s*[-–—]\\s*${escape(poster.endText)}`, 'i').test(poster.clockEvidence)) {
    start = printedClock(`${poster.startText} ${meridiem}m`);
    if (start && start >= end) start = undefined;
  }
  // The same dated admission block can anchor doors before an explicit show.
  if (!doors && start && /^\d{1,2}(?::\d{2})?$/.test(poster.doorsText) &&
      new RegExp(`doors?[^\\d]{0,30}${escape(poster.doorsText)}`, 'i').test(poster.clockEvidence)) {
    const candidates = ['am', 'pm'].map(marker => printedClock(`${poster.doorsText} ${marker}`)).filter(Boolean) as string[];
    const minute = (clock: string): number => Number(clock.slice(0,2))*60 + Number(clock.slice(3));
    const plausible = candidates.filter(clock => minute(start!) - minute(clock) >= 0 && minute(start!) - minute(clock) <= 240);
    if (plausible.length === 1) doors = plausible[0];
  }
  return {start, end, doors};
}

function captionClocks(caption: string): StructuredPosterEvidence | undefined {
  const clock = '(\\d{1,2}(?::\\d{2})?(?:\\s*[ap]\\.?\\s*m\\.?)?)';
  const shows = [...new Map([...caption.matchAll(new RegExp(`\\b(?:show(?:time)?|performance|concert|activity)\\s*(?:(?:starts?|begins?)\\s*)?(?:at|:)\\s*${clock}`, 'gi'))].map(match => [match[1], match])).values()];
  const doors = [...new Map([...caption.matchAll(new RegExp(`\\bdoors?(?:\\s+open(?:s)?)?\\s*(?:at|:)?\\s*${clock}`, 'gi'))].map(match => [match[1], match])).values()];
  if (!shows.length && !doors.length) return undefined;
  return {status: 'no_physical_venue', occurrence: shows.length <= 1 && doors.length <= 1 ? 'matching' : 'conflict',
    venueText: '', addressText: '', venueEvidence: '', broadEvidence: '', startText: shows[0]?.[1] || '',
    endText: '', doorsText: doors[0]?.[1] || '', clockEvidence: [...shows, ...doors].map(match => match[0]).join('\n')};
}

export function validateStructuredLocation(params: {
  row: RawRowData; sourceSignature: string; venues: VenueData[];
  poster: StructuredPosterEvidence | 'no_media' | 'unavailable' | 'over_limit';
  structuredEnd?: {endTime?: string; endDate?: string; source: 'dateTimeSentence' | 'duration' | 'descriptionRange'} | null;
}): StructuredLocationValidation {
  const {row, sourceSignature, venues, poster} = params;
  const caption = [row.facebookEventDescription, row.text].filter(Boolean).join('\n');
  const evidence = anchoredVenueMentions(String(row.sharedPostText || ''), caption);
  const reasons: string[] = [];
  const mediaStatus = typeof poster === 'string' ? poster : poster.status;
  if (typeof poster === 'string' && poster !== 'no_media') reasons.push(`poster_${poster}`);
  if (typeof poster !== 'string') {
    if (poster.status === 'unreadable') reasons.push('poster_unreadable');
    if (poster.occurrence === 'conflict') reasons.push('poster_occurrence_conflict');
    if (poster.status === 'explicit_venue') {
      if (!poster.venueEvidence || (!poster.venueText && !poster.addressText)) reasons.push('missing_poster_venue_evidence');
      if (poster.venueText) evidence.push(poster.venueText);
      if (poster.addressText) evidence.push(poster.addressText);
    }
    if (poster.status === 'broad_event' && !poster.broadEvidence) reasons.push('missing_broad_event_evidence');
  }
  const spatial = classifySpatialEvent({name: row.sharedPostText, combinedText: caption});
  if (['route', 'multi_location', 'separate_occurrences'].includes(spatial.kind)) reasons.push('spatial_event_requires_review');
  const resolution = reconcileExplicitVenues(evidence, venues);
  reasons.push(...resolution.reasons);
  const local = utcToLocal(row.utcStartDate || row.timestamp || '');
  let startTime = local.time, endTime: string | undefined, doorsTime: string | undefined, timeFlags: TimeFlags | undefined;
  const captionTiming = captionClocks(caption);
  const posterTiming = typeof poster !== 'string' && (poster.startText || poster.endText || poster.doorsText) ? poster : undefined;
  const timing = posterTiming || captionTiming;
  if (posterTiming && captionTiming) {
    const printed = resolvePosterClocks(posterTiming), written = resolvePosterClocks(captionTiming);
    if (written.start && printed.start && written.start !== printed.start || written.doors && printed.doors && written.doors !== printed.doors) reasons.push('caption_poster_clock_conflict');
  }
  if (timing) {
    const {start, end, doors} = resolvePosterClocks(timing);
    if ([['start', timing.startText, start], ['end', timing.endText, end], ['doors', timing.doorsText, doors]].some(([,raw,value]) => raw && !value)) reasons.push('unresolved_poster_clock');
    if ((start || end || doors) && (!timing.clockEvidence || timing.occurrence !== 'matching')) reasons.push('unanchored_poster_clock');
    if (doors && !start) reasons.push('doors_without_showtime');
    if (end && !start) reasons.push('poster_end_without_start');
    if ([timing.startText, timing.endText, timing.doorsText].some(text => text && !timing.clockEvidence.includes(text))) reasons.push('missing_clock_quotation');
    if (end && params.structuredEnd && ['dateTimeSentence', 'descriptionRange'].includes(params.structuredEnd.source) &&
        (end !== params.structuredEnd.endTime || params.structuredEnd.endDate !== local.date)) reasons.push('structured_poster_end_conflict');
    // A printed doors clock can reconcile the FB admission instant only when the
    // same poster explicitly supplies the performance start on this occurrence.
    if (start && start !== local.time && doors !== local.time) reasons.push('structured_poster_start_conflict');
    if (start && timing.occurrence === 'matching') {
      startTime = start; endTime = end; doorsTime = doors;
      timeFlags = {start: {source: 'explicit', evidence: timing.clockEvidence},
        end: end ? {source: 'explicit', toClose: false, evidence: timing.clockEvidence} : {source: 'none', toClose: false, evidence: ''}};
    }
  }
  return {version: STRUCTURED_LOCATION_VALIDATION_VERSION, sourceSignature, mediaSignature: structuredMediaSignature(row.mediaUrls || []),
    decision: reasons.length ? 'hold' : resolution.venue ? 'venue' : 'broad', posterStatus: mediaStatus,
    ...(typeof poster !== 'string' ? {posterEvidence: poster} : {}),
    ...(resolution.venue ? {venueId: resolution.venue.id} : {}), evidence, reasons: [...new Set(reasons)],
    startTime, ...(endTime ? {endTime} : {}), ...(doorsTime ? {doorsTime} : {}), ...(timeFlags ? {timeFlags} : {})};
}
