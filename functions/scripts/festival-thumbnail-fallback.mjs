// Opt-in recovery after a source-quality failure. No gallery substitutions or upscaling.
import {createHash} from 'node:crypto';
export function imageDimensions(b){
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b.length<4||b[0]!==255||b[1]!==216)return;
 let p=2;while(p+4<=b.length){if(b[p++]!==255)return;while(b[p]===255)p++;const marker=b[p++];if(marker===217||marker===218)return;if(marker===1||marker>=208&&marker<=215)continue;const size=b.readUInt16BE(p);if(size<2||p+size>b.length)return;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=7)return{height:b.readUInt16BE(p+3),width:b.readUInt16BE(p+5)};p+=size;}
}
export function largerFacebookThumbnailCandidate(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||!u.hostname.endsWith('.fbcdn.net')||!/^\/v\//.test(u.pathname)||!u.searchParams.has('ctp'))return;u.searchParams.delete('ctp');return u.toString();}catch{return;}
}
async function readImage(url,fetchImpl){
 const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(response.status!==200||!/^image\/(?:jpeg|png)/i.test(response.headers.get('content-type')||''))throw Error('source_image_unavailable');
 const parts=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>20*1024*1024)throw Error('source_image_size_hold');parts.push(chunk);}
 const buffer=Buffer.concat(parts),dimensions=imageDimensions(buffer);
 if(!dimensions||!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>32000000||Math.max(dimensions.width,dimensions.height)>8192)throw Error('source_image_dimensions_hold');
 return{...dimensions,bytes,sha256:createHash('sha256').update(buffer).digest('hex')};
}
export async function recoverUnreadableFestivalThumbnails({caption,imageUrls,failedCapture,fetchImpl=fetch}){
 if(failedCapture?.capture?.caption!==caption||JSON.stringify(failedCapture?.capture?.imageUrls)!==JSON.stringify(imageUrls))throw Error('failed_capture_source_changed');
 const raw=failedCapture?.diagnostics?.rawResponses?.[0];
 const text=raw?.output_text||(raw?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 let result;try{result=JSON.parse(text);}catch{throw Error('source_quality_failure_required');}
 if(failedCapture.error!=='source_incomplete'||result.complete!==false||!result.limitations?.some(x=>/small|blur|unreadable|resolution|read reliably/i.test(x)))throw Error('source_quality_failure_required');
 if(!Array.isArray(imageUrls)||imageUrls.length>20)throw Error('source_size_hold');
 const resolved=[...imageUrls],versions=[];
 for(const [index,originalUrl]of imageUrls.entries()){
  const candidate=largerFacebookThumbnailCandidate(originalUrl);if(!candidate)continue;
  try{
   const original=await readImage(originalUrl,fetchImpl);if(Math.max(original.width,original.height)>1024)continue;
   const larger=await readImage(candidate,fetchImpl);
   if(larger.width*larger.height<=original.width*original.height||Math.abs((larger.width/larger.height)/(original.width/original.height)-1)>.02)continue;
   resolved[index]=candidate;versions.push({sourceGalleryIndex:index,originalUrl,resolvedUrl:candidate,assetPath:new URL(originalUrl).pathname,original,larger});
  }catch(error){versions.push({sourceGalleryIndex:index,originalUrl,recovered:false,reason:error.message});}
 }
 return{imageUrls:resolved,versions,changed:resolved.some((u,i)=>u!==imageUrls[i]),reason:'explicit_unreadable_source_fallback',upscaled:false};
}
