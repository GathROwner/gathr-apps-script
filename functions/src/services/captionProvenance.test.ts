import assert from 'node:assert/strict';
import test from 'node:test';
import {validatedSnapshotCaptionChannels, type ParseSnapshot} from '../types/index.js';
import {syntheticCaptionCapture} from './captionProvenance.testSupport.js';

// Protocol-only unit doubles assume the server-writer boundary. Authenticated
// ingestion is tested separately with a mocked Google transport in drive tests.
function fixture() {
  const s: ParseSnapshot={fileId:'unit-file',rowIndex:2,uniqueId:'unit-source',inputText:'Outer caption',stages:[]};
  syntheticCaptionCapture(s,{outer:' Outer caption é😀\n',shared:' Shared caption\n',media:'May be an image of text\nVenue: Wrong venue'});
  return s;
}
const validate=(s:ParseSnapshot)=>validatedSnapshotCaptionChannels(s,{fileId:'unit-file',rowIndex:2,sourceId:'unit-source'});
test('separate verbatim caption channels exclude descriptive and generated media text',()=>{
  const s=fixture(),r=validate(s);assert.equal(r.status,'verified');
  if(r.status!=='verified')return;
  assert.equal(r.captionText,' Shared caption\n\n\n Outer caption é😀\n');
  assert.equal(r.channels.length,2);assert(!r.captionText.includes('Wrong venue'));
  assert.equal(s.captionProvenance!.outerCaption.text,' Outer caption é😀\n');
  assert.equal(r.authority,'existing_trusted_snapshot_writer_boundary');
});
test('legacy mixed, local reconstruction and fixture origins remain held',()=>{
  for(const origin of ['missing','local_reconstruction_from_retained_xlsx','fixture']) {
    const s=fixture();if(origin==='missing')delete s.captionProvenance;else (s.captionProvenance!.origin as any).kind=origin;
    assert.equal(validate(s).status,'hold',origin);
  }
});
test('malformed partial provenance fails closed without throwing',()=>{
  for(const p of [{},{version:'caption_channels_v1'}, {...fixture().captionProvenance,identity:null},
    {...fixture().captionProvenance,outerCaption:null},{...fixture().captionProvenance,composition:null}]) {
    const s=fixture();s.captionProvenance=p as any;assert.equal(validate(s).status,'hold');
  }
});
test('truncation, swapped identities, channel edits, hashes and column roles stay held',()=>{
  const mutations:Record<string,(s:ParseSnapshot)=>void>={
    truncated:s=>{s.inputText=s.inputText!.slice(0,-1);},
    originalLength:s=>{s.inputTextLength!+=1;},
    file:s=>{s.captionProvenance!.origin.fileId='wrong';},
    row:s=>{s.captionProvenance!.origin.parserRowIndex=3;},
    source:s=>{s.captionProvenance!.identity.sourceId='wrong';},
    writer:s=>{s.captionProvenance!.writer.rowIndex=3;},
    channel:s=>{s.captionProvenance!.outerCaption.text+=' changed';},
    column:s=>{s.captionProvenance!.outerCaption.column='media/0/ocrText';},
    hash:s=>{s.captionProvenance!.outerCaption.sha256='0'.repeat(64);},
    sourceLength:s=>{s.captionProvenance!.outerCaption.sourceLength++;},
    mediaRole:s=>{s.captionProvenance!.mediaText[0].column='description';},
    mediaOmitted:s=>{s.captionProvenance!.composition.mediaText='';},
    sharedChanged:s=>{s.captionProvenance!.composition.sharedText='different';},
  };
  for(const [name,mutate]of Object.entries(mutations)){const s=fixture();mutate(s);assert.equal(validate(s).status,'hold',name);}
});
test('complete image text with empty captions does not create caption evidence',()=>{
  const s=fixture();syntheticCaptionCapture(s,{outer:'',shared:'',media:'Venue: Arts Centre\nDate: November 1\nTime: 7-9 PM'});
  assert.deepEqual(validate(s),{status:'hold',reason:'caption_channels_empty'});
});
