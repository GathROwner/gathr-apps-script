function normalizePolicyText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9$%:' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FACILITY_ACTIVITY_CUE =
  /\b(pools?|aquatic|lane swim|public swim|family swim|swimming|splash pads?|rinks?|arenas?|ice time|public skate|skating)\b/;
const CLOSURE_CUE =
  /\b(closed|closure|unavailable|cancelled|canceled|not available|no (?:public )?(?:swim|skating|skate|ice time))\b/;
const REOPENING_CUE = /\b(reopens?|reopening|resumes?|returning|back open)\b/;

/**
 * Facility availability is a valid thing to do. A notice that the activity is
 * unavailable is not. Keep this distinction deterministic so the model cannot
 * turn pool/rink logistics into app events merely because a date is present.
 */
export function isFacilityClosureOnlyListing(input: {
  name?: unknown;
  description?: unknown;
  category?: unknown;
}): boolean {
  const name = normalizePolicyText(input.name);
  const text = normalizePolicyText([input.name, input.description, input.category].join(' '));
  if (!text || !FACILITY_ACTIVITY_CUE.test(text) || !CLOSURE_CUE.test(text)) {
    return false;
  }

  // Reopening announcements describe newly available activities, not closures.
  if (REOPENING_CUE.test(text)) return false;

  const closureInTitle = FACILITY_ACTIVITY_CUE.test(name) && CLOSURE_CUE.test(name);
  const closureSentence =
    /\b(pools?|aquatic|lane swim|public swim|family swim|swimming|splash pads?|rinks?|arenas?|ice time|public skate|skating)\b.{0,45}\b(closed|closure|unavailable|cancelled|canceled|not available)\b/.test(text) ||
    /\b(closed|closure|unavailable|cancelled|canceled|not available)\b.{0,45}\b(pools?|aquatic|lane swim|public swim|family swim|swimming|splash pads?|rinks?|arenas?|ice time|public skate|skating)\b/.test(text);

  return closureInTitle || closureSentence;
}
