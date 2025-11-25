// stringUtils.gs

/**
 * Calculates the similarity between two strings using Levenshtein distance.
 * @param {string} str1 - The first string to compare.
 * @param {string} str2 - The second string to compare.
 * @return {number} A value between 0 and 1, where 1 is an exact match.
 */
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const longerLength = Math.max(s1.length, s2.length);
  if (longerLength === 0) {
    return 1.0;
  }
  return (longerLength - levenshteinDistance(s1, s2)) / longerLength;
}

/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} s1 - The first string.
 * @param {string} s2 - The second string.
 * @return {number} The Levenshtein distance.
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
 * Calculates an enhanced similarity score between two establishment names.
 * @param {string} name1 - The first establishment name.
 * @param {string} name2 - The second establishment name.
 * @return {number} A value between 0 and 1, where 1 is a perfect match.
 */
// stringUtils.gs

function calculateEnhancedNameSimilarity(name1, name2) {
  // Remove common suffixes like "Est 1983" from name1
  const cleanName1 = name1.replace(/\s+Est\s+\d{4}$/i, '').trim();
  
  // Normalize names: remove punctuation and convert to lowercase
  const normalizedName1 = cleanName1.toLowerCase().replace(/[^\w\s]/g, '');
  const normalizedName2 = name2.toLowerCase().replace(/[^\w\s]/g, '');
  
  const words1 = normalizedName1.split(/\s+/);
  const words2 = normalizedName2.split(/\s+/);
  
  // Check for exact match (case-insensitive)
  if (normalizedName1 === normalizedName2) {
    return 1.0;
  }
  
  // Check if all words from one name are included in the other
  const name1IncludesAll = words2.every(word => words1.includes(word));
  const name2IncludesAll = words1.every(word => words2.includes(word));
  
  // Calculate the basic similarity score
  const basicSimilarity = calculateSimilarity(normalizedName1, normalizedName2);
  
  // Calculate the percentage of words from each name found in the other
  const wordMatchPercentage1 = words1.filter(word => words2.includes(word)).length / words1.length;
  const wordMatchPercentage2 = words2.filter(word => words1.includes(word)).length / words2.length;
  const wordMatchPercentage = Math.max(wordMatchPercentage1, wordMatchPercentage2);
  
  // Enhance the score based on various factors
  let enhancedScore = basicSimilarity;
  
  if (name1IncludesAll || name2IncludesAll) {
    enhancedScore = Math.max(enhancedScore, 0.9);
  }
  
  if (normalizedName1.includes(normalizedName2) || normalizedName2.includes(normalizedName1)) {
    enhancedScore = Math.max(enhancedScore, 0.95);
  }
  
  // For very short names (1-2 words), be more lenient
  if (words1.length <= 2 || words2.length <= 2) {
    enhancedScore = Math.max(enhancedScore, wordMatchPercentage);
  }
  
  // Further adjust the score based on the percentage of matched words
  const finalScore = enhancedScore * (0.6 + 0.4 * wordMatchPercentage);
  
  console.log(`Name matching: "${name1}" (normalized: "${normalizedName1}") vs "${name2}" (normalized: "${normalizedName2}")`);
  console.log(`Basic similarity: ${basicSimilarity.toFixed(2)}`);
  console.log(`Word match percentage: ${(wordMatchPercentage * 100).toFixed(2)}%`);
  console.log(`Enhanced score: ${enhancedScore.toFixed(2)}`);
  console.log(`Final score: ${finalScore.toFixed(2)}`);
  
  return finalScore;
}