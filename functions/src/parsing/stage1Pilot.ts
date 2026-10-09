import { createHash } from 'crypto';

/** The denominator is actual Stage 1 requests with a usable analysis image,
 * before eligibility is known. Dataset/source identity keeps retries stable. */
export function selectStage1LunaPilot(
  fileId: string, postId: string, imageCount: number,
  enabled = process.env.LUNA_STAGE1_PILOT_ENABLED === 'true',
  percent = Number(process.env.LUNA_STAGE1_PILOT_SAMPLE_PERCENT || '0')
): { eligible: boolean; selected: boolean; percent: number } {
  const eligible = enabled && imageCount > 0 && Boolean(postId) &&
    Number.isFinite(percent) && percent > 0 && percent <= 100;
  const bucket = createHash('sha256').update(`stage1\0${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return { eligible, selected: eligible && bucket < percent / 100, percent };
}
