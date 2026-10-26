import {captionTextSHA256, composeCapturedInput, type CaptionSourceCell, type IngestedCaptionProvenance, type ParseSnapshot} from '../types/index.js';

/** Unit-only protocol fixture. This assumes a trusted writer; it does not prove
 * real ingestion, authenticate JSON or mint production eligibility. */
export function syntheticCaptionCapture(snapshot: ParseSnapshot, options: {outer?: string; shared?: string; media?: string; structured?: boolean} = {}): void {
  if (!snapshot.uniqueId || snapshot.inputText === undefined) throw new Error('Synthetic protocol fixture requires explicit source and text');
  const cell = (column: string, columnIndex: number, text: string): CaptionSourceCell => ({column,columnIndex,text,
    sourceLength:text.length,storedLength:text.length,utf8Bytes:Buffer.byteLength(text,'utf8'),sha256:captionTextSHA256(text),completeness:'complete_as_read'});
  const outer=options.outer ?? snapshot.inputText, shared=options.shared || '', media=options.media || '';
  const capture: IngestedCaptionProvenance = {version:'caption_channels_v1',origin:{kind:'google_auth_drive_download_v1',
    captureId:'synthetic-unit-only',downloadedAt:'2026-10-19T12:00:00.000Z',fileId:snapshot.fileId,datasetSHA256:'0'.repeat(64),sheetName:'Data',sheetRow:3,sourceRowIndex:1,parserRowIndex:snapshot.rowIndex},
    sourceKind:options.structured?'structured_event':'ordinary_post',identity:{sourceId:snapshot.uniqueId,sourceIdColumn:'id',sourceIdColumnIndex:0},
    outerCaption:cell(options.structured?'description':'text',1,outer),sharedCaption:cell('sharedPost/text',2,shared),
    mediaText:media?[cell('media/0/ocrText',3,media)]:[],composition:{text:outer,sharedText:shared,mediaText:media},completeness:'complete_as_read'};
  snapshot.inputText=composeCapturedInput(capture);snapshot.inputTextLength=snapshot.inputText.length;
  snapshot.captionProvenance={...capture,writer:{kind:'process_row_snapshot_v1',fileId:snapshot.fileId,rowIndex:snapshot.rowIndex,
    sourceId:snapshot.uniqueId,inputTextLength:snapshot.inputText.length,inputTextSHA256:captionTextSHA256(snapshot.inputText)}};
}
