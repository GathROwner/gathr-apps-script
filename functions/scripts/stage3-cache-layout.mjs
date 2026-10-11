// Experimental request layout only. No wording changes or runtime integration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha = value => createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function stage3CacheLayout(original, source) {
  assert.equal(original.model,'gpt-6-luna');
  assert.equal(original.input.length,1);
  const message=original.input[0];
  assert.equal(message.role,'user');
  assert.equal(message.content.filter(p=>p.type==='input_text').length,1);
  const text=message.content[0].text;
  const sourceAt=text.indexOf('CONTENT:\n');
  if(sourceAt<0) return {body:original,applied:false,reason:'Auxiliary request has no recognized source block'};
  const caption='- Text: "'+source.caption+'"';
  const captionAt=text.indexOf(caption,sourceAt);
  assert(captionAt>sourceAt,'Exact source caption required');
  const sourceEnd=captionAt+caption.length;
  const sourceBlock=text.slice(sourceAt,sourceEnd);
  let stable=text.slice(0,sourceAt)+text.slice(sourceEnd);
  let fields='';
  const starts=['For each EVENT found, extract:','For each SPECIAL found, extract:','For each item found, extract:'];
  const fieldAt=starts.map(s=>stable.indexOf(s)).find(i=>i>=0);
  if(fieldAt!==undefined){
    const delimiters=['\nSERIES SPLITTING RULE:','\nPay special attention to:','\nLook for patterns like:'];
    const ends=delimiters.map(s=>stable.indexOf(s,fieldAt)).filter(i=>i>fieldAt);
    assert(ends.length,'Recognized complete field block required');
    const fieldEnd=Math.min(...ends);
    fields=stable.slice(fieldAt,fieldEnd);
    stable=stable.slice(0,fieldAt)+stable.slice(fieldEnd);
    // Keep the venue instruction inside its entire field list, immediately before CONTENT.
    assert(fields.includes('- venue:'));
  }
  const anchors=[];
  for(const line of stable.split('\n')){
    if(line.includes(source.timestamp)) { anchors.push(line); stable=stable.replace(line,''); }
  }
  assert(!stable.includes(source.timestamp));
  assert(!source.venue || !stable.includes(source.venue),'Source-specific venue leaked into cache prefix');
  const dynamic=[...anchors,fields,sourceBlock].filter(Boolean).join('\n\n');
  const lines=x=>x.split('\n').filter(x=>x.trim()).sort();
  assert.deepEqual(lines(stable+'\n'+dynamic),lines(text),'Every original nonempty line must occur exactly once');
  const content=[{type:'input_text',text:stable,prompt_cache_breakpoint:{mode:'explicit'}},{type:'input_text',text:dynamic},...message.content.slice(1)];
  assert.deepEqual(content.slice(2),message.content.slice(1),'Image bytes/order/detail changed');
  const body={...original,input:[{...message,content}],prompt_cache_options:{mode:'explicit',ttl:'30m'}};
  assert.deepEqual(body.reasoning,original.reasoning);
  assert.deepEqual(body.text,original.text);
  assert.equal(body.max_output_tokens,original.max_output_tokens);
  return {body,applied:true,prefix:sha(stable),prefixChars:stable.length,fieldsChars:fields.length,sourceChars:sourceBlock.length,originalHash:sha(original),candidateHash:sha(body)};
}
