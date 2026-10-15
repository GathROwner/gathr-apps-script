// Bounded primary-source fetches and local image manifest. No live writes or keys.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const out=path.join(import.meta.dirname,'artifacts/six-groups-oct15'),capture=JSON.parse(await fs.readFile(path.join(out,'capture.json'),'utf8'));
const urls=['https://millriver.ca/package/late-fall-stay-play/','https://golfpei.ca/course_dates/','https://confederationcentre.com/exhibition/soft-internet-theory/',
 'https://www.blankcanvasartsupplies.ca/pages/workshops-classes',...['1','2','3'].map(n=>'https://kingsplayhouse.com/event-detail-page/?slug=kings-christmas'+n),
 'https://petsmartcharities.ca/adopt-a-pet/adoption-events','https://www.petsmart.ca/stores/ca/pe/charlottetown-store2173.html'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const pages=await Promise.all(urls.map(async(url,index)=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)}),html=await r.text();await fs.writeFile(path.join(out,`official-${index}.html`),html);
 return{url,status:r.status,finalUrl:r.url,file:`official-${index}.html`,text:html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#8211;|&ndash;/g,'–').replace(/&#8217;|&rsquo;/g,'’').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(),
 links:[...html.matchAll(/href=["']([^"']+)["']/g)].map(m=>m[1]).filter(h=>/ticket|locarius|christmas|acrylic|colour/i.test(h))};}catch(e){return{url,status:'unavailable',reason:String(e.message)}}}));
const media=[];for(const row of [48,178,317,325]){const s=capture.sources.find(s=>s.row===row);for(const [index,g] of s.galleryReview.references.entries()){
 const local=path.resolve(import.meta.dirname,'../../../festival-linker-shadow/gathr-apps-script/functions',g.file),bytes=await fs.readFile(local),digest=hash(bytes);
 const objectName=`postimages/reviewed-oct15-${s.sourceId}-${digest.slice(0,16)}.jpg`;media.push({row,sourceId:s.sourceId,index,localFile:local,sha256:digest,bytes:bytes.length,objectName,url:'https://storage.googleapis.com/gathr-uploaded-images/'+objectName});}}
const oldImages=[...new Set(capture.documents.filter(d=>/venues\/ZDUj9euh7NVJ6INSlHM8\/events\/(?:UgLcs|L5a28|KbS30)/.test(d.path)).map(d=>d.data.imageUrl))];
for(const [i,url]of oldImages.entries()){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);await fs.writeFile(path.join(out,`ruby-older-${i}.webp`),Buffer.from(await r.arrayBuffer()));}
await fs.writeFile(path.join(out,'web-and-media-evidence.json'),JSON.stringify({capturedAt:new Date().toISOString(),pages,media,oldImages,liveWrites:0},null,2));console.log(JSON.stringify({pages:pages.map(({url,status})=>({url,status})),proposedOriginalUploads:media.length,oldImages:oldImages.length,liveWrites:0}));
