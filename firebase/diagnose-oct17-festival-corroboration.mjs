// Read-only diagnostic; instruments an in-memory module, never serving files.
import fs from 'node:fs/promises';import {createRequire,Module} from 'node:module';
const require=createRequire(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/package.json',import.meta.url));
const filename=require.resolve('./lib/services/festivalReviewedCorroboration.js');
const lines=(await fs.readFile(filename,'utf8')).split('\n');
const topChecks="{edition:r.editionFingerprint===(0,festivalLinkShadowJob_js_1.festivalShadowFingerprint)(ed),source:r.sourceFingerprint===c.sourceFingerprint,capture:r.captureKey===c.captureKey,policy:r.evidencePolicy===c.evidencePolicy,activity:r.activityFingerprint===c.activityFingerprint,verifier:c.verifierAccepted,evidence:r.evidenceFingerprint===(0,festivalLinkShadowJob_js_1.festivalShadowFingerprint)(e),review:pinMatches(r.review,input.review),umbrella:pinMatches(r.umbrella,input.umbrella),reviewActive:!inactive(input.review.data),umbrellaActive:!inactive(input.umbrella.data),sourceRevision:e.source.revision}";
globalThis.oct17DiagnosticEvidence=[];
const source=lines.map((line,i)=>line.replace(/return out;/g,`{ globalThis.oct17DiagnosticEvidence.push(e); console.error(JSON.stringify({guardLine:${i+1},evidenceId:e.id${i===60?',checks:'+topChecks:''}})); return out; }`)).join('\n');
const instrumented=new Module(filename);instrumented.filename=filename;instrumented.paths=Module._nodeModulePaths(new URL('../functions/artifacts/oct17-festival-corroboration-release/assembly/lib/services/',import.meta.url).pathname.replace(/^\//,''));instrumented._compile(source,filename);require.cache[filename]=instrumented;
try{await import('./verify-oct17-festival-private-corroboration.mjs');}finally{await fs.writeFile(new URL('./artifacts/oct17-festival-corroboration/diagnostic-source-evidence.json',import.meta.url),JSON.stringify(globalThis.oct17DiagnosticEvidence,null,2));}
