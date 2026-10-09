import { createHash } from 'crypto';

/** Stage 1 has passed. Only usable source inputs enter this cohort. A separate
 * stage tag keeps allocation independent of Stage 1/3 and stable on resume. */
export function selectStage2LunaPilot(
  fileId: string, postId: string, sourceReady: boolean,
  enabled = process.env.LUNA_STAGE2_PILOT_ENABLED === 'true',
  percent = Number(process.env.LUNA_STAGE2_PILOT_SAMPLE_PERCENT || '0')
): { eligible: boolean; selected: boolean; percent: number } {
  const eligible = enabled && sourceReady && Boolean(fileId) && Boolean(postId) &&
    Number.isFinite(percent) && percent > 0 && percent <= 100;
  const bucket = createHash('sha256').update(`stage2\0${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return { eligible, selected: eligible && bucket < percent / 100, percent };
}
