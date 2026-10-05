import assert from 'node:assert/strict';
import test from 'node:test';

import * as firestoreService from '../services/firestoreService.js';
import { RawRowData, VenueData } from '../types/index.js';
import { resolveCanonicalVenueIconForRegression } from './rowProcessor.js';

const mutableFirestoreService = firestoreService as unknown as {
  updateVenueProfileImage: typeof firestoreService.updateVenueProfileImage;
};

interface MockImageResponse {
  status: number;
  contentType?: string;
}

async function withImageMocks<T>(
  responses: Map<string, MockImageResponse>,
  run: (
    calls: string[],
    updates: Array<{ venueId: string; imageUrl: string; sourceSignature?: string }>
  ) => Promise<T>
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUpdate = firestoreService.updateVenueProfileImage;
  const calls: string[] = [];
  const updates: Array<{ venueId: string; imageUrl: string; sourceSignature?: string }> = [];

  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    calls.push(url);
    const response = responses.get(url);
    if (!response) throw new Error(`Unexpected image probe: ${url}`);
    return new Response(new Uint8Array([1, 2, 3]), {
      status: response.status,
      headers: response.contentType ? { 'content-type': response.contentType } : undefined,
    });
  }) as typeof fetch;

  mutableFirestoreService.updateVenueProfileImage = async (venueId, imageUrl, options) => {
    updates.push({ venueId, imageUrl, sourceSignature: options?.sourceSignature });
  };

  try {
    return await run(calls, updates);
  } finally {
    globalThis.fetch = originalFetch;
    mutableFirestoreService.updateVenueProfileImage = originalUpdate;
  }
}

function buildVenue(profileImage: string, profileImageSourceSignature?: string): VenueData {
  return {
    id: 'venue_oldedublinpub_test',
    name: 'Olde Dublin Pub',
    normalizedName: 'olde dublin pub',
    facebookUrl: 'https://www.facebook.com/oldedublinpub',
    profileImage,
    profileImageSourceSignature,
  };
}

function buildRow(profilePicUrl: string, facebookUrl = 'https://www.facebook.com/oldedublinpub'): RawRowData {
  return {
    uniqueId: 'profile-recovery-test',
    text: 'Live music this weekend.',
    mediaUrls: [],
    userName: 'Olde Dublin Pub',
    pageName: 'Olde Dublin Pub',
    timestamp: '2026-10-05T12:00:00.000Z',
    facebookUrl,
    profilePicUrl,
  };
}

test('replaces a first-party venue avatar only when the old GCS object is 404 and the new GCS image is available', async () => {
  const brokenAvatar = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-broken.webp';
  const uploadedFacebookAvatar = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-restored.webp';
  const facebookProfileUrl = 'https://scontent.xx.fbcdn.net/profile/oldedublin.jpg';
  const venue = buildVenue(brokenAvatar);

  await withImageMocks(new Map([
    [brokenAvatar, { status: 404 }],
    [uploadedFacebookAvatar, { status: 200, contentType: 'image/webp' }],
  ]), async (calls, updates) => {
    const resolved = await resolveCanonicalVenueIconForRegression({
      venue,
      row: buildRow(facebookProfileUrl),
      incomingIcon: uploadedFacebookAvatar,
      rowIndex: 0,
      parserMode: 'full5stage',
      eventName: 'Weekend Music',
    });

    assert.equal(resolved, uploadedFacebookAvatar);
    assert.equal(venue.profileImage, uploadedFacebookAvatar);
    assert.deepEqual(calls.sort(), [brokenAvatar, uploadedFacebookAvatar].sort());
    assert.deepEqual(updates, [{
      venueId: venue.id,
      imageUrl: uploadedFacebookAvatar,
      sourceSignature: 'scontent.xx.fbcdn.net/profile/oldedublin.jpg',
    }]);
  });
});

test('does not treat a non-404 response for the existing avatar as proof that it is missing', async () => {
  const currentAvatar = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-current.webp';
  const candidateAvatar = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-candidate.webp';
  const sourceUrl = 'https://scontent.xx.fbcdn.net/profile/oldedublin-current.jpg';
  const sourceSignature = 'scontent.xx.fbcdn.net/profile/oldedublin-current.jpg';
  const venue = buildVenue(currentAvatar, sourceSignature);

  await withImageMocks(new Map([
    [currentAvatar, { status: 503 }],
    [candidateAvatar, { status: 200, contentType: 'image/webp' }],
  ]), async (_calls, updates) => {
    const resolved = await resolveCanonicalVenueIconForRegression({
      venue,
      row: buildRow(sourceUrl),
      incomingIcon: candidateAvatar,
      rowIndex: 0,
      parserMode: 'full5stage',
    });

    assert.equal(resolved, currentAvatar);
    assert.equal(venue.profileImage, currentAvatar);
    assert.deepEqual(updates, []);
  });
});

test('does not replace the current profile with an incoming GCS URL that returns 404', async () => {
  const currentAvatar = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-current-404.webp';
  const unavailableCandidate = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/oldedublin-candidate-404.webp';
  const venue = buildVenue(currentAvatar);

  await withImageMocks(new Map([
    [unavailableCandidate, { status: 404 }],
  ]), async (calls, updates) => {
    const resolved = await resolveCanonicalVenueIconForRegression({
      venue,
      row: buildRow('https://scontent.xx.fbcdn.net/profile/oldedublin-new.jpg'),
      incomingIcon: unavailableCandidate,
      rowIndex: 0,
      parserMode: 'legacy',
    });

    assert.equal(resolved, currentAvatar);
    assert.deepEqual(calls, [unavailableCandidate]);
    assert.deepEqual(updates, []);
  });
});

test('does not return a missing incoming icon when the venue has no profile image', async () => {
  const unavailableCandidate = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/missing-incoming-only.webp';
  const venue = buildVenue('');

  await withImageMocks(new Map([
    [unavailableCandidate, { status: 404 }],
  ]), async (_calls, updates) => {
    const resolved = await resolveCanonicalVenueIconForRegression({
      venue,
      row: buildRow('https://scontent.xx.fbcdn.net/profile/oldedublin-new.jpg'),
      incomingIcon: unavailableCandidate,
      rowIndex: 0,
      parserMode: 'full5stage',
    });

    assert.equal(resolved, undefined);
    assert.deepEqual(updates, []);
  });
});
