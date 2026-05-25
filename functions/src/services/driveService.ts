/**
 * Google Drive Service
 * Handles file access and XLSX parsing for Apify datasets
 */

import { google, drive_v3 } from 'googleapis';
import * as XLSX from 'xlsx';
import { RawRowData } from '../types/index.js';
import { logger } from '../utils/logger.js';

let driveClient: drive_v3.Drive | null = null;

/**
 * Initialize the Drive client with service account credentials
 */
async function getClient(): Promise<drive_v3.Drive> {
  if (!driveClient) {
    const auth = new google.auth.GoogleAuth({
      // Read + write so unknown-venue finalization can append Facebook URLs to the scraper list.
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    driveClient = google.drive({ version: 'v3', auth });
  }
  return driveClient;
}

/**
 * List files matching a query in Drive
 */
export async function listFiles(
  query: string,
  options?: {
    pageSize?: number;
    orderBy?: string;
    fields?: string;
  }
): Promise<drive_v3.Schema$File[]> {
  const drive = await getClient();

  try {
    const response = await drive.files.list({
      q: query,
      pageSize: options?.pageSize || 100,
      orderBy: options?.orderBy || 'modifiedTime desc',
      fields: options?.fields || 'files(id, name, mimeType, createdTime, modifiedTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return response.data.files || [];
  } catch (error) {
    logger.error('Drive listFiles failed', error, { query });
    throw error;
  }
}

/**
 * Find new Apify dataset files that haven't been processed
 */
export async function findNewApifyDatasetFiles(
  processedIds: Set<string>
): Promise<drive_v3.Schema$File[]> {
  // Search for XLSX files with "APIFY Dataset" in the name
  const query = `name contains 'APIFY Dataset' and (mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.google-apps.spreadsheet') and trashed = false`;

  const files = await listFiles(query);

  // Filter out already processed files
  return files.filter(file => file.id && !processedIds.has(file.id));
}

/**
 * Download a file from Drive
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getClient();

  try {
    // First check file metadata to determine if it's a Google Sheet
    const metadata = await drive.files.get({
      fileId,
      fields: 'mimeType',
    });

    let response;

    if (metadata.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Export Google Sheet as XLSX
      response = await drive.files.export({
        fileId,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }, {
        responseType: 'arraybuffer',
      });
    } else {
      // Download regular file
      response = await drive.files.get({
        fileId,
        alt: 'media',
      }, {
        responseType: 'arraybuffer',
      });
    }

    return Buffer.from(response.data as ArrayBuffer);
  } catch (error) {
    logger.error('Drive downloadFile failed', error, { fileId });
    throw error;
  }
}

function normalizeDriveListUrl(value: string): string {
  let s = String(value || '').trim();
  if (!s) return '';
  s = s.replace(/[?#].*$/, '');
  s = s.replace(/\/mentions\/?$/i, '');
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^www\./i, '');
  s = s.replace(/\/+$/, '');
  return s.toLowerCase();
}

export async function appendTextLinesIfMissing(
  fileId: string,
  linesToAppend: string[]
): Promise<{
  appendedCount: number;
  skippedExistingCount: number;
  fileName?: string;
}> {
  const normalizedFileId = String(fileId || '').trim();
  if (!normalizedFileId) {
    throw new Error('fileId is required');
  }

  const candidates = (linesToAppend || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  if (candidates.length === 0) {
    return { appendedCount: 0, skippedExistingCount: 0 };
  }

  const drive = await getClient();
  const metadata = await drive.files.get({
    fileId: normalizedFileId,
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  });

  const fileName = metadata.data.name || undefined;
  const mimeType = metadata.data.mimeType || '';
  if (mimeType && mimeType !== 'text/plain') {
    logger.warn('appendTextLinesIfMissing operating on non-text file', {
      fileId: normalizedFileId,
      fileName,
      mimeType,
    });
  }

  const currentRes = await drive.files.get(
    {
      fileId: normalizedFileId,
      alt: 'media',
      supportsAllDrives: true,
    },
    {
      responseType: 'arraybuffer',
    }
  );

  const currentText = Buffer.from(currentRes.data as ArrayBuffer).toString('utf8');
  const existingLines = currentText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const existingNorm = new Set(existingLines.map(normalizeDriveListUrl));

  const toAppend: string[] = [];
  let skippedExistingCount = 0;
  for (const raw of candidates) {
    let value = raw.replace(/\/mentions\/?$/i, '');
    if (!/^https?:\/\//i.test(value)) {
      value = `https://${value.replace(/^\/+/, '')}`;
    }
    const normalized = normalizeDriveListUrl(value);
    if (!normalized) continue;
    if (existingNorm.has(normalized)) {
      skippedExistingCount += 1;
      continue;
    }
    existingNorm.add(normalized);
    toAppend.push(value);
  }

  if (toAppend.length === 0) {
    return { appendedCount: 0, skippedExistingCount, fileName };
  }

  let nextContent = currentText;
  if (nextContent.length > 0 && !nextContent.endsWith('\n')) {
    nextContent += '\n';
  }
  nextContent += `${toAppend.join('\n')}\n`;

  await drive.files.update({
    fileId: normalizedFileId,
    media: {
      mimeType: 'text/plain',
      body: nextContent,
    } as any,
    supportsAllDrives: true,
  });

  logger.info('Appended lines to Drive text file', {
    fileId: normalizedFileId,
    fileName,
    appendedCount: toAppend.length,
    skippedExistingCount,
  });

  return {
    appendedCount: toAppend.length,
    skippedExistingCount,
    fileName,
  };
}

/**
 * Column mapping for Apify dataset files
 */
interface ColumnIndexMap {
  text: number;
  sharedPostText: number;
  mediaUrls: number;
  userName: number;
  pageName: number;
  timestamp: number;
  facebookUrl: number;
  topLevelUrl: number;
  profilePicUrl: number;
  utcStartDate: number;
  uniqueId: number;
  [key: string]: number;
}

type HeaderIndexMap = Record<string, number>;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildHeaderIndexMap(headers: string[]): HeaderIndexMap {
  const map: HeaderIndexMap = {};
  headers.forEach((header, index) => {
    if (!header) return;
    map[normalizeHeader(String(header))] = index;
  });
  return map;
}

/**
 * Build column index map from header row
 */
function buildColumnIndexMap(headers: string[]): ColumnIndexMap {
  const map: ColumnIndexMap = {
    text: -1,
    sharedPostText: -1,
    mediaUrls: -1,
    userName: -1,
    pageName: -1,
    timestamp: -1,
    facebookUrl: -1,
    topLevelUrl: -1,
    profilePicUrl: -1,
    utcStartDate: -1,
    uniqueId: -1,
  };

  // Map column names (case-insensitive)
  const columnMappings: Record<string, keyof ColumnIndexMap> = {
    'text': 'text',
    'post text': 'text',
    'sharedposttext': 'sharedPostText',
    'shared post text': 'sharedPostText',
    'mediaurls': 'mediaUrls',
    'media urls': 'mediaUrls',
    'media': 'mediaUrls',
    'username': 'userName',
    'user name': 'userName',
    'pagename': 'pageName',
    'page name': 'pageName',
    'timestamp': 'timestamp',
    'time': 'timestamp',
    'date': 'timestamp',
    'facebookurl': 'facebookUrl',
    'facebook url': 'facebookUrl',
    'url': 'facebookUrl',
    'toplevelurl': 'topLevelUrl',
    'top level url': 'topLevelUrl',
    'toplevelposturl': 'topLevelUrl',
    'top level post url': 'topLevelUrl',
    'profilepicurl': 'profilePicUrl',
    'profile pic': 'profilePicUrl',
    'utcstartdate': 'utcStartDate',
    'utc start date': 'utcStartDate',
    'start date': 'utcStartDate',
    'uniqueid': 'uniqueId',
    'unique id': 'uniqueId',
    'id': 'uniqueId',
  };

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [key, field] of Object.entries(columnMappings)) {
      if (normalizedHeader === key.replace(/[^a-z0-9]/g, '')) {
        if (map[field] === -1) {
          map[field] = index;
        }
        break;
      }
    }
  });

  return map;
}

/**
 * Parse a cell value that might contain a JSON array (like mediaUrls)
 */
function parseArrayCell(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(v => String(v));
  }

  const strValue = String(value);

  // Try parsing as JSON
  if (strValue.startsWith('[')) {
    try {
      const parsed = JSON.parse(strValue);
      if (Array.isArray(parsed)) {
        return parsed.map(v => String(v));
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Handle comma-separated values
  if (strValue.includes(',')) {
    return strValue.split(',').map(s => s.trim()).filter(s => s);
  }

  // Single value
  return strValue ? [strValue] : [];
}

function parseMetricNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = raw.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseMetricString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  return raw ? raw : undefined;
}

function getColumnValue(
  row: unknown[],
  headerMap: HeaderIndexMap,
  possibleHeaders: string[]
): unknown {
  for (const header of possibleHeaders) {
    const index = headerMap[normalizeHeader(header)];
    if (index !== undefined && index >= 0 && index < row.length) {
      return row[index];
    }
  }
  return null;
}

function getFirstNonEmptyColumnValue(
  row: unknown[],
  headerMap: HeaderIndexMap,
  possibleHeaders: string[]
): unknown {
  for (const header of possibleHeaders) {
    const index = headerMap[normalizeHeader(header)];
    if (index === undefined || index < 0 || index >= row.length) {
      continue;
    }

    const value = row[index];
    if (value === null || value === undefined) {
      continue;
    }

    if (String(value).trim()) {
      return value;
    }
  }

  return null;
}

function hasHeader(headerMap: HeaderIndexMap, header: string): boolean {
  return headerMap[normalizeHeader(header)] !== undefined;
}

function isFacebookEventsDataset(headerMap: HeaderIndexMap): boolean {
  return (
    hasHeader(headerMap, 'eventFrequency') &&
    hasHeader(headerMap, 'utcStartDate') &&
    hasHeader(headerMap, 'dateTimeSentence') &&
    hasHeader(headerMap, 'usersResponded')
  );
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function getFacebookEventsDatasetRowLimit(): number | undefined {
  return parseOptionalPositiveInteger(process.env.FACEBOOK_EVENTS_DATASET_ROW_LIMIT);
}

function getFacebookEventsPastGraceMs(): number {
  const parsedHours = parseOptionalPositiveInteger(process.env.FACEBOOK_EVENTS_PAST_GRACE_HOURS);
  const hours = parsedHours ?? 12;
  return hours * 60 * 60 * 1000;
}

function parseSortableDateMillis(value: unknown): number {
  const raw = String(value || '').trim();
  if (!raw) return Number.POSITIVE_INFINITY;

  const parsed = new Date(raw);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function filterUpcomingFacebookEventRows(rows: RawRowData[]): RawRowData[] {
  const cutoffMs = Date.now() - getFacebookEventsPastGraceMs();
  const filtered = rows.filter(row => {
    const eventTimeMs = parseSortableDateMillis(row.utcStartDate || row.timestamp);
    return eventTimeMs === Number.POSITIVE_INFINITY || eventTimeMs >= cutoffMs;
  });

  if (filtered.length !== rows.length) {
    logger.info('Filtered past Facebook event rows', {
      originalRows: rows.length,
      filteredRows: filtered.length,
    });
  }

  return filtered;
}

function isLikelyAddress(str: string): boolean {
  if (!str) return false;
  const streetAddressPattern =
    /(#?\d+[-\s]?[A-Z]?|[A-Z]?\d+[-\s]?#?)\s+(HWY|Highway|Hwy|St|Ave|Rd|Blvd|Dr|Ln|Ct|Pl|Terrace|Drive|Street|Avenue|Road|Lane|Court|Place)\s*\.?\s*\d*/i;
  const cityProvincePattern = /([A-Z][a-z]+(\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})/;
  const postalCodePattern = /[A-Z]\d[A-Z]\s*\d[A-Z]\d|^\d{5}(-\d{4})?$/;
  const multipleCommasPattern = /^[^,]+,.*,/;
  const locationKeywords = [
    'yoga',
    'crossfit',
    'rodd',
    'park',
    'space',
    'centre',
    'center',
    'hall',
    'arena',
    'stadium',
    'theatre',
    'theater',
    'cafe',
    'restaurant',
    'bar',
    'pub',
  ];

  return (
    (streetAddressPattern.test(str) ||
      cityProvincePattern.test(str) ||
      postalCodePattern.test(str) ||
      multipleCommasPattern.test(str)) &&
    !locationKeywords.some(keyword => str.toLowerCase().includes(keyword))
  );
}

function isLikelyCityLevelLocation(str: string): boolean {
  const raw = String(str || '').replace(/\s+/g, ' ').trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  if (/\d/.test(lower)) return false;
  if (/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct|way|highway|hwy|route|rte|place|pl|terrace|ter)\b/i.test(lower)) {
    return false;
  }
  if (/\b(park|centre|center|hall|arena|stadium|theatre|theater|cafe|restaurant|bar|pub|club|church|school|hotel|inn|brewery|market)\b/i.test(lower)) {
    return false;
  }

  const normalized = lower
    .replace(/\bcanada\b/g, '')
    .replace(/\bprince edward island\b/g, 'pei')
    .replace(/\bp\.?e\.?i\.?\b/g, 'pei')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/,+$/g, '')
    .trim();

  if (/^(pei|pe)$/.test(normalized)) return true;
  return /^[a-z .'-]+,(pe|pei)$/.test(normalized) ||
    /^[a-z .'-]+ (pe|pei)$/.test(normalized);
}

function isLikelyAreaLevelLocation(str: string): boolean {
  const normalized = String(str || '')
    .toLowerCase()
    .replace(/\bcanada\b/g, '')
    .replace(/\bprince edward island\b/g, 'pei')
    .replace(/\bp\.?e\.?i\.?\b/g, 'pei')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/[.,]+$/g, '')
    .trim();

  if (/\b(inc|incorporated|ltd|limited|corp|corporation)\b/i.test(normalized)) {
    return false;
  }

  return normalized === 'downtown charlottetown' ||
    normalized === 'downtown charlottetown,pei' ||
    normalized === 'downtown charlottetown pei';
}

function normalizeCityLevelLocationName(str: string): string {
  const raw = String(str || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/\bcanada\b/gi, '')
    .replace(/\bprince edward island\b/gi, 'PEI')
    .replace(/\bp\.?e\.?i\.?\b/gi, 'PEI')
    .replace(/\bpe\b/g, 'PE')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/[, ]+$/g, '')
    .trim();

  const noCommaMatch = normalized.match(/^(.+?)\s+(PEI|PE)$/i);
  if (noCommaMatch && !normalized.includes(',')) {
    return `${noCommaMatch[1].trim()}, ${noCommaMatch[2].toUpperCase()}`;
  }

  return normalized;
}

function cleanVenueHint(value: string): string {
  return String(value || '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s+\bin\s+(charlottetown|summerside|stratford|cornwall|montague|kensington|hunter river)(?:\s*,?\s*(?:pe|pei|canada))?$/i, '')
    .replace(/^[\s\-|:]+/g, '')
    .replace(/[\s\-|:,.!]+$/g, '')
    .trim();
}

function isLikelyCitySegment(value: string): boolean {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\bcanada\b/g, '')
    .replace(/\bprince edward island\b/g, 'pei')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/[, ]+$/g, '')
    .trim();

  return /^(charlottetown|summerside|stratford|cornwall|montague|kensington|hunter river|pei|pe)$/.test(normalized) ||
    /^[a-z .'-]+,(pe|pei)$/.test(normalized) ||
    /^[a-z .'-]+ (pe|pei)$/.test(normalized);
}

function hasVenueHintKeyword(value: string): boolean {
  return /\b(company|brewing|brewery|taproom|centre|center|hall|arena|stadium|theatre|theater|cafe|restaurant|bar|pub|club|church|school|college|university|hotel|inn|market|gallery|museum|library|studio|plaza|room|house|legion|park)\b/i.test(value);
}

function normalizeVenueHintForComparison(value: string): string {
  return cleanVenueHint(value).toLowerCase();
}

function applyOrganizerCasingToExplicitVenueHint(candidate: string, organizerName: string): string {
  const cleanCandidate = cleanVenueHint(candidate);
  const cleanOrganizer = cleanVenueHint(organizerName);
  if (
    cleanCandidate &&
    cleanOrganizer &&
    normalizeVenueHintForComparison(cleanCandidate) === normalizeVenueHintForComparison(cleanOrganizer)
  ) {
    return cleanOrganizer;
  }

  return cleanCandidate;
}

function isPlausibleVenueHint(
  candidate: string,
  organizerName: string,
  options: { allowOrganizerMatch?: boolean } = {}
): boolean {
  const clean = cleanVenueHint(candidate);
  if (clean.length < 3 || clean.length > 90) return false;
  if (isLikelyCitySegment(clean) || isLikelyCityLevelLocation(clean)) return false;

  const normalizedCandidate = normalizeVenueHintForComparison(clean);
  const normalizedOrganizer = normalizeVenueHintForComparison(organizerName);
  if (!options.allowOrganizerMatch) {
    if (normalizedOrganizer && normalizedCandidate === normalizedOrganizer) return false;
    if (normalizedOrganizer && normalizedCandidate.includes(normalizedOrganizer)) return false;
  }
  if (/\b(event|events|class|classes|tour|tickets?|sponsored|presented|happening)\b/i.test(clean)) return false;

  const hasKeyword = hasVenueHintKeyword(clean);
  if (isLikelyAddress(clean) && !hasKeyword) return false;

  return hasKeyword;
}

function extractVenueHintFromFacebookEventTitle(title: string, organizerName: string): string {
  const segments = String(title || '')
    .split(/\s+(?:-|\u2012|\u2013|\u2014|\|)\s+/g)
    .map(cleanVenueHint)
    .filter(Boolean);

  if (segments.length < 3) return '';

  for (const segment of segments.slice(1).reverse()) {
    if (isPlausibleVenueHint(segment, organizerName)) {
      return segment;
    }
  }

  return '';
}

function extractVenueHintFromFacebookEventDescription(description: string, organizerName: string): string {
  const raw = String(description || '');
  if (!raw) return '';

  const venueKeyword =
    'company|brewing|brewery|taproom|centre|center|hall|arena|stadium|theatre|theater|cafe|restaurant|bar|pub|club|church|school|college|university|hotel|inn|market|gallery|museum|library|studio|plaza|room|house|legion|park';
  const pattern = new RegExp(
    `\\b(?:at|@)\\s+(?:the\\s+)?([A-Z][A-Za-z0-9&'\\u2019(). /-]{2,80}?\\b(?:${venueKeyword})\\b[A-Za-z0-9&'\\u2019(). /-]{0,40})(?=\\s+in\\s+|\\s+on\\s+|[,.;!?\\n]|$)`,
    'gi'
  );

  const matches = Array.from(raw.matchAll(pattern))
    .map((match) => cleanVenueHint(match[1] || ''))
    .filter((candidate) => isPlausibleVenueHint(candidate, organizerName));

  return matches[matches.length - 1] || '';
}

function extractExplicitVenueHintFromFacebookEventDescription(description: string, organizerName: string): string {
  const raw = String(description || '');
  if (!raw) return '';

  const lineCandidates: string[] = [];
  const addLineMatches = (pattern: RegExp) => {
    for (const match of raw.matchAll(pattern)) {
      const candidate = cleanVenueHint(match[1] || '');
      if (candidate) {
        lineCandidates.push(candidate);
      }
    }
  };

  addLineMatches(/(?:^|\n)\s*\u{1F4CD}\s*([^\n]{2,120})/giu);
  addLineMatches(/(?:^|\n)\s*(?:location|venue|where)\s*[:\-]\s*([^\n]{2,120})/giu);

  const plausibleLineCandidates = lineCandidates
    .map(cleanVenueHint)
    .filter((candidate) => isPlausibleVenueHint(candidate, organizerName, { allowOrganizerMatch: true }));
  if (plausibleLineCandidates.length > 0) {
    return applyOrganizerCasingToExplicitVenueHint(
      plausibleLineCandidates[plausibleLineCandidates.length - 1],
      organizerName
    );
  }

  const atHint = extractVenueHintFromFacebookEventDescription(raw, '');
  return isPlausibleVenueHint(atHint, organizerName, { allowOrganizerMatch: true })
    ? applyOrganizerCasingToExplicitVenueHint(atHint, organizerName)
    : '';
}

function inferFacebookEventVenueHint(title: string, description: string, organizerName: string): string {
  return extractVenueHintFromFacebookEventTitle(title, organizerName) ||
    extractVenueHintFromFacebookEventDescription(description, organizerName);
}

function collectMediaUrls(row: unknown[], headerMap: HeaderIndexMap): string[] {
  const urls: string[] = [];
  const add = (value: unknown) => {
    if (!value) return;
    const str = String(value).trim();
    if (!str) return;
    urls.push(str);
  };

  const mediaCell = getColumnValue(row, headerMap, ['mediaUrls', 'media urls', 'media']);
  if (mediaCell) {
    urls.push(...parseArrayCell(mediaCell));
  }

  add(getColumnValue(row, headerMap, ['imageUrl', 'image url']));

  for (let i = 0; i < 10; i++) {
    add(getColumnValue(row, headerMap, [`media/${i}/photo_image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/flexible_height_image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/flexible_height_share_image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/large_share_image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/placeholder_image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/preferred_thumbnail/image/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/thumbnailImage/uri`]));
    add(getColumnValue(row, headerMap, [`media/${i}/thumbnail`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/photo_image/uri`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/flexible_height_image/uri`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/flexible_height_share_image/uri`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/image/uri`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/preferred_thumbnail/image/uri`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/thumbnailImage/uri`]));
    add(getColumnValue(row, headerMap, [`sharedpost/media/${i}/thumbnail`]));
  }

  return Array.from(new Set(urls));
}

function collectOcrText(row: unknown[], headerMap: HeaderIndexMap): string {
  const texts: string[] = [];
  const add = (value: unknown) => {
    if (!value) return;
    const str = String(value).trim();
    if (!str) return;
    texts.push(str);
  };

  for (let i = 0; i < 10; i++) {
    add(getColumnValue(row, headerMap, [`media/${i}/ocrText`]));
    add(getColumnValue(row, headerMap, [`sharedPost/media/${i}/ocrText`]));
    add(getColumnValue(row, headerMap, [`sharedpost/media/${i}/ocrText`]));
  }

  return texts.join('\n').trim();
}

function collectExternalLinks(row: unknown[], headerMap: HeaderIndexMap): string[] {
  const links: string[] = [];
  const add = (value: unknown) => {
    if (!value) return;
    const str = String(value).trim();
    if (str) links.push(str);
  };

  add(getFirstNonEmptyColumnValue(row, headerMap, ['externalLinks']));
  for (let i = 0; i < 10; i++) {
    add(getColumnValue(row, headerMap, [`externalLinks/${i}`]));
  }

  return Array.from(new Set(links));
}

function joinNonEmpty(parts: unknown[], separator = ' '): string {
  return parts
    .map(part => String(part || '').trim())
    .filter(Boolean)
    .join(separator)
    .trim();
}

function buildFacebookEventText(
  row: unknown[],
  headerMap: HeaderIndexMap,
  description: string
): string {
  const lines: string[] = [];
  const addLine = (label: string, value: unknown) => {
    const str = String(value || '').trim();
    if (str) {
      lines.push(`${label}: ${str}`);
    }
  };

  addLine('When', getFirstNonEmptyColumnValue(row, headerMap, ['dateTimeSentence', 'startTime']));
  addLine('UTC start', getFirstNonEmptyColumnValue(row, headerMap, ['utcStartDate']));
  addLine('Duration', getFirstNonEmptyColumnValue(row, headerMap, ['duration']));
  addLine('Location', getFirstNonEmptyColumnValue(row, headerMap, ['location/name', 'location/contextualName']));
  addLine(
    'Address',
    getFirstNonEmptyColumnValue(row, headerMap, [
      'address',
      'location/streetAddress',
      'location/city',
    ])
  );
  addLine('Organizer', getFirstNonEmptyColumnValue(row, headerMap, ['organizators/0/name', 'organizedBy']));

  const ticketSummary = joinNonEmpty([
    getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/title']),
    getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/price']),
    getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/subtitle']),
    getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/ticketProvider']),
  ], ' | ');
  addLine('Tickets', ticketSummary);
  addLine('Ticket link', getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/buyUrl']));

  const responseSummary = joinNonEmpty([
    getFirstNonEmptyColumnValue(row, headerMap, ['usersGoing']) ? `${getFirstNonEmptyColumnValue(row, headerMap, ['usersGoing'])} going` : '',
    getFirstNonEmptyColumnValue(row, headerMap, ['usersInterested']) ? `${getFirstNonEmptyColumnValue(row, headerMap, ['usersInterested'])} interested` : '',
    getFirstNonEmptyColumnValue(row, headerMap, ['usersResponded']) ? `${getFirstNonEmptyColumnValue(row, headerMap, ['usersResponded'])} responded` : '',
  ], ', ');
  addLine('Facebook responses', responseSummary);

  const externalLinks = collectExternalLinks(row, headerMap);
  if (externalLinks.length > 0) {
    addLine('External links', externalLinks.join(' '));
  }

  const cleanDescription = description.trim();
  if (cleanDescription) {
    lines.push(`Description:\n${cleanDescription}`);
  }

  return lines.join('\n').trim();
}

/**
 * Extract row data from a worksheet row
 */
function extractRowData(
  row: unknown[],
  columnMap: ColumnIndexMap,
  headerMap: HeaderIndexMap,
  rowIndex: number
): RawRowData | null {
  const isFacebookEvent = isFacebookEventsDataset(headerMap);
  const description = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['Text', 'text', 'description']) || ''
  );
  const text = isFacebookEvent
    ? buildFacebookEventText(row, headerMap, description)
    : description;
  const sharedPostText = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['Sharedpost Text', 'sharedPost/text', 'name']) || ''
  );
  const mediaUrls = collectMediaUrls(row, headerMap);
  const ocrText = isFacebookEvent ? '' : collectOcrText(row, headerMap);
  const externalLinks = isFacebookEvent ? collectExternalLinks(row, headerMap) : [];
  const ticketsBuyUrl = String(getFirstNonEmptyColumnValue(row, headerMap, ['ticketsInfo/buyUrl']) || '').trim();

  // Skip rows that are entirely empty
  const hasAnyValue = row.some(value => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '';
  });
  if (!hasAnyValue) {
    return null;
  }

  const locationName = String(getFirstNonEmptyColumnValue(row, headerMap, ['location/name']) || '');
  const contextualLocationName = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['location/contextualName']) || ''
  );
  const organizerName = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['organizators/0/name', 'organizedBy']) || ''
  );
  const fallbackUserName = String(getFirstNonEmptyColumnValue(row, headerMap, ['User Name', 'user/name']) || '');
  const locationNameIsCityLevel = isLikelyCityLevelLocation(locationName);
  const contextualLocationNameIsCityLevel = isLikelyCityLevelLocation(contextualLocationName);
  const locationNameIsAreaLevel = isLikelyAreaLevelLocation(locationName);
  const contextualLocationNameIsAreaLevel = isLikelyAreaLevelLocation(contextualLocationName);
  const locationNameIsReviewLevel = locationNameIsCityLevel || locationNameIsAreaLevel;
  const contextualLocationNameIsReviewLevel =
    contextualLocationNameIsCityLevel || contextualLocationNameIsAreaLevel;
  const specificEventLocationName =
    isFacebookEvent && locationName && !locationNameIsReviewLevel && !isLikelyAddress(locationName)
      ? locationName
      : isFacebookEvent && contextualLocationName && !contextualLocationNameIsReviewLevel && !isLikelyAddress(contextualLocationName)
        ? contextualLocationName
        : '';
  const rawEventLocationIsCityLevel =
    isFacebookEvent && !specificEventLocationName &&
      (locationNameIsReviewLevel || contextualLocationNameIsReviewLevel);
  const explicitVenueHintFromCityLevelLocation =
    rawEventLocationIsCityLevel
      ? extractExplicitVenueHintFromFacebookEventDescription(description, organizerName)
      : '';
  const eventLocationIsCityLevel = rawEventLocationIsCityLevel && !explicitVenueHintFromCityLevelLocation;
  const cityLevelLocationName = eventLocationIsCityLevel
    ? normalizeCityLevelLocationName(locationName || contextualLocationName)
    : '';
  const inferredVenueHint =
    isFacebookEvent && !specificEventLocationName
      ? explicitVenueHintFromCityLevelLocation ||
        (!rawEventLocationIsCityLevel
          ? inferFacebookEventVenueHint(sharedPostText, description, organizerName)
          : '')
      : '';
  const preferredEventLocationName =
    specificEventLocationName || inferredVenueHint || cityLevelLocationName || locationName || contextualLocationName;
  const eventVenueName = specificEventLocationName || inferredVenueHint;
  const userName = eventVenueName ||
    (eventLocationIsCityLevel
      ? preferredEventLocationName
      : isLikelyAddress(locationName)
        ? organizerName || fallbackUserName || locationName
        : locationName || organizerName || fallbackUserName);

  const pageName = String(getFirstNonEmptyColumnValue(row, headerMap, ['Pagename', 'pageName']) || '');

  const facebookUrl = String(
    getFirstNonEmptyColumnValue(
      row,
      headerMap,
      isFacebookEvent
        ? ['url', 'Facebookurl', 'facebookUrl', 'inputUrl', 'location/url', 'pageUrl', 'pageurl']
        : ['Facebookurl', 'facebookUrl', 'location/url', 'inputUrl', 'url', 'pageUrl', 'pageurl']
    ) || ''
  );
  const topLevelUrl = String(
    getFirstNonEmptyColumnValue(row, headerMap, [
      'topLevelUrl',
      'top level url',
      'topLevelPostUrl',
      'top level post url',
      'topLevelURL',
    ]) || ''
  );

  const timestamp = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['Time', 'time', 'timestamp', 'utcStartDate', 'UTC Start Date']) || ''
  );

  const profilePicUrl = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['user/profilePic', 'sharedPost/user/profilePic', 'profilePicUrl']) || ''
  );

  const utcStartDate = String(
    getFirstNonEmptyColumnValue(row, headerMap, [
      'utcStartDate',
      'UTC Start Date',
      'childEvents/0/utcStartDate',
      'startDate',
      'start date',
    ]) || ''
  );

  const uniqueId = String(
    getFirstNonEmptyColumnValue(row, headerMap, ['id', 'ID', 'postId', 'post_id', 'eventId', 'childEvents/0/id']) ||
      `row_${rowIndex}_${Date.now()}`
  );
  const locationAddress =
    isFacebookEvent && isLikelyAddress(contextualLocationName)
      ? contextualLocationName
      : isFacebookEvent && isLikelyAddress(locationName)
        ? locationName
        : '';
  const address = String(
    getFirstNonEmptyColumnValue(row, headerMap, [
      'address',
      'location/streetAddress',
      'location/city',
    ]) || locationAddress || ''
  );

  const likes = parseMetricNumber(
    getFirstNonEmptyColumnValue(row, headerMap, ['likes', 'Like Count', 'reactions/likes', 'reactionCount'])
  );
  const shares = parseMetricNumber(
    getFirstNonEmptyColumnValue(row, headerMap, ['shares', 'Share Count', 'shareCount'])
  );
  const comments = parseMetricNumber(
    getFirstNonEmptyColumnValue(row, headerMap, ['comments', 'Comment Count', 'commentCount'])
  );
  const topReactionsCount = parseMetricNumber(
    getFirstNonEmptyColumnValue(row, headerMap, ['topReactionsCount', 'Top Reactions Count'])
  );
  const usersGoing = parseMetricString(
    getFirstNonEmptyColumnValue(row, headerMap, ['usersGoing', 'Users Going', 'Going'])
  );
  const usersInterested = parseMetricString(
    getFirstNonEmptyColumnValue(row, headerMap, ['usersInterested', 'Users Interested', 'Interested'])
  );
  const facebookUsersResponded = parseMetricString(
    getFirstNonEmptyColumnValue(row, headerMap, ['usersResponded', 'Users Responded'])
  );
  const usersResponded = isFacebookEvent
    ? usersGoing || facebookUsersResponded
    : parseMetricString(
      getFirstNonEmptyColumnValue(row, headerMap, ['usersResponded', 'Users Responded', 'Interested', 'Going'])
  );

  return {
    uniqueId,
    text,
    sharedPostText,
    ocrText,
    mediaUrls,
    userName,
    pageName,
    timestamp,
    facebookUrl,
    topLevelUrl,
    address,
    profilePicUrl,
    utcStartDate,
    sourceScraperType: isFacebookEvent ? 'events' : undefined,
    facebookEventLocationName: isFacebookEvent ? preferredEventLocationName || undefined : undefined,
    facebookEventLocationIsCityLevel: isFacebookEvent ? eventLocationIsCityLevel : undefined,
    facebookEventOrganizerName: isFacebookEvent ? organizerName || undefined : undefined,
    facebookEventDescription: isFacebookEvent ? description.trim() || undefined : undefined,
    externalLinks,
    ticketsBuyUrl: ticketsBuyUrl || undefined,
    usersResponded,
    usersGoing,
    usersInterested,
    facebookUsersResponded,
    likes,
    shares,
    comments,
    topReactionsCount,
    sharedPostThumbnails: [], // Will be populated if column exists
  };
}

/**
 * Parse an XLSX file buffer and return row data
 */
export async function parseXlsxFile(
  buffer: Buffer
): Promise<{
  rows: RawRowData[];
  totalRows: number;
  columnMap: ColumnIndexMap;
}> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Prefer the "Data" sheet (Apps Script uses this), then Sheet1, then first
  const normalized = (name: string) => name.trim().toLowerCase();
  const sheetName =
    workbook.SheetNames.find(name => normalized(name) === 'data') ||
    workbook.SheetNames.find(name => normalized(name) === 'sheet1') ||
    workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('No sheets found in workbook');
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }

  // Convert to JSON (array of arrays)
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  if (data.length < 2) {
    return { rows: [], totalRows: 0, columnMap: buildColumnIndexMap([]) };
  }

  // First row is headers
  const headers = (data[0] as unknown[]).map(h => String(h || ''));
  const columnMap = buildColumnIndexMap(headers);
  const headerMap = buildHeaderIndexMap(headers);

  logger.debug('Parsed XLSX headers', {
    headers,
    columnMap: Object.fromEntries(
      Object.entries(columnMap).filter(([_, v]) => v >= 0)
    ),
  });

  // Process data rows (skip header)
  const rows: RawRowData[] = [];
  const isFacebookEvents = isFacebookEventsDataset(headerMap);
  for (let i = 1; i < data.length; i++) {
    const rowData = extractRowData(data[i] as unknown[], columnMap, headerMap, i);
    if (rowData) {
      rows.push(rowData);
    }
  }

  let effectiveRows = rows;
  if (isFacebookEvents) {
    effectiveRows = filterUpcomingFacebookEventRows(rows).sort(
      (a, b) => parseSortableDateMillis(a.utcStartDate || a.timestamp) -
        parseSortableDateMillis(b.utcStartDate || b.timestamp)
    );

    const rowLimit = getFacebookEventsDatasetRowLimit();
    if (rowLimit && effectiveRows.length > rowLimit) {
      logger.info('Applied Facebook events dataset row limit', {
        originalRows: effectiveRows.length,
        limitedRows: rowLimit,
      });
      effectiveRows = effectiveRows.slice(0, rowLimit);
    }
  }

  return {
    rows: effectiveRows,
    totalRows: effectiveRows.length,
    columnMap,
  };
}

/**
 * Download and parse an Apify dataset file
 */
export async function downloadAndParseDataset(
  fileId: string
): Promise<{
  rows: RawRowData[];
  totalRows: number;
  fileName: string;
}> {
  const drive = await getClient();

  // Get file metadata
  const metadata = await drive.files.get({
    fileId,
    fields: 'name',
  });

  const fileName = metadata.data.name || fileId;

  logger.info('Downloading dataset file', { fileId, fileName });

  // Download file
  const buffer = await downloadFile(fileId);

  // Parse XLSX
  const { rows, totalRows } = await parseXlsxFile(buffer);

  logger.info('Parsed dataset file', {
    fileId,
    fileName,
    totalRows,
    validRows: rows.length,
  });

  return { rows, totalRows, fileName };
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  fileId: string
): Promise<drive_v3.Schema$File | null> {
  const drive = await getClient();

  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, createdTime, modifiedTime, size',
    });
    return response.data;
  } catch (error) {
    logger.error('Get file metadata failed', error, { fileId });
    return null;
  }
}

/**
 * Delete a file from Drive (for cleanup)
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  const drive = await getClient();

  try {
    await drive.files.delete({ fileId });
    logger.info('Deleted file from Drive', { fileId });
    return true;
  } catch (error) {
    logger.error('Delete file failed', error, { fileId });
    return false;
  }
}
