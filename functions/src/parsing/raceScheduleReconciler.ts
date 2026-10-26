import { DateTime } from 'luxon';
import { ProcessedEvent } from './types.js';
import {transferFamilyAudienceEvidence} from '../services/familyAudienceEvidence.js';

export interface RaceScheduleReconciliation {
  events: ProcessedEvent[];
  applied: boolean;
  foldedCount: number;
  correctedStart: boolean;
  restoredRegistrationUrl: boolean;
}

/** Keep a clearly advertised race together when the model reads its heats as events. */
export function reconcileRaceSchedule(
  events: ProcessedEvent[],
  combinedText: string
): RaceScheduleReconciliation {
  const unchanged = (): RaceScheduleReconciliation => ({
    events, applied: false, foldedCount: 0,
    correctedStart: false, restoredRegistrationUrl: false,
  });
  if (!Array.isArray(events) || events.length === 0) return unchanged();
  const text = String(combinedText || '');
  const heading = text.match(/^\s*([^\r\n]{5,120}?)\s*[–—-]\s*RACE UPDATE!?\s*$/im);
  const firstHeat = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[–—-]\s*First Heat\s*:/i);
  if (!heading || !firstHeat || !/\brace kit pick[ -]?up\b/i.test(text) ||
      !/\bwarm[ -]?up\b/i.test(text)) return unchanged();

  const rawTitle = heading[1].trim();
  const anchor = rawTitle.replace(/\s+presented by\b.*$/i, '').toLowerCase();
  if (anchor.split(/\s+/).length < 2) return unchanged();
  const related = events.filter(event =>
    String(event.name || '').toLowerCase().includes(anchor)
  );
  if (related.length === 0) return unchanged();

  const heatEvent = related.find(event => /\bfirst heat\b/i.test(event.name || ''));
  const parentEvent = related.find(event =>
    !/\b(?:kit pick[ -]?up|registration|warm[ -]?up|heat)\b/i.test(event.name || '')
  );
  const parentSource = parentEvent || heatEvent;
  if (!parentSource?.startDate) return unchanged();
  const raceDate = parentSource.startDate;
  const dayHeaders = [...text.slice(0, firstHeat.index).matchAll(
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi
  )];
  const dayHeader = dayHeaders.at(-1);
  const printedRaceDate = dayHeader && DateTime.fromFormat(
    `${dayHeader[1]} ${dayHeader[2]} ${raceDate.slice(0, 4)}`,
    'LLLL d yyyy'
  );
  if (!printedRaceDate?.isValid || printedRaceDate.toISODate() !== raceDate) return unchanged();
  const sameDay = related.filter(event => event.startDate === raceDate);
  if (sameDay.length === 0) return unchanged();
  // Separate distance races or independently ticketed sessions are not heats
  // in one advertised children's race. Require every folded title to identify
  // the parent or one of the printed logistics/heat roles.
  const titleKey = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (sameDay.some(event => !/\b(?:kit pick[ -]?up|registration|warm[ -]?up|heat)\b/i.test(event.name || '') &&
      ![titleKey(rawTitle),titleKey(anchor)].includes(titleKey(event.name)) &&
      !titleKey(event.name).startsWith(titleKey(anchor) + ' free event for kids'))) return unchanged();

  const hour = Number(firstHeat[1]) % 12 + (firstHeat[3].toLowerCase() === 'pm' ? 12 : 0);
  const minute = Number(firstHeat[2] || 0);
  if (hour > 23 || minute > 59) return unchanged();
  const explicitStart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const warmupClock = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[–—-]\s*(?:Fun\s+)?Warm[ -]?Up\b/i);
  const printedWarmup = warmupClock ? `${String(Number(warmupClock[1]) % 12 + (warmupClock[3].toLowerCase()==='pm'?12:0)).padStart(2,'0')}:${String(Number(warmupClock[2]||0)).padStart(2,'0')}` : '';
  if (sameDay.some(event => !/\b(?:kit pick[ -]?up|registration|warm[ -]?up|heat)\b/i.test(event.name || '') &&
      event.startTime && event.startTime!==explicitStart && event.startTime!==printedWarmup)) return unchanged();

  const registrationUrl = text.match(/\bRegister(?:\s+today)?\s*:\s*(https?:\/\/[^\s<>]+)/i)?.[1]
    ?.replace(/[.,;!]+$/, '') || '';
  const schedule = text.match(/\bSaturday,?\s+[^\r\n]+\r?\n([\s\S]*?)(?:\r?\n\s*We can|\r?\n\s*Register|\r?\n\s*OCR TEXT|$)/i);
  const scheduleText = schedule?.[1]?.trim() || '';
  const title = rawTitle.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\bBy\b/g, 'by');
  const parent: ProcessedEvent = { ...parentSource, name: title, startTime: explicitStart };
  // Reset item spatial evidence to the source's explicitly labelled race host.
  // Friday pickup remains its own item and cannot become a race map location.
  const raceLocation = text.match(/^\s*Location\s*:\s*([^\r\n]+)$/im)?.[1]?.trim();
  if (raceLocation && !/[;|]/.test(raceLocation) && !/\b(?:and|or|various|multiple)\b/i.test(raceLocation)) {
    parent.establishment = raceLocation;
    parent.venue = raceLocation;
    parent.additionalLocation = raceLocation;
    parent.spatial = {kind:'single_location',locations:[{label:raceLocation,role:'location',certainty:'confirmed'}]};
    parent.spatialEvidence = undefined;
  }
  const description = String(parent.description || '').trim();
  const detailKinds = [
    /on-site registration/i,
    /warm[ -]?up/i,
    /first heat/i,
    /ages\s*6\s*[–-]\s*9/i,
    /ages\s*10\s*[–-]\s*12/i,
  ];
  const missingDetails = scheduleText.split(/\r?\n/).map(line => line.trim())
    .filter(line => detailKinds.some(kind => kind.test(line) && !kind.test(description)));
  if (missingDetails.length > 0) {
    parent.description = [description, `Additional race-day details: ${missingDetails.join('; ')}`]
      .filter(Boolean).join('\n\n');
  }
  if (registrationUrl) {
    parent.ticketLink = registrationUrl;
    parent.ticketsBuyUrl = registrationUrl;
  }
  const correctedStart = parentSource.startTime !== explicitStart;
  if (parent.timeFlags?.end?.source !== 'explicit') {
    parent.endTime = '';
    parent.endDate = raceDate;
    parent.timeResolution = {hoursUsed:false};
    parent.timeFlags = {...parent.timeFlags,
      start:{source:'explicit',evidence:firstHeat[0]},
      end:{source:'none',toClose:false,evidence:'No race finish advertised in the source schedule'}};
  }
  if (parent.timeFlags?.start) {
    parent.timeFlags = {
      ...parent.timeFlags,
      start: { source: 'explicit', evidence: firstHeat[0] },
    };
  }
  parent.familyAudienceEvidence = transferFamilyAudienceEvidence(parentSource,parent);

  const folded = new Set(sameDay);
  const result = events.filter(event => !folded.has(event));
  result.splice(events.findIndex(event => folded.has(event)), 0, parent);
  return {
    events: result,
    applied: true,
    foldedCount: Math.max(0, sameDay.length - 1),
    correctedStart,
    restoredRegistrationUrl: Boolean(registrationUrl &&
      (parentSource.ticketsBuyUrl !== registrationUrl ||
        parentSource.ticketLink !== registrationUrl)),
  };
}
