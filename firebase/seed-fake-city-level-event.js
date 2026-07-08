/**
 * Seed synthetic city-level events for app testing, shaped exactly like
 * auto-published city-level events (coords, locationScope, mapMode 'area').
 *
 * Seeds three events:
 *  - two at the Charlottetown centroid (exercises the multi-event carousel)
 *  - one in Downtown Charlottetown (area scope)
 *
 * Usage:
 *   node seed-fake-city-level-event.js            # create/refresh the seeds
 *   node seed-fake-city-level-event.js --remove   # delete the seeds
 *
 * Delete the seeds (--remove) once app testing is done.
 */
const path = require('path');
const admin = require('firebase-admin');

const serviceAccount = require(path.join(__dirname, 'service-account.json'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const REMOVE = process.argv.includes('--remove');

const SEED_IDS = [
  'test_city_level_seed_charlottetown_1',
  'test_city_level_seed_charlottetown_2',
  'test_city_level_seed_downtown_1',
];

function localDate(offsetDays) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Halifax',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return formatter.format(date); // YYYY-MM-DD
}

async function main() {
  const db = admin.firestore();

  if (REMOVE) {
    for (const id of SEED_IDS) {
      await db.collection('events').doc(id).delete();
      console.log(`Deleted ${id}`);
    }
    return;
  }

  const { resolvePeiCentroid } = await import('../functions/lib/services/peiLocations.js');
  const charlottetown = resolvePeiCentroid({ locationCity: 'Charlottetown' });
  const downtown = resolvePeiCentroid({ locationLabel: 'Downtown Charlottetown' });
  if (!charlottetown || !downtown) {
    throw new Error('Centroid table missing Charlottetown/Downtown Charlottetown');
  }

  const today = localDate(0);
  const tomorrow = localDate(1);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const common = {
    sourceScraperType: 'events',
    isEvent: 'Yes',
    isFoodSpecial: 'No',
    eventType: 'community',
    category: 'Community',
    venueId: null,
    locationReviewStatus: 'approved',
    mapMode: 'area',
    source: 'city_level_seed_test',
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };

  const seeds = [
    {
      id: SEED_IDS[0],
      data: {
        ...common,
        uniqueId: `${SEED_IDS[0]}_city`,
        name: 'TEST — Charlottetown Street Festival',
        eventName: 'TEST — Charlottetown Street Festival',
        description: 'Seeded city-level test event. Safe to delete (seed-fake-city-level-event.js --remove).',
        establishment: charlottetown.label,
        venue: charlottetown.label,
        address: charlottetown.label,
        startDate: today,
        startTime: '12:00 PM',
        endDate: tomorrow,
        endTime: '10:00 PM',
        imageUrl: 'https://picsum.photos/seed/gathr-city-festival/1200/800',
        image: 'https://picsum.photos/seed/gathr-city-festival/1200/800',
        relevantImageUrl: 'https://picsum.photos/seed/gathr-city-festival/1200/800',
        mediaUrls: ['https://picsum.photos/seed/gathr-city-festival/1200/800'],
        latitude: charlottetown.latitude,
        longitude: charlottetown.longitude,
        locationScope: 'city',
        locationLabel: charlottetown.label,
        locationCity: charlottetown.city,
        locationProvince: 'PEI',
        locationPrecision: 'city_centroid',
        usersResponded: '42',
      },
    },
    {
      id: SEED_IDS[1],
      data: {
        ...common,
        uniqueId: `${SEED_IDS[1]}_city`,
        name: 'TEST — Farm Day in the City',
        eventName: 'TEST — Farm Day in the City',
        description: 'Second seeded city-level test event at the same centroid (multi-event carousel).',
        establishment: charlottetown.label,
        venue: charlottetown.label,
        address: charlottetown.label,
        startDate: today,
        startTime: '9:00 AM',
        endDate: today,
        endTime: '5:00 PM',
        imageUrl: 'https://picsum.photos/seed/gathr-farm-day/1200/800',
        image: 'https://picsum.photos/seed/gathr-farm-day/1200/800',
        relevantImageUrl: 'https://picsum.photos/seed/gathr-farm-day/1200/800',
        mediaUrls: ['https://picsum.photos/seed/gathr-farm-day/1200/800'],
        latitude: charlottetown.latitude,
        longitude: charlottetown.longitude,
        locationScope: 'city',
        locationLabel: charlottetown.label,
        locationCity: charlottetown.city,
        locationProvince: 'PEI',
        locationPrecision: 'city_centroid',
        usersResponded: '128',
      },
    },
    {
      id: SEED_IDS[2],
      data: {
        ...common,
        uniqueId: `${SEED_IDS[2]}_city`,
        name: 'TEST — Downtown Street Feast',
        eventName: 'TEST — Downtown Street Feast',
        description: 'Seeded area-scope test event (Downtown Charlottetown).',
        establishment: downtown.label,
        venue: downtown.label,
        address: downtown.label,
        startDate: today,
        startTime: '5:00 PM',
        endDate: today,
        endTime: '11:00 PM',
        imageUrl: 'https://picsum.photos/seed/gathr-street-feast/1200/800',
        image: 'https://picsum.photos/seed/gathr-street-feast/1200/800',
        relevantImageUrl: 'https://picsum.photos/seed/gathr-street-feast/1200/800',
        mediaUrls: ['https://picsum.photos/seed/gathr-street-feast/1200/800'],
        latitude: downtown.latitude,
        longitude: downtown.longitude,
        locationScope: 'area',
        locationLabel: downtown.label,
        locationCity: downtown.city,
        locationProvince: 'PEI',
        locationPrecision: 'approximate',
        usersResponded: '67',
      },
    },
  ];

  for (const seed of seeds) {
    await db.collection('events').doc(seed.id).set(seed.data, { merge: true });
    console.log(`Seeded ${seed.id}: ${seed.data.eventName} (${seed.data.startDate})`);
  }
  console.log('\nDone. Remove with: node seed-fake-city-level-event.js --remove');
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exitCode = 1;
});
