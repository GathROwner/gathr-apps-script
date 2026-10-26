/** Exact numbered street identity, without fuzzy proximity or venue equivalence. */
export function numberedStreetKey(value: unknown): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\./g, '')
    .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave').replace(/\bdrive\b/g, 'dr');
  return text.match(/^(\d+[a-z]?(?:[-/]\d+)?\s+[a-z0-9 '-]+?\s+(?:st|rd|ave|dr|lane|ln|blvd|boulevard|court|ct))\b/)?.[1] || '';
}

/** Strip a prose sentence without breaking postal abbreviations or initials. */
export function firstLocationSentence(value: string): string {
  const protectedText = value.replace(/\b(?:P\.\s*O\.|St\.|Rd\.|Ave\.|Dr\.|[A-Z]\.)\s*(?=[A-Z])/g,
    match => match.replace(/\./g, '\uE000'));
  return protectedText.split(/\.\s+(?=[A-Z])/)[0].replace(/\uE000/g, '.').trim();
}

export function postalStreetIdentity(value: string): string {
  const street = numberedStreetKey(value);
  if (!street || /\b(?:room|studio|suite|unit|hall|theatre|theater|building|floor|entrance)\b/i.test(value)) return '';
  return street;
}

export function streetLocality(value: string): string {
  return value.match(/,\s*([^,]+),\s*(?:PEI?|NS|NB|NL|ON|QC|BC|AB)(?:\b|\s)/i)?.[1].toLowerCase().trim() || '';
}

export function compatibleStreetLocality(left: string, right: string): boolean {
  const a = streetLocality(left), b = streetLocality(right);
  const province = (value: string): string => value.match(/,\s*(PEI?|NS|NB|NL|ON|QC|BC|AB)\b/i)?.[1].toUpperCase().replace(/^PEI$/, 'PE') || '';
  const pa = province(left), pb = province(right);
  return !(a && b && a !== b || pa && pb && pa !== pb);
}
