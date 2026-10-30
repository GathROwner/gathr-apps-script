/** One reviewed cross-tour-stop binding. This is neither a domain ban nor a
 * source hold: the Souris stop and different ticket links remain eligible. */
export interface TicketBindingContext {
  sourceUniqueId?: string; uniqueId?: string; sourceUniqueIds?: string[];
  name?: string; eventName?: string; date?: string; startDate?: string;
  venue?: string; venueId?: string | null; establishment?: string;
}

export function isRejectedReviewedTicketBinding(context: TicketBindingContext, value: unknown): boolean {
  const source = '1740954254704708';
  const roots = [context.sourceUniqueId, context.uniqueId, ...(context.sourceUniqueIds || [])]
    .map(id => String(id || '').split('_')[0]);
  const key = (value: unknown) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const name = key(context.eventName || context.name);
  const venueMatches = context.venueId ? context.venueId === 'slug_peibrewingcompany' :
    [context.venue, context.establishment].some(place => key(String(place || '').split('|')[0]) === 'pei brewing company');
  if (!roots.includes(source) || (context.startDate || context.date) !== '2026-10-30' ||
      !['two pianos no rodeo', 'two pianos no rodeo bob wiseman and mike boguski'].includes(name) ||
      !venueMatches) return false;
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) &&
      ['sourisshowhall.com', 'www.sourisshowhall.com'].includes(url.hostname) &&
      decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase() === '/shows/two-pianos,-no-rodeo';
  } catch { return false; }
}

/** Drop only rejected URL fields, preserving media, clocks and valid enrichment.
 * The optional stored context also protects a repaired keeper during a merge
 * when the incoming representation has a different source or semantic ID. */
export function withoutRejectedReviewedTicketLinks<T extends TicketBindingContext & {ticketLink?: string; ticketsBuyUrl?: string}>(
  event: T, reviewedContext: TicketBindingContext = event
): T {
  const result = {...event};
  for (const field of ['ticketLink', 'ticketsBuyUrl'] as const) {
    if (isRejectedReviewedTicketBinding(event, event[field]) ||
        isRejectedReviewedTicketBinding(reviewedContext, event[field])) delete result[field];
  }
  return result;
}
