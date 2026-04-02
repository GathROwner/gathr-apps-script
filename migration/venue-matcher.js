/**
 * venue-matcher.js
 *
 * Venue matching utilities for the event migration process.
 * Implements the similarity algorithm from additionalVenue.js for matching
 * event establishments to venues in Firestore.
 */

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} s1 - The first string.
 * @param {string} s2 - The second string.
 * @returns {number} The Levenshtein distance.
 */
function levenshteinDistance(s1, s2) {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculates base similarity between two strings using Levenshtein distance.
 * @param {string} str1 - The first string.
 * @param {string} str2 - The second string.
 * @returns {number} A value between 0 and 1, where 1 is an exact match.
 */
function calculateSimilarity(str1, str2) {
  const s1 = String(str1 || '').toLowerCase();
  const s2 = String(str2 || '').toLowerCase();
  const longerLength = Math.max(s1.length, s2.length);
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - levenshteinDistance(s1, s2)) / longerLength;
}

/**
 * Normalizes a venue name for comparison.
 * Removes apostrophes, punctuation, and normalizes whitespace.
 * @param {string} name - The venue name to normalize.
 * @returns {string} Normalized name.
 */
function normalizeVenueName(name) {
  if (!name) return '';
  // Remove straight and curly apostrophes entirely
  let str = String(name).replace(/['']/g, '');
  // Replace other punctuation with spaces
  str = str.replace(/[|–,.()\-–]/g, ' ');
  // Convert to lowercase, collapse spaces, trim
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes a URL for comparison.
 * @param {string} url - The URL to normalize.
 * @returns {string} Normalized URL.
 */
function normalizeUrl(url) {
  return String(url || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^m\./, '')
    .replace(/\/+$/, '');
}

/**
 * Extracts the slug from a Facebook URL.
 * @param {string} url - The Facebook URL.
 * @returns {string} The URL slug.
 */
function extractSlug(url) {
  const cleaned = normalizeUrl(url);
  if (!cleaned) return '';
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Common words to de-emphasize in matching.
 */
const COMMON_WORDS = [
  'city', 'the', 'downtown', 'uptown', 'new', 'old',
  'bar', 'restaurant', 'cafe', 'pub', 'lounge',
  'grill', 'eatery', 'kitchen', 'tavern', 'inn'
];

/**
 * Very common food/drink words that should be nearly ignored.
 */
const VERY_COMMON_WORDS = [
  'food', 'drink', 'menu', 'restaurant',
  'cafe', 'diner', 'coffee', 'beer', 'wine'
];

/**
 * Static URL aliases for establishments that do not have a dedicated page.
 * Keyed by normalized Facebook URL and mapped to canonical venue IDs.
 */
const STATIC_FACEBOOK_URL_ALIASES = [
  // Add validated mappings here when the canonical venue ID is confirmed.
];

/**
 * Configuration for venue matching.
 */
const MATCH_CONFIG = {
  SIMILARITY_THRESHOLD: 0.60,  // Minimum score to consider a match
  EXACT_FULL_MATCH_BONUS: 0.50,
  PRIMARY_NAME_BONUS: 0.30,
  PRIMARY_NAME_BONUS_COMMON: 0.15,
  SECONDARY_NAME_BONUS: 0.25,
  SECONDARY_NAME_BONUS_COMMON: 0.05,
  SECONDARY_NAME_BONUS_VERY_COMMON: 0.01,
  SUBSTRING_BONUS: 0.15,
  EXACT_WORD_BONUS_PER_WORD: 0.10,
  EXACT_WORD_BONUS_MAX: 0.30,
  PRIMARY_WORD_LOW_SIMILARITY_PENALTY: -0.20,
  SECONDARY_WORD_SIMILARITY_BONUS_MULTIPLIER: 0.20,
  SECONDARY_WORD_MISMATCH_PENALTY: -0.75,
  THIRD_WORD_PENALTY: -0.15,
};

/**
 * Calculates an enhanced similarity score between two establishment names.
 * Uses the algorithm from additionalVenue.js with bonuses and penalties.
 *
 * @param {string} searchName - The name being searched for (from event).
 * @param {string} venueName - The venue name to compare against.
 * @returns {Object} Object with score and breakdown.
 */
function calculateEnhancedSimilarity(searchName, venueName) {
  const normalizedSearchName = normalizeVenueName(searchName);
  const normalizedVenueName = normalizeVenueName(venueName);

  // Collapsed versions (no spaces) for slug/ID matching
  const normalizedSearchCollapsed = normalizedSearchName.replace(/\s+/g, '');
  const normalizedVenueCollapsed = normalizedVenueName.replace(/\s+/g, '');

  // Exact collapsed match
  if (normalizedSearchCollapsed && normalizedSearchCollapsed === normalizedVenueCollapsed) {
    return {
      score: 1.0,
      breakdown: { exactCollapsedMatch: true },
      isMatch: true,
    };
  }

  // Split into words
  const searchWords = normalizedSearchName.split(' ');
  const venueWords = normalizedVenueName.split(' ');

  const primarySearchName = searchWords[0] || '';
  const secondarySearchName = searchWords.length > 1 ? searchWords[1] : '';
  const tertiarySearchName = searchWords.length > 2 ? searchWords[2] : '';

  const primaryVenueName = venueWords[0] || '';
  const secondaryVenueName = venueWords.length > 1 ? venueWords[1] : '';
  const tertiaryVenueName = venueWords.length > 2 ? venueWords[2] : '';

  const isCommonPrimaryWord = COMMON_WORDS.includes(primarySearchName);
  const isCommonSecondaryWord = COMMON_WORDS.includes(secondarySearchName);
  const isVeryCommonSecondary = VERY_COMMON_WORDS.includes(secondarySearchName);

  // Calculate components
  const baseSimilarity = calculateSimilarity(normalizedVenueName, normalizedSearchName);

  // Exact full match bonus
  const exactFullMatch = normalizedVenueName === normalizedSearchName;
  const exactFullMatchBonus = exactFullMatch ? MATCH_CONFIG.EXACT_FULL_MATCH_BONUS : 0;

  // Primary word exact match bonus
  const primaryNameMatch = primaryVenueName === primarySearchName;
  const primaryNameBonus = primaryNameMatch
    ? (isCommonPrimaryWord ? MATCH_CONFIG.PRIMARY_NAME_BONUS_COMMON : MATCH_CONFIG.PRIMARY_NAME_BONUS)
    : 0;

  // Secondary word exact match bonus
  const secondaryNameMatch = secondaryVenueName && secondarySearchName &&
                             (secondaryVenueName === secondarySearchName);
  const secondaryNameBonus = secondaryNameMatch
    ? (isVeryCommonSecondary ? MATCH_CONFIG.SECONDARY_NAME_BONUS_VERY_COMMON :
       isCommonSecondaryWord ? MATCH_CONFIG.SECONDARY_NAME_BONUS_COMMON :
       MATCH_CONFIG.SECONDARY_NAME_BONUS)
    : 0;

  // Substring bonus
  const isSubstring = normalizedVenueName.includes(normalizedSearchName) ||
                      normalizedSearchName.includes(normalizedVenueName);
  const substringBonus = isSubstring ? MATCH_CONFIG.SUBSTRING_BONUS : 0;

  // Exact word bonus for distinctive words
  let exactWordBonus = 0;
  const exactWordMatches = [];
  for (const searchWord of searchWords) {
    if (searchWord.length <= 2 ||
        COMMON_WORDS.includes(searchWord) ||
        VERY_COMMON_WORDS.includes(searchWord)) continue;

    if (venueWords.includes(searchWord)) {
      exactWordBonus += MATCH_CONFIG.EXACT_WORD_BONUS_PER_WORD;
      exactWordMatches.push(searchWord);
    }
  }
  exactWordBonus = Math.min(exactWordBonus, MATCH_CONFIG.EXACT_WORD_BONUS_MAX);

  // Primary word similarity penalty if very different
  let primaryWordSimilarityScore = 0;
  if (!primaryNameMatch) {
    const primaryWordSimilarity = calculateSimilarity(primaryVenueName, primarySearchName);
    if (primaryWordSimilarity < 0.30) {
      primaryWordSimilarityScore = MATCH_CONFIG.PRIMARY_WORD_LOW_SIMILARITY_PENALTY;
    }
  }

  // Secondary word similarity bonus if not exact but highly similar
  let secondaryWordSimilarityBonus = 0;
  if (!secondaryNameMatch && secondaryVenueName && secondarySearchName) {
    const secWordSimilarity = calculateSimilarity(secondaryVenueName, secondarySearchName);
    if (secWordSimilarity > 0.60) {
      secondaryWordSimilarityBonus = secWordSimilarity * MATCH_CONFIG.SECONDARY_WORD_SIMILARITY_BONUS_MULTIPLIER;
    }
  }

  // Secondary word mismatch penalty
  let secondaryWordMismatchPenalty = 0;
  if (!secondaryNameMatch && secondaryVenueName && secondarySearchName) {
    const secSimMismatch = calculateSimilarity(secondaryVenueName, secondarySearchName);
    if (secSimMismatch < 0.50) {
      secondaryWordMismatchPenalty = MATCH_CONFIG.SECONDARY_WORD_MISMATCH_PENALTY;
    }
  }

  // Third word mismatch penalty (if first two words matched exactly)
  let thirdWordPenalty = 0;
  if (secondaryNameMatch && tertiaryVenueName && tertiarySearchName) {
    if (tertiaryVenueName !== tertiarySearchName) {
      thirdWordPenalty = MATCH_CONFIG.THIRD_WORD_PENALTY;
    }
  }

  // Compute final score
  const finalScore = baseSimilarity
                   + exactFullMatchBonus
                   + primaryNameBonus
                   + secondaryNameBonus
                   + substringBonus
                   + exactWordBonus
                   + primaryWordSimilarityScore
                   + secondaryWordSimilarityBonus
                   + secondaryWordMismatchPenalty
                   + thirdWordPenalty;

  // Clamp to [0, 1]
  const clampedScore = Math.max(0, Math.min(1, finalScore));

  return {
    score: clampedScore,
    breakdown: {
      baseSimilarity,
      exactFullMatchBonus,
      primaryNameBonus,
      secondaryNameBonus,
      substringBonus,
      exactWordBonus,
      exactWordMatches,
      primaryWordSimilarityScore,
      secondaryWordSimilarityBonus,
      secondaryWordMismatchPenalty,
      thirdWordPenalty,
    },
    isMatch: clampedScore >= MATCH_CONFIG.SIMILARITY_THRESHOLD,
  };
}

/**
 * Venue matcher class that caches venues for efficient matching.
 */
class VenueMatcher {
  /**
   * Creates a new VenueMatcher instance.
   * @param {Object[]} venues - Array of venue objects from Firestore.
   */
  constructor(venues = []) {
    this.venues = [];
    this.venuesById = new Map();
    this.venuesByUrl = new Map();
    this.venuesByNormalizedName = new Map();
    this.venuesBySlug = new Map();
    this.aliasUrls = new Set();
    this.aliasSlugs = new Set();
    this.loadVenues(venues);
  }

  /**
   * Loads venues into the matcher's caches.
   * @param {Object[]} venues - Array of venue objects.
   */
  loadVenues(venues) {
    this.venues = venues;
    this.venuesById.clear();
    this.venuesByUrl.clear();
    this.venuesByNormalizedName.clear();
    this.venuesBySlug.clear();
    this.aliasUrls.clear();
    this.aliasSlugs.clear();

    const indexAliasUrl = (aliasUrl, venue) => {
      const normalizedAlias = normalizeUrl(aliasUrl);
      if (!normalizedAlias) return;
      this.venuesByUrl.set(normalizedAlias, venue);
      this.aliasUrls.add(normalizedAlias);

      const aliasSlug = extractSlug(aliasUrl);
      if (!aliasSlug) return;
      this.venuesBySlug.set(aliasSlug, venue);
      this.aliasSlugs.add(aliasSlug);
    };

    for (const venue of venues) {
      const venueId = venue.id || venue.venueId;
      if (venueId) {
        this.venuesById.set(venueId, venue);
      }

      // Index by Facebook URL
      const fbUrl = venue.facebookUrl || venue.pageurl;
      if (fbUrl) {
        const normalizedUrl = normalizeUrl(fbUrl);
        this.venuesByUrl.set(normalizedUrl, venue);

        // Also index by slug
        const slug = extractSlug(fbUrl);
        if (slug) {
          this.venuesBySlug.set(slug, venue);
        }
      }

      // Index configured per-venue alias URL fields when available.
      const aliasFields = [
        venue.facebookAliases,
        venue.facebookAliasUrls,
        venue.aliasUrls,
      ];
      for (const field of aliasFields) {
        if (!field) continue;
        const aliases = Array.isArray(field) ? field : [field];
        for (const aliasUrl of aliases) {
          if (aliasUrl) {
            indexAliasUrl(aliasUrl, venue);
          }
        }
      }

      // Index by normalized name
      const name = venue.pagename || venue.title;
      if (name) {
        const normalizedName = normalizeVenueName(name);
        // Store in array since multiple venues might have similar names
        if (!this.venuesByNormalizedName.has(normalizedName)) {
          this.venuesByNormalizedName.set(normalizedName, []);
        }
        this.venuesByNormalizedName.get(normalizedName).push(venue);
      }
    }

    // Index global static aliases after venues are loaded.
    for (const mapping of STATIC_FACEBOOK_URL_ALIASES) {
      const venue = this.venuesById.get(mapping.venueId);
      if (!venue) continue;
      indexAliasUrl(mapping.aliasUrl, venue);
    }
  }

  /**
   * Finds a matching venue for an event establishment.
   *
   * @param {string} establishment - The establishment name from the event.
   * @param {string} [facebookUrl] - Optional Facebook URL for exact matching.
   * @returns {Object|null} Match result with venue and score, or null if no match.
   */
  findMatch(establishment, facebookUrl = null) {
    // 1. Try exact Facebook URL match first
    if (facebookUrl) {
      const normalizedUrl = normalizeUrl(facebookUrl);
      if (this.venuesByUrl.has(normalizedUrl)) {
        const venue = this.venuesByUrl.get(normalizedUrl);
        return {
          venue,
          matchType: this.aliasUrls.has(normalizedUrl) ? 'facebook_url_alias' : 'facebook_url_exact',
          score: 1.0,
          venueId: venue.id || venue.venueId,
        };
      }

      // Try slug match
      const slug = extractSlug(facebookUrl);
      if (slug && this.venuesBySlug.has(slug)) {
        const venue = this.venuesBySlug.get(slug);
        return {
          venue,
          matchType: this.aliasSlugs.has(slug) ? 'facebook_slug_alias' : 'facebook_slug_exact',
          score: 1.0,
          venueId: venue.id || venue.venueId,
        };
      }
    }

    // 2. Try exact normalized name match
    const normalizedEstablishment = normalizeVenueName(establishment);
    if (this.venuesByNormalizedName.has(normalizedEstablishment)) {
      const venues = this.venuesByNormalizedName.get(normalizedEstablishment);
      if (venues.length === 1) {
        return {
          venue: venues[0],
          matchType: 'name_exact',
          score: 1.0,
          venueId: venues[0].id || venues[0].venueId,
        };
      }
      // Multiple exact matches - return first but flag it
      return {
        venue: venues[0],
        matchType: 'name_exact_multiple',
        score: 0.95,
        venueId: venues[0].id || venues[0].venueId,
        alternativeMatches: venues.slice(1),
      };
    }

    // 3. Try fuzzy name match
    let bestMatch = null;
    let bestScore = 0;

    for (const venue of this.venues) {
      const venueName = venue.pagename || venue.title;
      if (!venueName) continue;

      const result = calculateEnhancedSimilarity(establishment, venueName);

      if (result.score > bestScore && result.score >= MATCH_CONFIG.SIMILARITY_THRESHOLD) {
        bestScore = result.score;
        bestMatch = {
          venue,
          matchType: 'name_fuzzy',
          score: result.score,
          venueId: venue.id || venue.venueId,
          breakdown: result.breakdown,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Gets the total number of venues loaded.
   * @returns {number} Venue count.
   */
  get venueCount() {
    return this.venues.length;
  }
}

module.exports = {
  levenshteinDistance,
  calculateSimilarity,
  normalizeVenueName,
  normalizeUrl,
  extractSlug,
  calculateEnhancedSimilarity,
  VenueMatcher,
  STATIC_FACEBOOK_URL_ALIASES,
  MATCH_CONFIG,
  COMMON_WORDS,
  VERY_COMMON_WORDS,
};
