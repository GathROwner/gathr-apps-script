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
