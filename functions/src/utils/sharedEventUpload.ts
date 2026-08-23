import { createHash, randomUUID } from 'node:crypto';

export function normalizeSharedEventUploadId(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(normalized) ? normalized : undefined;
}

export function sharedEventUploadPath(params: {
  ownerUid: string;
  uploadId?: string;
  fileName: string;
  now?: number;
}): string {
  const stableUploadId = normalizeSharedEventUploadId(params.uploadId);
  if (stableUploadId) {
    return `sharedEventUploads/${params.ownerUid}/${stableUploadId}-${params.fileName}`;
  }
  return `sharedEventUploads/${params.ownerUid}/${params.now ?? Date.now()}-${randomUUID()}-${params.fileName}`;
}

export function sharedEventClientIngestId(ownerUid: string, clientSubmissionId: unknown): string | undefined {
  const normalized = normalizeSharedEventUploadId(clientSubmissionId);
  if (!normalized) return undefined;
  return `client-${createHash('sha256')
    .update(`${ownerUid}:${normalized}`)
    .digest('hex')
    .slice(0, 40)}`;
}
