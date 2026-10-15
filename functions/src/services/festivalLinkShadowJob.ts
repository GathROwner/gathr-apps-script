import {createHash} from 'node:crypto';

export const FESTIVAL_SHADOW_POLICY = 'festival-source-links-v1';
export const FESTIVAL_SHADOW_COLLECTION = 'festival_link_shadow_jobs';
export type FullRunEvidence = {
  fileId: string; checkpointExists: boolean;
  lock?: {fileId?: string; runId?: string; status?: string};
  marker?: {fileId?: string; fileName?: string; dryRun?: boolean; selectedRows?: unknown};
  batch?: {fileId?: string; runId?: string; status?: string; currentRowIndex?: number; totalRows?: number; dryRun?: boolean; rowIndexes?: unknown};
};
export function verifyFestivalFullRun(e: FullRunEvidence): {ready: boolean; reason: string} {
  if (!e.fileId || !e.marker || !e.lock || !e.batch) return {ready:false,reason:'completion_evidence_missing'};
  if (e.checkpointExists) return {ready:false,reason:'checkpoint_present'};
  if ([e.lock.fileId,e.marker.fileId,e.batch.fileId].some(id=>id!==e.fileId)) return {ready:false,reason:'dataset_identity_conflict'};
  if (e.lock.status!=='completed'||e.batch.status!=='completed') return {ready:false,reason:'run_not_completed'};
  if (!e.lock.runId || e.lock.runId!==e.batch.runId) return {ready:false,reason:'run_identity_conflict'};
  if (e.marker.dryRun || e.batch.dryRun || e.marker.selectedRows || e.batch.rowIndexes || /dry.?run|selected.?row|replay/i.test(e.marker.fileName||'')) return {ready:false,reason:'non_regular_run'};
  if (!Number.isInteger(e.batch.totalRows)||Number(e.batch.totalRows)<1 || Number(e.batch.currentRowIndex)!==e.batch.totalRows) return {ready:false,reason:'final_row_not_reached'};
  return {ready:true,reason:'completed_full_run'};
}
const stable = (value: unknown): unknown => {
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
};
export const festivalShadowFingerprint=(value:unknown):string=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export const festivalShadowJobId=(fileId:string):string=>festivalShadowFingerprint({fileId,policy:FESTIVAL_SHADOW_POLICY});
export type FestivalShadowJob = {
  fileId:string; policy:string; status:'running'|'completed'|'retryable'|'held'; inputFingerprint:string;
  generation:number; attempts:number; workerToken:string; leaseUntilMs:number; updatedAtMs:number;
};
export type FestivalShadowClaim = {decision:'claimed'; job:FestivalShadowJob}|{decision:'busy'|'already_completed'|'attempts_exhausted'};
export function claimFestivalShadowJob(previous:FestivalShadowJob|undefined,input:{fileId:string;inputFingerprint:string;workerToken:string;nowMs:number;leaseMs?:number}):FestivalShadowClaim {
  if(!input.fileId||!input.inputFingerprint||!input.workerToken||!Number.isFinite(input.nowMs)) throw new Error('Invalid shadow claim');
  const same=previous?.inputFingerprint===input.inputFingerprint;
  if(previous?.status==='running'&&previous.leaseUntilMs>input.nowMs) return {decision:'busy'};
  if(same&&previous?.status==='completed') return {decision:'already_completed'};
  if(same&&previous&&previous.attempts>=5) return {decision:'attempts_exhausted'};
  return {decision:'claimed',job:{fileId:input.fileId,policy:FESTIVAL_SHADOW_POLICY,status:'running',inputFingerprint:input.inputFingerprint,
    generation:(previous?.generation||0)+1,attempts:same?(previous?.attempts||0)+1:1,workerToken:input.workerToken,
    leaseUntilMs:input.nowMs+(input.leaseMs??300000),updatedAtMs:input.nowMs}};
}
export function finishFestivalShadowJob(current:FestivalShadowJob,claim:FestivalShadowJob,nowMs:number,status:'completed'|'retryable'|'held'):FestivalShadowJob {
  if(current.status!=='running'||current.workerToken!==claim.workerToken||current.generation!==claim.generation||current.inputFingerprint!==claim.inputFingerprint||current.leaseUntilMs<=nowMs) throw new Error('Stale shadow worker cannot commit');
  return {...current,status,leaseUntilMs:0,updatedAtMs:nowMs};
}
