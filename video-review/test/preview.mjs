// Local-only rendered QA harness. Not deployed; uses saved assessments and clips.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/v2-triage';
const input=JSON.parse((await readFile(`${root}/INPUT.json`,'utf8')).replace(/^\uFEFF/,''));
const report=JSON.parse(await readFile(`${root}/triage/triage.json`,'utf8'));
const candidates=report.entries.map(e=>{const c=input.clips.find(c=>c.id===e.id);return{
  id:createHash('sha256').update(c.id).digest('hex'),fixtureId:c.id,caption:c.caption,sourcePage:`https://www.facebook.com/reel/${c.sourceVideoId}/`,
  listings:c.listingContext?.sourceMatched?[c.listingContext]:[],state:e.terminalDecision==='recommend_for_manual_review'?'recommended':e.terminalDecision==='reject'?'rejected':'held',
  reasons:e.holdReasons,luna:e.luna?.modelAssessment,terra:e.terra?.modelAssessment,route:e.route,revision:'a'.repeat(64),object:'fixture',
  durationSeconds:c.probe?.durationSeconds,hasAudio:c.sourceAudio,expiresAt:'2026-11-13T00:00:00Z'
};});
// A saved current-run candidate exercises waiting UI without fabricating a model result.
const {discover,publicCandidate}=await import('../policy.mjs');
const todayRows=JSON.parse(await readFile('C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/daily-release/PRIVATE_INPUT_ROWS.json','utf8'));
const queued=discover(todayRows,'preview-file').find(c=>c.state==='queued'&&/Happy Halloween/i.test(c.caption));
if(queued)candidates.unshift(publicCandidate(queued));
try {
 const rollout='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison/editorial-rollout';
 const smoke=JSON.parse(await readFile(rollout+'/SMOKE_RESULTS.json','utf8'));
 const snapshot=JSON.parse(await readFile(rollout+'/BEFORE.json','utf8'));
 const {createRequire}=await import('node:module');const req=createRequire(import.meta.url);
 const auth=req('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
 const actual=[];
 for(const r of smoke.results){const original=snapshot.candidates.find(d=>d.name.endsWith('/'+r.id)),c=auth.data(original);const report=JSON.parse(await readFile(`${rollout}/cases/${r.id}/editorial/editorial.json`,'utf8')),e=report.entries[0];
  const listingCheck={status:c.listings?.length===1?(e.listingAssessment?.association==='matched'?'matched':'uncertain'):'not_found',reason:e.listingAssessment?.reason};
  actual.push({...c,id:r.id,fixtureId:r.label,fixturePath:`${rollout}/cases/${r.id}/video.mp4`,state:e.state,reasons:e.reasons,luna:e.luna,terra:e.terra,contentAssessment:e.contentAssessment,audioNotes:e.audioNotes,listingCheck,route:e.route,reviewVersion:'editorial-content-v1'});
 }
 candidates.splice(0,candidates.length,...actual);
}catch(e){if(e.code!=='ENOENT')throw e;}
http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/candidates'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({candidates,health:{},retentionDays:14,automaticPublication:false}));return;}
 const match=/^\/api\/candidates\/([a-f0-9]{64})\/(media|judgment)$/.exec(path);
 if(match){const c=candidates.find(c=>c.id===match[1]);if(match[2]==='judgment'){let body='';for await(const part of req)body+=part;const value=JSON.parse(body);c.humanJudgment={judgment:value.judgment,notes:value.notes};res.setHeader('Content-Type','application/json');res.end('{"saved":true}');return;}
 res.setHeader('Content-Type','video/mp4');res.end(await readFile(c.fixturePath||input.clips.find(i=>i.id===c.fixtureId).videoPath));return;}
 const f=path==='/app.js'?'app.js':path==='/review-ui.js'?'review-ui.js':path==='/style.css'?'style.css':'index.html';let body=await readFile(new URL(`../public/${f}`,import.meta.url),'utf8');
 if(f==='app.js')body=body.replace(/^import .*from 'https:.*;\r?\n/gm,'').replace(/^const app=initializeApp.*;\r?\n/m,'').replace('const auth=getAuth(app);',"const auth={currentUser:{getIdToken:async()=> 'fixture'}};const onAuthStateChanged=(a,cb)=>cb(a.currentUser);const signOut=()=>location.reload();const signInWithEmailAndPassword=()=>{};");
 if(f==='index.html')body=body.replace('YOUR DAILY VIDEO INBOX','LOCAL QA · SAVED ASSESSMENTS');
 res.setHeader('Content-Type',f.endsWith('js')?'application/javascript':f.endsWith('css')?'text/css':'text/html');res.end(body);
}catch(e){res.statusCode=500;res.end(e.message);}}).listen(8768,'127.0.0.1',()=>console.log('Local saved-evidence preview: http://127.0.0.1:8768/'));
