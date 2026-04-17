/**
 * Date/Time Utilities
 * Ported from utilities.js
 */

import { DateTime } from 'luxon';

// Default timezone for PEI
const DEFAULT_TIMEZONE = 'America/Halifax';

/**
 * Format a date string to yyyy-MM-dd format
 */
export function formatDate(dateString: string | Date, timezone: string = DEFAULT_TIMEZONE): string {
  if (!dateString) return '';

  let dt: DateTime;

  if (dateString instanceof Date) {
    dt = DateTime.fromJSDate(dateString, { zone: timezone });
  } else {
    // Try parsing various formats
    dt = DateTime.fromISO(dateString, { zone: timezone });

    if (!dt.isValid) {
      dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd', { zone: timezone });
    }

    if (!dt.isValid) {
      dt = DateTime.fromFormat(dateString, 'M/d/yyyy', { zone: timezone });
    }

    if (!dt.isValid) {
      dt = DateTime.fromFormat(dateString, 'MM/dd/yyyy', { zone: timezone });
    }

    if (!dt.isValid) {
      dt = DateTime.fromFormat(dateString, 'MMMM d, yyyy', { zone: timezone });
    }
  }

  if (!dt.isValid) {
    console.warn(`Unable to parse date: ${dateString}`);
    return '';
  }

  return dt.toFormat('yyyy-MM-dd');
}

/**
 * Format a time string to HH:MM:SS AM/PM format (12-hour)
 */
export function formatTime(timeString: string): string {
  if (!timeString) return '';

  const normalized = normalizeTime(timeString);
  if (!normalized) return '';

  const [hours, minutes] = normalized.split(':').map(n => parseInt(n, 10));

  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;

  return `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00 ${period}`;
}

/**
 * Normalize a time string to HH:MM format (24-hour)
 */
export function normalizeTime(timeString: string): string {
  if (!timeString) return '';

  let time = timeString.trim().toLowerCase();

  // Remove seconds if present, but preserve HH:MM values.
  time = time.replace(/^(\d{1,2}:\d{2}):\d{2}(?=\s|$|[ap])/i, '$1');

  // Handle "noon" and "midnight"
  if (time === 'noon' || time === '12 noon') return '12:00';
  if (time === 'midnight' || time === '12 midnight') return '00:00';

  // Extract AM/PM
  const isPM = /pm|p\.m\.|p\.m/i.test(time);
  const isAM = /am|a\.m\.|a\.m/i.test(time);

  // Remove AM/PM markers
  time = time.replace(/\s*(am|pm|a\.m\.?|p\.m\.?)\s*/gi, '').trim();

  // Parse time components
  let hours: number;
  let minutes = 0;

  if (time.includes(':')) {
    const parts = time.split(':');
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10) || 0;
  } else {
    // Handle formats like "7pm" or "730"
    if (time.length <= 2) {
      hours = parseInt(time, 10);
    } else if (time.length === 3) {
      hours = parseInt(time[0], 10);
      minutes = parseInt(time.substring(1), 10);
    } else if (time.length === 4) {
      hours = parseInt(time.substring(0, 2), 10);
      minutes = parseInt(time.substring(2), 10);
    } else {
      return '';
    }
  }

  if (isNaN(hours) || hours < 0 || hours > 23) return '';
  if (isNaN(minutes) || minutes < 0 || minutes > 59) return '';

  // Convert to 24-hour format
  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Convert UTC date/time to local timezone
 */
export function utcToLocal(
  utcDateString: string,
  timezone: string = DEFAULT_TIMEZONE
): { date: string; time: string } {
  if (!utcDateString) {
    return { date: '', time: '' };
  }

  const dt = DateTime.fromISO(utcDateString, { zone: 'UTC' }).setZone(timezone);

  if (!dt.isValid) {
    console.warn(`Unable to parse UTC date: ${utcDateString}`);
    return { date: '', time: '' };
  }

  return {
    date: dt.toFormat('yyyy-MM-dd'),
    time: dt.toFormat('HH:mm'),
  };
}

/**
 * Parse relative time expressions like "today", "tonight", "tomorrow"
 */
export function parseRelativeDate(
  expression: string,
  referenceDate: Date = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string | null {
  const expr = expression.toLowerCase().trim();
  const refDt = DateTime.fromJSDate(referenceDate, { zone: timezone });

  switch (expr) {
    case 'today':
    case 'tonight':
    case 'this evening':
      return refDt.toFormat('yyyy-MM-dd');

    case 'tomorrow':
    case 'tomorrow night':
      return refDt.plus({ days: 1 }).toFormat('yyyy-MM-dd');

    case 'this weekend':
      // Return next Saturday
      const daysUntilSaturday = (6 - refDt.weekday + 7) % 7 || 7;
      return refDt.plus({ days: daysUntilSaturday }).toFormat('yyyy-MM-dd');

    default:
      // Try parsing day names
      const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const dayIndex = dayNames.indexOf(expr.replace('this ', '').replace('next ', ''));

      if (dayIndex >= 0) {
        const targetDay = dayIndex + 1; // Luxon uses 1-7 for Mon-Sun
        let daysToAdd = targetDay - refDt.weekday;
        if (daysToAdd <= 0 || expr.startsWith('next ')) {
          daysToAdd += 7;
        }
        return refDt.plus({ days: daysToAdd }).toFormat('yyyy-MM-dd');
      }

      return null;
  }
}

/**
 * Check if a date string represents a past date
 */
export function isDateInPast(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd', { zone: timezone });
  const now = DateTime.now().setZone(timezone).startOf('day');

  return dt < now;
}

/**
 * Check if a date string represents a date too far in the future
 */
export function isDateTooFarInFuture(
  dateString: string,
  maxDaysAhead: number = 365,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd', { zone: timezone });
  const maxDate = DateTime.now().setZone(timezone).plus({ days: maxDaysAhead });

  return dt > maxDate;
}

/**
 * Calculate the end date for an event that spans overnight
 * If endTime < startTime, bump end date to next day
 */
export function calculateEndDate(
  startDate: string,
  startTime: string,
  endTime: string
): string {
  if (!endTime || !startTime || !startDate) {
    return startDate;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (endMinutes < startMinutes) {
    // Overnight event - end date is next day
    const dt = DateTime.fromFormat(startDate, 'yyyy-MM-dd');
    return dt.plus({ days: 1 }).toFormat('yyyy-MM-dd');
  }

  return startDate;
}

/**
 * Convert time string to minutes since midnight
 */
function timeToMinutes(timeString: string): number {
  const normalized = normalizeTime(timeString);
  if (!normalized) return 0;

  const [hours, minutes] = normalized.split(':').map(n => parseInt(n, 10));
  return hours * 60 + minutes;
}

/**
 * Get day of week from date string
 */
export function getDayOfWeek(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd', { zone: timezone });
  return dt.toFormat('EEEE').toLowerCase();
}

/**
 * Format a date for display (e.g., "Friday, January 15")
 */
export function formatDateForDisplay(
  dateString: string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const dt = DateTime.fromFormat(dateString, 'yyyy-MM-dd', { zone: timezone });
  if (!dt.isValid) return dateString;
  return dt.toFormat('EEEE, MMMM d');
}

/**
 * Format a time range for display (e.g., "7:00 PM - 10:00 PM")
 */
export function formatTimeRange(startTime: string, endTime?: string): string {
  const start = formatTime(startTime);
  if (!start) return '';

  if (!endTime) return start.replace(':00 ', ' ');

  const end = formatTime(endTime);
  if (!end) return start.replace(':00 ', ' ');

  // Remove seconds for cleaner display
  const startClean = start.replace(':00 ', ' ');
  const endClean = end.replace(':00 ', ' ');

  return `${startClean} - ${endClean}`;
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return DateTime.now().toISO();
}

/**
 * Parse a timestamp from various formats to a Date object
 */
export function parseTimestamp(timestamp: string | Date): Date | null {
  if (timestamp instanceof Date) {
    return timestamp;
  }

  const dt = DateTime.fromISO(timestamp);
  if (dt.isValid) {
    return dt.toJSDate();
  }

  // Try other formats
  const formats = [
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd',
    'M/d/yyyy h:mm:ss a',
    'M/d/yyyy',
  ];

  for (const format of formats) {
    const parsed = DateTime.fromFormat(timestamp, format);
    if (parsed.isValid) {
      return parsed.toJSDate();
    }
  }

  return null;
}
