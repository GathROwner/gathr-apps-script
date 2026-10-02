/** A previously saved parse can recover a gallery only when its source identity is exact. */
export interface SavedGallerySnapshot {
  id: string;
  createdAtMs: number;
  uniqueId?: unknown;
  rowMeta?: unknown;
  stages?: unknown;
}

function sourceIdentity(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    if (host === 'fbcdn.net' || host.endsWith('.fbcdn.net')) {
      return `fbcdn:${parsed.pathname}`;
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function isManagedPostImage(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'storage.googleapis.com' &&
      parsed.pathname.startsWith('/gathr-uploaded-images/postimages/') &&
      !parsed.search;
  } catch {
    return false;
  }
}

function managedGalleryFromEvent(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const event = raw as Record<string, any>;
  const media = event.imageProvenance?.media;
  if (!Array.isArray(media)) return [];
  const urls = media
    .filter((entry: any) => entry?.field === 'mediaUrls' &&
      entry?.source === 'post_media' && isManagedPostImage(entry?.url))
    .map((entry: any) => String(entry.url));
  return [...new Set(urls)];
}

export function selectRecoverableManagedGallery(
  snapshots: SavedGallerySnapshot[],
  postId: string,
  sourceUrls: string[]
): { urls: string[]; snapshotId: string } | null {
  if (!postId || sourceUrls.length < 1 || sourceUrls.length > 16) return null;
  const identities = sourceUrls.map(sourceIdentity);
  if (identities.some(identity => !identity) ||
      new Set(identities).size !== identities.length) return null;

  for (const snapshot of [...snapshots].sort((a, b) => b.createdAtMs - a.createdAtMs)) {
    if (snapshot.uniqueId !== postId) continue;
    const meta = snapshot.rowMeta as Record<string, any> | undefined;
    const savedSources = meta?.mediaUrls;
    if (!Array.isArray(savedSources) || savedSources.length !== sourceUrls.length ||
        savedSources.some((url: unknown, index: number) =>
          sourceIdentity(url) !== identities[index])) continue;

    const stages = snapshot.stages;
    if (!Array.isArray(stages)) continue;
    const events = stages.flatMap((stage: any) =>
      Array.isArray(stage?.output?.events) ? stage.output.events : []);
    const complete = events.map(managedGalleryFromEvent)
      .filter(urls => urls.length === sourceUrls.length);
    if (complete.length === 0) continue;
    const first = complete[0];
    // A conflicting saved gallery cannot establish reliable image provenance.
    if (complete.some(urls => urls.some((url, index) => url !== first[index]))) continue;
    return { urls: first, snapshotId: snapshot.id };
  }
  return null;
}
