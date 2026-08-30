import { createHash, randomUUID } from 'node:crypto';

import {
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  SocialDomainError,
  normalizeSocialHandle,
  validateSocialOperationId,
  validateUid,
  validateVenueId,
} from './validation.js';

export const FRIEND_EVENT_MAX_GUESTS = 120;
export const FRIEND_EVENT_TITLE_MAX_LENGTH = 100;
export const FRIEND_EVENT_DESCRIPTION_MAX_LENGTH = 2_000;
export const FRIEND_EVENT_CANCELLATION_REASON_MAX_LENGTH = 300;
const FRIEND_EVENT_HISTORY_LIMIT = 20;
export const FRIEND_EVENT_CATEGORIES = [
  'Live Music',
  'Trivia Night',
  'Comedy',
  'Workshops & Classes',
  'Religious',
  'Sports',
  'Family Friendly',
  'Gatherings & Parties',
  'Cinema',
] as const;

type FriendEventVisibility = 'all_friends' | 'selected_friends';
type GuestInviteMode = 'host_only' | 'guests_can_invite';
type FriendEventLocationType = 'recognized_venue' | 'custom_address' | 'online' | 'tbd';
type FriendEventStatus = 'published' | 'canceled' | 'ended';
type FriendEventRsvp = 'going' | 'maybe' | 'cant_go';
type FriendEventViewerResponse = FriendEventRsvp | 'host' | 'invited';

export interface FriendEventInput {
  operationId?: unknown;
  title: unknown;
  description?: unknown;
  category: unknown;
  startAtMs: unknown;
  endAtMs: unknown;
  visibility: unknown;
  selectedUids?: unknown;
  guestInviteMode?: unknown;
  guestListVisible?: unknown;
  coverImageUrl?: unknown;
  externalUrl?: unknown;
  location: unknown;
}

interface ParsedLocation {
  type: FriendEventLocationType;
  venueId?: string;
  placeName?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  revealAt?: Timestamp;
  onlineUrl?: string;
}

interface ParsedEventInput {
  title: string;
  description: string;
  category: string;
  startAt: Timestamp;
  endAt: Timestamp;
  visibility: FriendEventVisibility;
  selectedUids: string[];
  guestInviteMode: GuestInviteMode;
  guestListVisible: boolean;
  coverImageUrl: string;
  externalUrl: string;
  location: ParsedLocation;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function requiredText(value: unknown, field: string, maxLength: number, minLength = 1): string {
  const parsed = text(value, maxLength + 1);
  if (parsed.length < minLength || parsed.length > maxLength) {
    throw new SocialDomainError(
      'invalid-argument',
      `${field} must be between ${minLength} and ${maxLength} characters.`
    );
  }
  return parsed;
}

function optionalText(value: unknown, field: string, maxLength: number): string {
  if (value === null || value === undefined || value === '') return '';
  const parsed = text(value, maxLength + 1);
  if (parsed.length > maxLength) {
    throw new SocialDomainError('invalid-argument', `${field} cannot exceed ${maxLength} characters.`);
  }
  return parsed;
}

function httpsUrl(value: unknown, field: string, required = false): string {
  const parsed = text(value, 2_000);
  if (!parsed && !required) return '';
  try {
    const url = new URL(parsed);
    if (url.protocol !== 'https:') throw new Error('protocol');
    return url.toString();
  } catch {
    throw new SocialDomainError('invalid-argument', `${field} must be a secure web address.`);
  }
}

function finiteNumber(value: unknown, field: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new SocialDomainError('invalid-argument', `${field} is invalid.`);
  }
  return parsed;
}

function coordinate(value: unknown, field: 'latitude' | 'longitude'): number {
  const parsed = finiteNumber(value, field);
  const minimum = field === 'latitude' ? -90 : -180;
  const maximum = field === 'latitude' ? 90 : 180;
  if (parsed < minimum || parsed > maximum) {
    throw new SocialDomainError('invalid-argument', `${field} is invalid.`);
  }
  return parsed;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SocialDomainError('invalid-argument', 'Event location is invalid.');
  }
  return value as Record<string, unknown>;
}

function parseTimestamp(value: unknown, field: string): Timestamp {
  const millis = finiteNumber(value, field);
  if (!Number.isSafeInteger(Math.round(millis))) {
    throw new SocialDomainError('invalid-argument', `${field} is invalid.`);
  }
  return Timestamp.fromMillis(Math.round(millis));
}

function parseSelectedUids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const uids = [...new Set(value.map((uid) => validateUid(uid, 'selectedUid')))].sort();
  if (uids.length > FRIEND_EVENT_MAX_GUESTS) {
    throw new SocialDomainError(
      'resource-exhausted',
      `Friend events currently support up to ${FRIEND_EVENT_MAX_GUESTS} guests.`
    );
  }
  return uids;
}

function parseLocation(value: unknown, startAt: Timestamp, now: Timestamp): ParsedLocation {
  const input = record(value);
  const type = input.type;
  if (type === 'recognized_venue') {
    return { type, venueId: validateVenueId(input.venueId) };
  }
  if (type === 'custom_address') {
    const revealAt = input.revealAtMs === null || input.revealAtMs === undefined
      ? now
      : parseTimestamp(input.revealAtMs, 'revealAtMs');
    if (revealAt.toMillis() > startAt.toMillis()) {
      throw new SocialDomainError('invalid-argument', 'The address must be revealed by the event start time.');
    }
    return {
      type,
      placeName: text(input.placeName, 100),
      address: requiredText(input.address, 'Address', 300, 5),
      latitude: coordinate(input.latitude, 'latitude'),
      longitude: coordinate(input.longitude, 'longitude'),
      revealAt,
    };
  }
  if (type === 'online') {
    return { type, onlineUrl: httpsUrl(input.onlineUrl, 'Online link') };
  }
  if (type === 'tbd') return { type };
  throw new SocialDomainError('invalid-argument', 'Choose a valid event location type.');
}

export function parseFriendEventInput(
  value: FriendEventInput,
  now: Timestamp = Timestamp.now()
): ParsedEventInput {
  const startAt = parseTimestamp(value.startAtMs, 'startAtMs');
  const endAt = parseTimestamp(value.endAtMs, 'endAtMs');
  if (startAt.toMillis() < now.toMillis() - 5 * 60_000) {
    throw new SocialDomainError('invalid-argument', 'The event start time must be in the future.');
  }
  if (endAt.toMillis() <= startAt.toMillis()) {
    throw new SocialDomainError('invalid-argument', 'The event end time must be after its start time.');
  }
  if (endAt.toMillis() - startAt.toMillis() > 366 * 24 * 60 * 60_000) {
    throw new SocialDomainError('invalid-argument', 'An event cannot last longer than one year.');
  }
  if (value.visibility !== 'all_friends' && value.visibility !== 'selected_friends') {
    throw new SocialDomainError('invalid-argument', 'Choose who can see this event.');
  }
  const selectedUids = parseSelectedUids(value.selectedUids);
  if (value.visibility === 'selected_friends' && selectedUids.length === 0) {
    throw new SocialDomainError('invalid-argument', 'Choose at least one friend to invite.');
  }
  const guestInviteMode = value.guestInviteMode === 'guests_can_invite'
    ? 'guests_can_invite'
    : 'host_only';
  const category = requiredText(value.category, 'Category', 60, 2);
  if (!(FRIEND_EVENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new SocialDomainError('invalid-argument', 'Choose a valid GathR event category.');
  }
  if (optionalText(value.coverImageUrl, 'Cover image', 2_000)) {
    throw new SocialDomainError(
      'failed-precondition',
      'Event cover uploads are not available until private media storage is enabled.'
    );
  }
  return {
    title: requiredText(value.title, 'Title', FRIEND_EVENT_TITLE_MAX_LENGTH, 2),
    description: optionalText(value.description, 'Description', FRIEND_EVENT_DESCRIPTION_MAX_LENGTH),
    category,
    startAt,
    endAt,
    visibility: value.visibility,
    selectedUids,
    guestInviteMode,
    guestListVisible: value.guestListVisible !== false,
    coverImageUrl: '',
    externalUrl: httpsUrl(value.externalUrl, 'Event link'),
    location: parseLocation(value.location, startAt, now),
  };
}

function assertExisting(snapshot: DocumentSnapshot, label: string): DocumentData {
  if (!snapshot.exists) {
    throw new SocialDomainError('not-found', `${label} was not found.`);
  }
  return snapshot.data() || {};
}

function safeProfile(uid: string, data: DocumentData | undefined) {
  return {
    uid,
    displayName: text(data?.displayName, 80) || 'GathR user',
    photoURL: text(data?.photoURL, 2_000),
    socialHandle: normalizeSocialHandle(data?.socialHandle),
  };
}

function eventRef(db: Firestore, eventId: string) {
  return db.collection('friendEvents').doc(eventId);
}

function privateLocationRef(db: Firestore, eventId: string) {
  return db.collection('friendEventPrivateLocations').doc(eventId);
}

function invitationRef(db: Firestore, eventId: string, memberUid: string) {
  return db.collection('friendEventInvitations').doc(`${eventId}_${memberUid}`);
}

function responseRef(db: Firestore, eventId: string, memberUid: string) {
  return db.collection('friendEventResponses').doc(`${eventId}_${memberUid}`);
}

function eventProjectionRef(db: Firestore, viewerUid: string, eventId: string) {
  return db.collection('users').doc(viewerUid).collection('friendEvents').doc(eventId);
}

function locationProjectionRef(db: Firestore, viewerUid: string, eventId: string) {
  return db.collection('users').doc(viewerUid).collection('friendEventLocations').doc(eventId);
}

function blockRef(db: Firestore, ownerUid: string, blockedUid: string) {
  return db.collection('users').doc(ownerUid).collection('blocks').doc(blockedUid);
}

function friendRef(db: Firestore, ownerUid: string, friendUid: string) {
  return db.collection('users').doc(ownerUid).collection('friends').doc(friendUid);
}

function approximateCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function locationProjection(
  eventId: string,
  hostUid: string,
  location: ParsedLocation,
  now: Timestamp
) {
  return {
    eventId,
    hostUid,
    address: location.address,
    placeName: location.placeName || 'Private event',
    latitude: location.latitude,
    longitude: location.longitude,
    revealedAt: now,
    updatedAt: now,
  };
}

function generalProjection(
  event: DocumentData,
  hostProfile: ReturnType<typeof safeProfile>,
  viewerUid: string,
  ownRsvp: FriendEventViewerResponse,
  now: Timestamp
) {
  const base = {
    eventId: event.eventId,
    hostUid: event.hostUid,
    host: hostProfile,
    viewerUid,
    viewerRole: viewerUid === event.hostUid ? 'host' : 'guest',
    title: event.title,
    description: event.description,
    category: event.category,
    startAt: event.startAt,
    endAt: event.endAt,
    status: event.status as FriendEventStatus,
    visibility: event.visibility as FriendEventVisibility,
    guestInviteMode: event.guestInviteMode as GuestInviteMode,
    guestListVisible: event.guestListVisible === true,
    coverImageUrl: event.coverImageUrl,
    externalUrl: event.externalUrl,
    locationType: event.locationType as FriendEventLocationType,
    locationLabel: event.locationLabel,
    locationAddress: event.recognizedVenueAddress || '',
    addressRevealAt: event.addressRevealAt || null,
    addressRevealed: event.addressRevealed === true || viewerUid === event.hostUid,
    venueId: event.venueId || '',
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
    approximateLatitude: event.approximateLatitude ?? null,
    approximateLongitude: event.approximateLongitude ?? null,
    onlineUrl: event.onlineUrl || '',
    viewerCount: Array.isArray(event.viewerUids) ? event.viewerUids.length : 0,
    responseCounts: event.responseCounts || { going: 1, maybe: 0, cant_go: 0 },
    guests: viewerUid === event.hostUid || event.guestListVisible === true
      ? (Array.isArray(event.guests) ? event.guests : [])
      : [],
    ownRsvp,
    cancellationReason: event.cancellationReason || '',
    updateHistory: Array.isArray(event.updateHistory) ? event.updateHistory : [],
    revision: event.revision,
    createdAt: event.createdAt,
    updatedAt: now,
  };
  return base;
}

async function audienceCandidates(
  db: Firestore,
  hostUid: string,
  parsed: ParsedEventInput
): Promise<string[]> {
  if (parsed.visibility === 'selected_friends') return parsed.selectedUids;
  const friends = await db.collection('users').doc(hostUid).collection('friends').get();
  if (friends.size > FRIEND_EVENT_MAX_GUESTS) {
    throw new SocialDomainError(
      'resource-exhausted',
      `Friend events currently support up to ${FRIEND_EVENT_MAX_GUESTS} guests.`
    );
  }
  return friends.docs.map((document) => document.id).sort();
}

function eventDocument(
  eventId: string,
  hostUid: string,
  parsed: ParsedEventInput,
  venue: DocumentData | null,
  viewerUids: string[],
  guests: DocumentData[],
  now: Timestamp,
  revision: string
) {
  const location = parsed.location;
  const venueName = venue
    ? text(venue.pagename, 120) || text(venue.title, 120) || text(venue.name, 120) || 'GathR venue'
    : '';
  const venueAddress = venue ? text(venue.address, 300) : '';
  const venueLatitude = venue && Number.isFinite(Number(venue.latitude)) ? Number(venue.latitude) : null;
  const venueLongitude = venue && Number.isFinite(Number(venue.longitude)) ? Number(venue.longitude) : null;
  const custom = location.type === 'custom_address';
  const createdEntry = {
    kind: 'created',
    summary: 'Event created.',
    at: now,
    revision,
  };
  return {
    eventId,
    hostUid,
    title: parsed.title,
    description: parsed.description,
    category: parsed.category,
    startAt: parsed.startAt,
    endAt: parsed.endAt,
    status: 'published' as FriendEventStatus,
    visibility: parsed.visibility,
    audienceSnapshottedAt: now,
    selectedUids: parsed.visibility === 'selected_friends' ? parsed.selectedUids : [],
    viewerUids,
    guests,
    guestInviteMode: parsed.guestInviteMode,
    guestListVisible: parsed.guestListVisible,
    coverImageUrl: parsed.coverImageUrl,
    externalUrl: parsed.externalUrl,
    locationType: location.type,
    locationLabel: location.type === 'recognized_venue'
      ? venueName
      : custom
        ? location.placeName || 'Private event'
        : location.type === 'online' ? 'Online' : 'Location to be announced',
    addressRevealAt: custom ? location.revealAt : null,
    addressRevealed: custom ? location.revealAt!.toMillis() <= now.toMillis() : true,
    venueId: location.venueId || '',
    latitude: location.type === 'recognized_venue' ? venueLatitude : null,
    longitude: location.type === 'recognized_venue' ? venueLongitude : null,
    recognizedVenueAddress: location.type === 'recognized_venue' ? venueAddress : '',
    approximateLatitude: custom ? approximateCoordinate(location.latitude!) : null,
    approximateLongitude: custom ? approximateCoordinate(location.longitude!) : null,
    onlineUrl: location.onlineUrl || '',
    responseCounts: { going: 1, maybe: 0, cant_go: 0 },
    cancellationReason: '',
    updateHistory: [createdEntry],
    revision,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createFriendEvent(
  hostUidValue: unknown,
  input: FriendEventInput,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<DocumentData> {
  const hostUid = validateUid(hostUidValue, 'hostUid');
  const operationId = validateSocialOperationId(input.operationId ?? randomUUID());
  const parsed = parseFriendEventInput(input, now);
  const candidates = await audienceCandidates(db, hostUid, parsed);
  if (candidates.includes(hostUid)) {
    throw new SocialDomainError('invalid-argument', 'The host cannot be invited as a guest.');
  }
  const inputHash = createHash('sha256').update(JSON.stringify({
    ...parsed,
    startAt: parsed.startAt.toMillis(),
    endAt: parsed.endAt.toMillis(),
    location: {
      ...parsed.location,
      revealAt: parsed.location.revealAt?.toMillis(),
    },
  })).digest('hex');
  const operationRef = db.collection('socialOperations').doc(`${hostUid}_friend_event_${operationId}`);
  const hostRef = db.collection('users').doc(hostUid);
  const venueRef = parsed.location.type === 'recognized_venue'
    ? db.collection('venues').doc(parsed.location.venueId!)
    : null;

  return db.runTransaction(async (transaction) => {
    const baseSnapshots = await transaction.getAll(
      hostRef,
      operationRef,
      ...(venueRef ? [venueRef] : [])
    );
    const operation = baseSnapshots[1].data() || {};
    if (baseSnapshots[1].exists) {
      if (operation.action !== 'create_friend_event' || operation.inputHash !== inputHash) {
        throw new SocialDomainError('failed-precondition', 'This operation ID was already used.');
      }
      return operation.result as DocumentData;
    }
    const hostProfile = safeProfile(hostUid, assertExisting(baseSnapshots[0], 'Host profile'));
    const venue = venueRef ? assertExisting(baseSnapshots[2], 'Venue') : null;
    const audienceSnapshots = candidates.length
      ? await transaction.getAll(...candidates.flatMap((uid) => [
        friendRef(db, hostUid, uid),
        blockRef(db, hostUid, uid),
        blockRef(db, uid, hostUid),
      ]))
      : [];
    const viewerUids = candidates.filter((uid, index) => {
      const offset = index * 3;
      return audienceSnapshots[offset]?.exists
        && !audienceSnapshots[offset + 1]?.exists
        && !audienceSnapshots[offset + 2]?.exists;
    });
    if (parsed.visibility === 'selected_friends' && viewerUids.length !== candidates.length) {
      throw new SocialDomainError(
        'failed-precondition',
        'One or more selected people are no longer eligible for this event.'
      );
    }

    const eventId = randomUUID();
    const revision = randomUUID();
    const guests = viewerUids.map((viewerUid, index) => ({
      ...safeProfile(viewerUid, audienceSnapshots[index * 3]?.data()),
      invitedByUid: hostUid,
      response: 'invited' as FriendEventViewerResponse,
    }));
    const event = eventDocument(eventId, hostUid, parsed, venue, viewerUids, guests, now, revision);
    transaction.set(eventRef(db, eventId), event);
    transaction.set(eventProjectionRef(db, hostUid, eventId), generalProjection(event, hostProfile, hostUid, 'host', now));
    transaction.set(responseRef(db, eventId, hostUid), {
      eventId,
      hostUid,
      memberUid: hostUid,
      response: 'going',
      updatedAt: now,
    });

    const custom = parsed.location.type === 'custom_address';
    const addressRevealed = custom && parsed.location.revealAt!.toMillis() <= now.toMillis();
    if (custom) {
      transaction.set(privateLocationRef(db, eventId), {
        eventId,
        hostUid,
        address: parsed.location.address,
        placeName: parsed.location.placeName || 'Private event',
        latitude: parsed.location.latitude,
        longitude: parsed.location.longitude,
        revealAt: parsed.location.revealAt,
        revealPending: !addressRevealed,
        revealedAt: addressRevealed ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(
        locationProjectionRef(db, hostUid, eventId),
        locationProjection(eventId, hostUid, parsed.location, now)
      );
    }

    for (const viewerUid of viewerUids) {
      transaction.set(eventProjectionRef(db, viewerUid, eventId), generalProjection(event, hostProfile, viewerUid, 'invited', now));
      transaction.set(invitationRef(db, eventId, viewerUid), {
        eventId,
        hostUid,
        memberUid: viewerUid,
        invitedByUid: hostUid,
        status: 'invited',
        createdAt: now,
        updatedAt: now,
      });
      if (addressRevealed) {
        transaction.set(
          locationProjectionRef(db, viewerUid, eventId),
          locationProjection(eventId, hostUid, parsed.location, now)
        );
      }
    }
    const result = { ...event, viewerCount: viewerUids.length };
    transaction.set(operationRef, {
      uid: hostUid,
      action: 'create_friend_event',
      inputHash,
      result,
      createdAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60_000),
    });
    return result;
  });
}

export async function updateFriendEvent(
  hostUidValue: unknown,
  eventIdValue: unknown,
  input: Omit<FriendEventInput, 'visibility' | 'selectedUids'>,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<{ eventId: string; revision: string }> {
  const hostUid = validateUid(hostUidValue, 'hostUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  const currentSnapshot = await eventRef(db, eventId).get();
  const current = assertExisting(currentSnapshot, 'Friend event');
  if (current.hostUid !== hostUid) {
    throw new SocialDomainError('permission-denied', 'Only the host can edit this event.');
  }
  if (current.status !== 'published') {
    throw new SocialDomainError('failed-precondition', 'This event can no longer be edited.');
  }
  const parsed = parseFriendEventInput({
    ...input,
    visibility: current.visibility,
    selectedUids: current.selectedUids,
  }, now);
  const viewerUids = Array.isArray(current.viewerUids)
    ? current.viewerUids.map((uid: unknown) => validateUid(uid, 'viewerUid'))
    : [];
  const [hostSnapshot, venueSnapshot] = await Promise.all([
    db.collection('users').doc(hostUid).get(),
    parsed.location.type === 'recognized_venue'
      ? db.collection('venues').doc(parsed.location.venueId!).get()
      : Promise.resolve(null),
  ]);
  const hostProfile = safeProfile(hostUid, assertExisting(hostSnapshot, 'Host profile'));
  const venue = venueSnapshot ? assertExisting(venueSnapshot, 'Venue') : null;
  const revision = randomUUID();
  const event = eventDocument(
    eventId,
    hostUid,
    parsed,
    venue,
    viewerUids,
    Array.isArray(current.guests) ? current.guests : [],
    current.createdAt || now,
    revision
  );
  const changes: string[] = [];
  if (current.title !== parsed.title) changes.push('name');
  if (current.category !== parsed.category) changes.push('category');
  if (current.startAt?.toMillis?.() !== parsed.startAt.toMillis()
    || current.endAt?.toMillis?.() !== parsed.endAt.toMillis()) changes.push('time');
  if (current.locationType !== parsed.location.type
    || current.venueId !== (parsed.location.venueId || '')
    || current.locationLabel !== event.locationLabel) changes.push('location');
  if (current.description !== parsed.description) changes.push('details');
  if (current.guestInviteMode !== parsed.guestInviteMode
    || current.guestListVisible !== parsed.guestListVisible) changes.push('guest settings');
  const updateSummary = changes.length > 0
    ? `Host updated ${changes.join(', ')}.`
    : 'Host saved the event.';
  event.createdAt = current.createdAt || now;
  event.audienceSnapshottedAt = current.audienceSnapshottedAt || current.createdAt || now;
  event.updateHistory = [
    ...(Array.isArray(current.updateHistory) ? current.updateHistory : []),
    { kind: 'edited', summary: updateSummary, at: now, revision },
  ].slice(-FRIEND_EVENT_HISTORY_LIMIT);
  event.updatedAt = now;
  const custom = parsed.location.type === 'custom_address';
  const addressRevealed = custom && parsed.location.revealAt!.toMillis() <= now.toMillis();

  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(eventRef(db, eventId));
    const freshData = assertExisting(fresh, 'Friend event');
    if (freshData.hostUid !== hostUid || freshData.revision !== current.revision) {
      throw new SocialDomainError('failed-precondition', 'The event changed. Review it and try again.');
    }
    const viewers = [hostUid, ...viewerUids];
    const responseSnapshots = await transaction.getAll(
      ...viewers.map((viewerUid) => responseRef(db, eventId, viewerUid))
    );
    transaction.set(eventRef(db, eventId), event);
    viewers.forEach((viewerUid, index) => {
      const responseSnapshot = responseSnapshots[index];
      const ownRsvp = viewerUid === hostUid
        ? 'host'
        : (responseSnapshot.data()?.response as FriendEventRsvp | undefined) || 'invited';
      transaction.set(eventProjectionRef(db, viewerUid, eventId), generalProjection(event, hostProfile, viewerUid, ownRsvp, now));
      transaction.delete(locationProjectionRef(db, viewerUid, eventId));
    });
    transaction.delete(privateLocationRef(db, eventId));
    if (custom) {
      transaction.set(privateLocationRef(db, eventId), {
        eventId,
        hostUid,
        address: parsed.location.address,
        placeName: parsed.location.placeName || 'Private event',
        latitude: parsed.location.latitude,
        longitude: parsed.location.longitude,
        revealAt: parsed.location.revealAt,
        revealPending: !addressRevealed,
        revealedAt: addressRevealed ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(locationProjectionRef(db, hostUid, eventId), locationProjection(eventId, hostUid, parsed.location, now));
      if (addressRevealed) {
        viewerUids.forEach((viewerUid) => transaction.set(
          locationProjectionRef(db, viewerUid, eventId),
          locationProjection(eventId, hostUid, parsed.location, now)
        ));
      }
    }
  });
  return { eventId, revision };
}

export async function inviteToFriendEvent(
  inviterUidValue: unknown,
  eventIdValue: unknown,
  targetUidValue: unknown,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<{ eventId: string; invitedUid: string }> {
  const inviterUid = validateUid(inviterUidValue, 'inviterUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  const targetUid = validateUid(targetUidValue, 'targetUid');
  if (inviterUid === targetUid) {
    throw new SocialDomainError('invalid-argument', 'You are already invited to this event.');
  }
  return db.runTransaction(async (transaction) => {
    const eventSnapshot = await transaction.get(eventRef(db, eventId));
    const event = assertExisting(eventSnapshot, 'Friend event');
    const hostUid = validateUid(event.hostUid, 'hostUid');
    const [inviterProjection, targetFriend, inviterBlock, targetBlock, hostTargetBlock, targetHostBlock, hostProfileSnapshot, privateLocation] = await transaction.getAll(
      eventProjectionRef(db, inviterUid, eventId),
      friendRef(db, inviterUid, targetUid),
      blockRef(db, inviterUid, targetUid),
      blockRef(db, targetUid, inviterUid),
      blockRef(db, hostUid, targetUid),
      blockRef(db, targetUid, hostUid),
      db.collection('users').doc(hostUid),
      privateLocationRef(db, eventId)
    );
    const isHost = inviterUid === hostUid;
    if (!isHost && (!inviterProjection.exists || event.guestInviteMode !== 'guests_can_invite')) {
      throw new SocialDomainError('permission-denied', 'Only the host can invite people to this event.');
    }
    if (
      event.status !== 'published'
      || !targetFriend.exists
      || inviterBlock.exists
      || targetBlock.exists
      || hostTargetBlock.exists
      || targetHostBlock.exists
    ) {
      throw new SocialDomainError('failed-precondition', 'This person is not eligible for the invitation.');
    }
    const viewerUids = Array.isArray(event.viewerUids) ? event.viewerUids as string[] : [];
    if (viewerUids.includes(targetUid)) return { eventId, invitedUid: targetUid };
    if (viewerUids.length >= FRIEND_EVENT_MAX_GUESTS) {
      throw new SocialDomainError('resource-exhausted', 'This event has reached its guest limit.');
    }
    const hostProfile = safeProfile(hostUid, assertExisting(hostProfileSnapshot, 'Host profile'));
    const targetProfile = safeProfile(targetUid, targetFriend.data());
    const guests = [
      ...(Array.isArray(event.guests) ? event.guests : []),
      {
        ...targetProfile,
        invitedByUid: inviterUid,
        response: 'invited' as FriendEventViewerResponse,
      },
    ];
    const nextEvent = {
      ...event,
      viewerUids: [...viewerUids, targetUid].sort(),
      guests,
      revision: randomUUID(),
      updatedAt: now,
    };
    transaction.set(eventRef(db, eventId), nextEvent);
    for (const existingViewerUid of [hostUid, ...viewerUids]) {
      transaction.update(eventProjectionRef(db, existingViewerUid, eventId), {
        viewerCount: viewerUids.length + 1,
        ...(existingViewerUid === hostUid || event.guestListVisible === true ? { guests } : {}),
        revision: nextEvent.revision,
        updatedAt: now,
      });
    }
    transaction.set(eventProjectionRef(db, targetUid, eventId), generalProjection(nextEvent, hostProfile, targetUid, 'invited', now));
    transaction.set(invitationRef(db, eventId, targetUid), {
      eventId,
      hostUid,
      memberUid: targetUid,
      invitedByUid: inviterUid,
      status: 'invited',
      createdAt: now,
      updatedAt: now,
    });
    if (privateLocation.exists && event.addressRevealed === true) {
      const location = privateLocation.data() || {};
      transaction.set(locationProjectionRef(db, targetUid, eventId), {
        eventId,
        hostUid,
        address: location.address,
        placeName: location.placeName,
        latitude: location.latitude,
        longitude: location.longitude,
        revealedAt: now,
        updatedAt: now,
      });
    }
    return { eventId, invitedUid: targetUid };
  });
}

export async function respondToFriendEvent(
  memberUidValue: unknown,
  eventIdValue: unknown,
  responseValue: unknown,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<{ eventId: string; response: FriendEventRsvp }> {
  const memberUid = validateUid(memberUidValue, 'memberUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  if (responseValue !== 'going' && responseValue !== 'maybe' && responseValue !== 'cant_go') {
    throw new SocialDomainError('invalid-argument', 'Choose Going, Maybe, or Can’t go.');
  }
  const response = responseValue as FriendEventRsvp;
  return db.runTransaction(async (transaction) => {
    const [eventSnapshot, projectionSnapshot, previousResponse] = await transaction.getAll(
      eventRef(db, eventId),
      eventProjectionRef(db, memberUid, eventId),
      responseRef(db, eventId, memberUid)
    );
    const event = assertExisting(eventSnapshot, 'Friend event');
    if (memberUid === event.hostUid || !projectionSnapshot.exists || event.status !== 'published') {
      throw new SocialDomainError('permission-denied', 'This response is unavailable.');
    }
    const counts = {
      going: Math.max(1, Number(event.responseCounts?.going) || 1),
      maybe: Math.max(0, Number(event.responseCounts?.maybe) || 0),
      cant_go: Math.max(0, Number(event.responseCounts?.cant_go) || 0),
    };
    const previous = previousResponse.data()?.response as FriendEventRsvp | undefined;
    if (previous && previous !== response) counts[previous] = Math.max(previous === 'going' ? 1 : 0, counts[previous] - 1);
    if (previous !== response) counts[response] += 1;
    const guests = (Array.isArray(event.guests) ? event.guests : []).map((guest: DocumentData) =>
      guest.uid === memberUid ? { ...guest, response } : guest
    );
    transaction.update(eventRef(db, eventId), { guests, responseCounts: counts, updatedAt: now });
    transaction.set(responseRef(db, eventId, memberUid), {
      eventId,
      hostUid: event.hostUid,
      memberUid,
      response,
      updatedAt: now,
      createdAt: previousResponse.data()?.createdAt || now,
    });
    transaction.update(eventProjectionRef(db, event.hostUid, eventId), {
      guests,
      responseCounts: counts,
      updatedAt: now,
    });
    const viewers = Array.isArray(event.viewerUids) ? event.viewerUids as string[] : [];
    for (const viewerUid of viewers) {
      transaction.update(eventProjectionRef(db, viewerUid, eventId), {
        ...(viewerUid === memberUid ? { ownRsvp: response } : {}),
        ...(event.guestListVisible === true ? { guests } : {}),
        responseCounts: counts,
        updatedAt: now,
      });
    }
    return { eventId, response };
  });
}

export async function removeFromFriendEvent(
  hostUidValue: unknown,
  eventIdValue: unknown,
  memberUidValue: unknown,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now()
): Promise<{ eventId: string; removedUid: string }> {
  const hostUid = validateUid(hostUidValue, 'hostUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  const memberUid = validateUid(memberUidValue, 'memberUid');
  return db.runTransaction(async (transaction) => {
    const [eventSnapshot, responseSnapshot] = await transaction.getAll(
      eventRef(db, eventId),
      responseRef(db, eventId, memberUid)
    );
    const event = assertExisting(eventSnapshot, 'Friend event');
    if (event.hostUid !== hostUid) {
      throw new SocialDomainError('permission-denied', 'Only the host can remove guests.');
    }
    const viewers = Array.isArray(event.viewerUids) ? event.viewerUids as string[] : [];
    if (!viewers.includes(memberUid)) return { eventId, removedUid: memberUid };
    const counts = { ...(event.responseCounts || { going: 1, maybe: 0, cant_go: 0 }) };
    const previous = responseSnapshot.data()?.response as FriendEventRsvp | undefined;
    if (previous) counts[previous] = Math.max(previous === 'going' ? 1 : 0, Number(counts[previous]) - 1);
    const nextViewers = viewers.filter((uid) => uid !== memberUid);
    const guests = (Array.isArray(event.guests) ? event.guests : [])
      .filter((guest: DocumentData) => guest.uid !== memberUid);
    const revision = randomUUID();
    transaction.update(eventRef(db, eventId), {
      viewerUids: nextViewers,
      guests,
      responseCounts: counts,
      revision,
      updatedAt: now,
    });
    transaction.delete(eventProjectionRef(db, memberUid, eventId));
    transaction.delete(locationProjectionRef(db, memberUid, eventId));
    transaction.delete(invitationRef(db, eventId, memberUid));
    transaction.delete(responseRef(db, eventId, memberUid));
    for (const viewerUid of [hostUid, ...nextViewers]) {
      transaction.update(eventProjectionRef(db, viewerUid, eventId), {
        viewerCount: nextViewers.length,
        ...(viewerUid === hostUid || event.guestListVisible === true ? { guests } : {}),
        responseCounts: counts,
        revision,
        updatedAt: now,
      });
    }
    return { eventId, removedUid: memberUid };
  });
}

export async function cancelFriendEvent(
  hostUidValue: unknown,
  eventIdValue: unknown,
  db: Firestore = getFirestore(),
  now: Timestamp = Timestamp.now(),
  reasonValue: unknown = ''
): Promise<{ eventId: string; status: 'canceled' }> {
  const hostUid = validateUid(hostUidValue, 'hostUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  const cancellationReason = optionalText(
    reasonValue,
    'Cancellation explanation',
    FRIEND_EVENT_CANCELLATION_REASON_MAX_LENGTH
  );
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef(db, eventId));
    const event = assertExisting(snapshot, 'Friend event');
    if (event.hostUid !== hostUid) {
      throw new SocialDomainError('permission-denied', 'Only the host can cancel this event.');
    }
    if (event.status === 'canceled') return { eventId, status: 'canceled' as const };
    if (event.status !== 'published') {
      throw new SocialDomainError('failed-precondition', 'This event can no longer be canceled.');
    }
    const viewers = [hostUid, ...(Array.isArray(event.viewerUids) ? event.viewerUids : [])];
    const customAddress = event.locationType === 'custom_address';
    const revision = randomUUID();
    const updateHistory = [
      ...(Array.isArray(event.updateHistory) ? event.updateHistory : []),
      {
        kind: 'canceled',
        summary: cancellationReason ? `Event canceled: ${cancellationReason}` : 'Event canceled by the host.',
        at: now,
        revision,
      },
    ].slice(-FRIEND_EVENT_HISTORY_LIMIT);
    transaction.update(eventRef(db, eventId), {
      status: 'canceled',
      cancellationReason,
      updateHistory,
      revision,
      updatedAt: now,
      ...(customAddress ? {
        addressRevealed: false,
        approximateLatitude: null,
        approximateLongitude: null,
      } : {}),
    });
    if (customAddress) transaction.delete(privateLocationRef(db, eventId));
    viewers.forEach((viewerUid) => {
      transaction.update(eventProjectionRef(db, viewerUid, eventId), {
        status: 'canceled',
        cancellationReason,
        updateHistory,
        revision,
        ...(customAddress ? {
          addressRevealed: false,
          approximateLatitude: null,
          approximateLongitude: null,
        } : {}),
        updatedAt: now,
      });
      if (customAddress) transaction.delete(locationProjectionRef(db, viewerUid, eventId));
    });
    return { eventId, status: 'canceled' as const };
  });
}

export async function markEndedFriendEvents(
  now: Timestamp = Timestamp.now(),
  db: Firestore = getFirestore(),
  limit = 25
): Promise<{ eventsEnded: number }> {
  const due = await db.collection('friendEvents')
    .where('status', '==', 'published')
    .where('endAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 50)))
    .get();
  let eventsEnded = 0;
  for (const snapshot of due.docs) {
    const ended = await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(snapshot.ref);
      if (!fresh.exists || fresh.data()?.status !== 'published') return false;
      const event = fresh.data() || {};
      const viewers = [event.hostUid, ...(Array.isArray(event.viewerUids) ? event.viewerUids : [])];
      const customAddress = event.locationType === 'custom_address';
      const revision = randomUUID();
      const updateHistory = [
        ...(Array.isArray(event.updateHistory) ? event.updateHistory : []),
        { kind: 'ended', summary: 'Event ended.', at: now, revision },
      ].slice(-FRIEND_EVENT_HISTORY_LIMIT);
      transaction.update(fresh.ref, {
        status: 'ended',
        endedAt: now,
        updateHistory,
        revision,
        updatedAt: now,
        ...(customAddress ? {
          addressRevealed: false,
          approximateLatitude: null,
          approximateLongitude: null,
        } : {}),
      });
      if (customAddress) transaction.delete(privateLocationRef(db, snapshot.id));
      viewers.forEach((viewerUid) => {
        transaction.update(eventProjectionRef(db, viewerUid, snapshot.id), {
          status: 'ended',
          updateHistory,
          revision,
          updatedAt: now,
          ...(customAddress ? {
            addressRevealed: false,
            approximateLatitude: null,
            approximateLongitude: null,
          } : {}),
        });
        if (customAddress) transaction.delete(locationProjectionRef(db, viewerUid, snapshot.id));
      });
      return true;
    });
    if (ended) eventsEnded += 1;
  }
  return { eventsEnded };
}

export async function deleteFriendEvent(
  hostUidValue: unknown,
  eventIdValue: unknown,
  db: Firestore = getFirestore()
): Promise<{ eventId: string; deleted: true }> {
  const hostUid = validateUid(hostUidValue, 'hostUid');
  const eventId = validateUid(eventIdValue, 'eventId');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(eventRef(db, eventId));
    if (!snapshot.exists) return;
    const event = snapshot.data() || {};
    if (event.hostUid !== hostUid) {
      throw new SocialDomainError('permission-denied', 'Only the host can delete this event.');
    }
    const guests = Array.isArray(event.viewerUids) ? event.viewerUids as string[] : [];
    transaction.delete(eventRef(db, eventId));
    transaction.delete(privateLocationRef(db, eventId));
    for (const viewerUid of [hostUid, ...guests]) {
      transaction.delete(eventProjectionRef(db, viewerUid, eventId));
      transaction.delete(locationProjectionRef(db, viewerUid, eventId));
      transaction.delete(invitationRef(db, eventId, viewerUid));
      transaction.delete(responseRef(db, eventId, viewerUid));
    }
  });
  return { eventId, deleted: true };
}

export async function revealDueFriendEventLocations(
  now: Timestamp = Timestamp.now(),
  db: Firestore = getFirestore(),
  limit = 25
): Promise<{ eventsRevealed: number; projectionsWritten: number }> {
  const snapshot = await db.collection('friendEventPrivateLocations')
    .where('revealPending', '==', true)
    .where('revealAt', '<=', now)
    .limit(Math.max(1, Math.min(limit, 50)))
    .get();
  let eventsRevealed = 0;
  let projectionsWritten = 0;
  for (const locationSnapshot of snapshot.docs) {
    if (locationSnapshot.data().revealedAt) continue;
    const result = await db.runTransaction(async (transaction) => {
      const [freshLocation, eventSnapshot] = await transaction.getAll(
        locationSnapshot.ref,
        eventRef(db, locationSnapshot.id)
      );
      if (!freshLocation.exists || freshLocation.data()?.revealedAt || !eventSnapshot.exists) return 0;
      const location = freshLocation.data() || {};
      const event = eventSnapshot.data() || {};
      const viewers = Array.isArray(event.viewerUids) ? event.viewerUids as string[] : [];
      for (const viewerUid of viewers) {
        transaction.set(locationProjectionRef(db, viewerUid, locationSnapshot.id), {
          eventId: locationSnapshot.id,
          hostUid: event.hostUid,
          address: location.address,
          placeName: location.placeName,
          latitude: location.latitude,
          longitude: location.longitude,
          revealedAt: now,
          updatedAt: now,
        });
        transaction.update(eventProjectionRef(db, viewerUid, locationSnapshot.id), {
          addressRevealed: true,
          updatedAt: now,
        });
      }
      transaction.update(locationSnapshot.ref, { revealPending: false, revealedAt: now, updatedAt: now });
      transaction.update(eventRef(db, locationSnapshot.id), { addressRevealed: true, updatedAt: now });
      transaction.update(eventProjectionRef(db, event.hostUid, locationSnapshot.id), {
        addressRevealed: true,
        updatedAt: now,
      });
      return viewers.length;
    });
    eventsRevealed += 1;
    projectionsWritten += result;
  }
  return { eventsRevealed, projectionsWritten };
}

export async function revokeHostedFriendEventAccessBetween(
  firstUidValue: unknown,
  secondUidValue: unknown,
  db: Firestore = getFirestore()
): Promise<{ revoked: number }> {
  const firstUid = validateUid(firstUidValue, 'firstUid');
  const secondUid = validateUid(secondUidValue, 'secondUid');
  const hosted = await db.collection('friendEvents').where('hostUid', 'in', [firstUid, secondUid]).get();
  let revoked = 0;
  for (const snapshot of hosted.docs) {
    const event = snapshot.data() || {};
    const guestUid = event.hostUid === firstUid ? secondUid : firstUid;
    if (!Array.isArray(event.viewerUids) || !event.viewerUids.includes(guestUid)) continue;
    await removeFromFriendEvent(event.hostUid, snapshot.id, guestUid, db);
    revoked += 1;
  }
  return { revoked };
}

export async function revokeFriendEventAccessBetween(
  firstUidValue: unknown,
  secondUidValue: unknown,
  db: Firestore = getFirestore()
): Promise<{ revoked: number }> {
  const firstUid = validateUid(firstUidValue, 'firstUid');
  const secondUid = validateUid(secondUidValue, 'secondUid');
  let revoked = (await revokeHostedFriendEventAccessBetween(firstUid, secondUid, db)).revoked;
  const [firstInvitations, secondInvitations] = await Promise.all([
    db.collection('friendEventInvitations').where('memberUid', '==', firstUid).get(),
    db.collection('friendEventInvitations').where('memberUid', '==', secondUid).get(),
  ]);
  for (const invitationSnapshot of [...firstInvitations.docs, ...secondInvitations.docs]) {
    const invitation = invitationSnapshot.data() || {};
    const memberUid = text(invitation.memberUid, 128);
    const invitedByUid = text(invitation.invitedByUid, 128);
    if (!(
      (memberUid === firstUid && invitedByUid === secondUid)
      || (memberUid === secondUid && invitedByUid === firstUid)
    )) continue;
    const hostUid = text(invitation.hostUid, 128);
    const eventId = text(invitation.eventId, 256);
    if (!hostUid || !eventId) continue;
    await removeFromFriendEvent(hostUid, eventId, memberUid, db).catch((error) => {
      if (error instanceof SocialDomainError && error.code === 'not-found') return;
      throw error;
    });
    revoked += 1;
  }
  return { revoked };
}

export async function cleanupFriendEventsForAccount(
  uidValue: unknown,
  db: Firestore = getFirestore()
): Promise<{ hostedEventsDeleted: number; membershipsRevoked: number }> {
  const uid = validateUid(uidValue, 'uid');
  const [hosted, memberships] = await Promise.all([
    db.collection('friendEvents').where('hostUid', '==', uid).get(),
    db.collection('friendEventInvitations').where('memberUid', '==', uid).get(),
  ]);
  let hostedEventsDeleted = 0;
  for (const snapshot of hosted.docs) {
    await deleteFriendEvent(uid, snapshot.id, db);
    hostedEventsDeleted += 1;
  }
  let membershipsRevoked = 0;
  for (const snapshot of memberships.docs) {
    const invitation = snapshot.data() || {};
    const eventId = text(invitation.eventId, 256);
    const hostUid = text(invitation.hostUid, 128);
    if (!eventId || !hostUid || hostUid === uid) continue;
    await removeFromFriendEvent(hostUid, eventId, uid, db).catch((error) => {
      if (error instanceof SocialDomainError && error.code === 'not-found') return;
      throw error;
    });
    membershipsRevoked += 1;
  }
  return { hostedEventsDeleted, membershipsRevoked };
}
