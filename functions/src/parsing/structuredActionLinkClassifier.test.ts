import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyStructuredFacebookActionLink,
  isClearlyNonTicketOperationalUrl,
} from './structuredActionLinkClassifier.js';

test('classifies the Confederation Court mall-hours URL as event information', () => {
  const url = 'https://confedcourtmall.com/visit/mall-hours/';

  assert.equal(isClearlyNonTicketOperationalUrl(url), true);
  assert.deepEqual(classifyStructuredFacebookActionLink(url, ''), {
    url,
    role: 'event_info',
    label: 'Event Info',
    confidence: 0.99,
    source: 'facebook_events',
    evidence: 'operating-hours information URL',
  });
});

test('keeps known ticket providers and explicit ticket summaries transactional', () => {
  assert.equal(
    classifyStructuredFacebookActionLink(
      'https://www.eventbrite.ca/e/example-event-tickets-123',
      ''
    )?.role,
    'ticket_purchase'
  );

  assert.equal(
    classifyStructuredFacebookActionLink(
      'https://confederationcentre.com/event/come-from-away/',
      'Buy Tickets | From $55'
    )?.role,
    'ticket_purchase'
  );
});

test('classifies unproven event pages as information instead of tickets', () => {
  const result = classifyStructuredFacebookActionLink(
    'https://example.com/events/community-day',
    ''
  );

  assert.equal(result?.role, 'event_info');
  assert.equal(result?.label, 'Event Info');
});

