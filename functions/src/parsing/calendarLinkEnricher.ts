// @ts-nocheck
/**
 * Calendar Link Enricher
 * Fetches linked calendar pages (non-ticket) and merges event listings.
 */

import { DateTime } from 'luxon';
import { ExtractedItem, ParsingConfig } from './types.js';
import { logger } from '../utils/logger.js';

type CalendarLinkSummary = {
  attemptedUrls: number;
  attemptedDates: number;
  fetchedFeeds: number;
  extractedCount: number;
  mergedCount: number;
  detailPagesAttempted?: number;
  detailPagesFetched?: number;
  detailImagesExtracted?: number;
  detailImagesApplied?: number;
  windowMode?: 'rolling' | 'week' | 'weekend' | 'month';
  windowStart?: string;
  windowEnd?: string;
  windowReason?: string;
  candidateUrl?: string;
  usedUrl?: string;
  reason?: string;
};

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_HTML_BYTES = 1_000_000;
const DEFAULT_MAX_FEED_DAYS = 8;
const DEFAULT_MAX_DETAIL_PAGES = 80;
const MAX_CANDIDATE_URLS = 3;
const MAX_FEED_DATES_ROLLING = 14;
const MAX_FEED_DATES_MONTH = 62;
const htmlCache = new Map<string, string | null>();
const MONTH_NAMES: Array<{ token: string; month: number }> = [
  { token: 'january', month: 1 },
  { token: 'february', month: 2 },
  { token: 'march', month: 3 },
  { token: 'april', month: 4 },
  { token: 'may', month: 5 },
  { token: 'june', month: 6 },
  { token: 'july', month: 7 },
  { token: 'august', month: 8 },
  { token: 'september', month: 9 },
  { token: 'october', month: 10 },
  { token: 'november', month: 11 },
  { token: 'december', month: 12 },
];
const WEEKDAY_HEADERS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export async function enrichEventsFromCalendarLinks(
  items: ExtractedItem[],
  combinedText: string,
  ocrText: string | undefined,
  timestamp: string,
  userName: string,
  config: ParsingConfig
): Promise<{ items: ExtractedItem[]; summary: CalendarLinkSummary }> {
  const summary: CalendarLinkSummary = {
    attemptedUrls: 0,
    attemptedDates: 0,
    fetchedFeeds: 0,
    extractedCount: 0,
    mergedCount: 0,
    detailPagesAttempted: 0,
    detailPagesFetched: 0,
    detailImagesExtracted: 0,
    detailImagesApplied: 0,
  };

  const inputItems = Array.isArray(items) ? items : [];
  const cfg = resolveCalendarConfig(config);
  if (!cfg.enabled) {
    summary.reason = 'disabled';
    return { items: inputItems, summary };
  }

  const candidateUrls = collectCalendarUrls([combinedText, ocrText || '']);
  if (candidateUrls.length === 0) {
    summary.reason = 'no_calendar_urls';
    return { items: inputItems, summary };
  }
  summary.candidateUrl = candidateUrls[0];

  const mergedScrapedItems: ExtractedItem[] = [];
  for (const url of candidateUrls.slice(0, MAX_CANDIDATE_URLS)) {
    summary.attemptedUrls += 1;

    const pageHtml = await fetchHtml(url, cfg.timeoutMs, cfg.maxHtmlBytes);
    if (!pageHtml) continue;

    const dateWindow = resolveDateWindow({
      timestamp,
      timezone: config.timezone,
      requestedDays: cfg.maxFeedDays,
      combinedText,
      pageUrl: url,
      pageHtml,
    });
    if (!summary.windowMode) {
      summary.windowMode = dateWindow.mode;
      summary.windowStart = dateWindow.start;
      summary.windowEnd = dateWindow.end;
      summary.windowReason = dateWindow.reason;
    }
    const feedUrls = collectFeedUrls(url, pageHtml, dateWindow);
    summary.attemptedDates += feedUrls.length;
    if (feedUrls.length === 0) continue;

    const scrapedForUrl: ExtractedItem[] = [];
    for (const feedUrl of feedUrls) {
      const feedHtml = await fetchHtml(feedUrl, cfg.timeoutMs, cfg.maxHtmlBytes);
      if (!feedHtml) continue;
      summary.fetchedFeeds += 1;
      const currentDate = extractCurrentDate(feedUrl);
      if (!currentDate) continue;
      const parsed = parseDrupalFeedItems(feedHtml, currentDate, url, userName);
      if (parsed.length > 0) scrapedForUrl.push(...parsed);
    }

    if (scrapedForUrl.length > 0) {
      mergedScrapedItems.push(...scrapedForUrl);
      summary.usedUrl = url;
      // Use first successful calendar URL to keep Stage 3.8 bounded.
      break;
    }
  }

  if (mergedScrapedItems.length === 0) {
    summary.reason = 'no_calendar_feed_items';
    return { items: inputItems, summary };
  }

  const detailImageStats = await enrichDetailImagesForCalendarItems(mergedScrapedItems, cfg);
  summary.detailPagesAttempted = detailImageStats.attempted;
  summary.detailPagesFetched = detailImageStats.fetched;
  summary.detailImagesExtracted = detailImageStats.extracted;
  summary.detailImagesApplied = detailImageStats.applied;

  summary.extractedCount = mergedScrapedItems.length;
  const deduped = mergeWithoutDuplicates(inputItems, mergedScrapedItems);
  summary.mergedCount = deduped.length - inputItems.length;
  summary.reason = summary.mergedCount > 0 ? 'merged_calendar_feed_items' : 'calendar_feed_duplicates';

  logger.info('Stage 3.8 summary', summary);
  return { items: deduped, summary };
}

function resolveCalendarConfig(config: ParsingConfig) {
  const cfg = config.calendarLinkEnrichment || {};
  return {
    enabled: cfg.enabled !== false,
    timeoutMs: typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : DEFAULT_TIMEOUT_MS,
    maxHtmlBytes: typeof cfg.maxHtmlBytes === 'number' ? cfg.maxHtmlBytes : DEFAULT_MAX_HTML_BYTES,
    maxFeedDays: typeof cfg.maxFeedDays === 'number' ? cfg.maxFeedDays : DEFAULT_MAX_FEED_DAYS,
    maxDetailPages:
      typeof (cfg as any).maxDetailPages === 'number'
        ? (cfg as any).maxDetailPages
        : DEFAULT_MAX_DETAIL_PAGES,
  };
}

function collectCalendarUrls(texts: string[]): string[] {
  const found: string[] = [];
  for (const text of texts || []) {
    found.push(...extractUrls(text || ''));
  }

  const unique = new Set<string>();
  for (const raw of found) {
    const normalized = normalizeUrl(raw);
    if (!normalized) continue;
    if (!isCalendarUrl(normalized)) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi);
  if (!matches) return [];
  return matches.map((url) => url.trim());
}

function normalizeUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim().replace(/[)\],.!?;:]+$/g, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.toString();
  } catch {
    return null;
  }
}

function isCalendarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.includes('/events') ||
      path.includes('/calendar') ||
      path.includes('/program')
    );
  } catch {
    return false;
  }
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
      logger.warn('Calendar link fetch non-200', { url, status: response.status });
      htmlCache.set(url, null);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      logger.warn('Calendar link fetch non-html content', { url, contentType });
      htmlCache.set(url, null);
      return null;
    }

    const text = await response.text();
    const clipped = text.length > maxBytes ? text.slice(0, maxBytes) : text;
    htmlCache.set(url, clipped);
    return clipped;
  } catch (error) {
    logger.warn('Calendar link fetch failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    htmlCache.set(url, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function resolveDateWindow(params: {
  timestamp: string;
  timezone?: string;
  requestedDays: number;
  combinedText: string;
  pageUrl: string;
  pageHtml: string;
}): { start: string; end: string; dates: string[]; mode: 'rolling' | 'week' | 'weekend' | 'month'; reason: string } {
  const timezone = params.timezone || 'America/Halifax';
  const local = DateTime.fromISO(String(params.timestamp || ''), { zone: timezone });
  const base = local.isValid ? local.startOf('day') : DateTime.now().setZone(timezone).startOf('day');
  const text = String(params.combinedText || '').toLowerCase();

  const monthWindow = resolveMonthCalendarWindow({
    pageUrl: params.pageUrl,
    pageHtml: params.pageHtml,
    combinedText: text,
    fallbackDate: base,
    timezone,
  });
  if (monthWindow) {
    return monthWindow;
  }

  const days = Math.max(
    1,
    Math.min(MAX_FEED_DATES_ROLLING, Number(params.requestedDays) || DEFAULT_MAX_FEED_DAYS)
  );

  let start = base.minus({ days: 1 });
  let mode: 'rolling' | 'week' | 'weekend' = 'rolling';
  let reason = 'default_rolling_window';

  if (/\bthis week\b/.test(text)) {
    start = base.setLocale('en-CA').startOf('week');
    mode = 'week';
    reason = 'text_signal_this_week';
  } else if (/\bthis weekend\b/.test(text)) {
    const weekday = base.weekday; // 1=Mon ... 7=Sun
    const delta = weekday <= 6 ? 6 - weekday : 0;
    start = base.plus({ days: delta });
    mode = 'weekend';
    reason = 'text_signal_this_weekend';
  }

  const end = start.plus({ days: days - 1 });
  return {
    start: start.toFormat('yyyy-MM-dd'),
    end: end.toFormat('yyyy-MM-dd'),
    dates: buildDateList(start, end, MAX_FEED_DATES_ROLLING),
    mode,
    reason,
  };
}

function resolveMonthCalendarWindow(params: {
  pageUrl: string;
  pageHtml: string;
  combinedText: string;
  fallbackDate: DateTime;
  timezone: string;
}): { start: string; end: string; dates: string[]; mode: 'month'; reason: string } | null {
  const pageUrl = String(params.pageUrl || '').toLowerCase();
  const html = String(params.pageHtml || '');
  const text = String(params.combinedText || '').toLowerCase();

  const monthAnchor = extractMonthAnchorFromHtml(html, params.timezone);
  const weekdayHeaderCount = countWeekdayHeaders(html);
  const hasMonthToggle = /\bupcoming\b[\s\S]{0,160}\blist\b[\s\S]{0,160}\bmonth\b[\s\S]{0,160}\bweek\b[\s\S]{0,160}\bday\b/i.test(
    html
  );
  const hasCalendarLabel = /\bmonth calendar\b/i.test(html);
  const hasMonthPath = /\/month(?:\/|$|\?)/i.test(pageUrl);
  const feedDateCount = countFeedDatesInHtml(html);
  const hasMonthTextSignal = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d{2}\b/i.test(
    text
  );

  let signalScore = 0;
  if (monthAnchor) signalScore += 2;
  if (hasMonthPath) signalScore += 1;
  if (weekdayHeaderCount >= 5) signalScore += 1;
  if (hasMonthToggle) signalScore += 1;
  if (hasCalendarLabel) signalScore += 1;
  if (feedDateCount >= 20) signalScore += 2;
  if (hasMonthTextSignal) signalScore += 1;

  if (signalScore < 3) {
    return null;
  }

  const anchor = monthAnchor || params.fallbackDate.startOf('month');
  const start = anchor.startOf('month');
  const end = anchor.endOf('month').startOf('day');
  const reasons: string[] = [];
  if (monthAnchor) reasons.push('html_month_year_heading');
  if (hasMonthPath) reasons.push('month_path');
  if (hasMonthToggle) reasons.push('calendar_view_toggles');
  if (weekdayHeaderCount >= 5) reasons.push('weekday_headers');
  if (feedDateCount >= 20) reasons.push('dense_month_feed_links');
  if (hasMonthTextSignal) reasons.push('post_text_month_token');
  if (hasCalendarLabel) reasons.push('month_calendar_label');

  return {
    start: start.toFormat('yyyy-MM-dd'),
    end: end.toFormat('yyyy-MM-dd'),
    dates: buildDateList(start, end, MAX_FEED_DATES_MONTH),
    mode: 'month',
    reason: reasons.join('|') || 'month_mode_signals',
  };
}

function extractMonthAnchorFromHtml(html: string, timezone: string): DateTime | null {
  const cleaned = decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
  if (!cleaned) return null;

  const monthPattern = new RegExp(
    `\\b(${MONTH_NAMES.map((entry) => entry.token).join('|')})\\s+(20\\d{2})\\b`,
    'i'
  );
  const match = cleaned.match(monthPattern);
  if (!match) return null;

  const monthToken = String(match[1] || '').toLowerCase();
  const month = MONTH_NAMES.find((entry) => entry.token === monthToken)?.month;
  const year = Number(match[2]);
  if (!month || !Number.isFinite(year)) return null;

  const candidate = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone });
  return candidate.isValid ? candidate : null;
}

function countWeekdayHeaders(html: string): number {
  const cleaned = decodeHtml(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
  );

  let count = 0;
  for (const token of WEEKDAY_HEADERS) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(cleaned)) {
      count += 1;
    }
  }
  return count;
}

function countFeedDatesInHtml(html: string): number {
  const matches = String(html || '').match(/current_date=\d{4}-\d{2}-\d{2}/gi);
  if (!matches) return 0;
  return new Set(matches.map((value) => value.toLowerCase())).size;
}

function buildDateList(start: DateTime, end: DateTime, cap: number): string[] {
  const dates: string[] = [];
  let cursor = start.startOf('day');
  const last = end.startOf('day');

  while (cursor <= last && dates.length < cap) {
    dates.push(cursor.toFormat('yyyy-MM-dd'));
    cursor = cursor.plus({ days: 1 });
  }

  return dates;
}

function collectFeedUrls(
  pageUrl: string,
  html: string,
  window: { start: string; end: string; dates: string[] }
): string[] {
  const set = new Set<string>();
  const add = (raw: string) => {
    const resolved = resolveRelativeUrl(raw, pageUrl);
    if (!resolved) return;
    const date = extractCurrentDate(resolved);
    if (!date) return;
    if (date < window.start || date > window.end) return;
    set.add(resolved);
  };

  const feedHrefRegex =
    /href=["']([^"']*\/events\/feed\/html[^"']*current_date=\d{4}-\d{2}-\d{2}[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = feedHrefRegex.exec(html))) {
    add(decodeHtml(match[1] || ''));
  }

  const drupalFeedPath = extractDrupalFeedPath(html);
  if (drupalFeedPath) {
    for (const date of window.dates) {
      const synthesized = buildFeedUrl(pageUrl, drupalFeedPath, date);
      if (synthesized) set.add(synthesized);
    }
  }

  return Array.from(set);
}

function extractDrupalFeedPath(html: string): string {
  const match = html.match(/"htmlFeedUrl":"([^"]+)"/i);
  if (!match) return '';
  const raw = match[1] || '';
  return decodeHtml(raw.replace(/\\\//g, '/'));
}

function buildFeedUrl(basePageUrl: string, feedPathOrUrl: string, currentDate: string): string {
  const resolved = resolveRelativeUrl(feedPathOrUrl, basePageUrl);
  if (!resolved) return '';
  try {
    const parsed = new URL(resolved);
    parsed.searchParams.set('_wrapper_format', 'lc_calendar_feed');
    parsed.searchParams.set('adjust_range', '1');
    parsed.searchParams.set('current_date', currentDate);
    parsed.searchParams.set('ongoing_events', 'hide');
    return parsed.toString();
  } catch {
    return '';
  }
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

function extractCurrentDate(url: string): string {
  try {
    const parsed = new URL(url);
    const date = String(parsed.searchParams.get('current_date') || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  } catch {
    return '';
  }
}

function parseDrupalFeedItems(
  html: string,
  currentDate: string,
  sourceUrl: string,
  userName: string
): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const articleRegex =
    /<article\b[^>]*class=["'][^"']*event-card[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;

  let match: RegExpExecArray | null;
  while ((match = articleRegex.exec(html))) {
    const block = String(match[0] || '');
    const name = cleanText(extractFirst(block, /class=["'][^"']*lc-event__link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i));
    if (!name) continue;

    const linkTag = extractFirst(
      block,
      /(<a[^>]*class=["'][^"']*lc-event__link[^"']*["'][^>]*>)/i
    );
    const detailHref = extractFirst(linkTag, /href=["']([^"']+)["']/i);
    const detailUrl = resolveRelativeUrl(decodeHtml(detailHref || ''), sourceUrl);

    const timeText = cleanText(
      extractFirst(block, /class=["'][^"']*lc-event-info-item--time[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
    );
    const { startTime, endTime } = parseTimeRange(timeText);

    const body = cleanText(extractFirst(block, /class=["'][^"']*lc-event__body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i));
    const branch = cleanText(
      extractFirst(
        block,
        /<div class=["'][^"']*lc-event__branch[^"']*["'][^>]*>[\s\S]*?<strong[^>]*>[^<]*<\/strong>\s*([\s\S]*?)<\/div>/i
      )
    );

    const programType = cleanText(
      extractFirst(
        block,
        /<div class=["'][^"']*lc-event__program-types[^"']*["'][^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/i
      )
    );

    const item: any = {
      name,
      description: body || programType || '',
      date: currentDate,
      startTime: startTime || '',
      endTime: endTime || '',
      venue: branch || userName || '',
      price: '',
      recurringPattern: 'none',
      extractionReason: `Stage 3.8 linked calendar feed (${new URL(sourceUrl).hostname})`,
      _sourceType: 'event',
    };
    if (detailUrl) item.ticketLink = detailUrl;

    items.push(item);
  }

  return dedupeParsedItems(items);
}

function parseTimeRange(raw: string): { startTime: string; endTime: string } {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return { startTime: '', endTime: '' };

  const range = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\b/i
  );
  if (range) {
    return {
      startTime: parse12hTime(range[1]),
      endTime: parse12hTime(range[2]),
    };
  }

  const single = text.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i);
  return {
    startTime: single ? parse12hTime(single[0]) : '',
    endTime: '',
  };
}

function parse12hTime(raw: string): string {
  const cleaned = String(raw || '').replace(/\./g, '').trim().toLowerCase();
  const m = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (!m) return '';
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? m[2] : '00';
  const period = m[3].toLowerCase();
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

async function enrichDetailImagesForCalendarItems(
  items: ExtractedItem[],
  cfg: {
    timeoutMs: number;
    maxHtmlBytes: number;
    maxDetailPages: number;
  }
): Promise<{ attempted: number; fetched: number; extracted: number; applied: number }> {
  const detailUrlToItems = new Map<string, ExtractedItem[]>();
  for (const item of items || []) {
    const detailUrl = String((item as any).ticketLink || '').trim();
    if (!detailUrl) continue;
    const bucket = detailUrlToItems.get(detailUrl) || [];
    bucket.push(item);
    detailUrlToItems.set(detailUrl, bucket);
  }

  const candidateUrls = Array.from(detailUrlToItems.keys()).slice(
    0,
    Math.max(1, Number(cfg.maxDetailPages) || DEFAULT_MAX_DETAIL_PAGES)
  );
  if (candidateUrls.length === 0) {
    return { attempted: 0, fetched: 0, extracted: 0, applied: 0 };
  }

  const stats = { attempted: 0, fetched: 0, extracted: 0, applied: 0 };
  const detailTimeoutMs = Math.max(4000, Math.min(cfg.timeoutMs, 10000));

  for (const detailUrl of candidateUrls) {
    stats.attempted += 1;
    const detailHtml = await fetchHtml(detailUrl, detailTimeoutMs, cfg.maxHtmlBytes);
    if (!detailHtml) continue;
    stats.fetched += 1;

    const imageUrl = extractDetailPageImageUrl(detailHtml, detailUrl);
    if (!imageUrl) continue;
    stats.extracted += 1;

    const linkedItems = detailUrlToItems.get(detailUrl) || [];
    for (const item of linkedItems) {
      if (hasValue((item as any)._ticketImageUrl)) continue;
      (item as any)._ticketImageUrl = imageUrl;
      stats.applied += 1;
    }
  }

  return stats;
}

function extractDetailPageImageUrl(html: string, pageUrl: string): string {
  const candidates: string[] = [];
  const pushCandidate = (raw: string): void => {
    const resolved = resolveDetailImageCandidate(raw, pageUrl);
    if (!resolved) return;
    candidates.push(resolved);
  };

  pushCandidate(
    extractFirst(
      html,
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i
    )
  );
  pushCandidate(
    extractFirst(
      html,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i
    )
  );

  const jsonLdRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch: RegExpExecArray | null;
  while ((jsonLdMatch = jsonLdRegex.exec(html))) {
    const scriptContent = String(jsonLdMatch[1] || '').trim();
    if (!scriptContent) continue;
    const parsedCandidates = extractImageCandidatesFromJsonLd(scriptContent);
    for (const candidate of parsedCandidates) {
      pushCandidate(candidate);
    }
  }

  pushCandidate(
    extractFirst(
      html,
      /class=["'][^"']*field--name-field-lc-image[^"']*["'][\s\S]{0,3000}?<img[^>]+src=["']([^"']+)["']/i
    )
  );
  pushCandidate(
    extractFirst(
      html,
      /class=["'][^"']*lc-event-featured-image[^"']*["'][\s\S]{0,3000}?<img[^>]+src=["']([^"']+)["']/i
    )
  );

  const unique = Array.from(new Set(candidates));
  if (unique.length === 0) return '';

  unique.sort((a, b) => scoreDetailImageUrl(b) - scoreDetailImageUrl(a));
  return unique[0] || '';
}

function extractImageCandidatesFromJsonLd(scriptContent: string): string[] {
  const normalized = decodeHtml(
    String(scriptContent || '')
      .replace(/\\\//g, '/')
      .trim()
  );
  if (!normalized) return [];

  const candidates = new Set<string>();
  const parsed = safeParseJson(normalized);
  if (parsed !== null) {
    collectImageCandidatesFromJson(parsed, candidates);
  }

  if (candidates.size === 0) {
    const inlineImageRegex = /"image"\s*:\s*"([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = inlineImageRegex.exec(normalized))) {
      const value = String(match[1] || '').trim();
      if (value) candidates.add(value);
    }
  }

  return Array.from(candidates);
}

function safeParseJson(raw: string): unknown | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectImageCandidatesFromJson(value: unknown, candidates: Set<string>): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectImageCandidatesFromJson(entry, candidates);
    }
    return;
  }
  if (typeof value !== 'object') return;

  const obj = value as Record<string, unknown>;
  const addValue = (raw: unknown): void => {
    if (!raw) return;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed) candidates.add(trimmed);
      return;
    }
    if (Array.isArray(raw)) {
      for (const entry of raw) addValue(entry);
      return;
    }
    if (typeof raw === 'object') {
      const nested = raw as Record<string, unknown>;
      if (typeof nested.url === 'string') candidates.add(nested.url.trim());
      if (typeof nested.contentUrl === 'string') candidates.add(nested.contentUrl.trim());
      if (typeof nested.thumbnailUrl === 'string') candidates.add(nested.thumbnailUrl.trim());
    }
  };

  addValue(obj.image);
  addValue(obj.thumbnailUrl);
  addValue(obj.contentUrl);

  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === 'object') {
      collectImageCandidatesFromJson(nested, candidates);
    }
  }
}

function resolveDetailImageCandidate(raw: string, pageUrl: string): string {
  const cleaned = decodeHtml(
    String(raw || '')
      .replace(/\\\//g, '/')
      .trim()
  );
  if (!cleaned || cleaned.startsWith('data:')) return '';
  const resolved = resolveRelativeUrl(cleaned, pageUrl);
  if (!resolved) return '';
  return isLikelyDecorativeImageUrl(resolved) ? '' : resolved;
}

function scoreDetailImageUrl(url: string): number {
  const lower = String(url || '').toLowerCase();
  let score = 0;
  if (lower.includes('/sites/default/files/')) score += 40;
  if (lower.includes('/styles/')) score += 10;
  if (/\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.test(lower)) score += 4;
  if (lower.includes('/event/')) score += 2;
  if (isLikelyDecorativeImageUrl(lower)) score -= 80;
  return score;
}

function isLikelyDecorativeImageUrl(url: string): boolean {
  const lower = String(url || '').toLowerCase();
  return (
    lower.includes('favicon') ||
    /\/logo(?:[-_/]|$)/.test(lower) ||
    lower.includes('/themes/') ||
    lower.includes('/core/misc/') ||
    lower.includes('sprite')
  );
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}

function mergeWithoutDuplicates(base: ExtractedItem[], additions: ExtractedItem[]): ExtractedItem[] {
  const out = [...base];
  const seen = new Set<string>();
  for (const item of base) seen.add(itemKey(item));

  for (const item of additions) {
    const key = itemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function dedupeParsedItems(items: ExtractedItem[]): ExtractedItem[] {
  const out: ExtractedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = itemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function itemKey(item: ExtractedItem): string {
  const name = normalizeName((item as any).name || '');
  const date = String((item as any).date || '').trim();
  const start = String((item as any).startTime || '').trim();
  if (!name || !date) return '';
  return `${name}|${date}|${start}`;
}

function normalizeName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirst(text: string, regex: RegExp): string {
  const m = text.match(regex);
  return m && m[1] ? m[1] : '';
}

function cleanText(value: string): string {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
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
