import assert from 'node:assert/strict';
import test from 'node:test';

import * as XLSX from 'xlsx';

import { parseXlsxFile } from './driveService.js';

type FacebookEventRowInput = {
  id?: string;
  name: string;
  description: string;
  locationName?: string;
  contextualLocationName?: string;
  organizerName?: string;
  latitude?: number;
  longitude?: number;
  countryCode?: string;
};

function buildFacebookEventsWorkbookBuffer(input: FacebookEventRowInput): Buffer {
  const headers = [
    'id',
    'name',
    'description',
    'location/name',
    'location/contextualName',
    'location/latitude',
    'location/longitude',
    'location/countryCode',
    'organizators/0/name',
    'organizedBy',
    'utcStartDate',
    'dateTimeSentence',
    'eventFrequency',
    'usersResponded',
    'url',
  ];
  const eventId = input.id || '981131691551659';
  const organizerName = input.organizerName || '';
  const rows = [
    headers,
    [
      eventId,
      input.name,
      input.description,
      input.locationName || 'Charlottetown, Prince Edward Island',
      input.contextualLocationName || 'Charlottetown, PE',
      input.latitude ?? 46.2382,
      input.longitude ?? -63.1311,
      input.countryCode || 'CA',
      organizerName,
      organizerName ? `Event by ${organizerName}` : '',
      '2099-05-29T23:00:00.000Z',
      'Friday, May 29, 2099 at 8:00 PM - 11:00 PM ADT',
      'WEEKLY',
      '1',
      `https://www.facebook.com/events/${eventId}/`,
    ],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

test('uses an explicit description location marker from a city-only Facebook Events row as the venue candidate', async () => {
  const { rows } = await parseXlsxFile(buildFacebookEventsWorkbookBuffer({
    name: 'Live music with Travis & Juline',
    organizerName: "Playmaker's Club",
    description: [
      'LIVE MUSIC AT PLAYMAKER’S CLUB',
      '',
      'This Friday AND next Friday from 8:00PM - 11:00PM, join us for a night of great music.',
      '',
      ' Kitchen open until 11:30PM',
      ' Playmaker’s Club',
    ].join('\n'),
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceScraperType, 'events');
  assert.equal(rows[0].userName, "Playmaker's Club");
  assert.equal(rows[0].facebookEventLocationName, "Playmaker's Club");
  assert.equal(rows[0].facebookEventLocationIsCityLevel, false);
  assert.equal(rows[0].facebookEventOrganizerName, "Playmaker's Club");
  assert.match(rows[0].text, /Location: Charlottetown, Prince Edward Island/);
});

test('keeps organizer-only city Facebook Events rows in city-level review', async () => {
  const { rows } = await parseXlsxFile(buildFacebookEventsWorkbookBuffer({
    id: '3801924110111428',
    name: 'Farm Day in the City',
    organizerName: 'Discover Charlottetown',
    description: 'Farm Day in the City returns with vendors and entertainment throughout downtown.',
    locationName: 'Charlottetown, Prince Edward Island',
    contextualLocationName: 'Charlottetown, PE',
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].userName, 'Charlottetown, PEI');
  assert.equal(rows[0].facebookEventLocationName, 'Charlottetown, PEI');
  assert.equal(rows[0].facebookEventLocationIsCityLevel, true);
  assert.equal(rows[0].facebookEventTitleSource, 'name');
  assert.equal(rows[0].facebookEventDateTimeSource, 'utcStartDate');
  assert.equal(rows[0].facebookEventLocationSource, 'location/name');
  assert.equal(rows[0].facebookEventOrganizerName, 'Discover Charlottetown');
});

test('preserves structured Facebook Event coordinates for jurisdiction checks', async () => {
  const { rows } = await parseXlsxFile(buildFacebookEventsWorkbookBuffer({
    name: 'Souris dans l\'herbe',
    organizerName: 'Musée des mômes',
    description: 'Atelier peinture en parent-enfant.',
    locationName: 'Musée des mômes',
    contextualLocationName: '',
    latitude: 48.387715750251,
    longitude: -4.4854892711642,
    countryCode: 'FR',
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].facebookEventLocationLatitude, 48.387715750251);
  assert.equal(rows[0].facebookEventLocationLongitude, -4.4854892711642);
  assert.equal(rows[0].facebookEventLocationCountryCode, 'FR');
});

test('distinguishes loose shared post text from structured Facebook Event name', async () => {
  const headers = [
    'id',
    'Sharedpost Text',
    'name',
    'description',
    'location/name',
    'organizators/0/name',
    'utcStartDate',
    'dateTimeSentence',
    'eventFrequency',
    'usersResponded',
    'url',
  ];
  const rows = [
    headers,
    [
      'event_123',
      'Loose reshared post copy',
      'Structured Event Name',
      'Festival details from the event page.',
      'Charlottetown, Prince Edward Island',
      'Discover Charlottetown',
      '2099-05-29T23:00:00.000Z',
      'Friday, May 29, 2099 at 8:00 PM - 11:00 PM ADT',
      'ONCE',
      '1',
      'https://www.facebook.com/events/event_123/',
    ],
  ];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  const parsed = await parseXlsxFile(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].sharedPostText, 'Loose reshared post copy');
  assert.equal(parsed.rows[0].facebookEventTitleSource, 'sharedpost_text');
});

test('uses a description venue ending in Landing instead of an organizer address', async () => {
  const { rows } = await parseXlsxFile(buildFacebookEventsWorkbookBuffer({
    id: '2002636110657952',
    name: 'Hospice PEI Hike + Bike',
    organizerName: 'Hospice PEI',
    locationName: '119 Water Street, Charlottetown, PE, Canada, Prince Edward Island C1A 1A8',
    contextualLocationName: '',
    description: [
      'Hospice PEI is thrilled to welcome you back to our in-person Hike & Bike on Saturday, June 6, 2026,',
      'at Confederation Landing in Charlottetown from 1:00-3:00 PM.',
      'Join us for an uplifting afternoon centered on movement, community, and connection.',
    ].join(' '),
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceScraperType, 'events');
  assert.equal(rows[0].userName, 'Confederation Landing');
  assert.equal(rows[0].facebookEventLocationName, 'Confederation Landing');
  assert.equal(rows[0].facebookEventLocationIsCityLevel, false);
  assert.equal(rows[0].facebookEventOrganizerName, 'Hospice PEI');
  assert.equal(rows[0].address, '');
  assert.match(rows[0].text, /Location: 119 Water Street/);
});
