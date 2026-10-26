import {
  AudienceIdentity, FamilyAudienceEvidence, FamilyAudienceSignal,
  FAMILY_AUDIENCE_SIGNALS, audienceDigest, audienceIdentity,
  validFamilyAudienceEvidence,
} from '../services/familyAudienceEvidence.js';

export const FAMILY_FRIENDLY_SCORING_VERSION = 'family-friendly-v12';
export const FAMILY_FRIENDLY_LIKELY_THRESHOLD = 60;

export type FamilyFriendlyLevel = 'unlikely' | 'possible' | 'likely' | 'high';

export interface FamilyFriendlyScorableEvent extends AudienceIdentity {
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
  familyFriendlyContentHash: string;
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
  const directText = `${title} ${description}`.trim();
  // Untyped whole-post context is intentionally ignored. Only bound, scoped
  // evidence from the trusted item adapter/reviewer can augment item content.
  const text = directText;
  const scoped = validFamilyAudienceEvidence(event)?.signals || [];
  const hasScoped = (signal: FamilyAudienceSignal): boolean => scoped.includes(signal);
  const adultEvidenceText = `${text} ${ageRestriction}`
    // Guardian requirements and adult ticket-price bands are not admission ages.
    .replace(/\b(?:accompanying (?:adults?|parents?|guardians?)|(?:parents?|guardians?|caregivers?) accompanying children)[^.!?;]*(?:[.!?;]|$)/g, '')
    .replace(/\b(?:parents? or )?(?:parents?|guardians?|caregivers?)\s*\(?\s*(?:(?:aged|age|must be)\s*)?(?:18|19|21)\s*(?:\+|(?:years?(?: of age)?\s*)?(?:and|or)\s*(?:older|over))\s*\)?(?=[^.!?;]*\b(?:accompany|supervise)\b)/g, 'guardian')
    .replace(/\baccompanied by (?:an? |their )?(?:parents? or )?(?:parents?|guardians?|caregivers?)\s*(?:(?:aged|age|must be)\s*)?(?:18|19|21)\s*(?:\+|(?:years?(?: of age)?\s*)?(?:and|or)\s*(?:older|over))/g, 'accompanied by guardian')
    .replace(/\b(?:adult tickets?|adult admission|adult price)\b[^.!?;]*(?:[.!?;]|$)/g, '').trim();
  const reasons: string[] = [];
  const familyFriendlyContentHash = audienceDigest({
    identity: audienceIdentity(event), title, description, ageRestriction, category,
    startTime: String(event.startTime || ''), evidence: validFamilyAudienceEvidence(event) || null,
  });

  const hasAdultAgeRestriction =
    /^(?:18|19|21)(?:\s*(?:years?|ans)(?:\s*(?:and|or) older)?)?$/.test(ageRestriction) ||
    /\b(?:18|19|21)\s*\+(?!\w)/.test(adultEvidenceText) ||
    /\b(?:must be|ages?|aged)\s*(?:18|19|21)\s*(?:(?:years?(?: of age)?\s*)?(?:and|or)\s*(?:older|over)|\+)/.test(adultEvidenceText) ||
    /\b(?:18|19|21)\s*(?:years?(?: of age)?\s*)(?:and|or)\s*(?:older|over)\b/.test(adultEvidenceText) ||
    /\b(?:adults? only|no minors?|mature audiences?|age of majority)\b/.test(adultEvidenceText) ||
    /\b(?:reserve aux adultes|adultes seulement|interdit aux mineurs|children (?:are )?not (?:permitted|allowed)|no children)\b/.test(adultEvidenceText) || hasScoped('adult_age_restriction');
  const hasAdultEntertainment =
    /\b(?:burlesque|stripper|striptease|male revue|adult entertainment|nsfw)\b/.test(text) || hasScoped('adult_entertainment');
  const hasAdultProgramme = /\b(?:drawing|painting|classes?|courses?|workshops?|programmes?) for adults\b|\badult (?:learners?|classes?|courses?|workshops?|peer support)\b/.test(text) || hasScoped('adult_targeted_program');
  const hasNegativeFamily = /\b(?:not family[- ]friendly|not (?:suitable|recommended) for (?:children|families)|unsuitable for children)\b/.test(text) || hasScoped('negative_family_audience');

  if (hasAdultAgeRestriction || hasAdultEntertainment || hasAdultProgramme || hasNegativeFamily) {
    if (hasAdultAgeRestriction) addReason(reasons, 'adult_age_restriction');
    if (hasAdultEntertainment) addReason(reasons, 'adult_entertainment');
    if (hasAdultProgramme) addReason(reasons, 'adult_targeted_program');
    if (hasNegativeFamily) addReason(reasons, 'negative_family_audience');
    return {
      familyFriendlyScore: 0,
      familyFriendlyLevel: 'unlikely',
      familyFriendlyReasons: reasons,
      familyFriendlyScoringVersion: FAMILY_FRIENDLY_SCORING_VERSION,
      familyFriendlyContentHash,
    };
  }

  let score = 15;

  const hasExplicitFamilyAudience =
    /(?:^|[.!?]\s*)for families(?:[.!?:]|$)/.test(description) ||
    /\b(?:family[- ]friendly|family day|family fun|families welcome|for (?:the )?(?:whole )?family|fun for (?:the )?(?:whole )?family|family event|family activity|family activities)\b/.test(text) ||
    /\b(?:familial|familiale|familiaux|familiales|pour les familles|activites familiales|journee familiale|en famille)\b/.test(text) ||
    /\b(?:family (?:movie|swim|skate)|bring (?:the|your|all the) (?:friends (?:and|&) )?family|(?:designed|intended|suitable) for families)\b/.test(text) ||
    /\b(?:family\s*\/\s*public|public\s*\/\s*family)\s+(?:skate|swim)\b/.test(text) || hasScoped('explicit_family_audience');
  const hasExplicitAllAges =
    /\b(?:all[- ]ages|all ages welcome|suitable for all ages|open to all ages)\b/.test(text) ||
    /\b(?:tous les ages|tout age|pour tous les ages)\b/.test(text) || hasScoped('explicit_all_ages');
  const hasChildAgeRange =
    /\bages?\s*:?\s*(?:[0-9]|1[0-7])\s*(?:-|to|through|thru|–|—)\s*(?:[0-9]|1[0-7])(?:\s*(?:yrs?|years?(?: old)?|yo))?\b/.test(text) ||
    /\b(?:children|kids?|youths?|teens?|toddlers?|babies)\s+(?:ages?|aged)\s+(?:\d{1,2})\b/.test(text) ||
    /\b(?:ages?|age)\s+(?:0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)\s*(?:and under|or younger)\b/.test(text) ||
    /\b(?:ages?|age)\s+de\s+\d{1,2}\s+a\s+\d{1,2}\b/.test(text) ||
    /\bages?\s*(?:[1-9]|1[0-7])\s*[-–—]\s*(?:[1-9]|1[0-8])(?:\s*(?:yo|years? old))?\b/.test(text) ||
    (/\b(?:skating|powerskating|curling|hockey|soccer|sports?)\b/.test(text) && /\bu(?:[5-9]|1[0-7])\b/.test(text)) || hasScoped('child_age_range');
  const isBeneficiary = /\bcoats? for kids\b/.test(text) || hasScoped('beneficiary_not_audience') ||
    (/\b(?:donat(?:e|ion|ions|ing)|collect(?:ed|ion)?|distribut(?:e|ion)|fundrais(?:er|ing)|charity)\b/.test(text) &&
      /\b(?:children's coats?|beneficiar|proceeds (?:for|to)|funds for)\b/.test(text));
  // Campaign names identify recipients, not a children's activity. Retain
  // independently stated participation (e.g. a class for kids) at a fundraiser.
  const participationText = directText.replace(/\bcoats? for kids\b/g, 'clothing campaign')
    .replace(/\b(?:proceeds|funds|donations?|money)\s+(?:will|go|are|raised|support|benefit|fund|for|to|towards?)\b[^.!?;]*/g, '')
    .replace(/\bfundrais(?:er|ing) for\b[^.!?;]*/g, '');
  const hasIndependentChildParticipation =
    /\b(?:class(?:es)?|workshops?|camps?|programmes?|programs?|activities|lessons?) for (?:kids|children)\b/.test(participationText) ||
    /\b(?:kids'?|children's) (?:class(?:es)?|workshops?|camps?|programmes?|programs?|activities|lessons?)\b/.test(participationText) ||
    (hasScoped('beneficiary_not_audience') && hasScoped('child_focused_program'));
  const beneficiaryOnly = isBeneficiary && !hasIndependentChildParticipation;
  const hasChildFocusedProgram =
    /\b(?:for kids|for children|kids?'?(?:\s+\w+){0,2}\s+(?:club|camp|camps|program|programme|activity|activities|workshop|class)|children'?s (?:club|camp|program|programme|activity|activities|workshop|class|storytime)|toddler (?:time|group|program|programme|activity|class|music)|baby (?:time|group|program|programme|activity)|junior (?:club|camp|program|activity))\b/.test(directText) ||
    /\b(?:club de lecture d'ete|pour les enfants|activites? pour enfants|camp pour enfants|heure du conte)\b/.test(directText) ||
    /\b(?:toddler (?:pool|play)|junior curling|preschool (?:program|programme|class))\b/.test(directText) || hasScoped('child_focused_program');
  const hasChildFocusedTitle =
    /\b(?:kids?|children'?s|youth|teen|toddler|baby)\s+(?:trivia|quiz|movie|film|cinema|screening|concert|show|dance|disco|party|festival|day|night|sports?|hockey|soccer|basketball|baseball|football|golf|skating|swim|crafts?|art|music|theatre|theater|performance|series)\b/.test(title) ||
    /\b(?:trivia|quiz|movie|film|cinema|screening|concert|show|dance|disco|party|festival|day|night|sports?|hockey|soccer|basketball|baseball|football|golf|skating|swim|crafts?|art|music|theatre|theater|performance|series)\s+(?:for|pour)\s+(?:kids?|children|youths?|teens?|toddlers?|babies|enfants|jeunes)\b/.test(title) || hasScoped('child_focused_title');
  const hasFamilyAttendanceContext =
    /\b(?:parents? (?:and|with) (?:kids?|children)|kids? and (?:their )?(?:parents?|grown-ups?|caregivers?)|children and (?:their )?(?:parents?|grown-ups?|caregivers?)|parent[- ]and[- ]child|caregivers? (?:and|with) (?:kids?|children)|grown-ups? (?:and|with) (?:kids?|children))\b/.test(text) ||
    /\b(?:parents? et enfants|enfants et parents|avec leurs parents|kids and adults|children and adults|children are free with a participating adult)\b/.test(text) ||
    (/\ball are welcome\b/.test(text) && /\bif you have (?:kids|children)\b/.test(text)) || hasScoped('family_attendance_context');
  // Public recreational aquatics is a family-suitable activity even when a
  // timetable does not repeat "family friendly". Use the item's own title;
  // unrelated gallery text, lane fitness, private access and closures do not
  // establish participation. Existing explicit adult/negative guards run first.
  const hasRecreationalAquaticActivity =
    /\b(?:all pools? (?:are )?open|leisure(?: (?:and|&) toddler)? pools? (?:are )?open|(?:public|open|recreational|free|fun) swims?|water\s?slides? open|splash[- ]?pads? open)\b/.test(title) &&
    !/\b(?:films?|movies?|concerts?|parties|party|lessons?|classes?|training|competitions?|championships?)\b/.test(title) &&
    !/\b(?:(?:all )?pools? (?:are )?closed|private (?:booking|event|swim)|(?:lap|lane) swim|(?:adult|senior) (?:swim|swimming|fitness)|(?:adults?|seniors?)[- ]only|(?:for|restricted to) (?:adults?|seniors?)|swim(?:ming)? lessons?)\b/.test(directText) &&
    !['cinema', 'live music', 'comedy', 'food special', 'drink special'].includes(category);
  const hasRecreationalSkateActivity =
    /\b(?:public|free|community|recreational|open)\s+(?:ice[- ]?)?skates?\b|\bcommunity freeskate\b/i.test(title) &&
    !/\b(?:adult|senior|private|closed|cancelled|canceled|fitness|training|lessons?|classes?|hockey|competition|championship|film|movie|concert|party)\b/i.test(directText) &&
    !['cinema','live music','comedy','food special','drink special'].includes(category);
  const hasFamilyActivity =
    /\b(?:story ?time|petting zoo|face paint(?:ing)?|bouncy (?:house|castle)|inflatable(?:s)?|kids'? crafts?|children'?s crafts?|craft table|discovery tent|juggler|juggling|stilt walkers?|touch[- ]a[- ]truck|trucks? for kids|play day|play days|farm day|meet the animals|christmas festival|holiday festival|scarecrow festival|parade)\b/.test(directText) ||
    /\b(?:maquillage|table de bricolage|tente decouverte|jongleur|jonglerie|echassiers?|chateau gonflable|chateaux gonflables|zoo pour enfants)\b/.test(directText) ||
    (/\b(?:farm animals?|animal visits?)\b/.test(directText) && /\bfamily rates?\b/.test(directText)) ||
    /\btrick[- ]or[- ]treat(?:ing)?\b/.test(directText) || hasScoped('family_activity') ||
    ((hasRecreationalAquaticActivity || hasRecreationalSkateActivity) && !hasExplicitFamilyAudience && !hasExplicitAllAges);
  const hasYouthFocus =
    /\b(?:youth (?:day|night|program|programme|event|activity|activities|workshop|camp|club)|teen (?:night|program|programme|event|activity|activities|workshop|camp|club))\b/.test(directText) ||
    /\b(?:journee jeunesse|activites? jeunesse|pour les jeunes)\b/.test(directText) || hasScoped('youth_focused_program');

  if (hasExplicitFamilyAudience) {
    score += 70;
    addReason(reasons, 'explicit_family_audience');
  }
  if (hasExplicitAllAges) {
    score += 70;
    addReason(reasons, 'explicit_all_ages');
  }
  if (hasChildAgeRange && !beneficiaryOnly) {
    score += 65;
    addReason(reasons, 'child_age_range');
  }
  if (hasChildFocusedProgram && !beneficiaryOnly) {
    score += 55;
    addReason(reasons, 'child_focused_program');
  }
  if (hasChildFocusedTitle && !beneficiaryOnly) {
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
    /\b(?:beer|wine|cocktail|spirits?|brewery|brewing company|taproom|pub crawl|wine tasting|beer festival)\b/.test(text) || hasScoped('alcohol_focused');
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
  if (isBeneficiary) addReason(reasons, 'beneficiary_not_audience');
  const hasMatureContent = /\b(?:graphic (?:accounts?|violence|content)|violent crime|true[- ]crime|strong[- ]smelling chemicals)\b/.test(text) || hasScoped('mature_content');
  if (hasMatureContent) {
    addReason(reasons, 'mature_content');
    if (!hasExplicitFamilyAudience && !hasChildAgeRange && !hasFamilyAttendanceContext) score = Math.min(score, 39);
  }

  const familyFriendlyScore = clampScore(score);
  return {
    familyFriendlyScore,
    familyFriendlyLevel: levelForScore(familyFriendlyScore),
    familyFriendlyReasons: reasons,
    familyFriendlyScoringVersion: FAMILY_FRIENDLY_SCORING_VERSION,
    familyFriendlyContentHash,
  };
}

export function withFamilyFriendlyScore<T extends FamilyFriendlyScorableEvent>(
  event: T
): T & FamilyFriendlyScoreResult {
  // Cheap deterministic recomputation prevents stale scores after any content or
  // rule change. Valid scoped evidence survives; an old number alone does not.
  return {
    ...event,
    ...scoreFamilyFriendly(event),
  };
}

/** Caller must establish scope first; never pass the entire source by default. */
export function bindFamilyAudienceEvidence(
  event: FamilyFriendlyScorableEvent, text: string,
  scope: FamilyAudienceEvidence['scope'], sourceReference: string
): FamilyAudienceEvidence {
  const signals = scoreFamilyFriendly({name:text, description:text}).familyFriendlyReasons
    .filter((reason): reason is FamilyAudienceSignal => FAMILY_AUDIENCE_SIGNALS.includes(reason as FamilyAudienceSignal));
  return {version:'family-audience-v1',scope,identity:audienceIdentity(event),
    sourceDigest:audienceDigest(sourceReference),signals};
}

export function mergeFamilyAudienceEvidence(
  existing: FamilyFriendlyScorableEvent, incoming: FamilyFriendlyScorableEvent,
  merged: FamilyFriendlyScorableEvent
): FamilyAudienceEvidence | undefined {
  const identity = audienceIdentity(merged);
  const proofs = [existing, incoming].filter(event => audienceIdentity(event) === identity)
    .map(validFamilyAudienceEvidence).filter((proof): proof is FamilyAudienceEvidence => Boolean(proof));
  // A restrictive fresh item must not be hidden by retaining an older, longer description.
  const incomingRestrictions = audienceIdentity(incoming) === identity
    ? scoreFamilyFriendly({...incoming, familyAudienceEvidence:undefined}).familyFriendlyReasons
      .filter(reason => ['adult_age_restriction','adult_entertainment','adult_targeted_program','negative_family_audience','mature_content'].includes(reason)) : [];
  if (!proofs.length && !incomingRestrictions.length) return undefined;
  const signals = [...new Set([...proofs.flatMap(proof => proof.signals), ...incomingRestrictions])] as FamilyAudienceSignal[];
  if (proofs[0] && signals.length === proofs[0].signals.length && signals.every(signal => proofs[0].signals.includes(signal)))
    return {...proofs[0],signals:[...proofs[0].signals]};
  return {version:'family-audience-v1',scope:proofs[0]?.scope || 'validated_item',identity,
    sourceDigest:audienceDigest([proofs.map(proof => proof.sourceDigest).sort(), incomingRestrictions]),
    signals};
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
