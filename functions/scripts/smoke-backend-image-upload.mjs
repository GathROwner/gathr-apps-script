import fs from 'node:fs/promises';

const [uploadUrl, sourceImagePath, reportPath] = process.argv.slice(2);
if (!uploadUrl?.startsWith('https://') || !uploadUrl.endsWith('/upload-image') ||
    !sourceImagePath || !reportPath) {
  throw new Error('Pass HTTPS upload URL, source image path, and report path');
}
const deleteUrl = uploadUrl.replace(/\/upload-image$/, '/delete-image');
const source = await fs.readFile(sourceImagePath);
const report = { checks: [], cleanup: [] };
const uploaded = [];
try {
  for (const ocr of [true, false]) {
    const form = new FormData();
    form.append('folder', 'postimages');
    form.append('ocr', String(ocr));
    form.append('image', new Blob([source], { type: 'image/jpeg' }), 'seawalk-smoke.jpg');
    const response = await fetch(uploadUrl, { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok || !payload.imageUrl) {
      throw new Error(`Upload mode=${ocr} failed: status=${response.status} detail=${String(payload.details || payload.error || '').slice(0, 160)}`);
    }
    const imageUrl = String(payload.imageUrl);
    uploaded.push(imageUrl);
    const download = await fetch(imageUrl);
    const bytes = Buffer.from(await download.arrayBuffer());
    report.checks.push({ ocr, uploadStatus: response.status, imageUrl,
      downloadStatus: download.status, contentType: download.headers.get('content-type'),
      byteCount: bytes.length });
    if (!download.ok || !String(download.headers.get('content-type')).includes('image/webp') ||
        bytes.length < 1000) {
      throw new Error(`Managed image unreadable for ocr=${ocr}`);
    }
  }
} finally {
  for (const imageUrl of uploaded) {
    try {
      const deleted = await fetch(deleteUrl, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ imageUrl }) });
      report.cleanup.push({ imageUrl, status: deleted.status });
    } catch (error) {
      report.cleanup.push({ imageUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath, checks: report.checks.map(
    ({ ocr, uploadStatus, downloadStatus, contentType, byteCount }) =>
      ({ ocr, uploadStatus, downloadStatus, contentType, byteCount })),
    cleanup: report.cleanup.map(({ status, error }) => ({ status, error })) }));
}
