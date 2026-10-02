type SlotEvent = {
  eventName?: string;
  name?: string;
};

function title(event: SlotEvent): string {
  return String(event.eventName || event.name || '');
}

export function explicitSlotOrdinal(event: SlotEvent): number | null {
  const match = title(event).match(/\b(?:time\s*slot|slot|group|session)\s*(?:#|no\.?\s*)?([1-9])\b(?!\s*:)/i);
  return match ? Number(match[1]) : null;
}

export function hasConflictingExplicitSlotOrdinals(left: SlotEvent, right: SlotEvent): boolean {
  const leftSlot = explicitSlotOrdinal(left);
  const rightSlot = explicitSlotOrdinal(right);
  return leftSlot !== null && rightSlot !== null && leftSlot !== rightSlot;
}

function distinctiveTitleTokens(event: SlotEvent): Set<string> {
  const normalized = title(event)
    .toLowerCase()
    .replace(/['\u2019\u2018]/g, '')
    .replace(/\b(?:time\s*slot|slot|group|session)\s*(?:#|no\.?\s*)?[1-9]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ');
  const ignored = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'at', 'lets', 'get',
    'fall', 'spring', 'summer', 'winter', 'kid', 'kids', 'child', 'children',
  ]);
  return new Set(normalized.split(/\s+/).filter(token =>
    token.length >= 3 && !ignored.has(token) && !/^\d+$/.test(token)
  ));
}

/** Use an explicit Group/Slot number only when the surrounding event title also agrees. */
export function hasMatchingExplicitSlotIdentity(left: SlotEvent, right: SlotEvent): boolean {
  const leftSlot = explicitSlotOrdinal(left);
  if (leftSlot === null || leftSlot !== explicitSlotOrdinal(right)) return false;
  const leftTokens = distinctiveTitleTokens(left);
  const rightTokens = distinctiveTitleTokens(right);
  const shared = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return shared >= 3 && shared / Math.min(leftTokens.size, rightTokens.size) >= 0.6;
}
