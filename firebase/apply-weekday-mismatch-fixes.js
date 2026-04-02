const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const apply = process.argv.includes('--apply');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const WEEKDAY_FIXES = {
  'venues/fb_100063772711403/events/CryMKXskU8oMIavwnEdt': {
    action: 'update_weekdays',
    weekdays: ['wednesday', 'thursday'],
    reason: 'Description says Wednesday & Thursday lunch feature.',
  },
  'venues/fb_100063772711403/events/KNZVc6CePHVw8TY0hd22': {
    action: 'update_weekdays',
    weekdays: ['wednesday', 'thursday'],
    reason: 'Description says Wednesday & Thursday wings special.',
  },
  'venues/fb_100063772711403/events/PMiUfIDMfVYPeel5o8gt': {
    action: 'update_weekdays',
    weekdays: ['wednesday', 'thursday'],
    reason: 'Description says Wednesday & Thursday fish & chips special.',
  },
  'venues/fb_100063772711403/events/hHHZQoy0QmcqIze6ssgk': {
    action: 'update_weekdays',
    weekdays: ['wednesday', 'thursday'],
    reason: 'Description says Wednesday & Thursday station burger special.',
  },
  'venues/slug_albertandcrownpub/events/U1EIx9HpmcQGEbeKuprJ': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday'],
    reason: 'Description says Thursday-Saturday pizza & wing special.',
  },
  'venues/slug_albertandcrownpub/events/fhWAOcsZNtHKvacWoFGN': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday'],
    reason: 'Description says Thursday-Saturday pizza & wing special.',
  },
  'venues/slug_albertandcrownpub/events/hOx9AbwXJih38cm0nbQd': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday'],
    reason: 'Description says Thursday-Saturday pizza & wing special.',
  },
  'venues/slug_albertandcrownpub/events/iAFjv9op52rmLxN0tHVm': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday'],
    reason: 'Description says Thursday-Saturday pizza & wing special.',
  },
  'venues/AsuIaNEYUMsjDBTWGPP2/events/t3QZjQ9rxkphegpvepOF': {
    action: 'update_weekdays',
    weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    reason: 'Description enumerates Monday-Friday lunch menu.',
  },
  'venues/fb_100063454005090/events/7fx7DJLcv6v1oQz9YBMo': {
    action: 'update_weekdays',
    weekdays: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    reason: 'Description says Tuesday-Saturday happy hour.',
  },
  'venues/fb_100063454005090/events/D55TBcTaYu3sZw3yBPFP': {
    action: 'update_weekdays',
    weekdays: ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
    reason: 'Description says Tuesday-Saturday happy hour.',
  },
  'venues/slug_loneoakbrewpub/events/Yug3tzovJ4MV6LjwtU59': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says weekend brunch Saturday and Sunday.',
  },
  'venues/slug_foundersfoodhall/events/OBkQPV6RA0h3PJuZkKZM': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday'],
    reason: 'Description says Thursday-Saturday winter music block.',
  },
  'venues/fb_100063672783570/events/1Ab9Tcwj0biPbO8urGgB': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says every Saturday & Sunday brunch mimosa special.',
  },
  'venues/slug_thecorkandcast/events/HG4Obn3IRUWENeW3K3OM': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says every Saturday & Sunday brunch mimosa special.',
  },
  'venues/slug_watersedgerestaurantpei/events/cpxNCTD7qCLyeivLHOQi': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says every Saturday & Sunday mimosa combo special.',
  },
  'venues/slug_watersedgerestaurantpei/events/hrl9iFXGxGDip9MJtFzv': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says every Saturday & Sunday mimosa special.',
  },
  'venues/RJ9iYyEWcYUr91hcGSeL/events/HT4pp9zdsIUSM370rW28': {
    action: 'update_weekdays',
    weekdays: ['saturday', 'sunday'],
    reason: 'Description says Saturday & Sunday daily special.',
  },
  'venues/slug_loyalistcountryinn/events/fX9gQPD3LXE0yByeJQhx': {
    action: 'update_weekdays',
    weekdays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    reason: 'Description says Sunday-Thursday stay offer.',
  },
  'venues/slug_thecorkandcast/events/qj2EVJitr1bMhtjwHBBc': {
    action: 'update_weekdays',
    weekdays: ['thursday', 'friday', 'saturday', 'sunday'],
    reason: 'Description says Thursday-Sunday stay offer; proactive fix for endpoint-range parsing.',
  },
  'venues/fb_100063650288456/events/CB1z2y61vdjTAxvqQWjG': {
    action: 'delete_doc',
    reason: 'Stale duplicate of corrected weekly_custom stay offer.',
  },
};

function normalizePattern(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/, '');
}

function normalizeIsoDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString().slice(0, 10)
      : null;
  }
  if (typeof value?._seconds === 'number') {
    const date = new Date(value._seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  return null;
}

function buildRecurringPayload(weekdays) {
  const normalizedWeekdays = Array.from(
    new Set(
      (Array.isArray(weekdays) ? weekdays : [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (normalizedWeekdays.length < 2) {
    throw new Error(
      `Expected at least 2 weekdays for weekly_custom fix, got: ${JSON.stringify(weekdays)}`
    );
  }

  return {
    isRecurring: true,
    recurringPattern: 'weekly_custom',
    recurringDaysOfWeek: normalizedWeekdays,
    recurringWeekdaySequence: FieldValue.delete(),
    recurringWeekInterval: 1,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  const plan = [];
  const backup = [];

  for (const [docPath, fix] of Object.entries(WEEKDAY_FIXES)) {
    const ref = db.doc(docPath);
    const snap = await ref.get();

    if (!snap.exists) {
      plan.push({
        path: docPath,
        action: 'skip_missing',
        reason: fix.reason,
      });
      continue;
    }

    const data = snap.data() || {};
    const currentDays = Array.isArray(data.recurringDaysOfWeek) ? data.recurringDaysOfWeek : [];
    const entry = {
      path: docPath,
      venuePath: docPath.split('/').slice(0, 2).join('/'),
      eventName: data.eventName || data.name || data.title || '',
      currentPattern: normalizePattern(data.recurringPattern),
      currentDays,
      currentStartDate: normalizeIsoDate(data.startDate),
      currentEndDate: normalizeIsoDate(data.endDate),
      currentStartTime: data.startTime || '',
      currentEndTime: data.endTime || '',
      action: fix.action,
      reason: fix.reason,
    };

    if (fix.action === 'delete_doc') {
      entry.delete = true;
      backup.push({ path: docPath, data });
      plan.push(entry);
      continue;
    }

    const expectedDays = fix.weekdays;
    const alreadyCorrect =
      entry.currentPattern === 'weekly_custom' &&
      currentDays.length === expectedDays.length &&
      expectedDays.every((day) => currentDays.includes(day));

    entry.expectedPattern = 'weekly_custom';
    entry.expectedDays = expectedDays;

    if (alreadyCorrect) {
      entry.action = 'skip_already_correct';
      plan.push(entry);
      continue;
    }

    backup.push({ path: docPath, data });
    plan.push(entry);
  }

  const actionable = plan.filter(
    (entry) => entry.action === 'update_weekdays' || entry.action === 'delete_doc'
  );
  const planOut = path.join(process.cwd(), `tmp_weekday_fix_plan_${timestamp}.json`);
  const backupOut = path.join(process.cwd(), `tmp_weekday_fix_backup_${timestamp}.json`);

  fs.writeFileSync(
    planOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply,
        summary: {
          totalTargets: Object.keys(WEEKDAY_FIXES).length,
          actionable: actionable.length,
          updates: plan.filter((entry) => entry.action === 'update_weekdays').length,
          deletes: plan.filter((entry) => entry.action === 'delete_doc').length,
          alreadyCorrect: plan.filter((entry) => entry.action === 'skip_already_correct').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
        },
        plan,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    backupOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply,
        count: backup.length,
        docs: backup,
      },
      null,
      2
    )
  );

  if (apply && actionable.length > 0) {
    let batch = db.batch();
    let writesInBatch = 0;

    for (const entry of actionable) {
      const ref = db.doc(entry.path);
      if (entry.action === 'delete_doc') {
        batch.delete(ref);
      } else if (entry.action === 'update_weekdays') {
        batch.update(ref, buildRecurringPayload(entry.expectedDays));
      }
      writesInBatch += 1;

      if (writesInBatch === 400) {
        await batch.commit();
        batch = db.batch();
        writesInBatch = 0;
      }
    }

    if (writesInBatch > 0) {
      await batch.commit();
    }
  }

  console.log(
    JSON.stringify(
      {
        apply,
        planOut,
        backupOut,
        summary: {
          totalTargets: Object.keys(WEEKDAY_FIXES).length,
          actionable: actionable.length,
          updates: plan.filter((entry) => entry.action === 'update_weekdays').length,
          deletes: plan.filter((entry) => entry.action === 'delete_doc').length,
          alreadyCorrect: plan.filter((entry) => entry.action === 'skip_already_correct').length,
          missing: plan.filter((entry) => entry.action === 'skip_missing').length,
        },
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
