import fs from 'node:fs/promises';
import admin from 'firebase-admin';
import {google} from 'googleapis';
import XLSX from 'xlsx';
const credentials=JSON.parse(await fs.readFile(process.env.DAISY_CREDENTIAL_PATH,'utf8'));
if(credentials.project_id!=='gathr-migrated')throw new Error('Wrong project');
admin.initializeApp({credential:admin.credential.cert(credentials),projectId:'gathr-migrated'});
const db=admin.firestore(),out='artifacts/daisy-oct14';
const queues=(await db.collection('unrecognized_venues').get()).docs.filter(d=>/dais[yie]|pei foodies|1738543821054078/i.test(JSON.stringify(d.data()))).map(d=>({path:d.ref.path,data:d.data()}));
await fs.writeFile(`${out}/queues.json`,JSON.stringify(queues,null,2));
console.log(JSON.stringify({queues:queues.map(x=>({path:x.path,name:x.data.venueName,status:x.data.status}))}));
try {
 const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/drive.readonly']});
 const drive=google.drive({version:'v3',auth});
 const fileId='1I3vDBQk5prUtMaNBDvfM9TaZHWkKHQkM';
 const response=await drive.files.get({fileId,alt:'media'},{responseType:'arraybuffer'});
 const buffer=Buffer.from(response.data);await fs.writeFile(`${out}/original-dataset.xlsx`,buffer);
 const workbook=XLSX.read(buffer,{type:'buffer'});
 const found=[];for(const name of workbook.SheetNames){const rows=XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:''});for(const row of rows)if(Object.values(row).some(x=>String(x)==='1738543821054078'))found.push({sheet:name,row});}
 await fs.writeFile(`${out}/raw-source-row.json`,JSON.stringify({fileId,found},null,2));
 console.log(JSON.stringify({fileId,matchedRows:found.length,sharedFields:found.map(x=>Object.fromEntries(Object.entries(x.row).filter(([k,v])=>/shared|user.name|author|pageName/i.test(k)&&v)))}));
}catch(error){console.log(JSON.stringify({originalFileUnavailable:true,status:error.response?.status||error.code||error.name}));}
const capture=JSON.parse(await fs.readFile(`${out}/capture.json`,'utf8'));
const details=[];const base='https://gathr-backend-924732524090.northamerica-northeast1.run.app';
for(const x of capture.events){const id=x.path.split('/').at(-1);const r=await fetch(`${base}/api/v2/firestore/events/${id}`,{signal:AbortSignal.timeout(30000)});details.push({path:x.path,status:r.status,body:r.ok?await r.json():null});}
const feed=[];let cursor='',pages=0;do{const u=new URL(base+'/api/v2/firestore/events');u.searchParams.set('includeExpired','false');u.searchParams.set('limit','100');if(cursor)u.searchParams.set('startAfter',cursor);const r=await fetch(u,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Feed read failed');const body=await r.json();feed.push(...body.events);cursor=body.nextPageToken||'';if(++pages>30)throw new Error('Pagination incomplete');}while(cursor);
await fs.writeFile(`${out}/api.json`,JSON.stringify({checkedAt:new Date().toISOString(),details,pages,feedCount:feed.length,events:feed.filter(x=>/burger basket/i.test(x.title||''))},null,2));
console.log(JSON.stringify({details:details.map(x=>({path:x.path,status:x.status})),pages,feedCount:feed.length,matched:feed.filter(x=>/burger basket/i.test(x.title||'')).map(x=>({id:x.id,originalEventId:x.originalEventId,title:x.title,startDate:x.startDate,venue:x.venue}))}));
