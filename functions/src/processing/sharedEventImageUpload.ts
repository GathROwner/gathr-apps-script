const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function stringValue(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : undefined;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || Buffer.isBuffer(value)) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

export type SharedEventImageUploadInput = {
  body: unknown;
  rawBody?: Buffer;
  contentTypeHeader?: unknown;
  fileNameHeader?: unknown;
};

export type SharedEventImageUploadPayload = {
  contentType: string;
  fileName?: string;
  buffer: Buffer;
};

/**
 * Accept both the current durable native background upload (raw image bytes)
 * and the legacy JSON/base64 request contract.
 */
export function parseSharedEventImageUpload(
  input: SharedEventImageUploadInput
): SharedEventImageUploadPayload {
  const body = bodyObject(input.body);
  const headerContentType = stringValue(input.contentTypeHeader)?.split(';')[0]?.toLowerCase();
  const bodyContentType = stringValue(body.contentType)?.toLowerCase();
  if (headerContentType &&
      !headerContentType.startsWith('image/') &&
      headerContentType !== 'application/json' &&
      !headerContentType.endsWith('+json')) {
    throw new Error('Only image uploads are supported.');
  }
  const contentType = (headerContentType?.startsWith('image/') ? headerContentType : bodyContentType) || 'image/jpeg';
  const normalizedContentType = contentType === 'image/jpg' ? 'image/jpeg' : contentType;
  if (!IMAGE_CONTENT_TYPES.has(normalizedContentType)) {
    throw new Error('Only image uploads are supported.');
  }

  const isBinaryRequest = Boolean(headerContentType?.startsWith('image/'));
  const binaryBody = input.rawBody?.length
    ? input.rawBody
    : (Buffer.isBuffer(input.body) ? input.body : undefined);

  let buffer: Buffer;
  if (isBinaryRequest && binaryBody?.length) {
    buffer = binaryBody;
  } else {
    const rawBase64 = stringValue(body.base64Data);
    const base64Data = rawBase64?.replace(/^data:[^;]+;base64,/i, '') || '';
    if (!base64Data) throw new Error('Missing image data.');
    buffer = Buffer.from(base64Data, 'base64');
  }

  if (buffer.length === 0) throw new Error('Missing image data.');
  return {
    contentType: normalizedContentType,
    fileName: stringValue(input.fileNameHeader) || stringValue(body.fileName),
    buffer,
  };
}
