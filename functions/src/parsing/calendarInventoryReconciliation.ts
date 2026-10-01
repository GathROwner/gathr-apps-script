import type { CalendarItem } from './types.js';

/** A literal per-image listing read. Dates must be resolved before reconciliation. */
export interface CalendarInventoryListing {
  date: string;
  title: string;
  startTime: string;
  endTime?: string | null;
  venue?: string | null;
  performers?: string[];
  excerpt?: string;
  frameIndex: number;
  sourceGalleryIndex: number;
}

export interface CalendarInventoryConflict {
  listing: CalendarInventoryListing;
  reason: 'same_slot_different_title' | 'duplicate_across_images' | 'invalid_fields';
}

export interface CalendarInventoryReconciliation {
  matched: CalendarInventoryListing[];
  additions: CalendarInventoryListing[];
  conflicts: CalendarInventoryConflict[];
}

export function normalizeCalendarInventoryTitle(value: string): string {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

export function normalizeCalendarInventoryTime(value: string): string | null {
  const text = String(value || '').trim();
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) return null;
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2] || '00'}`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Compare a second image reading with primary Stage 3 items. A same-time title
 * disagreement is held for review because it may be a spelling change or a
 * genuinely simultaneous event. This routine never changes primary items.
 */
export function reconcileCalendarInventory(
  primary: readonly CalendarItem[],
  inventory: readonly CalendarInventoryListing[]
): CalendarInventoryReconciliation {
  const matched: CalendarInventoryListing[] = [];
  const additions: CalendarInventoryListing[] = [];
  const conflicts: CalendarInventoryConflict[] = [];
  const seenInventory = new Map<string, number>();
  const primarySlots = new Map<string, CalendarItem[]>();
  for (const item of primary) {
    const time = normalizeCalendarInventoryTime(item.startTime);
    if (!validDate(item.date) || !time) continue;
    const key = `${item.date}|${time}`;
    primarySlots.set(key, [...(primarySlots.get(key) || []), item]);
  }

  for (const listing of inventory) {
    const time = normalizeCalendarInventoryTime(listing.startTime);
    const title = normalizeCalendarInventoryTitle(listing.title);
    if (!validDate(listing.date) || !time || !title ||
        !Number.isInteger(listing.frameIndex) || listing.frameIndex < 0 ||
        !Number.isInteger(listing.sourceGalleryIndex) || listing.sourceGalleryIndex < 0) {
      conflicts.push({ listing, reason: 'invalid_fields' });
      continue;
    }
    const slot = `${listing.date}|${time}`;
    const identity = `${slot}|${title}`;
    const priorImage = seenInventory.get(identity);
    if (priorImage !== undefined) {
      if (priorImage !== listing.sourceGalleryIndex) {
        conflicts.push({ listing, reason: 'duplicate_across_images' });
      }
      continue;
    }
    seenInventory.set(identity, listing.sourceGalleryIndex);

    const sameSlot = primarySlots.get(slot) || [];
    if (sameSlot.some(item => normalizeCalendarInventoryTitle(item.name) === title)) {
      matched.push(listing);
    } else if (sameSlot.length > 0) {
      conflicts.push({ listing, reason: 'same_slot_different_title' });
    } else {
      additions.push(listing);
    }
  }
  return { matched, additions, conflicts };
}
