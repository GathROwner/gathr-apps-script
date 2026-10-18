// Sequential narrow deployments from committed, immutable serving assemblies.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'functions/artifacts/island-open-oct18-release');
const assemblies=JSON.parse(fs.readFileSync(path.join(out,'assemblies.json')));
const mode=process.argv[2];assert(['dry-run','apply'].includes(mode));
for(const row of assemblies){
 const git=args=>cp.execFileSync('git',['-C',row.folder,...args],{encoding:'utf8'}).trim();
 assert.equal(git(['rev-parse','HEAD']),row.releaseCommit);assert.equal(git(['status','--porcelain']),'','Assembly dirty');
 const full=fs.readFileSync(path.join(row.folder,'full-tests.log'),'utf8');assert(/# tests 1024\b/.test(full)&&/# pass 1024\b/.test(full)&&/# fail 0\b/.test(full),'Full parser tests incomplete');
 assert.equal(fs.readFileSync(path.join(row.folder,'build.log'),'utf8').trim(),'','Build errors remain');
 // Reuse the exact tested compiled output. Hash every source/compiled file before
 // both CLI phases, instead of repeating the same compiler invocation in hooks.
 const digests={};const walk=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else digests[path.relative(row.folder,p).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}};
 for(const dir of ['src','lib','scripts'])walk(path.join(row.folder,dir));
 for(const n of ['package.json','package-lock.json'])digests[n]=crypto.createHash('sha256').update(fs.readFileSync(path.join(row.folder,n))).digest('hex');
 const manifestPath=path.join(out,'tested-payload.json'),payload={commit:row.releaseCommit,digests};
 if(mode==='dry-run')fs.writeFileSync(manifestPath,JSON.stringify(payload,null,2));else assert.deepEqual(payload,JSON.parse(fs.readFileSync(manifestPath)),'Tested payload drift');
 const log=fs.readFileSync(path.join(row.folder,'focused-tests.log'),'utf8');assert(/# fail 0\b/.test(log)&&/# pass \d+/.test(log),'Focused tests missing');
 const targets=row.sourceFunction==='processDatasetResume'?['processDataset','processDatasetResume','processDatasetSelectedRows']:[row.sourceFunction];
 const only=targets.map(n=>'functions:gathr-functions:'+n).join(',');
 const config=JSON.parse(fs.readFileSync(path.join(row.folder,'firebase.json')));assert.equal(config.functions.length,1);assert.equal(config.functions[0].source,'.');assert.equal(config.functions[0].codebase,'gathr-functions');
 config.functions[0].source='assembly';delete config.functions[0].predeploy;const configPath=path.join(out,'firebase.prebuilt.json');fs.writeFileSync(configPath,JSON.stringify(config,null,2));
 const args=['deploy','--config',configPath,'--only',only,'--project','gathr-migrated','--non-interactive'];if(mode==='dry-run')args.push('--dry-run');
 if(mode==='apply'){
  const dry=JSON.parse(fs.readFileSync(path.join(out,row.sourceFunction+'-dry-run-ok.json')));assert.equal(dry.commit,row.releaseCommit,'Dry-run commit drift');
  const baseline=cp.spawnSync('node',[path.join(root,'firebase/island-open-oct18-release-readonly.cjs'),'check',targets.join(',')],{cwd:root,encoding:'utf8'});if(baseline.status!==0){process.stderr.write(baseline.stderr);process.exit(baseline.status||1);}
  const guard=cp.spawnSync('node',[path.join(root,'firebase/assert-oct18-idle.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,ANCHOR_CREDENTIAL_PATH:'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'}});
  if(guard.status!==0){process.stdout.write(guard.stdout);process.stderr.write(guard.stderr);process.exit(guard.status||1);}
 }
 console.log(JSON.stringify({mode,targets,commit:row.releaseCommit,startedAt:new Date().toISOString()}));
 const fd=fs.openSync(path.join(out,row.sourceFunction+'-'+mode+'.log'),'w');
 const run=cp.spawnSync(process.execPath,['C:/Users/craig/AppData/Roaming/npm/node_modules/firebase-tools/lib/bin/firebase.js',...args],{cwd:row.folder,stdio:['ignore',fd,fd],env:{...process.env,FUNCTIONS_DISCOVERY_TIMEOUT:'60'}});fs.closeSync(fd);
 const text=fs.readFileSync(path.join(out,row.sourceFunction+'-'+mode+'.log'),'utf8');
 // Firebase may write credentials into debug logs: print only progress/status lines.
 const safe=text.split('\n').filter(l=>/Successful|successful|Deploy complete|Dry run|dry run|Error:|Warning:|functions: (updating|creating)|functions\[/.test(l));console.log(safe.join('\n'));
 if(run.status!==0){console.error('Narrow deployment failed; inspect private '+row.sourceFunction+'-'+mode+'.log');process.exit(run.status||1);}
 fs.writeFileSync(path.join(out,row.sourceFunction+'-'+mode+'-ok.json'),JSON.stringify({at:new Date().toISOString(),targets,commit:row.releaseCommit,args,status:run.status},null,2));
}
