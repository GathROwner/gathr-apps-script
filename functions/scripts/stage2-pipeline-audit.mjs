// No-write integration audit. Actual Stage 1/2/3/4/5 calls, including the
// production four-image entry and full-gallery refresh. Inputs are frozen bytes
// returned by the deployed OCR service, supplied as correctly typed data URLs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
if (!process.env.OPENAI_API_KEY || !process.env.AUDIT_INPUT || !process.env.AUDIT_OUTPUT) throw Error('Require key and audit paths');
if (process.env.AUDIT_ENVIRONMENT_FILE) {
  const env = JSON.parse(await fs.readFile(process.env.AUDIT_ENVIRONMENT_FILE, 'utf8')).serviceConfig.environmentVariables;
  for (const [k,v] of Object.entries(env)) if (/^(STAGE|ENABLE_STAGE2|LUNA_)/.test(k)) process.env[k] = String(v);
}
Object.assign(process.env, { DRY_RUN:'true', PARSER_DRY_RUN_LOCAL_IMAGES:'true',
  LUNA_STAGE1_PILOT_ENABLED:'true', LUNA_STAGE1_PILOT_SAMPLE_PERCENT:'100',
  LUNA_TEXT_ONLY_ENABLED:'true', LUNA_CANARY_ENABLED:'true', LUNA_CANARY_STAGE3_ONLY:'true',
  LUNA_CANARY_SAMPLE_PERCENT:'100', LUNA_CANARY_POST_IDS:'', LUNA_CANARY_EXCLUDED_POST_IDS:'',
  LUNA_CANARY_LEGACY_FALLBACK_ENABLED:'false' });
delete process.env.IMAGE_UPLOAD_URL; delete process.env.IMAGE_DELETE_URL;
const local = new AsyncLocalStorage(), nativeFetch = globalThis.fetch;
globalThis.fetch = async (url,options={}) => {
  const address = typeof url === 'string' ? url : url.url;
  if (!address.startsWith('https://api.openai.com/v1/')) throw Error('No-write audit blocks non-OpenAI request: '+new URL(address).origin);
  const body = JSON.parse(options.body), started = Date.now();
  const response = await nativeFetch(url,options), data = await response.clone().json();
  const content = (body.input || []).flatMap(x=>x.content || []);
  local.getStore()?.requests.push({ model:body.model, effort:body.reasoning?.effort || 'model_default',
    imageCount:content.filter(x=>x.type==='input_image').length,
    imageHashes:content.filter(x=>x.type==='input_image').map(x=>createHash('sha256').update(x.image_url).digest('hex')),
    promptSha256:createHash('sha256').update(content.filter(x=>x.type==='input_text').map(x=>x.text).join('')).digest('hex'),
    httpStatus:response.status,status:data.status,incompleteDetails:data.incomplete_details,
    usage:data.usage,maxOutputTokens:body.max_output_tokens,durationMs:Date.now()-started });
  return response;
};
const require = createRequire(import.meta.url);
require('openai/shims/web');
// Use explicit existing credentials for read-only venue-hours resolution,
// avoiding ADC retries. No image uploads, venue updates or event writers run.
if (process.env.AUDIT_GOOGLE_CREDENTIALS) process.env.GOOGLE_APPLICATION_CREDENTIALS=process.env.AUDIT_GOOGLE_CREDENTIALS;
const firestoreService=require('../lib/services/firestoreService.js');
firestoreService.updateVenueOperatingHours=async()=>{throw Error('Audit blocks venue writes');};
if (process.env.AUDIT_SHARE_STAGE1 === 'true') {
  const validator=require('../lib/parsing/contentValidator.js'),original=validator.validateContent;
  const validations=new Map();
  validator.validateContent=async(...args)=>{
    const key=createHash('sha256').update(JSON.stringify(args.slice(0,4))).digest('hex');
    const reused=validations.has(key);
    if (!reused) validations.set(key,original(...args));
    local.getStore()?.stage1Reads.push({key,reused});
    return structuredClone(await validations.get(key));
  };
}
const { parsePostData } = await import('../lib/parsing/postParser.js');
const cohort = JSON.parse(await fs.readFile(process.env.AUDIT_INPUT,'utf8'));
const ids = process.env.AUDIT_CASES?.split(',');
const sources = ids ? cohort.filter(s=>ids.includes(s.caseId)) : cohort;
if (ids && sources.length !== ids.length) throw Error('Unknown or repeated case');
const output = path.resolve(process.env.AUDIT_OUTPUT); await fs.mkdir(output,{recursive:true});
const arms = [{id:'mini-current',stage2ModelOverride:'gpt-5-mini'},
  {id:'luna-negative-review',stage2ModelOverride:'gpt-6-luna',stage2ReasoningEffort:'none',stage2LunaNegativeRecheck:true}];
const tasks = sources.flatMap((source,i)=>arms.map((_,j)=>({source,arm:arms[(i+j)%2]})));
let cursor = 0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<tasks.length){
  const {source,arm}=tasks[cursor++],target=path.join(output,source.caseId+'-'+arm.id+'.json');
  try { await fs.access(target); continue; } catch {}
  const context={requests:[],stage1Reads:[]}; await local.run(context,async()=>{
    const usage=[],skips=[],stages={},started=Date.now();
    try {
      const mediaUrls=await Promise.all(source.imageFiles.map(async p=>{
        const b=await fs.readFile(p),mime=b.subarray(0,4).toString()==='RIFF'?'image/webp':b[0]===137?'image/png':'image/jpeg';
        return `data:${mime};base64,${b.toString('base64')}`;
      }));
      const events=await parsePostData({combinedText:source.caption,mediaUrls,sharedPostThumbnails:[],
        userName:source.venue,pageName:source.venue,timestamp:source.timestamp,facebookUrl:source.facebookUrl||'',profilePicUrl:'',
        extractedData:{id:source.postId,postId:source.postId,utcStartDate:source.utcStartDate}}, {}, {
        ...arm,diagnosticContext:{fileId:source.fileId||'stage2-release-audit',rowIndex:source.row,postId:source.postId},
        lunaStage3EligibleSelector:()=>true,stage4BatchSize:15,stage4BatchConcurrency:2,
        stage5BatchSize:9,stage5BatchConcurrency:2,
        ticketLinkEnrichment:{enabled:false},calendarLinkEnrichment:{enabled:false},venueWebsiteEnrichment:{enabled:false},
        gptUsageHandler:x=>usage.push(x),skipReasonHandler:x=>skips.push(x),stageArtifactsHandler:x=>Object.assign(stages,x),
      });
      await fs.writeFile(target,JSON.stringify({caseId:source.caseId,arm:arm.id,sourceGalleryCount:mediaUrls.length,
        elapsedMs:Date.now()-started,events,usage,skips,stages,requests:context.requests,stage1Reads:context.stage1Reads},null,2));
      console.log(JSON.stringify({caseId:source.caseId,arm:arm.id,events:events.length,skips,elapsedMs:Date.now()-started}));
    } catch(e) {
      await fs.writeFile(target,JSON.stringify({caseId:source.caseId,arm:arm.id,error:e.message,usage,skips,stages,requests:context.requests},null,2));
      console.error(source.caseId,arm.id,e.message);
    }
  });
}}));
