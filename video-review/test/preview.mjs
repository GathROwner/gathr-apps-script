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
http.createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/api/candidates'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({candidates,health:{},retentionDays:14,automaticPublication:false}));return;}
 const match=/^\/api\/candidates\/([a-f0-9]{64})\/(media|judgment)$/.exec(path);
 if(match){const c=candidates.find(c=>c.id===match[1]);if(match[2]==='judgment'){res.setHeader('Content-Type','application/json');res.end('{"saved":true}');return;}
 res.setHeader('Content-Type','video/mp4');res.end(await readFile(input.clips.find(i=>i.id===c.fixtureId).videoPath));return;}
 const f=path==='/app.js'?'app.js':path==='/style.css'?'style.css':'index.html';let body=await readFile(new URL(`../public/${f}`,import.meta.url),'utf8');
 if(f==='app.js')body=body.replace(/^import .*;\r?\n/gm,'').replace(/^const app=initializeApp.*;\r?\n/m,'').replace('const auth=getAuth(app);',"const auth={currentUser:{getIdToken:async()=> 'fixture'}};const onAuthStateChanged=(a,cb)=>cb(a.currentUser);const signOut=()=>location.reload();const signInWithEmailAndPassword=()=>{};");
 if(f==='index.html')body=body.replace('YOUR DAILY VIDEO INBOX','LOCAL QA · SAVED ASSESSMENTS');
 res.setHeader('Content-Type',f.endsWith('js')?'application/javascript':f.endsWith('css')?'text/css':'text/html');res.end(body);
}catch(e){res.statusCode=500;res.end(e.message);}}).listen(8768,'127.0.0.1',()=>console.log('Local saved-evidence preview: http://127.0.0.1:8768/'));
