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
  source: 'detail_page' | 'locarius_api' | 'article_paragraph';
  namedSeatings?: Array<{ label: string; startTime: string; endTime: string }>;
  // Only populated when a detail page prints both its individual dates and a
  // clock range labelled with the same series title.
  namedSeriesDates?: string[];
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
  const hasRepeatedSameDayStartTimes = findRepeatedSameDayStartTimeGroups(inputItems).length > 0;
  if (candidateItems.length === 0 && !hasRepeatedSameDayStartTimes) {
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
      summary,
      config.lunaCalendarLiteralSourcePrompt === true
    );
    if (detailCandidates.length > 0) {
      discoveredCandidates.push(...detailCandidates);
    }

    summary.candidateItemsFound += discoveredCandidates.length;
    const articleAlignedItems = config.lunaCalendarLiteralSourcePrompt === true
      ? reconcileRepeatedWeekdaySessions(inputItems, pageHtml, candidateUrl, summary)
      : inputItems;
    if (discoveredCandidates.length === 0 && summary.appliedCount === 0) {
      continue;
    }

    const applied = applyWebsiteCandidates(articleAlignedItems, discoveredCandidates, summary, combinedText);
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
  const trimmed = String(raw || '').trim().replace(/[)\],.!?;:]+$/g, '');
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
  const firstPartyEndpoints: string[] = [];
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
    firstPartyEndpoints.push(...discoverFirstPartyLocariusEndpoints(scriptText, pageUrl));
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

  for (const endpoint of dedupeStrings(firstPartyEndpoints).slice(0, MAX_LOCARIUS_ENDPOINTS - summary.apiRequestsAttempted)) {
    summary.apiRequestsAttempted += 1;
    const response = await fetchJson(endpoint, cfg.timeoutMs);
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

function discoverFirstPartyLocariusEndpoints(scriptText: string, pageUrl: string): string[] {
  // Some venues proxy Locarius through their own API instead of embedding a
  // token in the client bundle. Follow only this observed first-party route.
  if (!/baseURL\s*:\s*["']\/api["']/.test(scriptText)) return [];
  if (!/\.get\(\s*["']\/events\/locarius["']/.test(scriptText)) return [];
  const endpoint = resolveRelativeUrl('/api/events/locarius', pageUrl);
  return endpoint && safeHostname(endpoint) === safeHostname(pageUrl) ? [endpoint] : [];
}

async function fetchJsonWithQueryToken(
  endpoint: string,
  token: string,
  timeoutMs: number
): Promise<unknown> {
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${endpoint}${separator}token=${encodeURIComponent(token)}`;
  return fetchJson(url, timeoutMs);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
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
  summary: VenueWebsiteEnrichmentSummary,
  allowArticleParagraphs = false
): Promise<WebsiteCandidate[]> {
  const listingPages = dedupeStrings([
    pageUrl,
    ...discoverListingPages(pageUrl, pageHtml, relevanceTokens),
  ]).slice(0, Math.max(1, cfg.maxListingPages));

  const detailCandidates = new Map<string, WebsiteCandidate>();
  // A linked news post can contain several unrelated activities. Keep the
  // date and clock attached to their own paragraph instead of treating its
  // first time as the time of the whole page.
  for (const candidate of allowArticleParagraphs
    ? extractDatedParagraphCandidates(pageUrl, pageHtml, yearHint) : []) {
    detailCandidates.set(`${candidate.sourceUrl}|${candidate.title}|${candidate.date}`, candidate);
  }
  // A post may link straight to the event detail page. Inspect that page as
  // well as links discovered from a venue listing page.
  if (safePathname(pageUrl).split('/').filter(Boolean).length >= 2) {
    const directCandidate = parseDetailPageCandidate(pageUrl, pageHtml, yearHint);
    if ((directCandidate?.namedSeatings?.length || 0) >= 2 ||
        (directCandidate?.namedSeriesDates?.length || 0) >= 2) {
      detailCandidates.set(`${directCandidate.sourceUrl}|${directCandidate.title}|${directCandidate.date || directCandidate.dateRangeStart || ''}`, directCandidate);
    }
  }
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

function reconcileRepeatedWeekdaySessions(
  items: ExtractedItem[], html: string, sourceUrl: string,
  summary: VenueWebsiteEnrichmentSummary
): ExtractedItem[] {
  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const date = String(item.date || '');
    const name = String(item.name || '').trim().toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || name.length < 4) return;
    const key = `${date}|${name}`;
    groups.set(key, [...(groups.get(key) || []), index]);
  });
  const paragraphs = Array.from(String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .slice(0, 100).map(match => cleanText(decodeHtml(match[1] || '')));
  const next = items.slice();
  for (const [key, indices] of groups) {
    if (indices.length !== 2 || indices.every(index => hasUsableFieldValue(items[index].startTime))) continue;
    const [date, name] = key.split('|');
    const weekday = DateTime.fromISO(date, { zone: 'America/Halifax' }).weekdayLong?.toLowerCase();
    if (!weekday) continue;
    const matches = paragraphs.filter(block =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(block) &&
      new RegExp(`\\b${weekday}s?\\b`, 'i').test(block)
    ).map(block => ({ block, times: Array.from(block.matchAll(
      /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)(?=\W|$)/gi
    )).map(match => parse12hTime(match[0])).filter(Boolean) }))
      .filter(candidate => candidate.times.length === 2);
    if (matches.length !== 1) continue;
    const times = matches[0].times;
    if (indices.some((index, offset) => hasUsableFieldValue(items[index].startTime) &&
        normalizeWebsiteTime(String(items[index].startTime)) !== times[offset])) continue;
    indices.forEach((index, offset) => {
      if (hasUsableFieldValue(items[index].startTime)) return;
      const item = { ...items[index] };
      item.startTime = times[offset];
      item.timeFlags = item.timeFlags || {
        start: { source: 'none', evidence: '' }, end: { toClose: false, evidence: '' },
      };
      item.timeFlags.start = { source: 'explicit',
        evidence: `venue_website:${sourceUrl} ${matches[0].block}` };
      next[index] = item;
      summary.appliedCount += 1;
      summary.updatedFields.times += 1;
      summary.reason = 'merged_linked_weekday_session_times';
    });
  }
  return next;
}

function extractDatedParagraphCandidates(
  pageUrl: string,
  html: string,
  yearHint: number
): WebsiteCandidate[] {
  const blocks = Array.from(String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .slice(0, 100)
    .map(match => cleanText(decodeHtml(match[1] || '')))
    .filter(block => block.length >= 12 && block.length <= 650);
  return blocks.flatMap(block => {
    let { date } = extractDateInfoFromText(block, yearHint);
    if (!date) {
      const abbreviatedDate = block.match(
        /\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
      );
      if (abbreviatedDate) {
        const month = DateTime.fromFormat(abbreviatedDate[1].slice(0, 3), 'LLL', { locale: 'en' }).month;
        const parsed = DateTime.fromObject({ year: yearHint, month, day: Number(abbreviatedDate[2]) },
          { zone: 'America/Halifax' });
        if (parsed.isValid) date = parsed.toFormat('yyyy-MM-dd');
      }
    }
    const { startTime, endTime } = extractTimeInfoFromText(block);
    if (!date || !startTime) return [];
    return [{ title: block, description: block, date, startTime, endTime,
      sourceUrl: pageUrl, source: 'article_paragraph' as const }];
  });
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
  const namedSeatings = dateInfo.date && !dateInfo.dateRangeStart
    ? parseNamedSeatings(html)
    : [];
  // A page with separately named same-day sessions has no safe page-wide
  // start time. Keep those times attached to their labels for reconciliation.
  const timeInfo = namedSeatings.length >= 2 ? {} : extractTimeInfoFromText(text);
  const namedSeries = extractNamedSeriesSchedule(html, title, yearHint);

  if (!title && !dateInfo.date && !dateInfo.dateRangeStart) {
    return null;
  }

  return {
    title: title || cleanSlugTitle(detailUrl),
    description,
    date: dateInfo.date,
    dateRangeStart: dateInfo.dateRangeStart,
    dateRangeEnd: dateInfo.dateRangeEnd,
    startTime: namedSeries ? namedSeries.startTime : timeInfo.startTime,
    endTime: namedSeries ? namedSeries.endTime : timeInfo.endTime,
    imageUrl,
    sourceUrl: detailUrl,
    source: 'detail_page',
    namedSeatings,
    namedSeriesDates: namedSeries?.dates,
  };
}

function extractNamedSeriesSchedule(
  html: string, title: string, yearHint: number
): { dates: string[]; startTime: string; endTime: string } | null {
  const titleTokens = tokenizeSeriesTitle(title);
  if (titleTokens.length < 3) return null;
  const blocks = Array.from(String(html || '').matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi))
    .map(match => cleanText(decodeHtml(match[1] || ''))).filter(Boolean);
  const monthListPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:\s*,\s*\d{1,2})+)/gi;
  let dates: string[] = [];
  for (const block of blocks) {
    const groups = Array.from(block.matchAll(monthListPattern));
    if (!groups.length || !groups.some(group => group[2].includes(','))) continue;
    const candidateDates = groups.flatMap(group => group[2].split(',')
      .map(day => buildDateString(group[1], day.trim(), undefined, yearHint))).filter(Boolean);
    if (candidateDates.length >= 2 && candidateDates.length <= 40) {
      dates = dedupeStrings(candidateDates);
      break;
    }
  }
  if (dates.length < 2) return null;

  // Match a time only when its own printed line labels the same series. A
  // check-in, breakfast, or another performance on this page is not evidence.
  const labelledRange = /\b(\d{1,2}(?::\d{2})?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)\s*\|\s*(.{3,100})/i;
  for (const block of blocks) {
    const match = block.match(labelledRange);
    if (!match) continue;
    const labelTokens = tokenizeSeriesTitle(match[4]);
    if (!titleTokens.every(token => labelTokens.includes(token))) continue;
    const period = match[3];
    const startTime = parse12hTime(`${match[1]} ${period}`);
    const endTime = parse12hTime(`${match[2]} ${period}`);
    if (startTime && endTime && startTime < endTime) return { dates, startTime, endTime };
  }
  return null;
}

function tokenizeSeriesTitle(value: string): string[] {
  return tokenize(String(value || '').replace(/[’']/g, '').split(/\s+[–—-]\s+/)[0]);
}

function parseNamedSeatings(html: string): Array<{ label: string; startTime: string; endTime: string }> {
  const blocks = Array.from(String(html || '').matchAll(
    /<(h[1-6]|p|li|strong|b|em|dt|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi
  )).map(match => cleanText(match[2] || '')).filter(Boolean);
  const time = String.raw`\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)`;
  const rangePattern = new RegExp(
    `([^.!?()]{2,120}?)\\s*\\(\\s*(${time})\\s*(?:-|–|—|to)\\s*` +
      `(?:(approx(?:imately)?\\.?|about|around)\\s*)?(${time})\\s*\\)`,
    'gi'
  );
  const seatings: Array<{ label: string; startTime: string; endTime: string }> = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    for (const match of block.matchAll(rangePattern)) {
      const label = String(match[1] || '').trim().replace(/^[\s:|–—-]+|[\s:|–—-]+$/g, '');
      const startTime = parse12hTime(match[2]);
      const approximateEnd = Boolean(match[3]);
      const endTime = approximateEnd ? '' : parse12hTime(match[4]);
      if (!label || !startTime || (!approximateEnd && !endTime)) continue;
      const key = `${label.toLowerCase()}|${startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      seatings.push({ label, startTime, endTime });
    }
  }

  if (seatings.length < 2 || seatings.length > 12) return [];
  const labels = new Set(seatings.map(item => normalizeNamedLabel(item.label)));
  const starts = new Set(seatings.map(item => item.startTime));
  return labels.size === seatings.length && starts.size === seatings.length ? seatings : [];
}

function normalizeNamedLabel(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  summary: VenueWebsiteEnrichmentSummary,
  combinedText: string
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
      if (bestCandidate.source === 'article_paragraph' &&
          !hasUsableFieldValue(bestCandidate.endTime) &&
          !hasUsableFieldValue(updated.endTime)) {
        updated.timeFlags.end = {
          source: 'none', toClose: false,
          evidence: `venue_website:${bestCandidate.sourceUrl} approximate end omitted`,
        };
      }
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

  const reconciledItems = reconcileSameDayNamedSeatingTimes(nextItems, candidates, summary, items);
  if (reconciledItems) return { items: reconciledItems, summary };

  if (nextItems.length === 1 && hasExplicitMultipleSeatingCue(combinedText)) {
    const original = items[0];
    const candidate = findBestCandidateForItem(original, candidates);
    const seatings = candidate?.namedSeatings || [];
    const initialStart = String(original.startTime || '').trim();
    const linkedPage = String(candidate?.sourceUrl || '').replace(/\/$/, '');
    const samePrintedDate = !candidate?.date || !original.date || candidate.date === original.date;
    if (seatings.length >= 2 && linkedPage && combinedText.includes(linkedPage) && samePrintedDate &&
        (!hasUsableFieldValue(initialStart) || seatings.some(seating => seating.startTime === initialStart))) {
      const base = nextItems[0];
      const splitItems = seatings.map(seating => ({
        ...base,
        name: `${String(base.name || candidate?.title || '').trim().replace(/\s+Live Performances$/i, '').replace(/[\s:–—-]+$/g, '')}: ${seating.label}`,
        startTime: seating.startTime,
        endTime: seating.endTime || '',
        timeFlags: {
          ...base.timeFlags,
          start: { source: 'explicit', evidence: `venue_website:${candidate?.sourceUrl} ${seating.label}` },
          end: seating.endTime
            ? { source: 'explicit', toClose: false, evidence: `venue_website:${candidate?.sourceUrl} ${seating.label}` }
            : { source: 'none', toClose: false, evidence: `venue_website:${candidate?.sourceUrl} approximate end omitted` },
        },
        extractionReason: `${String(base.extractionReason || '').trim()} | named linked-page seatings`,
      })) as ExtractedItem[];
      summary.appliedCount = splitItems.length;
      summary.updatedFields.times = splitItems.length;
      summary.reason = 'split_explicit_named_website_seatings';
      return { items: splitItems, summary };
    }
  }
  return { items: nextItems, summary };
}

function hasExplicitMultipleSeatingCue(text: string): boolean {
  const cue = String(text || '');
  const countCue = /\b(?:both|two|2|three|3|multiple|several|separate|distinct)\b/i;
  const seatingCue = /\b(?:seatings?|sessions?|experiences?)\b/i;
  return (countCue.test(cue) && seatingCue.test(cue));
}

function reconcileSameDayNamedSeatingTimes(
  items: ExtractedItem[],
  candidates: WebsiteCandidate[],
  summary: VenueWebsiteEnrichmentSummary,
  originalItems: ExtractedItem[]
): ExtractedItem[] | null {
  const groups = [
    ...findRepeatedSameDayStartTimeGroups(items),
    ...findMissingSameDayStartTimeGroups(items),
  ];
  for (const group of groups) {
    for (const candidate of candidates) {
      const seatings = candidate.namedSeatings || [];
      if (!candidate.date || candidate.date !== group.date ||
          candidate.dateRangeStart || candidate.dateRangeEnd || seatings.length !== group.indices.length) {
        continue;
      }

      const assignment = mapItemsToNamedSeatings(
        group.indices.map(index => items[index]), seatings, candidate.title || ''
      );
      if (!assignment) continue;

      let changedCount = 0;
      const nextItems = items.slice();
      for (let offset = 0; offset < group.indices.length; offset++) {
        const itemIndex = group.indices[offset];
        const item = items[itemIndex];
        const seating = assignment[offset];
        const currentStart = normalizeWebsiteTime(String(item.startTime || ''));
        const currentEnd = String(item.endTime || '').trim();
        let reconciledEnd = currentEnd;
        const existingFlags = item.timeFlags || {
          start: { source: 'none' as const, evidence: '' },
          end: { toClose: false, evidence: '' },
        };
        let endFlags = existingFlags.end || { toClose: false, evidence: '' };
        if (seating.endTime && !hasUsableFieldValue(currentEnd)) {
          reconciledEnd = seating.endTime;
          endFlags = {
            source: 'explicit',
            toClose: false,
            evidence: `venue_website:${candidate.sourceUrl} ${seating.label}`,
          };
        } else if (!seating.endTime && existingFlags.end?.source !== 'explicit') {
          reconciledEnd = '';
          endFlags = {
            source: 'none',
            toClose: false,
            evidence: `venue_website:${candidate.sourceUrl} ${seating.label} approximate end omitted`,
          };
        }
        if (currentStart !== seating.startTime || currentEnd !== reconciledEnd) changedCount += 1;
        nextItems[itemIndex] = {
          ...item,
          startTime: seating.startTime,
          endTime: reconciledEnd,
          timeFlags: {
            ...existingFlags,
            start: {
              source: 'explicit',
              evidence: `venue_website:${candidate.sourceUrl} ${seating.label}`,
            },
            end: endFlags,
          },
          extractionReason: `${String(item.extractionReason || '').trim()} | start time reconciled with named linked-page seating`,
        } as ExtractedItem;
      }

      if (changedCount === 0) continue;
      summary.appliedCount += group.indices.filter(index => items[index] === originalItems[index]).length;
      summary.updatedFields.times += changedCount;
      summary.reason = 'reconciled_named_website_seating_times';
      return nextItems;
    }
  }
  return null;
}

function findRepeatedSameDayStartTimeGroups(items: ExtractedItem[]): Array<{ date: string; indices: number[] }> {
  const groups = new Map<string, { date: string; indices: number[] }>();
  (items || []).forEach((item, index) => {
    if (!isEventishItem(item)) return;
    const date = String(item.date || '').trim();
    const startTime = normalizeWebsiteTime(String(item.startTime || ''));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !startTime) return;
    const key = `${date}|${startTime}`;
    const group = groups.get(key) || { date, indices: [] };
    group.indices.push(index);
    groups.set(key, group);
  });
  return Array.from(groups.values()).filter(group => group.indices.length >= 2);
}

function findMissingSameDayStartTimeGroups(items: ExtractedItem[]): Array<{ date: string; indices: number[] }> {
  const groups = new Map<string, { date: string; indices: number[] }>();
  (items || []).forEach((item, index) => {
    if (!isEventishItem(item)) return;
    const date = String(item.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || normalizeWebsiteTime(String(item.startTime || ''))) return;
    const group = groups.get(date) || { date, indices: [] };
    group.indices.push(index);
    groups.set(date, group);
  });
  return Array.from(groups.values()).filter(group => group.indices.length >= 2);
}

function mapItemsToNamedSeatings(
  items: ExtractedItem[],
  seatings: Array<{ label: string; startTime: string; endTime: string }>,
  candidateTitle: string
): Array<{ label: string; startTime: string; endTime: string }> | null {
  const genericLabelWords = new Set([
    'a', 'an', 'and', 'at', 'event', 'events', 'experience', 'experiences',
    'for', 'of', 'session', 'sessions', 'seating', 'seatings', 'the', 'with',
  ]);
  const labelTokenSets = seatings.map(seating => new Set(
    tokenize(seating.label).filter(token => token.length >= 3 && !genericLabelWords.has(token))
  ));
  const uniqueLabelTokens = labelTokenSets.map((tokens, index) => new Set(
    Array.from(tokens).filter(token => labelTokenSets.every((other, otherIndex) =>
      otherIndex === index || !other.has(token)
    ))
  ));
  if (uniqueLabelTokens.some(tokens => tokens.size === 0)) return null;

  const titleTokens = tokenize(candidateTitle).filter(token => token.length >= 3 && !TOKEN_STOP_WORDS.has(token));
  const requiredTitleOverlap = titleTokens.length > 0 ? Math.min(2, titleTokens.length) : 0;
  const assigned = new Set<number>();
  const result: Array<{ label: string; startTime: string; endTime: string }> = [];

  for (const item of items) {
    const itemTokens = new Set(tokenize(String(item.name || '')));
    if (requiredTitleOverlap > 0 && scoreTokenOverlap(titleTokens, Array.from(itemTokens)) < requiredTitleOverlap) {
      return null;
    }
    const matches = uniqueLabelTokens.flatMap((tokens, index) =>
      Array.from(tokens).some(token => itemTokens.has(token)) ? [index] : []
    );
    if (matches.length !== 1 || assigned.has(matches[0])) return null;
    assigned.add(matches[0]);
    result.push(seatings[matches[0]]);
  }

  return assigned.size === seatings.length ? result : null;
}

function normalizeWebsiteTime(raw: string): string {
  const value = String(raw || '').trim();
  const clock24 = value.match(/^(\d{1,2}):(\d{2})$/);
  if (clock24 && Number(clock24[1]) < 24 && Number(clock24[2]) < 60) {
    return `${String(Number(clock24[1])).padStart(2, '0')}:${clock24[2]}`;
  }
  const clock12 = value.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (!clock12) return '';
  let hour = Number(clock12[1]) % 12;
  if (clock12[3].toLowerCase() === 'p') hour += 12;
  return `${String(hour).padStart(2, '0')}:${clock12[2] || '00'}`;
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
    // A shared tour title does not make another date the same occurrence.
    if (itemDate && candidate.date && itemDate !== candidate.date &&
        !candidate.namedSeriesDates?.includes(itemDate)) continue;
    // A multi-day page often contains the first performance's clock time.
    // That time cannot be assigned to each day of the surrounding festival.
    if (itemDate && candidate.dateRangeStart && candidate.dateRangeEnd &&
        candidate.dateRangeStart !== candidate.dateRangeEnd && !candidate.date &&
        !candidate.namedSeriesDates?.length) {
      continue;
    }
    if (candidate.namedSeriesDates?.length) {
      const seriesItemTokens = tokenizeSeriesTitle(item.name || '');
      const seriesTitleTokens = tokenizeSeriesTitle(candidate.title || '');
      if (!itemDate || !candidate.namedSeriesDates.includes(itemDate) ||
          seriesItemTokens.length < 3 ||
          !seriesItemTokens.every(token => seriesTitleTokens.includes(token))) continue;
    }
    let score = 0;
    const titleOverlap = scoreTokenOverlap(itemTokens, tokenize(candidate.title || ''));
    // A shared generic title such as "Open House" does not make a named
    // sub-event's clock the parent event's clock. Date agreement alone is not
    // enough to borrow a time from "Bookstore Open House" for "Fall Open House".
    if (!websiteCandidateTitleMatchesEvent(item.name || '', candidate.title || '')) continue;
    if (candidate.source === 'locarius_api') {
      const identityTokens = itemTokens.filter(token =>
        token.length >= 3 && !TOKEN_STOP_WORDS.has(token) &&
        !MONTH_LOOKUP.has(token) && !/^\d+$/.test(token)
      );
      if (identityTokens.length > 0 &&
          scoreTokenOverlap(identityTokens, tokenize(candidate.title || '')) === 0) continue;
    }
    if (candidate.source === 'article_paragraph' &&
        (!itemDate || candidate.date !== itemDate ||
          titleOverlap < Math.min(2, itemTokens.length))) continue;
    if (itemDate && candidate.date && itemDate === candidate.date) {
      score += 6;
    } else if (itemDate && candidate.namedSeriesDates?.includes(itemDate)) {
      score += 8;
    } else if (
      itemDate &&
      candidate.dateRangeStart &&
      candidate.dateRangeEnd &&
      itemDate >= candidate.dateRangeStart &&
      itemDate <= candidate.dateRangeEnd
    ) {
      // A date-range page can describe several different performances. Its
      // first clock time must not become the time of every untimed parent day.
      if (titleOverlap === 0) continue;
      score += 4;
    }

    if (candidate.startTime) score += 1;
    score += titleOverlap;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 4 ? best : null;
}

const GENERIC_WEBSITE_EVENT_TITLE_TOKENS = new Set([
  'open', 'house', 'event', 'events', 'live', 'music', 'show', 'festival',
  'party', 'class', 'workshop', 'tour', 'session', 'sessions', 'the', 'a',
]);

function websiteCandidateTitleMatchesEvent(itemName: string, candidateTitle: string): boolean {
  const itemTokens = tokenize(itemName);
  const candidateTokens = tokenize(candidateTitle);
  if (!itemTokens.length || !candidateTokens.length) return false;
  if (itemTokens.join(' ') === candidateTokens.join(' ')) return true;
  const distinguishingTokens = itemTokens.filter(token =>
    !GENERIC_WEBSITE_EVENT_TITLE_TOKENS.has(token));
  if (!distinguishingTokens.length) return false;
  return scoreTokenOverlap(distinguishingTokens, candidateTokens) > 0;
}

export function websiteCandidateTitleMatchesEventForRegression(
  itemName: string, candidateTitle: string
): boolean {
  return websiteCandidateTitleMatchesEvent(itemName, candidateTitle);
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
    // Publishers often retain obsolete schedules inside HTML comments. Those
    // blocks are invisible to readers and must not supply event times or links.
    const visibleHtml = clipped.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
    htmlCache.set(url, visibleHtml);
    return visibleHtml;
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
    .replace(/&#(\d+);|&#x([0-9a-f]+);/gi, (_match, decimal, hex) => {
      const codepoint = Number.parseInt(decimal || hex, decimal ? 10 : 16);
      return codepoint > 0 && codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : '';
    })
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
