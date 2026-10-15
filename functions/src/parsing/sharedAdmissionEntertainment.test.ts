import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSharedAdmissionEntertainment, reconcileSourceItemEvidence} from './sourceItemEvidence.js';
import {shouldRefineUmbrellaThemeDatesForRegression} from './eventExtractor.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';

// Synthetic booking fixture; no production IDs, records or credentials.
const caption = `Small Business Big Party!
Bring your team on November 28th!
Enjoy a buffet dinner and live entertainment by Example Duo from 9:00 PM–12:30 AM.
Dinner & Entertainment:
$86.95 + tax per person
Overnight Package:
Package includes:
• Buffet dinner
• Live entertainment by Example Duo
• Overnight accommodation
• Buffet breakfast the next morning
Bookings: contact the venue`;
const item = (patch: Record<string,unknown> = {}): any => ({name:'Buffet dinner', date:'2026-11-28',
  description:'Enjoy buffet dinner and live entertainment.', startTime:'21:00', endTime:'00:30',
  price:'$86.95 + tax per person', pricing:'$86.95 + tax per person', relevantImageIndex:0,
  recurringPattern:'none', _sourceType:'special', _pipelineIndex:1, ...patch});

test('one shared-admission meal placeholder is bound to the named entertainment clock', () => {
  const [out] = bindSharedAdmissionEntertainment([item()], caption);
  assert.equal(out.name, 'Example Duo — Small Business Big Party');
  assert.equal(out._sourceTitleResolution, out.name); assert.equal(out._sourceType, 'event');
  assert.equal(out.startTime, '21:00'); assert.equal(out.endTime, '00:30');
  assert.equal(out.price, item().price); assert.equal(out._pipelineIndex, 1); assert.equal(out.relevantImageIndex, 0);
  assert(out.timeFlags); assert.match(out.timeFlags.start.evidence, /live entertainment by Example Duo/);
  assert.equal('pricing' in out, false);
  assert.match(out.description, /Dinner serving time is not supplied/);
  assert.deepEqual(bindSharedAdmissionEntertainment([out], caption), [out], 'idempotent');
});

test('package inclusion bullets and their plain-text equivalents never trigger theme-date remapping', () => {
  assert.equal(shouldRefineUmbrellaThemeDatesForRegression([item()], caption, true), false);
  assert.equal(shouldRefineUmbrellaThemeDatesForRegression([item()], caption.replace(/• /g,''), true), false);
});

test('real named theme blocks survive a following package-inclusion list', () => {
  const source = `Theme nights\nPrime Rib Feast November 14\nPasta Night November 21\nPackage includes:\n• Buffet dinner\n• Buffet breakfast`;
  assert.equal(shouldRefineUmbrellaThemeDatesForRegression([item({name:'Theme Nights',date:'2026-11-14'})], source, true), true);
});

test('independently timed meals and separately priced admissions retain their own identities', () => {
  const meal = item({startTime:'18:00',endTime:'20:00'});
  assert.deepEqual(bindSharedAdmissionEntertainment([meal], caption), [meal]);
  assert.deepEqual(bindSharedAdmissionEntertainment([item()], caption.replace('Dinner & Entertainment:', 'Dinner tickets:')), [item()]);
  const two = [item(), item({name:'Example Duo',_sourceType:'event'})];
  assert.deepEqual(bindSharedAdmissionEntertainment(two, caption), two);
  assert.deepEqual(bindSharedAdmissionEntertainment([item()], caption+'\nBuffet dinner is served at 9:00 PM.'), [item()]);
});

test('the full party title cannot silently claim the band clock as its overall start', () => {
  const [out] = bindSharedAdmissionEntertainment([item({name:'Small Business Big Party!'})], caption);
  assert.equal(out.name, 'Example Duo — Small Business Big Party');
  const earlier = item({name:'Small Business Big Party',startTime:'18:00'});
  assert.deepEqual(bindSharedAdmissionEntertainment([earlier], caption), [earlier]);
});

test('different dates, conflicting band ranges and an unnamed act cannot be silently repaired', () => {
  for (const source of [caption.replace('November 28th','November 29th'), caption+'\nAnother party December 5th',
    caption+'\nLive entertainment by Another Duo from 9:00 PM–12:30 AM.',
    caption.replace('live entertainment by Example Duo from','live entertainment from')]) {
    assert.deepEqual(bindSharedAdmissionEntertainment([item()], source), [item()]);
  }
});

test('source title proof survives time constraints and formatter metadata rehydration', () => {
  const [source] = constrainSourceTimes([item()], caption);
  assert.equal(source.name, 'Example Duo — Small Business Big Party');
  const out: any = rehydrateFormattedEventMetadata({name:'Buffet dinner',startDate:source.date,endDate:'2026-11-29',
    startTime:'21:00',endTime:'00:30',category:'Live Music',isEvent:'Yes',isFoodSpecial:'No'} as any, source);
  assert.equal(out.name, source.name); assert.equal(out.startTime, '21:00'); assert.equal(out.endTime,'00:30');
  assert.equal(reconcileSourceItemEvidence([source], caption).length, 1);
});
