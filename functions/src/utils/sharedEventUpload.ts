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

export function normalizeExpectedSharedEventUploadIds(
  clientSubmissionId: unknown,
  values: unknown,
  maxUploads = 6
): string[] {
  const clientId = normalizeSharedEventUploadId(clientSubmissionId);
  if (!clientId || !Array.isArray(values)) return [];
  const unique = Array.from(new Set(values
    .map((value) => normalizeSharedEventUploadId(value))
    .filter((value): value is string => Boolean(value))));
  if (unique.length === 0 || unique.length > maxUploads) return [];
  return unique.every((uploadId) => uploadId.startsWith(`${clientId}_`)) ? unique : [];
}

export function sharedEventUploadsReady(
  expectedUploadIds: string[],
  receivedUploadIds: string[]
): boolean {
  if (expectedUploadIds.length === 0) return false;
  const received = new Set(receivedUploadIds);
  return expectedUploadIds.every((uploadId) => received.has(uploadId));
}
