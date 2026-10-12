import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const phase=process.argv[2] || 'before';
assert(['before','after'].includes(phase));
assert(process.argv[3],'Provide the exact approved plan path');
const planPath=path.resolve(process.argv[3]);
const plan=JSON.parse(await fs.readFile(planPath,'utf8'));
assert.equal(plan.project,'gathr-migrated');
assert.equal(plan.targets.length,14);
const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app';
const details=[];
for(let i=0;i<plan.targets.length;i+=4) {
  details.push(...await Promise.all(plan.targets.slice(i,i+4).map(async t=>{
    const id=t.path.split('/').at(-1);
    const r=await fetch(`${base}/api/v2/firestore/events/${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(30000)});
    const body=r.ok?await r.json():null;
    return {path:t.path,id,status:r.status,event:body?.event};
  })));
}
const ids=new Set();let cursor='',pages=0,finished=false;
while(pages<30) {
  const url=new URL(base+'/api/v2/firestore/events');
  url.searchParams.set('includeExpired','false');url.searchParams.set('limit','100');
  if(cursor)url.searchParams.set('startAfter',cursor);
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(r.ok);
  const body=await r.json();for(const event of body.events||[])ids.add(String(event.id));pages++;
  if(!body.nextPageToken){finished=true;break;}
  assert.notEqual(body.nextPageToken,cursor);cursor=body.nextPageToken;
}
assert(finished,'Feed pagination incomplete');
const checks=plan.targets.map(t=>{
  const detail=details.find(x=>x.path===t.path),inFeed=ids.has(detail.id);
  const fields=[];
  if(phase==='after'&&t.action==='update')for(const[k,v]of Object.entries(t.patch)){
    const apiKey=k==='name'||k==='eventName'?'title':k;
    if(['title','description','category','startDate','endDate','startTime','endTime'].includes(apiKey)){
      const actual=detail.event?.[apiKey]??'';
      fields.push({field:apiKey,expected:v,actual,ok:actual===v});
    }
    if(k==='isEvent')fields.push({field:'type',expected:v==='Yes'?'event':'special',actual:detail.event?.type,ok:detail.event?.type===(v==='Yes'?'event':'special')});
  }
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Halifax',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const future=(t.patch.startDate||t.expected.startDate)>localDate;
  const ok=phase==='before'?detail.status===200:t.action==='delete'?detail.status===404&&!inFeed:detail.status===200&&fields.every(x=>x.ok)&&(!future||inFeed);
  return {path:t.path,action:t.action,status:detail.status,inFeed,fields,ok};
});
const result={phase,checkedAt:new Date().toISOString(),planPath,pages,feedCount:ids.size,checks};
const resultPath=path.resolve(`artifacts/luna-oct12-repair/api-${phase}.json`);
await fs.writeFile(resultPath,JSON.stringify(result,null,2));
console.log(JSON.stringify({phase,resultPath,pages,feedCount:ids.size,passed:checks.filter(x=>x.ok).length,total:checks.length}));
assert(checks.every(x=>x.ok),'API checks failed; inspect report');
