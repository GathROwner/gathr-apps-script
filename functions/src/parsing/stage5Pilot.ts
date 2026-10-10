import { createHash } from 'crypto';

/** Stage 5 consumes validated text items; image availability is not required.
 * Identity is stable across resumes. */
export function selectStage5LunaPilot(
  fileId: string, postId: string, hasValidatedItems: boolean,
  enabled = process.env.LUNA_STAGE5_PILOT_ENABLED === 'true',
  percent = Number(process.env.LUNA_STAGE5_PILOT_SAMPLE_PERCENT || '0')
): { eligible: boolean; selected: boolean; percent: number } {
  const eligible = enabled && hasValidatedItems && Boolean(fileId) && Boolean(postId) &&
    Number.isFinite(percent) && percent > 0 && percent <= 100;
  const bucket = createHash('sha256').update(`stage5\0${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return { eligible, selected: eligible && bucket < percent / 100, percent };
}
