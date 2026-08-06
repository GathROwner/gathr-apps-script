export type EventActionLinkRole =
  | 'ticket_purchase'
  | 'registration'
  | 'event_info'
  | 'schedule'
  | 'livestream'
  | 'wagering'
  | 'unknown';

export type EventActionLink = {
  url: string;
  role: EventActionLinkRole;
  label: string;
  confidence: number;
  source: 'venue_website' | 'calendar' | 'ticket_provider' | 'source_post' | 'manual';
  evidence?: string;
};

type Anchor = {
  url: string;
  text: string;
};

const PURCHASE_TEXT_PATTERN =
  /\b(?:buy|get|purchase|order|book)\s+(?:your\s+)?tickets?\b|\bbuy\s+online\b|\bopen\s+(?:the\s+)?booking\s+page\b|\breserve\s+(?:your\s+)?seats?\b|\bbox\s+office\b/i;
const REGISTRATION_TEXT_PATTERN =
  /\b(?:register|registration|sign\s+up|reserve\s+(?:a\s+)?spot|book\s+(?:a\s+)?spot)\b/i;
const PURCHASE_HOST_PATTERN =
  /(^|\.)(?:ticketpro\.(?:ca|com)|eventbrite\.(?:ca|com)|veezi\.com|ticketmaster\.(?:ca|com)|showpass\.com|locarius\.io)$|^(?:tickets?|purchase|boxoffice)\./i;
const PURCHASE_PATH_PATTERN =
  /\/(?:checkout|purchase|order|orders|cart|box-?office|tickets?|booking|book)(?:\/|$|\?)/i;
const SCHEDULE_PATTERN =
  /\b(?:two\s+week|current\s+month|next\s+month|racing|race|event)\s+schedule\b|\bschedule\b/i;
const SCHEDULE_PATH_PATTERN = /\/(?:racing\/)?schedule(?:\/|$|\?)/i;
const LIVESTREAM_PATTERN = /\b(?:watch|stream|livestream|live\s+stream|watch\s+online)\b/i;
const WAGERING_PATTERN = /\b(?:wager|wagering|bet|betting|sportsbook|racebook)\b/i;

export function classifyActionLinkPage(
  pageUrl: string,
  html: string,
  source: EventActionLink['source'] = 'venue_website'
): EventActionLink {
  const normalizedPageUrl = normalizeHttpUrl(pageUrl) || pageUrl;
  const title = extractTitle(html);
  const pageText = htmlToText(html);
  const anchors = extractAnchors(html, normalizedPageUrl);

  const purchaseAnchor = selectBestActionAnchor(anchors, 'ticket_purchase');
  if (purchaseAnchor) {
    return {
      url: purchaseAnchor.url,
      role: 'ticket_purchase',
      label: 'Buy Tickets',
      confidence: purchaseAnchor.confidence,
      source,
      evidence: purchaseAnchor.evidence,
    };
  }

  const registrationAnchor = selectBestActionAnchor(anchors, 'registration');
  if (registrationAnchor) {
    return {
      url: registrationAnchor.url,
      role: 'registration',
      label: 'Register',
      confidence: registrationAnchor.confidence,
      source,
      evidence: registrationAnchor.evidence,
    };
  }

  if (isKnownPurchaseUrl(normalizedPageUrl)) {
    return {
      url: normalizedPageUrl,
      role: 'ticket_purchase',
      label: 'Buy Tickets',
      confidence: 0.92,
      source,
      evidence: 'known ticket-purchase host or path',
    };
  }

  const classificationText = `${title} ${pageText.slice(0, 12000)}`;
  const scheduleSignal =
    SCHEDULE_PATH_PATTERN.test(safePathname(normalizedPageUrl)) ||
    SCHEDULE_PATTERN.test(title) ||
    anchors.filter((anchor) => SCHEDULE_PATTERN.test(anchor.text)).length >= 2;
  if (scheduleSignal && !PURCHASE_TEXT_PATTERN.test(classificationText)) {
    return {
      url: normalizedPageUrl,
      role: 'schedule',
      label: 'View Schedule',
      confidence: 0.98,
      source,
      evidence: `schedule page${title ? `: ${title}` : ''}; no purchase action`,
    };
  }

  if (WAGERING_PATTERN.test(classificationText) && !PURCHASE_TEXT_PATTERN.test(classificationText)) {
    return {
      url: normalizedPageUrl,
      role: 'wagering',
      label: 'Wager Online',
      confidence: 0.9,
      source,
      evidence: 'wagering page without ticket-purchase action',
    };
  }

  if (LIVESTREAM_PATTERN.test(classificationText) && !PURCHASE_TEXT_PATTERN.test(classificationText)) {
    return {
      url: normalizedPageUrl,
      role: 'livestream',
      label: 'Watch Online',
      confidence: 0.85,
      source,
      evidence: 'streaming page without ticket-purchase action',
    };
  }

  return {
    url: normalizedPageUrl,
    role: 'event_info',
    label: 'Event Info',
    confidence: 0.7,
    source,
    evidence: title ? `informational page: ${title}` : 'informational page without purchase action',
  };
}

function selectBestActionAnchor(
  anchors: Anchor[],
  role: 'ticket_purchase' | 'registration'
): { url: string; confidence: number; evidence: string } | null {
  let best: { url: string; score: number; evidence: string } | null = null;

  for (const anchor of anchors) {
    if (!anchor.url || anchor.url === '#') continue;
    let score = 0;
    const evidence: string[] = [];

    if (role === 'ticket_purchase' && PURCHASE_TEXT_PATTERN.test(anchor.text)) {
      score += 5;
      evidence.push(`purchase action text: ${anchor.text}`);
    }
    if (role === 'registration' && REGISTRATION_TEXT_PATTERN.test(anchor.text)) {
      score += 5;
      evidence.push(`registration action text: ${anchor.text}`);
    }
    if (isKnownPurchaseUrl(anchor.url)) {
      score += role === 'ticket_purchase' ? 5 : 1;
      evidence.push('transactional destination');
    }
    if (role === 'registration' && /\/(?:register|registration|signup|sign-up)(?:\/|$|\?)/i.test(safePathname(anchor.url))) {
      score += 4;
      evidence.push('registration destination');
    }

    if (score < 5 || (best && score <= best.score)) continue;
    best = { url: anchor.url, score, evidence: evidence.join('; ') };
  }

  if (!best) return null;
  return {
    url: best.url,
    confidence: Math.min(0.99, 0.65 + best.score * 0.035),
    evidence: best.evidence,
  };
}

function isKnownPurchaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return PURCHASE_HOST_PATTERN.test(parsed.hostname.toLowerCase()) || PURCHASE_PATH_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

function extractAnchors(html: string, baseUrl: string): Anchor[] {
  const anchors: Anchor[] = [];
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(String(html || '')))) {
    const rawHref = String(match[1] || '').trim();
    if (!rawHref || /^(?:javascript:|mailto:|tel:)/i.test(rawHref)) continue;
    let resolved = '';
    try {
      resolved = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }
    const parsed = new URL(resolved);
    if (parsed.hash === '#' || (parsed.hash && parsed.pathname === safePathname(baseUrl))) {
      if (rawHref === '#') continue;
    }
    anchors.push({
      url: resolved,
      text: htmlToText(match[2]),
    });
  }
  return anchors;
}

function extractTitle(html: string): string {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]) : '';
}

function htmlToText(value: string): string {
  return decodeHtml(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function normalizeHttpUrl(rawUrl: string): string | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function safePathname(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return '';
  }
}
