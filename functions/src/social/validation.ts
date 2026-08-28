import { createHash } from 'node:crypto';

export const SOCIAL_REGION = 'northamerica-northeast1';
export const SOCIAL_HANDLE_MIN_LENGTH = 3;
export const SOCIAL_HANDLE_MAX_LENGTH = 24;
export const CHECK_IN_MESSAGE_MAX_LENGTH = 120;
export const CHECK_IN_ALLOWED_DURATIONS_MINUTES = [30, 60, 120] as const;
export const CHECK_IN_MAX_VIEWERS = 200;

const SOCIAL_HANDLE_PATTERN = /^[a-z0-9_]+$/;
const SOCIAL_OPERATION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const RESERVED_HANDLES = new Set([
  'admin',
  'administrator',
  'gathr',
  'help',
  'moderator',
  'null',
  'official',
  'root',
  'security',
  'support',
  'undefined',
]);

export type AudienceMode = 'all_friends' | 'selected_friends';

export interface ParsedAudience {
  mode: AudienceMode;
  selectedUids: string[];
}

export type SocialErrorCode =
  | 'already-exists'
  | 'failed-precondition'
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'resource-exhausted';

export class SocialDomainError extends Error {
  constructor(
    readonly code: SocialErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SocialDomainError';
  }
}

export function normalizeSocialHandle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().toLowerCase().replace(/^@+/, '');
}

export function validateSocialHandle(value: unknown): string {
  const normalized = normalizeSocialHandle(value);
  if (
    normalized.length < SOCIAL_HANDLE_MIN_LENGTH ||
    normalized.length > SOCIAL_HANDLE_MAX_LENGTH
  ) {
    throw new SocialDomainError(
      'invalid-argument',
      `Handle must be ${SOCIAL_HANDLE_MIN_LENGTH}-${SOCIAL_HANDLE_MAX_LENGTH} characters.`
    );
  }
  if (!SOCIAL_HANDLE_PATTERN.test(normalized)) {
    throw new SocialDomainError(
      'invalid-argument',
      'Handle can contain only letters, numbers, and underscores.'
    );
  }
  if (RESERVED_HANDLES.has(normalized)) {
    throw new SocialDomainError('invalid-argument', 'That handle is reserved.');
  }
  return normalized;
}

export function validateUid(value: unknown, fieldName = 'userId'): string {
  if (typeof value !== 'string') {
    throw new SocialDomainError('invalid-argument', `${fieldName} is required.`);
  }
  const uid = value.trim();
  if (!uid || uid.length > 128 || uid.includes('/')) {
    throw new SocialDomainError('invalid-argument', `${fieldName} is invalid.`);
  }
  return uid;
}

export function validateSocialOperationId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SocialDomainError('invalid-argument', 'Social operation ID is required.');
  }
  const operationId = value.trim();
  if (!SOCIAL_OPERATION_ID_PATTERN.test(operationId)) {
    throw new SocialDomainError('invalid-argument', 'Social operation ID is invalid.');
  }
  return operationId;
}

export function relationshipIdFor(firstUid: string, secondUid: string): string {
  const first = validateUid(firstUid, 'firstUid');
  const second = validateUid(secondUid, 'secondUid');
  if (first === second) {
    throw new SocialDomainError('invalid-argument', 'A user cannot friend themselves.');
  }
  const pair = [first, second].sort().join('\u0000');
  return createHash('sha256').update(pair).digest('hex');
}

export function normalizeCheckInMessage(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new SocialDomainError('invalid-argument', 'Check-in message must be text.');
  }
  const normalized = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (normalized.length > CHECK_IN_MESSAGE_MAX_LENGTH) {
    throw new SocialDomainError(
      'invalid-argument',
      `Check-in message must be ${CHECK_IN_MESSAGE_MAX_LENGTH} characters or fewer.`
    );
  }
  return normalized;
}

export function parseCheckInDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SocialDomainError('invalid-argument', 'Check-in duration is invalid.');
  }
  if (!(CHECK_IN_ALLOWED_DURATIONS_MINUTES as readonly number[]).includes(value)) {
    throw new SocialDomainError(
      'invalid-argument',
      `Check-in duration must be ${CHECK_IN_ALLOWED_DURATIONS_MINUTES.join(', ')} minutes.`
    );
  }
  return value;
}

export function parseAudience(modeValue: unknown, selectedValue: unknown): ParsedAudience {
  if (modeValue !== 'all_friends' && modeValue !== 'selected_friends') {
    throw new SocialDomainError('invalid-argument', 'Check-in audience is invalid.');
  }
  if (modeValue === 'all_friends') {
    return { mode: modeValue, selectedUids: [] };
  }
  if (!Array.isArray(selectedValue)) {
    throw new SocialDomainError('invalid-argument', 'Selected friends are required.');
  }
  const unique = Array.from(new Set(selectedValue.map((uid) => validateUid(uid, 'selectedUid'))));
  if (unique.length === 0) {
    throw new SocialDomainError('invalid-argument', 'Select at least one friend.');
  }
  if (unique.length > CHECK_IN_MAX_VIEWERS) {
    throw new SocialDomainError('resource-exhausted', 'Too many selected friends.');
  }
  return { mode: modeValue, selectedUids: unique.sort() };
}

export function validateVenueId(value: unknown): string {
  const venueId = validateUid(value, 'venueId');
  if (venueId.length > 256) {
    throw new SocialDomainError('invalid-argument', 'venueId is invalid.');
  }
  return venueId;
}

export function otherMember(members: unknown, currentUid: string): string {
  if (!Array.isArray(members) || members.length !== 2) {
    throw new SocialDomainError('failed-precondition', 'Friendship record is invalid.');
  }
  const normalizedMembers = members.map((uid) => validateUid(uid, 'memberUid'));
  const other = normalizedMembers.find((uid) => uid !== currentUid);
  if (!other || !normalizedMembers.includes(currentUid)) {
    throw new SocialDomainError('permission-denied', 'You are not part of this friendship.');
  }
  return other;
}
