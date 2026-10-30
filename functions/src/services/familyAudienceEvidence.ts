import { createHash } from 'node:crypto';

export const FAMILY_AUDIENCE_SIGNALS = [
  'explicit_family_audience', 'explicit_all_ages', 'child_age_range',
  'child_focused_program', 'child_focused_title', 'family_attendance_context',
  'family_activity', 'youth_focused_program', 'adult_age_restriction',
  'adult_entertainment', 'adult_targeted_program', 'mature_content',
  'negative_family_audience', 'alcohol_focused', 'beneficiary_not_audience',
] as const;
export type FamilyAudienceSignal = typeof FAMILY_AUDIENCE_SIGNALS[number];
export interface FamilyAudienceEvidence {
  version: 'family-audience-v1';
  scope: 'validated_item' | 'exact_source_block' | 'whole_programme' | 'reviewed_activity';
  identity: string;
  sourceDigest: string;
  signals: FamilyAudienceSignal[];
}
export interface AudienceIdentity {
  eventName?: unknown; name?: unknown; title?: unknown;
  startDate?: unknown; date?: unknown; venueId?: unknown;
  startTime?: unknown; additionalLocation?: unknown; subVenue?: unknown;
  establishment?: unknown; venue?: unknown; familyAudienceEvidence?: unknown;
}
export const normalizeAudienceText = (value: unknown): string => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2019\u2018\u02bc]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
export const audienceDigest = (value: unknown): string => createHash('sha256')
  .update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function audienceIdentity(event: AudienceIdentity): string {
  return audienceDigest([
    normalizeAudienceText(event.eventName || event.name || event.title),
    String(event.startDate || event.date || ''),
    normalizeAudienceText(event.venueId || event.establishment || event.venue),
    normalizeAudienceText(event.startTime),
    normalizeAudienceText(event.additionalLocation || event.subVenue),
  ]);
}
export function validFamilyAudienceEvidence(event: AudienceIdentity): FamilyAudienceEvidence | undefined {
  const value = event.familyAudienceEvidence as Partial<FamilyAudienceEvidence> | undefined;
  if (!value || value.version !== 'family-audience-v1' || value.identity !== audienceIdentity(event) ||
      !['validated_item','exact_source_block','whole_programme','reviewed_activity'].includes(String(value.scope)) ||
      !/^[a-f0-9]{64}$/.test(String(value.sourceDigest)) || !Array.isArray(value.signals) ||
      !value.signals.every(signal => FAMILY_AUDIENCE_SIGNALS.includes(signal)) ||
      new Set(value.signals).size !== value.signals.length) return undefined;
  return value as FamilyAudienceEvidence;
}
/** Only the trusted formatter/writer may transfer proof after exact item alignment. */
export function transferFamilyAudienceEvidence(from: AudienceIdentity, to: AudienceIdentity): FamilyAudienceEvidence | undefined {
  const evidence = validFamilyAudienceEvidence(from);
  return evidence ? { ...evidence, identity: audienceIdentity(to), signals: [...evidence.signals] } : undefined;
}

/** No fuzzy match, gallery-wide OCR or assumption that a post contains just one activity. */
export function selectActivityAudienceBlocks(
  item: AudienceIdentity, items: AudienceIdentity[], sourceText: string
): Array<{ text: string; scope: 'exact_source_block' | 'whole_programme' }> {
  const title = normalizeAudienceText(item.eventName || item.name || item.title);
  if (title.length < 8) return [];
  const sameTitleCount = items.filter(other => normalizeAudienceText(other.eventName || other.name || other.title) === title).length;
  const otherTitles = items.filter(other => other !== item)
    .map(other => normalizeAudienceText(other.eventName || other.name || other.title))
    .filter(other => other && other !== title);
  // Legacy ingestion sometimes appends gallery-wide OCR after this marker.
  // It has no item-level ownership and cannot be used as a caption block.
  const caption = sourceText.split(/\n\s*OCR TEXT\s*:/i)[0];
  const blocks = caption.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean);
  const result: Array<{text: string; scope: 'exact_source_block' | 'whole_programme'}> = [];
  // A single takeout meal may be named differently on its poster. Require the
  // meal's literal food nouns in the caption plus an explicit family invitation;
  // neither a one-item extraction nor generic restaurant branding is proof.
  if (items.length===1 && /\b(?:takeout|take out|pick up|pickup)\b/i.test(caption) &&
      /\bfeed (?:the|your|whole) family\b/i.test(caption) &&
      /\b(?:parents?|children|kids)\b/i.test(caption)) {
    const foods=title.split(/[^a-z]+/).filter(word=>/^(?:cheeseburgers?|burgers?|fries|sandwiches|pizzas?|handpies?)$/.test(word));
    const mealBlocks=blocks.map((text,index)=>({text,index,normalized:normalizeAudienceText(text)}))
      .filter(block=>new Set(foods).size>=2&&foods.every(word=>new RegExp(`\\b${word}\\b`).test(block.normalized)));
    if(mealBlocks.length===1){
      const index=mealBlocks[0].index;
      if(index>=2 && /\bfeed (?:the|your|whole) family\b/i.test(blocks[index-2]) &&
          /\bfor (?:the little[^.!?]*|children|kids)[^.!?]*\band (?:their )?parents\b/i.test(blocks[index-1]))
        result.push({text:blocks.slice(index-2,index+1).join('\n'),scope:'exact_source_block'});
    }
  }
  for (const text of blocks) {
    const normalized = normalizeAudienceText(text);
    // Mixed lists remain unscored even when one title is a substring of another.
    if (sameTitleCount <= 1 && normalized.includes(title) && !otherTitles.some(other => normalized.includes(other))) {
      // A multiline block can still be a roundup. Require the exact title at its start.
      if (normalizeAudienceText(text.split('\n')[0]).startsWith(title))
        result.push({text, scope:'exact_source_block'});
    }
  }
  const venues = new Set(items.map(other => normalizeAudienceText(other.venueId || other.establishment || other.venue)).filter(Boolean));
  const programme = blocks.filter(text => /\b(?:entire|every activity in (?:this|the)|all activities in (?:this|the)) (?:afternoon )?(?:programme|program)\b/i.test(text));
  // An exception anywhere in the source prevents programme-wide inheritance.
  if (venues.size <= 1 && !/\b(?:except|excluding|adults? only|no minors?|mature|not suitable)\b|\b(?:18|19|21)\s*\+(?!\w)/i.test(sourceText)) {
    for (const text of programme) result.push({text, scope:'whole_programme'});
    // A multi-date project can repeat one validated identity. Accept only an
    // explicit invitation to THIS project, in the paragraph naming its literal
    // three-word title anchor. This cannot inherit from another activity/site.
    if (sameTitleCount === items.length && /\bproject$/.test(title)) {
      const anchor = title.split(' ').slice(0,3).join(' ');
      for (const text of blocks) {
        const normalized=normalizeAudienceText(text);
        if (anchor.length>=12 && normalized.includes(anchor) &&
            /\bwelcomes?\b[^.!?]*\ball ages\b[^.!?]*(?:part of|participate in)\s+(?:this|our)\s+(?:special\s+)?project\b/.test(normalized) &&
            !/\b(?:another|other|separate)\b/.test(normalized)) result.push({text,scope:'whole_programme'});
      }
    }
  }
  return result;
}
