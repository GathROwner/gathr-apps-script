// @ts-nocheck
/**
 * Ticket Link Enricher
 * Fetches ticketing pages to fill missing event date/time (and price/venue).
 */

import { DateTime } from 'luxon';
import { ExtractedItem, ParsingConfig } from './types.js';
import { logger } from '../utils/logger.js';

type TicketInfo = {
  title?: string;
  venue?: string;
  startDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  price?: string;
  imageUrl?: string;
  sourceUrl: string;
  source: 'ticketpro_api' | 'jsonld' | 'meta' | 'text';
  rawDateText?: string;
  rawTimeText?: string;
};

type EnrichmentSummary = {
  attemptedUrls: number;
  candidateUrl?: string;
  usedUrl?: string;
  appliedCount: number;
  updatedFields: {
    dates: number;
    times: number;
    venues: number;
    prices: number;
    images: number;
  };
  bootstrapCreated?: boolean;
  reason?: string;
};

const DEFAULT_ALLOWED_DOMAINS = [
  'ticketpro.ca',
  'ticketpro.com',
];
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_HTML_BYTES = 1_000_000;

const ticketCache = new Map<string, TicketInfo | null>();

export async function enrichEventsFromTicketLinks(
  items: ExtractedItem[],
  combinedText: string,
  ocrText: string | undefined,
  extraUrls: string[],
  timestamp: string,
  config: ParsingConfig
): Promise<{ items: ExtractedItem[]; summary: EnrichmentSummary }> {
  const summary: EnrichmentSummary = {
    attemptedUrls: 0,
    appliedCount: 0,
    updatedFields: { dates: 0, times: 0, venues: 0, prices: 0, images: 0 },
  };

  const inputItems = Array.isArray(items) ? items : [];

  const cfg = resolveTicketConfig(config);
  if (!cfg.enabled) {
    summary.reason = 'disabled';
    return { items: inputItems, summary };
  }

  const urls = collectTicketUrls([combinedText, ocrText || ''], extraUrls, cfg.allowedDomains);
  if (urls.length === 0) {
    summary.reason = inputItems.length === 0 ? 'no_items_or_urls' : 'no_ticket_urls';
    return { items: inputItems, summary };
  }
  summary.candidateUrl = urls[0];

  logger.info('Stage 3.7: Ticket link enrichment', {
    existingItemCount: inputItems.length,
    candidateCount: inputItems.filter((item) => shouldEnrichItem(item)).length,
    urlCount: urls.length,
  });

  let ticketInfo: TicketInfo | null = null;
  for (const url of urls) {
    summary.attemptedUrls += 1;
    ticketInfo = await fetchTicketInfo(url, cfg, config.timezone);
    if (ticketInfo && (ticketInfo.startDate || ticketInfo.startTime || ticketInfo.imageUrl)) {
      summary.usedUrl = ticketInfo.sourceUrl;
      break;
    }
  }

  if (!ticketInfo) {
    summary.reason = 'no_ticket_data';
    logger.info('Stage 3.7 summary', summary);
    return { items: inputItems, summary };
  }

  if (inputItems.length === 0) {
    const bootstrapped = buildBootstrapItem(ticketInfo, combinedText, timestamp, config.timezone);
    if (!bootstrapped) {
      summary.reason = 'ticket_data_not_usable';
      logger.info('Stage 3.7 summary', summary);
      return { items: inputItems, summary };
    }

    summary.bootstrapCreated = true;
    summary.appliedCount = 1;
    if (hasValue(bootstrapped.date)) summary.updatedFields.dates = 1;
    if (hasValue(bootstrapped.startTime)) summary.updatedFields.times = 1;
    if (hasValue(bootstrapped.venue)) summary.updatedFields.venues = 1;
    if (hasValue(bootstrapped.price)) summary.updatedFields.prices = 1;
    if (hasValue((bootstrapped as any)._ticketImageUrl)) summary.updatedFields.images = 1;
    summary.reason = 'bootstrapped_from_ticket_url';
    logger.info('Stage 3.7 summary', summary);
    return { items: [bootstrapped], summary };
  }

  const itemsWithImageHints = applyTicketImageHints(inputItems, ticketInfo);
  summary.updatedFields.images = itemsWithImageHints.imageHintsApplied;
  const enrichedItems = itemsWithImageHints.items;
  const candidates = enrichedItems.filter((item) => shouldEnrichItem(item));

  if (candidates.length === 0) {
    summary.reason = itemsWithImageHints.imageHintsApplied > 0
      ? 'image_hints_applied_no_candidates'
      : 'no_candidates';
    logger.info('Stage 3.7 summary', summary);
    return { items: enrichedItems, summary };
  }

  const normalizedInfoTitle = normalizeName(ticketInfo.title || '');
  const applyToAll =
    candidates.length === 1 ||
    !normalizedInfoTitle;

  const updatedItems = enrichedItems.map((item) => {
    if (!shouldEnrichItem(item)) return item;

    const shouldApply =
      applyToAll ||
      nameMatches(normalizedInfoTitle, normalizeName(item.name || ''));

    if (!shouldApply) return item;

    const updated = { ...item } as any;
    if (!hasValue(updated.date) && ticketInfo.startDate) {
      updated.date = ticketInfo.startDate;
      updated._dateSourcedFromTicketUrl = true;
      summary.updatedFields.dates += 1;
    }
    if (!hasValue(updated.startTime) && ticketInfo.startTime) {
      updated.startTime = ticketInfo.startTime;
      updated._timeSourcedFromTicketUrl = true;
      updated.timeFlags = updated.timeFlags || {
        start: { source: 'none', evidence: '' },
        end: { toClose: false, evidence: '' },
      };
      updated.timeFlags.start = {
        source: 'explicit',
        evidence: ticketInfo.rawTimeText
          ? `ticket_url:${ticketInfo.rawTimeText}`
          : `ticket_url:${ticketInfo.sourceUrl}`,
      };
      summary.updatedFields.times += 1;
    }
    if (!hasValue(updated.venue) && ticketInfo.venue) {
      updated.venue = ticketInfo.venue;
      summary.updatedFields.venues += 1;
    }
    if (!hasValue(updated.price) && ticketInfo.price) {
      updated.price = ticketInfo.price;
      summary.updatedFields.prices += 1;
    }
    if (ticketInfo.imageUrl && !hasValue(updated._ticketImageUrl)) {
      updated._ticketImageUrl = ticketInfo.imageUrl;
      summary.updatedFields.images += 1;
    }

    if (updated._dateSourcedFromTicketUrl || updated._timeSourcedFromTicketUrl) {
      updated._ticketUrl = ticketInfo.sourceUrl;
      summary.appliedCount += 1;
    }
    return updated;
  });

  logger.info('Stage 3.7 summary', summary);
  return { items: updatedItems, summary };
}

function resolveTicketConfig(config: ParsingConfig) {
  const cfg = config.ticketLinkEnrichment || {};
  return {
    enabled: cfg.enabled !== false,
    allowedDomains: Array.isArray(cfg.allowedDomains) && cfg.allowedDomains.length > 0
      ? cfg.allowedDomains
      : DEFAULT_ALLOWED_DOMAINS,
    timeoutMs: typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : DEFAULT_TIMEOUT_MS,
    maxHtmlBytes: typeof cfg.maxHtmlBytes === 'number' ? cfg.maxHtmlBytes : DEFAULT_MAX_HTML_BYTES,
  };
}

function shouldEnrichItem(item: ExtractedItem): boolean {
  const hasDate = hasValue(item.date);
  const hasTime = hasValue(item.startTime);
  const isEventish =
    isEventishTicketItem(item);
  return isEventish && (!hasDate || !hasTime);
}

function isEventishTicketItem(item: ExtractedItem): boolean {
  return item._sourceType === 'event' ||
    item.isEvent === 'Yes' ||
    String(item.isFoodSpecial || '').toLowerCase() !== 'yes';
}

function applyTicketImageHints(
  items: ExtractedItem[],
  ticketInfo: TicketInfo
): { items: ExtractedItem[]; imageHintsApplied: number } {
  if (!ticketInfo?.imageUrl) {
    return { items, imageHintsApplied: 0 };
  }

  const eventishItems = items.filter((item) => isEventishTicketItem(item));
  if (eventishItems.length === 0) {
    return { items, imageHintsApplied: 0 };
  }

  const normalizedInfoTitle = normalizeName(ticketInfo.title || '');
  const applyToAll = eventishItems.length === 1 || !normalizedInfoTitle;

  let imageHintsApplied = 0;
  const nextItems = items.map((item) => {
    if (!isEventishTicketItem(item)) return item;

    const shouldApply =
      applyToAll ||
      nameMatches(normalizedInfoTitle, normalizeName(item.name || ''));
    if (!shouldApply) return item;

    const updated = { ...item } as any;
    if (!hasValue(updated._ticketImageUrl)) {
      updated._ticketImageUrl = ticketInfo.imageUrl;
      imageHintsApplied += 1;
    }
    return updated;
  });

  return { items: nextItems, imageHintsApplied };
}

function buildBootstrapItem(
  ticketInfo: TicketInfo,
  combinedText: string,
  timestamp: string,
  timezone: string
): ExtractedItem | null {
  const name = inferBootstrapName(ticketInfo.title || '', combinedText);
  const fallbackDate = deriveDateFromTimestamp(timestamp, timezone);
  const date = ticketInfo.startDate || fallbackDate || '';
  const startTime = ticketInfo.startTime || '';

  if (!name && !date && !startTime) return null;

  const item: any = {
    name: name || 'Ticketed Event',
    description: summarizeText(combinedText),
    date,
    startTime,
    endTime: '',
    venue: ticketInfo.venue || '',
    price: ticketInfo.price || '',
    recurringPattern: 'none',
    extractionReason: `Stage 3.7 bootstrap from ticket URL (${ticketInfo.source})`,
    _sourceType: 'event',
    _ticketUrl: ticketInfo.sourceUrl,
    _ticketImageUrl: ticketInfo.imageUrl || '',
    _ticketMatchedByName: true,
    _dateSourcedFromTicketUrl: Boolean(ticketInfo.startDate),
    _timeSourcedFromTicketUrl: Boolean(ticketInfo.startTime),
  };

  if (startTime) {
    item.timeFlags = {
      start: {
        source: 'explicit',
        evidence: ticketInfo.rawTimeText
          ? `ticket_url:${ticketInfo.rawTimeText}`
          : `ticket_url:${ticketInfo.sourceUrl}`,
      },
      end: {
        toClose: false,
        evidence: 'ticket_url',
      },
    };
  }

  return item;
}

function inferBootstrapName(ticketTitle: string, combinedText: string): string {
  if (hasValue(ticketTitle)) return String(ticketTitle).trim();
  const text = decodeHtml(String(combinedText || ''));
  const fromForOn = text.match(/\bfor\s+(.{4,120}?)\s+on\s+(?:\w+\s+\d{1,2}|\d{1,2}|\w+)/i);
  if (fromForOn && fromForOn[1]) return cleanName(fromForOn[1]);
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !/^https?:\/\//i.test(line));
  if (firstLine) return cleanName(firstLine);
  return 'Ticketed Event';
}

function cleanName(value: string): string {
  return String(value || '')
    .replace(/[#@].*$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[!?.,;:]+$/g, '')
    .trim();
}

function summarizeText(text: string): string {
  const cleaned = String(text || '')
    .replace(/\bhttps?:\/\/[^\s<>\"]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.slice(0, 320);
}

function deriveDateFromTimestamp(timestamp: string, timezone: string): string {
  if (!timestamp) return '';
  const local = DateTime.fromISO(String(timestamp), { zone: timezone });
  if (local.isValid) return local.toFormat('yyyy-MM-dd');
  const utc = DateTime.fromISO(String(timestamp), { zone: 'utc' });
  if (utc.isValid) return utc.setZone(timezone).toFormat('yyyy-MM-dd');
  return '';
}

function collectTicketUrls(texts: string[], extraUrls: string[], allowedDomains: string[]): string[] {
  const found: string[] = [];
  for (const text of texts || []) {
    found.push(...extractUrlsFromText(text || ''));
  }
  found.push(...(extraUrls || []));

  const unique = new Set<string>();
  for (const raw of found) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;
    if (!isAllowedTicketUrl(normalized, allowedDomains)) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\bhttps?:\/\/[^\s<>\"]+/gi);
  if (!matches) return [];
  return matches.map((url) => url.trim());
}

function normalizeUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[)\],.!?;:]+$/g, '');
  if (!/^https?:\/\//i.test(cleaned)) return null;
  try {
    const parsed = new URL(cleaned);
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveMaybeRelativeUrl(raw: string, baseUrl: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeTicketProResourcePath(trimmed);
  }
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    return normalizeTicketProResourcePath(resolved);
  } catch {
    return '';
  }
}

function normalizeTicketProResourcePath(url: string): string {
  try {
    const parsed = new URL(String(url || ''));
    if (
      /(^|\.)ticketpro\.(ca|com)$/i.test(parsed.hostname) &&
      /^\/v1\/resources\//i.test(parsed.pathname)
    ) {
      parsed.pathname = `/api${parsed.pathname}`;
    }
    return parsed.toString();
  } catch {
    return String(url || '');
  }
}

function isAllowedTicketUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function fetchTicketInfo(
  url: string,
  cfg: { timeoutMs: number; maxHtmlBytes: number },
  timezone: string
): Promise<TicketInfo | null> {
  if (ticketCache.has(url)) return ticketCache.get(url) || null;

  try {
    if (isTicketProUrl(url)) {
      const ticketproInfo = await fetchTicketProInfo(url, cfg, timezone);
      if (ticketproInfo && (ticketproInfo.startDate || ticketproInfo.startTime || ticketproInfo.imageUrl)) {
        ticketCache.set(url, ticketproInfo);
        return ticketproInfo;
      }
    }

    const html = await fetchTicketHtml(url, cfg.timeoutMs, cfg.maxHtmlBytes);
    if (!html) {
      ticketCache.set(url, null);
      return null;
    }
    const info =
      parseJsonLd(html, url, timezone) ||
      parseMetaTags(html, url, timezone) ||
      parseTextFallback(html, url, timezone);
    ticketCache.set(url, info || null);
    return info || null;
  } catch (error) {
    logger.warn('Ticket link fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    ticketCache.set(url, null);
    return null;
  }
}

function isTicketProUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'ticketpro.ca' ||
      host.endsWith('.ticketpro.ca') ||
      host === 'ticketpro.com' ||
      host.endsWith('.ticketpro.com');
  } catch {
    return false;
  }
}

function extractTicketProPageId(url: string): string | null {
  try {
    const path = new URL(url).pathname || '';
    const match = path.match(/\/pages\/(\d+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchTicketProInfo(
  url: string,
  cfg: { timeoutMs: number; maxHtmlBytes: number },
  timezone: string
): Promise<TicketInfo | null> {
  const pageId = extractTicketProPageId(url);
  if (!pageId) return null;

  let apiUrl = '';
  try {
    const origin = new URL(url).origin;
    apiUrl = `${origin}/api/v1/pages/${pageId}`;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'GathrParser/1.0',
        'accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('TicketPro API non-200', { url: apiUrl, status: response.status });
      return null;
    }

    const payload = await response.json();
    const info = parseTicketProPayload(payload, url, timezone);
    if (!info) return null;

    if (!info.price) {
      const eventApiUrl = buildTicketProEventApiUrl(payload, url);
      if (eventApiUrl) {
        const eventPayload = await fetchTicketProEventDetails(eventApiUrl, cfg.timeoutMs);
        const price = extractTicketProPrice(eventPayload);
        if (price) info.price = price;
      }
    }

    return info;
  } catch (error) {
    logger.warn('TicketPro API fetch failed', {
      url: apiUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildTicketProEventApiUrl(payload: any, sourceUrl: string): string | null {
  try {
    const origin = new URL(sourceUrl).origin;
    const eventPath = payload?.itemsDates?.items?.[0]?.dates?.[0]?.url || '';
    if (!eventPath || typeof eventPath !== 'string') return null;
    if (eventPath.startsWith('/api/')) return `${origin}${eventPath}`;
    const normalized = eventPath.startsWith('/') ? eventPath : `/${eventPath}`;
    return `${origin}/api/v1${normalized}`;
  } catch {
    return null;
  }
}

async function fetchTicketProEventDetails(
  url: string,
  timeoutMs: number
): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'GathrParser/1.0',
        'accept': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('TicketPro event API non-200', { url, status: response.status });
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.warn('TicketPro event API fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractTicketProPrice(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const priceLevels = payload?.itemHours?.[0]?.priceLevels || [];
  const cents: number[] = [];

  for (const level of priceLevels) {
    const min = Number(level?.price_min || 0);
    const max = Number(level?.price_max || 0);
    if (Number.isFinite(min) && min > 0) cents.push(min);
    if (Number.isFinite(max) && max > 0) cents.push(max);
    const prices = Array.isArray(level?.prices) ? level.prices : [];
    for (const price of prices) {
      const value = Number(price?.price || 0);
      if (Number.isFinite(value) && value > 0) cents.push(value);
    }
  }

  if (cents.length === 0) return null;
  const min = Math.min(...cents);
  const max = Math.max(...cents);
  if (!Number.isFinite(min) || min <= 0) return null;

  const format = (value: number) => `$${(value / 100).toFixed(2)}`;
  if (Number.isFinite(max) && max > 0 && max !== min) {
    return `${format(min)}-${format(max)}`;
  }
  return format(min);
}

function parseTicketProPayload(payload: any, sourceUrl: string, timezone: string): TicketInfo | null {
  if (!payload || typeof payload !== 'object') return null;

  const title = payload.title || '';
  const venue = Array.isArray(payload.locations) && payload.locations[0]
    ? String(payload.locations[0]?.name || '')
    : '';
  const imageUrl = resolveMaybeRelativeUrl(
    payload?.imageUrlBig ||
    payload?.imageUrlSmall ||
    payload?.itemsDates?.items?.[0]?.dates?.[0]?.imageUrl ||
    '',
    sourceUrl
  );

  const primaryDateTime =
    payload?.itemsDates?.items?.[0]?.dates?.[0]?.date ||
    payload?.dates?.[0] ||
    payload?.itemsDates?.items?.[0]?.date ||
    '';

  let start = primaryDateTime ? parseIsoDateTime(String(primaryDateTime), timezone) : null;

  if (!start) {
    const fallbackText = [
      payload?.itemsDates?.items?.[0]?.dates?.[0]?.itemHours?.[0]?.formattedDate,
      payload?.miniDescription,
      payload?.description,
    ]
      .filter(Boolean)
      .map((text: string) => htmlToText(String(text)))
      .join(' ');
    if (fallbackText) {
      start = parseDateTimeFromText(fallbackText, timezone);
    }
  }

  if (!start && !imageUrl) return null;

  return {
    title: String(title || ''),
    venue,
    startDate: start?.date || '',
    startTime: start?.time || '',
    price: '',
    imageUrl: imageUrl || '',
    sourceUrl,
    source: 'ticketpro_api',
    rawDateText: start?.rawDate,
    rawTimeText: start?.rawTime,
  };
}

async function fetchTicketHtml(
  url: string,
  timeoutMs: number,
  maxBytes: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'GathrParser/1.0',
        'accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('Ticket link fetch non-200', { url, status: response.status });
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      logger.warn('Ticket link fetch non-html content', { url, contentType });
      return null;
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      logger.warn('Ticket link HTML too large', {
        url,
        length: text.length,
        maxBytes,
      });
      return text.slice(0, maxBytes);
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonLd(html: string, url: string, timezone: string): TicketInfo | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) return null;

  for (const block of blocks) {
    const raw = String(block[1] || '').trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;
    const candidates = flattenJsonLd(parsed);
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if (!isEventType(candidate['@type'])) continue;
      const info = extractInfoFromJsonLd(candidate, url, timezone);
      if (info && (info.startDate || info.startTime || info.imageUrl)) {
        return info;
      }
    }
  }
  return null;
}

function extractInfoFromJsonLd(obj: any, url: string, timezone: string): TicketInfo | null {
  const startRaw = obj.startDate || obj.start_date || '';
  const start = parseIsoDateTime(startRaw, timezone);
  const venue = obj.location?.name || obj.location?.address?.name || '';
  const imageRaw = Array.isArray(obj.image) ? obj.image[0] : obj.image || '';
  const imageUrl = resolveMaybeRelativeUrl(String(imageRaw || ''), url);
  const offers = obj.offers || obj.offer || {};
  const price =
    offers.price ||
    offers.lowPrice ||
    offers.highPrice ||
    (Array.isArray(offers) ? offers[0]?.price : '');

  return {
    title: obj.name || '',
    venue: String(venue || ''),
    startDate: start?.date || '',
    startTime: start?.time || '',
    price: price ? String(price) : '',
    imageUrl: imageUrl || '',
    sourceUrl: url,
    source: 'jsonld',
    rawDateText: start?.rawDate,
    rawTimeText: start?.rawTime,
  };
}

function parseMetaTags(html: string, url: string, timezone: string): TicketInfo | null {
  const meta = extractMetaTags(html);
  const title = meta['og:title'] || meta['title'] || '';
  const description = meta['og:description'] || meta['description'] || '';
  const startRaw = meta['event:start_time'] || meta['startDate'] || meta['start_time'] || '';
  const imageRaw = meta['og:image'] || meta['twitter:image'] || meta['image'] || '';
  const imageUrl = resolveMaybeRelativeUrl(String(imageRaw || ''), url);

  const start = parseIsoDateTime(startRaw, timezone) || parseDateTimeFromText(`${title} ${description}`, timezone);
  if (!start && !imageUrl) return null;

  return {
    title,
    venue: '',
    startDate: start?.date || '',
    startTime: start?.time || '',
    price: '',
    imageUrl: imageUrl || '',
    sourceUrl: url,
    source: 'meta',
    rawDateText: start?.rawDate,
    rawTimeText: start?.rawTime,
  };
}

function parseTextFallback(html: string, url: string, timezone: string): TicketInfo | null {
  const text = htmlToText(html);
  const start = parseDateTimeFromText(text, timezone);
  if (!start) return null;

  return {
    title: '',
    venue: '',
    startDate: start.date || '',
    startTime: start.time || '',
    price: '',
    sourceUrl: url,
    source: 'text',
    rawDateText: start.rawDate,
    rawTimeText: start.rawTime,
  };
}

function parseIsoDateTime(raw: string, timezone: string): { date: string; time: string; rawDate: string; rawTime: string } | null {
  if (!raw) return null;
  const normalized = String(raw).trim();
  const dt = DateTime.fromISO(normalized, { zone: timezone });
  if (dt.isValid) {
    const hasTime = normalized.includes('T');
    return {
      date: dt.toFormat('yyyy-MM-dd'),
      time: hasTime ? dt.toFormat('HH:mm') : '',
      rawDate: normalized,
      rawTime: hasTime ? dt.toFormat('HH:mm') : '',
    };
  }
  return null;
}

function parseDateTimeFromText(text: string, timezone: string): { date: string; time: string; rawDate: string; rawTime: string } | null {
  if (!text) return null;
  const normalized = decodeHtml(text);

  const dateTimeMatch = normalized.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i
  );

  if (dateTimeMatch) {
    const rawDate = `${dateTimeMatch[1]} ${dateTimeMatch[0].match(/\b\d{1,2}\b/)?.[0] || ''}, ${dateTimeMatch[0].match(/\b\d{4}\b/)?.[0] || ''}`;
    const rawTime = dateTimeMatch[2];
    const parsedDate = parseDateFromText(rawDate, timezone);
    const parsedTime = parseTimeFromText(rawTime);
    if (parsedDate || parsedTime) {
      return {
        date: parsedDate || '',
        time: parsedTime || '',
        rawDate: rawDate,
        rawTime: rawTime,
      };
    }
  }

  const dateMatch = normalized.match(
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/i
  );
  const timeMatch = normalized.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i);

  const parsedDate = dateMatch ? parseDateFromText(dateMatch[0], timezone) : '';
  const parsedTime = timeMatch ? parseTimeFromText(timeMatch[0]) : '';

  if (parsedDate || parsedTime) {
    return {
      date: parsedDate || '',
      time: parsedTime || '',
      rawDate: dateMatch?.[0] || '',
      rawTime: timeMatch?.[0] || '',
    };
  }

  return null;
}

function parseDateFromText(raw: string, timezone: string): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,]?\s*/i, '')
    .replace(/,/g, '')
    .trim();
  const dt = DateTime.fromFormat(cleaned, 'MMMM d yyyy', { zone: timezone });
  if (dt.isValid) return dt.toFormat('yyyy-MM-dd');
  const dtShort = DateTime.fromFormat(cleaned, 'MMM d yyyy', { zone: timezone });
  if (dtShort.isValid) return dtShort.toFormat('yyyy-MM-dd');
  return '';
}

function parseTimeFromText(raw: string): string {
  if (!raw) return '';
  const cleaned = String(raw).replace(/\./g, '').trim();
  const match = cleaned.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return '';
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? match[2] : '00';
  const period = match[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const regex = /<meta\s+(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const key = match[1].toLowerCase();
    if (!meta[key]) meta[key] = decodeHtml(match[2] || '');
  }
  return meta;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  );
}

function decodeHtml(text: string): string {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function flattenJsonLd(input: any): any[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap(flattenJsonLd);
  if (input['@graph']) return flattenJsonLd(input['@graph']);
  return [input];
}

function isEventType(type: any): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => String(t).toLowerCase().includes('event'));
}

function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasValue(value: unknown): boolean {
  const v = String(value || '').trim();
  return v !== '' && v.toLowerCase() !== 'unknown';
}

function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
