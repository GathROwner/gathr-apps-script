// Sequential narrow deployments from committed, immutable serving assemblies.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'functions/artifacts/oct18-audit-fixes/release');
const assemblies=JSON.parse(fs.readFileSync(path.join(out,'assemblies.json')));
const mode=process.argv[2];assert(['dry-run','apply'].includes(mode));
for(const row of assemblies){
 const git=args=>cp.execFileSync('git',['-C',row.folder,...args],{encoding:'utf8'}).trim();
 assert.equal(git(['rev-parse','HEAD']),row.releaseCommit);assert.equal(git(['status','--porcelain']),'','Assembly dirty');
 const log=fs.readFileSync(path.join(row.folder,'focused-tests.log'),'utf8');assert(/# fail 0\b/.test(log)&&/# pass \d+/.test(log),'Focused tests missing');
 const targets=row.sourceFunction==='processDatasetResume'?['processDataset','processDatasetResume','processDatasetSelectedRows']:[row.sourceFunction];
 const only=targets.map(n=>'functions:gathr-functions:'+n).join(',');
 const args=['deploy','--only',only,'--project','gathr-migrated','--non-interactive'];if(mode==='dry-run')args.push('--dry-run');
 if(mode==='apply'){
  const dry=JSON.parse(fs.readFileSync(path.join(out,row.sourceFunction+'-dry-run-ok.json')));assert.equal(dry.commit,row.releaseCommit,'Dry-run commit drift');
  const full=fs.readFileSync(path.join(assemblies[0].folder,'full-tests.log'),'utf8');assert(/# tests 1010\b/.test(full)&&/# pass 1010\b/.test(full)&&/# fail 0\b/.test(full),'Full parser tests incomplete');
  const baseline=cp.spawnSync('node',[path.join(root,'firebase/oct18-audit-release-readonly.cjs'),'check',targets.join(',')],{cwd:root,encoding:'utf8'});if(baseline.status!==0){process.stderr.write(baseline.stderr);process.exit(baseline.status||1);}
  const guard=cp.spawnSync('node',[path.join(root,'firebase/repair-oct18-audit.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,ANCHOR_CREDENTIAL_PATH:'C:/Users/craig/Dev/gathr-apps-script/firebase/service-account.json'}});
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
