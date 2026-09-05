import type { EventActionLink } from '../types/index.js';

const NON_TICKET_OPERATIONAL_PATH_PATTERN =
  /\/(?:mall-|store-|business-|holiday-|opening-)?hours(?:\/|$)|\/(?:visit\/)?mall-hours(?:\/|$)/i;

const TICKET_HOST_PATTERN =
  /(^|\.)(?:ticketpro\.(?:ca|com)|eventbrite\.(?:ca|com)|ticketmaster\.(?:ca|com)|showpass\.com|universe\.com|veezi\.com|locarius\.io)$|^(?:tickets?|purchase|boxoffice)\./i;

const TICKET_PATH_PATTERN =
  /\/(?:checkout|purchase|order|orders|cart|box-?office|tickets?)(?:\/|$|\?)/i;

const REGISTRATION_PATH_PATTERN =
  /\/(?:register|registration|signup|sign-up)(?:\/|$|\?)/i;

const TICKET_SUMMARY_PATTERN =
  /\b(?:buy|get|purchase|order|book)\s+(?:your\s+)?tickets?\b|\bbox\s+office\b|\bticket\s*(?:provider|price|sales?)\b|(?:^|\s)\$\s*\d/i;

const REGISTRATION_SUMMARY_PATTERN =
  /\b(?:register|registration|sign\s+up|reserve\s+(?:a\s+)?spot)\b/i;

function normalizeHttpUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isClearlyNonTicketOperationalUrl(value: unknown): boolean {
  const normalized = normalizeHttpUrl(value);
  if (!normalized) return false;

  try {
    return NON_TICKET_OPERATIONAL_PATH_PATTERN.test(new URL(normalized).pathname);
  } catch {
    return false;
  }
}

export function classifyStructuredFacebookActionLink(
  value: unknown,
  ticketSummary: unknown
): EventActionLink | undefined {
  const url = normalizeHttpUrl(value);
  if (!url) return undefined;

  const summary = String(ticketSummary || '').trim();
  const parsed = new URL(url);

  if (isClearlyNonTicketOperationalUrl(url)) {
    return {
      url,
      role: 'event_info',
      label: 'Event Info',
      confidence: 0.99,
      source: 'facebook_events',
      evidence: 'operating-hours information URL',
    };
  }

  if (REGISTRATION_PATH_PATTERN.test(parsed.pathname) || REGISTRATION_SUMMARY_PATTERN.test(summary)) {
    return {
      url,
      role: 'registration',
      label: 'Register',
      confidence: 0.9,
      source: 'facebook_events',
      evidence: 'registration URL or ticket summary',
    };
  }

  if (
    TICKET_HOST_PATTERN.test(parsed.hostname.toLowerCase()) ||
    TICKET_PATH_PATTERN.test(parsed.pathname) ||
    TICKET_SUMMARY_PATTERN.test(summary)
  ) {
    return {
      url,
      role: 'ticket_purchase',
      label: 'Buy Tickets',
      confidence: 0.9,
      source: 'facebook_events',
      evidence: 'ticket provider, transactional path, or explicit ticket summary',
    };
  }

  return {
    url,
    role: 'event_info',
    label: 'Event Info',
    confidence: 0.75,
    source: 'facebook_events',
    evidence: 'link lacks ticket-purchase evidence',
  };
}

