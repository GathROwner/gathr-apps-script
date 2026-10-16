// Apply only four reviewed writer edits to each different immutable baseline.
// Refuse any unexpected source shape instead of copying the parser service.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(process.argv[2]);assert(/^C:\\Users\\craig\\\.codex\\worktrees\\festival-refresh-(?:parser|finalizer|shared)\\gathr-apps-script$/i.test(root));
const file=path.join(root,'functions/src/services/firestoreService.ts');let source=(await fs.readFile(file,'utf8')).replace(/\r\n/g,'\n');
const reviewed=(await fs.readFile(new URL('../functions/src/services/firestoreService.ts',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
assert(!source.includes("import {restoreFestivalAreaRefresh}"),'Overlay already applied');
const start=source.indexOf('async function writePublishedCityLevelEvent('),end=source.indexOf('async function refreshPublishedCityLevelEventFromReview',start);assert(start>=0&&end>start);
let body=source.slice(start,end);const reviewedStart=reviewed.indexOf('async function writePublishedCityLevelEvent('),reviewedBody=reviewed.slice(reviewedStart,reviewed.indexOf('async function refreshPublishedCityLevelEventFromReview',reviewedStart));
function once(text,old,replacement){assert.equal(text.split(old).length,2,'Unexpected serving writer shape');return text.replace(old,replacement);}
const oldStart='  manual = reviewedCityLevelManual(record, manual);\n  const areaData = manual.areaData || record.areaData;\n';
const freshStart=reviewedBody.slice(reviewedBody.indexOf('  manual = reviewedCityLevelManual(record, manual);'),reviewedBody.indexOf('  if (areaData) {'));
assert(freshStart.includes('restoreFestivalAreaRefresh')&&freshStart.includes('restoredMachineArea'));body=once(body,oldStart,freshStart);
body=once(body,'      refreshing: options.preserveCreatedAt,','      refreshing: options.preserveCreatedAt,\n      allowFestivalTitleAliases:restoredMachineArea,');
body=once(body,'  await eventRef.set(eventData, areaData ? {mergeFields: Object.keys(eventData)} : {merge: true});',"  if(areaData&&previous.exists){\n    // An overlapping machine publication or human edit must force re-evaluation.\n    await eventRef.update(eventData,{lastUpdateTime:previous.updateTime!});\n  }else await eventRef.set(eventData, areaData ? {mergeFields: Object.keys(eventData)} : {merge: true});");
source=source.slice(0,start)+body+source.slice(end);source=once(source,"import * as admin from 'firebase-admin';","import * as admin from 'firebase-admin';\nimport {restoreFestivalAreaRefresh} from './festivalAreaRefresh.js';");
await fs.writeFile(file,source);console.log(JSON.stringify({root,writerEdits:4,otherServiceFunctionsUnchanged:true,liveWrites:0}));
