const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(process.cwd(), 'service-account.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const apply = process.argv.includes('--apply');
const DELETE = '__DELETE__';
const SERVER_TIMESTAMP = '__SERVER_TIMESTAMP__';

const FIXES = [
  {
    path: 'venues/slug_grecopizzasherwood/events/nQ5UrdxSHhMUP9kSokv4',
    reason: 'Limited-time food special should recur daily through May 16, not sit in a dirty recurring=Yes/pattern=none state.',
    updates: {
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-05-16',
      endDate: '2026-03-25',
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      totalOccurrences: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_thetivolicinema/events/r3rEqFJVPZUmSUCxtf6Y',
    reason: 'Film run is a finite daily series through April 2; keep the base doc occurrence-local and align the showtime to 7:15PM.',
    updates: {
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-04-02',
      endDate: '2026-03-27',
      startTime: '19:15',
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063650288456/events/JdLZbkKW2GP4qUQJIj4F',
    reason: 'Holman offer applies Thursday through Sunday; store that as a weekly_custom rule and keep the base doc on a single occurrence day.',
    updates: {
      isRecurring: true,
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['thursday', 'friday', 'saturday', 'sunday'],
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: 1,
      recurrenceUntilDate: '2026-05-03',
      endDate: '2026-03-20',
      totalOccurrences: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100052606604879/events/roEmaPV7ltflrSoMLdsZ',
    reason: 'Friday challenge is a weekly Friday series through April 24; collapse the base doc endDate and add the missing lifecycle bound.',
    updates: {
      isRecurring: true,
      recurringPattern: 'weekly_friday',
      recurrenceUntilDate: '2026-04-24',
      endDate: '2026-03-27',
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      totalOccurrences: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/0F6W6IBgJqlKQ8AmaTGC/events/UyWNHU2A4KPSxSyX7Eeh',
    reason: 'Tai Chi should keep a single-occurrence base endDate so raw consumers do not treat the series as active on non-Saturdays.',
    updates: {
      endDate: '2026-03-21',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063454005090/events/RVTSRImCctbyI4OwRQ1h',
    reason: 'Cork & Cast promo runs daily from March 31 to April 4, not weekly on Tuesdays only.',
    updates: {
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-04-04',
      endDate: '2026-03-31',
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      totalOccurrences: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063680527429/events/JNbYjBxoxBCpdZbdcChG',
    reason: 'March 17 take-home dinner special is a one-off past item, not an open-ended weekly Tuesday series.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-17',
      startTime: DELETE,
      endTime: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063680527429/events/SFdZN9Xbh1rKxv5zc7jf',
    reason: 'March 31 take-home dinner special is a one-off past item, not an open-ended weekly Tuesday series.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-31',
      startTime: DELETE,
      endTime: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_tipsyfarmers/events/OFdqHMqGkm5PVN3a3WQ5',
    reason: 'Margarita Wayne listing is a one-off March 31 show from 5-7pm.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-31',
      endTime: '19:00',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_albertandcrownpub/events/Ktunu0Dyn3Fho23G11N3',
    reason: 'Monthly feature poster says 8-11 PM; keep the stored occurrence local instead of ending at 1 AM the next day.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-26',
      endTime: '23:00',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_theglasspalette.pei/events/OCJgV9rFbVx8Chv8f8Sm',
    reason: 'March Break Art Camp runs daily March 16-20 from 9:00am-12:00pm; store a single-occurrence base endDate and correct end time.',
    updates: {
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-03-20',
      endDate: '2026-03-16',
      endTime: '12:00',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_theglasspalette.pei/events/erdivPV1TzvGHleiie3k',
    reason: 'Duplicate March Break Art Camp record needs the same time and base-date correction.',
    updates: {
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-03-20',
      endDate: '2026-03-16',
      endTime: '12:00',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100052099464909/events/gfcQreEmge6r1UpbSf4B',
    reason: 'Wellness Wallets is a one-off March 18 class from 4-5pm, not a daily recurring series.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-18',
      startTime: '16:00',
      endTime: '17:00',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_thecorkandcast/events/IlX9o8oMOz19y7iGmLaS',
    reason: 'Weekend brunch live music is Saturdays from 9am-12pm.',
    updates: {
      isRecurring: true,
      recurringPattern: 'weekly_saturday',
      endTime: '12:00',
      endDate: '2026-03-07',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/slug_eptek.centre/events/33n64XyQYAvXbM7vlqiU',
    reason: 'Eptek Group 1 is Sundays from 12:30pm-1:45pm through June 14; correct the times and keep the base doc occurrence-local.',
    updates: {
      isRecurring: true,
      recurringPattern: 'weekly_sunday',
      recurrenceUntilDate: '2026-06-14',
      startTime: '12:30',
      endTime: '13:45',
      endDate: '2026-04-26',
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063680527429/events/H4L2C0Tt1pAVyLJWhcxK',
    reason: 'March 18 lunch special is a one-off past item; clear the bogus overnight window and recurrence.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-18',
      startTime: DELETE,
      endTime: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063680527429/events/femUvI1sdKglYCyQ3mh2',
    reason: 'March 19 lunch special is a one-off past item; clear the bogus overnight window and recurrence.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-19',
      startTime: DELETE,
      endTime: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
  {
    path: 'venues/fb_100063680527429/events/GRFzED88XOxBtMjo9OwP',
    reason: 'March 20 lunch special is a one-off past item; clear the bogus overnight window and recurrence.',
    updates: {
      isRecurring: false,
      recurringPattern: 'none',
      recurrenceUntilDate: DELETE,
      totalOccurrences: DELETE,
      recurringDaysOfWeek: DELETE,
      recurringWeekdaySequence: DELETE,
      recurringWeekInterval: DELETE,
      endDate: '2026-03-20',
      startTime: DELETE,
      endTime: DELETE,
      updatedAt: SERVER_TIMESTAMP,
    },
  },
];

function serializeForPlan(updates) {
  return { ...updates };
}

function materializeUpdates(updates) {
  const materialized = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === DELETE) {
      materialized[key] = FieldValue.delete();
      continue;
    }
    if (value === SERVER_TIMESTAMP) {
      materialized[key] = FieldValue.serverTimestamp();
      continue;
    }
    materialized[key] = value;
  }
  return materialized;
}

async function main() {
  const planPath = path.join(process.cwd(), `tmp_recurrence_integrity_fix_plan_${timestamp}.json`);
  const backupPath = path.join(process.cwd(), `tmp_recurrence_integrity_fix_backup_${timestamp}.json`);

  const backups = [];
  for (const fix of FIXES) {
    const snap = await db.doc(fix.path).get();
    backups.push({
      path: fix.path,
      exists: snap.exists,
      before: snap.exists ? snap.data() : null,
      reason: fix.reason,
      updates: serializeForPlan(fix.updates),
    });
  }

  fs.writeFileSync(
    planPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apply,
        count: FIXES.length,
        fixes: FIXES.map((fix) => ({
          path: fix.path,
          reason: fix.reason,
          updates: serializeForPlan(fix.updates),
        })),
      },
      null,
      2
    )
  );
  fs.writeFileSync(backupPath, JSON.stringify(backups, null, 2));

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', planPath, backupPath, count: FIXES.length }, null, 2));
    return;
  }

  for (const fix of FIXES) {
    await db.doc(fix.path).set(materializeUpdates(fix.updates), { merge: true });
  }

  console.log(JSON.stringify({ mode: 'apply', planPath, backupPath, count: FIXES.length }, null, 2));
}

main()
  .then(async () => {
    await admin.app().delete();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await admin.app().delete();
    } catch {}
    process.exit(1);
  });
