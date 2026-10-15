import test from 'node:test';
import assert from 'node:assert/strict';
import {expandFestivalCaptionDateScope,validFestivalCaptionScope} from './festivalCaptionScope.js';
const row='⚓️9:00 am - The Arts Guild: ANCHOR Fest Conference & Panel Discussion';
const header15='Thursday, October 15, 2026 events:',header16='Friday, October 16, 2026 events:';
const text=`Programme\n${header15}\n${row} \nUnrelated row\n${header16}\n${row} \nLast row`;
const documents=[{index:-1,text},{index:0,text:'Different card'}];
const item=(dateText:string)=>({scopeText:row,dateText,sourceIndices:[-1]});

test('repeated literal conference rows bind distinct governing heading/row offsets',()=>{
  const a=expandFestivalCaptionDateScope(item('Thursday, October 15, 2026'),documents);
  const b=expandFestivalCaptionDateScope(item('Friday, October 16, 2026'),documents);
  assert(a.captionScope&&b.captionScope);assert(a.captionScope.rowStart<b.captionScope.rowStart);
  assert.equal(a.dateHeaderText,header15);assert.equal(b.dateHeaderText,header16);
  for(const x of [a,b])assert(validFestivalCaptionScope({scope:x.captionScope!,documents,scopeText:x.scopeText,rowText:row,headerText:x.dateHeaderText!}));
});
test('a duplicate under the same date stays ambiguous; another date cannot govern it',()=>{
  const repeated=[{index:-1,text:`${header15}\n${row}\n${row}`}];
  assert.equal(expandFestivalCaptionDateScope(item('Thursday, October 15, 2026'),repeated).captionScope,undefined);
  assert.equal(expandFestivalCaptionDateScope(item('Saturday, October 17, 2026'),documents).captionScope,undefined);
});
test('row offsets cannot borrow earlier heading across another date or another card',()=>{
  const x=expandFestivalCaptionDateScope(item('Friday, October 16, 2026'),documents);assert(x.captionScope);
  const before=text.indexOf(header15);
  const scope={...x.captionScope,headerStart:before,headerEnd:before+header15.length};
  assert(!validFestivalCaptionScope({scope,documents,scopeText:text.slice(before,scope.rowEnd),rowText:row,headerText:header15}));
  assert(!validFestivalCaptionScope({scope:{...x.captionScope,documentIndex:0} as any,documents,scopeText:x.scopeText,rowText:row,headerText:header16}));
});
test('offsets preserve CRLF/emoji positions and reject changed, fractional or substring row claims',()=>{
  const doc=[{index:-1,text:`😀 Intro\r\n${header16}\r\n${row}\r\n`}];
  const x=expandFestivalCaptionDateScope(item('Friday, October 16, 2026'),doc);assert(x.captionScope);
  assert(validFestivalCaptionScope({scope:x.captionScope,documents:doc,scopeText:x.scopeText,rowText:row,headerText:x.dateHeaderText!}));
  for(const n of [-1,1.5,x.captionScope.rowStart+1])assert(!validFestivalCaptionScope({scope:{...x.captionScope,rowStart:n},documents:doc,scopeText:x.scopeText,rowText:row,headerText:x.dateHeaderText!}));
  assert.equal(expandFestivalCaptionDateScope({...item('Friday, October 16, 2026'),scopeText:'ANCHOR Fest Conference & Panel Discussion'},doc).captionScope,undefined);
});
