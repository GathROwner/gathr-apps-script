const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getLifecycle,
  getNextOccurrence,
  isOccurrenceWithinLifecycle,
  resolveRecurringRule,
  selectBestExplicitTimeRange,
  shouldFlagSuspiciousLongDuration,
} = require('./tmp_recurrence_integrity_scan.js');

test('bounded weekday recurrence stops on the recurrenceUntilDate boundary', () => {
  const data = {
    startDate: '2026-04-27',
    recurringPattern: 'weekly_custom',
    recurringDaysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    recurrenceUntilDate: '2026-05-08',
  };

  const recurringRule = resolveRecurringRule(data);
  const lifecycle = getLifecycle(data);

  assert.equal(getNextOccurrence('2026-04-27', recurringRule, '2026-05-02', lifecycle), '2026-05-04');
  assert.equal(isOccurrenceWithinLifecycle('2026-04-27', recurringRule, '2026-05-08', lifecycle), true);
  assert.equal(isOccurrenceWithinLifecycle('2026-04-27', recurringRule, '2026-05-11', lifecycle), false);
  assert.equal(getNextOccurrence('2026-04-27', recurringRule, '2026-05-09', lifecycle), null);
});

test('explicit bounded gallery open hours do not flag as suspicious long duration', () => {
  const text =
    '"The Time Of Our Lives", NEW show now open featuring the artworks by the PEI Seniors College. ' +
    'Please drop in Thursday evening at 7 PM for the opening reception or drop in Monday - Friday from 9-5.';
  const data = {
    startDate: '2026-04-27',
    recurringPattern: 'weekly_custom',
    recurringDaysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    recurrenceUntilDate: '2026-05-08',
  };

  const recurringRule = resolveRecurringRule(data);
  const lifecycle = getLifecycle(data);
  const explicitTimeRange = selectBestExplicitTimeRange(text, '09:00', '17:00');

  assert.equal(
    shouldFlagSuspiciousLongDuration({
      title: `"The Time Of Our Lives" (PEI Seniors' College) Group Art Show and Sale`,
      text,
      category: 'Gatherings & Parties',
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 8 * 60,
      explicitTimeRange,
      recurringRule,
      lifecycle,
    }),
    false
  );
});

test('real long recurring classes still flag as suspicious long duration', () => {
  const text = 'Kids art class runs Monday - Friday from 9am to 5pm for registered students.';
  const data = {
    startDate: '2026-04-27',
    recurringPattern: 'weekly_custom',
    recurringDaysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    recurrenceUntilDate: '2026-05-08',
  };

  const recurringRule = resolveRecurringRule(data);
  const lifecycle = getLifecycle(data);
  const explicitTimeRange = selectBestExplicitTimeRange(text, '09:00', '17:00');

  assert.equal(
    shouldFlagSuspiciousLongDuration({
      title: 'Kids Art Class',
      text,
      category: 'Workshops & Classes',
      startTime: '09:00',
      endTime: '17:00',
      durationMinutes: 8 * 60,
      explicitTimeRange,
      recurringRule,
      lifecycle,
    }),
    true
  );
});
