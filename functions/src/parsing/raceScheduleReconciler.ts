import { DateTime } from 'luxon';
import { ProcessedEvent } from './types.js';

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

  const hour = Number(firstHeat[1]) % 12 + (firstHeat[3].toLowerCase() === 'pm' ? 12 : 0);
  const minute = Number(firstHeat[2] || 0);
  if (hour > 23 || minute > 59) return unchanged();
  const explicitStart = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const registrationUrl = text.match(/\bRegister(?:\s+today)?\s*:\s*(https?:\/\/[^\s<>]+)/i)?.[1]
    ?.replace(/[.,;!]+$/, '') || '';
  const schedule = text.match(/\bSaturday,?\s+[^\r\n]+\r?\n([\s\S]*?)(?:\r?\n\s*We can|\r?\n\s*Register|\r?\n\s*OCR TEXT|$)/i);
  const scheduleText = schedule?.[1]?.trim() || '';
  const title = rawTitle.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
    .replace(/\bBy\b/g, 'by');
  const parent: ProcessedEvent = { ...parentSource, name: title, startTime: explicitStart };
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
  if (correctedStart &&
      parent.timeResolution?.endFromHours === 'duration_default' &&
      parent.timeFlags?.end?.source !== 'explicit') {
    const start = DateTime.fromISO(`${raceDate}T${explicitStart}`);
    if (start.isValid) {
      parent.endTime = start.plus({ hours: 2 }).toFormat('HH:mm');
      parent.endDate = start.plus({ hours: 2 }).toISODate() || raceDate;
    }
  }
  if (parent.timeFlags?.start) {
    parent.timeFlags = {
      ...parent.timeFlags,
      start: { source: 'explicit', evidence: firstHeat[0] },
    };
  }
  if (parent.timeResolution?.endFromHours === 'duration_default' &&
      parent.timeFlags?.end?.source !== 'explicit') {
    parent.timeFlags = {
      ...parent.timeFlags,
      start: parent.timeFlags?.start || { source: 'explicit', evidence: firstHeat[0] },
      end: {
        source: 'semantic',
        toClose: false,
        evidence: 'Two-hour race duration inferred by parser; no end printed',
      },
    };
  }

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
