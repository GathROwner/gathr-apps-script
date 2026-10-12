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
    "path": "venues/slug_chambersrestaurant/events/fNQMBf8SmZpyFTVyWZcW",
    "action": "update",
    "expected": {
      "name": "Baked 5 Cheese Mac and Cheese with Caesar Salad",
      "uniqueId": "1126752633437556_2fd01e53c9e39e5f",
      "startDate": "2026-10-13",
      "startTime": "17:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "11:00",
      "endTime": "13:30",
      "timeFlags": {
        "start": {
          "source": "implied",
          "evidence": "Official Chambers lunch service Monday-Friday 11 AM-1:30 PM: https://www.roddvacations.com/rodd-charlottetown/dining/chambers-restaurant-bar"
        },
        "end": {
          "source": "implied",
          "toClose": false,
          "evidence": "Official lunch service ends 1:30 PM"
        }
      },
      "timeResolution": {
        "hoursUsed": true,
        "startFromHours": true
      }
    },
    "reason": "Lunch hours from current first-party dining page; preserve all four dated specials"
  },
  {
    "path": "venues/slug_chambersrestaurant/events/G4TX7ui4tdAmRJL0kIZY",
    "action": "update",
    "expected": {
      "name": "Swiss Steak with Garlic Mashed Potatoes and Fresh Mixed Vegetables",
      "uniqueId": "1126752633437556_f09bbb2cdc4bb3fe",
      "startDate": "2026-10-14",
      "startTime": "17:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "11:00",
      "endTime": "13:30",
      "timeFlags": {
        "start": {
          "source": "implied",
          "evidence": "Official Chambers lunch service Monday-Friday 11 AM-1:30 PM: https://www.roddvacations.com/rodd-charlottetown/dining/chambers-restaurant-bar"
        },
        "end": {
          "source": "implied",
          "toClose": false,
          "evidence": "Official lunch service ends 1:30 PM"
        }
      },
      "timeResolution": {
        "hoursUsed": true,
        "startFromHours": true
      }
    },
    "reason": "Lunch hours from current first-party dining page; preserve all four dated specials"
  },
  {
    "path": "venues/slug_chambersrestaurant/events/aR5TwlLPYwOsP8PBjNri",
    "action": "update",
    "expected": {
      "name": "Seafood Crepe and Garden Salad",
      "uniqueId": "1126752633437556_160894dfebd790a1",
      "startDate": "2026-10-15",
      "startTime": "17:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "11:00",
      "endTime": "13:30",
      "timeFlags": {
        "start": {
          "source": "implied",
          "evidence": "Official Chambers lunch service Monday-Friday 11 AM-1:30 PM: https://www.roddvacations.com/rodd-charlottetown/dining/chambers-restaurant-bar"
        },
        "end": {
          "source": "implied",
          "toClose": false,
          "evidence": "Official lunch service ends 1:30 PM"
        }
      },
      "timeResolution": {
        "hoursUsed": true,
        "startFromHours": true
      }
    },
    "reason": "Lunch hours from current first-party dining page; preserve all four dated specials"
  },
  {
    "path": "venues/slug_chambersrestaurant/events/1MAjyg2swS7g3jPZ3ebX",
    "action": "update",
    "expected": {
      "name": "Pork Schnitzel with Mushroom Sauce and Harvest Vegetables",
      "uniqueId": "1126752633437556_99e7837a8d389840",
      "startDate": "2026-10-16",
      "startTime": "17:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "11:00",
      "endTime": "13:30",
      "timeFlags": {
        "start": {
          "source": "implied",
          "evidence": "Official Chambers lunch service Monday-Friday 11 AM-1:30 PM: https://www.roddvacations.com/rodd-charlottetown/dining/chambers-restaurant-bar"
        },
        "end": {
          "source": "implied",
          "toClose": false,
          "evidence": "Official lunch service ends 1:30 PM"
        }
      },
      "timeResolution": {
        "hoursUsed": true,
        "startFromHours": true
      }
    },
    "reason": "Lunch hours from current first-party dining page; preserve all four dated specials"
  },
  {
    "path": "venues/slug_citycinemachtown/events/fdb8VaM7ZGSbChf3jtYI",
    "action": "update",
    "expected": {
      "name": "Back In Black",
      "uniqueId": "1645766067560308_e0d83a4cba279aae",
      "startDate": "2026-10-19",
      "startTime": "19:30",
      "category": "Cinema",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startDate": "2026-10-14",
      "endDate": "2026-10-14"
    },
    "reason": "Printed original film card date; retain clock, record ID, source and media"
  },
  {
    "path": "venues/slug_thetivolicinema/events/ML7bTSmmRtAAPZy24OeR",
    "action": "update",
    "expected": {
      "name": "Back In Black",
      "uniqueId": "1645766067560308_548c2f86257523a9",
      "startDate": "2026-10-18",
      "startTime": "19:30",
      "category": "Cinema",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startDate": "2026-10-14",
      "endDate": "2026-10-14"
    },
    "reason": "Printed original film card date; retain clock, record ID, source and media"
  },
  {
    "path": "venues/slug_citycinemachtown/events/ffHWF306JJWirP4DaFMH",
    "action": "update",
    "expected": {
      "name": "A Long Winter",
      "uniqueId": "1645766067560308_843226718973c8a0",
      "startDate": "2026-10-18",
      "startTime": "19:00",
      "category": "Cinema",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startDate": "2026-10-16",
      "endDate": "2026-10-16"
    },
    "reason": "Printed original film card date; retain clock, record ID, source and media"
  },
  {
    "path": "venues/nvQTJXSbDsSfJTCxDKCH/events/pgViRsWspKTtSODqvrN6",
    "action": "delete",
    "expected": {
      "name": "Knit and Crochet Socials",
      "uniqueId": "1927464192040916_84b9c5552c4f5cac",
      "startDate": "2026-10-14",
      "startTime": "01:30",
      "category": "Gatherings & Parties",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Hold genuine knit activity pending AM/PM confirmation; remove false 01:30 listing, retain full backup"
  },
  {
    "path": "venues/name_2lgcnn/events/Hzlbjr0vwVKvmfHlMK6C",
    "action": "update",
    "expected": {
      "name": "Coats for Kids Campaign",
      "uniqueId": "1558965776270954_fa91ced08e1da136",
      "startDate": "2026-10-13",
      "startTime": "08:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Gatherings & Parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "eventType": "gatherings_parties"
    },
    "reason": "Correct clothing donation activity category; existing venue-derived hours remain inferred"
  },
  {
    "path": "venues/1ehK5wrBKC460QSpqUMq/events/ihXEVvVDroR8rqQll94j",
    "action": "update",
    "expected": {
      "name": "Volunteer Help Moving Chairs and Tables",
      "uniqueId": "1744576431006432_3a2d0a7351c63a1e",
      "startDate": "2026-10-12",
      "startTime": "10:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "category": "Gatherings & Parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "eventType": "gatherings_parties",
      "endTime": "",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Monday morning at 10am"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Volunteer activity, incidental past turkey dinner; no printed end"
  },
  {
    "path": "venues/DqhaDw4xcuBFIm6WCQSq/events/sjLQqSYJhqiUigyxcla9",
    "action": "update",
    "expected": {
      "name": "Lunch with Nancy Taber & Katie Mac",
      "uniqueId": "959103219833242_51adad80492c654d",
      "startDate": "2026-10-16",
      "startTime": "19:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "name": "Book Launch with Nancy Taber and Katie Mac",
      "eventName": "Book Launch with Nancy Taber and Katie Mac",
      "description": "A double book launch and evening of fiction set on PEI featuring A Cove of Witches by Nancy Taber and Dunk River Murders by Katie Mac. Nancy Taber writes mysteries inspired by Prince Edward Island history and folklore, and is a Brock University professor and former Canadian military officer. Katie Mac writes noir, thrillers and westerns with love and comedy; she co-wrote the Bell Fibe TV1 show Currie and received an Island Literary Award. Free; all are welcome.",
      "category": "Gatherings & Parties",
      "isEvent": "Yes",
      "isFoodSpecial": "No",
      "eventType": "gatherings_parties"
    },
    "reason": "Correct old Lunch keeper using same publisher/author/date/start/venue; preserve record and time"
  },
  {
    "path": "venues/slug_bostonpizzacharlottetown/events/UGPSmkwEFYiZzQc7eLX2",
    "action": "update",
    "expected": {
      "name": "Appy Hour Menu and Drink Specials",
      "uniqueId": "1711681630965477_0bb3dc88964bcd99",
      "startDate": "2026-10-20",
      "startTime": "11:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {
      "startTime": "20:00",
      "timeFlags": {
        "start": {
          "source": "explicit",
          "evidence": "Trivia Tuesday at 8 PM; Appy Hour Menu and drink prices in the same dated block"
        },
        "end": {
          "source": "none",
          "toClose": false,
          "evidence": ""
        }
      }
    },
    "reason": "Tie offer to October 20 trivia block, retain current inferred closing end"
  },
  {
    "path": "venues/fb_100064116963888/events/HiLFpkYIw4nqzK2cpudo",
    "action": "delete",
    "expected": {
      "name": "Weekend Brunch",
      "uniqueId": "1562051112608773_1f5a5d84bd2ff29a",
      "startDate": "2026-10-11",
      "startTime": "11:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Remove expired October 11 wrongly priced brunch; genuine drink offers are not backfilled after expiry"
  },
  {
    "path": "venues/fb_100041851131270/events/XbLA2IHZ9j2P90c6zaeU",
    "action": "delete",
    "expected": {
      "name": "Hot Honey BBQ Teen Burger™",
      "uniqueId": "1922797609125258_255047fd64d8a893",
      "startDate": "2026-10-11",
      "startTime": "06:00",
      "category": "Food Special",
      "isRecurring": "No",
      "recurringPattern": "none"
    },
    "patch": {},
    "reason": "Remove ordinary limited-time product advertisement, not an advertised deal"
  }
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve('functions/artifacts/luna-oct12-repair');
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
    assert(snap.exists, `Missing target ${target.path}`);
    const data=snap.data();
    for (const [field,value] of Object.entries(target.expected)) assert.deepEqual(data[field],value, `${target.path}: ${field} drift`);
    captured.push({...target, data, updateTime:snap.updateTime.toDate().toISOString(),
      updateSeconds:snap.updateTime.seconds, updateNanos:snap.updateTime.nanoseconds,
      dataHash:hash(data), ref:snap.ref, snap});
  }
  const siblings=[];
  const roots=[...new Set(captured.map(x=>x.data.uniqueId.split('_')[0]))];
  for (const root of roots) {
    const q=await db.collectionGroup('events').where('uniqueId','>=',root+'_').where('uniqueId','<',root+'_\uf8ff').get();
    siblings.push({root, records:q.docs.map(x=>({path:x.ref.path, data:x.data()})).sort((a,b)=>a.path.localeCompare(b.path))});
  }
  const related=[];
  for (const venue of [...new Set(captured.map(x=>x.path.split('/events/')[0]))]) {
    const q=await db.collection(venue+'/events').get();
    related.push({venue, records:q.docs.filter(x=>captured.some(t=>t.path.startsWith(venue+'/')&&
      (t.data.startDate===x.data().startDate || t.patch?.startDate===x.data().startDate)))
      .map(x=>({path:x.ref.path,data:x.data()})).sort((a,b)=>a.path.localeCompare(b.path))});
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
      deletes:targets.filter(x=>x.action==='delete').length,targets:summary},null,2));
  } else {
    const approved=JSON.parse(await fs.readFile(path.resolve(planArg.slice(7)),'utf8'));
    assert.equal(approved.project,key.project_id);
    assert.deepEqual(approved.targets,summary,'Target/update-time drift since approval');
    assert.equal(approved.siblingHash,hash(siblings),'Source sibling drift since approval');
    assert.equal(approved.relatedHash,hash(related),'Related occurrence drift since approval');
    const batch=db.batch();
    for (const item of captured) {
      const guard={lastUpdateTime:item.snap.updateTime};
      if (item.action==='delete') batch.delete(item.ref,guard);
      else batch.update(item.ref,item.patch,guard);
    }
    await batch.commit();
    const verified=[];
    for (const item of captured) {
      const after=await item.ref.get();
      if (item.action==='delete') assert(!after.exists,`Delete failed ${item.path}`);
      else {assert(after.exists);for(const [k,v]of Object.entries(item.patch))assert.deepEqual(after.data()[k],v,`Update failed ${item.path}:${k}`);}
      verified.push({path:item.path,action:item.action,ok:true});
    }
    const resultPath=path.join(out,`live-result-${stamp}.json`);
    await fs.writeFile(resultPath,JSON.stringify({planPath:path.resolve(planArg.slice(7)),backupPath,verified},null,2));
    console.log(JSON.stringify({mode:'applied',resultPath,verified},null,2));
  }
} finally {await admin.app().delete();}
