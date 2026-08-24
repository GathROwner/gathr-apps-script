export const FAMILY_FRIENDLY_SCORING_VERSION = 'family-friendly-v4';
export const FAMILY_FRIENDLY_LIKELY_THRESHOLD = 60;

export type FamilyFriendlyLevel = 'unlikely' | 'possible' | 'likely' | 'high';

export interface FamilyFriendlyScorableEvent {
  eventName?: unknown;
  name?: unknown;
  title?: unknown;
  description?: unknown;
  ageRestriction?: unknown;
  category?: unknown;
  startTime?: unknown;
  contextText?: unknown;
}

export interface FamilyFriendlyScoreResult {
  familyFriendlyScore: number;
  familyFriendlyLevel: FamilyFriendlyLevel;
  familyFriendlyReasons: string[];
  familyFriendlyScoringVersion: typeof FAMILY_FRIENDLY_SCORING_VERSION;
}

export type FamilyFriendlyReplacementCategory =
  | 'Live Music'
  | 'Trivia Night'
  | 'Comedy'
  | 'Cinema'
  | 'Workshops & Classes'
  | 'Religious'
  | 'Sports'
  | 'Gatherings & Parties';

function normalizeText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u2018\u02bc\u2032\uff07]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function levelForScore(score: number): FamilyFriendlyLevel {
  if (score >= 80) return 'high';
  if (score >= FAMILY_FRIENDLY_LIKELY_THRESHOLD) return 'likely';
  if (score >= 40) return 'possible';
  return 'unlikely';
}

function parseStartHour(value: unknown): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const meridiem = String(match[2] || '').toLowerCase();
  if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
  if (meridiem === 'pm') hour = hour === 12 ? 12 : hour + 12;
  return hour <= 23 ? hour : null;
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/**
 * Deterministic, explainable family-suitability score.
 *
 * The scorer intentionally uses audience phrases rather than isolated words.
 * This avoids treating titles such as "Guardians of the Children", "Teen
 * Burger", or a performer whose name includes "Family" as family evidence.
 */
export function scoreFamilyFriendly(
  event: FamilyFriendlyScorableEvent
): FamilyFriendlyScoreResult {
  const title = normalizeText(event.eventName || event.name || event.title);
  const description = normalizeText(event.description);
  const ageRestriction = normalizeText(event.ageRestriction);
  const category = normalizeText(event.category);
  const contextText = normalizeText(event.contextText);
  const directText = `${title} ${description}`.trim();
  const text = `${directText} ${contextText}`.trim();
  const adultEvidenceText = `${text} ${ageRestriction}`.trim();
  const reasons: string[] = [];

  const hasAdultAgeRestriction =
    /\b(?:18|19|21)\s*\+\b/.test(adultEvidenceText) ||
    /\b(?:must be|ages?)\s*(?:18|19|21)(?:\s*(?:and|or)\s*(?:older|over)|\s*\+)?\b/.test(adultEvidenceText) ||
    /\b(?:adults? only|no minors?|mature audiences?|age of majority)\b/.test(adultEvidenceText) ||
    /\b(?:reserve aux adultes|adultes seulement|interdit aux mineurs)\b/.test(adultEvidenceText);
  const hasAdultEntertainment =
    /\b(?:burlesque|strip(?:per|tease)?|male revue|adult entertainment|nsfw)\b/.test(text);

  if (hasAdultAgeRestriction || hasAdultEntertainment) {
    if (hasAdultAgeRestriction) addReason(reasons, 'adult_age_restriction');
    if (hasAdultEntertainment) addReason(reasons, 'adult_entertainment');
    return {
      familyFriendlyScore: 0,
      familyFriendlyLevel: 'unlikely',
      familyFriendlyReasons: reasons,
      familyFriendlyScoringVersion: FAMILY_FRIENDLY_SCORING_VERSION,
    };
  }

  let score = 15;

  const hasExplicitFamilyAudience =
    /\b(?:family[- ]friendly|family day|family fun|families welcome|for (?:the )?(?:whole )?family|fun for (?:the )?(?:whole )?family|family event|family activity|family activities)\b/.test(text) ||
    /\b(?:familial|familiale|familiaux|familiales|pour les familles|activites familiales|journee familiale)\b/.test(text);
  const hasExplicitAllAges =
    /\b(?:all[- ]ages|all ages welcome|suitable for all ages|open to all ages)\b/.test(text) ||
    /\b(?:tous les ages|tout age|pour tous les ages)\b/.test(text);
  const hasChildAgeRange =
    /\bages?\s*(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)\s*(?:-|to|through|thru|–|—)\s*(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)\b/.test(text) ||
    /\b(?:children|kids?|youths?|teens?|toddlers?|babies)\s+(?:ages?|aged)\s+(?:\d{1,2})\b/.test(text) ||
    /\b(?:ages?|age)\s+(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)\s*(?:and under|or younger)\b/.test(text) ||
    /\b(?:ages?|age)\s+de\s+\d{1,2}\s+a\s+\d{1,2}\b/.test(text);
  const hasChildFocusedProgram =
    /\b(?:for kids|for children|kids?'?(?:\s+\w+){0,2}\s+(?:club|camp|camps|program|programme|activity|activities|workshop|class)|children'?s (?:club|camp|program|programme|activity|activities|workshop|class|storytime)|toddler (?:time|group|program|programme|activity|class|music)|baby (?:time|group|program|programme|activity)|junior (?:club|camp|program|activity))\b/.test(directText) ||
    /\b(?:club de lecture d'ete|pour les enfants|activites? pour enfants|camp pour enfants|heure du conte)\b/.test(directText);
  const hasChildFocusedTitle =
    /\b(?:kids?|children'?s|youth|teen|toddler|baby)\s+(?:trivia|quiz|movie|film|cinema|screening|concert|show|dance|disco|party|festival|day|night|sports?|hockey|soccer|basketball|baseball|football|golf|skating|swim|crafts?|art|music|theatre|theater|performance|series)\b/.test(title) ||
    /\b(?:trivia|quiz|movie|film|cinema|screening|concert|show|dance|disco|party|festival|day|night|sports?|hockey|soccer|basketball|baseball|football|golf|skating|swim|crafts?|art|music|theatre|theater|performance|series)\s+(?:for|pour)\s+(?:kids?|children|youths?|teens?|toddlers?|babies|enfants|jeunes)\b/.test(title);
  const hasFamilyAttendanceContext =
    /\b(?:parents? (?:and|with) (?:kids?|children)|kids? and (?:their )?(?:parents?|grown-ups?|caregivers?)|children and (?:their )?(?:parents?|grown-ups?|caregivers?)|parent[- ]and[- ]child|caregivers? (?:and|with) (?:kids?|children)|grown-ups? (?:and|with) (?:kids?|children))\b/.test(text) ||
    /\b(?:parents? et enfants|enfants et parents|avec leurs parents)\b/.test(text);
  const hasFamilyActivity =
    /\b(?:story ?time|petting zoo|face paint(?:ing)?|bouncy (?:house|castle)|inflatable(?:s)?|kids'? crafts?|children'?s crafts?|craft table|discovery tent|juggler|juggling|stilt walkers?|touch[- ]a[- ]truck|trucks? for kids|play day|play days|farm day|meet the animals|christmas festival|holiday festival|scarecrow festival|parade)\b/.test(directText) ||
    /\b(?:maquillage|table de bricolage|tente decouverte|jongleur|jonglerie|echassiers?|chateau gonflable|chateaux gonflables|zoo pour enfants)\b/.test(directText);
  const hasYouthFocus =
    /\b(?:youth (?:day|night|program|programme|event|activity|activities|workshop|camp|club)|teen (?:night|program|programme|event|activity|activities|workshop|camp|club))\b/.test(directText) ||
    /\b(?:journee jeunesse|activites? jeunesse|pour les jeunes)\b/.test(directText);

  if (hasExplicitFamilyAudience) {
    score += 70;
    addReason(reasons, 'explicit_family_audience');
  }
  if (hasExplicitAllAges) {
    score += 70;
    addReason(reasons, 'explicit_all_ages');
  }
  if (hasChildAgeRange) {
    score += 65;
    addReason(reasons, 'child_age_range');
  }
  if (hasChildFocusedProgram) {
    score += 55;
    addReason(reasons, 'child_focused_program');
  }
  if (hasChildFocusedTitle) {
    score += 55;
    addReason(reasons, 'child_focused_title');
  }
  if (hasFamilyAttendanceContext) {
    score += 55;
    addReason(reasons, 'family_attendance_context');
  }
  if (hasFamilyActivity) {
    score += 45;
    addReason(reasons, 'family_activity');
  }
  if (hasYouthFocus) {
    score += 35;
    addReason(reasons, 'youth_focused_program');
  }

  if (category === 'family friendly') {
    score += 15;
    addReason(reasons, 'legacy_family_category');
  }

  const hasPositiveAudienceEvidence = reasons.some((reason) =>
    reason !== 'legacy_family_category'
  );
  const hasAlcoholFocus =
    /\b(?:beer|wine|cocktail|spirits?|brewery|brewing company|taproom|pub crawl|wine tasting|beer festival)\b/.test(text);
  if (hasAlcoholFocus) {
    score -= hasPositiveAudienceEvidence ? 15 : 30;
    addReason(reasons, 'alcohol_focused');
  }

  const startHour = parseStartHour(event.startTime);
  if (startHour !== null && startHour >= 22) {
    score -= 30;
    addReason(reasons, 'very_late_start');
  } else if (startHour !== null && startHour >= 21) {
    score -= 20;
    addReason(reasons, 'late_start');
  }

  if (!hasPositiveAudienceEvidence && category !== 'family friendly') {
    addReason(reasons, 'insufficient_family_evidence');
  }

  const familyFriendlyScore = clampScore(score);
  return {
    familyFriendlyScore,
    familyFriendlyLevel: levelForScore(familyFriendlyScore),
    familyFriendlyReasons: reasons,
    familyFriendlyScoringVersion: FAMILY_FRIENDLY_SCORING_VERSION,
  };
}

export function withFamilyFriendlyScore<T extends FamilyFriendlyScorableEvent>(
  event: T
): T & FamilyFriendlyScoreResult {
  const existing = event as T & Partial<FamilyFriendlyScoreResult>;
  if (
    existing.familyFriendlyScoringVersion === FAMILY_FRIENDLY_SCORING_VERSION &&
    typeof existing.familyFriendlyScore === 'number' &&
    Number.isFinite(existing.familyFriendlyScore) &&
    typeof existing.familyFriendlyLevel === 'string' &&
    Array.isArray(existing.familyFriendlyReasons)
  ) {
    return existing as T & FamilyFriendlyScoreResult;
  }
  return {
    ...event,
    ...scoreFamilyFriendly(event),
  };
}

/** Assigns a real primary category when migrating the legacy family category. */
export function inferLegacyFamilyFriendlyPrimaryCategory(
  event: FamilyFriendlyScorableEvent
): FamilyFriendlyReplacementCategory {
  const title = normalizeText(event.eventName || event.name || event.title);
  const text = normalizeText(
    `${String(event.eventName || event.name || event.title || '')} ${String(event.description || '')}`
  );

  if (/\b(?:trivia|quiz|name that tune|pub quiz)\b/.test(title)) return 'Trivia Night';
  if (/\b(?:movie|film|cinema|screening|documentary)\b/.test(title)) return 'Cinema';
  if (/\b(?:comedy|comedian|stand-?up|improv)\b/.test(title)) return 'Comedy';
  if (/\b(?:festival|family day|family fun|farm day|anime-?fest)\b/.test(title)) {
    return 'Gatherings & Parties';
  }
  if (/\b(?:trivia|quiz|name that tune|pub quiz)\b/.test(text)) return 'Trivia Night';
  if (/\b(?:movie|film|cinema|screening|documentary)\b/.test(text)) return 'Cinema';
  if (/\b(?:comedy|comedian|stand-?up|improv)\b/.test(text)) return 'Comedy';
  if (
    /\b(?:concert|live music|band|singer|songwriter|choir|acoustic|music and movement|dance performance)\b/.test(text)
  ) {
    return 'Live Music';
  }
  if (
    /\b(?:sport|game|match|tournament|league|golf|hockey|soccer|basketball|baseball|football|volleyball|pickleball|skating|fitness|bootcamp|dancefit)\b/.test(text)
  ) {
    return 'Sports';
  }
  if (/\b(?:church|service|mass|prayer|faith|bible|worship)\b/.test(text)) return 'Religious';
  if (
    /\b(?:workshop|class|lesson|course|training|seminar|camp|kids club|story ?time|reading club|club de lecture|craft|art lab)\b/.test(text)
  ) {
    return 'Workshops & Classes';
  }
  return 'Gatherings & Parties';
}
