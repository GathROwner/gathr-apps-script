import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './__fixtures__/oct12-integrity.json';
import {constrainSourceTimes, hasUnresolvedSourceMeridiem} from './sourceTimeConstraints.js';
import {rehydrateFormattedEventMetadata} from './finalFormatter.js';
import {enforceDateTimeCompleteness} from './postParser.js';

const row: any = fixture.rows.find(r => r.row === 289)!;
const day = () => structuredClone(row.stage3.slice(4, 7));

test('Milton range resolves only with its same-day chronological calendar anchors', () => {
  const resolved = constrainSourceTimes(day(), row.caption)[1];
  assert.equal(resolved.startTime, '13:30');
  assert.equal(resolved.endTime, '15:30');
  assert.equal(resolved._sourceTimeConstraint, undefined);
  assert.equal(resolved.timeFlags?.start.source, 'implied');
  assert.equal(resolved.timeFlags?.end.source, 'implied');
  assert.match(resolved.timeFlags!.start.evidence, /9 a\.m\..*5:30 p\.m\./);
  assert.equal(hasUnresolvedSourceMeridiem(resolved), false);
  assert.deepEqual(constrainSourceTimes([resolved], ''), [resolved], 'resolution is idempotent');
});

test('isolated, cross-day, cross-image and non-calendar clocks remain held', () => {
  const cases = [day().slice(1, 2), day().slice(0, 2), day().slice(1),
    day().map((x: any, i: number) => ({...x, date: i === 1 ? x.date : '2026-10-15'})),
    day().map((x: any, i: number) => ({...x, relevantImageIndex: i === 1 ? 0 : 1})),
    day().map((x: any) => ({...x, relevantImageIndex: undefined})),
    day().map((x: any) => ({...x, _sourceType: 'event'}))];
  for (const items of cases) {
    const output = constrainSourceTimes(items, '');
    const target = output.find(x => x.name === 'Knit and Crochet Socials')!;
    assert.equal(target._sourceTimeConstraint?.reason, 'unresolved_meridiem');
    assert.equal(target.startTime, '1:30');
  }
});

test('non-monotonic, inferred and inconsistent anchors cannot resolve a range', () => {
  for (const update of [
    (items: any[]) => {items[0].startTime = '9 p.m.';},
    (items: any[]) => {items[0].timeFlags = {start:{source:'implied',evidence:'venue hours'}};},
    (items: any[]) => {items[2].startTime = '2 p.m.';},
    (items: any[]) => {items[1].endTime = '';},
  ]) {
    const items = day(); update(items);
    assert.equal(constrainSourceTimes(items, '')[1]._sourceTimeConstraint?.reason, 'unresolved_meridiem');
  }
});

test('explicit AM, PM and 24-hour source clocks are never reinterpreted', () => {
  for (const [startTime, endTime] of [['1:30 a.m.','3:30 a.m.'],['1:30 p.m.','3:30 p.m.'],['13:30','15:30']]) {
    const items = day(); Object.assign(items[1], {startTime,endTime});
    const output = constrainSourceTimes(items, '')[1];
    assert.equal(output.startTime, startTime); assert.equal(output.endTime, endTime);
    assert.equal(output._sourceMeridiemResolution, undefined);
  }
});

test('resolved source range survives a formatter that returns the former overnight clock', () => {
  const source = constrainSourceTimes(day(), '')[1];
  const formatted = rehydrateFormattedEventMetadata({...row.events[5],startTime:'01:30',endTime:'03:30'},source);
  assert.equal(formatted.startTime,'13:30'); assert.equal(formatted.endTime,'15:30');
  assert.equal(formatted.startDate,'2026-10-14'); assert.equal(formatted.endDate,'2026-10-14');
  assert.equal(formatted.timeFlags?.start.source,'implied');
  assert.equal(enforceDateTimeCompleteness([formatted],row.timestamp,'America/Halifax').length,1);
});

test('complete October 12 captured cohort changes only the corroborated Milton range', () => {
  const changed: string[] = [];
  for (const row of fixture.rows) {
    const resolved = constrainSourceTimes(row.stage3 as any, row.caption);
    resolved.forEach((item, i) => {
      if ((item.startTime || '') !== (row.stage3[i].startTime || '') || (item.endTime || '') !== (row.stage3[i].endTime || ''))
        changed.push(`${row.row}:${item.name}`);
    });
  }
  assert.deepEqual(changed,['289:Knit and Crochet Socials']);
});
