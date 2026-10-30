// Local-only rendered QA using retained real source records; all button writes are mocked.
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const auth=require('C:/Users/craig/.codex/worktrees/luna-accounting-release/gathr-apps-script/functions/artifacts/ocr-caption-fooddrive-oct18/tools/normal-auth.cjs');
const root='C:/Users/craig/Documents/Codex/2026-10-30/video-model-comparison';
(async()=>{
 const packet=JSON.parse(await fs.readFile(root+'/automation-90s/BEFORE.json','utf8'));
 const candidates=packet.candidates.map(d=>({id:d.name.split('/').at(-1),...auth.data(d)}));
 const multi=candidates.find(c=>c.sourceVideoId==='1634610118071598');
 delete multi.manualPublication;multi.publication={state:'needs_review',reason:'Choose the event or special promoted by this video.'};multi.listingCheck={status:'needs_selection',reason:'Several exact source-linked listings need a selection.'};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),p=url.pathname;
  if(p==='/api/candidates'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({candidates,health:{workerAt:packet.atUTC},automaticPublication:true}));return;}
  const m=/^\/api\/candidates\/([a-f0-9]{64})\/(media|judgment)$/.exec(p);
  if(m){const c=candidates.find(x=>x.id===m[1]);if(!c){res.statusCode=404;res.end();return;}
   if(m[2]==='judgment'){let text='';for await(const part of req)text+=part;const body=JSON.parse(text);c.humanJudgment={...body,choice:body.judgment==='use_video'?'use':body.judgment==='dont_use_video'?'dont_use':'unsure'};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({saved:true,automaticPublication:true}));return;}
   let file=root+'/selected-publication/'+c.sha256+'.mp4';if(c.sourceVideoId==='1068937392790830')file=root+'/hokum-longer-trial/video.mp4';res.setHeader('Content-Type','video/mp4');res.end(await fs.readFile(file));return;
  }
  const file=p==='/app.js'?'app.js':p==='/review-ui.js'?'review-ui.js':p==='/style.css'?'style.css':'index.html';let body=await fs.readFile(path.resolve(__dirname,'../public',file),'utf8');
  if(file==='app.js')body=body.replace(/^import .*from 'https:.*;\r?\n/gm,'').replace(/^const app=initializeApp.*;\r?\n/m,'').replace('const auth=getAuth(app);',"const auth={currentUser:{getIdToken:async()=> 'local-fixture'}};const onAuthStateChanged=(a,cb)=>cb(a.currentUser);const signOut=()=>location.reload();const signInWithEmailAndPassword=()=>{};");
  if(file==='index.html')body=body.replace('YOUR DAILY VIDEO INBOX','LOCAL QA · PUBLICATION CONTROLS');
  res.setHeader('Content-Type',file.endsWith('js')?'application/javascript':file.endsWith('css')?'text/css':'text/html');res.end(body);
 }catch(e){res.statusCode=500;res.end(e.message);}});
 server.listen(8768,'127.0.0.1',()=>console.log('Local publication UI QA: http://127.0.0.1:8768/'));
})().catch(e=>{console.error(e.message);process.exitCode=1});
