// @ts-nocheck
/**
 * Venue Website Enricher
 * Attempts a bounded follow-up against a venue website when Stage 3 items are
 * missing critical event timing and the post explicitly points readers to a site
 * for tickets, showtimes, or more details.
 */

import { DateTime } from 'luxon';
import { EstablishmentInfo, ExtractedItem, ParsingConfig } from './types.js';
import { logger } from '../utils/logger.js';

type VenueWebsiteEnrichmentSummary = {
  attemptedUrls: number;
  candidateUrl?: string;
  usedUrl?: string;
  listingPagesAttempted: number;
  listingPagesFetched: number;
  detailPagesAttempted: number;
  detailPagesFetched: number;
  scriptFetchesAttempted: number;
  scriptFetchesFetched: number;
  apiRequestsAttempted: number;
  apiRecordsFetched: number;
  candidateItemsFound: number;
  appliedCount: number;
  updatedFields: {
    dates: number;
    times: number;
    descriptions: number;
    links: number;
    images: number;
  };
  reason?: string;
};

type WebsiteCandidate = {
  title: string;
  description?: string;
  date?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  startTime?: string;
  endTime?: string;
  imageUrl?: string;
  sourceUrl: string;
  source: 'detail_page' | 'locarius_api';
};

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_HTML_BYTES = 1_000_000;
const DEFAULT_MAX_LISTING_PAGES = 2;
const DEFAULT_MAX_DETAIL_PAGES = 6;
const DEFAULT_MAX_SCRIPT_FETCHES = 3;
const MAX_CANDIDATE_URLS = 2;
const MAX_LOCARIUS_ENDPOINTS = 2;
const WEBSITE_CUE_PATTERN =
  /\b(?:visit\s+(?:our|the)\s+website|website\s+for|tickets?\s+available|tickets?\s+on\s+sale|showtimes?|details?|more\s+info|link\s+in\s+bio)\b/i;
const EVENTISH_LINK_TEXT_PATTERN =
  /\b(?:events?|calendar|programs?|shows?|showtimes?|tickets?|details?)\b/i;
const SOCIAL_HOST_PATTERN =
  /(^|\.)facebook\.com$|(^|\.)instagram\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)youtube\.com$|(^|\.)tiktok\.com$/i;
const TICKET_HOST_PATTERN =
  /(^|\.)ticketpro\.(ca|com)$|(^|\.)eventbrite\.(ca|com)$|(^|\.)veezi\.com$|(^|\.)ticketmaster\.(ca|com)$|(^|\.)showpass\.com$/i;
const EVENT_PATH_PATTERN =
  /\/(?:events?|calendar|programs?|shows?|showtimes?|tickets?)(?:\/|$|\?)/i;
const DETAIL_PATH_BLOCKLIST = new Set([
  '',
  '/',
  '/about',
  '/about-us',
  '/contact',
  '/contact-us',
  '/host-an-event',
  '/trailside-tips',
  '/privacy-policy',
  '/terms',
]);
const MONTH_LOOKUP = new Map([
  ['january', 1],
  ['february', 2],
  ['march', 3],
  ['april', 4],
  ['may', 5],
  ['june', 6],
  ['july', 7],
  ['august', 8],
  ['september', 9],
  ['october', 10],
  ['november', 11],
  ['december', 12],
]);
const TOKEN_STOP_WORDS = new Set([
  'and',
  'at',
  'cinema',
  'details',
  'event',
  'events',
  'for',
  'from',
  'hall',
  'music',
  'show',
  'showtimes',
  'the',
  'tickets',
  'trailside',
  'visit',
  'website',
  'week',
]);
const MISSING_VALUE_TOKENS = new Set(['unknown', 'none', 'n/a', 'na', 'tbd', 'tba']);

const htmlCache = new Map<string, string | null>();
const textCache = new Map<string, string | null>();
const jsonCache = new Map<string, unknown>();

export async function enrichEventsFromVenueWebsite(
  items: ExtractedItem[],
  combinedText: string,
  ocrText: string | undefined,
  timestamp: string,
  establishmentInfo: EstablishmentInfo | undefined,
  config: ParsingConfig
): Promise<{ items: ExtractedItem[]; summary: VenueWebsiteEnrichmentSummary }> {
  const summary: VenueWebsiteEnrichmentSummary = {
    attemptedUrls: 0,
    listingPagesAttempted: 0,
    listingPagesFetched: 0,
    detailPagesAttempted: 0,
    detailPagesFetched: 0,
    scriptFetchesAttempted: 0,
    scriptFetchesFetched: 0,
    apiRequestsAttempted: 0,
    apiRecordsFetched: 0,
    candidateItemsFound: 0,
    appliedCount: 0,
    updatedFields: {
      dates: 0,
      times: 0,
      descriptions: 0,
      links: 0,
      images: 0,
    },
  };

  const inputItems = Array.isArray(items) ? items : [];
  const cfg = resolveWebsiteConfig(config);
  if (!cfg.enabled) {
    summary.reason = 'disabled';
    return { items: inputItems, summary };
  }

  const texts = [combinedText, ocrText || ''].filter(Boolean);
  const websiteCuePresent = texts.some((text) => WEBSITE_CUE_PATTERN.test(String(text || '')));
  const candidateItems = inputItems.filter((item) => shouldAttemptForItem(item));
  if (candidateItems.length === 0) {
    summary.reason = 'no_missing_event_time_candidates';
    return { items: inputItems, summary };
  }

  const candidateUrls = collectVenueWebsiteUrls(texts, establishmentInfo?.website, websiteCuePresent);
  if (candidateUrls.length === 0) {
    summary.reason = websiteCuePresent ? 'no_venue_website_candidates' : 'no_website_cue_or_candidates';
    return { items: inputItems, summary };
  }
  summary.candidateUrl = candidateUrls[0];

  const relevanceTokens = collectRelevanceTokens(
    texts.join(' '),
    inputItems.map((item) => String(item.name || ''))
  );
  const yearHint = resolveYearHint(timestamp, config.timezone);

  for (const candidateUrl of candidateUrls.slice(0, MAX_CANDIDATE_URLS)) {
    summary.attemptedUrls += 1;

    const pageHtml = await fetchHtml(candidateUrl, cfg.timeoutMs, cfg.maxHtmlBytes);
    if (!pageHtml) continue;
    summary.usedUrl = candidateUrl;

    const discoveredCandidates: WebsiteCandidate[] = [];

    const locariusCandidates = await discoverLocariusCandidates(
      candidateUrl,
      pageHtml,
      config.timezone,
      cfg,
      summary
    );
    if (locariusCandidates.length > 0) {
      discoveredCandidates.push(...locariusCandidates);
    }

    const detailCandidates = await discoverDetailPageCandidates(
      candidateUrl,
      pageHtml,
      relevanceTokens,
      yearHint,
      cfg,
      summary
    );
    if (detailCandidates.length > 0) {
      discoveredCandidates.push(...detailCandidates);
    }

    summary.candidateItemsFound += discoveredCandidates.length;
    if (discoveredCandidates.length === 0) {
      continue;
    }

    const applied = applyWebsiteCandidates(inputItems, discoveredCandidates, summary);
    if (applied.summary.appliedCount > 0) {
      return {
        items: applied.items,
        summary: applied.summary,
      };
    }
  }

  if (!summary.usedUrl) {
    summary.reason = 'no_reachable_venue_website';
  } else if (summary.candidateItemsFound === 0) {
    summary.reason = 'no_usable_website_candidates';
  } else {
    summary.reason = 'no_high_confidence_time_matches';
  }

  logger.info('Stage 3.9 summary', summary);
  return { items: inputItems, summary };
}

function resolveWebsiteConfig(config: ParsingConfig) {
  const cfg = config.venueWebsiteEnrichment || {};
  return {
    enabled: cfg.enabled !== false,
    timeoutMs: typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : DEFAULT_TIMEOUT_MS,
    maxHtmlBytes: typeof cfg.maxHtmlBytes === 'number' ? cfg.maxHtmlBytes : DEFAULT_MAX_HTML_BYTES,
    maxListingPages:
      typeof cfg.maxListingPages === 'number' ? cfg.maxListingPages : DEFAULT_MAX_LISTING_PAGES,
    maxDetailPages:
      typeof cfg.maxDetailPages === 'number' ? cfg.maxDetailPages : DEFAULT_MAX_DETAIL_PAGES,
    maxScriptFetches:
      typeof cfg.maxScriptFetches === 'number'
        ? cfg.maxScriptFetches
        : DEFAULT_MAX_SCRIPT_FETCHES,
  };
}

function shouldAttemptForItem(item: ExtractedItem): boolean {
  if (!isEventishItem(item)) return false;
  return !hasUsableFieldValue(item.startTime) || !hasUsableFieldValue(item.date);
}

function isEventishItem(item: ExtractedItem): boolean {
  return (
    item?._sourceType === 'event' ||
    item?._sourceType === 'calendar' ||
    item?.isEvent === 'Yes' ||
    String(item?.isFoodSpecial || '').toLowerCase() !== 'yes'
  );
}

function collectVenueWebsiteUrls(
  texts: string[],
  venueWebsite: string | undefined,
  websiteCuePresent: boolean
): string[] {
  const explicitUrls = new Set<string>();
  for (const text of texts || []) {
    for (const raw of extractUrlsFromText(text || '')) {
      const normalized = normalizeCandidateUrl(raw);
      if (!normalized) continue;
      if (!isVenueWebsiteHost(normalized)) continue;
      explicitUrls.add(normalized);
    }
  }

  const ordered: string[] = [];
  const normalizedVenueWebsite = normalizeCandidateUrl(String(venueWebsite || ''));
  if (websiteCuePresent && normalizedVenueWebsite && isVenueWebsiteHost(normalizedVenueWebsite)) {
    ordered.push(normalizedVenueWebsite);
  }
  for (const url of explicitUrls) {
    if (!ordered.includes(url)) ordered.push(url);
  }
  if (!websiteCuePresent && normalizedVenueWebsite && ordered.length === 0 && isVenueWebsiteHost(normalizedVenueWebsite)) {
    ordered.push(normalizedVenueWebsite);
  }

  return ordered;
}

function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  const directMatches = text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [];
  for (const value of directMatches) {
    found.add(value.trim());
  }

  const bareDomainMatches =
    text.match(/\b(?![\w.-]+@)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>"')]+)?\b/gi) ||
    [];
  for (const value of bareDomainMatches) {
    if (/^(?:am|pm)$/i.test(value)) continue;
    found.add(value.trim());
  }

  return Array.from(found);
}

function normalizeCandidateUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim().replace(/[)\],!?;:]+$/g, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function isVenueWebsiteHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return false;
    if (SOCIAL_HOST_PATTERN.test(host)) return false;
    if (TICKET_HOST_PATTERN.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function discoverLocariusCandidates(
  pageUrl: string,
  pageHtml: string,
  timezone: string,
  cfg: {
    timeoutMs: number;
    maxHtmlBytes: number;
    maxScriptFetches: number;
  },
  summary: VenueWebsiteEnrichmentSummary
): Promise<WebsiteCandidate[]> {
  const firstPartyScripts = extractFirstPartyScriptUrls(pageHtml, pageUrl).slice(
    0,
    Math.max(1, cfg.maxScriptFetches)
  );
  if (firstPartyScripts.length === 0) {
    return [];
  }

  const pairs: Array<{ endpoint: string; token: string }> = [];
  for (const scriptUrl of firstPartyScripts) {
    summary.scriptFetchesAttempted += 1;
    const scriptText = await fetchText(scriptUrl, cfg.timeoutMs, cfg.maxHtmlBytes);
    if (!scriptText) continue;
    summary.scriptFetchesFetched += 1;
    for (const pair of discoverLocariusEndpointPairs(scriptText)) {
      if (!pairs.some((existing) => existing.endpoint === pair.endpoint && existing.token === pair.token)) {
        pairs.push(pair);
      }
    }
  }

  const candidates: WebsiteCandidate[] = [];
  for (const pair of pairs.slice(0, MAX_LOCARIUS_ENDPOINTS)) {
    summary.apiRequestsAttempted += 1;
    const response = await fetchJsonWithQueryToken(pair.endpoint, pair.token, cfg.timeoutMs);
    const records = Array.isArray((response as any)?.body?.result)
      ? (response as any).body.result
      : [];
    if (!records.length) continue;
    summary.apiRecordsFetched += records.length;

    for (const record of records) {
      const resolved = normalizeLocariusRecord(record, timezone);
      if (resolved) candidates.push(resolved);
    }
  }

  return candidates;
}

function extractFirstPartyScriptUrls(html: string, pageUrl: string): string[] {
  const pageHost = safeHostname(pageUrl);
  const matches = Array.from(
    String(html || '').matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)
  );
  const urls: string[] = [];
  for (const match of matches) {
    const resolved = resolveRelativeUrl(match[1] || '', pageUrl);
    if (!resolved) continue;
    if (safeHostname(resolved) !== pageHost) continue;
    urls.push(resolved);
  }
  return dedupeStrings(urls);
}

function discoverLocariusEndpointPairs(scriptText: string): Array<{ endpoint: string; token: string }> {
  const endpoints = Array.from(
    new Set(
      Array.from(
        String(scriptText || '').matchAll(/https:\/\/api\.prod\.locarius\.io\/v1\/data\/\d+\/events\//gi)
      ).map((match) => String(match[0] || ''))
    )
  );
  const tokens = Array.from(
    new Set(
      Array.from(String(scriptText || '').matchAll(/token:"([A-Za-z0-9]+)"/g)).map((match) =>
        String(match[1] || '')
      )
    )
  );

  const pairs: Array<{ endpoint: string; token: string }> = [];
  for (const endpoint of endpoints) {
    for (const token of tokens) {
      if (!endpoint || !token) continue;
      pairs.push({ endpoint, token });
    }
  }
  return pairs;
}

async function fetchJsonWithQueryToken(
  endpoint: string,
  token: string,
  timeoutMs: number
): Promise<unknown> {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint}${separator}token=${encodeURIComponent(token)}`;
  if (jsonCache.has(url)) return jsonCache.get(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'GathrParser/1.0',
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      jsonCache.set(url, null);
      return null;
    }
    const parsed = await response.json();
    jsonCache.set(url, parsed);
    return parsed;
  } catch (error) {
    logger.warn('Venue website API fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    jsonCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLocariusRecord(record: any, fallbackTimezone: string): WebsiteCandidate | null {
  const startUtc = String(record?.start?.utc || '').trim();
  const zone = String(record?.start?.timezone || fallbackTimezone || 'America/Halifax').trim();
  let local = startUtc ? DateTime.fromISO(startUtc, { zone: 'utc' }).setZone(zone) : null;
  if (!local?.isValid) {
    const localRaw = String(record?.start?.local || '').trim();
    local = parseLocalEventDateTime(localRaw, zone);
  }

  const date = local?.isValid ? local.toFormat('yyyy-MM-dd') : '';
  const startTime = local?.isValid ? local.toFormat('HH:mm') : '';
  if (!date) return null;

  return {
    title: cleanText(String(record?.name || '')),
    description: cleanText(String(record?.description?.text || record?.summary || '')),
    date,
    startTime,
    imageUrl: normalizeCandidateUrl(String(record?.logo || '')) || '',
    sourceUrl: normalizeCandidateUrl(String(record?.url || '')) || '',
    source: 'locarius_api',
  };
}

function parseLocalEventDateTime(raw: string, timezone: string): DateTime | null {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  const parsed = DateTime.fromFormat(cleaned, "cccc, LLLL d, yyyy 'at' hh:mm a", {
    zone: timezone,
    locale: 'en',
  });
  return parsed.isValid ? parsed : null;
}

async function discoverDetailPageCandidates(
  pageUrl: string,
  pageHtml: string,
  relevanceTokens: string[],
  yearHint: number,
  cfg: {
    timeoutMs: number;
    maxHtmlBytes: number;
    maxListingPages: number;
    maxDetailPages: number;
  },
  summary: VenueWebsiteEnrichmentSummary
): Promise<WebsiteCandidate[]> {
  const listingPages = dedupeStrings([
    pageUrl,
    ...discoverListingPages(pageUrl, pageHtml, relevanceTokens),
  ]).slice(0, Math.max(1, cfg.maxListingPages));

  const detailCandidates = new Map<string, WebsiteCandidate>();
  for (const listingPage of listingPages) {
    summary.listingPagesAttempted += 1;
    const listingHtml =
      listingPage === pageUrl
        ? pageHtml
        : await fetchHtml(listingPage, cfg.timeoutMs, cfg.maxHtmlBytes);
    if (!listingHtml) continue;
    summary.listingPagesFetched += 1;

    const detailUrls = discoverDetailPages(listingPage, listingHtml, relevanceTokens).slice(
      0,
      Math.max(1, cfg.maxDetailPages)
    );

    for (const detailUrl of detailUrls) {
      summary.detailPagesAttempted += 1;
      const detailHtml = await fetchHtml(detailUrl, cfg.timeoutMs, cfg.maxHtmlBytes);
      if (!detailHtml) continue;
      summary.detailPagesFetched += 1;
      const parsed = parseDetailPageCandidate(detailUrl, detailHtml, yearHint);
      if (!parsed) continue;
      detailCandidates.set(`${parsed.sourceUrl}|${parsed.title}|${parsed.date || parsed.dateRangeStart || ''}`, parsed);
    }
  }

  return Array.from(detailCandidates.values());
}

function discoverListingPages(pageUrl: string, pageHtml: string, relevanceTokens: string[]): string[] {
  const listingUrls: string[] = [];
  for (const anchor of extractAnchorLinks(pageHtml, pageUrl)) {
    const path = safePathname(anchor.url);
    if (!path) continue;
    const anchorText = cleanText(anchor.text);
    const tokenScore = scoreTokenOverlap(relevanceTokens, tokenize(anchorText || path));
    if (EVENT_PATH_PATTERN.test(path) || (EVENTISH_LINK_TEXT_PATTERN.test(anchorText) && tokenScore >= 0)) {
      listingUrls.push(anchor.url);
    }
  }
  return dedupeStrings(listingUrls);
}

function discoverDetailPages(pageUrl: string, pageHtml: string, relevanceTokens: string[]): string[] {
  const detailUrls: Array<{ url: string; score: number }> = [];
  for (const anchor of extractAnchorLinks(pageHtml, pageUrl)) {
    const path = safePathname(anchor.url);
    if (!path || DETAIL_PATH_BLOCKLIST.has(path.toLowerCase())) continue;
    if (safeHostname(anchor.url) !== safeHostname(pageUrl)) continue;
    if (EVENT_PATH_PATTERN.test(path) && path.split('/').filter(Boolean).length <= 1) continue;

    const anchorTokens = tokenize(`${anchor.text} ${path}`);
    const overlapScore = scoreTokenOverlap(relevanceTokens, anchorTokens);
    const pathDepth = path.split('/').filter(Boolean).length;
    const isLikelyDetailSlug =
      pathDepth >= 1 &&
      !EVENT_PATH_PATTERN.test(path) &&
      overlapScore > 0;
    const isEventishPath = EVENT_PATH_PATTERN.test(path) && pathDepth >= 2;

    if (!isLikelyDetailSlug && !isEventishPath) continue;

    detailUrls.push({
      url: anchor.url,
      score: overlapScore + (isEventishPath ? 2 : 0),
    });
  }

  return dedupeStrings(
    detailUrls
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.url)
  );
}

function parseDetailPageCandidate(
  detailUrl: string,
  html: string,
  yearHint: number
): WebsiteCandidate | null {
  const title =
    cleanText(
      extractFirst(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    ) ||
    cleanText(extractFirst(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) ||
    cleanText(extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i));

  const description =
    cleanText(
      extractFirst(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ) ||
    cleanText(extractFirst(html, /<p[^>]*>([\s\S]*?)<\/p>/i));

  const imageUrl =
    normalizeCandidateUrl(
      extractFirst(html, /<meta[^>]+property=["']og:image(?:\:url)?["'][^>]+content=["']([^"']+)["']/i)
    ) ||
    '';

  const text = cleanText(
    decodeHtml(
      String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<\/?[^>]+>/g, ' ')
    )
  );
  const dateInfo = extractDateInfoFromText(text, yearHint);
  const timeInfo = extractTimeInfoFromText(text);

  if (!title && !dateInfo.date && !dateInfo.dateRangeStart) {
    return null;
  }

  return {
    title: title || cleanSlugTitle(detailUrl),
    description,
    date: dateInfo.date,
    dateRangeStart: dateInfo.dateRangeStart,
    dateRangeEnd: dateInfo.dateRangeEnd,
    startTime: timeInfo.startTime,
    endTime: timeInfo.endTime,
    imageUrl,
    sourceUrl: detailUrl,
    source: 'detail_page',
  };
}

function extractDateInfoFromText(
  text: string,
  yearHint: number
): { date?: string; dateRangeStart?: string; dateRangeEnd?: string } {
  const rangeWithTwoMonths =
    text.match(
      /\b(?:from\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\,?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?\s*(?:to|-|–|—)\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\,?\s*(january|february|march|april|may|june|july|august|september|october|november|december)?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?/i
    ) || null;
  if (rangeWithTwoMonths) {
    const start = buildDateString(rangeWithTwoMonths[1], rangeWithTwoMonths[2], rangeWithTwoMonths[3], yearHint);
    const end = buildDateString(
      rangeWithTwoMonths[4] || rangeWithTwoMonths[1],
      rangeWithTwoMonths[5],
      rangeWithTwoMonths[6] || rangeWithTwoMonths[3],
      yearHint
    );
    if (start && end) {
      return {
        dateRangeStart: start,
        dateRangeEnd: end,
      };
    }
  }

  const singleDate =
    text.match(
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\,?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?/i
    ) || null;
  if (singleDate) {
    const date = buildDateString(singleDate[1], singleDate[2], singleDate[3], yearHint);
    if (date) return { date };
  }

  return {};
}

function buildDateString(
  monthToken: string,
  dayToken: string,
  yearToken: string | undefined,
  yearHint: number
): string {
  const month = MONTH_LOOKUP.get(String(monthToken || '').toLowerCase());
  const day = Number(dayToken);
  const year = Number(yearToken || yearHint);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return '';
  const dt = DateTime.fromObject({ year, month, day }, { zone: 'America/Halifax' });
  return dt.isValid ? dt.toFormat('yyyy-MM-dd') : '';
}

function extractTimeInfoFromText(text: string): { startTime?: string; endTime?: string } {
  const range =
    text.match(
      /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i
    ) || null;
  if (range) {
    return {
      startTime: parse12hTime(range[1]),
      endTime: parse12hTime(range[2]),
    };
  }

  const showTime =
    text.match(
      /\b(?:show|screening|starts?|start|doors\s+open|doors)\s*(?:at)?\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i
    ) || null;
  if (showTime) {
    return { startTime: parse12hTime(showTime[1]) };
  }

  const singleTime = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i) || null;
  if (singleTime) {
    return { startTime: parse12hTime(singleTime[1]) };
  }

  return {};
}

function parse12hTime(raw: string): string {
  const cleaned = String(raw || '').replace(/\./g, '').trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!match) return '';
  let hour = parseInt(match[1], 10);
  const minute = match[2] || '00';
  const period = match[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function applyWebsiteCandidates(
  items: ExtractedItem[],
  candidates: WebsiteCandidate[],
  summary: VenueWebsiteEnrichmentSummary
): { items: ExtractedItem[]; summary: VenueWebsiteEnrichmentSummary } {
  const nextItems = items.map((item) => {
    if (!shouldAttemptForItem(item)) return item;

    const bestCandidate = findBestCandidateForItem(item, candidates);
    if (
      !bestCandidate ||
      (!hasUsableFieldValue(bestCandidate.startTime) && !hasUsableFieldValue(bestCandidate.date))
    ) {
      return item;
    }

    const updated = { ...item } as any;
    let changed = false;
    if (!hasUsableFieldValue(updated.date) && hasUsableFieldValue(bestCandidate.date)) {
      updated.date = bestCandidate.date;
      summary.updatedFields.dates += 1;
      changed = true;
    }
    if (!hasUsableFieldValue(updated.startTime) && hasUsableFieldValue(bestCandidate.startTime)) {
      updated.startTime = bestCandidate.startTime;
      updated.timeFlags = updated.timeFlags || {
        start: { source: 'none', evidence: '' },
        end: { toClose: false, evidence: '' },
      };
      updated.timeFlags.start = {
        source: 'explicit',
        evidence: `venue_website:${bestCandidate.sourceUrl}`,
      };
      summary.updatedFields.times += 1;
      changed = true;
    }
    if (!hasUsableFieldValue(updated.endTime) && hasUsableFieldValue(bestCandidate.endTime)) {
      updated.endTime = bestCandidate.endTime;
      changed = true;
    }
    if (!hasValue(updated.description) && bestCandidate.description) {
      updated.description = bestCandidate.description;
      summary.updatedFields.descriptions += 1;
      changed = true;
    }
    if (!hasValue((updated as any).ticketLink) && bestCandidate.sourceUrl) {
      updated.ticketLink = bestCandidate.sourceUrl;
      summary.updatedFields.links += 1;
      changed = true;
    }
    if (!hasValue(updated._ticketImageUrl) && bestCandidate.imageUrl) {
      updated._ticketImageUrl = bestCandidate.imageUrl;
      summary.updatedFields.images += 1;
      changed = true;
    }

    if (changed) {
      summary.appliedCount += 1;
      summary.reason = 'merged_venue_website_details';
      return updated;
    }

    return item;
  });

  return { items: nextItems, summary };
}

function findBestCandidateForItem(
  item: ExtractedItem,
  candidates: WebsiteCandidate[]
): WebsiteCandidate | null {
  const itemDate = String(item.date || '').trim();
  const itemTokens = tokenize(String(item.name || ''));
  let best: WebsiteCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    if (itemDate && candidate.date && itemDate === candidate.date) {
      score += 6;
    } else if (
      itemDate &&
      candidate.dateRangeStart &&
      candidate.dateRangeEnd &&
      itemDate >= candidate.dateRangeStart &&
      itemDate <= candidate.dateRangeEnd
    ) {
      score += 4;
    }

    if (candidate.startTime) score += 1;
    score += scoreTokenOverlap(itemTokens, tokenize(candidate.title || ''));

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 4 ? best : null;
}

function collectRelevanceTokens(text: string, itemNames: string[]): string[] {
  return dedupeStrings(
    tokenize([text, ...itemNames].filter(Boolean).join(' ')).filter(
      (token) => token.length >= 4 && !TOKEN_STOP_WORDS.has(token)
    )
  );
}

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreTokenOverlap(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  let score = 0;
  for (const token of left) {
    if (rightSet.has(token)) score += 1;
  }
  return score;
}

async function fetchHtml(url: string, timeoutMs: number, maxBytes: number): Promise<string | null> {
  if (htmlCache.has(url)) return htmlCache.get(url) || null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'GathrParser/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      htmlCache.set(url, null);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      htmlCache.set(url, null);
      return null;
    }

    const text = await response.text();
    const clipped = text.length > maxBytes ? text.slice(0, maxBytes) : text;
    htmlCache.set(url, clipped);
    return clipped;
  } catch (error) {
    logger.warn('Venue website fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    htmlCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string, timeoutMs: number, maxBytes: number): Promise<string | null> {
  if (textCache.has(url)) return textCache.get(url) || null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'GathrParser/1.0',
        accept: 'text/plain,application/javascript,text/javascript,*/*',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      textCache.set(url, null);
      return null;
    }
    const text = await response.text();
    const clipped = text.length > maxBytes ? text.slice(0, maxBytes) : text;
    textCache.set(url, clipped);
    return clipped;
  } catch (error) {
    logger.warn('Venue website text fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    textCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAnchorLinks(html: string, baseUrl: string): Array<{ url: string; text: string }> {
  const anchors: Array<{ url: string; text: string }> = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(html || '')))) {
    const url = resolveRelativeUrl(decodeHtml(match[1] || ''), baseUrl);
    if (!url) continue;
    anchors.push({
      url,
      text: cleanText(match[2] || ''),
    });
  }
  return anchors;
}

function resolveRelativeUrl(raw: string, baseUrl: string): string {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return '';
  }
}

function resolveYearHint(timestamp: string, timezone: string): number {
  const local = DateTime.fromISO(String(timestamp || ''), { zone: timezone || 'America/Halifax' });
  return local.isValid ? local.year : DateTime.now().setZone(timezone || 'America/Halifax').year;
}

function extractFirst(text: string, regex: RegExp): string {
  const match = String(text || '').match(regex);
  return match?.[1] ? String(match[1]) : '';
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value: string): string {
  return decodeHtml(String(value || ''))
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSlugTitle(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
    return lastSegment
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname || '';
  } catch {
    return '';
  }
}

function hasValue(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

function hasUsableFieldValue(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return !MISSING_VALUE_TOKENS.has(normalized);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set((values || []).filter(Boolean)));
}
