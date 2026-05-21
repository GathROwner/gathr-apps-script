/**
 * Row Processor
 * Handles individual row processing including GPT parsing and event creation
 */

import {
  RawRowData,
  EventData,
  RecurringWeekday,
  VenueData,
  ExtractedItem,
  ProcessingConfig,
  ParseSnapshotStage,
  MatchInfo,
} from '../types/index.js';
import {
  ParsePostInput,
  ProcessedEvent as ParserProcessedEvent,
  EstablishmentMap,
  ParsingConfig,
  OcrDebugSnapshot,
  GptUsageRecord,
  ParseSkipReason,
  ParseStageArtifactsSnapshot,
} from '../parsing/types.js';
import { parsePostData } from '../parsing/postParser.js';
import * as gptService from '../services/gptService.js';
import * as firestoreService from '../services/firestoreService.js';
import { logger } from '../utils/logger.js';
import {
  formatDate,
  normalizeTime,
  utcToLocal,
  calculateEndDate,
} from '../utils/dateTime.js';
import { createHash } from 'crypto';
import { normalizeVenueName, normalizeUrl, extractFacebookSlug } from '../utils/similarity.js';
import { getVenueAliasEntry } from '../services/venueAliases.js';
import { BatchManager } from './batchManager.js';

/**
 * Result of processing a single row
 */
export interface RowProcessingResult {
  success: boolean;
  rowIndex: number;
  eventsCreated: number;
  eventsUpdated: number;
  duplicateEvents: number;
  duplicateEventIds: string[];
  skipped: boolean;
  isDuplicate: boolean;
  isInvalid: boolean;
  error?: string;
  events?: EventData[];
}

function logTiming(
  step: string,
  startMs: number,
  details: Record<string, unknown> = {}
): void {
  logger.info('Timing', { step, durationMs: Date.now() - startMs, ...details });
}

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeDateOnlyCandidate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function meaningfulSelectionTokens(value: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'this',
    'that',
    'pei',
    'prince',
    'edward',
    'island',
    'charlottetown',
    'event',
  ]);

  return normalizeVenueName(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 4 && !stopWords.has(token));
}

function scoreFacebookEventScraperCandidate(
  event: ParserProcessedEvent,
  row: RawRowData,
  targetDate: string
): number {
  const eventName = String(event.name || '').trim();
  const eventText = normalizeVenueName([
    eventName,
    event.venue,
    event.establishment,
    event.additionalLocation,
    event.address,
    event.description,
  ].join(' '));
  const rowTitle = String(row.sharedPostText || '').trim();
  const normalizedRowTitle = normalizeVenueName(rowTitle);
  const rowLocationText = normalizeVenueName([
    row.userName,
    row.pageName,
    row.address,
  ].join(' '));

  let score = 0;
  if (targetDate) {
    score += normalizeDateOnlyCandidate(event.startDate) === targetDate ? 60 : -20;
  }

  if (normalizedRowTitle && eventText.includes(normalizedRowTitle)) {
    score += 40;
  }

  const titleTokens = meaningfulSelectionTokens(rowTitle);
  const sharedTitleTokens = titleTokens.filter(token => eventText.includes(token)).length;
  score += sharedTitleTokens * 8;

  const locationTokens = meaningfulSelectionTokens(rowLocationText);
  const sharedLocationTokens = locationTokens.filter(token => eventText.includes(token)).length;
  score += sharedLocationTokens * 10;

  if (rowLocationText.includes('charlottetown') && eventText.includes('charlottetown')) {
    score += 30;
  }

  if (
    rowLocationText.includes('charlottetown') &&
    /\b(sydney|fredericton|sarnia|aylmer|truro|wolfville|halifax|lunenburg|parrsboro|saint john|gardiner|portland|bradford|beverly|peterborough|sault ste marie)\b/.test(eventText)
  ) {
    score -= 80;
  }

  return score;
}

function selectSingleFacebookEventScraperEvent(
  events: ParserProcessedEvent[],
  row: RawRowData,
  rowIndex: number
): ParserProcessedEvent[] {
  if (row.sourceScraperType !== 'events' || events.length <= 1) {
    return events;
  }

  const targetDate = normalizeDateOnlyCandidate(row.utcStartDate || row.timestamp);
  const scored = events
    .map((event, index) => ({
      event,
      index,
      score: scoreFacebookEventScraperCandidate(event, row, targetDate),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored[0];

  if (!selected) {
    return events;
  }

  const selectedEvent = {
    ...selected.event,
    _pipelineIndex: 1,
    _pipelineTotalStage3: 1,
  };

  logger.warn('Facebook events scraper row produced multiple parser items; selected one', {
    rowIndex,
    uniqueId: row.uniqueId,
    targetDate,
    originalCount: events.length,
    selectedName: selectedEvent.name,
    selectedScore: selected.score,
  });

  return [selectedEvent];
}

function extractFacebookEventTextValue(text: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'im'));
  return String(match?.[1] || '').trim();
}

function inferFacebookEventCategory(row: RawRowData): ParserProcessedEvent['category'] {
  const text = normalizeVenueName([
    row.sharedPostText,
    row.text,
    row.userName,
    row.pageName,
  ].join(' '));

  if (/\b(concert|music|band|tribute|tour|singer|song|choir|acoustic)\b/.test(text)) {
    return 'Live Music';
  }
  if (/\b(circus|family|kids|children|parade|festival|farm day)\b/.test(text)) {
    return 'Family Friendly';
  }
  if (/\b(conference|workshop|class|seminar|training|lecture)\b/.test(text)) {
    return 'Workshops & Classes';
  }
  if (/\b(comedy|comedian)\b/.test(text)) {
    return 'Comedy';
  }
  if (/\b(movie|film|cinema)\b/.test(text)) {
    return 'Cinema';
  }
  if (/\b(game|hockey|soccer|baseball|football|sport)\b/.test(text)) {
    return 'Sports';
  }

  return 'Gatherings & Parties';
}

function getVenueDisplayNameForProcessing(venue?: VenueData | null): string {
  if (!venue) return '';
  const venueAny = venue as unknown as Record<string, unknown>;
  return String(
    venue.name ||
    venueAny.pagename ||
    venueAny.displayName ||
    venueAny.title ||
    ''
  ).trim();
}

function isCityLevelFacebookEventLocation(row: RawRowData): boolean {
  if (row.sourceScraperType !== 'events') {
    return false;
  }
  if (row.facebookEventLocationIsCityLevel === true) {
    return true;
  }

  const candidate = String(row.facebookEventLocationName || row.userName || '').trim();
  if (!candidate || /\d/.test(candidate)) {
    return false;
  }
  if (/\b(park|centre|center|hall|arena|stadium|theatre|theater|cafe|restaurant|bar|pub|club|church|school|hotel|inn|brewery|market)\b/i.test(candidate)) {
    return false;
  }

  const normalized = candidate
    .toLowerCase()
    .replace(/\bcanada\b/g, '')
    .replace(/\bprince edward island\b/g, 'pei')
    .replace(/\bp\.?e\.?i\.?\b/g, 'pei')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/,+$/g, '')
    .trim();

  return /^(pei|pe)$/.test(normalized) ||
    /^[a-z .'-]+,(pe|pei)$/.test(normalized) ||
    /^[a-z .'-]+ (pe|pei)$/.test(normalized);
}

function normalizeFacebookEventProvinceDisplay(value: string): string {
  const normalized = value.toLowerCase().replace(/\./g, '').trim();
  if (normalized === 'pe' || normalized === 'pei') return 'PEI';
  return value.toUpperCase();
}

function getCityLevelFacebookEventLocationDetails(row: RawRowData): {
  locationScope: 'city' | 'area';
  locationLabel: string;
  locationCity?: string;
  locationProvince?: string;
  locationPrecision: 'city_centroid' | 'approximate';
} | null {
  if (!isCityLevelFacebookEventLocation(row)) {
    return null;
  }

  const raw = String(row.facebookEventLocationName || row.userName || '').trim();
  const cleaned = raw
    .replace(/\bcanada\b/gi, '')
    .replace(/\bprince edward island\b/gi, 'PEI')
    .replace(/\bp\.?\s*e\.?\s*i\.?\b/gi, 'PEI')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,+$/g, '')
    .trim();
  const match = cleaned.match(/^(.+?)(?:,\s*|\s+)(PEI?|PE)$/i);
  if (match) {
    const city = match[1].trim();
    const province = normalizeFacebookEventProvinceDisplay(match[2]);
    return {
      locationScope: 'city',
      locationLabel: `${city}, ${province}`,
      locationCity: city,
      locationProvince: province,
      locationPrecision: 'city_centroid',
    };
  }

  const provinceOnly = cleaned.match(/^(PEI?|PE)$/i);
  if (provinceOnly) {
    const province = normalizeFacebookEventProvinceDisplay(provinceOnly[1]);
    return {
      locationScope: 'area',
      locationLabel: province,
      locationProvince: province,
      locationPrecision: 'approximate',
    };
  }

  return {
    locationScope: 'area',
    locationLabel: cleaned || raw,
    locationPrecision: 'approximate',
  };
}

function buildStructuredFacebookEventScraperEvents(
  row: RawRowData,
  establishment: string,
  mediaUrls: string[],
  matchedVenue?: VenueData | null
): ParserProcessedEvent[] | null {
  if (row.sourceScraperType !== 'events') {
    return null;
  }

  const title = String(row.sharedPostText || '').trim();
  const utcStartDate = String(row.utcStartDate || row.timestamp || '').trim();
  if (!title || !utcStartDate) {
    return null;
  }

  const localDateTime = utcToLocal(utcStartDate);
  if (!localDateTime.date) {
    return null;
  }

  const matchedVenueName = getVenueDisplayNameForProcessing(matchedVenue);
  const cityLevelLocation = getCityLevelFacebookEventLocationDetails(row);
  const venueName = String(
    matchedVenueName ||
    cityLevelLocation?.locationLabel ||
    row.userName ||
    row.pageName ||
    establishment ||
    ''
  ).trim();
  const normalizedMediaUrls = normalizeUrlList(mediaUrls);
  const primaryImageUrl = normalizedMediaUrls[0] || '';
  const ticketLink = extractFacebookEventTextValue(row.text, 'Ticket link');
  const ticketSummary = extractFacebookEventTextValue(row.text, 'Tickets');
  const cleanDescription = String(row.facebookEventDescription || row.text || title).trim();

  const event: ParserProcessedEvent = {
    id: row.uniqueId,
    uniqueId: row.uniqueId,
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    category: inferFacebookEventCategory(row),
    name: title,
    description: cleanDescription || title,
    establishment: venueName || establishment,
    address: String(row.address || '').trim(),
    startDate: localDateTime.date,
    endDate: localDateTime.date,
    startTime: localDateTime.time,
    endTime: '',
    ticketPrice: ticketSummary,
    ticketLink,
    ticketsBuyUrl: ticketLink || row.ticketsBuyUrl,
    relevantImageIndex: primaryImageUrl ? 0 : -1,
    venue: venueName || establishment,
    additionalLocation: '',
    isRecurring: false,
    recurringPattern: 'none',
    image: primaryImageUrl,
    relevantImageUrl: primaryImageUrl,
    mediaUrls: normalizedMediaUrls,
    utcStartDate,
    usersResponded: row.usersResponded,
    usersGoing: row.usersGoing,
    usersInterested: row.usersInterested,
    facebookUsersResponded: row.facebookUsersResponded,
    likes: row.likes,
    shares: row.shares,
    comments: row.comments,
    topReactionsCount: row.topReactionsCount,
    locationScope: matchedVenue ? 'venue' : cityLevelLocation?.locationScope,
    locationLabel: cityLevelLocation?.locationLabel,
    locationCity: cityLevelLocation?.locationCity,
    locationProvince: cityLevelLocation?.locationProvince,
    locationPrecision: matchedVenue ? 'exact' : cityLevelLocation?.locationPrecision,
    locationReviewStatus: cityLevelLocation ? 'needs_review' : undefined,
    _pipelineIndex: 1,
    _pipelineTotalStage3: 1,
    _sourceType: 'facebook_events_scraper_structured_row',
  };

  logger.info('Using structured Facebook Events scraper row adapter', {
    uniqueId: row.uniqueId,
    name: event.name,
    startDate: event.startDate,
    startTime: event.startTime,
    mediaCount: normalizedMediaUrls.length,
  });

  return [event];
}

function mergeStageArtifactsSnapshot(
  base: ParseStageArtifactsSnapshot | undefined,
  incoming: ParseStageArtifactsSnapshot
): ParseStageArtifactsSnapshot {
  const source = incoming.source || base?.source || 'live';
  const contentType = incoming.contentType || base?.contentType;
  const stage37TicketUrl = incoming.stage37TicketUrl || base?.stage37TicketUrl;
  const stage3Items = Array.isArray(incoming.stage3Items)
    ? deepCloneJson(incoming.stage3Items)
    : base?.stage3Items;
  const stage4Items = Array.isArray(incoming.stage4Items)
    ? deepCloneJson(incoming.stage4Items)
    : base?.stage4Items;

  return {
    source,
    contentType,
    stage3Items,
    stage4Items,
    stage37TicketUrl,
  };
}

function sanitizeStageArtifactsSnapshot(
  snapshot: ParseStageArtifactsSnapshot | undefined
): ParseStageArtifactsSnapshot | undefined {
  if (!snapshot) return undefined;
  const maxItemsRaw = Number(process.env.PARSE_SNAPSHOT_STAGE_ARTIFACT_MAX_ITEMS || 120);
  const maxItems = Number.isFinite(maxItemsRaw) && maxItemsRaw > 0 ? Math.floor(maxItemsRaw) : 120;

  const truncateItems = (items: unknown[] | undefined): unknown[] | undefined => {
    if (!Array.isArray(items)) return undefined;
    if (items.length <= maxItems) return items;
    return items.slice(0, maxItems);
  };

  return {
    source: snapshot.source,
    contentType: snapshot.contentType,
    stage37TicketUrl: snapshot.stage37TicketUrl,
    stage3Items: truncateItems(snapshot.stage3Items) as ParseStageArtifactsSnapshot['stage3Items'],
    stage4Items: truncateItems(snapshot.stage4Items) as ParseStageArtifactsSnapshot['stage4Items'],
  };
}

function deriveAggregatorNameForUnknownQueue(row: RawRowData): string | undefined {
  if (row.sourceScraperType === 'events') {
    const organizerName = String(row.facebookEventOrganizerName || '').trim();
    if (organizerName) return organizerName;
  }

  const direct = String(row.pageName || row.userName || '').trim();
  if (direct && !/^people$/i.test(direct)) {
    return direct;
  }

  const rawUrl = String(row.facebookUrl || '').trim();
  if (!rawUrl) {
    return direct || undefined;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) {
      return direct || undefined;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const first = (segments[0] || '').toLowerCase();

    // Facebook "people" URLs look like /people/The-Club/100054327258373
    // and should contribute the display-name segment, not "people".
    if (first === 'people' && segments.length >= 3) {
      const label = decodeURIComponent(String(segments[1] || ''))
        .replace(/[-_]+/g, ' ')
        .trim();
      if (label) return label;
    }

    if (first && first !== 'profile.php') {
      return decodeURIComponent(segments[0]).replace(/[-_]+/g, ' ').trim() || undefined;
    }
  } catch (_) {
    // Ignore malformed URLs and fall back to existing row labels.
  }

  return direct || undefined;
}

function isLikelyFacebookPostPermalink(rawUrl: string): boolean {
  const value = String(rawUrl || '').trim();
  if (!value) return false;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);
    if (!/(\.|^)facebook\.com$/i.test(parsed.hostname)) return false;
    const path = String(parsed.pathname || '').toLowerCase();
    if (!path || path === '/' || /^\/[a-z0-9._-]+\/?$/i.test(path)) {
      return false;
    }
    if (path.includes('/posts/')) return true;
    if (path.includes('/events/')) return true;
    if (path.includes('/videos/')) return true;
    if (path.includes('/photos/')) return true;
    if (path.includes('/reel/')) return true;
    if (path.includes('/permalink.php')) return true;
    if (path.includes('/story.php')) return true;
    return false;
  } catch {
    return false;
  }
}

function deriveTopLevelPostUrlForUnknownQueue(row: RawRowData): string | undefined {
  const topLevel = String(row.topLevelUrl || '').trim();
  if (isLikelyFacebookPostPermalink(topLevel)) return topLevel;

  const facebookUrl = String(row.facebookUrl || '').trim();
  return isLikelyFacebookPostPermalink(facebookUrl) ? facebookUrl : undefined;
}

const UNKNOWN_QUEUE_ADDRESS_KEYS = [
  'address',
  'venueAddress',
  'normalizedVenueAddress',
  'normalizedAddress',
  'fullAddress',
  'formattedAddress',
  'location',
  'venueLocation',
  'aggregatorAddress',
  'rowAddress',
] as const;

function normalizeAggregatorAddressForUnknownQueue(value: unknown): string | undefined {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return undefined;
  if (raw.length < 8 || raw.length > 220) return undefined;
  if (/^https?:\/\//i.test(raw)) return undefined;

  const looksPostal = /\b[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d\b/.test(raw);
  const looksProvince = /\b(PE|PEI|NS|NB|NL|ON|QC|AB|BC|SK|MB)\b/i.test(raw);
  const looksStreet = /\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|route|rte|place|pl|terrace|ter)\b/i.test(raw);
  const hasStreetNumber = /\b\d{1,6}\b/.test(raw);

  if (!((hasStreetNumber && looksStreet) || (looksPostal && looksStreet) || (looksStreet && looksProvince))) {
    return undefined;
  }

  return raw.replace(/[;:.]+$/g, '').trim() || undefined;
}

function deriveAggregatorAddressForUnknownQueue(row: RawRowData): string | undefined {
  const rowAny = row as unknown as Record<string, unknown>;

  for (const key of UNKNOWN_QUEUE_ADDRESS_KEYS) {
    const normalized = normalizeAggregatorAddressForUnknownQueue(rowAny[key]);
    if (normalized) return normalized;
  }

  return undefined;
}

async function queueCityLevelFacebookEventForReview(params: {
  row: RawRowData;
  rowIndex: number;
  batchManager: BatchManager;
  parserMode: 'legacy' | 'full5stage';
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  endDate?: string;
  endTime?: string;
  eventType?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  mediaUrls?: string[];
  usersResponded?: string;
  usersGoing?: string;
  usersInterested?: string;
  facebookUsersResponded?: string;
  likes?: number;
  shares?: number;
  comments?: number;
  topReactionsCount?: number;
  ticketsBuyUrl?: string;
  externalLinks?: string[];
}): Promise<void> {
  const location = getCityLevelFacebookEventLocationDetails(params.row);
  if (!location) return;

  try {
    const state = params.batchManager.getState();
    const result = await firestoreService.queueCityLevelEventReview({
      uniqueId: params.row.uniqueId,
      fileId: state.fileId,
      fileName: state.fileName,
      rowIndex: params.rowIndex,
      parserMode: params.parserMode,
      eventName: params.eventName,
      eventDate: params.eventDate,
      eventTime: params.eventTime,
      endDate: params.endDate,
      endTime: params.endTime,
      eventType: params.eventType,
      category: params.category,
      description: params.description,
      imageUrl: params.imageUrl,
      mediaUrls: params.mediaUrls,
      usersResponded: params.usersResponded,
      usersGoing: params.usersGoing,
      usersInterested: params.usersInterested,
      facebookUsersResponded: params.facebookUsersResponded,
      likes: params.likes,
      shares: params.shares,
      comments: params.comments,
      topReactionsCount: params.topReactionsCount,
      ticketsBuyUrl: params.ticketsBuyUrl,
      externalLinks: params.externalLinks,
      locationLabel: location.locationLabel,
      locationCity: location.locationCity,
      locationProvince: location.locationProvince,
      locationScope: location.locationScope,
      locationPrecision: location.locationPrecision,
      organizerName: String(params.row.facebookEventOrganizerName || '').trim() || undefined,
      facebookUrl: String(params.row.facebookUrl || '').trim() || undefined,
      topLevelUrl: deriveTopLevelPostUrlForUnknownQueue(params.row),
      sourceScraperType: params.row.sourceScraperType,
    });

    if (!result.queued) {
      logger.debug('City-level event candidate not queued', {
        rowIndex: params.rowIndex,
        locationLabel: location.locationLabel,
        reason: result.reason,
      });
    }
  } catch (error) {
    logger.warn('Failed to queue city-level event candidate', {
      rowIndex: params.rowIndex,
      locationLabel: location.locationLabel,
      eventName: params.eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function queueUnknownVenueForReview(params: {
  venueName: string;
  source: 'row_establishment' | 'item_candidate' | 'full5stage_event';
  parserMode: 'legacy' | 'full5stage';
  row: RawRowData;
  rowIndex: number;
  batchManager: BatchManager;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  description?: string;
}): Promise<void> {
  const venueName = String(params.venueName || '').trim();
  if (!venueName) return;

  try {
    const state = params.batchManager.getState();
    const result = await firestoreService.queueUnrecognizedVenue({
      venueName,
      source: params.source,
      parserMode: params.parserMode,
      rowIndex: params.rowIndex,
      fileId: state.fileId,
      fileName: state.fileName,
      aggregatorName: deriveAggregatorNameForUnknownQueue(params.row),
      aggregatorFacebookUrl: String(params.row.facebookUrl || '').trim() || undefined,
      aggregatorAddress: deriveAggregatorAddressForUnknownQueue(params.row),
      topLevelUrl: deriveTopLevelPostUrlForUnknownQueue(params.row),
      eventName: params.eventName,
      eventDate: params.eventDate,
      eventTime: params.eventTime,
      description: params.description,
    });

    if (!result.queued) {
      logger.debug('Unknown venue candidate not queued', {
        rowIndex: params.rowIndex,
        venueName,
        source: params.source,
        parserMode: params.parserMode,
        reason: result.reason,
        testMode: result.testMode,
      });
    }
  } catch (error) {
    logger.warn('Failed to queue unknown venue candidate', {
      rowIndex: params.rowIndex,
      venueName,
      source: params.source,
      parserMode: params.parserMode,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Process a single row from the dataset
 */
export async function processRow(
  row: RawRowData,
  rowIndex: number,
  batchManager: BatchManager,
  config?: Partial<ProcessingConfig>
): Promise<RowProcessingResult> {
  const result: RowProcessingResult = {
    success: false,
    rowIndex,
    eventsCreated: 0,
    eventsUpdated: 0,
    duplicateEvents: 0,
    duplicateEventIds: [],
    skipped: false,
    isDuplicate: false,
    isInvalid: false,
    events: [],
  };

  try {
    // Combine text content
    const combinedText = [row.sharedPostText, row.text, row.ocrText ? `OCR TEXT:\n${row.ocrText}` : '']
      .filter(Boolean)
      .join('\n\n');
    const hasMediaContent =
      (Array.isArray(row.mediaUrls) &&
        row.mediaUrls.some((url) => String(url || '').trim().length > 0)) ||
      (Array.isArray(row.sharedPostThumbnails) &&
        row.sharedPostThumbnails.some((url) => String(url || '').trim().length > 0));

    if (!combinedText.trim() && !hasMediaContent) {
      result.isInvalid = true;
      result.error = 'No text content';
      batchManager.markRowInvalid(rowIndex, 'No text content');
      return result;
    }

    // Determine establishment from page name or user name
    let establishment = selectEstablishment(row.pageName, row.userName);
    if (!establishment) {
      result.isInvalid = true;
      result.error = 'No establishment name';
      batchManager.markRowInvalid(rowIndex, 'No establishment name');
      return result;
    }

    const parserMode = config?.parserMode || 'legacy';

    const cityLevelFacebookEventLocation = isCityLevelFacebookEventLocation(row);

    // Find matching venue
    let venueMatch: MatchInfo = {
      isMatch: false,
      matchType: 'none',
      similarity: 0,
    };
    if (cityLevelFacebookEventLocation) {
      logger.info('Skipping row-level venue match for city-level Facebook Event location', {
        rowIndex,
        establishment,
        locationName: row.facebookEventLocationName || row.userName,
        organizerName: row.facebookEventOrganizerName,
      });
    } else {
      const venueMatchStart = Date.now();
      venueMatch = await firestoreService.findMatchingVenue(
        establishment,
        row.facebookUrl
      );
      logTiming('venue_match_row', venueMatchStart, {
        rowIndex,
        establishment,
        hasFacebookUrl: Boolean(row.facebookUrl),
        matched: venueMatch.isMatch,
      });
    }

    if (!cityLevelFacebookEventLocation && !venueMatch.isMatch && row.sourceScraperType === 'events' && String(row.address || '').trim()) {
      const addressMatchStart = Date.now();
      const addressMatch = await firestoreService.findVenueByAddress(String(row.address || '').trim());
      logTiming('venue_match_row_address', addressMatchStart, {
        rowIndex,
        establishment,
        address: row.address,
        matched: addressMatch.isMatch,
        matchedVenueId: addressMatch.matchedVenue?.id,
      });

      if (addressMatch.isMatch && addressMatch.matchedVenue) {
        venueMatch = addressMatch;
        const matchedName = getVenueDisplayNameForProcessing(addressMatch.matchedVenue);
        if (matchedName) {
          establishment = matchedName;
        }
      }
    }

    const venue = venueMatch.isMatch ? venueMatch.matchedVenue! : null;
    const matchedVenueId = venue?.id;

    if (!venueMatch.isMatch && cityLevelFacebookEventLocation) {
      logger.debug('Skipping unknown-venue queue for city-level Facebook Event location', {
        rowIndex,
        establishment,
        locationName: row.facebookEventLocationName || row.userName,
        organizerName: row.facebookEventOrganizerName,
      });
    } else if (!venueMatch.isMatch) {
      logger.debug('No venue match found for row-level establishment', {
        rowIndex,
        establishment,
        facebookUrl: row.facebookUrl,
      });
      await queueUnknownVenueForReview({
        venueName: establishment,
        source: 'row_establishment',
        parserMode,
        row,
        rowIndex,
        batchManager,
        description: combinedText,
      });
    }

    // Parse content using GPT pipeline
    const enableSnapshots = process.env.ENABLE_PARSE_SNAPSHOTS !== 'false';
    const enableOcrDebug = process.env.ENABLE_OCR_DEBUG !== 'false';
    const enableStageArtifacts = process.env.ENABLE_PARSE_SNAPSHOT_STAGE_ARTIFACTS === 'true';
    const snapshotStages: ParseSnapshotStage[] = [];
    const snapshotHandler = enableSnapshots
      ? (stage: ParseSnapshotStage) => {
          snapshotStages.push(stage);
        }
      : undefined;

    const isDryRun = config?.dryRun === true;

    if (parserMode === 'full5stage') {
      let parserMediaUrls = normalizeUrlList(row.mediaUrls);
      const parserSharedPostThumbnails = normalizeUrlList(row.sharedPostThumbnails);
      const hasUsableParserMedia =
        parserMediaUrls.length > 0 || parserSharedPostThumbnails.length > 0;
      if (venue && !hasUsableParserMedia) {
        const fallbackMediaUrls = await firestoreService.findVenueManagedMediaFallbacks(
          venue.id,
          combinedText,
          {
            limit: 4,
            facebookUrl: row.facebookUrl,
          }
        );
        if (fallbackMediaUrls.length > 0) {
          parserMediaUrls = mergeUniqueUrls(fallbackMediaUrls, parserMediaUrls).slice(0, 4);
          logger.info('Recovered managed media for parser rerun', {
            rowIndex,
            venueId: venue.id,
            originalMediaCount: normalizeUrlList(row.mediaUrls).length,
            fallbackMediaCount: fallbackMediaUrls.length,
          });
        }
      }

      const fullParserInput: ParsePostInput = {
        combinedText,
        // Dry-run mode now enables OCR with image-safe retries inside the parser.
        mediaUrls: parserMediaUrls,
        sharedPostThumbnails: parserSharedPostThumbnails,
        userName: row.userName || establishment,
        pageName: row.pageName || establishment,
        timestamp: row.timestamp || '',
        facebookUrl: row.facebookUrl || '',
        profilePicUrl: selectParserProfilePicUrl(row, venue),
        extractedData: {
          id: row.uniqueId || '',
          postId: row.uniqueId || '',
          utcStartDate: row.utcStartDate || '',
          usersResponded: row.usersResponded || '',
          usersGoing: row.usersGoing || '',
          usersInterested: row.usersInterested || '',
          facebookUsersResponded: row.facebookUsersResponded || '',
          ticketsBuyUrl: row.ticketsBuyUrl || '',
          likes: row.likes,
          shares: row.shares,
          comments: row.comments,
          topReactionsCount: row.topReactionsCount,
        },
      };

      const establishmentMap: EstablishmentMap = {};
      if (row.facebookUrl && venue) {
        establishmentMap[row.facebookUrl] = {
          address: venue.address || '',
          category: venue.category || '',
          facebookUrl: row.facebookUrl,
          name: venue.name || establishment,
          website: venue.website || '',
        };
      }

      let ocrDebugSnapshot: OcrDebugSnapshot | undefined;
      const gptUsageRecords: GptUsageRecord[] = [];
      let parserSkipReason: ParseSkipReason | undefined;
      let stageArtifactsSnapshot: ParseStageArtifactsSnapshot | undefined;
      const parserConfig: Partial<ParsingConfig> = {
        skipReasonHandler: (skipReason: ParseSkipReason) => {
          parserSkipReason = skipReason;
        },
        gptUsageHandler: (usage: GptUsageRecord) => {
          gptUsageRecords.push(usage);
        },
      };
      if (enableStageArtifacts) {
        parserConfig.stageArtifactsHandler = (snapshot: ParseStageArtifactsSnapshot) => {
          stageArtifactsSnapshot = mergeStageArtifactsSnapshot(stageArtifactsSnapshot, snapshot);
        };
      }
      if (enableOcrDebug) {
        parserConfig.ocrDebugHandler = (snapshot: OcrDebugSnapshot) => {
          ocrDebugSnapshot = snapshot;
        };
      }
      if (config?.gptModelFast) {
        parserConfig.gptModelFast = config.gptModelFast;
      }
      if (config?.gptModelReasoning) {
        parserConfig.gptModelReasoning = config.gptModelReasoning;
      }

      const parseStart = Date.now();
      let fullParserEvents = buildStructuredFacebookEventScraperEvents(
        row,
        establishment,
        parserMediaUrls,
        venue
      );
      if (fullParserEvents) {
        logTiming('parse_facebook_events_structured_row', parseStart, {
          rowIndex,
          extractedCount: fullParserEvents.length,
          sourceScraperType: row.sourceScraperType,
        });
      } else {
        fullParserEvents = await parsePostData(
          fullParserInput,
          establishmentMap,
          parserConfig
        );
        fullParserEvents = selectSingleFacebookEventScraperEvent(fullParserEvents, row, rowIndex);
      }
      logTiming('parse_full5stage', parseStart, {
        rowIndex,
        extractedCount: fullParserEvents.length,
        sourceScraperType: row.sourceScraperType,
      });

      if (fullParserEvents.length === 0) {
        const gptUsageSummary = summarizeGptUsageRecords(gptUsageRecords);
        const skipReason = parserSkipReason?.reason || 'No events extracted';
        const skipDetail = parserSkipReason?.detail || '';
        result.skipped = true;
        result.error = skipDetail ? `${skipReason}: ${skipDetail}` : skipReason;
        batchManager.markRowSkipped(rowIndex, skipReason);

        if (enableSnapshots) {
          const state = batchManager.getState();
          const persistedStageArtifacts = enableStageArtifacts
            ? sanitizeStageArtifactsSnapshot(stageArtifactsSnapshot)
            : undefined;
          await firestoreService.saveParseSnapshot({
            fileId: state.fileId,
            fileName: state.fileName,
            batchNumber: state.batchNumber,
            rowIndex,
            uniqueId: row.uniqueId,
            venueId: matchedVenueId,
            establishment,
            facebookUrl: row.facebookUrl,
            inputText: combinedText,
            rowMeta: {
          pageName: row.pageName,
          userName: row.userName,
          facebookEventLocationName: row.facebookEventLocationName,
          facebookEventLocationIsCityLevel: row.facebookEventLocationIsCityLevel,
          facebookEventOrganizerName: row.facebookEventOrganizerName,
          timestamp: row.timestamp,
          utcStartDate: row.utcStartDate,
          mediaUrls: parserMediaUrls,
              parserMode: 'full5stage',
              dryRun: isDryRun,
            },
            stages: [
              {
                stage: 'format',
                success: true,
                output: {
                  parserMode: 'full5stage',
                dryRun: isDryRun,
                eventCount: 0,
                events: [],
                ocrDebug: ocrDebugSnapshot,
                gptUsageSummary,
                skipReason: parserSkipReason || null,
                stageArtifacts: persistedStageArtifacts,
              },
            },
            ],
            error: result.error,
          });
        }
        return result;
      }

      if (!isDryRun) {
        let newFoodSpecialsCreated = 0;
        let newStandardEventsCreated = 0;
        let updatedFoodSpecials = 0;
        let updatedStandardEvents = 0;

        for (let index = 0; index < fullParserEvents.length; index++) {
          const fullParserEvent = fullParserEvents[index];
          const eventResult = await processFullParserEvent(
            fullParserEvent,
            row,
            rowIndex,
            index,
            venue,
            establishment,
            batchManager
          );

          if (eventResult.created) {
            result.eventsCreated++;
            if (isFoodSpecialEvent(eventResult.event)) {
              newFoodSpecialsCreated++;
            } else {
              newStandardEventsCreated++;
            }
            if (eventResult.event) {
              result.events!.push(eventResult.event);
              batchManager.addCurrentRunEntry(eventResult.event);
            }
          } else if (eventResult.updated) {
            result.eventsUpdated++;
            if (isFoodSpecialEvent(eventResult.event)) {
              updatedFoodSpecials++;
            } else {
              updatedStandardEvents++;
            }
          } else if (eventResult.isDuplicate) {
            result.isDuplicate = true;
            result.duplicateEvents++;
            batchManager.incrementStat('duplicateCount');
            if (eventResult.duplicateEventId) {
              result.duplicateEventIds.push(eventResult.duplicateEventId);
            }
          }
        }

        if (result.eventsCreated > 0) {
          batchManager.incrementNewEvents(result.eventsCreated);
        }
        if (result.eventsUpdated > 0) {
          batchManager.incrementUpdatedEvents(result.eventsUpdated);
        }
        if (newStandardEventsCreated > 0) {
          batchManager.incrementNewStandardEvents(newStandardEventsCreated);
        }
        if (updatedStandardEvents > 0) {
          batchManager.incrementUpdatedStandardEvents(updatedStandardEvents);
        }
        if (newFoodSpecialsCreated > 0) {
          batchManager.incrementNewFoodSpecials(newFoodSpecialsCreated);
        }
        if (updatedFoodSpecials > 0) {
          batchManager.incrementUpdatedFoodSpecials(updatedFoodSpecials);
        }
      }

      result.success = true;
      batchManager.markRowProcessed(rowIndex);

      logger.logRowResult(rowIndex, 'processed', {
        parserMode: 'full5stage',
        dryRun: isDryRun,
        extractedCount: fullParserEvents.length,
        eventsCreated: result.eventsCreated,
        eventsUpdated: result.eventsUpdated,
        duplicateEvents: result.duplicateEvents,
        duplicateEventIds: result.duplicateEventIds,
        reason:
          result.eventsCreated === 0 && result.eventsUpdated === 0 && result.duplicateEvents > 0
            ? `duplicate-only: ${result.duplicateEvents} item(s)`
            : undefined,
        establishment,
      });

      if (enableSnapshots) {
        const gptUsageSummary = summarizeGptUsageRecords(gptUsageRecords);
        const state = batchManager.getState();
        const persistedStageArtifacts = enableStageArtifacts
          ? sanitizeStageArtifactsSnapshot(stageArtifactsSnapshot)
          : undefined;
        await firestoreService.saveParseSnapshot({
          fileId: state.fileId,
          fileName: state.fileName,
          batchNumber: state.batchNumber,
          rowIndex,
          uniqueId: row.uniqueId,
            venueId: matchedVenueId,
            establishment,
            facebookUrl: row.facebookUrl,
            inputText: combinedText,
          rowMeta: {
            pageName: row.pageName,
            userName: row.userName,
            facebookEventLocationName: row.facebookEventLocationName,
            facebookEventLocationIsCityLevel: row.facebookEventLocationIsCityLevel,
            facebookEventOrganizerName: row.facebookEventOrganizerName,
            timestamp: row.timestamp,
            utcStartDate: row.utcStartDate,
            mediaUrls: parserMediaUrls,
            parserMode: 'full5stage',
            dryRun: isDryRun,
          },
          stages: [
            {
              stage: 'format',
              success: true,
              output: {
                parserMode: 'full5stage',
                dryRun: isDryRun,
                eventCount: fullParserEvents.length,
                events: summarizeFullParserEvents(fullParserEvents),
                ocrDebug: ocrDebugSnapshot,
                gptUsageSummary,
                stageArtifacts: persistedStageArtifacts,
              },
            },
          ],
        });
      }

      return result;
    }

    const parseStart = Date.now();
    const parseResult = await gptService.parseContent(
      combinedText,
      establishment,
      config,
      snapshotHandler
    );
    logTiming('parse_legacy', parseStart, {
      rowIndex,
      success: parseResult.success,
      extractedCount: parseResult.data?.length || 0,
    });

    if (!parseResult.success) {
      result.error = parseResult.error;
      batchManager.markRowError(rowIndex, parseResult.error || 'Parse failed');
      if (enableSnapshots && snapshotStages.length > 0) {
        const state = batchManager.getState();
        await firestoreService.saveParseSnapshot({
          fileId: state.fileId,
          fileName: state.fileName,
          batchNumber: state.batchNumber,
          rowIndex,
          uniqueId: row.uniqueId,
          venueId: matchedVenueId,
          establishment,
          facebookUrl: row.facebookUrl,
          inputText: combinedText,
          rowMeta: {
            pageName: row.pageName,
            userName: row.userName,
            timestamp: row.timestamp,
            utcStartDate: row.utcStartDate,
            mediaUrls: row.mediaUrls,
          },
          stages: snapshotStages,
          error: parseResult.error || 'Parse failed',
        });
      }
      return result;
    }

    const extractedItems = parseResult.data || [];

    if (extractedItems.length === 0) {
      result.skipped = true;
      result.error = parseResult.error || 'No events extracted';
      batchManager.markRowSkipped(rowIndex, 'No events extracted');
      if (enableSnapshots && snapshotStages.length > 0) {
        const state = batchManager.getState();
        await firestoreService.saveParseSnapshot({
          fileId: state.fileId,
          fileName: state.fileName,
          batchNumber: state.batchNumber,
          rowIndex,
          uniqueId: row.uniqueId,
          venueId: matchedVenueId,
          establishment,
          facebookUrl: row.facebookUrl,
          inputText: combinedText,
          rowMeta: {
            pageName: row.pageName,
            userName: row.userName,
            timestamp: row.timestamp,
            utcStartDate: row.utcStartDate,
            mediaUrls: row.mediaUrls,
          },
          stages: snapshotStages,
          error: parseResult.error || 'No events extracted',
        });
      }
      return result;
    }

    const allowPerItemVenueMatch = !venue;

    // Process each extracted item
    let newFoodSpecialsCreated = 0;
    let newStandardEventsCreated = 0;
    let updatedFoodSpecials = 0;
    let updatedStandardEvents = 0;

    for (const item of extractedItems) {
      const candidateVenue = getItemVenueName(item);
      const aliasEntry = candidateVenue ? getVenueAliasEntry(candidateVenue) : null;
      const subVenueName = aliasEntry?.isSubVenue ? candidateVenue : '';

      let itemVenue = venue;

      if (!itemVenue && allowPerItemVenueMatch) {
        if (!candidateVenue) {
          const itemAny = item as unknown as Record<string, unknown>;
          logger.debug('Skipping item without venue name', {
            rowIndex,
            itemName: itemAny.name || '',
          });
          continue;
        }

        const useUrl =
          row.facebookUrl &&
          normalizeVenueName(candidateVenue) === normalizeVenueName(establishment);

        const itemMatchStart = Date.now();
        const itemMatch = await firestoreService.findMatchingVenue(
          candidateVenue,
          useUrl ? row.facebookUrl : undefined
        );
        logTiming('venue_match_item', itemMatchStart, {
          rowIndex,
          candidateVenue,
          hasFacebookUrl: Boolean(useUrl && row.facebookUrl),
          matched: itemMatch.isMatch,
        });

        if (!itemMatch.isMatch || !itemMatch.matchedVenue) {
          const itemAny = item as unknown as Record<string, unknown>;
          logger.debug('No venue match found for extracted item', {
            rowIndex,
            itemName: itemAny.name || '',
            candidateVenue,
          });
          await queueUnknownVenueForReview({
            venueName: candidateVenue,
            source: 'item_candidate',
            parserMode: 'legacy',
            row,
            rowIndex,
            batchManager,
            eventName: String(itemAny.name || itemAny.eventName || '').trim() || undefined,
            eventDate: String(itemAny.startDate || '').trim() || undefined,
            eventTime: String(itemAny.startTime || '').trim() || undefined,
            description: String(itemAny.description || '').trim() || undefined,
          });
          continue;
        }

        itemVenue = itemMatch.matchedVenue;
      }

      if (!itemVenue) {
        const itemAny = item as unknown as Record<string, unknown>;
        logger.debug('Skipping item without resolved venue', {
          rowIndex,
          itemName: itemAny.name || '',
        });
        continue;
      }

      const eventResult = await processExtractedItem(
        item,
        row,
        rowIndex,
        itemVenue,
        batchManager,
        subVenueName
      );

      if (eventResult.created) {
        result.eventsCreated++;
        if (isFoodSpecialEvent(eventResult.event)) {
          newFoodSpecialsCreated++;
        } else {
          newStandardEventsCreated++;
        }
        if (eventResult.event) {
          result.events!.push(eventResult.event);
          batchManager.addCurrentRunEntry(eventResult.event);
        }
      } else if (eventResult.updated) {
        result.eventsUpdated++;
        if (isFoodSpecialEvent(eventResult.event)) {
          updatedFoodSpecials++;
        } else {
          updatedStandardEvents++;
        }
      } else if (eventResult.isDuplicate) {
        result.isDuplicate = true;
        result.duplicateEvents++;
        batchManager.incrementStat('duplicateCount');
        if (eventResult.duplicateEventId) {
          result.duplicateEventIds.push(eventResult.duplicateEventId);
        }
      }
    }

    // Update batch manager stats
    if (result.eventsCreated > 0) {
      batchManager.incrementNewEvents(result.eventsCreated);
    }
    if (result.eventsUpdated > 0) {
      batchManager.incrementUpdatedEvents(result.eventsUpdated);
    }
    if (newStandardEventsCreated > 0) {
      batchManager.incrementNewStandardEvents(newStandardEventsCreated);
    }
    if (updatedStandardEvents > 0) {
      batchManager.incrementUpdatedStandardEvents(updatedStandardEvents);
    }
    if (newFoodSpecialsCreated > 0) {
      batchManager.incrementNewFoodSpecials(newFoodSpecialsCreated);
    }
    if (updatedFoodSpecials > 0) {
      batchManager.incrementUpdatedFoodSpecials(updatedFoodSpecials);
    }

    result.success = true;
    batchManager.markRowProcessed(rowIndex);

    logger.logRowResult(rowIndex, 'processed', {
      eventsCreated: result.eventsCreated,
      eventsUpdated: result.eventsUpdated,
      duplicateEvents: result.duplicateEvents,
      duplicateEventIds: result.duplicateEventIds,
      reason:
        result.eventsCreated === 0 && result.eventsUpdated === 0 && result.duplicateEvents > 0
          ? `duplicate-only: ${result.duplicateEvents} item(s)`
          : undefined,
      establishment,
    });

    if (enableSnapshots && snapshotStages.length > 0) {
      const state = batchManager.getState();
      await firestoreService.saveParseSnapshot({
        fileId: state.fileId,
        fileName: state.fileName,
        batchNumber: state.batchNumber,
        rowIndex,
        uniqueId: row.uniqueId,
        venueId: matchedVenueId,
        establishment,
        facebookUrl: row.facebookUrl,
        inputText: combinedText,
        rowMeta: {
          pageName: row.pageName,
          userName: row.userName,
          timestamp: row.timestamp,
          utcStartDate: row.utcStartDate,
          mediaUrls: row.mediaUrls,
        },
        stages: snapshotStages,
      });
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    batchManager.markRowError(rowIndex, error instanceof Error ? error : String(error));

    const enableSnapshots = process.env.ENABLE_PARSE_SNAPSHOTS !== 'false';
    if (enableSnapshots) {
      const state = batchManager.getState();
      await firestoreService.saveParseSnapshot({
        fileId: state.fileId,
        fileName: state.fileName,
        batchNumber: state.batchNumber,
        rowIndex,
        uniqueId: row.uniqueId,
        establishment: selectEstablishment(row.pageName, row.userName),
        facebookUrl: row.facebookUrl,
        inputText: [row.sharedPostText, row.text].filter(Boolean).join('\n\n'),
        rowMeta: {
          pageName: row.pageName,
          userName: row.userName,
          timestamp: row.timestamp,
          utcStartDate: row.utcStartDate,
          mediaUrls: row.mediaUrls,
        },
        stages: [],
        error: result.error,
      });
    }
    return result;
  }
}

function selectEstablishment(pageName?: string, userName?: string): string {
  const page = (pageName || '').trim();
  const user = (userName || '').trim();

  if (!page && !user) return '';
  if (!page) return user;
  if (!user) return page;

  if (page.toLowerCase() === user.toLowerCase()) {
    return user;
  }

  const pageHasSpace = /\s/.test(page);
  const userHasSpace = /\s/.test(user);
  const pageLooksHandle = !pageHasSpace && /^[a-z0-9._-]+$/i.test(page);

  if (pageLooksHandle && userHasSpace) {
    return user;
  }

  if (userHasSpace && user.length - page.length >= 4) {
    return user;
  }

  return page;
}

function getItemVenueName(item: ExtractedItem): string {
  const raw = item as unknown as Record<string, unknown>;
  const venue = String(raw.venue || '').trim();
  if (venue) return venue;
  const additional = String(raw.additionalLocation || '').trim();
  if (additional) return additional;
  return '';
}

const FOOD_SPECIAL_CATEGORIES = new Set([
  'happy hour',
  'wing night',
  'food special',
  'drink special',
]);
const CATEGORY_ALIAS_NORMALIZATIONS: Record<string, string> = {
  'dj/nightlife': 'Live Music',
  'open mic': 'Live Music',
};

function normalizeCategoryAlias(category?: string): string {
  const raw = String(category || '').trim();
  if (!raw) return '';
  return CATEGORY_ALIAS_NORMALIZATIONS[raw.toLowerCase()] || raw;
}

function isFoodSpecialCategory(category?: string): boolean {
  const normalized = String(category || '').trim().toLowerCase();
  if (!normalized) return false;
  return FOOD_SPECIAL_CATEGORIES.has(normalized);
}

function isFoodSpecialEvent(
  event?: Pick<EventData, 'eventType' | 'isFoodSpecial' | 'category'>
): boolean {
  if (!event) return false;
  if (normalizeFlagState(event.isFoodSpecial) === 'yes') return true;
  const eventType = String(event.eventType || '').trim().toLowerCase();
  if (eventType === 'food_special') return true;
  return isFoodSpecialCategory(event.category);
}

function normalizeCategoryToEventType(category?: string): string {
  const raw = normalizeCategoryAlias(String(category || '').trim());
  if (!raw) return 'event';
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'event'
  );
}

function enforceCategoryTypeConsistency(
  event: Pick<EventData, 'category' | 'isEvent' | 'isFoodSpecial' | 'eventType'>
): void {
  const category = String(event.category || '').trim();
  if (!category) return;

  const shouldBeFoodSpecial = isFoodSpecialCategory(category);
  const desiredIsEventState = shouldBeFoodSpecial ? 'no' : 'yes';
  const desiredIsFoodSpecialState = shouldBeFoodSpecial ? 'yes' : 'no';

  if (normalizeFlagState(event.isEvent) !== desiredIsEventState) {
    event.isEvent = !shouldBeFoodSpecial;
  }
  if (normalizeFlagState(event.isFoodSpecial) !== desiredIsFoodSpecialState) {
    event.isFoodSpecial = shouldBeFoodSpecial;
  }

  const currentEventType = String(event.eventType || '').trim().toLowerCase();
  if (shouldBeFoodSpecial) {
    if (currentEventType !== 'food_special') {
      event.eventType = 'food_special';
    }
    return;
  }

  if (!currentEventType || currentEventType === 'food_special') {
    event.eventType = normalizeCategoryToEventType(category);
  }
}

function normalizeFullParserEventType(item: ParserProcessedEvent): string {
  const raw = normalizeCategoryAlias(String(item.category || '').trim());
  if (!raw) {
    if (String(item.isFoodSpecial || '').trim().toLowerCase() === 'yes') {
      return 'food_special';
    }
    return 'event';
  }
  if (isFoodSpecialCategory(raw)) {
    return 'food_special';
  }
  return normalizeCategoryToEventType(raw);
}

async function resolveVenueForFullParserEvent(
  item: ParserProcessedEvent,
  rowVenue: VenueData | null,
  row: RawRowData,
  establishment: string,
  rowIndex: number
): Promise<VenueData | null> {
  // Get the event's own establishment/venue names
  const itemEstablishment = String(item.establishment || '').trim();
  const itemVenue = String(item.venue || '').trim();
  const normalizedRowEstablishment = normalizeVenueName(establishment);
  const cityLevelFacebookEventLocation = isCityLevelFacebookEventLocation(row);

  // Check if the event specifies a different venue than the row-level establishment
  const itemHasDifferentVenue =
    (itemEstablishment && normalizeVenueName(itemEstablishment) !== normalizedRowEstablishment) ||
    (itemVenue && normalizeVenueName(itemVenue) !== normalizedRowEstablishment);

  // If event has a different venue, try to match it first before falling back to rowVenue
  if (itemHasDifferentVenue) {
    const candidateNames = [itemEstablishment, itemVenue].filter(Boolean);
    const uniqueCandidates = [...new Set(candidateNames)];

    for (const candidate of uniqueCandidates) {
      const itemMatchStart = Date.now();
      const itemMatch = await firestoreService.findMatchingVenue(candidate);
      logTiming('venue_match_item', itemMatchStart, {
        rowIndex,
        candidateVenue: candidate,
        hasFacebookUrl: false,
        matched: itemMatch.isMatch,
        parserMode: 'full5stage',
        reason: 'event_has_different_venue',
      });
      if (itemMatch.isMatch && itemMatch.matchedVenue) {
        logger.debug('Resolved event to different venue than row', {
          rowIndex,
          rowEstablishment: establishment,
          eventEstablishment: itemEstablishment || itemVenue,
          resolvedVenueId: itemMatch.matchedVenue.id,
          resolvedVenueName: itemMatch.matchedVenue.name,
        });
        return itemMatch.matchedVenue;
      }
    }

    // If no match found for the event's specific venue, log and skip (don't fall back to rowVenue)
    logger.debug('No venue match for event with different establishment', {
      rowIndex,
      rowEstablishment: establishment,
      eventEstablishment: itemEstablishment,
      eventVenue: itemVenue,
    });
    return null;
  }

  if (cityLevelFacebookEventLocation) {
    logger.info('Skipping fallback venue match for city-level Facebook Event location', {
      rowIndex,
      establishment,
      locationName: row.facebookEventLocationName || row.userName,
      organizerName: row.facebookEventOrganizerName,
      itemName: item.name || '',
    });
    return null;
  }

  // Event matches row establishment, use rowVenue if available
  if (rowVenue) return rowVenue;

  // No rowVenue, try to match
  const candidateNames = [
    itemEstablishment,
    itemVenue,
    establishment,
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidateNames)];
  for (const candidate of uniqueCandidates) {
    const useUrl =
      row.facebookUrl &&
      normalizeVenueName(candidate) === normalizedRowEstablishment;
    const itemMatchStart = Date.now();
    const itemMatch = await firestoreService.findMatchingVenue(
      candidate,
      useUrl ? row.facebookUrl : undefined
    );
    logTiming('venue_match_item', itemMatchStart, {
      rowIndex,
      candidateVenue: candidate,
      hasFacebookUrl: Boolean(useUrl && row.facebookUrl),
      matched: itemMatch.isMatch,
      parserMode: 'full5stage',
    });
    if (itemMatch.isMatch && itemMatch.matchedVenue) {
      return itemMatch.matchedVenue;
    }
  }

  return null;
}

async function processFullParserEvent(
  item: ParserProcessedEvent,
  row: RawRowData,
  rowIndex: number,
  itemIndex: number,
  rowVenue: VenueData | null,
  establishment: string,
  batchManager: BatchManager
): Promise<{
  created: boolean;
  updated: boolean;
  isDuplicate: boolean;
  duplicateEventId?: string;
  event?: EventData;
}> {
  const venue = await resolveVenueForFullParserEvent(
    item,
    rowVenue,
    row,
    establishment,
    rowIndex
  );

  if (!venue) {
    if (isCityLevelFacebookEventLocation(row)) {
      await queueCityLevelFacebookEventForReview({
        row,
        rowIndex,
        batchManager,
        parserMode: 'full5stage',
        eventName: String(item.name || (item as unknown as { eventName?: string }).eventName || '').trim() || undefined,
        eventDate: String(item.startDate || '').trim() || undefined,
        eventTime: String(item.startTime || '').trim() || undefined,
        endDate: String(item.endDate || '').trim() || undefined,
        endTime: String(item.endTime || '').trim() || undefined,
        eventType: normalizeFullParserEventType(item),
        category: String(item.category || '').trim() || undefined,
        description: String(item.description || row.text || '').trim() || undefined,
        imageUrl: String(item.image || item.relevantImageUrl || '').trim() || undefined,
        mediaUrls: Array.isArray(item.mediaUrls) ? item.mediaUrls : row.mediaUrls,
        usersResponded: item.usersResponded || row.usersResponded,
        usersGoing: item.usersGoing || row.usersGoing,
        usersInterested: item.usersInterested || row.usersInterested,
        facebookUsersResponded: item.facebookUsersResponded || row.facebookUsersResponded,
        likes: item.likes ?? row.likes,
        shares: item.shares ?? row.shares,
        comments: item.comments ?? row.comments,
        topReactionsCount: item.topReactionsCount ?? row.topReactionsCount,
        ticketsBuyUrl: item.ticketsBuyUrl || row.ticketsBuyUrl,
        externalLinks: row.externalLinks,
      });
      logger.debug('Skipping app event write for city-level Facebook Event location', {
        rowIndex,
        itemName: item.name || '',
        locationName: row.facebookEventLocationName || row.userName,
        organizerName: row.facebookEventOrganizerName,
      });
      return { created: false, updated: false, isDuplicate: false };
    }

    const candidateVenueName = String(
      item.additionalLocation ||
      item.venue ||
      item.establishment ||
      establishment ||
      ''
    ).trim();
    await queueUnknownVenueForReview({
      venueName: candidateVenueName,
      source: 'full5stage_event',
      parserMode: 'full5stage',
      row,
      rowIndex,
      batchManager,
      eventName: String(item.name || (item as unknown as { eventName?: string }).eventName || '').trim() || undefined,
      eventDate: String(item.startDate || '').trim() || undefined,
      eventTime: String(item.startTime || '').trim() || undefined,
      description: String(item.description || '').trim() || undefined,
    });
    logger.debug('Skipping full5stage event without resolved venue', {
      rowIndex,
      itemName: item.name || '',
      establishment: item.establishment || '',
      venue: item.venue || '',
    });
    return { created: false, updated: false, isDuplicate: false };
  }

  const startDateRaw = String(item.startDate || '').trim();
  const startDate = startDateRaw ? formatDate(startDateRaw) : '';
  const rawEndDateValue = item.endDate;
  let endDate = String(item.endDate || '').trim();
  endDate = endDate ? formatDate(endDate) : '';
  const rawStartTimeValue = item.startTime;
  const rawEndTimeValue = item.endTime;
  const startTimeBeforeNormalize = String(item.startTime || '').trim();
  let startTime = startTimeBeforeNormalize;
  startTime = startTime ? normalizeTime(startTime) : '';
  const endTimeBeforeNormalize = String(item.endTime || '').trim();
  let endTime = endTimeBeforeNormalize;
  endTime = endTime ? normalizeTime(endTime) : '';

  if (startDate && startTime && endTime && !endDate) {
    endDate = calculateEndDate(startDate, startTime, endTime);
  }
  if (!endDate && startDate) {
    endDate = startDate;
  }

  const name = String(item.name || '').trim();
  const normalizedIncomingCategory = normalizeCategoryAlias(String(item.category || '').trim());
  const eventMediaUrls = normalizeUrlList(Array.isArray(item.mediaUrls) ? item.mediaUrls : []);
  const preferredMediaUrl =
    eventMediaUrls.find((url) => isStorageManagedUrl(url)) || eventMediaUrls[0] || '';
  const incomingImage = String(item.image || '').trim();
  const incomingRelevantImage = String(item.relevantImageUrl || '').trim();
  const resolvedImage = incomingImage || preferredMediaUrl || undefined;
  const resolvedRelevantImage = incomingRelevantImage || incomingImage || preferredMediaUrl || undefined;
  const recurrenceLifecycle = extractRecurrenceLifecycleFields(
    item as unknown as Record<string, unknown>
  );
  const canonicalVenueName = String(
    venue.name ||
    (venue as unknown as Record<string, unknown>).pagename ||
    (venue as unknown as Record<string, unknown>).title ||
    row.pageName ||
    row.userName ||
    establishment ||
    ''
  ).trim();
  const parsedEstablishment = String(item.establishment || '').trim();
  const parsedAdditionalLocation = String(item.additionalLocation || '').trim();
  const normalizedCanonicalVenueName = normalizeVenueName(canonicalVenueName);
  const normalizedParsedEstablishment = normalizeVenueName(parsedEstablishment);
  const additionalLocationCandidate =
    parsedAdditionalLocation ||
    (
      parsedEstablishment &&
      normalizedParsedEstablishment &&
      normalizedParsedEstablishment !== normalizedCanonicalVenueName
        ? parsedEstablishment
        : ''
    );

  const eventData = {
    uniqueId: `${row.uniqueId || item.id || ''}_${item._pipelineIndex || itemIndex + 1}`,
    establishment: canonicalVenueName || parsedEstablishment || String(establishment || '').trim(),
    locationScope: 'venue',
    locationLabel: canonicalVenueName || parsedEstablishment || String(establishment || '').trim(),
    locationPrecision: 'exact',
    locationReviewStatus: 'not_needed',
    additionalLocation:
      additionalLocationCandidate &&
      normalizeVenueName(additionalLocationCandidate) !== normalizeVenueName(canonicalVenueName)
        ? additionalLocationCandidate
        : undefined,
    subVenue: undefined,
    eventType: normalizeFullParserEventType(item),
    eventName: name || undefined,
    description: String(item.description || '').trim() || undefined,
    startDate,
    endDate: endDate || undefined,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
    price: String(item.ticketPrice || '').trim() || undefined,
    ageRestriction: undefined,
    imageUrl: resolvedImage,
    mediaUrls: eventMediaUrls,
    facebookUrl: row.facebookUrl,
    sourceTimestamp: row.timestamp ? new Date(row.timestamp) : undefined,
    usersResponded: item.usersResponded || row.usersResponded,
    usersGoing: item.usersGoing || row.usersGoing,
    usersInterested: item.usersInterested || row.usersInterested,
    facebookUsersResponded: item.facebookUsersResponded || row.facebookUsersResponded,
    likes: item.likes ?? row.likes,
    shares: item.shares ?? row.shares,
    comments: item.comments ?? row.comments,
    topReactionsCount: item.topReactionsCount ?? row.topReactionsCount,
    venueId: venue.id,
    category: normalizedIncomingCategory || undefined,
    isEvent: item.isEvent || undefined,
    isFoodSpecial: item.isFoodSpecial || undefined,
    name: name || undefined,
    address: String(item.address || '').trim() || undefined,
    ticketPrice: String(item.ticketPrice || '').trim() || undefined,
    ticketLink: String(item.ticketLink || '').trim() || undefined,
    ticketsBuyUrl: String(item.ticketsBuyUrl || row.ticketsBuyUrl || '').trim() || undefined,
    externalLinks: row.externalLinks,
    isRecurring: item.isRecurring,
    recurringPattern: item.recurringPattern || undefined,
    recurringDaysOfWeek: normalizeRecurringWeekdayListValue(
      (item as { recurringDaysOfWeek?: unknown }).recurringDaysOfWeek
    ),
    recurringWeekdaySequence: normalizeRecurringWeekdayListValue(
      (item as { recurringWeekdaySequence?: unknown }).recurringWeekdaySequence
    ),
    recurringWeekInterval: normalizeRecurringWeekIntervalValue(
      (item as { recurringWeekInterval?: unknown }).recurringWeekInterval
    ),
    totalOccurrences: recurrenceLifecycle.totalOccurrences,
    recurrenceUntilDate: recurrenceLifecycle.recurrenceUntilDate,
    icon: String(item.icon || '').trim() || undefined,
    image: resolvedImage,
    relevantImageUrl: resolvedRelevantImage,
    sharedPostThumbnail: String(item.sharedPostThumbnail || '').trim() || undefined,
    cleanedFacebookUrl: String(item.cleanedFacebookUrl || '').trim() || undefined,
    latitude: item.latitude,
    longitude: item.longitude,
    city: String(item.city || '').trim() || undefined,
    streetAddress: String(item.streetAddress || '').trim() || undefined,
    timeResolution: item.timeResolution,
    timeFlags: item.timeFlags,
    _sourceType: (item as unknown as Record<string, unknown>)._sourceType || undefined,
    organizedBy: String(item.organizedBy || '').trim() || undefined,
    utcStartDate: String(item.utcStartDate || '').trim() || undefined,
    ticketProvider: String(item.ticketProvider || '').trim() || undefined,
  } as EventData & { _sourceType?: string };

  enforceCategoryTypeConsistency(eventData);

  const canonicalIcon = await resolveCanonicalVenueIcon({
    venue,
    row,
    incomingIcon: eventData.icon,
    rowIndex,
    parserMode: 'full5stage',
    eventName: eventData.eventName || eventData.name,
  });
  if (canonicalIcon) {
    eventData.icon = canonicalIcon;
  } else {
    delete eventData.icon;
  }

  const dedupeStart = Date.now();
  const duplicateCheck = await firestoreService.checkDuplicate(
    eventData,
    venue.id,
    batchManager.getCurrentRunEntries()
  );
  logTiming('dedupe_check', dedupeStart, {
    rowIndex,
    venueId: venue.id,
    eventName: eventData.eventName || '',
    isDuplicate: duplicateCheck.isDuplicate,
    parserMode: 'full5stage',
  });

  if (duplicateCheck.isDuplicate) {
    const existingEvent = duplicateCheck.existingEvent;
    if (existingEvent) {
      try {
        const updateResult = await updateDuplicateEventIfNeeded(
          venue,
          existingEvent,
          eventData,
          rowIndex,
          'full5stage'
        );
        if (updateResult.updated) {
          return {
            created: false,
            updated: true,
            isDuplicate: true,
            duplicateEventId: existingEvent.id,
            event: updateResult.mergedEvent,
          };
        }
      } catch (error) {
        logger.error('Failed duplicate merge update (full5stage)', error, {
          rowIndex,
          venueId: venue.id,
          existingEventId: existingEvent.id,
          incomingEventName: eventData.eventName || '',
        });
      }
    }

    logger.debug('Duplicate full5stage event found (no enrichment applied)', {
      rowIndex,
      eventType: eventData.eventType,
      startDate: eventData.startDate,
      existingEventId: existingEvent?.id,
    });
    return {
      created: false,
      updated: false,
      isDuplicate: true,
      duplicateEventId: existingEvent?.id,
    };
  }

  const writeStart = Date.now();
  const eventId = await firestoreService.createEvent(venue.id, eventData);
  logTiming('write_event', writeStart, {
    rowIndex,
    venueId: venue.id,
    eventName: eventData.eventName || '',
    parserMode: 'full5stage',
  });
  eventData.id = eventId;

  return { created: true, updated: false, isDuplicate: false, event: eventData };
}

/**
 * Process a single extracted item and create/update event
 */
async function processExtractedItem(
  item: ExtractedItem,
  row: RawRowData,
  rowIndex: number,
  venue: VenueData,
  batchManager: BatchManager,
  subVenueName?: string
): Promise<{
  created: boolean;
  updated: boolean;
  isDuplicate: boolean;
  duplicateEventId?: string;
  event?: EventData;
}> {
  const venueName =
    venue.name ||
    (venue as unknown as Record<string, unknown>).pagename ||
    (venue as unknown as Record<string, unknown>).title ||
    row.pageName ||
    row.userName ||
    '';

  if (!String(venueName).trim()) {
    throw new Error('No establishment name for matched venue');
  }

  // Resolve dates and times
  const resolvedDates = resolveDatesAndTimes(item, row);
  const subVenue = String(subVenueName || '').trim();
  const itemVenue = getItemVenueName(item);
  const normalizedItemVenue = normalizeVenueName(itemVenue);
  const normalizedVenueName = normalizeVenueName(String(venueName));
  const fallbackAdditionalLocation =
    itemVenue && normalizedItemVenue && normalizedItemVenue !== normalizedVenueName
      ? itemVenue
      : '';
  const additionalLocation = subVenue || fallbackAdditionalLocation;
  const legacyItem = item as unknown as Partial<EventData>;
  const legacyMediaUrls = normalizeUrlList(row.mediaUrls);
  const legacyPreferredMediaUrl =
    legacyMediaUrls.find((url) => isStorageManagedUrl(url)) || legacyMediaUrls[0] || '';
  const recurrenceLifecycle = extractRecurrenceLifecycleFields(
    legacyItem as unknown as Record<string, unknown>
  );
  const normalizedLegacyCategory = normalizeCategoryAlias(
    String(legacyItem.category || '').trim()
  );

  // Build event data
  const eventData: EventData = {
    uniqueId: `${row.uniqueId || ''}_${item._pipelineIndex || 1}`,
    establishment: String(venueName).trim(),
    additionalLocation: additionalLocation || undefined,
    subVenue: subVenue || undefined,
    eventType: normalizedLegacyCategory
      ? normalizeCategoryToEventType(normalizedLegacyCategory)
      : item.eventType,
    eventName: item.eventName,
    description: item.description,
    startDate: resolvedDates.startDate,
    endDate: resolvedDates.endDate,
    startTime: resolvedDates.startTime,
    endTime: resolvedDates.endTime,
    price: item.price,
    ageRestriction: item.ageRestriction,
    imageUrl: legacyPreferredMediaUrl || undefined,
    image: legacyPreferredMediaUrl || undefined,
    relevantImageUrl: legacyPreferredMediaUrl || undefined,
    mediaUrls: legacyMediaUrls,
    facebookUrl: row.facebookUrl,
    sourceTimestamp: row.timestamp ? new Date(row.timestamp) : undefined,
    usersResponded: item.usersResponded || row.usersResponded,
    usersGoing: (item as unknown as ParserProcessedEvent).usersGoing || row.usersGoing,
    usersInterested: (item as unknown as ParserProcessedEvent).usersInterested || row.usersInterested,
    facebookUsersResponded: (item as unknown as ParserProcessedEvent).facebookUsersResponded || row.facebookUsersResponded,
    likes: item.likes ?? row.likes,
    shares: item.shares ?? row.shares,
    comments: item.comments ?? row.comments,
    topReactionsCount: item.topReactionsCount ?? row.topReactionsCount,
    ticketsBuyUrl: row.ticketsBuyUrl,
    externalLinks: row.externalLinks,
    venueId: venue.id,
    category: (normalizedLegacyCategory || legacyItem.category) as EventData['category'],
    isEvent: legacyItem.isEvent,
    isFoodSpecial: legacyItem.isFoodSpecial,
    isRecurring: legacyItem.isRecurring,
    recurringPattern:
      typeof (legacyItem as { recurringPattern?: unknown }).recurringPattern === 'string'
        ? String((legacyItem as { recurringPattern?: unknown }).recurringPattern || '').trim() ||
          undefined
        : undefined,
    recurringDaysOfWeek: normalizeRecurringWeekdayListValue(
      (legacyItem as { recurringDaysOfWeek?: unknown }).recurringDaysOfWeek
    ),
    recurringWeekdaySequence: normalizeRecurringWeekdayListValue(
      (legacyItem as { recurringWeekdaySequence?: unknown }).recurringWeekdaySequence
    ),
    recurringWeekInterval: normalizeRecurringWeekIntervalValue(
      (legacyItem as { recurringWeekInterval?: unknown }).recurringWeekInterval
    ),
    totalOccurrences: recurrenceLifecycle.totalOccurrences,
    recurrenceUntilDate: recurrenceLifecycle.recurrenceUntilDate,
  };

  enforceCategoryTypeConsistency(eventData);

  const canonicalIcon = await resolveCanonicalVenueIcon({
    venue,
    row,
    incomingIcon: eventData.icon,
    rowIndex,
    parserMode: 'legacy',
    eventName: eventData.eventName || eventData.name,
  });
  if (canonicalIcon) {
    eventData.icon = canonicalIcon;
  } else {
    delete eventData.icon;
  }

  // Check for duplicates
  const dedupeStart = Date.now();
  const duplicateCheck = await firestoreService.checkDuplicate(
    eventData,
    venue.id,
    batchManager.getCurrentRunEntries()
  );
  logTiming('dedupe_check', dedupeStart, {
    rowIndex,
    venueId: venue.id,
    eventName: eventData.eventName || '',
    isDuplicate: duplicateCheck.isDuplicate,
  });

  if (duplicateCheck.isDuplicate) {
    const existingEvent = duplicateCheck.existingEvent;
    if (existingEvent) {
      try {
        const updateResult = await updateDuplicateEventIfNeeded(
          venue,
          existingEvent,
          eventData,
          rowIndex,
          'legacy'
        );
        if (updateResult.updated) {
          return {
            created: false,
            updated: true,
            isDuplicate: true,
            duplicateEventId: existingEvent.id,
            event: updateResult.mergedEvent,
          };
        }
      } catch (error) {
        logger.error('Failed duplicate merge update (legacy)', error, {
          rowIndex,
          venueId: venue.id,
          existingEventId: existingEvent.id,
          incomingEventName: eventData.eventName || '',
        });
      }
    }

    logger.debug('Duplicate event found (no enrichment applied)', {
      eventType: eventData.eventType,
      startDate: eventData.startDate,
      existingEventId: existingEvent?.id,
    });
    return {
      created: false,
      updated: false,
      isDuplicate: true,
      duplicateEventId: existingEvent?.id,
    };
  }

  // Create the event
  const writeStart = Date.now();
  const eventId = await firestoreService.createEvent(venue.id, eventData);
  logTiming('write_event', writeStart, {
    rowIndex,
    venueId: venue.id,
    eventName: eventData.eventName || '',
  });
  eventData.id = eventId;

  return { created: true, updated: false, isDuplicate: false, event: eventData };
}

type ParserMode = 'legacy' | 'full5stage';
const PROFILE_IMAGE_COMPARE_TIMEOUT_MS = 10_000;
const managedImageContentHashCache = new Map<string, string | null>();

function selectParserProfilePicUrl(row: RawRowData, venue: VenueData | null): string {
  const rowProfile = asTrimmedString(row.profilePicUrl);
  if (!venue) return rowProfile;

  const venueProfile = getVenueProfileImage(venue);
  const firstPartyPost = isFirstPartyVenuePost(row.facebookUrl, venue);

  // For first-party posts, prefer the row icon so canonical profile upgrades can occur.
  if (firstPartyPost && rowProfile) {
    return rowProfile;
  }

  return venueProfile || rowProfile;
}

async function resolveCanonicalVenueIcon(params: {
  venue: VenueData;
  row: RawRowData;
  incomingIcon?: string;
  rowIndex: number;
  parserMode: ParserMode;
  eventName?: string;
}): Promise<string | undefined> {
  const venueProfile = getVenueProfileImage(params.venue);
  const venueProfileSourceSignature = getVenueProfileImageSourceSignature(params.venue);
  const incoming = asTrimmedString(params.incomingIcon);
  const managedIncoming = isManagedBucketImageUrl(incoming) ? incoming : '';
  const firstPartyPost = isFirstPartyVenuePost(params.row.facebookUrl, params.venue);
  const incomingSourceSignature = computeProfileImageSourceSignature(params.row.profilePicUrl);

  if (firstPartyPost && managedIncoming && managedIncoming !== venueProfile) {
    let shouldPromote = false;
    let promotionReason = '';

    if (!venueProfile) {
      shouldPromote = true;
      promotionReason = 'missing_profile';
    } else if (!isManagedBucketImageUrl(venueProfile)) {
      shouldPromote = true;
      promotionReason = 'existing_unmanaged_profile';
    } else {
      const sameSourceSignature = Boolean(
        incomingSourceSignature &&
        venueProfileSourceSignature &&
        incomingSourceSignature === venueProfileSourceSignature
      );
      const sameContent = await managedImagesHaveSameContent(venueProfile, managedIncoming);
      if (sameContent === true) {
        shouldPromote = false;
        promotionReason = 'same_image_content';

        // Backfill signature without replacing the existing canonical image.
        if (
          incomingSourceSignature &&
          incomingSourceSignature !== venueProfileSourceSignature &&
          venueProfile
        ) {
          try {
            await firestoreService.updateVenueProfileImage(params.venue.id, venueProfile, {
              sourceSignature: incomingSourceSignature,
            });
            (params.venue as VenueData).profileImageSourceSignature = incomingSourceSignature;
            logger.info('Backfilled venue profile source signature', {
              rowIndex: params.rowIndex,
              parserMode: params.parserMode,
              venueId: params.venue.id,
              eventName: params.eventName || '',
            });
          } catch (error) {
            logger.error('Failed to backfill venue profile source signature', error, {
              rowIndex: params.rowIndex,
              parserMode: params.parserMode,
              venueId: params.venue.id,
              eventName: params.eventName || '',
            });
          }
        }
      } else if (sameContent === false) {
        shouldPromote = true;
        promotionReason = sameSourceSignature
          ? 'image_content_changed_same_source_signature'
          : 'image_content_changed';
      } else if (
        incomingSourceSignature &&
        venueProfileSourceSignature &&
        incomingSourceSignature !== venueProfileSourceSignature
      ) {
        shouldPromote = true;
        promotionReason = 'source_signature_changed';
      } else if (sameSourceSignature) {
        shouldPromote = false;
        promotionReason = 'same_source_signature_unverified';
      } else if (!venueProfileSourceSignature && incomingSourceSignature) {
        shouldPromote = true;
        promotionReason = 'missing_signature';
      } else {
        shouldPromote = false;
        promotionReason = 'unable_to_verify_change';
      }
    }

    if (!shouldPromote) {
      logger.debug('Skipped canonical venue profile image update', {
        rowIndex: params.rowIndex,
        parserMode: params.parserMode,
        venueId: params.venue.id,
        eventName: params.eventName || '',
        reason: promotionReason,
      });
    }

    if (shouldPromote) {
    try {
      await firestoreService.updateVenueProfileImage(params.venue.id, managedIncoming, {
        sourceSignature: incomingSourceSignature || undefined,
      });
      (params.venue as VenueData).profileImage = managedIncoming;
      if (incomingSourceSignature) {
        (params.venue as VenueData).profileImageSourceSignature = incomingSourceSignature;
      }
      logger.info('Updated canonical venue profile image from first-party post', {
        rowIndex: params.rowIndex,
        parserMode: params.parserMode,
        venueId: params.venue.id,
        eventName: params.eventName || '',
        reason: promotionReason,
      });
      return managedIncoming;
    } catch (error) {
      logger.error('Failed to update venue profile image from first-party post', error, {
        rowIndex: params.rowIndex,
        parserMode: params.parserMode,
        venueId: params.venue.id,
        eventName: params.eventName || '',
      });
    }
    }
  }

  if (venueProfile) return venueProfile;
  if (firstPartyPost && managedIncoming) return managedIncoming;
  return undefined;
}

function getVenueProfileImage(venue: VenueData): string {
  return String((venue as VenueData).profileImage || '').trim();
}

function getVenueProfileImageSourceSignature(venue: VenueData): string {
  return String((venue as VenueData).profileImageSourceSignature || '').trim();
}

function computeProfileImageSourceSignature(url: string | undefined): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, '');
    if (!host) return '';
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase();
  }
}

function isManagedBucketImageUrl(url: string): boolean {
  const normalized = String(url || '').trim();
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return (
      parsed.hostname === 'storage.googleapis.com' &&
      parsed.pathname.includes('/gathr-uploaded-images/')
    );
  } catch {
    return false;
  }
}

async function managedImagesHaveSameContent(
  leftUrl: string,
  rightUrl: string
): Promise<boolean | undefined> {
  const left = String(leftUrl || '').trim();
  const right = String(rightUrl || '').trim();
  if (!left || !right) return undefined;
  if (left === right) return true;
  if (!isManagedBucketImageUrl(left) || !isManagedBucketImageUrl(right)) return undefined;

  const [leftHash, rightHash] = await Promise.all([
    getManagedImageContentHash(left),
    getManagedImageContentHash(right),
  ]);
  if (!leftHash || !rightHash) return undefined;
  return leftHash === rightHash;
}

async function getManagedImageContentHash(url: string): Promise<string | undefined> {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl || !isManagedBucketImageUrl(normalizedUrl)) return undefined;

  if (managedImageContentHashCache.has(normalizedUrl)) {
    const cached = managedImageContentHashCache.get(normalizedUrl);
    return cached || undefined;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_IMAGE_COMPARE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(normalizedUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      managedImageContentHashCache.set(normalizedUrl, null);
      return undefined;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      managedImageContentHashCache.set(normalizedUrl, null);
      return undefined;
    }

    const hash = createHash('sha1').update(buffer).digest('hex');
    managedImageContentHashCache.set(normalizedUrl, hash);
    return hash;
  } catch {
    managedImageContentHashCache.set(normalizedUrl, null);
    return undefined;
  }
}

function isFirstPartyVenuePost(rowFacebookUrl: string | undefined, venue: VenueData): boolean {
  const rowUrl = String(rowFacebookUrl || '').trim();
  if (!rowUrl) return false;

  const venueRecord = venue as unknown as Record<string, unknown>;
  const venueUrl = String(
    venue.facebookUrl ||
      (venueRecord.pageurl as string) ||
      ''
  ).trim();

  const normalizedRowUrl = normalizeUrl(rowUrl);
  const normalizedVenueUrl = normalizeUrl(venueUrl);
  if (normalizedRowUrl && normalizedVenueUrl && normalizedRowUrl === normalizedVenueUrl) {
    return true;
  }

  const rowSlug = extractFacebookSlug(rowUrl) || '';
  const venueSlug = String(
    venue.facebookSlug ||
      (venueRecord.pagenameSlug as string) ||
      extractFacebookSlug(venueUrl) ||
      ''
  )
    .trim()
    .toLowerCase();

  return Boolean(rowSlug && venueSlug && rowSlug === venueSlug);
}

async function updateDuplicateEventIfNeeded(
  venue: VenueData,
  existingEvent: EventData,
  incomingEvent: EventData,
  rowIndex: number,
  parserMode: ParserMode
): Promise<{
  updated: boolean;
  mergedEvent: EventData;
  changedFields: string[];
}> {
  const venueId = venue.id;
  const mergeOutcome = buildDuplicateEventUpdates(existingEvent, incomingEvent, {
    existingSourceScore: computeCategorySourceConfidence(existingEvent, venue),
    incomingSourceScore: computeCategorySourceConfidence(incomingEvent, venue),
  });
  const mergedEvent: EventData = { ...existingEvent, ...mergeOutcome.updates };

  if (mergeOutcome.changedFields.length === 0) {
    if (existingEvent.id) {
      const touchStart = Date.now();
      await firestoreService.updateEvent(venueId, existingEvent.id, {});
      logTiming('write_event_touch_last_seen', touchStart, {
        rowIndex,
        venueId,
        eventId: existingEvent.id,
        parserMode,
      });
    }
    return { updated: false, mergedEvent, changedFields: [] };
  }

  if (!existingEvent.id) {
    Object.assign(existingEvent, mergeOutcome.updates);
    logger.warn('Duplicate event matched without ID; applied in-memory merge only', {
      rowIndex,
      venueId,
      parserMode,
      changedFields: mergeOutcome.changedFields,
    });
    return {
      updated: true,
      mergedEvent,
      changedFields: mergeOutcome.changedFields,
    };
  }

  const updateStart = Date.now();
  await firestoreService.updateEvent(venueId, existingEvent.id, mergeOutcome.updates);
  logTiming('write_event_update', updateStart, {
    rowIndex,
    venueId,
    eventId: existingEvent.id,
    parserMode,
    changedFields: mergeOutcome.changedFields,
  });

  Object.assign(existingEvent, mergeOutcome.updates);

  logger.info('Duplicate event enriched from newer post', {
    rowIndex,
    venueId,
    eventId: existingEvent.id,
    parserMode,
    changedFields: mergeOutcome.changedFields,
    descriptionImproved: mergeOutcome.descriptionImproved,
    timeImproved: mergeOutcome.timeImproved,
  });

  return {
    updated: true,
    mergedEvent,
    changedFields: mergeOutcome.changedFields,
  };
}

function buildDuplicateEventUpdates(
  existing: EventData,
  incoming: EventData,
  categoryPromotionContext?: {
    existingSourceScore: number;
    incomingSourceScore: number;
  }
): {
  updates: Partial<EventData>;
  changedFields: string[];
  descriptionImproved: boolean;
  timeImproved: boolean;
} {
  const updates: Partial<EventData> = {};
  const changedFields: string[] = [];
  let descriptionImproved = false;
  let timeImproved = false;

  const setField = <K extends keyof EventData>(
    field: K,
    value: EventData[K] | undefined
  ): void => {
    if (value === undefined) return;
    if (!valuesDiffer(existing[field], value)) return;
    (updates[field] as EventData[K]) = value;
    changedFields.push(String(field));
  };

  const fillWhenMissingFields: Array<keyof EventData> = [
    'eventName',
    'name',
    'additionalLocation',
    'subVenue',
    'ageRestriction',
    'ticketLink',
    'ticketsBuyUrl',
    'ticketProvider',
    'organizedBy',
    'utcStartDate',
    'facebookUrl',
    'cleanedFacebookUrl',
    'address',
    'city',
    'streetAddress',
    'latitude',
    'longitude',
    'sharedPostThumbnail',
    'ticketPrice',
    'price',
    'recurringPattern',
    'recurringDaysOfWeek',
    'recurringWeekdaySequence',
    'recurringWeekInterval',
    'isRecurring',
    'totalOccurrences',
    'recurrenceUntilDate',
  ];

  for (const field of fillWhenMissingFields) {
    if (!isMeaningfulValue(existing[field]) && isMeaningfulValue(incoming[field])) {
      setField(field, incoming[field]);
    }
  }

  const recurringMerge = selectRecurringLifecycleMerge(existing, incoming);
  if (recurringMerge.recurringPattern !== undefined) {
    setField('recurringPattern', recurringMerge.recurringPattern);
  }
  if (recurringMerge.recurringDaysOfWeek !== undefined) {
    setField('recurringDaysOfWeek', recurringMerge.recurringDaysOfWeek);
  }
  if (recurringMerge.recurringWeekdaySequence !== undefined) {
    setField('recurringWeekdaySequence', recurringMerge.recurringWeekdaySequence);
  }
  if (recurringMerge.recurringWeekInterval !== undefined) {
    setField('recurringWeekInterval', recurringMerge.recurringWeekInterval);
  }
  if (recurringMerge.totalOccurrences !== undefined) {
    setField('totalOccurrences', recurringMerge.totalOccurrences);
  }
  if (recurringMerge.recurrenceUntilDate !== undefined) {
    setField('recurrenceUntilDate', recurringMerge.recurrenceUntilDate);
  }
  if (recurringMerge.isRecurring !== undefined) {
    setField('isRecurring', recurringMerge.isRecurring);
  }
  if (
    recurringMerge.forceIsRecurring &&
    normalizeFlagState(existing.isRecurring) !== 'yes'
  ) {
    setField('isRecurring', true);
  }

  const existingCategoryAlias = asTrimmedString(normalizeCategoryAlias(existing.category));
  if (existingCategoryAlias && valuesDiffer(existing.category, existingCategoryAlias)) {
    setField('category', existingCategoryAlias as EventData['category']);
  }

  const existingCategoryForMerge = asTrimmedString(
    (updates.category ?? existing.category) as EventData['category']
  );
  const incomingCategoryForMerge = asTrimmedString(
    normalizeCategoryAlias(incoming.category)
  );
  const existingIsFoodSpecialCategory = isFoodSpecialCategory(existingCategoryForMerge);
  const incomingIsFoodSpecialCategory = isFoodSpecialCategory(incomingCategoryForMerge);
  const incomingLooksLikeStrongEventCategory =
    Boolean(incomingCategoryForMerge) &&
    !incomingIsFoodSpecialCategory &&
    getCategorySpecificityRank(incomingCategoryForMerge) >= 2 &&
    (
      normalizeFlagState(incoming.isEvent) === 'yes' ||
      normalizeFlagState(incoming.isFoodSpecial) === 'no' ||
      (asTrimmedString(incoming.eventType).toLowerCase() !== '' &&
        asTrimmedString(incoming.eventType).toLowerCase() !== 'food_special')
    );

  if (
    existingIsFoodSpecialCategory &&
    incomingLooksLikeStrongEventCategory &&
    valuesDiffer(existingCategoryForMerge, incomingCategoryForMerge)
  ) {
    setField('category', incomingCategoryForMerge as EventData['category']);
  } else if (
    shouldPromoteCategory(
      existingCategoryForMerge,
      incomingCategoryForMerge,
      categoryPromotionContext
    )
  ) {
    setField('category', incomingCategoryForMerge as EventData['category']);
  }

  const preferredEventType = shouldPromoteEventType(existing.eventType, incoming.eventType)
    ? incoming.eventType
    : existing.eventType;
  const preferredIsEvent = resolvePreferredFlag(existing.isEvent, incoming.isEvent);
  const preferredIsFoodSpecial = resolvePreferredFlag(
    existing.isFoodSpecial,
    incoming.isFoodSpecial
  );
  const mergedTypeState: Pick<EventData, 'category' | 'eventType' | 'isEvent' | 'isFoodSpecial'> =
    {
      category: (updates.category ?? existing.category) as EventData['category'],
      eventType: preferredEventType as EventData['eventType'],
      isEvent: (preferredIsEvent ?? existing.isEvent) as EventData['isEvent'],
      isFoodSpecial: (preferredIsFoodSpecial ??
        existing.isFoodSpecial) as EventData['isFoodSpecial'],
    };
  enforceCategoryTypeConsistency(mergedTypeState);

  if (isMeaningfulValue(mergedTypeState.eventType)) {
    setField('eventType', mergedTypeState.eventType as EventData['eventType']);
  }
  if (mergedTypeState.isEvent !== undefined) {
    setField('isEvent', mergedTypeState.isEvent as EventData['isEvent']);
  }
  if (mergedTypeState.isFoodSpecial !== undefined) {
    setField('isFoodSpecial', mergedTypeState.isFoodSpecial as EventData['isFoodSpecial']);
  }

  if (shouldReplaceDescription(existing.description, incoming.description)) {
    setField('description', incoming.description);
    descriptionImproved = true;
  }

  const authoritativeFamilyShapePromoted = shouldPromoteAuthoritativeCurrentFamilyShape(
    existing,
    incoming
  );

  if (authoritativeFamilyShapePromoted) {
    if (isMeaningfulValue(incoming.eventName)) {
      setField('eventName', incoming.eventName);
    }
    if (isMeaningfulValue(incoming.name)) {
      setField('name', incoming.name);
    }
    if (isMeaningfulValue(incoming.description)) {
      setField('description', incoming.description);
      descriptionImproved = true;
    }
    if (isMeaningfulValue(incoming.startDate)) {
      setField('startDate', incoming.startDate);
    }
    if (isMeaningfulValue(incoming.endDate)) {
      setField('endDate', incoming.endDate);
    }
  }

  if (shouldReplaceDateField(existing.startDate, incoming.startDate)) {
    setField('startDate', incoming.startDate);
    if (!authoritativeFamilyShapePromoted) {
      timeImproved = true;
    }
  }

  if (shouldReplaceEndDateField(existing, incoming)) {
    setField('endDate', incoming.endDate);
    if (!authoritativeFamilyShapePromoted) {
      timeImproved = true;
    }
  }

  const preferredIncomingStartTime = selectPreferredIncomingTimeMergeValue(
    existing,
    incoming,
    'start',
    incoming.startTime
  );
  if (shouldReplaceTimeField(existing.startTime, preferredIncomingStartTime, existing, incoming, 'start')) {
    setField('startTime', preferredIncomingStartTime as EventData['startTime']);
    timeImproved = true;
  }

  const preferredIncomingEndTime = selectPreferredIncomingTimeMergeValue(
    existing,
    incoming,
    'end',
    incoming.endTime
  );
  if (shouldReplaceTimeField(existing.endTime, preferredIncomingEndTime, existing, incoming, 'end')) {
    setField('endTime', preferredIncomingEndTime as EventData['endTime']);
    timeImproved = true;
  }

  if (timeImproved) {
    if (incoming.timeResolution != null) {
      setField('timeResolution', incoming.timeResolution);
    }
    if (incoming.timeFlags != null) {
      setField('timeFlags', incoming.timeFlags);
    }
  }

  if (shouldReplacePriceValue(existing.price, incoming.price)) {
    setField('price', incoming.price);
  }

  if (shouldReplacePriceValue(existing.ticketPrice, incoming.ticketPrice)) {
    setField('ticketPrice', incoming.ticketPrice);
  }

  const newerSourceTimestamp = selectNewerDate(existing.sourceTimestamp, incoming.sourceTimestamp);
  const hasNewerSourceTimestamp = Boolean(newerSourceTimestamp);
  if (newerSourceTimestamp) {
    setField('sourceTimestamp', newerSourceTimestamp);
  }

  const socialMetrics: Array<'likes' | 'shares' | 'comments' | 'topReactionsCount'> = [
    'likes',
    'shares',
    'comments',
    'topReactionsCount',
  ];
  for (const metric of socialMetrics) {
    const higherValue = selectHigherMetricValue(existing[metric], incoming[metric]);
    if (higherValue !== undefined) {
      setField(metric, higherValue);
    }
  }

  const preferredUsersResponded = selectPreferredUsersResponded(
    existing.usersResponded,
    incoming.usersResponded
  );
  if (preferredUsersResponded !== undefined) {
    setField('usersResponded', preferredUsersResponded);
  }

  const facebookResponseMetrics: Array<'usersGoing' | 'usersInterested' | 'facebookUsersResponded'> = [
    'usersGoing',
    'usersInterested',
    'facebookUsersResponded',
  ];
  for (const metric of facebookResponseMetrics) {
    const preferredValue = selectPreferredUsersResponded(existing[metric], incoming[metric]);
    if (preferredValue !== undefined) {
      setField(metric, preferredValue);
    }
  }

  const mergedExternalLinks = mergeUniqueUrls(existing.externalLinks, incoming.externalLinks);
  if (mergedExternalLinks.length > 0 && valuesDiffer(existing.externalLinks, mergedExternalLinks)) {
    setField('externalLinks', mergedExternalLinks);
  }

  const mergedMediaUrls = mergeUniqueUrls(existing.mediaUrls, incoming.mediaUrls);
  if (mergedMediaUrls.length > 0 && valuesDiffer(existing.mediaUrls, mergedMediaUrls)) {
    setField('mediaUrls', mergedMediaUrls);
  }

  const normalizedIncomingMediaUrls = normalizeUrlList(incoming.mediaUrls);
  const incomingPreferredMediaUrl =
    normalizedIncomingMediaUrls.find((url) => isStorageManagedUrl(url)) ||
    normalizedIncomingMediaUrls[0] ||
    '';
  const canonicalIncomingImage =
    asTrimmedString(incoming.image) || incomingPreferredMediaUrl;
  const canonicalIncomingRelevantImage =
    asTrimmedString(incoming.relevantImageUrl) ||
    canonicalIncomingImage ||
    incomingPreferredMediaUrl;

  const promoteImages =
    descriptionImproved ||
    timeImproved ||
    shouldPromoteCanonicalImageFromNewerDuplicate(existing, incoming, hasNewerSourceTimestamp);

  if (
    shouldReplaceImageUrl(
      existing.relevantImageUrl,
      canonicalIncomingRelevantImage,
      promoteImages
    )
  ) {
    setField('relevantImageUrl', canonicalIncomingRelevantImage);
  }

  if (shouldReplaceImageUrl(existing.image, canonicalIncomingImage, promoteImages)) {
    setField('image', canonicalIncomingImage);
  }

  if (shouldReplaceIconUrl(existing.icon, incoming.icon)) {
    setField('icon', incoming.icon);
  }

  return {
    updates,
    changedFields,
    descriptionImproved,
    timeImproved,
  };
}

export function previewDuplicateMerge(params: {
  existingEvent: EventData;
  incomingEvent: EventData;
  venue: VenueData;
}): {
  updates: Partial<EventData>;
  changedFields: string[];
  descriptionImproved: boolean;
  timeImproved: boolean;
  sourceScores: {
    existing: number;
    incoming: number;
  };
} {
  const sourceScores = {
    existing: computeCategorySourceConfidence(params.existingEvent, params.venue),
    incoming: computeCategorySourceConfidence(params.incomingEvent, params.venue),
  };

  const mergeOutcome = buildDuplicateEventUpdates(
    params.existingEvent,
    params.incomingEvent,
    {
      existingSourceScore: sourceScores.existing,
      incomingSourceScore: sourceScores.incoming,
    }
  );

  return {
    ...mergeOutcome,
    sourceScores,
  };
}

function isMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object') return true;
  return false;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const TOTAL_OCCURRENCE_FIELD_CANDIDATES = [
  'totalOccurrences',
  'occurrenceCount',
  'occurrences',
  'numberOfOccurrences',
  'numberOfRecurrences',
  'numRecurrences',
  'recurrenceCount',
  'totalRecurrences',
] as const;

const RECURRENCE_UNTIL_FIELD_CANDIDATES = [
  'recurrenceUntilDate',
  'recurrenceEndDate',
  'recurrenceUntil',
  'untilDate',
  'repeatUntil',
  'recursUntil',
] as const;

function getFirstPresentFieldValue(
  source: Record<string, unknown>,
  keys: readonly string[]
): unknown {
  const metadata =
    source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? (source.metadata as Record<string, unknown>)
      : null;

  for (const key of keys) {
    if (!(key in source)) continue;
    const value = source[key];
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }

  if (metadata) {
    for (const key of keys) {
      if (!(key in metadata)) continue;
      const value = metadata[key];
      if (value == null) continue;
      if (typeof value === 'string' && !value.trim()) continue;
      return value;
    }
  }

  return undefined;
}

function parsePositiveIntegerValue(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed =
    typeof value === 'number' ? value : Number(String(value).trim().replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return undefined;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : undefined;
}

function normalizeIsoDateValue(value: unknown): string | undefined {
  if (value == null) return undefined;

  let formatted = '';
  if (value instanceof Date) {
    formatted = formatDate(value);
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    formatted = formatDate(new Date(value));
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    formatted = formatDate(trimmed);
  }

  return formatted || undefined;
}

function extractRecurrenceLifecycleFields(
  source: Record<string, unknown>
): Pick<EventData, 'totalOccurrences' | 'recurrenceUntilDate'> {
  const totalOccurrences = parsePositiveIntegerValue(
    getFirstPresentFieldValue(source, TOTAL_OCCURRENCE_FIELD_CANDIDATES)
  );
  const recurrenceUntilDate = normalizeIsoDateValue(
    getFirstPresentFieldValue(source, RECURRENCE_UNTIL_FIELD_CANDIDATES)
  );

  return {
    totalOccurrences,
    recurrenceUntilDate,
  };
}

const VALID_RECURRING_PATTERNS = new Set<string>([
  'none',
  'daily',
  'weekly_custom',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
  'weekly_sunday',
]);

const VALID_RECURRING_WEEKDAYS = new Set<string>([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

const RECURRING_WEEKDAY_TOKEN_TO_CANONICAL: Record<string, RecurringWeekday> = {
  sunday: 'sunday',
  sun: 'sunday',
  monday: 'monday',
  mon: 'monday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  tues: 'tuesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  thursday: 'thursday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  friday: 'friday',
  fri: 'friday',
  saturday: 'saturday',
  sat: 'saturday',
};

function normalizeRecurringPatternToken(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
  if (!normalized) return '';

  if (VALID_RECURRING_PATTERNS.has(normalized)) {
    return normalized;
  }

  if (normalized.startsWith('weekly_')) {
    const weekday = normalized.slice('weekly_'.length);
    const canonical = `weekly_${weekday}`;
    return VALID_RECURRING_PATTERNS.has(canonical) ? canonical : '';
  }

  return '';
}

function normalizeRecurringWeekdayToken(value: unknown): RecurringWeekday | '' {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/s$/, '');
  return RECURRING_WEEKDAY_TOKEN_TO_CANONICAL[normalized] || '';
}

function normalizeRecurringWeekdayListValue(value: unknown): RecurringWeekday[] | undefined {
  if (value == null) return undefined;

  let rawValues: unknown[] = [];
  if (Array.isArray(value)) {
    rawValues = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        rawValues = parsed;
      } else {
        rawValues = trimmed.split(/[\s,|/]+/);
      }
    } catch {
      rawValues = trimmed.split(/[\s,|/]+/);
    }
  } else {
    rawValues = [value];
  }

  const normalized = Array.from(
    new Set(
      rawValues
        .map((entry) => normalizeRecurringWeekdayToken(entry))
        .filter((entry): entry is RecurringWeekday => VALID_RECURRING_WEEKDAYS.has(entry))
    )
  );
  return normalized.length ? normalized : undefined;
}

function normalizeRecurringWeekIntervalValue(value: unknown): number | undefined {
  const parsed = parsePositiveIntegerValue(value);
  if (parsed === undefined) return undefined;
  return parsed > 0 ? parsed : undefined;
}

function isWeekdayOnlyRecurringSet(days?: RecurringWeekday[]): boolean {
  if (!days || days.length !== 5) return false;
  const normalized = new Set(days);
  return (
    normalized.has('monday') &&
    normalized.has('tuesday') &&
    normalized.has('wednesday') &&
    normalized.has('thursday') &&
    normalized.has('friday')
  );
}

const WEEKLY_PATTERN_BY_WEEKDAY_INDEX = [
  'weekly_sunday',
  'weekly_monday',
  'weekly_tuesday',
  'weekly_wednesday',
  'weekly_thursday',
  'weekly_friday',
  'weekly_saturday',
] as const;

function isSimpleWeeklyPattern(pattern: string): boolean {
  return Boolean(pattern && pattern.startsWith('weekly_') && pattern !== 'weekly_custom');
}

function recurringPatternFromIsoDateValue(value: unknown): string | undefined {
  const normalizedDate = normalizeIsoDateValue(value);
  if (!normalizedDate) return undefined;
  const date = new Date(`${normalizedDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return WEEKLY_PATTERN_BY_WEEKDAY_INDEX[date.getUTCDay()] || undefined;
}

function normalizeRecurringFamilyTitle(event: Pick<EventData, 'name' | 'eventName'>): string {
  const rawTitle = asTrimmedString(event.name) || asTrimmedString(event.eventName);
  return rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function shouldCorrectConflictingSimpleWeeklyPattern(
  existing: EventData,
  incoming: EventData,
  existingPattern: string,
  incomingPattern: string,
  existingHasCustomSchedule: boolean,
  incomingHasCustomSchedule: boolean
): boolean {
  if (
    !isSimpleWeeklyPattern(existingPattern) ||
    !isSimpleWeeklyPattern(incomingPattern) ||
    existingPattern === incomingPattern ||
    existingHasCustomSchedule ||
    incomingHasCustomSchedule
  ) {
    return false;
  }

  const existingStartDate = normalizeIsoDateValue(existing.startDate);
  const incomingStartDate = normalizeIsoDateValue(incoming.startDate);
  if (!existingStartDate || !incomingStartDate || existingStartDate !== incomingStartDate) {
    return false;
  }

  const existingEndDate =
    normalizeIsoDateValue(existing.endDate) || existingStartDate;
  const incomingEndDate =
    normalizeIsoDateValue(incoming.endDate) || incomingStartDate;
  if (existingEndDate !== incomingEndDate) {
    return false;
  }

  const dateImpliedPattern = recurringPatternFromIsoDateValue(incomingStartDate);
  if (
    !dateImpliedPattern ||
    incomingPattern !== dateImpliedPattern ||
    existingPattern === dateImpliedPattern
  ) {
    return false;
  }

  const existingStartTime = normalizeTime(asTrimmedString(existing.startTime));
  const incomingStartTime = normalizeTime(asTrimmedString(incoming.startTime));
  if (!existingStartTime || !incomingStartTime || existingStartTime !== incomingStartTime) {
    return false;
  }

  const existingTitle = normalizeRecurringFamilyTitle(existing);
  const incomingTitle = normalizeRecurringFamilyTitle(incoming);
  if (!existingTitle || !incomingTitle || existingTitle !== incomingTitle) {
    return false;
  }

  return true;
}

function selectRecurringLifecycleMerge(
  existing: EventData,
  incoming: EventData
): {
  recurringPattern?: string;
  recurringDaysOfWeek?: RecurringWeekday[];
  recurringWeekdaySequence?: RecurringWeekday[];
  recurringWeekInterval?: number;
  totalOccurrences?: number;
  recurrenceUntilDate?: string;
  isRecurring?: boolean;
  forceIsRecurring: boolean;
} {
  const existingPattern = normalizeRecurringPatternToken(existing.recurringPattern);
  const incomingPattern = normalizeRecurringPatternToken(incoming.recurringPattern);
  const existingRecurringDays = normalizeRecurringWeekdayListValue(existing.recurringDaysOfWeek);
  const incomingRecurringDays = normalizeRecurringWeekdayListValue(incoming.recurringDaysOfWeek);
  const existingRecurringSequence = normalizeRecurringWeekdayListValue(
    existing.recurringWeekdaySequence
  );
  const incomingRecurringSequence = normalizeRecurringWeekdayListValue(
    incoming.recurringWeekdaySequence
  );
  const existingRecurringWeekInterval =
    normalizeRecurringWeekIntervalValue(existing.recurringWeekInterval) || 1;
  const incomingRecurringWeekInterval =
    normalizeRecurringWeekIntervalValue(incoming.recurringWeekInterval) || 1;
  const existingTotal = parsePositiveIntegerValue(existing.totalOccurrences);
  const incomingTotal = parsePositiveIntegerValue(incoming.totalOccurrences);
  const existingUntil = normalizeIsoDateValue(existing.recurrenceUntilDate);
  const incomingUntil = normalizeIsoDateValue(incoming.recurrenceUntilDate);
  const existingRecurringState = normalizeFlagState(existing.isRecurring);
  const incomingRecurringState = normalizeFlagState(incoming.isRecurring);

  let recurringPattern: string | undefined;
  let recurringDaysOfWeek: RecurringWeekday[] | undefined;
  let recurringWeekdaySequence: RecurringWeekday[] | undefined;
  let recurringWeekInterval: number | undefined;
  let totalOccurrences: number | undefined;
  let recurrenceUntilDate: string | undefined;
  let isRecurring: boolean | undefined;

  const existingHasPattern = Boolean(existingPattern && existingPattern !== 'none');
  const incomingHasPattern = Boolean(incomingPattern && incomingPattern !== 'none');
  const existingHasCustomSchedule = Boolean(
    (existingRecurringDays && existingRecurringDays.length > 0) ||
      (existingRecurringSequence && existingRecurringSequence.length > 0)
  );
  const incomingHasCustomSchedule = Boolean(
    (incomingRecurringDays && incomingRecurringDays.length > 0) ||
      (incomingRecurringSequence && incomingRecurringSequence.length > 0)
  );
  const existingLooksLikeBroadWeekdayFallback =
    existingPattern === 'weekly_custom' &&
    !existingRecurringSequence?.length &&
    isWeekdayOnlyRecurringSet(existingRecurringDays);
  const incomingHasSpecificWeeklyPattern =
    incomingHasPattern &&
    incomingPattern !== 'weekly_custom' &&
    incomingPattern.startsWith('weekly_');

  if (incomingRecurringState === 'no' && !incomingHasPattern && !incomingHasCustomSchedule) {
    const shouldClearRecurring =
      existingHasPattern ||
      existingHasCustomSchedule ||
      existingRecurringState === 'yes' ||
      existingTotal !== undefined ||
      existingUntil !== undefined;

    if (shouldClearRecurring) {
      return {
        recurringPattern: 'none',
        recurringDaysOfWeek: [],
        recurringWeekdaySequence: [],
        recurringWeekInterval: 1,
        totalOccurrences: 0,
        recurrenceUntilDate: '',
        isRecurring: false,
        forceIsRecurring: false,
      };
    }
  }

  const shouldCorrectSimpleWeeklyPattern = shouldCorrectConflictingSimpleWeeklyPattern(
    existing,
    incoming,
    existingPattern,
    incomingPattern,
    existingHasCustomSchedule,
    incomingHasCustomSchedule
  );
  if (shouldCorrectSimpleWeeklyPattern) {
    recurringPattern = incomingPattern;
    recurringDaysOfWeek = [];
    recurringWeekdaySequence = [];
    recurringWeekInterval = 1;
  }

  if (incomingHasCustomSchedule) {
    recurringPattern = 'weekly_custom';
    recurringDaysOfWeek = incomingRecurringDays ?? [];
    recurringWeekdaySequence = incomingRecurringSequence ?? [];
    recurringWeekInterval = incomingRecurringWeekInterval;
  } else if (existingLooksLikeBroadWeekdayFallback && incomingHasSpecificWeeklyPattern) {
    recurringPattern = incomingPattern;
    recurringDaysOfWeek = [];
    recurringWeekdaySequence = [];
    recurringWeekInterval = 1;
  } else if (
    existingHasCustomSchedule &&
    incomingHasPattern &&
    incomingPattern !== 'weekly_custom' &&
    getRecurringPatternSpecificityRank(incomingPattern) >=
      getRecurringPatternSpecificityRank(existingPattern)
  ) {
    recurringDaysOfWeek = [];
    recurringWeekdaySequence = [];
    recurringWeekInterval = 1;
  }

  if (
    !incomingHasCustomSchedule &&
    incomingHasPattern &&
    (
      !existingHasPattern ||
      getRecurringPatternSpecificityRank(incomingPattern) >
        getRecurringPatternSpecificityRank(existingPattern)
    )
  ) {
    recurringPattern = incomingPattern;
  }

  if (incomingTotal !== undefined && (existingTotal === undefined || incomingTotal > existingTotal)) {
    totalOccurrences = incomingTotal;
  }

  if (incomingUntil && (!existingUntil || incomingUntil > existingUntil)) {
    recurrenceUntilDate = incomingUntil;
  }

  const forceIsRecurring = Boolean(
    incomingHasPattern ||
      incomingHasCustomSchedule ||
      totalOccurrences ||
      recurrenceUntilDate
  );

  return {
    recurringPattern,
    recurringDaysOfWeek,
    recurringWeekdaySequence,
    recurringWeekInterval,
    totalOccurrences,
    recurrenceUntilDate,
    isRecurring,
    forceIsRecurring,
  };
}

function getRecurringPatternSpecificityRank(pattern: string): number {
  if (!pattern || pattern === 'none') return 0;
  if (pattern === 'daily') return 1;
  if (pattern === 'weekly_custom') return 3;
  if (pattern.startsWith('weekly_')) return 2;
  return 0;
}

function valuesDiffer(existingValue: unknown, newValue: unknown): boolean {
  return serializeComparable(existingValue) !== serializeComparable(newValue);
}

function serializeComparable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      const converted = (value as { toDate: () => Date }).toDate();
      return `date:${converted.toISOString()}`;
    } catch {
      // fall through to generic object serialization
    }
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => serializeComparable(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${key}:${serializeComparable(record[key])}`).join(',')}}`;
  }
  return String(value);
}

const CATEGORY_UNKNOWN_TOKENS = new Set<string>(['other', 'uncategorized', 'unknown', 'misc']);
const CATEGORY_LOW_SIGNAL_TOKENS = new Set<string>(['gatherings & parties', 'family friendly']);
const rawCategoryMargin = Number.parseFloat(process.env.CATEGORY_SOURCE_CONFIDENCE_MARGIN || '0.15');
const CATEGORY_SOURCE_CONFIDENCE_MARGIN = Number.isFinite(rawCategoryMargin)
  ? rawCategoryMargin
  : 0.15;

function normalizeCategoryToken(value: unknown): string {
  return asTrimmedString(value).toLowerCase();
}

function getCategorySpecificityRank(value: unknown): number {
  const normalized = normalizeCategoryToken(value);
  if (!normalized || CATEGORY_UNKNOWN_TOKENS.has(normalized)) return 0;
  if (CATEGORY_LOW_SIGNAL_TOKENS.has(normalized)) return 1;
  return 2;
}

function getEventSourceUrls(event: EventData): string[] {
  const urls = [event.facebookUrl, event.cleanedFacebookUrl]
    .map((value) => asTrimmedString(value))
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function resolveEventSourceType(
  event: EventData,
  venue: VenueData
): 'venue_owned' | 'external' | 'unknown' {
  const sourceUrls = getEventSourceUrls(event);
  if (sourceUrls.length === 0) return 'unknown';
  if (sourceUrls.some((url) => isFirstPartyVenuePost(url, venue))) {
    return 'venue_owned';
  }
  return 'external';
}

function computeCategorySourceConfidence(event: EventData, venue: VenueData): number {
  const sourceType = resolveEventSourceType(event, venue);
  if (sourceType === 'venue_owned') return 1.0;
  if (sourceType === 'external') return 0.4;
  return 0.6;
}

function shouldPromoteCategory(
  existingValue?: string,
  incomingValue?: string,
  context?: {
    existingSourceScore: number;
    incomingSourceScore: number;
  }
): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (normalizeCategoryToken(existing) === normalizeCategoryToken(incoming)) return false;

  const existingRank = getCategorySpecificityRank(existing);
  const incomingRank = getCategorySpecificityRank(incoming);

  // Promote low-signal categories (e.g., Gatherings & Parties) into more specific categories.
  if (incomingRank > existingRank) return true;
  if (incomingRank < existingRank) return false;

  // For equally specific but conflicting categories, arbitrate by source confidence.
  const existingScore = context?.existingSourceScore ?? 0.5;
  const incomingScore = context?.incomingSourceScore ?? 0.5;

  return incomingScore >= existingScore + CATEGORY_SOURCE_CONFIDENCE_MARGIN;
}

function shouldPromoteEventType(existingValue: string, incomingValue: string): boolean {
  const existing = asTrimmedString(existingValue).toLowerCase();
  const incoming = asTrimmedString(incomingValue).toLowerCase();
  if (!incoming) return false;
  if (!existing) return true;
  return (existing === 'event' || existing === 'other') && incoming !== existing;
}

function normalizeFlagState(value: unknown): 'yes' | 'no' | 'unknown' {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized === 'yes' || normalized === 'true' || normalized === '1') return 'yes';
  if (normalized === 'no' || normalized === 'false' || normalized === '0') return 'no';
  return 'unknown';
}

function resolvePreferredFlag(
  existingValue: EventData['isEvent'] | EventData['isFoodSpecial'],
  incomingValue: EventData['isEvent'] | EventData['isFoodSpecial']
): EventData['isEvent'] | EventData['isFoodSpecial'] | undefined {
  const existingState = normalizeFlagState(existingValue);
  const incomingState = normalizeFlagState(incomingValue);
  if (incomingState === 'unknown') return undefined;
  if (existingState === 'unknown') return incomingValue;
  if (incomingState === 'yes' && existingState !== 'yes') return incomingValue;
  return undefined;
}

function shouldReplaceDescription(existingValue?: string, incomingValue?: string): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (existing === incoming) return false;
  if (incoming.includes(existing) && incoming.length > existing.length) return true;
  if (existing.includes(incoming)) return false;
  if (existing.length < 60 && incoming.length >= existing.length + 30) return true;
  return incoming.length > existing.length * 1.4;
}

const AUTHORITATIVE_FAMILY_SHAPE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'hst',
  'plus',
  'the',
]);

function getAuthoritativeFamilyTitleTokens(value: unknown): string[] {
  return normalizeVenueName(asTrimmedString(value))
    .split(' ')
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 &&
        !AUTHORITATIVE_FAMILY_SHAPE_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token)
    );
}

function isOrderedTokenSubsequence(shorterTokens: string[], longerTokens: string[]): boolean {
  if (!shorterTokens.length || !longerTokens.length || shorterTokens.length > longerTokens.length) {
    return false;
  }

  let shorterIndex = 0;
  for (const token of longerTokens) {
    if (token === shorterTokens[shorterIndex]) {
      shorterIndex += 1;
      if (shorterIndex === shorterTokens.length) {
        return true;
      }
    }
  }

  return false;
}

function hasTightAuthoritativeFamilyTitleMatch(
  existingEvent: EventData,
  incomingEvent: EventData
): boolean {
  const existingTokens = getAuthoritativeFamilyTitleTokens(
    asTrimmedString(existingEvent.name) || asTrimmedString(existingEvent.eventName)
  );
  const incomingTokens = getAuthoritativeFamilyTitleTokens(
    asTrimmedString(incomingEvent.name) || asTrimmedString(incomingEvent.eventName)
  );

  if (!existingTokens.length || !incomingTokens.length) {
    return false;
  }

  const shorterTokens =
    existingTokens.length <= incomingTokens.length ? existingTokens : incomingTokens;
  const longerTokens =
    shorterTokens === existingTokens ? incomingTokens : existingTokens;

  return shorterTokens.length >= 3 && isOrderedTokenSubsequence(shorterTokens, longerTokens);
}

function getDuplicateMergeContentBucket(event: EventData): 'food_special' | 'event' {
  const normalizedEventType = asTrimmedString(event.eventType).toLowerCase();
  const isFoodSpecial = normalizeFlagState(event.isFoodSpecial) === 'yes';
  if (
    isFoodSpecial ||
    normalizedEventType === 'food_special' ||
    normalizedEventType === 'drink_special' ||
    normalizedEventType === 'happy_hour' ||
    normalizedEventType === 'wing_night' ||
    normalizedEventType === 'brunch'
  ) {
    return 'food_special';
  }

  return 'event';
}

function sourceTimestampIsNotOlder(existingEvent: EventData, incomingEvent: EventData): boolean {
  const incomingSourceTimestamp = coerceDate(incomingEvent.sourceTimestamp);
  if (!incomingSourceTimestamp) return false;

  const existingSourceTimestamp = coerceDate(existingEvent.sourceTimestamp);
  if (!existingSourceTimestamp) return true;

  return incomingSourceTimestamp.getTime() >= existingSourceTimestamp.getTime();
}

function shouldPromoteAuthoritativeCurrentFamilyShape(
  existingEvent: EventData,
  incomingEvent: EventData
): boolean {
  if (!sourceTimestampIsNotOlder(existingEvent, incomingEvent)) {
    return false;
  }

  if (getDuplicateMergeContentBucket(existingEvent) !== getDuplicateMergeContentBucket(incomingEvent)) {
    return false;
  }

  if (!hasTightAuthoritativeFamilyTitleMatch(existingEvent, incomingEvent)) {
    return false;
  }

  if (isRecurringLikeEvent(incomingEvent)) {
    return false;
  }

  const incomingStartDate = normalizeIsoDateValue(incomingEvent.startDate);
  const incomingEndDate = normalizeIsoDateValue(incomingEvent.endDate);
  if (!incomingStartDate || !incomingEndDate || incomingStartDate === incomingEndDate) {
    return false;
  }

  const existingStartDate = normalizeIsoDateValue(existingEvent.startDate);
  const existingEndDate = normalizeIsoDateValue(existingEvent.endDate);
  const existingIsSingleDay = Boolean(
    existingStartDate &&
      (!existingEndDate || existingStartDate === existingEndDate)
  );
  if (!(isRecurringLikeEvent(existingEvent) || existingIsSingleDay)) {
    return false;
  }

  if (!existingStartDate || incomingStartDate <= existingStartDate) {
    return false;
  }

  const existingStartTime = toComparableTime(asTrimmedString(existingEvent.startTime));
  const incomingStartTime = toComparableTime(asTrimmedString(incomingEvent.startTime));
  if (!existingStartTime || !incomingStartTime || existingStartTime !== incomingStartTime) {
    return false;
  }

  const existingEndTime = toComparableTime(asTrimmedString(existingEvent.endTime));
  const incomingEndTime = toComparableTime(asTrimmedString(incomingEvent.endTime));
  if (!existingEndTime || !incomingEndTime || existingEndTime !== incomingEndTime) {
    return false;
  }

  return isMeaningfulValue(incomingEvent.description);
}

function normalizeDateToken(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : trimmed;
}

function shouldReplaceDateField(
  existingValue: string | undefined,
  incomingValue: string | undefined
): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (normalizeDateToken(existing) === normalizeDateToken(incoming)) return false;
  return existing.includes('T') && /^\d{4}-\d{2}-\d{2}$/.test(incoming);
}

function isRecurringLikeEvent(event: Pick<EventData, 'isRecurring' | 'recurringPattern'>): boolean {
  const pattern = normalizeRecurringPatternToken(event.recurringPattern);
  const recurringState = normalizeFlagState(event.isRecurring);
  return recurringState === 'yes' || (pattern.length > 0 && pattern !== 'none');
}

function resolveOccurrenceLocalEndDate(
  event: Pick<EventData, 'startDate' | 'startTime' | 'endTime'>
): string | undefined {
  const startDate = normalizeIsoDateValue(event.startDate);
  if (!startDate) return undefined;

  const startTime = normalizeTime(asTrimmedString(event.startTime));
  const endTime = normalizeTime(asTrimmedString(event.endTime));
  if (startTime && endTime) {
    return calculateEndDate(startDate, startTime, endTime);
  }

  return startDate;
}

function incomingRepresentsOccurrenceLocalSpan(
  existingEvent: EventData,
  incomingEvent: EventData
): boolean {
  if (!(isRecurringLikeEvent(existingEvent) || isRecurringLikeEvent(incomingEvent))) {
    return false;
  }

  const incomingEndDate = normalizeIsoDateValue(incomingEvent.endDate);
  const expectedIncomingEndDate = resolveOccurrenceLocalEndDate(incomingEvent);
  if (!incomingEndDate || !expectedIncomingEndDate) {
    return false;
  }

  return incomingEndDate === expectedIncomingEndDate;
}

function shouldReplaceEndDateField(existingEvent: EventData, incomingEvent: EventData): boolean {
  const existingStartDate = normalizeIsoDateValue(existingEvent.startDate);
  const incomingStartDate = normalizeIsoDateValue(incomingEvent.startDate);
  const startDateWillBeReplaced = shouldReplaceDateField(
    existingEvent.startDate,
    incomingEvent.startDate
  );
  if (
    !startDateWillBeReplaced &&
    existingStartDate &&
    incomingStartDate &&
    existingStartDate !== incomingStartDate
  ) {
    return false;
  }

  if (shouldReplaceDateField(existingEvent.endDate, incomingEvent.endDate)) {
    return true;
  }

  if (!incomingRepresentsOccurrenceLocalSpan(existingEvent, incomingEvent)) {
    return false;
  }

  const existingEndDate = normalizeIsoDateValue(existingEvent.endDate);
  const incomingEndDate = normalizeIsoDateValue(incomingEvent.endDate);
  if (!incomingEndDate) {
    return false;
  }

  if (!existingEndDate) {
    return true;
  }

  return existingEndDate !== incomingEndDate;
}

function toComparableTime(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return '';

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/i);
  if (twelveHour) {
    let hour = parseInt(twelveHour[1], 10);
    const minute = twelveHour[2];
    const suffix = twelveHour[3].toLowerCase();
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  }

  return raw.replace(/\s+/g, '');
}

function hhmmToMinutes(value: string): number | null {
  const match = String(value || '')
    .trim()
    .match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getTimeFlagSource(value: unknown, side: 'start' | 'end'): string {
  const flags = asRecord(value);
  if (!flags) return '';
  const sideValue = asRecord(flags[side]);
  if (!sideValue) return '';
  return String(sideValue.source || '').trim().toLowerCase();
}

function getTimeFlagEvidence(value: unknown, side: 'start' | 'end'): string {
  const flags = asRecord(value);
  if (!flags) return '';
  const sideValue = asRecord(flags[side]);
  if (!sideValue) return '';
  return String(sideValue.evidence || '').trim();
}

function normalizeComparableEvidenceTimeToken(
  token: string,
  impliedMeridiem?: string
): string {
  const normalized = token.trim().toLowerCase().replace(/\./g, '');
  if (!normalized) return '';

  const explicitMeridiemMatch = normalized.match(/(am|pm)$/);
  const explicitMeridiem = explicitMeridiemMatch?.[1] || '';
  let body = explicitMeridiem ? normalized.slice(0, -explicitMeridiem.length).trim() : normalized;
  const normalizedTime = normalizeTime(`${body}${explicitMeridiem || impliedMeridiem || ''}`);
  return normalizedTime ? toComparableTime(normalizedTime) : '';
}

function getComparableEventClockContext(
  primaryEvent: EventData,
  counterpartEvent?: EventData
): { expectedStart?: string; expectedEnd?: string } {
  const primaryStart = toComparableTime(asTrimmedString(primaryEvent.startTime));
  const primaryEnd = toComparableTime(asTrimmedString(primaryEvent.endTime));
  const counterpartStart = counterpartEvent
    ? toComparableTime(asTrimmedString(counterpartEvent.startTime))
    : '';
  const counterpartEnd = counterpartEvent
    ? toComparableTime(asTrimmedString(counterpartEvent.endTime))
    : '';

  return {
    expectedStart: counterpartStart || primaryStart || undefined,
    expectedEnd: counterpartEnd || primaryEnd || undefined,
  };
}

function extractComparableTimesFromEvidence(
  evidence: string,
  context?: { expectedStart?: string; expectedEnd?: string }
): string[] {
  const normalized = evidence.trim().toLowerCase().replace(/[–—]/g, '-').replace(/\./g, '');
  if (!normalized) return [];

  const rangeWithTrailingMeridiem = normalized.match(
    /(\d{1,2}(?::\d{2})?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)\b/i
  );
  if (rangeWithTrailingMeridiem) {
    const resolvedRange = resolveComparableRangeTimesFromEvidence(
      rangeWithTrailingMeridiem[1],
      '',
      rangeWithTrailingMeridiem[2],
      rangeWithTrailingMeridiem[3]
    );
    if (resolvedRange) return resolvedRange;
  }

  const bareRangeMatch = normalized.match(
    /\b(\d{1,2}(?::\d{2})?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\b/i
  );
  if (bareRangeMatch && (context?.expectedStart || context?.expectedEnd)) {
    const resolvedRange = resolveComparableRangeTimesFromEvidence(
      bareRangeMatch[1],
      '',
      bareRangeMatch[2],
      '',
      context
    );
    if (resolvedRange) return resolvedRange;
  }

  const explicitTokens = normalized.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) || [];
  return explicitTokens
    .map((token) => normalizeComparableEvidenceTimeToken(token))
    .filter(Boolean);
}

function resolveComparableRangeTimesFromEvidence(
  startRaw: string,
  startPeriodRaw: string,
  endRaw: string,
  endPeriodRaw: string,
  context?: { expectedStart?: string; expectedEnd?: string }
): [string, string] | null {
  const normalizedStartRaw = String(startRaw || '').trim();
  const normalizedEndRaw = String(endRaw || '').trim();
  const startPeriod = String(startPeriodRaw || '').trim().toUpperCase();
  const endPeriod = String(endPeriodRaw || '').trim().toUpperCase();
  if (!normalizedStartRaw || !normalizedEndRaw) return null;

  const startCandidates = startPeriod
    ? [{ period: startPeriod, inferred: false }]
    : !endPeriod
      ? [
          { period: 'AM', inferred: true },
          { period: 'PM', inferred: true },
        ]
    : endPeriod
      ? [
          { period: endPeriod, inferred: false },
          { period: endPeriod === 'AM' ? 'PM' : 'AM', inferred: true },
        ]
      : [];
  const endCandidates = endPeriod
    ? [{ period: endPeriod, inferred: false }]
    : !startPeriod
      ? [
          { period: 'AM', inferred: true },
          { period: 'PM', inferred: true },
        ]
    : startPeriod
      ? [
          { period: startPeriod, inferred: false },
          { period: startPeriod === 'AM' ? 'PM' : 'AM', inferred: true },
        ]
      : [];

  let best:
    | {
        startTime: string;
        endTime: string;
        durationMinutes: number;
        longPenalty: number;
        inferencePenalty: number;
        contextPenalty: number;
      }
    | null = null;

  for (const startCandidate of startCandidates) {
    const startTime = normalizeComparableEvidenceTimeToken(
      normalizedStartRaw,
      startCandidate.period
    );
    const startMinutes = hhmmToMinutes(startTime);
    if (!startTime || startMinutes === null) continue;

    for (const endCandidate of endCandidates) {
      const endTime = normalizeComparableEvidenceTimeToken(normalizedEndRaw, endCandidate.period);
      const endMinutes = hhmmToMinutes(endTime);
      if (!endTime || endMinutes === null) continue;

      let durationMinutes = endMinutes - startMinutes;
      if (durationMinutes <= 0) durationMinutes += 24 * 60;
      if (durationMinutes <= 0 || durationMinutes > 12 * 60) continue;

      const candidate = {
        startTime,
        endTime,
        durationMinutes,
        longPenalty: durationMinutes > 6 * 60 ? 1 : 0,
        inferencePenalty:
          (startCandidate.inferred ? 1 : 0) + (endCandidate.inferred ? 1 : 0),
        contextPenalty:
          (context?.expectedStart && context.expectedStart !== startTime ? 1 : 0) +
          (context?.expectedEnd && context.expectedEnd !== endTime ? 1 : 0),
      };

      if (
        !best ||
        candidate.contextPenalty < best.contextPenalty ||
        (candidate.contextPenalty === best.contextPenalty &&
          candidate.longPenalty < best.longPenalty) ||
        (candidate.contextPenalty === best.contextPenalty &&
          candidate.longPenalty === best.longPenalty &&
          candidate.inferencePenalty < best.inferencePenalty) ||
        (candidate.contextPenalty === best.contextPenalty &&
          candidate.longPenalty === best.longPenalty &&
          candidate.inferencePenalty === best.inferencePenalty &&
          candidate.durationMinutes < best.durationMinutes)
      ) {
        best = candidate;
      }
    }
  }

  return best ? [best.startTime, best.endTime] : null;
}

function getEventSourceType(event: EventData): string {
  const record = event as unknown as Record<string, unknown>;
  return String(record._sourceType || '').trim().toLowerCase();
}

function hasExplicitRangeEvidenceString(value: string): boolean {
  return /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i.test(
    value
  );
}

function hasUsableTimeFlagEvidence(event: EventData): boolean {
  const context = getComparableEventClockContext(event);
  return (['start', 'end'] as const).some((side) => {
    const evidence = getTimeFlagEvidence(event.timeFlags, side);
    if (!evidence) return false;
    return extractComparableTimesFromEvidence(evidence, context).length > 0;
  });
}

function extractSingleClearScheduleRangeEvidence(text: string): string {
  const normalized = String(text || '').replace(/[â€“â€”]/g, '-');
  const matches = Array.from(
    normalized.matchAll(
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi
    )
  );
  if (matches.length !== 1) return '';
  return matches[0]?.[0]?.trim() || '';
}

const TITLE_FAMILY_STOPWORDS = new Set([
  'with',
  'w',
  'the',
  'and',
  'studio',
  'class',
  'classes',
]);

function normalizeTitleFamilyTokens(value: unknown): string[] {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !TITLE_FAMILY_STOPWORDS.has(token));
}

function hasConsistentScheduleRangeTitleFamily(
  existingEvent: EventData,
  incomingEvent: EventData
): boolean {
  const existingTokens = normalizeTitleFamilyTokens(
    asTrimmedString(existingEvent.name) || asTrimmedString(existingEvent.eventName)
  );
  const incomingTokens = normalizeTitleFamilyTokens(
    asTrimmedString(incomingEvent.name) || asTrimmedString(incomingEvent.eventName)
  );
  if (existingTokens.length === 0 || incomingTokens.length === 0) return false;

  const sharedCount = existingTokens.filter((token) => incomingTokens.includes(token)).length;
  return sharedCount >= Math.min(2, existingTokens.length, incomingTokens.length);
}

function hasIncomingScheduleExplicitRangeForMerge(incomingEvent: EventData): boolean {
  if (getEventSourceType(incomingEvent) !== 'schedule') return false;
  if (getTimeFlagSource(incomingEvent.timeFlags, 'start') !== 'explicit') return false;
  if (getTimeFlagSource(incomingEvent.timeFlags, 'end') !== 'explicit') return false;
  const evidence =
    getTimeFlagEvidence(incomingEvent.timeFlags, 'start') ||
    getTimeFlagEvidence(incomingEvent.timeFlags, 'end');
  if (!hasExplicitRangeEvidenceString(evidence)) return false;
  const context = getComparableEventClockContext(incomingEvent);
  return extractComparableTimesFromEvidence(evidence, context).length >= 2;
}

function shouldUseDescriptionRangeFallback(
  existingEvent: EventData,
  incomingEvent?: EventData
): boolean {
  if (!incomingEvent) return false;
  if (hasUsableTimeFlagEvidence(existingEvent)) return false;
  if (!hasIncomingScheduleExplicitRangeForMerge(incomingEvent)) return false;
  if (!hasConsistentScheduleRangeTitleFamily(existingEvent, incomingEvent)) return false;
  return Boolean(extractSingleClearScheduleRangeEvidence(asTrimmedString(existingEvent.description)));
}

function getEvidenceComparableTime(
  event: EventData,
  side: 'start' | 'end',
  options?: {
    counterpartEvent?: EventData;
    allowDescriptionFallback?: boolean;
  }
): string {
  const context = getComparableEventClockContext(event, options?.counterpartEvent);
  const evidence = getTimeFlagEvidence(event.timeFlags, side);
  const comparableTimes = evidence
    ? extractComparableTimesFromEvidence(evidence, context)
    : [];
  if (comparableTimes.length > 0) {
    return side === 'end'
      ? comparableTimes[comparableTimes.length - 1] || ''
      : comparableTimes[0] || '';
  }

  if (
    options?.allowDescriptionFallback &&
    shouldUseDescriptionRangeFallback(event, options.counterpartEvent)
  ) {
    const descriptionRange = extractSingleClearScheduleRangeEvidence(
      asTrimmedString(event.description)
    );
    const descriptionComparableTimes = extractComparableTimesFromEvidence(
      descriptionRange,
      context
    );
    if (descriptionComparableTimes.length > 0) {
      return side === 'end'
        ? descriptionComparableTimes[descriptionComparableTimes.length - 1] || ''
        : descriptionComparableTimes[0] || '';
    }
  }

  return '';
}

function selectPreferredIncomingTimeMergeValue(
  existingEvent: EventData,
  incomingEvent: EventData,
  side: 'start' | 'end',
  incomingValue: string | undefined
): string | undefined {
  const incoming = asTrimmedString(incomingValue);
  if (!isExplicitIncomingTime(incomingEvent, side)) {
    return incoming || undefined;
  }

  const evidenceComparable = getEvidenceComparableTime(incomingEvent, side);
  if (!evidenceComparable) {
    return incoming || undefined;
  }

  const incomingComparable = toComparableTime(incoming);
  if (!incomingComparable || incomingComparable === evidenceComparable) {
    return incoming || evidenceComparable;
  }

  const existingEvidenceComparable = getEvidenceComparableTime(existingEvent, side, {
    counterpartEvent: incomingEvent,
    allowDescriptionFallback: true,
  });
  if (existingEvidenceComparable && existingEvidenceComparable === evidenceComparable) {
    return evidenceComparable;
  }

  return incoming;
}

function isInferredExistingTime(event: EventData, side: 'start' | 'end'): boolean {
  const source = getTimeFlagSource(event.timeFlags, side);
  if (source === 'implied' || source === 'semantic' || source === 'none') return true;

  const resolution = asRecord(event.timeResolution);
  if (!resolution) return false;

  if (side === 'start') {
    return resolution.startFromHours === true || resolution.startFromPostTime === true;
  }

  const endFromHours = String(resolution.endFromHours || '').trim().toLowerCase();
  return endFromHours === 'category_default' || endFromHours === 'duration_default';
}

function isExplicitIncomingTime(event: EventData, side: 'start' | 'end'): boolean {
  const source = getTimeFlagSource(event.timeFlags, side);
  if (source === 'explicit') return true;

  const resolution = asRecord(event.timeResolution);
  if (!resolution) return true;

  if (side === 'start') {
    return resolution.startFromHours !== true && resolution.startFromPostTime !== true;
  }

  const endFromHours = String(resolution.endFromHours || '').trim().toLowerCase();
  return endFromHours !== 'category_default' && endFromHours !== 'duration_default';
}

function getEndTimeInferenceRank(event: EventData): number {
  const source = getTimeFlagSource(event.timeFlags, 'end');
  if (source === 'explicit') return 4;

  const resolution = asRecord(event.timeResolution);
  const endFromHours = String(resolution?.endFromHours || '').trim().toLowerCase();
  if (endFromHours === 'duration_default') return 3;
  if (endFromHours === 'category_default') return 2;
  if (endFromHours === 'to_close') return 1;
  return 0;
}

function shouldPreferIncomingInferredEndTime(
  existingEvent: EventData,
  incomingEvent: EventData,
  existingValue: string,
  incomingValue: string
): boolean {
  if (!existingValue || !incomingValue) return false;
  if (toComparableTime(existingValue) === toComparableTime(incomingValue)) return false;
  if (!isInferredExistingTime(existingEvent, 'end')) return false;
  if (isExplicitIncomingTime(incomingEvent, 'end')) return false;

  const incomingRank = getEndTimeInferenceRank(incomingEvent);
  const existingRank = getEndTimeInferenceRank(existingEvent);
  if (incomingRank > existingRank) {
    return true;
  }

  if (incomingRank === existingRank && incomingRank > 0) {
    const existingStartEvidence = getEvidenceComparableTime(existingEvent, 'start', {
      counterpartEvent: incomingEvent,
      allowDescriptionFallback: true,
    });
    const incomingStartEvidence = getEvidenceComparableTime(incomingEvent, 'start');
    if (
      existingStartEvidence &&
      incomingStartEvidence &&
      existingStartEvidence === incomingStartEvidence
    ) {
      return true;
    }
  }

  return false;
}

function shouldReplaceTimeField(
  existingValue: string | undefined,
  incomingValue: string | undefined,
  existingEvent: EventData,
  incomingEvent: EventData,
  side: 'start' | 'end'
): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (toComparableTime(existing) === toComparableTime(incoming)) return false;
  if (toComparableTime(existing) === '00:00' && toComparableTime(incoming) !== '00:00') {
    return true;
  }

  const incomingExplicit = isExplicitIncomingTime(incomingEvent, side);
  const existingEvidenceComparable = getEvidenceComparableTime(existingEvent, side, {
    counterpartEvent: incomingEvent,
    allowDescriptionFallback: true,
  });
  if (
    incomingExplicit &&
    existingEvidenceComparable === toComparableTime(incoming) &&
    existingEvidenceComparable !== toComparableTime(existing)
  ) {
    return true;
  }

  if (
    side === 'end' &&
    shouldPreferIncomingInferredEndTime(existingEvent, incomingEvent, existing, incoming)
  ) {
    return true;
  }

  return isInferredExistingTime(existingEvent, side) && incomingExplicit;
}

function shouldReplacePriceValue(
  existingValue: string | undefined,
  incomingValue: string | undefined
): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  const existingSoldOut = existing.toLowerCase().includes('sold out');
  const incomingSoldOut = incoming.toLowerCase().includes('sold out');
  if (incomingSoldOut && !existingSoldOut) return true;
  return incoming.length > existing.length * 1.35;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function selectHigherMetricValue(existingValue: unknown, incomingValue: unknown): number | undefined {
  const incomingNumber = parseNumericValue(incomingValue);
  if (incomingNumber === null) return undefined;
  const existingNumber = parseNumericValue(existingValue);
  if (existingNumber === null || incomingNumber > existingNumber) {
    return incomingNumber;
  }
  return undefined;
}

function selectPreferredUsersResponded(
  existingValue?: string,
  incomingValue?: string
): string | undefined {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return undefined;
  if (!existing) return incoming;

  const existingNumber = parseNumericValue(existing);
  const incomingNumber = parseNumericValue(incoming);
  if (incomingNumber !== null && (existingNumber === null || incomingNumber > existingNumber)) {
    return incoming;
  }

  if (incomingNumber === null && existingNumber === null && incoming.length > existing.length) {
    return incoming;
  }

  return undefined;
}

function coerceDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && value !== null && '_seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as { _seconds?: unknown })._seconds);
    if (Number.isFinite(seconds)) {
      return new Date(seconds * 1000);
    }
  }
  return null;
}

function selectNewerDate(existingValue: unknown, incomingValue: unknown): Date | undefined {
  const incomingDate = coerceDate(incomingValue);
  if (!incomingDate) return undefined;
  const existingDate = coerceDate(existingValue);
  if (!existingDate || incomingDate.getTime() > existingDate.getTime()) {
    return incomingDate;
  }
  return undefined;
}

function normalizeUrlList(urls?: string[]): string[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .map((url) => String(url || '').trim())
    .filter((url) => url.length > 0);
}

function mergeUniqueUrls(existingUrls?: string[], incomingUrls?: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const url of [...normalizeUrlList(existingUrls), ...normalizeUrlList(incomingUrls)]) {
    if (seen.has(url)) continue;
    seen.add(url);
    merged.push(url);
  }
  return merged;
}

function isStorageManagedUrl(url: string): boolean {
  return url.includes('storage.googleapis.com/gathr-uploaded-images/');
}

function shouldReplaceImageUrl(
  existingValue: string | undefined,
  incomingValue: string | undefined,
  allowPromotion: boolean
): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (existing === incoming) return false;
  if (!isStorageManagedUrl(existing) && isStorageManagedUrl(incoming)) return true;
  return allowPromotion;
}

function shouldPromoteCanonicalImageFromNewerDuplicate(
  existing: EventData,
  incoming: EventData,
  hasNewerSourceTimestamp: boolean
): boolean {
  const existingImage = asTrimmedString(existing.relevantImageUrl || existing.image);
  const incomingMediaUrls = normalizeUrlList(incoming.mediaUrls);
  const incomingPreferredMediaUrl =
    incomingMediaUrls.find((url) => isStorageManagedUrl(url)) ||
    incomingMediaUrls[0] ||
    '';
  const incomingImage =
    asTrimmedString(incoming.relevantImageUrl || incoming.image) || incomingPreferredMediaUrl;
  if (!incomingImage || existingImage === incomingImage) return false;
  if (!isStorageManagedUrl(incomingImage)) return false;

  if (hasNewerSourceTimestamp) return true;

  const existingUniqueId = asTrimmedString(existing.uniqueId || existing.id);
  const incomingUniqueId = asTrimmedString(incoming.uniqueId || incoming.id);
  if (!existingUniqueId || !incomingUniqueId || existingUniqueId !== incomingUniqueId) {
    return false;
  }

  if (incomingMediaUrls.length === 0) return false;

  const incomingContainsIncomingImage = incomingMediaUrls.includes(incomingImage);
  const incomingContainsExistingImage = existingImage ? incomingMediaUrls.includes(existingImage) : false;
  if (!incomingContainsIncomingImage || incomingContainsExistingImage) {
    return false;
  }

  return true;
}

function shouldReplaceIconUrl(existingValue: string | undefined, incomingValue: string | undefined): boolean {
  const existing = asTrimmedString(existingValue);
  const incoming = asTrimmedString(incomingValue);
  if (!incoming) return false;
  if (!existing) return true;
  if (existing === incoming) return false;
  if (!isStorageManagedUrl(incoming)) return false;
  return true;
}

/**
 * Resolve dates and times from extracted item and row data
 */
function resolveDatesAndTimes(
  item: ExtractedItem,
  row: RawRowData
): {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
} {
  let startDate = item.startDate || '';
  let endDate = item.endDate || '';
  let startTime = item.startTime || '';
  let endTime = item.endTime || '';

  // Stage 3.5: Use UTC start date from Facebook events if available
  if (row.utcStartDate) {
    const localDateTime = utcToLocal(row.utcStartDate);
    if (localDateTime.date) {
      startDate = localDateTime.date;
    }
    if (localDateTime.time && !startTime) {
      startTime = localDateTime.time;
    }
  }

  // Format dates
  if (startDate) {
    startDate = formatDate(startDate);
  }
  if (endDate) {
    endDate = formatDate(endDate);
  }

  // Normalize times
  if (startTime) {
    startTime = normalizeTime(startTime);
  }
  if (endTime) {
    endTime = normalizeTime(endTime);
  }

  // Calculate end date for overnight events
  if (startDate && startTime && endTime && !endDate) {
    endDate = calculateEndDate(startDate, startTime, endTime);
  }

  // Default end date to start date if not set
  if (!endDate && startDate) {
    endDate = startDate;
  }

  return { startDate, endDate, startTime, endTime };
}

export function summarizeFullParserEvents(
  events: ParserProcessedEvent[]
): Array<Record<string, unknown>> {
  return events.map((event) => ({
    id: event.id || '',
    name: event.name || '',
    category: event.category || '',
    isEvent: event.isEvent || '',
    isFoodSpecial: event.isFoodSpecial || '',
    establishment: event.establishment || '',
    additionalLocation: event.additionalLocation || '',
    locationScope: event.locationScope || '',
    locationLabel: event.locationLabel || '',
    locationCity: event.locationCity || '',
    locationProvince: event.locationProvince || '',
    locationPrecision: event.locationPrecision || '',
    locationReviewStatus: event.locationReviewStatus || '',
    startDate: event.startDate || '',
    startTime: event.startTime || '',
    endDate: event.endDate || '',
    endTime: event.endTime || '',
    isRecurring: event.isRecurring || '',
    recurringPattern: event.recurringPattern || 'none',
    recurringDaysOfWeek: Array.isArray(event.recurringDaysOfWeek) ? event.recurringDaysOfWeek : [],
    recurringWeekdaySequence: Array.isArray(event.recurringWeekdaySequence)
      ? event.recurringWeekdaySequence
      : [],
    recurringWeekInterval:
      typeof event.recurringWeekInterval === 'number' ? event.recurringWeekInterval : null,
    totalOccurrences:
      typeof event.totalOccurrences === 'number' ? event.totalOccurrences : null,
    recurrenceUntilDate: event.recurrenceUntilDate || '',
    ticketLink: event.ticketLink || '',
    ticketsBuyUrl: event.ticketsBuyUrl || '',
    image: event.image || '',
    relevantImageUrl: event.relevantImageUrl || '',
    sharedPostThumbnail: event.sharedPostThumbnail || '',
    timeResolution: event.timeResolution || null,
    timeFlags: event.timeFlags || null,
    _sourceType: (event as unknown as Record<string, unknown>)._sourceType || null,
    description: String(event.description || '').slice(0, 240),
  }));
}

function summarizeGptUsageRecords(
  records: GptUsageRecord[]
): Record<string, unknown> {
  const summary: {
    totalCalls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cachedInputTokens: number;
    byStage: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number }>;
    byComponent: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number }>;
    byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens: number }>;
  } = {
    totalCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedInputTokens: 0,
    byStage: {},
    byComponent: {},
    byModel: {},
  };

  for (const record of records || []) {
    const stage = String(record.stage || 'unknown');
    const component = String(record.component || 'unknown');
    const model = String(record.model || 'unknown');
    const inputTokens = Number(record.inputTokens || 0);
    const outputTokens = Number(record.outputTokens || 0);
    const totalTokens = Number(record.totalTokens || inputTokens + outputTokens);
    const cachedInputTokens = Number(record.cachedInputTokens || 0);

    summary.totalCalls += 1;
    summary.inputTokens += inputTokens;
    summary.outputTokens += outputTokens;
    summary.totalTokens += totalTokens;
    summary.cachedInputTokens += cachedInputTokens;

    if (!summary.byStage[stage]) {
      summary.byStage[stage] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
    }
    summary.byStage[stage].calls += 1;
    summary.byStage[stage].inputTokens += inputTokens;
    summary.byStage[stage].outputTokens += outputTokens;
    summary.byStage[stage].totalTokens += totalTokens;
    summary.byStage[stage].cachedInputTokens += cachedInputTokens;

    if (!summary.byComponent[component]) {
      summary.byComponent[component] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
    }
    summary.byComponent[component].calls += 1;
    summary.byComponent[component].inputTokens += inputTokens;
    summary.byComponent[component].outputTokens += outputTokens;
    summary.byComponent[component].totalTokens += totalTokens;
    summary.byComponent[component].cachedInputTokens += cachedInputTokens;

    if (!summary.byModel[model]) {
      summary.byModel[model] = { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedInputTokens: 0 };
    }
    summary.byModel[model].calls += 1;
    summary.byModel[model].inputTokens += inputTokens;
    summary.byModel[model].outputTokens += outputTokens;
    summary.byModel[model].totalTokens += totalTokens;
    summary.byModel[model].cachedInputTokens += cachedInputTokens;
  }

  return summary;
}

/**
 * Validate row data before processing
 */
export function validateRowData(row: RawRowData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const hasTextContent =
    String(row.text || '').trim().length > 0 ||
    String(row.sharedPostText || '').trim().length > 0 ||
    String(row.ocrText || '').trim().length > 0;
  const hasMediaContent =
    (Array.isArray(row.mediaUrls) &&
      row.mediaUrls.some((url) => String(url || '').trim().length > 0)) ||
    (Array.isArray(row.sharedPostThumbnails) &&
      row.sharedPostThumbnails.some((url) => String(url || '').trim().length > 0));

  // Check for text content
  if (!hasTextContent && !hasMediaContent) {
    errors.push('No text content');
  }

  // Check for establishment
  if (!row.pageName && !row.userName) {
    errors.push('No establishment identifier');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Extract establishment name from row data
 */
export function extractEstablishmentName(row: RawRowData): string {
  // Prefer page name over user name
  const name = row.pageName || row.userName || '';

  // Clean up common suffixes
  return name
    .replace(/\s*\|\s*Charlottetown\s*PE\s*$/i, '')
    .replace(/\s*-\s*Charlottetown\s*$/i, '')
    .trim();
}

/**
 * Combine text content from row
 */
export function combineTextContent(row: RawRowData): string {
  const parts: string[] = [];

  if (row.sharedPostText) {
    parts.push(row.sharedPostText);
  }

  if (row.text) {
    parts.push(row.text);
  }

  return parts.join('\n\n');
}
