import { createHash } from 'crypto';

/** Select only posts with Stage 4 items. Identity is stable across resumes. */
export function selectStage5LunaPilot(
  fileId: string, postId: string, sourceReady: boolean,
  enabled = process.env.LUNA_STAGE5_PILOT_ENABLED === 'true',
  percent = Number(process.env.LUNA_STAGE5_PILOT_SAMPLE_PERCENT || '0')
): { eligible: boolean; selected: boolean; percent: number } {
  const eligible = enabled && sourceReady && Boolean(fileId) && Boolean(postId) &&
    Number.isFinite(percent) && percent > 0 && percent <= 100;
  const bucket = createHash('sha256').update(`stage5\0${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return { eligible, selected: eligible && bucket < percent / 100, percent };
}
