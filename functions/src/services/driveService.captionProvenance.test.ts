import assert from 'node:assert/strict';
import test, {mock} from 'node:test';
import {google} from 'googleapis';
import * as XLSX from 'xlsx';
import {downloadFile,parseXlsxFile,buildSnapshotCaptionProvenance} from './driveService.js';
import {composeCapturedInput,validatedSnapshotCaptionChannels,type RawRowData,type ParseSnapshot} from '../types/index.js';

function workbook(outer='  Original outer é😀\n', shared='Original shared\n',id='post-123') {
  const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
    ['id','text','sharedPost/text','sharedPost/id','media/0/ocrText','url'],
    [id,outer,shared,'shared-456','May be an image of text','https://www.facebook.com/page/posts/post-123']
  ]),'Data');return XLSX.write(w,{type:'buffer',bookType:'xlsx'}) as Buffer;
}
function snapshot(row: RawRowData): ParseSnapshot {
  return {fileId:'mock-drive-file',rowIndex:0,uniqueId:row.uniqueId,inputText:[row.sharedPostText,row.text,row.ocrText?'OCR TEXT:\n'+row.ocrText:''].filter(Boolean).join('\n\n'),stages:[]};
}
test('only authenticated ingestion supplies privately branded original caption channels',async t=>{
  let bytes=workbook();let gets=0;
  mock.method(google,'drive',(()=>({files:{get:async(p:{alt?:string})=>{gets++;return {data:p.alt==='media'?bytes:{mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}};}}})) as any);
  try {
    const downloaded=await downloadFile('mock-drive-file'),[row]=(await parseXlsxFile(downloaded)).rows;
    assert.equal(gets,2);assert(row);assert(row.uniqueId);assert(row.captionProvenance);
    await t.test('original column identity, order, UTF8 lengths and shared ID survive',()=>{
      const p=row.captionProvenance!;assert.equal(p.outerCaption.column,'text');assert.equal(p.outerCaption.columnIndex,1);
      assert.equal(p.outerCaption.text,'  Original outer é😀\n');assert.equal(p.sharedCaption.text,'Original shared\n');
      assert.equal(p.identity.sharedSourceId,'shared-456');assert.equal(p.origin.sheetRow,2);assert.equal(p.origin.parserRowIndex,0);
      assert.equal(p.outerCaption.utf8Bytes,Buffer.byteLength(p.outerCaption.text));assert.equal(p.mediaText[0].text,'May be an image of text');
      const s=snapshot(row);assert.equal(s.inputText,composeCapturedInput(p));s.captionProvenance=buildSnapshotCaptionProvenance(row,s);
      s.inputTextLength=s.inputText!.length;assert.equal(validatedSnapshotCaptionChannels(s,{fileId:s.fileId,rowIndex:0,sourceId:row.uniqueId!}).status,'verified');
    });
    await t.test('local bytes, copied buffers and JSON cannot claim authenticated ingestion',async()=>{
      for(const b of [bytes,Buffer.from(downloaded)])assert.equal((await parseXlsxFile(b)).rows[0].captionProvenance,undefined);
      const fake=JSON.parse(JSON.stringify(row)) as RawRowData;assert.equal(buildSnapshotCaptionProvenance(fake,snapshot(fake)),undefined);
    });
    await t.test('source, row, input and channel drift prevent snapshot provenance',()=>{
      for(const patch of [{fileId:'other'},{rowIndex:1},{uniqueId:'other'},{inputText:'truncated'}])
        assert.equal(buildSnapshotCaptionProvenance(row,{...snapshot(row),...patch}),undefined);
      const original=row.captionProvenance!.outerCaption.text;row.captionProvenance!.outerCaption.text+=' changed';
      assert.equal(buildSnapshotCaptionProvenance(row,snapshot(row)),undefined);row.captionProvenance!.outerCaption.text=original;
    });
    await t.test('mutated branded workbook and missing stable IDs cannot mint evidence',async()=>{
      bytes=workbook('AAA');const altered=await downloadFile('mock-drive-file'),replacement=workbook('BBB');
      assert.equal(altered.length,replacement.length);replacement.copy(altered);
      const changed=(await parseXlsxFile(altered)).rows[0];assert.equal(changed.text,'BBB');assert.equal(changed.captionProvenance,undefined);
      bytes=workbook('Outer','Shared','');const noID=(await parseXlsxFile(await downloadFile('mock-drive-file'))).rows[0];
      if(noID)assert.equal(noID.captionProvenance,undefined);
    });
    await t.test('oversize captions are not truncated into eligible evidence',async()=>{
      bytes=workbook('a'.repeat(32000),'b'.repeat(32000));const large=(await parseXlsxFile(await downloadFile('mock-drive-file'))).rows[0];
      // XLSX has a 32767-character cell cap; duplicated composition pushes the packet over its bounded cap.
      assert.equal(large.text.length,32000);assert.equal(large.captionProvenance,undefined);
    });
  } finally {mock.restoreAll();}
});
