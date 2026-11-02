import type {ExtractedItem,FormattedEvent} from './types.js';

/** An OCR heading naming only its venue is not an independently named activity. */
export function isCalendarVenueOnlyHeading(name: unknown, venue: unknown): boolean {
  const key=(value:unknown)=>String(value || '').normalize('NFKC')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const title=key(name),place=key(String(venue || '').split('|')[0]);
  return Boolean(title && place && title===place);
}

function explicitlyWithholdsAttendeeVenue(text: string): boolean {
  return /\b(?:location|venue|address)(?:\s+(?:details|information))?(?:\s+and\s+preparation\s+guidelines)?\s+(?:will\s+be|(?:is|are)(?:\s+only)?)\s+(?:provided|shared|disclosed|sent|revealed|given)\s+(?:only\s+)?(?:upon|after|following|on)\s+(?:registration|registering|booking)\b/i.test(text);
}

/** Source-local eligibility, before formatting can make an operations notice
 * or retail story look like a scheduled public activity. No clocks are made. */
export function sourcePublicationHoldReason(item: ExtractedItem, caption: string): string | undefined {
  const title=String(item.name || ''), detail=String(item.description || '');
  const source=caption.split(/\n\s*OCR TEXT:/i)[0];
  // A past activity does not borrow a future opening window elsewhere in a
  // mixed recap. Require the item's own description to identify that recap.
  if(/\b(?:celebrated|celebrating|joined us|had a (?:wonderful|great|fantastic) time)\b/i.test(detail) &&
      /\b(?:thank(?:s| you)|had a (?:wonderful|great|fantastic) time)\b/i.test(source) &&
      /\b(?:joined us|had a (?:wonderful|great|fantastic) time)\b/i.test(source) &&
      !/\b(?:upcoming|join us|next|tomorrow|will (?:be|return)|returns?)\b/i.test(detail))
    return 'past_activity_recap_without_new_occurrence';
  if (/\b(?:exhibition|exhibit)\b/i.test(detail) &&
      /\bon\s+display\b[\s\S]*\buntil\b/i.test(detail) &&
      !String(item.startTime||'').trim())
    return 'exhibition_attendee_availability_unverified';
  if (item._sourceType==='calendar' &&
      /(?:^|;\s*)calendar_ocr(?:_explicit_date_line)?(?:;|$)/i.test(String(item.extractionReason || '')) &&
      isCalendarVenueOnlyHeading(title,item.venue)) return 'calendar_venue_masthead_not_activity';
  // Require the same assertion in the original source and this item's own
  // evidence. A registration sentence for another activity cannot hold this one.
  if (item.spatial?.kind!=='online' && explicitlyWithholdsAttendeeVenue(source) &&
      explicitlyWithholdsAttendeeVenue(`${detail}\n${item.spatial?.evidenceNotes || ''}`))
    return 'attendee_venue_explicitly_withheld';
  if (/^canteen\s+(?:is\s+)?open$/i.test(title.trim()) &&
      !/\b(?:special|deal|discount|fundraiser|tasting|workshop)\b/i.test(detail))
    return 'canteen_operating_hours_not_public_activity';
  if (/\b(?:seniors?|discount)\b/i.test(title) &&
      /\bfront\s*store\b/i.test(`${detail} ${source}`) &&
      /\d+\s*%\s*off|\bdiscount\b/i.test(detail) &&
      !/\b(?:clinic|vaccin|workshop|cafe|caf\u00e9|meal|food|grocery|groceries)\b/i.test(title))
    return 'nonfood_front_store_discount';
  if (((item as ExtractedItem & {category?:string}).category === 'Cinema' ||
      /\b(?:film|movie|screening|cinema)\b/i.test(`${title} ${detail}`)) &&
      /\bif\s+we\s+can\s+get\s+\d+\s+people\s+to\s+commit\b[\s\S]{0,100}\bwe\s+will\s+run\b/i.test(source) &&
      !/\b(?:screening\s+(?:is\s+)?confirmed|target\s+(?:has\s+been\s+)?reached|we\s+are\s+going\s+ahead)\b/i.test(source))
    return 'screening_attendance_condition_unconfirmed';
  if (/\bjudging\b/i.test(title) &&
      (/\bpublic viewing\b/i.test(caption) || /\b(?:home|house|property)\s+decorat(?:ing|ion)\s+contest\b/i.test(title)) &&
      !/\b(?:public judging|watch (?:the )?judging)\b/i.test(`${title} ${detail} ${source}`))
    return 'organizer_judging_not_public_viewing';
  if (/\bpractice\b/i.test(title) && /\b(?:u(?:9|11|13|15|18)(?:aa)?|rebels)\b/i.test(title) &&
      !/\b(?:public|drop[ -]?in|open practice|try[ -]?out|learn to)\b/i.test(`${title} ${detail}`))
    return 'rostered_team_practice_not_public_activity';
  const online=item.spatial?.kind==='online' || /^(?:virtual|online|zoom)$/i.test(String(item.venue || '')) ||
    /\bvirtual\b/i.test(source) && /\b(?:virtual|online)\b/i.test(detail);
  if (online && /\b(?:course|class|program|programme|workshop)\b/i.test(`${title} ${detail} ${source}`) &&
      !/\b(?:hybrid|in[ -]person|attend in person)\b/i.test(`${detail} ${source}`))
    return 'online_only_course_outside_product_scope';
  if (/\b(?:teacup|mug)\b/i.test(source) && /\b(?:shards|broke|broken|demise|tumbling to the floor)\b/i.test(source) &&
      /\b(?:gallery|pottery)\b/i.test(source) && /\b(?:open|hours)\b/i.test(source) &&
      !/\b(?:exhibition|exhibit|opening|reception|artist talk|open house|workshop|class|tour|festival)\b/i.test(title))
    return 'retail_memoir_and_hours_not_public_programme';
  return undefined;
}

/** Preserve the extractor's item-local advertised-clock presence before
 * validation/formatting can borrow an overall programme end or add a default. */
export function preserveCalendarClockPresence(item: ExtractedItem): ExtractedItem {
  if (!['calendar','schedule'].includes(String(item._sourceType || '')) || item.timeFlags) return item;
  return {...item,timeFlags:{
    start:{source:item.startTime?'explicit':'none',evidence:item.startTime?`Extracted item clock: ${item.startTime}`:''},
    end:{source:item.endTime?'explicit':'none',toClose:false,evidence:item.endTime?`Extracted item clock: ${item.endTime}`:''},
  }};
}

/** Preserve calendar/schedule absence and untyped community-event absence.
 * Existing event-tagged nightlife/duration policy, printed ends, proven source
 * durations, to-close offers and specials keep their established paths. */
export function hasUnadvertisedActivityEnd(event: Pick<FormattedEvent,'_sourceType'|'timeFlags'|'isFoodSpecial'|'category'>): boolean {
  return (['calendar','schedule'].includes(String(event._sourceType || '')) ||
      (!String(event._sourceType || '') && event.category === 'Gatherings & Parties' &&
        event.timeFlags?.start?.source === 'explicit')) &&
    event.timeFlags?.end?.source === 'none' && event.timeFlags.end.toClose !== true &&
    event.isFoodSpecial !== 'Yes' && !/\b(?:food special|drink special|happy hour|wing night)\b/i.test(String(event.category || ''));
}

/** A film's advertised run is a set of screenings, not six days of continuous
 * attendance. Keep the first grounded occurrence; never invent later clocks. */
export function boundCinemaRunOccurrence(event:FormattedEvent,item?:ExtractedItem):FormattedEvent {
  if(event.category!=='Cinema' || !item || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(event.endDate))return event;
  const days=(Date.parse(event.endDate)-Date.parse(event.startDate))/86400000;
  if(days<=1 || !/\b(?:plays?\s+(?:until|through)|opens?\s+tonight|screening run)\b/i.test(String(item.description || '')) ||
      /\b(?:festival|marathon|continuous|24[ -]hour)\b/i.test(`${item.name} ${item.description || ''}`))return event;
  return {...event,endDate:event.startDate};
}
