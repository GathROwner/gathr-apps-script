import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const planArg = args.find(x => x.startsWith('--plan='));
assert(args.every(x => x === '--apply' || x.startsWith('--plan=')));
assert.equal(Boolean(planArg), apply, 'Dry run takes no arguments; apply needs --apply --plan=<approved plan>');
const targets = [
  {
    "path": "venues/slug_thetivolicinema/events/B0lJFx0bZMZBWrSWu95U",
    "action": "delete",
    "expected": {
      "name": "Screamplay! and Evil Dead II",
      "uniqueId": "122232429122578108_6c1a853b07993622",
      "startDate": "2026-10-19",
      "startTime": "21:10",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Remove composite Screamplay/Evil Dead listing; preserve existing correct screenings"
  },
  {
    "path": "venues/slug_thetivolicinema/events/NiPGGgJyAfDuvFMxWuVA",
    "action": "delete",
    "expected": {
      "name": "Screamplay! and Evil Dead II",
      "uniqueId": "122232429122578108_0a45505feb9890c8",
      "startDate": "2026-10-20",
      "startTime": "21:10",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Remove composite Screamplay/Evil Dead listing; preserve existing correct screenings"
  },
  {
    "path": "venues/slug_citycinemachtown/events/PARn8DD5TTQUgPqAgKjs",
    "action": "delete",
    "expected": {
      "name": "Back In Black",
      "uniqueId": "1645766067560308_5b66465e05a62805",
      "startDate": "2026-10-18",
      "startTime": "19:30",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Back in Black source card says Oct14, not this Oct18 duplicate; preserve Oct14 records pending time/QA review"
  },
  {
    "path": "venues/slug_thetivolicinema/events/e26D8wbYhP2Z27GVXSbA",
    "action": "delete",
    "expected": {
      "name": "A Long Winter",
      "uniqueId": "1645766067560308_f90276b72bd821ff",
      "startDate": "2026-10-16",
      "startTime": "19:00",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "A Long Winter card and current program name City Cinema, not Tivoli"
  },
  {
    "path": "venues/nvQTJXSbDsSfJTCxDKCH/events/OAIV0bPdyNQWoCodVhj6",
    "action": "delete",
    "expected": {
      "name": "Milton Community Hall event (title not visible)",
      "uniqueId": "2610539662812967_439f57410c899a3c",
      "startDate": "2026-11-13",
      "startTime": "19:00",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Cropped source has no readable activity identity; remove manufactured generic event"
  },
  {
    "path": "venues/nvQTJXSbDsSfJTCxDKCH/events/oKOqmdzrGjOJKk9dAXpN",
    "action": "delete",
    "expected": {
      "name": "Milton Community Hall event (title not visible)",
      "uniqueId": "2610539662812967_e3079a72e63da10e",
      "startDate": "2026-11-14",
      "startTime": "14:00",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Cropped source has no readable activity identity; remove manufactured generic event"
  },
  {
    "path": "venues/slug_citycinemachtown/events/ViG0wijW2HqYwhWYdATH",
    "action": "update",
    "expected": {
      "name": "In The Heart of The South",
      "uniqueId": "1645766067560308_0868ed78018e3b9d",
      "startDate": "2026-10-18",
      "startTime": "18:00",
      "recurringPattern": "none"
    },
    "patch": {
      "startDate": "2026-10-16",
      "endDate": "2026-10-16"
    },
    "reason": "Printed card and current official program agree Oct16 18:00"
  },
  {
    "path": "venues/slug_thetivolicinema/events/dz35gb3dc50NwIl9kuUo",
    "action": "update",
    "expected": {
      "name": "L'Autre (The Other)",
      "uniqueId": "1645766067560308_73e1ef9c2f67043a",
      "startDate": "2026-10-18",
      "startTime": "20:00",
      "recurringPattern": "none"
    },
    "patch": {
      "startDate": "2026-10-16",
      "endDate": "2026-10-16"
    },
    "reason": "Current official program and ticket agree Oct16 20:00; old card says Oct18"
  },
  {
    "path": "venues/slug_sobeyfamilytheatre/events/xNXoeY9sf8n3R7MZfC1s",
    "action": "update",
    "expected": {
      "name": "Violinist James Ernes: 50th Birthday Recital Tour",
      "uniqueId": "1562661692568029_1cf4a674bd1468ec",
      "startDate": "2026-10-13",
      "startTime": "19:30",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Live Music",
      "eventType": "live_music"
    },
    "reason": "Violin recital was correctly classified before cinema venue prior overwrote it"
  },
  {
    "path": "venues/slug_bellaliantcentre/events/akgpr4MJcK4dVN43obb1",
    "action": "update",
    "expected": {
      "name": "Leisure and Toddler Pools Open",
      "uniqueId": "1530908285723756_0c98d9ab48629258",
      "startDate": "2026-10-13",
      "startTime": "05:30",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Sports",
      "eventType": "sports"
    },
    "reason": "Public leisure/toddler pool access is a sports activity"
  },
  {
    "path": "venues/slug_bellaliantcentre/events/n03e77KuehV7mYNFOwfO",
    "action": "update",
    "expected": {
      "name": "Leisure and Toddler Pools Open",
      "uniqueId": "1530908285723756_80fb748e15577fc1",
      "startDate": "2026-10-13",
      "startTime": "20:00",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Sports",
      "eventType": "sports"
    },
    "reason": "Public leisure/toddler pool access is a sports activity"
  },
  {
    "path": "venues/slug_easternkingssportsplex/events/QIGk3HATuvKTvgOVlRWm",
    "action": "update",
    "expected": {
      "name": "Walking Track",
      "uniqueId": "1670545314532853_c144994024907250",
      "startDate": "2026-10-19",
      "startTime": "08:00",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Sports",
      "eventType": "sports",
      "isRecurring": "Yes",
      "recurringPattern": "weekly_custom",
      "recurringDaysOfWeek": [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday"
      ]
    },
    "reason": "Printed seasonal walking access is Mon-Fri08:00-15:00 fromOct19; no invented season end"
  },
  {
    "path": "venues/slug_trailsidemusichall/events/SB4isg36YH4uFsV1jJUq",
    "action": "update",
    "expected": {
      "name": "Jake Vaadeland and the Sturgeon River Boys",
      "uniqueId": "1556588789820786_4c03f7bb4da8dd67",
      "startDate": "2026-11-04",
      "startTime": "18:30",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "20:00",
      "ticketLink": "https://locarius.io/events/4908/jake-vaadeland-the-sturgeon-river-boys-november-4th-25-advance-30-day-of-show-doors-630-pm",
      "ticketsBuyUrl": "https://locarius.io/events/4908/jake-vaadeland-the-sturgeon-river-boys-november-4th-25-advance-30-day-of-show-doors-630-pm",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Linked performance timestamp Thu Nov 05 2026 00:00:10 GMT+0000 (Coordinated Universal Time); America/Halifax 2026-11-04 20:00; ticket event 4908"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description"
  },
  {
    "path": "venues/slug_trailsidemusichall/events/PnGBYC08PbZd1J0OS1Nz",
    "action": "update",
    "expected": {
      "name": "Life in the Fast Lane: A Night of the Eagles",
      "uniqueId": "1556527319826933_32719ab90b58fd03",
      "startDate": "2026-10-29",
      "startTime": "18:30",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "20:00",
      "ticketLink": "https://locarius.io/events/3328/life-in-the-fast-lane-a-night-of-the-eagles-oct-29th-55-doors-630-pm",
      "ticketsBuyUrl": "https://locarius.io/events/3328/life-in-the-fast-lane-a-night-of-the-eagles-oct-29th-55-doors-630-pm",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Linked performance timestamp Thu Oct 29 2026 23:00:56 GMT+0000 (Coordinated Universal Time); America/Halifax 2026-10-29 20:00; ticket event 3328"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description"
  },
  {
    "path": "venues/slug_trailsidemusichall/events/spQAzzFJu7YJ5KjagTLG",
    "action": "update",
    "expected": {
      "name": "Life in the Fast Lane: A Night of the Eagles",
      "uniqueId": "1556527319826933_db73f65dae0afc71",
      "startDate": "2026-10-30",
      "startTime": "18:30",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "20:00",
      "ticketLink": "https://locarius.io/events/3329/life-in-the-fast-lane-a-night-of-the-eagles-oct-30th-55-doors-630-pm",
      "ticketsBuyUrl": "https://locarius.io/events/3329/life-in-the-fast-lane-a-night-of-the-eagles-oct-30th-55-doors-630-pm",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Linked performance timestamp Fri Oct 30 2026 23:00:56 GMT+0000 (Coordinated Universal Time); America/Halifax 2026-10-30 20:00; ticket event 3329"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description"
  },
  {
    "path": "venues/slug_trailsidemusichall/events/zJx5OJ2vwHTYYgFsbOAZ",
    "action": "update",
    "expected": {
      "name": "Life in the Fast Lane: A Night of the Eagles",
      "uniqueId": "1556527319826933_98421574b96f3463",
      "startDate": "2026-10-31",
      "startTime": "18:30",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "20:00",
      "ticketLink": "https://locarius.io/events/3330/life-in-the-fast-lane-a-night-of-the-eagles-oct-31st-55-doors-630-pm",
      "ticketsBuyUrl": "https://locarius.io/events/3330/life-in-the-fast-lane-a-night-of-the-eagles-oct-31st-55-doors-630-pm",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Linked performance timestamp Sat Oct 31 2026 23:00:56 GMT+0000 (Coordinated Universal Time); America/Halifax 2026-10-31 20:00; ticket event 3330"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Exact source-linked ticket structured timestamp verifies20:00 local performance start; retain18:30 doors in description"
  },
  {
    "path": "venues/nvQTJXSbDsSfJTCxDKCH/events/0gGOviSZCv9OE2KhpL3Z",
    "action": "update",
    "expected": {
      "name": "Zumba Adult Fitness Class",
      "uniqueId": "1920077486112920_cc801cff1ebe3b18",
      "startDate": "2026-10-07",
      "startTime": "17:30",
      "recurringPattern": "weekly_wednesday"
    },
    "patch": {
      "startDate": "2026-10-21",
      "endDate": "2026-10-21",
      "totalOccurrences": 2,
      "recurrenceUntilDate": "2026-10-28"
    },
    "reason": "Separate source-confirmed Oct14 one-hour class; retain original17:30-19:30 for Oct21/28 only"
  },
  {
    "path": "venues/name_6387om/events/oct13_repair_watercolour_20261013",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1562661692568029_09e48f5dc04e063c",
      "establishment": "Blank Canvas Art Supplies",
      "locationScope": "venue",
      "locationLabel": "Blank Canvas Art Supplies",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Beginner WaterColour Course (Session 1)",
      "description": "Blank Canvas: Beginner WaterColour Course (Session 1)",
      "startDate": "2026-10-13",
      "endDate": "2026-10-13",
      "startTime": "18:30",
      "endTime": "20:30",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
      "mediaUrls": [],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls",
          "icon"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1791895966238-n8oj28.webp",
            "source": "profile_image",
            "field": "icon",
            "isPrimary": false,
            "isFallback": false
          }
        ],
        "selectionReason": "model_selected_analysis_frame_source",
        "updatedBy": "parser"
      },
      "facebookUrl": "https://www.facebook.com/DowntownCharlottetownInc",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T11:43:25.000Z",
      "venueId": "name_6387om",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Beginner WaterColour Course (Session 1)",
      "address": "125 Great George Street, Charlottetown, PE C1A 4K7, Canada",
      "rawAddress": "125 Great George Street, Charlottetown, PE C1A 4K7, Canada",
      "normalizedAddress": "125 Great George Street, Charlottetown, PE C1A 4K7, Canada",
      "addressSource": "google_places",
      "addressUpdatedAt": "2026-10-13T15:24:35.652Z",
      "isRecurring": "No",
      "recurringPattern": "none",
      "icon": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1769527843636.webp",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791895965814-5yhzrp.webp",
      "latitude": 46.235623499999996,
      "longitude": -63.1272816,
      "timeResolution": {
        "hoursUsed": true,
        "endFromHours": "duration_default"
      },
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "6:30 pm"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      },
      "_sourceType": "schedule",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Add only confirmed Oct13 watercolour Session1 at18:30; retain marked inferred20:30 end; do not invent later sessions"
  },
  {
    "path": "venues/nvQTJXSbDsSfJTCxDKCH/events/oct13_repair_zumba_20261014",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "2230951430970178_eda05ee73d34caaf",
      "establishment": "Milton Community Hall",
      "locationScope": "venue",
      "locationLabel": "Milton Community Hall",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "ZUMBA® adult fitness class with Natalia",
      "description": "A chance to burn off some of the Thanksgiving dinner & snacks! Next Class: 5:30 pm ~ Wednesday ~ 1 hour ~ October 14th. Come join us. Start anytime. Go at your own pace. $7.00 drop in fee each class.",
      "startDate": "2026-10-14",
      "endDate": "2026-10-14",
      "startTime": "17:30",
      "endTime": "18:30",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
      "mediaUrls": [],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls",
          "icon"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1791897192346-ku80no.webp",
            "source": "profile_image",
            "field": "icon",
            "isPrimary": false,
            "isFallback": false
          }
        ],
        "selectionReason": "model_selected_analysis_frame_source",
        "updatedBy": "parser"
      },
      "facebookUrl": "http://www.facebook.com/pages/Milton-Community-Hall/380730012010498",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-12T21:39:12.000Z",
      "venueId": "nvQTJXSbDsSfJTCxDKCH",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "ZUMBA® adult fitness class with Natalia",
      "address": "7 New Glasgow Rd #224, North Milton, PE C1E 0X5, Canada",
      "rawAddress": "7 New Glasgow Rd #224, North Milton, PE C1E 0X5, Canada",
      "normalizedAddress": "7 New Glasgow Rd #224, North Milton, PE C1E 0X5, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-13T15:24:35.760Z",
      "isRecurring": "No",
      "recurringPattern": "none",
      "icon": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1784559647004-pi5bsy.webp",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791897192057-101zor.webp",
      "latitude": 46.3233642,
      "longitude": -63.215244199999994,
      "timeResolution": {
        "hoursUsed": false,
        "reason": "source_duration"
      },
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "5:30 pm"
        },
        "end": {
          "source": "implied",
          "toClose": false,
          "evidence": "Source duration: 1 hour; 17:30 + 60 minutes = 18:30"
        }
      },
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Add only printed Oct14 Zumba17:30-18:30, one-off"
  }
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve('functions/artifacts/luna-oct13-repair');
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const keyPath = process.env.GATHR_SERVICE_ACCOUNT_PATH;
assert(keyPath, 'Set GATHR_SERVICE_ACCOUNT_PATH without copying the credential');
const key = JSON.parse(await fs.readFile(keyPath, 'utf8'));
assert.equal(key.project_id, 'gathr-migrated');
admin.initializeApp({credential:admin.credential.cert(key), projectId:key.project_id});
const db = admin.firestore();

try {
  const locks = await db.collection('processing_locks').get();
  assert(!locks.docs.some(x => !['completed','failed','cancelled'].includes(x.data().status)), 'An active parser prevents live repair');
  const captured=[];
  for (const target of targets) {
    const snap = await db.doc(target.path).get();
    if (target.action === 'create') assert(!snap.exists, `Create target exists ${target.path}`); else assert(snap.exists, `Missing target ${target.path}`);
    const data=snap.data() || null;
    for (const [field,value] of Object.entries(target.action === 'create' ? {} : target.expected)) assert.deepEqual(data[field],value, `${target.path}: ${field} drift`);
    captured.push({...target, data, updateTime:snap.updateTime?.toDate().toISOString() || null,
      updateSeconds:snap.updateTime?.seconds ?? null, updateNanos:snap.updateTime?.nanoseconds ?? null,
      dataHash:hash(data), ref:snap.ref, snap});
  }
  const siblings=[];
  const roots=[...new Set(captured.map(x=>String(x.data?.uniqueId || x.payload?.uniqueId || '').split('_')[0]))];
  for (const root of roots) {
    const q=await db.collectionGroup('events').where('uniqueId','>=',root+'_').where('uniqueId','<',root+'_\uf8ff').get();
    siblings.push({root, records:q.docs.map(x=>({path:x.ref.path, data:x.data()})).sort((a,b)=>a.path.localeCompare(b.path))});
  }
  const related=[];
  for (const venue of [...new Set(captured.map(x=>x.path.split('/events/')[0]))]) {
    const q=await db.collection(venue+'/events').get();
    related.push({venue, records:q.docs.filter(x=>captured.some(t=>t.path.startsWith(venue+'/')&&
      (t.data?.startDate===x.data().startDate || t.patch?.startDate===x.data().startDate)))
      .map(x=>({path:x.ref.path,data:x.data()})).sort((a,b)=>a.path.localeCompare(b.path))});
  }
  for (const target of captured.filter(x=>x.action==='create')) {
    const existing=await db.collection(target.path.split('/events/')[0]+'/events').where('uniqueId','==',target.payload.uniqueId).get();
    assert(existing.empty, 'Existing exact source occurrence prevents creation '+target.path);
    const relatedVenue=await db.collection(target.path.split('/events/')[0]+'/events').where('startDate','==',target.payload.startDate).get();
    assert(!relatedVenue.docs.some(x=>x.data().startTime===target.payload.startTime && /zumba|water.?colour.*course/i.test(String(x.data().name||''))), 'Equivalent dated activity already exists '+target.path);
  }
  const summary=captured.map(({data,ref,snap,...x})=>x);
  await fs.mkdir(out,{recursive:true});
  const backupPath=path.join(out,`live-backup-${stamp}.json`);
  await fs.writeFile(backupPath,JSON.stringify({project:key.project_id,createdAt:new Date().toISOString(),
    records:captured.map(({path,updateTime,updateSeconds,updateNanos,data})=>({path,updateTime,updateSeconds,updateNanos,data})),siblings,related},null,2));
  if (!apply) {
    const planPath=path.join(out,`live-plan-${stamp}.json`);
    await fs.writeFile(planPath,JSON.stringify({project:key.project_id,backupPath,targets:summary,
      siblingHash:hash(siblings),relatedHash:hash(related)},null,2));
    console.log(JSON.stringify({mode:'dry-run',planPath,backupPath,updates:targets.filter(x=>x.action==='update').length,
      deletes:targets.filter(x=>x.action==='delete').length,creates:targets.filter(x=>x.action==='create').length,targets:summary},null,2));
  } else {
    const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
    assert.equal(approved.project,key.project_id);
    assert.deepEqual(approved.targets,summary,'Target/update-time drift since approval');
    assert.equal(approved.siblingHash,hash(siblings),'Source sibling drift since approval');
    assert.equal(approved.relatedHash,hash(related),'Related occurrence drift since approval');
    const batch=db.batch();
    for (const item of captured) {
      const guard={lastUpdateTime:item.snap.updateTime};
      if (item.action==='create') batch.create(item.ref,{...item.payload,createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()});
      else if (item.action==='delete') batch.delete(item.ref,guard);
      else batch.update(item.ref,item.patch,guard);
    }
    await batch.commit();
    const verified=[];
    for (const item of captured) {
      const after=await item.ref.get();
      if (item.action==='delete') assert(!after.exists,`Delete failed ${item.path}`);
      else {assert(after.exists);for(const [k,v]of Object.entries(item.action==='create'?item.payload:item.patch))assert.deepEqual(after.data()[k],v,`Update failed ${item.path}:${k}`);}
      verified.push({path:item.path,action:item.action,ok:true});
    }
    const resultPath=path.join(out,`live-result-${stamp}.json`);
    await fs.writeFile(resultPath,JSON.stringify({planPath:path.resolve(planArg.slice(7)),backupPath,verified},null,2));
    console.log(JSON.stringify({mode:'applied',resultPath,verified},null,2));
  }
} finally {await admin.app().delete();}
