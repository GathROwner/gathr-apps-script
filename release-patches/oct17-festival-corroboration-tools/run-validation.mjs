import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('./assembly/',import.meta.url));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const full=process.argv.includes('--full');
const playback=process.argv.includes('--playback');
const tests=walk(path.join(root,'lib')).filter(p=>p.endsWith('.test.js')&&(full||path.basename(p).startsWith('festival'))).map(p=>path.relative(root,p));
if(!full)tests.push(...walk(path.join(root,'scripts')).filter(p=>path.basename(p).startsWith('festival')&&p.endsWith('.test.mjs')).map(p=>path.relative(root,p)));
if(playback){tests.length=0;tests.push(fileURLToPath(new URL('./playback.test.mjs',import.meta.url)));}
const env={...process.env,TZ:'America/Halifax'};delete env.NODE_TEST_CONTEXT;
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,env});
const log=(result.stdout||'')+(result.stderr||'');
const name=playback?'playback':full?'full':'focused';
fs.writeFileSync(new URL('./'+name+'-qa.log',import.meta.url),log);
const summary={suite:playback?'actual-source worker playback':full?'full compiled backend':'focused festival+worker scripts',testFiles:tests.length,status:result.status,error:result.error?.message,counts:log.split('\n').filter(l=>/^# (tests|pass|fail|skipped|duration_ms) /.test(l))};
fs.writeFileSync(new URL('./'+name+'-qa.json',import.meta.url),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(result.status!==0||!summary.counts.some(l=>/^# tests [1-9]/.test(l))){console.log(log.split('\n').filter((line,i,lines)=>/^not ok/.test(line)||lines.slice(Math.max(0,i-3),i).some(l=>/^not ok/.test(l))).join('\n'));process.exitCode=1;}
