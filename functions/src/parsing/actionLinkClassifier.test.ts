import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyActionLinkPage } from './actionLinkClassifier.js';

test('classifies the HPI two-week racing page as a schedule, not ticket sales', () => {
  const result = classifyActionLinkPage(
    'https://hpibet.com/Racing/Schedule',
    '<html><head><title>HPIbet.com - Two Week Schedule</title></head><body><h1>Racing Schedule</h1><a href="/Racing/Schedule?date=next">Next Week</a></body></html>'
  );

  assert.equal(result.role, 'schedule');
  assert.equal(result.label, 'View Schedule');
  assert.equal(result.url, 'https://hpibet.com/Racing/Schedule');
});

test('extracts the actual Come From Away ticket transaction destination', () => {
  const result = classifyActionLinkPage(
    'https://confederationcentre.com/event/come-from-away/',
    '<html><head><title>Come From Away</title></head><body><a href="https://tickets.confederationcentre.com/ccoa/website/EventDetails.aspx?EventID=128001">Buy Tickets</a></body></html>'
  );

  assert.equal(result.role, 'ticket_purchase');
  assert.equal(result.label, 'Buy Tickets');
  assert.equal(
    result.url,
    'https://tickets.confederationcentre.com/ccoa/website/EventDetails.aspx?EventID=128001'
  );
});

test('recognizes Eastlink purchase links without treating the information page as the sale URL', () => {
  const result = classifyActionLinkPage(
    'https://eastlinkcentrepei.com/event/sample-show/',
    '<html><head><title>Sample Show</title></head><body><a href="https://purchase.eastlinkcentrepei.com/Events">Get Tickets</a></body></html>'
  );

  assert.equal(result.role, 'ticket_purchase');
  assert.equal(result.url, 'https://purchase.eastlinkcentrepei.com/Events');
});

