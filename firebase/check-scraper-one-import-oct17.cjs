// Offline scratch adapter compatibility against the captured serving importer.
// No production modules are imported; VM blocks all network/cloud dependencies.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const D=path.join(__dirname,'../functions/artifacts/scraper-one-oct17');
const XLSX=require(path.join(D,'offline-deps/node_modules/xlsx'));
const ts=require(path.join(D,'offline-deps/node_modules/typescript'));
const read=n=>JSON.parse(fs.readFileSync(path.join(D,n),'utf8'));
const save=(n,x)=>fs.writeFileSync(path.join(D,n),JSON.stringify(x,null,2));
const loaded={};
function load(name){
 if(loaded[name])return loaded[name];
 const ex={};const source=fs.readFileSync(path.join(D,'runtime/lib/services',name+'.js'),'utf8');
 const blocked=()=>{throw Error('Offline test forbids cloud/network access')};
 const context={exports:ex,module:{exports:ex},Buffer,Date,URL,URLSearchParams,process:{env:{}},console:{log(){},warn(){},error(){}},setTimeout:blocked,fetch:blocked,require:id=>{
  if(id==='xlsx')return XLSX;
  if(['crypto','node:stream'].includes(id))return require(id);
  if(id==='../utils/logger.js')return {logger:new Proxy({}, {get:()=>()=>{}})};
  if(id==='./apifyService.js')return load('apifyService');
  if(id==='googleapis')return {google:new Proxy({}, {get:()=>blocked})};
  throw Error('Offline dependency blocked '+id);
 }};
 vm.runInNewContext(source,context,{timeout:1500,filename:name});loaded[name]=ex;return ex;
}
const source=fs.readFileSync(path.join(D,'runtime/lib/processing/rowProcessor.js'),'utf8');
const ast=ts.createSourceFile('rowProcessor.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validateRowData');
if(!fn)throw Error('Serving validation function missing');
const validate=vm.runInNewContext('('+fn.getText(ast)+')',{}, {timeout:1000});
function images(r){
 const out=[];
 for(const m of [...(r.attachments||[]),...(r.sharedPost?.attachments||[])]){
  const u=m.thumbnailUrl||m.thumbnail||m.image?.uri||(m.type==='photo'?m.url:null);
  if(typeof u==='string'&&/^https?:/.test(u)&&!out.includes(u))out.push(u);
 }
 return out;
}
function date(n){return typeof n==='number'?new Date(n<1e12?n*1000:n).toISOString():''}
function adapt(r){
 const a=r.author||{},s=r.sharedPost||{},sa=s.author||{},urls=images(r);
 return {Text:r.postText||'','Sharedpost Text':s.postText||'','User Name':a.name||'',Pagename:a.name||'',Time:date(r.timestamp),Facebookurl:r.inputUrl||'',topLevelUrl:r.url||'',postId:r.postId||'',profilePicUrl:a.profilePicture||'',mediaUrls:JSON.stringify(urls),likes:r.reactionsCount??'',shares:r.sharesCount??'',comments:r.commentsCount??'',topReactionsCount:r.reactions?Object.keys(r.reactions).length:'','sharedPost/user/name':sa.name||'','sharedPost/user/profileUrl':sa.profileUrl||'','sharedPost/url':s.url||'','sharedPost/time':date(s.timestamp)};
}
(async()=>{
 const label=process.argv[2]||'smoke',prefix=label==='smoke'?'scratch':'corrected';
 const m=read('manifest.json'),e=m.runs.find(x=>x.label===label);if(!e?.collected)throw Error('Requested run incomplete');
 const raw=read(e.id+'-items.json').filter(r=>r.postId&&!r.error),rows=raw.map(adapt);
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet(rows),'Data');
 const buf=XLSX.write(w,{type:'buffer',bookType:'xlsx'});fs.writeFileSync(path.join(D,prefix+'-adapted-'+label+'.xlsx'),buf);
 const parsed=(await load('driveService').parseXlsxFile(buf)).rows;
 const checks=raw.map((r,i)=>{const p=parsed[i],s=r.sharedPost||{};return {postId:r.postId,source:r.inputUrl,validation:validate(p),captionPreserved:p.text===(r.postText||''),sharedCaptionPreserved:p.sharedPostText===(s.postText||''),outerIdPreserved:p.uniqueId===r.postId,sourceUrlPreserved:p.facebookUrl===r.inputUrl,timestampPreserved:p.timestamp===date(r.timestamp),mediaPreserved:JSON.stringify(p.mediaUrls||[])===JSON.stringify(images(r)),sharedAuthorPreserved:(p.sharedPostAuthorName||'')===(s.author?.name||''),sharedProfilePreserved:(p.sharedPostAuthorUrl||'')===(s.author?.profileUrl||''),sharedUrlPreserved:(p.sharedPostUrl||'')===(s.url||''),sharedTimePreserved:(p.sharedPostTimestamp||'')===date(s.timestamp),videoAttachmentsWithoutImage:[...(r.attachments||[]),...(s.attachments||[])].filter(a=>a.type==='video'&&!a.thumbnail&&!a.thumbnailUrl&&!a.image?.uri).length}});
 save(prefix+'-adapted-'+label+'.json',rows);save(prefix+'-imported-'+label+'.json',parsed);save(prefix+'-import-checks.json',checks);
 const summary={runtime:read('runtime-provenance.json'),networkBlocked:true,cloudClientsBlocked:true,modelCalls:0,productionWrites:0,rawPosts:raw.length,parsedRows:parsed.length,validRows:checks.filter(x=>x.validation.isValid).length,validationFailures:checks.filter(x=>!x.validation.isValid),preservationFailures:checks.filter(x=>Object.entries(x).some(([k,v])=>k.endsWith('Preserved')&&!v)),videoAttachmentCountWithoutThumbnail:checks.reduce((n,x)=>n+x.videoAttachmentsWithoutImage,0),validationFunctionSha256:crypto.createHash('sha256').update(fn.getText(ast)).digest('hex')};
 save(prefix+'-import-summary.json',summary);console.log(JSON.stringify({revision:summary.runtime.revision,rows:summary.rawPosts,validRows:summary.validRows,preservationFailures:summary.preservationFailures.length,validationFailures:summary.validationFailures.map(x=>({postId:x.postId,errors:x.validation.errors})),videoAttachmentCountWithoutThumbnail:summary.videoAttachmentCountWithoutThumbnail}));
 if(label==='corrected-daily-20'){
  const norm=u=>{const x=new URL(u);return 'facebook.com'+x.pathname.replace(/\/$/,'').toLowerCase()+(x.pathname==='/profile.php'?x.search:'')};
  const key=(u,id)=>norm(u)+'|'+id;
  const baseline=await load('driveService').parseXlsxFile(fs.readFileSync(path.join(__dirname,'../functions/artifacts/luna-oct17-production-audit/input.xlsx')));
  const wanted=new Set(read('corrected-post-comparisons.json').map(r=>key(r.source,r.postId)));
  const controls=baseline.rows.filter(r=>wanted.has(key(r.facebookUrl,r.uniqueId))).map(r=>({key:key(r.facebookUrl,r.uniqueId),source:r.facebookUrl,postId:r.uniqueId,validation:validate(r)}));
  const cc=new Map(checks.map(x=>[key(x.source,x.postId),x]));
  const regressions=controls.filter(x=>x.validation.isValid&&!cc.get(x.key)?.validation.isValid);
  const comparison={baselineWorkbook:'luna-oct17-production-audit/input.xlsx',baselineMatchedControls:controls.length,baselineValid:controls.filter(x=>x.validation.isValid).length,candidateMatchedValid:controls.filter(x=>cc.get(x.key)?.validation.isValid).length,baselineAlreadyInvalid:controls.filter(x=>!x.validation.isValid),newValidationRegressions:regressions,controls};
  save('matched-import-control-comparison.json',comparison);console.log(JSON.stringify({...comparison,controls:undefined}));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
