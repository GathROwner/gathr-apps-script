import { ParseStageArtifactsSnapshot } from './types.js';

/** Keep diagnostic evidence comfortably below Firestore's document size limit. */
export function boundStageArtifactSnapshot(snapshot: ParseStageArtifactsSnapshot): ParseStageArtifactsSnapshot {
  const limit = 240_000;
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  const originalBytes = bytes(snapshot);
  if (originalBytes <= limit) return snapshot;
  const result = { ...snapshot, stage3Items: snapshot.stage3Items?.slice(),
    stage3HeldItems: snapshot.stage3HeldItems?.slice(), stage4Items: snapshot.stage4Items?.slice(),
    stage56HeldItems: snapshot.stage56HeldItems?.slice() };
  // Retain evidence from every stage when possible; remove the largest tail first.
  while (bytes(result) > limit - 1000) {
    const arrays = [result.stage3Items, result.stage3HeldItems, result.stage4Items, result.stage56HeldItems]
      .filter((items): items is NonNullable<typeof items> => Boolean(items?.length));
    arrays.sort((a, b) => bytes(b) - bytes(a));
    if (arrays.length) arrays[0].pop();
    else if (result.stage1Validation) delete result.stage1Validation;
    else { delete result.imageFrameManifest; delete result.stage37TicketUrl; break; }
  }
  result.artifactTruncation = { originalBytes, maxBytes: limit };
  return result;
}
