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
        map[field] = index;
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

/**
 * Extract row data from a worksheet row
 */
function extractRowData(
  row: unknown[],
  columnMap: ColumnIndexMap,
  headerMap: HeaderIndexMap,
  rowIndex: number
): RawRowData | null {
  const text = String(
    getColumnValue(row, headerMap, ['Text', 'text', 'description']) || ''
  );
  const sharedPostText = String(
    getColumnValue(row, headerMap, ['Sharedpost Text', 'sharedPost/text', 'name']) || ''
  );
  const mediaUrls = collectMediaUrls(row, headerMap);
  const ocrText = collectOcrText(row, headerMap);

  // Skip rows that are entirely empty
  const hasAnyValue = row.some(value => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '';
  });
  if (!hasAnyValue) {
    return null;
  }

  const locationName = String(getColumnValue(row, headerMap, ['location/name']) || '');
  const organizerName = String(getColumnValue(row, headerMap, ['organizators/0/name']) || '');
  const fallbackUserName = String(getColumnValue(row, headerMap, ['User Name', 'user/name']) || '');
  const userName = isLikelyAddress(locationName)
    ? organizerName || fallbackUserName || locationName
    : locationName || organizerName || fallbackUserName;

  const pageName = String(getColumnValue(row, headerMap, ['Pagename', 'pageName']) || '');

  const facebookUrl = String(
    getColumnValue(row, headerMap, [
      'Facebookurl',
      'facebookUrl',
      'location/url',
      'inputUrl',
      'url',
      'pageUrl',
      'pageurl',
    ]) || ''
  );
  const topLevelUrl = String(
    getColumnValue(row, headerMap, [
      'topLevelUrl',
      'top level url',
      'topLevelPostUrl',
      'top level post url',
      'topLevelURL',
    ]) || ''
  );

  const timestamp = String(
    getColumnValue(row, headerMap, ['Time', 'time', 'timestamp', 'utcStartDate', 'UTC Start Date']) || ''
  );

  const profilePicUrl = String(
    getColumnValue(row, headerMap, ['user/profilePic', 'sharedPost/user/profilePic', 'profilePicUrl']) || ''
  );

  const utcStartDate = String(
    getColumnValue(row, headerMap, [
      'utcStartDate',
      'UTC Start Date',
      'childEvents/0/utcStartDate',
      'startDate',
      'start date',
    ]) || ''
  );

  const uniqueId = String(
    getColumnValue(row, headerMap, ['id', 'ID', 'postId', 'post_id', 'eventId', 'childEvents/0/id']) ||
      `row_${rowIndex}_${Date.now()}`
  );

  const likes = parseMetricNumber(
    getColumnValue(row, headerMap, ['likes', 'Like Count', 'reactions/likes', 'reactionCount'])
  );
  const shares = parseMetricNumber(
    getColumnValue(row, headerMap, ['shares', 'Share Count', 'shareCount'])
  );
  const comments = parseMetricNumber(
    getColumnValue(row, headerMap, ['comments', 'Comment Count', 'commentCount'])
  );
  const topReactionsCount = parseMetricNumber(
    getColumnValue(row, headerMap, ['topReactionsCount', 'Top Reactions Count'])
  );
  const usersResponded = parseMetricString(
    getColumnValue(row, headerMap, ['usersResponded', 'Users Responded', 'Interested', 'Going'])
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
    profilePicUrl,
    utcStartDate,
    usersResponded,
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
  for (let i = 1; i < data.length; i++) {
    const rowData = extractRowData(data[i] as unknown[], columnMap, headerMap, i);
    if (rowData) {
      rows.push(rowData);
    }
  }

  return {
    rows,
    totalRows: data.length - 1, // Exclude header
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
