import {initializeApp,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {getAuth} from 'firebase-admin/auth';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {onRequest} from 'firebase-functions/v2/https';
import {readFile} from 'node:fs/promises';
import {POLICY,publicCandidate,rangeRequest,validateJudgment,hash,allowedIdentity} from './policy.mjs';
const app=getApps().find(a=>a.name==='[DEFAULT]')||initializeApp();
const loginApp=initializeApp({projectId:'gathr-m1'},'review-login');
const db=getFirestore(app), svc={db,bucket:getStorage(app).bucket(POLICY.bucket),publicBucket:getStorage(app).bucket('gathr-uploaded-images')};
const base={region:'northamerica-northeast1',maxInstances:1,concurrency:1,serviceAccount:'924732524090-compute@developer.gserviceaccount.com'};
export const discoverListingVideos=onSchedule({...base,schedule:'every 10 minutes',timeoutSeconds:300,memory:'512MiB',retryCount:0,secrets:[]},async()=>{const {scan}=await import('./pipeline.mjs');console.log(JSON.stringify({videoDiscovery:await scan(svc)}));});
export const reviewListingVideos=onSchedule({...base,schedule:'* * * * *',timeoutSeconds:1800,memory:'2GiB',cpu:1,retryCount:0,secrets:['GATHR_OPENAI_API_KEY']},async()=>{const {work}=await import('./pipeline.mjs');console.log(JSON.stringify({videoReview:await work(svc,process.env.GATHR_OPENAI_API_KEY)}));});
export const cleanupVideoReviews=onSchedule({...base,schedule:'45 4 * * *',timeZone:'America/Halifax',timeoutSeconds:300,memory:'512MiB',retryCount:0,secrets:[]},async()=>{const {cleanup}=await import('./pipeline.mjs');console.log(JSON.stringify(await cleanup(svc)));});
// Existing identity already owns both video buckets; no model key or new bucket access is needed.
export const publishListingVideos=onSchedule({...base,serviceAccount:'firebase-adminsdk-fbsvc@gathr-migrated.iam.gserviceaccount.com',schedule:'* * * * *',timeoutSeconds:300,memory:'512MiB',retryCount:0,secrets:[]},async()=>{const {publishTick}=await import('./automatic-publication.mjs');console.log(JSON.stringify({videoPublication:await publishTick(svc)}));});
export const cleanupPublishedListingVideos=onSchedule({...base,serviceAccount:'firebase-adminsdk-fbsvc@gathr-migrated.iam.gserviceaccount.com',schedule:'30 4 * * *',timeZone:'America/Halifax',timeoutSeconds:540,memory:'512MiB',retryCount:0,secrets:[]},async()=>{const {cleanupPublished}=await import('./automatic-publication.mjs');console.log(JSON.stringify(await cleanupPublished(svc)));});
async function authorize(req) {
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
  if(!token)throw Error('unauthorized');
  const decoded=await getAuth(loginApp).verifyIdToken(token);
  const config=(await db.doc('runtime_metadata/video_review').get()).data();
  if(!allowedIdentity(decoded,config))throw Error('forbidden');
  return decoded.uid;
}
function headers(res) {
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com; frame-src https://gathr-m1.firebaseapp.com; img-src 'self' data:; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'"});
}
export const videoReviewPortal=onRequest({...base,maxInstances:2,concurrency:20,timeoutSeconds:120,memory:'512MiB',secrets:[],invoker:'public'},async(req,res)=>{
  headers(res);const path=req.path.replace(/\/$/,'')||'/';
  try {
    if(req.method==='GET'&&['/','/app.js','/review-ui.js','/style.css'].includes(path)) {
      const f=path==='/'?'index.html':path.slice(1);
      res.type(f.endsWith('.html')?'html':f.endsWith('.js')?'application/javascript':'css').send(await readFile(new URL(`./public/${f}`,import.meta.url)));return;
    }
    const uid=await authorize(req);
    if(req.method==='GET'&&path==='/api/candidates') {
      let query=db.collection(POLICY.queue).orderBy('discoveredAt','desc');
      if(req.query.after){if(!/^[a-f0-9]{64}$/.test(String(req.query.after))){res.status(400).end();return;}const cursor=await db.collection(POLICY.queue).doc(String(req.query.after)).get();if(!cursor.exists){res.status(400).end();return;}query=query.startAfter(cursor);}
      const results=await query.limit(100).get();
      const health=(await db.doc('runtime_metadata/video_review_health').get()).data()||{};
      const publicationHealth=(await db.doc('runtime_metadata/video_publication_health').get()).data()||{},config=(await db.doc('runtime_metadata/video_review').get()).data()||{};
      const rows=results.docs.map(d=>publicCandidate({...d.data(),id:d.id}));
      const paths=[...new Set(rows.flatMap(c=>(c.publication||c.manualPublication)?.paths||[]))].filter(p=>/^(venues\/[A-Za-z0-9_.-]+\/events\/[A-Za-z0-9_.-]+|events\/[A-Za-z0-9_.-]+)$/.test(p));
      const names=new Map();for(let i=0;i<paths.length;i+=100)for(const d of await db.getAll(...paths.slice(i,i+100).map(p=>db.doc(p))))if(d.exists){const e=d.data();names.set(d.ref.path,{path:d.ref.path,title:String(e.name||e.title||e.eventName||'Listing').slice(0,200),date:String(e.startDate||''),time:String(e.startTime||''),venue:typeof e.venue==='string'?e.venue:String(e.venueName||e.locationLabel||'')});}
      res.json({candidates:rows.map(c=>({...c,publishedListings:((c.publication||c.manualPublication)?.paths||[]).map(p=>names.get(p)).filter(Boolean)})),nextCursor:results.size===100?results.docs.at(-1).id:null,health,publicationHealth,automaticPublication:config.automaticPublication===true,maxSeconds:POLICY.maxSeconds,retentionDays:POLICY.days});return;
    }
    const match=/^\/api\/candidates\/([a-f0-9]{64})\/(media|judgment)$/.exec(path);
    if(!match){res.status(404).json({error:'Not found'});return;}
    const ref=db.collection(POLICY.queue).doc(match[1]),snapshot=await ref.get(),c=snapshot.data();
    if(!c){res.status(404).end();return;}
    if(match[2]==='media'&&req.method==='GET') {
      if(!c.object||Date.parse(c.expiresAt)<=Date.now()){res.status(410).json({error:'Review media expired or unavailable; open the source post.'});return;}
      if(c.object!==`clips/${snapshot.id}.mp4`)throw Error('media_namespace_mismatch');
      const file=svc.bucket.file(c.object);const [metadata]=await file.getMetadata();
      if(metadata.metadata?.sha256!==c.sha256||metadata.metadata?.owner!==POLICY.version)throw Error('media_drift');
      const size=Number(metadata.size);let range;
      try{range=rangeRequest(req.headers.range,size);}catch{res.set('Content-Range',`bytes */${size}`).status(416).end();return;}
      res.status(range.partial?206:200).set({'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':String(range.end-range.start+1)});
      if(range.partial)res.set('Content-Range',`bytes ${range.start}-${range.end}/${size}`);
      const stream=file.createReadStream({start:range.start,end:range.end,validation:false});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
    }
    if(match[2]==='judgment'&&req.method==='POST') {
      const opinion=validateJudgment(req.body);
      if(!c.revision||req.body.revision!==c.revision){res.status(409).json({error:'The review changed. Refresh before saving.'});return;}
      const at=new Date().toISOString(),judgment={...opinion,reviewerUid:uid,reviewedAt:at,revision:c.revision,sha256:c.sha256||null,
        assessmentSnapshot:{state:c.state,decision:c.decision,reviewVersion:c.reviewVersion||'legacy',content:c.contentAssessment||null,listing:c.listingCheck||null}};
      await db.runTransaction(async tx=>{
        const fresh=(await tx.get(ref)).data();if(fresh.revision!==c.revision)throw Error('review_drift');
        if(opinion.listingPath&&!(fresh.listings||[]).some(l=>l.path===opinion.listingPath))throw Error('invalid_judgment');
        tx.create(ref.collection('judgments').doc(hash(JSON.stringify([uid,at,judgment]))),judgment);
        const changes={humanJudgment:judgment,publicationRequestedAt:at};
        if(opinion.choice==='use'&&opinion.listingPath&&opinion.listingPath!==fresh.reviewedListingPath)Object.assign(changes,{state:'queued',requestedReviewVersion:'editorial-content-v2',lastQueuedAt:at});
        tx.update(ref,changes);
      });
      const config=(await db.doc('runtime_metadata/video_review').get()).data()||{};
      res.json({saved:true,automaticPublication:config.automaticPublication===true});return;
    }
    res.status(405).end();
  }catch(e){const code=e.message==='forbidden'?403:e.message==='unauthorized'||e.code?.startsWith('auth/')?401:e.message==='invalid_judgment'?400:503;res.status(code).json({error:code===401?'Sign in to review videos.':code===403?'This account is not enabled for private video review.':code===400?'Invalid judgment.':'Video review temporarily unavailable.'});}
});
