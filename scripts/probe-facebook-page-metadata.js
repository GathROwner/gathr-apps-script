#!/usr/bin/env node
/**
 * Probe what metadata is publicly accessible from a Facebook page URL without login.
 *
 * Uses curl.exe (more reliable than Node fetch in this environment for Facebook responses),
 * then extracts basic HTTP response info and HTML metadata (og:title, canonical, etc).
 *
 * Usage:
 *   node scripts/probe-facebook-page-metadata.js "https://www.facebook.com/TheOldTriangleSydney"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const targetUrl = String(process.argv[2] || '').trim();
if (!targetUrl) {
  console.error('Usage: node scripts/probe-facebook-page-metadata.js <facebook-page-url>');
  process.exit(1);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function runCurl(args) {
  const result = spawnSync('curl.exe', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return result;
}

function parseMetaTag(html, attrName, attrValue, contentAttr = 'content') {
  const re = new RegExp(
    `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+${contentAttr}=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  if (m && m[1]) return m[1];
  // Some tags put content before property/name
  const reReversed = new RegExp(
    `<meta[^>]+${contentAttr}=["']([^"']+)["'][^>]+${attrName}=["']${attrValue}["']`,
    'i'
  );
  const m2 = html.match(reReversed);
  return m2 && m2[1] ? m2[1] : null;
}

function parseLinkRel(html, rel) {
  const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  if (m && m[1]) return m[1];
  const reReversed = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["']`, 'i');
  const m2 = html.match(reReversed);
  return m2 && m2[1] ? m2[1] : null;
}

function parseTitle(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m && m[1] ? m[1].trim() : null;
}

function summarizeHeaders(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  // curl -I -L emits multiple response blocks; capture last one
  let blocks = [];
  let current = [];
  for (const line of lines) {
    if (/^HTTP\//i.test(line) && current.length) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  const last = blocks.filter((b) => b.some((line) => /^HTTP\//i.test(line))).slice(-1)[0] || lines;
  const headerMap = {};
  for (const line of last) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headerMap[key] = value;
  }
  return headerMap;
}

const tmpBase = path.join(os.tmpdir(), `fb-meta-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const headersFile = `${tmpBase}.headers.txt`;
const bodyFile = `${tmpBase}.body.html`;

// GET body + final-url metadata
const getRes = runCurl([
  '-sS',
  '-L',
  '--compressed',
  '-A',
  UA,
  '-D',
  headersFile,
  '-o',
  bodyFile,
  '-w',
  '__CURLMETA__%{http_code}|%{url_effective}|%{content_type}',
  targetUrl,
]);

if (getRes.error) {
  console.error(`curl failed: ${getRes.error.message}`);
  process.exit(1);
}
if (getRes.status !== 0) {
  console.error(`curl exited with code ${getRes.status}`);
  console.error(getRes.stderr || getRes.stdout || '');
  process.exit(getRes.status || 1);
}

const curlMetaMatch = String(getRes.stdout || '').match(/__CURLMETA__(\d+)\|([^|]*)\|(.*)$/);
const httpStatus = curlMetaMatch ? Number(curlMetaMatch[1]) : null;
const effectiveUrl = curlMetaMatch ? curlMetaMatch[2] : null;
const contentType = curlMetaMatch ? curlMetaMatch[3] : null;

const headersRaw = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : '';
const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : '';
const headerMap = summarizeHeaders(headersRaw);

const title = parseTitle(body);
const canonical = parseLinkRel(body, 'canonical');
const ogTitle = parseMetaTag(body, 'property', 'og:title');
const ogUrl = parseMetaTag(body, 'property', 'og:url');
const ogDescription = parseMetaTag(body, 'property', 'og:description');
const robots = parseMetaTag(body, 'name', 'robots');
const description = parseMetaTag(body, 'name', 'description');

const normalizedBody = body.toLowerCase();
const looksLikeFacebookGenericError =
  normalizedBody.includes('sorry, something went wrong') &&
  normalizedBody.includes('<title>error</title>');

const result = {
  requestedUrl: targetUrl,
  http: {
    status: httpStatus,
    effectiveUrl,
    contentType,
    headers: {
      server: headerMap.server || null,
      date: headerMap.date || null,
      location: headerMap.location || null,
      'x-fb-debug': headerMap['x-fb-debug'] || null,
      'cache-control': headerMap['cache-control'] || null,
      'content-type': headerMap['content-type'] || null,
    },
  },
  html: {
    length: body.length,
    title,
    canonical,
    ogTitle,
    ogUrl,
    ogDescription,
    description,
    robots,
    looksLikeFacebookGenericError,
  },
  notes: [
    looksLikeFacebookGenericError
      ? 'Facebook returned a generic error page, so page metadata is not available from this fetch.'
      : 'Page metadata may be usable from this fetch (verify values before relying on them).',
  ],
};

console.log(JSON.stringify(result, null, 2));

for (const file of [headersFile, bodyFile]) {
  try { fs.unlinkSync(file); } catch (_) {}
}

