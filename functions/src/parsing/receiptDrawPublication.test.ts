import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import fixture from './__fixtures__/nov1-receipt-draw.json';
import {sourcePublicationHoldReason} from './sourcePublicationPolicy.js';
import {reconcileSourceItemEvidence, sourceItemHoldReason} from './sourceItemEvidence.js';
import {constrainSourceTimes} from './sourceTimeConstraints.js';
import {preserveValidatedItemSourceType} from './secondaryValidator.js';
import {parsePostData, replayPostDataFromArtifacts} from './postParser.js';
import {mergeStageArtifactsSnapshot, sanitizeStageArtifactsSnapshot} from '../processing/rowProcessor.js';

const original = fixture.original;
const reason = 'receipt_entry_draw_without_attendee_activity';
const items = (): any[] => original.stage3.map((item, index) => ({...structuredClone(item),
  description:'', recurringPattern:'none', _sourceType:'event', _pipelineIndex:index+1}));
const healthy = (patch: Record<string,unknown> = {}): any => ({name:'Public Bingo',
  description:'Public Bingo November 16, 6–8 PM. Play in person for cash prizes.',
  date:'2026-11-16', startTime:'18:00', endTime:'20:00', venue:'Example Hall', price:'$10',
  recurringPattern:'none', extractionReason:'A scheduled public bingo session.', _sourceType:'event',
  _pipelineIndex:3, ...patch});
const input = (caption = original.caption): any => ({combinedText:caption, mediaUrls:[], sharedPostThumbnails:[],
  userName:original.venue, pageName:original.venue, timestamp:'2026-11-01T12:00:00Z',
  facebookUrl:'', profilePicUrl:'', extractedData:{id:original.source}});
const config = (artifacts: any[]): any => ({lunaCanaryBypass:true, timezone:'America/Halifax',
  stageArtifactsHandler:(snapshot: unknown) => {artifacts.push(structuredClone(snapshot));}});
const held = (artifacts: any[]): any[] => artifacts.flatMap(snapshot => snapshot.stage3HeldItems || []);

function offline(t: TestContext, overrides: Record<string,string> = {}): void {
  const values: Record<string,string|undefined> = {DRY_RUN:'true', PARSER_DRY_RUN_LOCAL_IMAGES:'true',
    LUNA_CANARY_ENABLED:'false', LUNA_TEXT_ONLY_ENABLED:'true', ENABLE_STAGE2_SCORE_ROUTING:'false',
    ENABLE_MODEL_ROUTER:'false', IMAGE_UPLOAD_URL:undefined, IMAGE_DELETE_URL:undefined, ...overrides};
  const before = Object.fromEntries(Object.keys(values).map(key => [key,process.env[key]]));
  for (const [key,value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {for (const [key,value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected network request in offline receipt-draw test'));
}

test('original two Stage3 draw candidates gain a publication hold without new clocks or input mutation', () => {
  const source = items(), before = structuredClone(source);
  const out = constrainSourceTimes(source, original.caption);
  assert.deepEqual(out.map(sourceItemHoldReason), [reason,reason]);
  assert.deepEqual(out.map(item => [item.name,item.date,item.startTime,item.endTime]),
    before.map(item => [item.name,item.date,'','']));
  assert.deepEqual(source,before);
  assert.deepEqual(constrainSourceTimes(out,original.caption),out);
});

test('original held descriptions establish policy failure independently of missing-clock holds', () => {
  for (const saved of original.held) {
    const item: any = {...saved,date:saved.startDate,recurringPattern:'none'};
    assert.equal(sourcePublicationHoldReason(item,original.caption),reason);
    assert.equal(sourceItemHoldReason(reconcileSourceItemEvidence([item],original.caption)[0]),reason);
  }
});

test('adding a draw or submission clock cannot authorize a standalone receipt draw', () => {
  for (const text of ['Draw Dates: 2026 November 16th at 6 PM',
    'Draw Dates: 2026 November 16th. Entry submission closes at 6 PM']) {
    const caption = original.caption.replace('Draw Dates: 2026 November 16th',text);
    const [out] = constrainSourceTimes([{...items()[0],startTime:'18:00'}],caption);
    assert.equal(sourceItemHoldReason(out),reason);
    assert.equal(out.startTime,'18:00','hold preserves supplied evidence for review, without guessing');
  }
});

test('private hold survives validation metadata and saved snapshot sanitization', () => {
  const [item] = reconcileSourceItemEvidence(items(),original.caption);
  const validated: any = preserveValidatedItemSourceType({...item,_sourcePublicationHold:undefined},item);
  assert.equal(sourceItemHoldReason(validated),reason);
  const saved = sanitizeStageArtifactsSnapshot(mergeStageArtifactsSnapshot(undefined,
    {source:'live',stage3HeldItems:[validated]}));
  assert.equal(sourceItemHoldReason(saved!.stage3HeldItems![0]),reason);
  assert.equal(saved!.stage3HeldItems![0].date,'2026-11-16');
});

for (const patch of [
  {name:'Public Bingo'},
  {name:'Community Raffle Night',description:'Join our public raffle evening November 16, 6–8 PM.'},
  {name:'Live Prize Draw',description:'Watch the live prize draw November 16 at 6 PM.'},
  {name:'Burger discount',_sourceType:'special',description:'Buy a burger for $5, regularly $10.'},
  {name:'Donation Fundraising Dinner',description:'Come for a community dinner. Donations support the food bank.'},
  {name:'Free food samples',_sourceType:'special',description:'Visit for free in-person food samples.'},
  {name:'Free meal giveaway',_sourceType:'special',description:'Pick up a free meal in person November 16.'},
  {name:'Win Your Meal contest draw',_sourceType:'special',description:'Dine in for receipt entry to the draw; this item is the food-purchase promotion.'},
  {name:'Win Your Meal contest draw',_sourceType:'calendar',type:'special',description:'Dine in for receipt entry to the draw; this item is the food-purchase promotion.'},
]) test(`healthy control retains ${patch.name}${'_sourceType' in patch ? ' ('+patch._sourceType+')' : ''}`, () => {
  const item = healthy(patch);
  assert.equal(sourcePublicationHoldReason(item,original.caption+'\n\n'+item.description),undefined);
});

test('an unrelated public activity cannot defeat the draw hold or acquire it', () => {
  for (const separator of ['\n','\n\n']) {
    const caption = original.caption.replace('\n\nOCR TEXT:',separator+healthy().description+'\n\nOCR TEXT:');
    const out = reconcileSourceItemEvidence([...items(),healthy()],caption);
    assert.deepEqual(out.map(sourceItemHoldReason),[reason,reason,undefined]);
  }
});

test('receipt mechanics from another source block cannot hold a distinct draw', () => {
  const item = healthy({name:'Community Prize contest draw',description:'A random contest draw November 16.'});
  assert.equal(sourcePublicationHoldReason(item,original.caption+'\n\nCommunity Prize contest draw November 16.'),undefined);
  assert.equal(sourcePublicationHoldReason(items()[0],'Win Your Meal draw November 16.'),undefined);
  assert.equal(sourcePublicationHoldReason(items()[0],original.caption.replace('Win Your Meal','Different Contest').replace('WIN YOUR MEAL','DIFFERENT CONTEST')),undefined);
});

for (const attendance of ['Watch the live draw at 6 PM.', 'Join us for the Win Your Meal draw at 6 PM.',
  'The draw will be open to the public at 6 PM.', 'Attend the draw at 6 PM.',
  'Winners will be selected live at 6 PM.', 'You must be present to win.'])
  test(`explicit draw attendance remains eligible: ${attendance}`, () => {
    const caption = original.caption.replace('How to enter:',attendance+'\nHow to enter:');
    assert.equal(sourcePublicationHoldReason(items()[0],caption),undefined);
  });

test('repeated named source blocks leave ambiguous attendance for review', () => {
  const caption = original.caption.replace('\n\nOCR TEXT:',
    '\n\nWin Your Meal draw: attend at 6 PM.\n\nOCR TEXT:');
  assert.equal(sourcePublicationHoldReason(items()[0],caption),undefined);
});

// These controls reproduce the independent review's paragraph/OCR failures with
// supplied clocks, so a missing-clock hold cannot conceal a publication mistake.
const appendCaption = (text: string, separator = '\n\n'): string =>
  original.caption.replace('\n#IslandChefDowntown',separator+text+'\n#IslandChefDowntown');
const withOcr = (text: string): string => original.caption.replace('May be an image of text',text);
const clockedDraw = (patch: Record<string,unknown> = {}): any =>
  ({...items()[0],startTime:'18:00',endTime:'19:00',...patch});

for (const separator of ['\n','\n\n','\r\n\r\n'])
  test(`attendance after the receipt paragraph is not suppressed (${JSON.stringify(separator)})`, () => {
    const caption = appendCaption('Watch the live draw at 6 PM on November 16 at Island Chef Downtown.',separator);
    const item = clockedDraw(), before = structuredClone(item);
    assert.equal(sourcePublicationHoldReason(item,caption),undefined);
    const [out] = constrainSourceTimes([item],caption);
    assert.equal(sourceItemHoldReason(out),undefined);
    assert.deepEqual([out.startTime,out.endTime],['18:00','19:00']);
    assert.deepEqual(item,before);
  });

for (const invitation of [
  'Watch the Win Your Meal draw at 6 PM on November 16.',
  'WIN YOUR MEAL DRAW:\nWatch the live draw at 6 PM on November 16.',
  'Watch the live draw at 6 PM on November 16.',
]) test(`poster-only attendance prevents an unsupported administrative assertion: ${invitation}`, () => {
  const caption = withOcr(invitation);
  assert.equal(sourcePublicationHoldReason(clockedDraw(),caption),undefined);
  assert.equal(sourceItemHoldReason(constrainSourceTimes([clockedDraw()],caption)[0]),undefined);
});

for (const field of ['description','extractionReason'])
  test(`item-local ${field} attendance is checked even when absent from the caption`, () => {
    const item = clockedDraw({[field]:'The source invites guests to watch the live draw at 6 PM on November 16.'});
    assert.equal(sourcePublicationHoldReason(item,original.caption),undefined);
    assert.equal(sourceItemHoldReason(constrainSourceTimes([item],original.caption)[0]),undefined);
  });

for (const caption of [
  appendCaption('Watch the live draw; the poster does not identify which contest.'),
  withOcr('Watch the other public draw at 6 PM.'),
  appendCaption('Win Your Meal draw: attendance details are unclear.'),
]) test(`unresolved attendance retains missing-clock review: ${caption.slice(-100)}`, () => {
  const item = items()[0], before = structuredClone(item);
  assert.equal(sourcePublicationHoldReason(item,caption),undefined);
  const [out] = constrainSourceTimes([item],caption);
  assert.equal((out as any)._sourcePublicationHold,undefined);
  assert.equal(out._sourceTimeConstraint?.reason,'dated_activity_without_clock');
  assert.deepEqual([out.startTime,out.endTime],['','']);
  assert.deepEqual(item,before);
});

const otherDraw = 'Community Prize draw:\nDine in and write your name and phone number on the back of your receipt.\n' +
  'Draw Dates: 2026 November 16th.\nWatch the live draw at 6 PM.';
const otherItem = (): any => clockedDraw({name:'Community Prize contest draw',description:'A random contest draw.'});

for (const location of ['caption','OCR']) test(`two named draws keep different attendance (${location})`, () => {
  const caption = location === 'caption' ? appendCaption(otherDraw) : withOcr(otherDraw);
  const [receipt,publicDraw] = reconcileSourceItemEvidence([clockedDraw(),otherItem()],caption);
  assert.equal(sourceItemHoldReason(receipt),reason,'unrelated named attendance cannot clear the receipt candidate');
  assert.equal(sourceItemHoldReason(publicDraw),undefined,'the public draw cannot acquire the receipt candidate hold');
});

for (const invitation of ['Watch the live prize draw at 6 PM.', 'Watch the in-person draw at 6 PM.',
  'The Community Prize draw will be live at 6 PM.', 'Winners will be selected live at 6 PM.'])
  test(`a different named draw keeps its own attendance scope: ${invitation}`, () => {
    const caption = appendCaption(otherDraw.replace('Watch the live draw at 6 PM.',invitation));
    assert.equal(sourcePublicationHoldReason(clockedDraw(),caption),reason);
    assert.equal(sourcePublicationHoldReason(otherItem(),caption),undefined);
  });

test('a named invitation remains local when two draws share a paragraph', () => {
  const caption = appendCaption('Community Prize draw:\nWatch the Community Prize draw at 6 PM.','\n');
  assert.equal(sourcePublicationHoldReason(clockedDraw(),caption),reason);
  assert.equal(sourcePublicationHoldReason(otherItem(),caption),undefined);
});

test('an unscoped invitation is not assigned to a different named draw elsewhere', () => {
  const caption = appendCaption(otherDraw+'\n\nWatch the live draw at 7 PM.');
  const [out] = constrainSourceTimes([items()[0]],caption);
  assert.equal(sourcePublicationHoldReason(items()[0],caption),undefined);
  assert.equal((out as any)._sourcePublicationHold,undefined);
  assert.equal(out._sourceTimeConstraint?.reason,'dated_activity_without_clock');
});

test('a second unscoped invitation in the same statement prevents a cross-draw assertion', () => {
  const caption = appendCaption(otherDraw+'\nWatch the Community Prize draw and attend the draw at 7 PM.');
  assert.equal(sourcePublicationHoldReason(clockedDraw(),caption),undefined);
});

for (const [caption,ocr] of [
  [appendCaption('The drawing is private; winners will be contacted.'),
    'Watch the Win Your Meal draw at 6 PM on November 16.'],
  [appendCaption('Watch the live draw at 6 PM on November 16.'),
    'Win Your Meal draw: private administrative selection; winners will be contacted.'],
]) test('caption/poster disagreement cannot establish absence of attendee evidence', () => {
  const combined = caption.replace('May be an image of text',ocr);
  assert.equal(sourcePublicationHoldReason(clockedDraw(),combined),undefined);
  assert.equal(sourceItemHoldReason(constrainSourceTimes([clockedDraw()],combined)[0]),undefined);
});

test('dinner, concert and public bingo attendance do not clear the receipt draws', () => {
  const caption = appendCaption('Public Bingo: play in person at 6 PM.\n' +
    'Join us for dinner at 5 PM.\nAttend the concert at 8 PM.');
  assert.deepEqual(constrainSourceTimes(items(),caption).map(sourceItemHoldReason),[reason,reason]);
  assert.equal(sourcePublicationHoldReason(healthy(),caption),undefined);
});

for (const stage of ['stage3Items','stage4Items'])
  test(`${stage} replay passes clocked public-draw evidence through to formatting`, async t => {
    offline(t); const artifacts: any[] = []; let formatted: any[] = [];
    const caption = withOcr('Watch the Win Your Meal draw at 6 PM on November 16.');
    t.mock.method(require('./secondaryValidator.js'),'performSecondaryValidation',async (source: any[]) => source);
    t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async (source: any[]) => {formatted=source; return [];});
    await replayPostDataFromArtifacts(input(caption),{}, {[stage]:[clockedDraw()],contentType:'EVENT'},config(artifacts));
    assert.equal(formatted.length,1);
    assert.equal(formatted[0].name,'Win Your Meal contest draw');
    assert.equal(sourceItemHoldReason(formatted[0]),undefined);
    assert.deepEqual(held(artifacts),[]);
  });

for (const stage of ['stage3Items','stage4Items']) test(`saved ${stage} replay retains both holds before any model or venue lookup`, async t => {
  offline(t);
  const artifacts: any[] = [];
  const secondary = t.mock.method(require('./secondaryValidator.js'),'performSecondaryValidation',async () => assert.fail('Held draw reached validation'));
  const format = t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async () => assert.fail('Held draw reached formatting'));
  const lookup = t.mock.method(require('../services/firestoreService.js'),'findVenueByName',async () => assert.fail('Held draw reached venue lookup'));
  const out = await replayPostDataFromArtifacts(input(),{}, {[stage]:items(),contentType:'EVENT'},config(artifacts));
  assert.deepEqual(out,[]);
  assert.deepEqual(held(artifacts).map(sourceItemHoldReason),[reason,reason]);
  assert.equal(secondary.mock.callCount(),0); assert.equal(format.mock.callCount(),0); assert.equal(lookup.mock.callCount(),0);
});

test('mixed replay preserves the real activity while stripped Stage4 cannot resurrect draw holds', async t => {
  offline(t); const artifacts: any[] = []; let formatted: any[] = [];
  const stripped = items().map(item => ({...item,description:'Draw',extractionReason:''}));
  t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async (source: any[]) => {formatted=source; return [];});
  await replayPostDataFromArtifacts(input(original.caption+'\n\n'+healthy().description),{},
    {stage3Items:[...items(),healthy()],stage4Items:[...stripped,healthy()],contentType:'EVENT'},config(artifacts));
  assert.equal(formatted.length,1); assert.equal(formatted[0].name,'Public Bingo');
  assert.equal(held(artifacts).length,4);
  assert(held(artifacts).every(item => sourceItemHoldReason(item) === reason));
});

for (const mode of ['primary','fallback']) test(`live ${mode} extraction retains both draws privately without downstream model calls`, async t => {
  offline(t,{ENABLE_MODEL_ROUTER:'true',ENABLE_MODEL_ROUTER_STAGE3_EVENT:'true',
    MODEL_ROUTER_STAGE3_EVENT_MODEL_LOW:'offline-primary',MODEL_ROUTER_STAGE3_EVENT_MODEL_HIGH:'offline-primary',
    MODEL_ROUTER_FALLBACK_MODEL:'offline-fallback',MODEL_ROUTER_UNKNOWN_ITEMCOUNT_FORCE_HIGH:'false',
    ENABLE_MODEL_ROUTER_FALLBACK_RETRY:'true'});
  const artifacts: any[] = []; let calls = 0;
  t.mock.method(require('./contentClassifier.js'),'classifyContent',async () => ({contentType:'EVENT',confidence:1}));
  t.mock.method(require('./eventExtractor.js'),'extractContentByType',async () => {calls++; return mode==='fallback' && calls===1 ? [] : items();});
  for (const [module,method] of [['ticketLinkEnricher','enrichEventsFromTicketLinks'],
    ['calendarLinkEnricher','enrichEventsFromCalendarLinks'],['websiteDetailEnricher','enrichEventsFromVenueWebsite']]) {
    t.mock.method(require(`./${module}.js`),method,async (source: unknown[]) => ({items:source,summary:{attemptedUrls:[],reason:'offline'}}));
  }
  const secondary = t.mock.method(require('./secondaryValidator.js'),'performSecondaryValidation',async () => assert.fail('Held draw reached validation'));
  const format = t.mock.method(require('./finalFormatter.js'),'performFinalFormatting',async () => assert.fail('Held draw reached formatting'));
  t.mock.method(require('../services/firestoreService.js'),'findVenueByName',async () => assert.fail('Held draw reached lookup'));
  const out = await parsePostData(input(),{}, {...config(artifacts),stage1EvaluationValidationOverride:{
    imageAnalysis:[],hasValidContent:true,confidence:1,validationDecision:'VALIDATION_PASSED',reason:'Saved source fixture'}});
  assert.deepEqual(out,[]); assert.equal(calls,mode==='fallback' ? 2 : 1);
  assert.deepEqual(held(artifacts).map(sourceItemHoldReason),[reason,reason]);
  assert.equal(secondary.mock.callCount(),0); assert.equal(format.mock.callCount(),0);
});
