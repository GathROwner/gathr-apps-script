import fs from 'node:fs/promises';
const out='artifacts/be-you-oct14';
const capture=JSON.parse(await fs.readFile(`${out}/capture.json`,'utf8'));
const history=JSON.parse(await fs.readFile(`${out}/history.json`,'utf8'));
const timestamp=value=>value?._seconds?new Date(value._seconds*1000).toISOString():value;
const ids=['PBW360WVRvt9ijTQs9fS','Uo0EN3ofQfIFbxcYRYwy','NJ5X8fPIVOy405M9sfFS','mB37Tk3gVTT0zvlkXiPg','skLvOjG88fMQAxcjUAU0'];
const summary={capturedAt:capture.capturedAt,events:capture.events.filter(x=>ids.includes(x.path.split('/').at(-1))).map(x=>({path:x.path,updateTime:x.updateTime,...Object.fromEntries(['uniqueId','eventName','description','category','startDate','endDate','startTime','endTime','recurringPattern','recurringDaysOfWeek','recurringWeekInterval','totalOccurrences','recurrenceUntilDate','facebookUrl','mediaUrls','imageProvenance','timeFlags','timeResolution'].map(k=>[k,x.data[k]])),sourceTimestamp:timestamp(x.data.sourceTimestamp),createdAt:timestamp(x.data.createdAt)})),
 snapshots:history.snapshots.map(x=>({path:x.path,source:x.data.uniqueId,fileId:x.data.fileId,inputText:x.data.inputText,rowMeta:x.data.rowMeta,events:x.data.stages?.find(s=>s.stage==='format')?.output?.events})),
 audits:history.audits.filter(x=>ids.includes(x.data.eventId)).map(x=>({path:x.path,eventId:x.data.eventId,source:x.data.uniqueId,sourceDate:x.data.row?.timestamp,sourceUrl:x.data.row?.topLevelUrl,fields:x.data.changedFields,beforeMedia:x.data.before?.mediaUrlCount,afterMedia:x.data.after?.mediaUrlCount,incomingDescription:x.data.incoming?.description,text:x.data.row?.textPreview})),
 latestDatasets:[...capture.processed].sort((a,b)=>b.data.processedAt._seconds-a.data.processedAt._seconds).slice(0,3)};
await fs.writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2));
for(const item of summary.events){const url=item.imageProvenance?.primaryUrl || item.mediaUrls?.[0];if(!url)continue;const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(r.ok)await fs.writeFile(`${out}/${item.path.split('/').at(-1)}.webp`,Buffer.from(await r.arrayBuffer()));}
const baselineFile=summary.latestDatasets[0].data.fileId;
const baseline={dataset:summary.latestDatasets[0],locks:capture.locks.filter(x=>x.path.includes(baselineFile)),batches:capture.batches.filter(x=>x.path.includes(baselineFile)),checkpoints:capture.checkpoints.filter(x=>x.path.includes(baselineFile)),activeLocks:capture.locks.filter(x=>['processing','running','active'].includes(x.data.status))};
await fs.writeFile(`${out}/regular-run-baseline.json`,JSON.stringify(baseline,null,2));
console.log(JSON.stringify({events:summary.events.map(x=>({path:x.path,sourceDate:x.sourceTimestamp,createdAt:x.createdAt,mediaCount:x.mediaUrls?.length})),baselineFile,locks:baseline.locks.map(x=>({path:x.path,status:x.data.status})),batches:baseline.batches.map(x=>({path:x.path,status:x.data.status})),checkpoints:baseline.checkpoints.length,activeLocks:baseline.activeLocks.length}));
