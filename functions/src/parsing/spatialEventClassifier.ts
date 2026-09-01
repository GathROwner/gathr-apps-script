/**
 * Spatial event classification for events that are not a single durable venue.
 *
 * This module deliberately separates recognition from publication. It may say
 * "this is a route" or "these are unordered locations", but it never invents
 * coordinates, a street order, or a connecting line.
 */

export type SpatialEventKind =
  | 'single_location'
  | 'multi_location'
  | 'route'
  | 'separate_occurrences'
  | 'online'
  | 'unknown';

export type SpatialEvidenceConfidence = 'high' | 'medium' | 'low';
export type SpatialLocationRole = 'start' | 'finish' | 'stop' | 'location';
export type SpatialLocationCertainty = 'confirmed' | 'possible';

export interface SpatialLocationEvidence {
  label: string;
  address?: string;
  role: SpatialLocationRole;
  certainty: SpatialLocationCertainty;
  sourceText?: string;
}

export interface ModelSpatialEvidence {
  kind?: unknown;
  locations?: unknown;
  confirmedStreets?: unknown;
  ordered?: unknown;
  evidenceNotes?: unknown;
}

export interface SpatialEventClassification {
  version: 1;
  kind: SpatialEventKind;
  representation: 'venue' | 'area' | 'route' | 'none';
  confidence: SpatialEvidenceConfidence;
  ordered: boolean;
  locations: SpatialLocationEvidence[];
  confirmedStreets: string[];
  routeEvidenceLevel?:
    | 'official_full_route'
    | 'official_partial_route'
    | 'stops_only'
    | 'inferred';
  reviewReasons: string[];
  evidenceNotes?: string;
}

export interface ClassifySpatialEventInput {
  name?: unknown;
  description?: unknown;
  location?: unknown;
  combinedText?: unknown;
  modelSpatialEvidence?: ModelSpatialEvidence | null;
}

const ROUTE_EVENT_PATTERN =
  /\b(parade|procession|march|fun\s*run|road\s*race|race\s*route|marathon|half\s*marathon|5k|10k|walkathon|charity\s+walk|bike\s+ride|cycling\s+ride|gran\s+fondo|motorcade|boat\s+parade|trail\s+run)\b/i;
const ROUTE_STRUCTURE_PATTERN =
  /\b(route|course|street\s+sequence|start(?:s|ing)?\s+(?:at|near|from)|finish(?:es|ing)?\s+(?:at|near|on)|checkpoint|turnaround|proceed(?:s|ing)?\s+(?:along|via|down)|travels?\s+(?:along|via|down)|follows?\s+(?:the\s+)?(?:streets?|route)|along\s+[A-Z0-9])\b/i;
const TRAFFIC_NOTICE_PATTERN =
  /\b(traffic\s+(?:notice|advisory|impact)|road\s+closure|street\s+closure|expect\s+delays|detour|motorists?\s+are\s+advised)\b/i;
const EVENT_OCCURRENCE_PATTERN =
  /\b(event|festival|parade|race|run|ride|walk|concert|performance|market|celebration|starts?|begins?|join\s+us|register)\b/i;
const MULTI_LOCATION_PATTERN =
  /\b(various\s+(?:locations|venues)|multiple\s+(?:locations|venues)|several\s+(?:locations|venues)|across\s+(?:the\s+)?(?:city|town|pei)|throughout\s+(?:the\s+)?(?:city|town|pei)|multi[-\s]?(?:location|venue|site)|at\s+all\s+locations|no\s+set\s+order)\b/i;
const ONLINE_PATTERN = /\b(online|virtual|zoom|livestream|live\s*stream|webinar)\b/i;
const PHYSICAL_LOCATION_PATTERN =
  /\b(at|inside|outside|located\s+at|address|street|road|avenue|drive|hall|centre|center|park|market|quay|wharf|school|arena)\b/i;
const STREET_SUFFIX_PATTERN =
  /\b(street|st\.?|road|rd\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|highway|hwy\.?|route|trail|way)\b/i;
const ROOM_PATTERN =
  /\b(room|studio|auditorium|main\s+stage|side\s+stage|patio|kitchen|lobby|upstairs|downstairs|suite)\b/i;
const DURABLE_HOST_PATTERN =
  /\b(centre|center|hall|arena|school|hotel|market|theatre|theater|museum|gallery|library|complex|campus)\b/i;
const ADDRESS_SIGNAL_PATTERN =
  /\b\d{1,6}\s+[A-Za-z]|\b(charlottetown|summerside|montague|cornwall|stratford|georgetown|souris|kensington|pei|p\.e\.i\.)\b/i;
const DATE_TOKEN_PATTERN =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b20\d{2}-\d{2}-\d{2}\b/i;

function cleanText(value: unknown, maxLength = 500): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;|/\-–—]+|[\s,;|/\-–—]+$/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeKey(value: unknown): string {
  return cleanText(value, 500)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function uniqueStrings(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = cleanText(value, 180);
    const key = normalizeKey(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function inferRole(value: unknown): SpatialLocationRole {
  const text = cleanText(value, 240);
  if (/\b(start|begin|depart|registration)\b/i.test(text)) return 'start';
  if (/\b(finish|end)\b/i.test(text)) return 'finish';
  if (/\b(stop|checkpoint|turnaround|waypoint)\b/i.test(text)) return 'stop';
  return 'location';
}

function stripLocationPrefix(value: string): string {
  return cleanText(
    value.replace(
      /^(?:confirmed\s+|possible\s+|approximate\s+)?(?:start(?:ing)?(?:\s+(?:at|near|from))?|finish(?:ing)?(?:\s+(?:at|near|on))?|stop|checkpoint|turnaround|location|venue|site)\s*[:\-–—]?\s*/i,
      ''
    ),
    220
  ).replace(/[.!?]+$/g, '').trim();
}

// Some structured Facebook payloads expose their end timestamp as a generic
// "start"/"location" value. A timestamp is useful event metadata, never a
// second map location.
function isTemporalMetadata(value: string): boolean {
  const text = cleanText(value, 180);
  return /^20\d{2}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.test(text) ||
    /^\d{1,2}:\d{2}(?:\s*(?:am|pm))?$/i.test(text);
}

function splitExplicitList(value: string): string[] {
  const normalized = String(value || '')
    .replace(/\s+(?:and|then)\s+/gi, ' | ')
    .replace(/\s*(?:→|->|>|;|\|)\s*/g, ' | ');

  // Commas are overwhelmingly address punctuation ("145 Richmond Street,
  // Charlottetown, PE"), not evidence of multiple venues. Require an explicit
  // list separator for multi-site evidence.
  const commaParts = normalized.includes('|') ? normalized.split('|') : [normalized];

  return uniqueStrings(
    commaParts
      .map((part) => stripLocationPrefix(part))
      .filter((part) => part.length >= 3 && !isTemporalMetadata(part))
  );
}

function locationFromModel(value: unknown): SpatialLocationEvidence | null {
  if (typeof value === 'string') {
    const label = stripLocationPrefix(value);
    if (!label) return null;
    return {
      label,
      role: inferRole(value),
      certainty: /\b(possible|approximate|estimated|unknown|tbc|to\s+be\s+confirmed)\b/i.test(value)
        ? 'possible'
        : 'confirmed',
      sourceText: cleanText(value, 300),
    };
  }

  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
  if (!record) return null;
  const label = cleanText(record.label || record.name || record.location, 180);
  if (!label || isTemporalMetadata(label)) return null;
  const rawRole = normalizeKey(record.role);
  const role: SpatialLocationRole =
    rawRole === 'start' || rawRole === 'finish' || rawRole === 'stop'
      ? rawRole
      : inferRole(`${record.role || ''} ${label}`);
  const rawCertainty = normalizeKey(record.certainty);
  return {
    label,
    address: cleanText(record.address, 260) || undefined,
    role,
    certainty: rawCertainty === 'possible' || rawCertainty === 'approximate'
      ? 'possible'
      : 'confirmed',
    sourceText: cleanText(record.sourceText || record.evidence, 300) || undefined,
  };
}

function dedupeLocations(values: SpatialLocationEvidence[]): SpatialLocationEvidence[] {
  const result: SpatialLocationEvidence[] = [];
  const byKey = new Map<string, number>();
  for (const value of values) {
    const key = normalizeKey(value.address || value.label);
    if (!key) continue;
    const existingIndex = byKey.get(key);
    if (existingIndex === undefined) {
      byKey.set(key, result.length);
      result.push(value);
      continue;
    }
    const existing = result[existingIndex];
    result[existingIndex] = {
      ...existing,
      address: existing.address || value.address,
      role: existing.role === 'location' ? value.role : existing.role,
      certainty:
        existing.certainty === 'confirmed' || value.certainty === 'confirmed'
          ? 'confirmed'
          : 'possible',
      sourceText: existing.sourceText || value.sourceText,
    };
  }
  return result;
}

function extractPrefixedLocations(text: string): SpatialLocationEvidence[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const locations: SpatialLocationEvidence[] = [];

  for (const line of lines) {
    const single = line.match(
      /^(confirmed\s+|possible\s+|approximate\s+|estimated\s+)?(start(?:ing)?(?:\s+(?:at|near|from))?|finish(?:ing)?(?:\s+(?:at|near|on))?|stop|checkpoint|turnaround|location|venue|site)\s*[:\-–—]\s*(.+)$/i
    );
    if (single?.[3]) {
      const label = stripLocationPrefix(single[3].split(
        /\b(?:(?:confirmed|possible|approximate|estimated|official)\s+)?(?:weather\s+)?(?:start(?:ing)?|finish(?:ing)?|locations?|venues?|sites?|stops?|checkpoints?|turnaround|route|course|street\s+sequence|streets?)\s*(?:\([^)]{1,80}\))?\s*[:\-–—]\s*/i
      )[0]);
      if (label && !isTemporalMetadata(label)) {
        locations.push({
          label,
          role: inferRole(single[2]),
          certainty: /possible|approximate|estimated/i.test(single[1] || '')
            ? 'possible'
            : 'confirmed',
          sourceText: cleanText(line, 300),
        });
      }
      continue;
    }

    const list = line.match(/^(locations|venues|sites|stops|checkpoints)\s*[:\-–—]\s*(.+)$/i);
    if (list?.[2]) {
      for (const label of splitExplicitList(list[2])) {
        locations.push({
          label,
          role: list[1].toLowerCase().startsWith('stop') ||
            list[1].toLowerCase().startsWith('checkpoint') ? 'stop' : 'location',
          certainty: /\b(possible|approximate|estimated|tbc)\b/i.test(label)
            ? 'possible'
            : 'confirmed',
          sourceText: cleanText(line, 300),
        });
      }
    }
  }
  return dedupeLocations(locations);
}

/**
 * Stage 3 often turns a poster into one prose paragraph. Preserve labelled
 * spatial sections even when their original line breaks are gone, for example:
 *
 *   CONFIRMED LOCATIONS (NO SET ORDER): A; B POSSIBLE WEATHER LOCATION: C
 *
 * The next recognised spatial heading is the boundary. This intentionally does
 * not infer an order or turn the point set into a connecting route.
 */
function extractInlineLabeledLocations(text: string): SpatialLocationEvidence[] {
  const source = String(text || '');
  const heading = /\b(?:(confirmed|possible|approximate|estimated|official)\s+)?(?:weather\s+)?(start(?:ing)?(?:\s+(?:at|near|from))?|finish(?:ing)?(?:\s+(?:at|near|on))?|locations?|venues?|sites?|stops?|checkpoints?|turnaround|route|course|street\s+sequence|streets?)\s*(?:\([^)]{1,80}\))?\s*[:\-–—]\s*/gi;
  const matches = Array.from(source.matchAll(heading));
  if (matches.length === 0) return [];

  const locations: SpatialLocationEvidence[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index || 0) + match[0].length;
    const nextHeading = index + 1 < matches.length ? (matches[index + 1].index || source.length) : source.length;
    const nextLineBreak = source.indexOf('\n', start);
    const end = nextLineBreak >= 0 ? Math.min(nextHeading, nextLineBreak) : nextHeading;
    let section = cleanText(source.slice(start, end), 600);
    // Explanatory prose after the labelled value is not part of a place name.
    section = section.split(/\.\s+(?=[A-Z])/)[0].trim();
    if (!section) continue;

    const headingCertainty = /possible|approximate|estimated/i.test(match[1] || '')
      ? 'possible' as const
      : 'confirmed' as const;
    const rawType = String(match[2] || 'location');
    if (/^(?:route|course|street\s+sequence|streets?)$/i.test(rawType)) continue;
    const isList = /^(?:locations?|venues?|sites?|stops?|checkpoints?)$/i.test(rawType);
    const labels = isList ? splitExplicitList(section) : [stripLocationPrefix(section)];
    for (const label of labels) {
      if (!label || isTemporalMetadata(label)) continue;
      locations.push({
        label,
        role: inferRole(rawType),
        certainty: headingCertainty,
        sourceText: cleanText(`${match[0]}${section}`, 300),
      });
    }
  }

  return dedupeLocations(locations);
}

function extractStreetSequence(text: string): string[] {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines) {
    const match = line.match(
      /^(?:confirmed\s+)?(?:route|course|street\s+sequence|streets?)\s*[:\-–—]\s*(.+)$/i
    );
    if (!match?.[1]) continue;
    for (const part of splitExplicitList(match[1])) {
      if (STREET_SUFFIX_PATTERN.test(part)) candidates.push(part);
    }
  }
  // The image extractor may flatten line breaks. Stop at the next explicit
  // start/finish/location heading rather than swallowing the rest of the prose.
  const inline = String(text || '').match(
    /\b(?:confirmed\s+|official\s+)?(?:route|course|street\s+sequence|streets?)\s*[:\-–—]\s*([\s\S]*?)(?=\b(?:confirmed\s+|possible\s+|approximate\s+|estimated\s+)?(?:start(?:ing)?|finish(?:ing)?|locations?|venues?|sites?|stops?|checkpoints?|turnaround)\s*(?:\([^)]{1,80}\))?\s*[:\-–—]|$)/i
  );
  if (inline?.[1]) {
    for (const part of splitExplicitList(inline[1].split(/\.\s+(?=[A-Z])/)[0])) {
      const street = part.replace(/[.!?]+$/g, '').trim();
      if (STREET_SUFFIX_PATTERN.test(street)) candidates.push(street);
    }
  }
  return uniqueStrings(candidates);
}

function extractInlineRoleLocations(value: string): SpatialLocationEvidence[] {
  const parts = String(value || '').split(/\s*(?:\/|;)\s*/).filter(Boolean);
  if (parts.length < 2) return [];

  const locations = parts.map((part) => {
    const match = part.match(/^(.+?)\s*\((start|finish|stop|checkpoint|turnaround)\)\s*$/i);
    if (!match?.[1] || !match[2]) return null;
    const label = cleanText(match[1], 180);
    if (!label) return null;
    return {
      label,
      role: inferRole(match[2]),
      certainty: 'confirmed' as const,
      sourceText: cleanText(part, 300),
    };
  }).filter(Boolean) as SpatialLocationEvidence[];

  return locations.length >= 2 ? dedupeLocations(locations) : [];
}

function modelKind(value: unknown): SpatialEventKind | null {
  const normalized = normalizeKey(value).replace(/\s+/g, '_');
  if (normalized === 'route') return 'route';
  if (normalized === 'multi_location' || normalized === 'multi_venue') return 'multi_location';
  if (normalized === 'single_location' || normalized === 'single_venue') return 'single_location';
  if (normalized === 'separate_occurrences') return 'separate_occurrences';
  if (normalized === 'online' || normalized === 'virtual') return 'online';
  if (normalized === 'unknown') return 'unknown';
  return null;
}

function looksLikeSeparateLocationOccurrences(text: string): boolean {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const datedLocationLines = lines.filter((line) =>
    DATE_TOKEN_PATTERN.test(line) && /\b(charlottetown|summerside|montague|cornwall|stratford|georgetown|souris|kensington)\b/i.test(line)
  );
  return datedLocationLines.length >= 2;
}

function extractDatedCityLocations(text: string): SpatialLocationEvidence[] {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const cities = ['Charlottetown', 'Summerside', 'Montague', 'Cornwall', 'Stratford', 'Georgetown', 'Souris', 'Kensington'];
  return lines.flatMap((line) => {
    if (!DATE_TOKEN_PATTERN.test(line)) return [];
    const city = cities.find((candidate) => new RegExp(`\\b${candidate}\\b`, 'i').test(line));
    return city ? [{ label: city, role: 'location' as const, certainty: 'confirmed' as const, sourceText: cleanText(line, 300) }] : [];
  });
}

function chooseConfidence(params: {
  kind: SpatialEventKind;
  modelKind: SpatialEventKind | null;
  locations: SpatialLocationEvidence[];
  streets: string[];
  routeStructure: boolean;
  multiCue: boolean;
}): SpatialEvidenceConfidence {
  if (params.kind === 'route') {
    if (params.streets.length >= 2 || params.locations.length >= 2) return 'high';
    if (params.routeStructure || params.modelKind === 'route') return 'medium';
    return 'low';
  }
  if (params.kind === 'multi_location') {
    if (params.locations.length >= 2) return 'high';
    if (params.multiCue || params.modelKind === 'multi_location') return 'medium';
    return 'low';
  }
  if (params.kind === 'separate_occurrences') return 'high';
  if (params.kind === 'online' || params.kind === 'single_location') return 'high';
  return 'low';
}

export function classifySpatialEvent(
  input: ClassifySpatialEventInput
): SpatialEventClassification {
  const name = cleanText(input.name, 300);
  const description = String(input.description || '');
  const location = cleanText(input.location, 300);
  const combinedText = String(input.combinedText || '');
  const corpus = [name, description, location, combinedText].filter(Boolean).join('\n');
  const model = input.modelSpatialEvidence || null;
  const normalizedModelKind = modelKind(model?.kind);
  const modelLocations = Array.isArray(model?.locations)
    ? model.locations.map(locationFromModel).filter(Boolean) as SpatialLocationEvidence[]
    : [];
  const textLocations = [
    ...extractPrefixedLocations(corpus),
    ...extractInlineLabeledLocations(corpus),
    ...extractInlineRoleLocations(location),
    ...extractDatedCityLocations(corpus),
  ];
  const locations = dedupeLocations([...modelLocations, ...textLocations]);
  const confirmedStreets = uniqueStrings([
    ...(Array.isArray(model?.confirmedStreets) ? model.confirmedStreets : []),
    ...extractStreetSequence(corpus),
  ]).filter((street) => STREET_SUFFIX_PATTERN.test(street));

  const routeEvent = ROUTE_EVENT_PATTERN.test(`${name}\n${description}`);
  const routeStructure = ROUTE_STRUCTURE_PATTERN.test(corpus);
  const trafficNotice = TRAFFIC_NOTICE_PATTERN.test(corpus);
  const trafficNoticeHeadline = /\b(traffic|road|street)\s+(?:notice|advisory|closure|impact)\b/i.test(name);
  const nonEventTrafficNotice = trafficNotice && (trafficNoticeHeadline || !EVENT_OCCURRENCE_PATTERN.test(name));
  const multiCue = MULTI_LOCATION_PATTERN.test(corpus);
  // A schedule with many dates at one named venue is normal calendar data,
  // not an area event. Only retain separate-occurrence routing when there are
  // at least two distinct extracted places to split.
  const separateOccurrences = looksLikeSeparateLocationOccurrences(corpus) && locations.length >= 2;
  const online = ONLINE_PATTERN.test(corpus);
  const physical = PHYSICAL_LOCATION_PATTERN.test(corpus) || locations.length > 0;
  const hasRouteRoles = locations.some((entry) => entry.role === 'start') &&
    locations.some((entry) => entry.role === 'finish' || entry.role === 'stop');
  const allLocationsAreRooms = locations.length > 0 && locations.every((entry) => ROOM_PATTERN.test(entry.label));
  // A poster may list rooms, stages, or named performance spaces inside one
  // durable host. Those are useful event metadata, but they must not become
  // separate map pins. Requiring a specific host plus at least one obvious
  // sublocation avoids collapsing a genuine multi-venue festival.
  const locationsLookLikeHostSublocations = Boolean(location) &&
    DURABLE_HOST_PATTERN.test(location) &&
    locations.some((entry) => ROOM_PATTERN.test(entry.label)) &&
    locations.every((entry) =>
      !entry.address &&
      !STREET_SUFFIX_PATTERN.test(entry.label) &&
      !ADDRESS_SIGNAL_PATTERN.test(entry.label)
    );

  // Stage 3 is useful evidence, not an authority to turn ordinary listings
  // into area events. In particular, a flattened venue calendar has often
  // been labelled "separate_occurrences" despite containing neither two dated
  // place lines nor a real multi-site structure. Require source-visible
  // structure before honouring a non-venue model classification.
  const hasExplicitMultiplePlaces = locations.length >= 2 &&
    !allLocationsAreRooms &&
    !locationsLookLikeHostSublocations;
  const modelRouteIsSupported = normalizedModelKind === 'route' &&
    ((routeEvent && routeStructure) || hasRouteRoles || confirmedStreets.length > 0);
  const modelMultiLocationIsSupported = normalizedModelKind === 'multi_location' &&
    (multiCue || hasExplicitMultiplePlaces || modelLocations.length >= 2);
  const modelSeparateOccurrencesIsSupported =
    normalizedModelKind === 'separate_occurrences' && separateOccurrences;

  let kind: SpatialEventKind = 'unknown';
  if (separateOccurrences || modelSeparateOccurrencesIsSupported) {
    kind = 'separate_occurrences';
  } else if (online && !physical && !modelRouteIsSupported && !modelMultiLocationIsSupported) {
    kind = 'online';
  } else if (
    (modelRouteIsSupported || (routeEvent && (routeStructure || hasRouteRoles))) &&
    !nonEventTrafficNotice
  ) {
    kind = 'route';
  } else if (
    (modelMultiLocationIsSupported || multiCue || hasExplicitMultiplePlaces) &&
    !allLocationsAreRooms &&
    !locationsLookLikeHostSublocations
  ) {
    kind = 'multi_location';
  } else if (normalizedModelKind === 'single_location' || location || locations.length === 1) {
    kind = 'single_location';
  }

  const confidence = chooseConfidence({
    kind,
    modelKind: normalizedModelKind,
    locations,
    streets: confirmedStreets,
    routeStructure,
    multiCue,
  });
  const reviewReasons = new Set<string>();
  let routeEvidenceLevel: SpatialEventClassification['routeEvidenceLevel'];

  if (nonEventTrafficNotice) reviewReasons.add('traffic_notice_not_event');
  if (kind === 'route') {
    reviewReasons.add('route_candidate_requires_geometry_review');
    if (confirmedStreets.length >= 2 && locations.some((entry) => entry.role === 'start') &&
      locations.some((entry) => entry.role === 'finish')) {
      routeEvidenceLevel = 'official_full_route';
    } else if (confirmedStreets.length > 0) {
      routeEvidenceLevel = 'official_partial_route';
    } else if (locations.length > 0) {
      routeEvidenceLevel = 'stops_only';
    } else {
      routeEvidenceLevel = 'inferred';
      reviewReasons.add('route_missing_explicit_stops_or_streets');
    }
  }
  if (kind === 'multi_location') {
    reviewReasons.add('multi_location_requires_point_resolution');
    if (locations.length < 2) reviewReasons.add('multi_location_names_not_fully_extracted');
  }
  if (kind === 'separate_occurrences') {
    reviewReasons.add('split_location_occurrences_before_publication');
  }
  if (kind === 'online') reviewReasons.add('online_non_venue');
  if (kind === 'unknown' && trafficNotice) reviewReasons.add('traffic_notice_not_event');

  const ordered = kind === 'route' && Boolean(
    model?.ordered === true || confirmedStreets.length >= 2 ||
    (locations.length >= 2 && locations.some((entry) => entry.role !== 'location'))
  );

  return {
    version: 1,
    kind,
    representation:
      kind === 'route' ? 'route' :
        kind === 'multi_location' ? 'area' :
          kind === 'single_location' ? 'venue' : 'none',
    confidence,
    ordered,
    locations,
    confirmedStreets,
    routeEvidenceLevel,
    reviewReasons: Array.from(reviewReasons),
    evidenceNotes: cleanText(model?.evidenceNotes, 500) || undefined,
  };
}
