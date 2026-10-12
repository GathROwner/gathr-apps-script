import type {ExtractedItem, FormattedEvent} from './types.js';

export interface SourceTimeConstraint {
  reason: 'unresolved_meridiem' | 'meal_period_without_clock' | 'activity_offer_without_clock';
  evidence: string;
}

/** Preserve an explicit unknown before formatting can normalize a bare 12-hour clock. */
export function hasUnresolvedSourceMeridiem(item?: Partial<ExtractedItem>): boolean {
  if (!item) return false;
  const clock = String(item.startTime || '').trim();
  if (!/^0?[1-8](?::\d{2}|\s*h\s*\d{2})/i.test(clock) ||
      /\d\s*[ap]\.?\s*m\.?\s*$/i.test(clock)) return false;
  const evidence = `${item.description || ''} ${item.extractionReason || ''} ${clock}`;
  return /(?:meridiem|am\s*\/\s*pm).{0,35}(?:unspecified|unknown|ambiguous|not\s+(?:printed|shown|stated|specified))|(?:does\s+not\s+specify|without|no\s+printed).{0,20}(?:a\.?m\.?\s*(?:or|\/)\s*p\.?m\.?|meridiem)|times?\s+(?:are\s+)?(?:left\s+)?ambiguous/i.test(evidence);
}

/** No clock is invented here. Item-local evidence wins over a shared meal caption. */
export function constrainSourceTimes(items: ExtractedItem[], caption: string): ExtractedItem[] {
  const captionOnly = caption.split(/\n\s*OCR TEXT:/i)[0];
  const sharedMeals = captionOnly.match(/\b(?:breakfast|brunch|lunch|dinner|supper)\b/gi) || [];
  const oneSharedMeal = new Set(sharedMeals.map(x => x.toLowerCase())).size === 1
    ? sharedMeals[0] : '';
  return items.map(item => {
    if (hasUnresolvedSourceMeridiem(item)) return {...item,
      _sourceTimeConstraint: {reason: 'unresolved_meridiem', evidence: item.extractionReason || item.description || ''}};
    if (String(item.startTime || '').trim()) return item;
    const special = item._sourceType === 'special' || ('type' in item && item.type === 'special');
    if (!special) return item;
    const detail = `${item.name} ${item.description || ''} ${item.extractionReason || ''}`;
    if (/\b(?:all\s*day|open\s*to\s*close)\b/i.test(`${detail} ${item.timeFlags?.start?.evidence || ''}`)) return item;
    const meal = detail.match(/\b(?:breakfast|brunch|lunch|dinner|supper)\b/i)?.[0] ||
      (items.every(x => x._sourceType === 'special') ? oneSharedMeal : '');
    if (meal) return {...item, _sourceTimeConstraint: {
      reason: 'meal_period_without_clock', evidence: `${meal}: source gives no serving clock`}};
    // A mixed poster's untimed offer must not inherit the venue's whole day.
    const siblings = items.filter(x => x !== item && x._sourceType !== 'special' &&
      x.date === item.date && String(x.startTime || '').trim() &&
      x.relevantImageIndex === item.relevantImageIndex);
    if (Number.isInteger(item.relevantImageIndex) && siblings.length) return {...item, _sourceTimeConstraint: {
      reason: 'activity_offer_without_clock', evidence: 'Untimed offer shares a dated image with a timed activity'}};
    return item;
  });
}

export function blocksStartTimeFallback(event: Pick<FormattedEvent, '_sourceTimeConstraint'>): boolean {
  return Boolean(event._sourceTimeConstraint);
}
