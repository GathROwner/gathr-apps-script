import { CheckpointData } from '../types/index.js';

export interface ResumeTaskCheckpoint {
  rowIndex: number;
  batchNumber: number;
}

export function buildResumeTaskCheckpoint(
  checkpoint?: Pick<CheckpointData, 'rowIndex' | 'batchNumber'> | null
): ResumeTaskCheckpoint | undefined {
  if (!checkpoint) return undefined;
  if (!Number.isFinite(checkpoint.rowIndex) || !Number.isFinite(checkpoint.batchNumber)) {
    return undefined;
  }
  return {
    rowIndex: checkpoint.rowIndex,
    batchNumber: checkpoint.batchNumber,
  };
}

export function matchesResumeTaskCheckpoint(
  expected: ResumeTaskCheckpoint | undefined,
  checkpoint?: Pick<CheckpointData, 'rowIndex' | 'batchNumber'> | null
): boolean {
  if (!expected || !checkpoint) return false;
  return (
    expected.rowIndex === checkpoint.rowIndex &&
    expected.batchNumber === checkpoint.batchNumber
  );
}

/** A timed-out 540-second resume may leave a newer per-row checkpoint behind.
 * Only a stale running lease may recover it; a paused task must match exactly. */
export function classifyResumeTaskClaim(
  expected: ResumeTaskCheckpoint | undefined,
  checkpoint: ResumeTaskCheckpoint | undefined,
  lockStatus: 'running' | 'paused' | 'completed' | 'failed',
  heartbeatAgeMs: number,
  staleAfterMs = 570000
): 'claim' | 'busy' | 'stale' {
  if (lockStatus === 'completed' || lockStatus === 'failed') return 'stale';
  // The first task from the Apify webhook has no checkpoint yet. It may claim
  // only without an expected checkpoint; a fresh running lease remains busy.
  if (!checkpoint) {
    if (expected) return 'stale';
    return lockStatus === 'paused' || heartbeatAgeMs >= staleAfterMs
      ? 'claim' : 'busy';
  }
  if (lockStatus === 'paused') {
    return !expected || matchesResumeTaskCheckpoint(expected, checkpoint)
      ? 'claim' : 'stale';
  }
  if (heartbeatAgeMs < staleAfterMs) return 'busy';
  return !expected ||
    (expected.batchNumber === checkpoint.batchNumber &&
      expected.rowIndex <= checkpoint.rowIndex)
    ? 'claim' : 'stale';
}
