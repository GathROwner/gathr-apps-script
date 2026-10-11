// Experimental Nano request layout. No runtime imports, wording changes or model changes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export function stage4CacheLayout(original){
  assert.equal(original.model,'gpt-5-nano');
  assert.equal(original.reasoning?.effort,'low');
  assert.equal(original.input.length,1);
  const message=original.input[0];
  assert.equal(message.role,'user');assert.equal(message.content.length,1);
  assert.equal(message.content[0].type,'input_text');
  const text=message.content[0].text;
  const begin=text.indexOf('CURRENT CONTEXT:\n');
  const rules=text.indexOf('IMPORTANT CONTEXT:',begin);
  const contract=text.indexOf('CRITICAL JSON FORMATTING REQUIREMENTS:',rules);
  assert(begin>0&&rules>begin&&contract>rules,'Recognized validation prompt required');
  const changing=text.slice(begin,rules);
  const stable=text.slice(0,begin)+text.slice(rules,contract);
  const tail=text.slice(contract);
  const bag=s=>s.split('\n').filter(x=>x.trim()).sort();
  assert.deepEqual(bag(stable+changing+tail),bag(text),'Lost or duplicated prompt lines');
  const itemsAt=changing.indexOf('ITEMS TO VALIDATE:\n');assert(itemsAt>0);
  const items=JSON.parse(changing.slice(itemsAt+'ITEMS TO VALIDATE:\n'.length));
  assert(Array.isArray(items));
  const body={...original,input:[{...message,content:[
    {type:'input_text',text:stable},{type:'input_text',text:changing},{type:'input_text',text:tail}
  ]}],prompt_cache_key:'gathr-stage4-rules-json-last-v2'};
  const {input:oldInput,...oldSettings}=original;
  const {input:newInput,prompt_cache_key,...newSettings}=body;
  assert.deepEqual(newSettings,oldSettings);
  assert(!('prompt_cache_options' in body));
  return {body,prefix:digest(stable),prefixChars:stable.length,sourceChars:changing.length,contractChars:tail.length,
    originalHash:digest(original),candidateHash:digest(body),items};
}
