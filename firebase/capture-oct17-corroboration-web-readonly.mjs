/** Bounded public first-party HTTP receipts. No model calls or Firestore access. */
import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
const out=new URL('./artifacts/oct17-festival-corroboration-web/',import.meta.url);await fs.mkdir(out,{recursive:true});
const targets=[['harvest','https://foundersfoodhall.com/events/harvest-fest-2/'],['anchor-home','https://www.anchorfest.ca/'],['anchor-films','https://www.anchorfest.ca/film'],['anchor-heart-ticket','https://locarius.io/events/5024/in-the-heart-of-the-south'],['anchor-snake-ticket','https://locarius.io/events/4886/pei-premiere-the-snake']];
const results=[];
for(const [id,url]of targets){try{const r=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'follow'}),body=await r.text();if(Buffer.byteLength(body)>5e6)throw Error('Response too large');
 const sha256=createHash('sha256').update(body).digest('hex'),text=body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
 await fs.writeFile(new URL(id+'.html',out),body);await fs.writeFile(new URL(id+'.txt',out),text);
 results.push({id,url,finalUrl:r.url,checkedAt:new Date().toISOString(),status:r.status,contentType:r.headers.get('content-type'),sha256,bytes:Buffer.byteLength(body),bodyFile:id+'.html',textFile:id+'.txt',dateSnippets:[...text.matchAll(/.{0,70}(?:October|Oct\.?|2026).{0,110}/gi)].slice(0,12).map(m=>m[0])});
 }catch(error){results.push({id,url,error:String(error.message),checkedAt:new Date().toISOString()});}}
await fs.writeFile(new URL('public-http-receipts.json',out),JSON.stringify({results,liveWrites:0,paidCalls:0},null,2));console.log(JSON.stringify({results,liveWrites:0,paidCalls:0}));
