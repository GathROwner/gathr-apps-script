import { createHash } from 'crypto';

/** Actual Stage 1 requests, before content eligibility is known. Caption-only
 * requests are opt-in; failed source images must not count as caption-only.
 * Dataset/source identity keeps retries stable. */
export function selectStage1LunaPilot(
  fileId: string, postId: string, imageCount: number,
  enabled = process.env.LUNA_STAGE1_PILOT_ENABLED === 'true',
  percent = Number(process.env.LUNA_STAGE1_PILOT_SAMPLE_PERCENT || '0'),
  allowTextOnly = process.env.LUNA_TEXT_ONLY_ENABLED === 'true'
): { eligible: boolean; selected: boolean; percent: number } {
  const eligible = enabled && (imageCount > 0 || (imageCount === 0 && allowTextOnly)) && Boolean(postId) &&
    Number.isFinite(percent) && percent > 0 && percent <= 100;
  const bucket = createHash('sha256').update(`stage1\0${fileId}\0${postId}`)
    .digest().readUInt32BE(0) / 0x100000000;
  return { eligible, selected: eligible && bucket < percent / 100, percent };
}
