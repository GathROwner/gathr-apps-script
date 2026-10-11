// Orchestrate the existing Stage 4-only harness. Never imports a live writer.
const fs=require('node:fs'), path=require('node:path'), {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const input=process.env.AUDIT_INPUT, output=process.env.AUDIT_OUTPUT;
if(!input||!output||!process.env.OPENAI_API_KEY)throw Error('Require AUDIT_INPUT, AUDIT_OUTPUT and OPENAI_API_KEY');
const cases=JSON.parse(fs.readFileSync(input));
const arms=(process.env.AUDIT_ARMS||'nano-low,luna-none,luna-low').split(',').map(a=>a.trim()).filter(Boolean);
if(!arms.length||new Set(arms).size!==arms.length)throw Error('Require distinct comparison arms');
// Largest cases start first; rotate model order to reduce fixed-order bias.
const jobs=cases.slice().sort((a,b)=>b.items.length-a.items.length).flatMap((c,n)=>
  arms.map((_,i)=>({caseId:c.caseId,arm:arms[(n+i)%arms.length]})));
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(output+'-logs',{recursive:true});
let next=0, failures=0;
async function worker(){
  while(next<jobs.length){
    const job=jobs[next++], basename=`${job.caseId}-${job.arm}-r1`;
    if(fs.existsSync(path.join(output,basename+'.json')))continue;
    await new Promise(resolve=>{
      const child=spawn(process.execPath,[path.join(__dirname,'stage4-model-audit.mjs'),job.caseId,job.arm,'1'],
        {cwd:root,env:process.env});
      let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
      const timeout=setTimeout(()=>{log+='\nAUDIT_PROCESS_TIMEOUT';child.kill();},600000);
      child.on('close',code=>{clearTimeout(timeout);fs.writeFileSync(path.join(output+'-logs',basename+'.txt'),log);
        if(code!==0)failures++;
        console.log(JSON.stringify({...job,exit:code,last:log.trim().split('\n').at(-1)}));resolve();});
      child.on('error',error=>{log+=error.message;});
    });
  }
}
Promise.all(Array.from({length:4},worker)).then(()=>{process.exitCode=failures?1:0;});
