/** Read an explicitly saved, measured thumbnail recovery. Never fetch or retry.
 * The original source remains the cache/ownership identity. Only removing the
 * original Facebook thumbnail parameter can supply higher-resolution evidence.
 */
export function festivalCaptureSource(capture:Record<string,any>,source:{caption:string;imageUrls:string[]},fingerprint:(value:{caption:string;imageUrls:string[]})=>string):{caption:string;imageUrls:string[]} {
 const receipt=capture.sourceRecovery;if(!receipt)return source;
 const fail=()=>{throw Error('festival_capture_source_recovery_invalid');};
 if(receipt.version!==1||receipt.reason!=='explicit_unreadable_source_fallback'||receipt.upscaled!==false||receipt.originalSourceFingerprint!==fingerprint(source)||
  !Array.isArray(receipt.imageUrls)||receipt.imageUrls.length!==source.imageUrls.length||!Array.isArray(receipt.versions)||receipt.versions.length>20)fail();
 const changed=source.imageUrls.flatMap((url,i)=>url===receipt.imageUrls[i]?[]:[i]);if(!changed.length||changed.length!==receipt.versions.length)fail();
 const indexes=new Set<number>();
 for(const v of receipt.versions){
  const i=v.sourceGalleryIndex;if(!Number.isInteger(i)||!changed.includes(i)||indexes.has(i))fail();indexes.add(i);
  let original:URL;try{original=new URL(source.imageUrls[i]);}catch{return fail();}
  if(original.protocol!=='https:'||!original.hostname.endsWith('.fbcdn.net')||!original.pathname.startsWith('/v/')||!original.searchParams.has('ctp'))fail();
  if(v.originalUrl!==source.imageUrls[i]||v.assetPath!==original.pathname||v.resolvedUrl!==receipt.imageUrls[i])fail();
  original.searchParams.delete('ctp');if(original.toString()!==v.resolvedUrl)fail();
  for(const image of [v.original,v.larger])if(!image||![image.width,image.height,image.bytes].every(x=>Number.isSafeInteger(x)&&x>0)||image.bytes>20*1024*1024||
   !/^[a-f0-9]{64}$/.test(image.sha256)||image.width*image.height>32000000||Math.max(image.width,image.height)>8192)fail();
  if(Math.max(v.original.width,v.original.height)>1024||v.larger.width*v.larger.height<=v.original.width*v.original.height||v.larger.sha256===v.original.sha256||
   Math.abs((v.larger.width/v.larger.height)/(v.original.width/v.original.height)-1)>.02)fail();
 }
 return{caption:source.caption,imageUrls:[...receipt.imageUrls]};
}
