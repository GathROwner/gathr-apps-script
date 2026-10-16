import test from 'node:test';import assert from 'node:assert/strict';
import {expandFestivalSourceScope,validFestivalSourceScope,festivalSourceHeadingDates} from './festivalSourceScope.js';
const item=(scopeText:string,dateText:string,sourceIndices=[0],venueText='Hall')=>({scopeText,dateText,sourceIndices,timeText:'6 p.m.',venueText});
test('image date headings govern exact multiline activities in their own ordered image',()=>{
 const row='6 p.m.\nMurder Mystery Night\nLocation: Hall',docs=[{index:-1,text:''},{index:0,text:'FRIDAY, OCTOBER 16\n'+row}];
 const e=expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16'),docs);assert(e.sourceScope);assert.equal(e.sourceScope.documentIndex,0);
 assert(validFestivalSourceScope({scope:e.sourceScope,documents:docs,scopeText:e.scopeText,rowText:row,dateText:e.dateText,timeText:e.timeText,venueText:e.venueText}));
 assert.deepEqual(festivalSourceHeadingDates(e.dateHeaderText!,2026),['2026-10-16']);
});
test('French and explicit two-date headings bind only the printed days',()=>{
 assert.deepEqual(festivalSourceHeadingDates('VENDREDI 16 OCTOBRE',2026),['2026-10-16']);
 assert.deepEqual(festivalSourceHeadingDates('JEUDI 22 ET VENDREDI 23 OCTOBRE',2026),['2026-10-22','2026-10-23']);
 assert.deepEqual(festivalSourceHeadingDates('THURSDAY, OCTOBER 22\nAND FRIDAY, OCTOBER 23',2026),['2026-10-22','2026-10-23']);
 for(const s of ['OCTOBER 15 TO 31','DU 15 AU 31 OCTOBRE','Friday, October 15, 2026','October 16, 2025'])assert(!festivalSourceHeadingDates(s,2026).includes('2026-10-16'));
});
test('caption prose binds a shared date and venue without borrowing another row clock',()=>{
 const header='Join us this Saturday, October 17, for great music at Hall!',row='Salty Sailors | 3–5 PM';
 const docs=[{index:-1,text:`Harvest Fest!\n\n${header}\n\n${row}\nVintage | 6–8 PM`}];
 const e=expandFestivalSourceScope({...item(row,'Saturday, October 17',[-1]),timeText:'3–5 PM'},docs);assert(e.sourceScope);assert.equal(e.sourceScope.kind,'caption_context');
 assert.deepEqual(festivalSourceHeadingDates(header,2026,'caption_context'),['2026-10-17']);
 assert(!expandFestivalSourceScope({...item(row,'Saturday, October 17',[-1]),timeText:'6–8 PM'},docs).sourceScope);
});
test('a competing venue, festival or date between context and row blocks inheritance',()=>{
 const header='Join us this Saturday, October 17, at Hall!',row='Salty Sailors | 3–5 PM';
 for(const barrier of ['Location: Other Hall','At Other Hall','Other Festival programme','Sunday, October 18','October 18–20']){
  const docs=[{index:-1,text:`${header}\n${barrier}\n${row}`}];
  assert.equal(expandFestivalSourceScope({...item(row,'Saturday, October 17',[-1]),timeText:'3–5 PM'},docs).sourceScope,undefined,barrier);
 }
});
test('matching words on another image cannot supply date or venue context',()=>{
 const row='6 p.m.\nShow\nLocation: Hall';
 assert(!expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16',[0,1]),[{index:0,text:'FRIDAY, OCTOBER 16'},{index:1,text:row}]).sourceScope);
 assert(!expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16',[0]),[{index:0,text:'SATURDAY, OCTOBER 17\n'+row},{index:1,text:'FRIDAY, OCTOBER 16\n'+row}]).sourceScope);
});
test('identical rows under distinct dates bind independently; same-date duplicates stay held',()=>{
 const row='6 p.m.\nShow\nLocation: Hall';
 const docs=[{index:0,text:'FRIDAY, OCTOBER 16\n'+row+'\nSATURDAY, OCTOBER 17\n'+row}];
 const a=expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16'),docs),b=expandFestivalSourceScope(item(row,'SATURDAY, OCTOBER 17'),docs);assert(a.sourceScope&&b.sourceScope);assert(a.sourceScope.rowStart<b.sourceScope.rowStart);
 assert(!expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16'),[{index:0,text:'FRIDAY, OCTOBER 16\n'+row+'\n'+row}]).sourceScope);
});
test('altered, substring, fractional and cross-image offsets cannot validate',()=>{
 const row='6 p.m.\nShow\nLocation: Hall',docs=[{index:0,text:'😀\r\nFRIDAY, OCTOBER 16\r\n'+row}];
 const e=expandFestivalSourceScope(item(row,'FRIDAY, OCTOBER 16'),docs);assert(e.sourceScope);
 for(const patch of [{rowStart:e.sourceScope.rowStart+1},{rowStart:1.5},{documentIndex:1},{dateStart:0},{contextEnd:e.sourceScope.contextEnd-1}])assert(!validFestivalSourceScope({scope:{...e.sourceScope,...patch},documents:docs,scopeText:e.scopeText,rowText:row,dateText:e.dateText,timeText:e.timeText,venueText:e.venueText}));
 assert(!expandFestivalSourceScope(item('Show','FRIDAY, OCTOBER 16'),docs).sourceScope);
});
test('prose with multiple dates, wrong weekday or conflicting year does not yield a date',()=>{
 for(const h of ['Join us Saturday, October 17 and Sunday, October 18 at Hall','Join us Friday, October 17 at Hall','Join us Saturday, October 17 at Hall for our 2025 programme'])assert.deepEqual(festivalSourceHeadingDates(h,2026,'caption_context'),[]);
});
