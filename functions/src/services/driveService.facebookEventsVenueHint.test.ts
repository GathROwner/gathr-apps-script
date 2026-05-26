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
};

function buildFacebookEventsWorkbookBuffer(input: FacebookEventRowInput): Buffer {
  const headers = [
    'id',
    'name',
    'description',
    'location/name',
    'location/contextualName',
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
  assert.equal(rows[0].facebookEventOrganizerName, 'Discover Charlottetown');
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
