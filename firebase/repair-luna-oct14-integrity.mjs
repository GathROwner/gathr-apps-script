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
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/Bc249Rqr374nSPC5ndZs",
    "action": "delete",
    "expected": {
      "name": "Male U9 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_a0c32f37e9b75a0a",
      "startDate": "2026-10-16",
      "startTime": "09:20",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/leUhUmHcEuM48hg8PUhf",
    "action": "delete",
    "expected": {
      "name": "Male U9 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_806f3056f76c2fcb",
      "startDate": "2026-10-23",
      "startTime": "09:00",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/v1dfWxtnoLnvI0Ruhhcs",
    "action": "delete",
    "expected": {
      "name": "Male U11 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_e9130b2ae91598d6",
      "startDate": "2026-10-17",
      "startTime": "11:40",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/5FTkut3T5d5KCclsuQtL",
    "action": "delete",
    "expected": {
      "name": "Male U11 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_601f7c5063efbb97",
      "startDate": "2026-10-24",
      "startTime": "04:00",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/O7vemBuoK4VtmSaDOj5i",
    "action": "delete",
    "expected": {
      "name": "Male U13 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_f47fc39a1f0117a6",
      "startDate": "2026-10-16",
      "startTime": "05:40",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/ItWg0uH2yXtETbhlepAJ/events/qsbHiAurDCbdCPAeRzIj",
    "action": "delete",
    "expected": {
      "name": "Male U13 A/Rec Conditioning Session",
      "uniqueId": "1744646754332812_b4f1c2b2fdba84a8",
      "startDate": "2026-10-23",
      "startTime": "05:10",
      "category": "Sports",
      "recurringPattern": "none"
    },
    "reason": "Source prints October10–14, not these manufactured October16–24 sessions; meridiem is unverified."
  },
  {
    "path": "venues/slug_thetivolicinema/events/kcj1QvFVL5I78GNtZSF6",
    "action": "delete",
    "expected": {
      "name": "ANCHOR Fest Jim Queen",
      "uniqueId": "1563713265796205_9137b0570994411a",
      "startDate": "2026-10-15",
      "startTime": "21:00",
      "category": "Cinema",
      "recurringPattern": "none"
    },
    "reason": "Downtown Jim Queen 21:00 conflicts with cinema-owner 21:30; preserve NJzspju9NlqTrmGPEumW."
  },
  {
    "path": "venues/slug_citycinemachtown/events/bi8tjyu0PjfessyR0eGi",
    "action": "delete",
    "expected": {
      "name": "Anchor Fest Opening Night Film, Back in Black",
      "uniqueId": "1563713265796205_94559fcb41a2f55f",
      "startDate": "2026-10-14",
      "startTime": "19:00",
      "category": "Cinema",
      "recurringPattern": "none"
    },
    "reason": "Exact October14 19:00 Back in Black aggregator duplicate; preserve 9hRzOvheJh5llYmNNDdt and hold the separate 19:30 source conflict."
  },
  {
    "path": "venues/KeaYNQ0m7AfE583KyS5R/events/KONZP3s2tJNWCQRKvrB9",
    "action": "update",
    "expected": {
      "name": "Roots & Shoots Summerside",
      "uniqueId": "1535288085304229_4df687ea78102612",
      "startDate": "2026-10-20",
      "startTime": "18:00",
      "category": "Food Special",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Gatherings & Parties",
      "eventType": "gatherings_parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No"
    },
    "reason": "Peer-support activity with incidental pizza; poster confirms existing October20 18–20 date/time."
  },
  {
    "path": "venues/slug_sobeyfamilytheatre/events/LLfTk1jgPz6tavQqfqlO",
    "action": "update",
    "expected": {
      "name": "Lorena McKennitt, The Mask and the Mirror 30th Anniversary Tour",
      "uniqueId": "1563713265796205_97b84ce05bfdbd40",
      "startDate": "2026-10-15",
      "startTime": "19:30",
      "category": "Cinema",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Live Music",
      "eventType": "live_music"
    },
    "reason": "Anniversary concert tour at theatre is live music, not cinema."
  },
  {
    "path": "venues/fb_100057766283684/events/d4G5oioihLF6AgHz5Q0L",
    "action": "update",
    "expected": {
      "name": "Island Jazz ft. Nadine Haddad",
      "uniqueId": "1667441038524756_758abd74f0e5cc2e",
      "startDate": "2026-10-15",
      "startTime": "20:00",
      "category": "Live Music",
      "recurringPattern": "weekly_thursday"
    },
    "patch": {
      "isRecurring": "No",
      "recurringPattern": "none",
      "endDate": "2026-10-15",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls",
          "icon"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791981624439-a2crlg.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1770832250396.webp",
            "source": "profile_image",
            "field": "icon",
            "isPrimary": false,
            "isFallback": false
          }
        ],
        "selectionReason": "model_selected_analysis_frame_source",
        "updatedBy": "parser"
      }
    },
    "reason": "Named Nadine guest is one October15 show; restore visually verified first-party source poster and retain the existing venue icon."
  },
  {
    "path": "venues/slug_tipsyfarmers/events/mh2kHTJ20kdp5SannxDp",
    "action": "update",
    "expected": {
      "name": "Soup of the Day",
      "uniqueId": "1138481235375575_0e5014994196e1fe",
      "startDate": "2026-10-14",
      "startTime": "10:00",
      "category": "Food Special",
      "recurringPattern": "none"
    },
    "patch": {
      "endTime": "20:00",
      "timeFlags": {
        "start": {
          "source": "semantic",
          "evidence": "Start from venue hours (opens 10:00)"
        },
        "end": {
          "source": "explicit",
          "toClose": true,
          "evidence": "Wednesday source: Open till 8pm"
        }
      },
      "timeResolution": {
        "hoursUsed": true,
        "startFromHours": true,
        "endFromHours": "to_close"
      }
    },
    "reason": "Today soup feature cannot continue beyond printed 20:00 close."
  },
  {
    "path": "venues/BKaKU7O4J56sipdJRrHM/events/oct14_repair_jazzish_november2026",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1738309221631333_66e9ab02a555da02",
      "establishment": "Harmony House",
      "locationScope": "venue",
      "locationLabel": "Harmony House",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "live_music",
      "eventName": "Jazz-ish with Carlie Howell & Friends",
      "description": "Carlie Howell and surprise guests offer an eclectic night of jazz, improvisation, and whatever else comes out of their creativity. The first person to clearly say “Jazz-ish” four times fast at the mic wins a $25 Harmony House gift card. Pub menu available.",
      "startDate": "2026-11-04",
      "endDate": "2026-11-04",
      "startTime": "19:00",
      "endTime": "21:00",
      "price": "Pay what you can at the door",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls",
          "icon"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1788014329480-ygm6jy.webp",
            "source": "profile_image",
            "field": "icon",
            "isPrimary": false,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/harmonyhousepei",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T22:10:33.000Z",
      "venueId": "BKaKU7O4J56sipdJRrHM",
      "category": "Live Music",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Jazz-ish with Carlie Howell & Friends",
      "address": "19814 PE-2, Hunter River, PE C0A 1N0, Canada",
      "rawAddress": "19814 PE-2, Hunter River, PE C0A 1N0, Canada",
      "normalizedAddress": "19814 PE-2, Hunter River, PE C0A 1N0, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:12:06.835Z",
      "ticketPrice": "Pay what you can at the door",
      "isRecurring": true,
      "recurringPattern": "weekly_wednesday",
      "totalOccurrences": 4,
      "recurrenceUntilDate": "2026-11-25",
      "icon": "https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1788014329480-ygm6jy.webp",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791990726270-j08fyy.webp",
      "latitude": 46.3561049,
      "longitude": -63.3513969,
      "timeResolution": {
        "hoursUsed": false,
        "endFromHours": "duration_default"
      },
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "7:00 PM"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      },
      "_sourceType": "schedule",
      "sourceOccurrenceCount": 4,
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Restore all four printed Wednesday shows November4/11/18/25 19:00 as one bounded parent; mark21:00 end inferred, preserve poster."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261016_1",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_ddbd3b23328f5afb",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "gatherings_parties",
      "eventName": "Murder Mystery Night (in French)",
      "description": "Le Salon du livre de l'Î.-P.-É. invites guests to a special art gallery event: solve a murder mystery and unmask the culprit before it is too late. A buffet-style meal will be served, including soup, vegetable platters, cheese plates, and mini quiches. A short character description and details will be sent after registration. For individuals 18 years of age and older. Register by October 11; limit of 20 people.",
      "startDate": "2026-10-16",
      "endDate": "2026-10-16",
      "startTime": "18:00",
      "endTime": "21:00",
      "price": "$25",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Gatherings & Parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Murder Mystery Night (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.346Z",
      "ticketPrice": "$25",
      "ticketLink": "https://www.belle-alliance.ca/event-details/soiree-meurtre-mystere",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/soiree-meurtre-mystere",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-16T21:00:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261017_2",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_41fae6a4aca9ddc1",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "live_music",
      "eventName": "Michel Robichaud in Concert! (in French)",
      "description": "Performance featuring Québec singer-songwriter Michel Robichaud, winner of the Festival international de la chanson de Granby. He will perform songs from his third album, Rallumer l'effort. Each ticket includes 6 chicken wings.",
      "startDate": "2026-10-17",
      "endDate": "2026-10-17",
      "startTime": "17:00",
      "endTime": "19:30",
      "price": "Adult $30; student (up to 18 years old) $15",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Live Music",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Michel Robichaud in Concert! (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.421Z",
      "ticketPrice": "Adult $30; student (up to 18 years old) $15",
      "ticketLink": "https://www.belle-alliance.ca/event-details/michel-robichaud-en-spectacle",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/michel-robichaud-en-spectacle",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-17T19:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261019_3",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_00db043594dce5c4",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Wood Painting Workshop (in French)",
      "description": "With Lynn Gaudet. Learn to paint, harmonize colors, and add dimension to wooden pieces to create decorative objects. Payment is required to reserve a spot. Register by October 13; minimum of 10 participants required.",
      "startDate": "2026-10-19",
      "endDate": "2026-10-19",
      "startTime": "18:30",
      "endTime": "21:00",
      "price": "$25",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Wood Painting Workshop (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.484Z",
      "ticketPrice": "$25",
      "ticketLink": "https://www.belle-alliance.ca/event-details/atelier-de-peinture-sur-bois-avec-lynn-gaudet",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/atelier-de-peinture-sur-bois-avec-lynn-gaudet",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-19T21:00:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261020_4",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_228407826fa8d43d",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Charcuterie Board (in French)",
      "description": "Janine Arsenault from Magasin Acadien Inc. will teach participants how to make an impressive charcuterie board and share ideas and tools for creating a tasty board. Childcare services are available. Register by October 16; limit of 20 people.",
      "startDate": "2026-10-20",
      "endDate": "2026-10-20",
      "startTime": "18:30",
      "endTime": "20:30",
      "price": "Free",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Charcuterie Board (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.538Z",
      "ticketPrice": "Free",
      "ticketLink": "https://www.belle-alliance.ca/event-details/planche-de-charcuteries-2",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/planche-de-charcuteries-2",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-20T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261021_5",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_7530adf460d8e70a",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Encaustic Art Workshop (in French)",
      "description": "With Angèle Arsenault. Discover encaustic painting using hot wax to create beautiful textures and effects. Payment is required to confirm registration. Register by October 16; minimum of 10 and maximum of 15 people.",
      "startDate": "2026-10-21",
      "endDate": "2026-10-21",
      "startTime": "18:30",
      "endTime": "20:30",
      "price": "$30",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Encaustic Art Workshop (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.594Z",
      "ticketPrice": "$30",
      "ticketLink": "https://www.belle-alliance.ca/event-details/atelier-dencaustique-avec-angele-arsenault-1",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/atelier-dencaustique-avec-angele-arsenault-1",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-21T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261024_6",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_1ea0279119671ffc",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "live_music",
      "eventName": "Baie in Concert! (in French)",
      "description": "Performance featuring Acadian francophone pop group BAIE. The quartet will showcase songs from their album La tête a ses raisons, blending pop, folk, and funk. Tickets available at belle-alliance.ca.",
      "startDate": "2026-10-24",
      "endDate": "2026-10-24",
      "startTime": "18:30",
      "endTime": "20:30",
      "price": "Adult $25; student (up to 18 years old) $10",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Live Music",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Baie in Concert! (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.662Z",
      "ticketPrice": "Adult $25; student (up to 18 years old) $10",
      "ticketLink": "https://www.belle-alliance.ca/event-details/baie-en-spectacle",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/baie-en-spectacle",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-24T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261026_7",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_d20ec8afa3adc313",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Stained Glass Workshop (in French)",
      "description": "With Yvette Arsenault. Learn how to shape glass to create a beautiful autumn-themed decorative piece. Part 2 is on October 29 at 6:30 p.m. Payment is required to reserve a spot. Register by October 21; limit of 6 people.",
      "startDate": "2026-10-26",
      "endDate": "2026-10-26",
      "startTime": "18:30",
      "endTime": "20:30",
      "price": "$30",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Stained Glass Workshop (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.722Z",
      "ticketPrice": "$30",
      "ticketLink": "https://www.belle-alliance.ca/event-details/atelier-de-vitrail",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/atelier-de-vitrail",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-26T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261027_8",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_753373ac98b411f9",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Cooking Workshop & Tasting with Chef Robert Pendergast (in French)",
      "description": "A cooking workshop featuring pumpkin and squash with Chef Robert Pendergast. Participants will make Pumpkin Cheesecake; Squash and Root Vegetable Pancakes with Smoked Salmon Cream; and Roasted Pumpkin with Mushroom Confit. Recipes will be provided. Register by October 23; limit of 16 people.",
      "startDate": "2026-10-27",
      "endDate": "2026-10-27",
      "startTime": "18:30",
      "endTime": "20:30",
      "price": "$25 per person",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Cooking Workshop & Tasting with Chef Robert Pendergast (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.812Z",
      "ticketPrice": "$25 per person",
      "ticketLink": "https://www.belle-alliance.ca/event-details/atelier-de-cuisine-et-degustation-avec-chef-robert-pendergast",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/atelier-de-cuisine-et-degustation-avec-chef-robert-pendergast",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-27T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261028_9",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_130e1e0a79505d47",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Little Chefs and Pumpkins (in French)",
      "description": "In partnership with CAP enfants, through the Petite enfance en santé program. The activity includes a spaghetti supper, a cookie and pumpkin-decorating workshop, and animation by Éliane Lebel. Register by October 23; maximum of 30 children ages 0 to 6.",
      "startDate": "2026-10-28",
      "endDate": "2026-10-28",
      "startTime": "17:00",
      "endTime": "20:00",
      "price": "Free",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Little Chefs and Pumpkins (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.868Z",
      "ticketPrice": "Free",
      "ticketLink": "https://www.belle-alliance.ca/event-details/de-petits-chefs-et-des-citrouilles",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/de-petits-chefs-et-des-citrouilles",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-28T20:00:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 80,
      "familyFriendlyLevel": "high",
      "familyFriendlyReasons": [
        "child_age_range"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261029_10",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_06b1b2c1c6d789b4",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Stained Glass Workshop (Part 2)",
      "description": "This session is reserved for participants who attended the October 26 workshop so they can complete their project. The first session is titled Stained Glass Workshop (in French) and is also listed at Centre Belle-Alliance.",
      "startDate": "2026-10-29",
      "endDate": "2026-10-29",
      "startTime": "18:30",
      "endTime": "20:30",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Stained Glass Workshop (Part 2)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:41.942Z",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false,
        "endFromHours": "duration_default"
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261030_11",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_8691a8da0974791b",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "gatherings_parties",
      "eventName": "Halloween Costume Parade",
      "description": "Young and old are invited to come trick-or-treat in the corridors of Centre Belle-Alliance between 9 a.m. and 12 p.m.",
      "startDate": "2026-10-30",
      "endDate": "2026-10-30",
      "startTime": "09:00",
      "endTime": "12:00",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Gatherings & Parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Halloween Costume Parade",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:42.005Z",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 60,
      "familyFriendlyLevel": "likely",
      "familyFriendlyReasons": [
        "family_activity"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/slug_centrebellealliance/events/oct14_repair_festival_20261030_12",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_91d7b9b481f07e51",
      "establishment": "Centre Belle-Alliance",
      "locationScope": "venue",
      "locationLabel": "Centre Belle-Alliance",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "live_music",
      "eventName": "Anniversary Gala — Cap Rouge, Louise, Jonathan & Shane Arsenault, Patricia and Marcella Richard, Riel and Rémi Arsenault",
      "description": "Celebrate the 20th anniversary of the Summerside Pumpkin Festival with a three-course meal: squash soup with apple crumble for dessert, with roast chicken, island vegetables, and mashed potatoes. Musical entertainment features Cap Rouge, Louise, Jonathan & Shane Arsenault, and Patricia and Marcella Richard, accompanied by Riel and Rémi Arsenault. Register by October 27.",
      "startDate": "2026-10-30",
      "endDate": "2026-10-30",
      "startTime": "17:30",
      "endTime": "20:30",
      "price": "$35 per person",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "slug_centrebellealliance",
      "category": "Live Music",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Anniversary Gala — Cap Rouge, Louise, Jonathan & Shane Arsenault, Patricia and Marcella Richard, Riel and Rémi Arsenault",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:42.078Z",
      "ticketPrice": "$35 per person",
      "ticketLink": "https://www.belle-alliance.ca/event-details/gala-danniversaire",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/gala-danniversaire",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.4182401,
      "longitude": -63.80905070000001,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-30T20:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 15,
      "familyFriendlyLevel": "unlikely",
      "familyFriendlyReasons": [
        "insufficient_family_evidence"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  },
  {
    "path": "venues/2ei5OViB21wZRLJsXH1Z/events/oct14_repair_festival_20261031_13",
    "action": "create",
    "expected": {
      "absent": true
    },
    "payload": {
      "uniqueId": "1539985468169427_0ab6aa7e5a53fe3d",
      "establishment": "Bibliothèque publique J.-Henri-Blanchard",
      "locationScope": "venue",
      "locationLabel": "Bibliothèque publique J.-Henri-Blanchard",
      "locationPrecision": "exact",
      "locationReviewStatus": "not_needed",
      "eventType": "workshops_classes",
      "eventName": "Storytime – Même pas peur ! (in French)",
      "description": "Come and listen to captivating stories. After storytime, get creative with fun crafts, followed by a light snack to wrap up the activity. Parents must accompany their children. Registration at www.belle-alliance.ca.",
      "startDate": "2026-10-31",
      "endDate": "2026-10-31",
      "startTime": "10:00",
      "endTime": "12:30",
      "price": "Free",
      "imageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "mediaUrls": [
        "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp"
      ],
      "imageProvenance": {
        "version": 1,
        "primarySource": "post_media",
        "primaryField": "relevantImageUrl",
        "primaryUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
        "isFallback": false,
        "sourceFields": [
          "relevantImageUrl",
          "mediaUrls"
        ],
        "media": [
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "relevantImageUrl",
            "isPrimary": true,
            "isFallback": false
          },
          {
            "url": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
            "source": "post_media",
            "field": "mediaUrls",
            "isPrimary": true,
            "isFallback": false
          }
        ],
        "selectionReason": "full_parser_event_media",
        "updatedBy": "row_processor_full5stage"
      },
      "facebookUrl": "https://www.facebook.com/Carrefourdelislesaintjean/",
      "sourceScraperType": "posts",
      "sourceTimestamp": "2026-10-13T23:20:09.000Z",
      "venueId": "2ei5OViB21wZRLJsXH1Z",
      "category": "Workshops & Classes",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "name": "Storytime – Même pas peur ! (in French)",
      "address": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "rawAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "normalizedAddress": "5 Maris Stella Ave, Summerside, PE C1N 6M9, Canada",
      "addressSource": "venue",
      "addressUpdatedAt": "2026-10-14T15:30:42.133Z",
      "ticketPrice": "Free",
      "ticketLink": "https://www.belle-alliance.ca/event-details/heure-du-conte-meme-pas-peur-1",
      "ticketsBuyUrl": "https://www.belle-alliance.ca/event-details/heure-du-conte-meme-pas-peur-1",
      "isRecurring": "No",
      "recurringPattern": "none",
      "image": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "relevantImageUrl": "https://storage.googleapis.com/gathr-uploaded-images/postimages/1791991612821-bg5i8c.webp",
      "latitude": 46.418743,
      "longitude": -63.810939,
      "timeResolution": {
        "hoursUsed": false
      },
      "timeFlags": {
        "end": {
          "source": "explicit",
          "toClose": false,
          "evidence": "Matching organizer event page: 2026-10-31T12:30:00-03:00"
        }
      },
      "_sourceType": "calendar",
      "familyFriendlyScore": 60,
      "familyFriendlyLevel": "likely",
      "familyFriendlyReasons": [
        "family_activity"
      ],
      "familyFriendlyScoringVersion": "family-friendly-v4"
    },
    "reason": "Recover only source-verified public activity from original program; matching official event-page clock/link where available."
  }
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve('functions/artifacts/luna-oct14-repair');
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
      (t.data?.startDate===x.data().startDate || t.patch?.startDate===x.data().startDate || t.payload?.startDate===x.data().startDate)))
      .map(x=>({path:x.ref.path,data:x.data()})).sort((a,b)=>a.path.localeCompare(b.path))});
  }
  for (const target of captured.filter(x=>x.action==='create')) {
    const existing=await db.collection(target.path.split('/events/')[0]+'/events').where('uniqueId','==',target.payload.uniqueId).get();
    assert(existing.empty, 'Existing exact source occurrence prevents creation '+target.path);
    const relatedVenue=await db.collection(target.path.split('/events/')[0]+'/events').where('startDate','==',target.payload.startDate).get();
    assert(!relatedVenue.docs.some(x=>x.data().startTime===target.payload.startTime && String(x.data().name||'').toLowerCase()===String(target.payload.name||'').toLowerCase()), 'Equivalent dated activity already exists '+target.path);
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
      else batch.update(item.ref,{...item.patch,updatedAt:admin.firestore.FieldValue.serverTimestamp()},guard);
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
