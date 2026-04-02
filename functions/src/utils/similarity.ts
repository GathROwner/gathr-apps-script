/**
 * String Similarity Utilities
 * Ported from utilities.js and migration/venue-matcher.js
 */

/**
 * Calculate Levenshtein distance between two strings
 * Uses dynamic programming approach
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  // Create matrix
  const matrix: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-1)
 * Based on Levenshtein distance normalized by max length
 */
export function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);

  return 1 - distance / maxLen;
}

/**
 * Normalize a venue name for comparison
 * Removes punctuation, apostrophes, and normalizes whitespace
 */
export function normalizeVenueName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    // Remove apostrophes (straight + common Unicode variants) without spacing
    .replace(/['\u2019\u2018\u02bc\u2032\uff07]/g, '')
    // Replace punctuation with spaces
    .replace(/[^\w\s]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a URL for comparison
 * Handles Facebook URLs specially
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';

  let normalized = url.toLowerCase().trim();

  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '');

  // Remove www.
  normalized = normalized.replace(/^www\./, '');

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  // For Facebook, normalize m.facebook.com to facebook.com
  normalized = normalized.replace(/^m\.facebook\.com/, 'facebook.com');

  return normalized;
}

/**
 * Extract Facebook page slug from URL
 */
export function extractFacebookSlug(url: string): string | null {
  if (!url) return null;

  const raw = String(url).trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    if (!host.endsWith('facebook.com')) return null;

    const segments = parsed.pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment));
    if (!segments.length) return null;

    const first = String(segments[0] || '').trim().toLowerCase();
    const reserved = new Set([
      'events',
      'groups',
      'watch',
      'photos',
      'posts',
      'permalink.php',
      'story.php',
      'share',
      'sharer.php',
      'dialog',
      'plugins',
      'reels',
      'reel',
    ]);
    if (reserved.has(first)) return null;

    if (first === 'profile.php') {
      const id = String(parsed.searchParams.get('id') || '').trim();
      return /^\d{8,}$/.test(id) ? id : null;
    }

    if (first === 'people' && segments.length >= 3) {
      const id = String(segments[2] || '').trim();
      if (/^\d{8,}$/.test(id)) return id;
      const slug = String(segments[1] || '').trim().toLowerCase();
      return slug || null;
    }

    if (first === 'pages' && segments.length >= 3) {
      const id = String(segments[2] || '').trim();
      if (/^\d{8,}$/.test(id)) return id;
      const slug = String(segments[1] || '').trim().toLowerCase();
      return slug || null;
    }

    if (first === 'p' && segments.length >= 2) {
      const token = String(segments[1] || '').trim();
      if (!token) return null;
      const idMatch = token.match(/(\d{8,})$/);
      if (idMatch && idMatch[1]) return idMatch[1];
      return token.toLowerCase();
    }

    return first || null;
  } catch {
    const normalized = normalizeUrl(raw);
    const match = normalized.match(/facebook\.com\/(?:pages\/)?([^/?]+)/i);
    if (!match || !match[1]) return null;
    const slug = match[1].toLowerCase();
    if (['events', 'groups', 'profile.php', 'watch', 'photos'].includes(slug)) {
      return null;
    }
    return slug;
  }
}

/**
 * Common words to de-emphasize in similarity calculations
 */
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'bar', 'pub', 'restaurant', 'cafe', 'lounge', 'club', 'grill',
  'kitchen', 'house', 'room', 'place', 'spot', 'charlottetown', 'pei',
  'prince', 'edward', 'island', 'est', 'established'
]);

/**
 * Calculate enhanced similarity with word-level matching and bonuses
 */
export function calculateEnhancedSimilarity(
  str1: string,
  str2: string,
  options?: {
    useWordMatching?: boolean;
    applySubstringBonus?: boolean;
  }
): number {
  const { useWordMatching = true, applySubstringBonus = true } = options || {};

  const normalized1 = normalizeVenueName(str1);
  const normalized2 = normalizeVenueName(str2);

  if (normalized1 === normalized2) return 1;

  // Base Levenshtein similarity
  let baseSimilarity = calculateSimilarity(normalized1, normalized2);

  if (!useWordMatching) {
    return baseSimilarity;
  }

  // Word-level analysis
  const words1 = normalized1.split(' ').filter(w => w.length > 0 && !COMMON_WORDS.has(w));
  const words2 = normalized2.split(' ').filter(w => w.length > 0 && !COMMON_WORDS.has(w));

  if (words1.length === 0 || words2.length === 0) {
    return baseSimilarity;
  }

  // Calculate word match percentage
  let matchedWords = 0;
  const usedIndices = new Set<number>();

  for (const word1 of words1) {
    let bestMatch = 0;
    let bestIndex = -1;

    for (let i = 0; i < words2.length; i++) {
      if (usedIndices.has(i)) continue;

      const wordSim = calculateSimilarity(word1, words2[i]);
      if (wordSim > bestMatch) {
        bestMatch = wordSim;
        bestIndex = i;
      }
    }

    if (bestMatch > 0.8 && bestIndex >= 0) {
      matchedWords++;
      usedIndices.add(bestIndex);
    }
  }

  const wordMatchPercentage = matchedWords / Math.max(words1.length, words2.length);

  // Adjust similarity based on word matching
  let adjustedSimilarity = baseSimilarity * (0.6 + 0.4 * wordMatchPercentage);

  // Substring bonus
  if (applySubstringBonus) {
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      adjustedSimilarity = Math.min(1, adjustedSimilarity + 0.15);
    }
  }

  return Math.min(1, adjustedSimilarity);
}

/**
 * Check if two field values are equal for comparison purposes
 * Uses similarity threshold for text fields
 */
export function areFieldValuesEqual(
  value1: unknown,
  value2: unknown,
  fieldName?: string
): boolean {
  // Handle null/undefined
  if (value1 == null && value2 == null) return true;
  if (value1 == null || value2 == null) return false;

  // String comparison with normalization
  if (typeof value1 === 'string' && typeof value2 === 'string') {
    const v1 = value1.toLowerCase().trim();
    const v2 = value2.toLowerCase().trim();

    if (v1 === v2) return true;

    // For description fields, use similarity threshold
    if (fieldName === 'description' || fieldName === 'eventName') {
      return calculateSimilarity(v1, v2) > 0.9;
    }

    return false;
  }

  // Date comparison
  if (value1 instanceof Date && value2 instanceof Date) {
    return value1.getTime() === value2.getTime();
  }

  // Array comparison
  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) return false;
    return value1.every((v, i) => areFieldValuesEqual(v, value2[i]));
  }

  // Object comparison (shallow)
  if (typeof value1 === 'object' && typeof value2 === 'object') {
    const keys1 = Object.keys(value1);
    const keys2 = Object.keys(value2);
    if (keys1.length !== keys2.length) return false;
    return keys1.every(key =>
      areFieldValuesEqual(
        (value1 as Record<string, unknown>)[key],
        (value2 as Record<string, unknown>)[key]
      )
    );
  }

  // Default strict equality
  return value1 === value2;
}

/**
 * Calculate time difference in hours between two time strings
 */
export function calculateTimeDifferenceHours(time1: string, time2: string): number {
  const parseTime = (timeStr: string): number | null => {
    const trimmed = String(timeStr || '').trim();
    if (!trimmed) return null;
    // Handle HH:MM or HH:MM:SS format
    const parts = trimmed.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours + minutes / 60;
  };

  try {
    const t1 = parseTime(time1);
    const t2 = parseTime(time2);
    if (t1 == null || t2 == null) return Infinity;
    return Math.abs(t1 - t2);
  } catch {
    return Infinity;
  }
}

function isLikelyPlaceholderMidnight(startTime?: string, endTime?: string): boolean {
  const start = calculateTimeDifferenceHours(String(startTime || ''), '00:00');
  if (!Number.isFinite(start) || start > 0.01) return false;
  if (!endTime) return true;
  const endDiff = calculateTimeDifferenceHours(String(endTime), '03:00');
  return Number.isFinite(endDiff) && endDiff <= 3;
}

function normalizeEventText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/['\u2019\u2018\u02bc\u2032\uff07]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateTokenOverlap(left: string, right: string): {
  ratio: number;
  shared: number;
  minSize: number;
  sharedTokens: string[];
} {
  const leftTokens = String(left || '')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMMON_WORDS.has(token));
  const rightTokens = String(right || '')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !COMMON_WORDS.has(token));

  if (!leftTokens.length || !rightTokens.length) {
    return { ratio: 0, shared: 0, minSize: 0, sharedTokens: [] };
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);

  const [smaller, larger] =
    leftSet.size <= rightSet.size ? [leftSet, rightSet] : [rightSet, leftSet];
  let shared = 0;
  const sharedTokens: string[] = [];

  for (const token of smaller) {
    if (larger.has(token)) {
      shared += 1;
      sharedTokens.push(token);
    }
  }

  return {
    ratio: shared / Math.max(1, smaller.size),
    shared,
    minSize: smaller.size,
    sharedTokens,
  };
}

function getComparableEventName(value: { eventName?: string; name?: string }): string {
  const eventName = String(value.eventName || '').trim();
  if (eventName) return eventName;
  return String(value.name || '').trim();
}

/**
 * Check if two events are potential duplicates
 * Uses the 3-point matching system from the original code
 */
export function isDuplicateEntry(
  newData: {
    establishment: string;
    additionalLocation?: string;
    subVenue?: string;
    startDate: string;
    startTime?: string;
    endTime?: string;
    eventName?: string;
    name?: string;
    description?: string;
  },
  existingData: {
    establishment: string;
    additionalLocation?: string;
    subVenue?: string;
    startDate: string;
    startTime?: string;
    endTime?: string;
    eventName?: string;
    name?: string;
    description?: string;
  },
  options?: {
    similarityThreshold?: number;
    timeToleranceHours?: number;
    requireEstablishmentMatch?: boolean;
    establishmentSimilarityThreshold?: number;
  }
): boolean {
  const {
    similarityThreshold = 0.7,
    timeToleranceHours = 3,
    requireEstablishmentMatch = true,
    establishmentSimilarityThreshold = 0.85,
  } = options || {};

  // Step 1: Establishment must match
  const newEstablishment = normalizeVenueName(newData.establishment);
  const existingEstablishment = normalizeVenueName(existingData.establishment);

  // Check additional location / subVenue
  const newLocation = normalizeVenueName(newData.additionalLocation || newData.subVenue || '');
  const existingLocation = normalizeVenueName(existingData.additionalLocation || existingData.subVenue || '');

  // If locations don't match, check if one is contained in the other or they're similar
  if (newLocation !== existingLocation) {
    if (newLocation && existingLocation) {
      const oneContainsOther =
        newLocation.includes(existingLocation) || existingLocation.includes(newLocation);
      if (oneContainsOther) {
        // Treat "Top of the Park" and "Top of the Park Restaurant" as the same sub-location.
      } else {
        const locationSimilarity = calculateSimilarity(newLocation, existingLocation);
        if (locationSimilarity < 0.8) {
          return false; // Different locations within same establishment
        }
      }
    }
  }

  // Check establishment match
  if (requireEstablishmentMatch) {
    if (newEstablishment !== existingEstablishment) {
      const establishmentSimilarity = calculateEnhancedSimilarity(
        newData.establishment,
        existingData.establishment
      );
      if (establishmentSimilarity < establishmentSimilarityThreshold) {
        return false;
      }
    }
  }

  // Step 2: Date must match exactly
  if (newData.startDate !== existingData.startDate) {
    return false;
  }

  const normalizedNewName = normalizeEventText(getComparableEventName(newData));
  const normalizedExistingName = normalizeEventText(getComparableEventName(existingData));
  const hasBothNames = Boolean(normalizedNewName && normalizedExistingName);

  const nameSimilarity = hasBothNames
    ? calculateSimilarity(normalizedNewName, normalizedExistingName)
    : 0;
  const enhancedNameSimilarity = hasBothNames
    ? calculateEnhancedSimilarity(normalizedNewName, normalizedExistingName)
    : 0;
  const tokenOverlap = hasBothNames
    ? calculateTokenOverlap(normalizedNewName, normalizedExistingName)
    : { ratio: 0, shared: 0, minSize: 0, sharedTokens: [] };
  const nameMatchScore = Math.max(nameSimilarity, enhancedNameSimilarity);
  const descSimilarity = newData.description && existingData.description
    ? calculateSimilarity(
        normalizeEventText(newData.description),
        normalizeEventText(existingData.description)
      )
    : 0;

  const strongTokenMatch = tokenOverlap.ratio >= 0.9 && tokenOverlap.shared >= 3;
  const broadTokenMatch =
    tokenOverlap.shared >= 3 &&
    tokenOverlap.ratio >= 0.55 &&
    tokenOverlap.sharedTokens.some((token) => token.length >= 6 && !/^\d+$/.test(token));
  const shortArtistStyleMatch =
    tokenOverlap.shared >= 2 &&
    tokenOverlap.ratio >= 0.66 &&
    tokenOverlap.minSize <= 3 &&
    tokenOverlap.sharedTokens.some((token) => token.length >= 6 && !/^\d+$/.test(token));
  const containedCoreTitleMatch =
    tokenOverlap.ratio >= 0.99 &&
    tokenOverlap.minSize >= 2 &&
    tokenOverlap.sharedTokens.some((token) => token.length >= 5 && !/^\d+$/.test(token));
  const moderateTokenMatch =
    (tokenOverlap.ratio >= 0.72 && tokenOverlap.shared >= 3) ||
    containedCoreTitleMatch ||
    broadTokenMatch ||
    shortArtistStyleMatch;

  const strongNameMatch = hasBothNames && (nameMatchScore >= 0.82 || strongTokenMatch);
  const moderateNameMatch =
    hasBothNames &&
    (nameMatchScore >= similarityThreshold || moderateTokenMatch);
  const strongDescriptionMatch = descSimilarity >= 0.9;

  // Step 3: Time must match + semantic similarity (prevents different titles at same time collapsing)
  if (newData.startTime && existingData.startTime) {
    const timeDiff = calculateTimeDifferenceHours(newData.startTime, existingData.startTime);

    if (timeDiff === 0) {
      if (strongNameMatch || moderateNameMatch) return true;
      if (!hasBothNames && strongDescriptionMatch) return true;
      return false;
    }

    if (timeDiff <= timeToleranceHours) {
      if (moderateNameMatch) return true;
      if (!hasBothNames && strongDescriptionMatch) return true;
      if (nameMatchScore >= 0.55 && strongDescriptionMatch) return true;
    }

    const newPlaceholderMidnight = isLikelyPlaceholderMidnight(
      newData.startTime,
      newData.endTime
    );
    const existingPlaceholderMidnight = isLikelyPlaceholderMidnight(
      existingData.startTime,
      existingData.endTime
    );
    const onePlaceholderMidnight = newPlaceholderMidnight !== existingPlaceholderMidnight;
    if (onePlaceholderMidnight && timeDiff >= 6) {
      if (strongNameMatch) return true;
      if (moderateNameMatch && strongDescriptionMatch) return true;
    }

    return false;
  }

  // If no time info, require semantic match (name first, description as secondary fallback)
  if (moderateNameMatch) return true;
  if (!hasBothNames && strongDescriptionMatch) return true;
  if (nameMatchScore >= 0.55 && strongDescriptionMatch) return true;
  return false;
}
