export type AddressSource =
  | 'manual'
  | 'google_places'
  | 'contact_info'
  | 'venue'
  | 'facebook_page'
  | 'facebook_event'
  | 'parser'
  | 'unknown';

export type AddressNormalizationIssue =
  | 'duplicate_component'
  | 'duplicate_province_alias'
  | 'country_before_province'
  | 'postal_after_country'
  | 'downtown_locality_qualifier'
  | 'ambiguous_component_order';

export interface NormalizedAddressResult {
  rawAddress: string;
  normalizedAddress: string;
  changed: boolean;
  issues: AddressNormalizationIssue[];
}

export interface PreferredAddressCandidate {
  address?: unknown;
  source?: AddressSource;
  googlePlaceId?: unknown;
}

export interface PreferredAddressResult {
  selected: 'existing' | 'incoming' | 'none';
  address: string;
  source: AddressSource;
  normalization: NormalizedAddressResult;
}

const CANADIAN_POSTAL_CODE = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;
const CIVIC_STREET_COMPONENT = /^\s*\d+[A-Z]?(?:[-–]\d+[A-Z]?)?\s+.+\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr|route|rte|highway|hwy|boulevard|blvd|court|ct|place|pl|way|parkway|pkwy|trail|terrace|crescent|cres)\.?\s*$/i;
const CANADIAN_PROVINCES: Record<string, string[]> = {
  AB: ['AB', 'Alberta'],
  BC: ['BC', 'British Columbia'],
  MB: ['MB', 'Manitoba'],
  NB: ['NB', 'New Brunswick'],
  NL: ['NL', 'Newfoundland and Labrador', 'Newfoundland & Labrador'],
  NS: ['NS', 'Nova Scotia'],
  NT: ['NT', 'Northwest Territories'],
  NU: ['NU', 'Nunavut'],
  ON: ['ON', 'Ontario'],
  PE: ['PE', 'PEI', 'P.E.I.', 'Prince Edward Island'],
  QC: ['QC', 'Quebec', 'Québec'],
  SK: ['SK', 'Saskatchewan'],
  YT: ['YT', 'Yukon'],
};

const SOURCE_CONFIDENCE: Record<AddressSource, number> = {
  manual: 100,
  google_places: 90,
  contact_info: 70,
  venue: 65,
  facebook_page: 50,
  facebook_event: 40,
  parser: 30,
  unknown: 10,
};

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizePostalCode(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : value.trim();
}

function cleanComponent(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+([,])/g, '$1').trim();
}

function comparableComponent(value: string): string {
  return cleanComponent(value)
    .replace(/[.]/g, '')
    .toLowerCase();
}

function detectDuplicateComponents(components: string[]): boolean {
  const comparable = components.map(comparableComponent).filter(Boolean);
  return comparable.some((value, index) => comparable.indexOf(value) !== index);
}

function findProvinceToken(value: string): { abbreviation: string; isAbbreviation: boolean } | null {
  const comparable = comparableComponent(value);
  for (const [abbreviation, aliases] of Object.entries(CANADIAN_PROVINCES)) {
    for (const alias of aliases) {
      if (comparable === comparableComponent(alias)) {
        return {
          abbreviation,
          isAbbreviation: comparable === comparableComponent(abbreviation) ||
            (abbreviation === 'PE' && comparable === 'pei'),
        };
      }
    }
  }
  return null;
}

function startsWithProvinceToken(value: string): boolean {
  const comparable = cleanComponent(value);
  return Object.values(CANADIAN_PROVINCES)
    .flat()
    .some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped}(?:\\s|$)`, 'i').test(comparable);
    });
}

function normalizeDowntownLocality(components: string[]): { components: string[]; changed: boolean } {
  const hasCivicStreet = components.some((component) => CIVIC_STREET_COMPONENT.test(component));
  if (!hasCivicStreet) return { components, changed: false };

  let changed = false;
  const normalized = components.map((component, index) => {
    const match = component.match(/^Downtown\s+([A-Za-z][A-Za-z .'-]*[A-Za-z])$/i);
    const nextComponent = components[index + 1] || '';
    if (!match || !startsWithProvinceToken(nextComponent)) return component;
    changed = true;
    return cleanComponent(match[1]);
  });

  return { components: normalized, changed };
}

/**
 * Normalize the Canadian address defects observed in Facebook/Apify payloads.
 * The function is intentionally conservative: it only reorders recognized
 * country/province/postal components and otherwise preserves source text.
 */
export function normalizeCanadianAddress(value: unknown): NormalizedAddressResult {
  const rawAddress = String(value || '').trim();
  if (!rawAddress) {
    return { rawAddress: '', normalizedAddress: '', changed: false, issues: [] };
  }

  const sourceComponents = rawAddress
    .split(',')
    .map(cleanComponent)
    .filter(Boolean);
  const issues: AddressNormalizationIssue[] = [];
  const downtownNormalization = normalizeDowntownLocality(sourceComponents);
  const components = downtownNormalization.components;

  if (downtownNormalization.changed) {
    issues.push('downtown_locality_qualifier');
  }

  if (detectDuplicateComponents(components)) {
    issues.push('duplicate_component');
  }

  const provinceTokens = components
    .map((component, index) => ({ index, token: findProvinceToken(component) }))
    .filter((entry): entry is { index: number; token: { abbreviation: string; isAbbreviation: boolean } } =>
      entry.token !== null
    );
  const provinceAbbreviations = unique(provinceTokens.map((entry) => entry.token.abbreviation));
  const abbreviatedProvinceTokens = provinceTokens.filter((entry) => entry.token.isAbbreviation);
  const fullProvinceTokens = provinceTokens.filter((entry) => !entry.token.isAbbreviation);
  if (abbreviatedProvinceTokens.length > 0 && fullProvinceTokens.length > 0) {
    issues.push('duplicate_province_alias');
  }

  const countryIndexes = components
    .map((component, index) => /^Canada$/i.test(component) ? index : -1)
    .filter((index) => index >= 0);
  const countryIndex = countryIndexes.length === 1 ? countryIndexes[0] : -1;
  const lastProvinceIndex = provinceTokens.length
    ? Math.max(...provinceTokens.map((entry) => entry.index))
    : -1;
  if (countryIndex >= 0 && lastProvinceIndex > countryIndex) {
    issues.push('country_before_province');
  }

  const postalIndexes = components
    .map((component, index) => CANADIAN_POSTAL_CODE.test(component) ? index : -1)
    .filter((index) => index >= 0);
  if (countryIndex >= 0 && postalIndexes.some((index) => index > countryIndex)) {
    issues.push('postal_after_country');
  }

  const structuralIssues = issues.filter((issue) => issue !== 'downtown_locality_qualifier');
  if (
    downtownNormalization.changed &&
    structuralIssues.length === 0 &&
    countryIndexes.length <= 1 &&
    provinceAbbreviations.length <= 1
  ) {
    const normalizedAddress = components.join(', ');
    return {
      rawAddress,
      normalizedAddress,
      changed: normalizedAddress !== rawAddress,
      issues,
    };
  }

  const canSafelyNormalize = Boolean(
    countryIndexes.length <= 1 &&
    provinceAbbreviations.length <= 1 &&
    abbreviatedProvinceTokens.length === 1 &&
    (
      fullProvinceTokens.length > 0 ||
      (countryIndex >= 0 && postalIndexes.length === 1 && postalIndexes[0] > countryIndex)
    )
  );
  if (!canSafelyNormalize) {
    if (issues.length > 0 || countryIndexes.length > 1 || provinceAbbreviations.length > 1) {
      issues.push('ambiguous_component_order');
    }
    return {
      rawAddress,
      normalizedAddress: rawAddress,
      changed: false,
      issues: unique(issues),
    };
  }

  const recognizedIndexes = new Set<number>([
    ...provinceTokens.map((entry) => entry.index),
    ...postalIndexes,
    ...(countryIndex >= 0 ? [countryIndex] : []),
  ]);
  const ordinaryComponents: string[] = [];
  const seenOrdinary = new Set<string>();
  components.forEach((component, index) => {
    if (recognizedIndexes.has(index)) return;
    const key = comparableComponent(component);
    if (!key || seenOrdinary.has(key)) return;
    seenOrdinary.add(key);
    ordinaryComponents.push(component);
  });

  const province = abbreviatedProvinceTokens[0].token.abbreviation;
  const postal = postalIndexes.length ? normalizePostalCode(components[postalIndexes[0]]) : '';
  const provincePostal = [province, postal].filter(Boolean).join(' ');
  const country = countryIndex >= 0 ? 'Canada' : '';
  const normalizedAddress = [
    ...ordinaryComponents,
    provincePostal,
    country,
  ].filter(Boolean).join(', ');

  return {
    rawAddress,
    normalizedAddress: normalizedAddress || rawAddress,
    changed: (normalizedAddress || rawAddress) !== rawAddress,
    issues: unique(issues),
  };
}

export function isStructurallyAcceptableAddress(value: unknown): boolean {
  const normalized = normalizeCanadianAddress(value);
  if (!normalized.normalizedAddress) return false;
  const hasNumber = /\d/.test(normalized.normalizedAddress);
  const hasStreet = /\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr|route|rte|highway|hwy|boulevard|blvd|court|ct|place|pl|way|parkway|pkwy|trail|terrace|crescent|cres)\b/i
    .test(normalized.normalizedAddress);
  const hasLocality = normalized.normalizedAddress.split(',').length >= 2;
  return hasNumber && hasStreet && hasLocality;
}

function candidateConfidence(candidate: PreferredAddressCandidate): number {
  const source = candidate.source || 'unknown';
  const placeBonus = String(candidate.googlePlaceId || '').trim() ? 5 : 0;
  const normalization = normalizeCanadianAddress(candidate.address);
  const issuePenalty = normalization.issues.length * 2;
  return SOURCE_CONFIDENCE[source] + placeBonus - issuePenalty;
}

/** Select an address without allowing a lower-confidence feed to replace a better canonical source. */
export function choosePreferredAddress(
  existing: PreferredAddressCandidate,
  incoming: PreferredAddressCandidate
): PreferredAddressResult {
  const existingNormalization = normalizeCanadianAddress(existing.address);
  const incomingNormalization = normalizeCanadianAddress(incoming.address);
  const existingValid = isStructurallyAcceptableAddress(existingNormalization.normalizedAddress);
  const incomingValid = isStructurallyAcceptableAddress(incomingNormalization.normalizedAddress);

  if (!existingValid && !incomingValid) {
    return {
      selected: 'none',
      address: '',
      source: 'unknown',
      normalization: normalizeCanadianAddress(''),
    };
  }
  if (!existingValid) {
    return {
      selected: 'incoming',
      address: incomingNormalization.normalizedAddress,
      source: incoming.source || 'unknown',
      normalization: incomingNormalization,
    };
  }
  if (!incomingValid) {
    return {
      selected: 'existing',
      address: existingNormalization.normalizedAddress,
      source: existing.source || 'unknown',
      normalization: existingNormalization,
    };
  }

  const existingKey = comparableComponent(existingNormalization.normalizedAddress);
  const incomingKey = comparableComponent(incomingNormalization.normalizedAddress);
  if (existingKey === incomingKey || candidateConfidence(incoming) >= candidateConfidence(existing)) {
    return {
      selected: 'incoming',
      address: incomingNormalization.normalizedAddress,
      source: incoming.source || 'unknown',
      normalization: incomingNormalization,
    };
  }

  return {
    selected: 'existing',
    address: existingNormalization.normalizedAddress,
    source: existing.source || 'unknown',
    normalization: existingNormalization,
  };
}
