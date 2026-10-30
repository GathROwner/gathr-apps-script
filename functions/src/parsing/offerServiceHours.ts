import {DateTime} from 'luxon';
import type {FormattedEvent, TimeResolvedEvent, DayHours} from './types.js';

export type OfferService = 'food' | 'bar';
export interface VerifiedOfferHours {
  venueId: string;
  placeId: string;
  verifiedAt: string;
  sourceUrl: string;
  service: OfferService;
  hours: DayHours;
}

const DATE_CUE = /\b(?:today|tomorrow|halloween|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i;
export const offerHasSourceDate=(text:string):boolean=>DATE_CUE.test(text);
const RESTRICTED = /\b(?:breakfast|brunch|lunch|dinner|supper|happy\s+hour|tonight|evening|afternoon|morning|after|before|until|from\s+\d|limited\s+hours?|while\s+(?:supplies|quantities)\s+last)\b|\b\d{1,2}(?::\d{2}|\s*[ap]\.?m\.?)\b/i;
const SESSION = /\b(?:concert|party|show|screening|movie|class|workshop|lesson|tasting|performance|reservation|seating|session)\b/i;

/** An offer date is required; an inherited post date alone is insufficient. */
export function datedUntimedOfferService(event: FormattedEvent, includeRestricted = false): OfferService | null {
  if (event.isFoodSpecial !== 'Yes' || event.isEvent === 'Yes' ||
      !['Food Special', 'Drink Special'].includes(event.category) ||
      event.startTime?.trim() || event.endTime?.trim() || event._sourceTimeConstraint ||
      event.isRecurring === true || event.isRecurring === 'Yes' ||
      event.recurringPattern && event.recurringPattern !== 'none' ||
      event.endDate && event.endDate !== event.startDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate || '') ||
      DateTime.fromISO(event.startDate).toISODate() !== event.startDate) return null;
  const kind = event.spatialEvidence?.kind || event.spatial?.kind;
  if (kind && kind !== 'single_location' ||
      event.spatialEvidence && event.spatialEvidence.representation !== 'venue') return null;
  const text = `${event.name || ''} ${event.description || ''}`;
  if (!DATE_CUE.test(text) || !includeRestricted && (RESTRICTED.test(text) || SESSION.test(text))) return null;
  return event.category === 'Drink Special' ? 'bar' : 'food';
}

/** Building hours are not food service hours at a mixed bar/entertainment venue. */
export function typesSupportOfferService(types: string[], service: OfferService): boolean {
  const set = new Set(types);
  if (service === 'bar') return ['bar', 'pub', 'cocktail_bar'].some(t => set.has(t));
  return ['restaurant', 'fast_food_restaurant', 'hamburger_restaurant'].some(t => set.has(t)) &&
    !['bar', 'pub', 'night_club', 'casino', 'amusement_center', 'hotel', 'shopping_mall'].some(t => set.has(t));
}

export function inferOfferAvailability(
  event: FormattedEvent, evidence: VerifiedOfferHours, zone = 'America/Halifax', now = Date.now()
): TimeResolvedEvent | null {
  if (datedUntimedOfferService(event) !== evidence.service) return null;
  const checked = DateTime.fromISO(evidence.verifiedAt, {zone});
  const occurrence = DateTime.fromISO(event.startDate, {zone});
  const age = now - checked.toMillis();
  if (!checked.isValid || age < -60000 || age > 7 * 86400000 ||
      Math.abs(occurrence.diff(checked.startOf('day'), 'days').days) > 7 ||
      !evidence.venueId || !evidence.placeId || !/^https:\/\//.test(evidence.sourceUrl)) return null;
  const {open, close, closed} = evidence.hours;
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (closed || !clock.test(open) || !clock.test(close) || open === close) return null;
  const endDate = close < open ? occurrence.plus({days: 1}).toISODate()! : event.startDate;
  const point = (date: string, time: string) => ({localDate: date, localTime: time, timeZone: zone,
    at: DateTime.fromISO(`${date}T${time}`, {zone}).toUTC().toISO(), status: 'estimated',
    sourceType: 'verified_service_hours', sourceUrl: evidence.sourceUrl,
    observedAt: evidence.verifiedAt, confidence: 'medium', method: 'dated_offer_service_hours',
    evidence: 'Offer has no advertised clock; availability inferred from verified relevant service hours.'});
  const proof = `Inferred offer availability from verified ${evidence.service === 'bar' ? 'bar' : 'restaurant'} hours (${open}–${close}); promotion clocks were not advertised.`;
  return {...event, startTime: open, endTime: close, endDate,
    timing: {version: 2, timeZone: zone, scheduleKind: 'availability_window',
      schedule: {start: point(event.startDate, open), end: point(endDate, close)},
      estimate: {confidence: 'medium', displayEndDate: endDate, displayEndTime: close,
        discoveryCutoffDate: endDate, discoveryCutoffTime: close,
        method: 'dated_offer_service_hours', estimateVersion: 'offer-service-hours-v1'},
      policyVersion: 'honest-end-times-v2'},
    timeFlags: {start: {source: 'semantic', evidence: proof},
      end: {source: 'semantic', toClose: false, evidence: proof}},
    timeResolution: {hoursUsed: true, startFromHours: true, reason: 'dated_offer_service_hours',
      offerAvailability: {...evidence, version: 1, startDate: event.startDate, endDate}}};
}

/** Seasonal words alone do not connect a drinks promotion to a party's clock. */
export function websiteTitleSupportsOffer(itemName: string, candidateTitle: string): boolean {
  const product = /\b(?:drinks?|cocktails?|beers?|burgers?|wings?|pizza|food|meals?|treats?)\b/i;
  if (!product.test(itemName)) return true;
  const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const generic = new Set(['the','a','and','with','at','for','of','free','special','specials','offer','offers',
    'halloween','christmas','holiday','holidays','easter','friday','saturday','sunday','monday','tuesday','wednesday','thursday']);
  const identity = tokens(itemName).filter(t => !generic.has(t));
  const candidate = new Set(tokens(candidateTitle));
  if (/\b(?:party|concert|show|performance|screening|class|workshop)\b/i.test(candidateTitle) &&
      !/\b(?:party|concert|show|performance|screening|class|workshop)\b/i.test(itemName)) return false;
  return identity.length > 0 && identity.every(t => candidate.has(t));
}

/** Prevent later legacy normalization from detaching clocks from their proof. */
export function coherentOfferAvailability(event: TimeResolvedEvent): boolean {
  const proof = event.timeResolution?.offerAvailability;
  const timing = event.timing as any;
  return Boolean(proof && timing?.version === 2 && timing.scheduleKind === 'availability_window' &&
    event.startDate === proof.startDate && event.endDate === proof.endDate &&
    event.startTime === proof.hours.open && event.endTime === proof.hours.close &&
    timing.schedule?.start?.localDate === event.startDate && timing.schedule.start.localTime === event.startTime &&
    timing.schedule.start.status === 'estimated' && timing.schedule?.end?.localDate === event.endDate &&
    timing.schedule.end.localTime === event.endTime && timing.schedule.end.status === 'estimated' &&
    event.timeFlags?.start?.source === 'semantic' && event.timeFlags?.end?.source === 'semantic' &&
    event.timeFlags.end.toClose === false);
}
