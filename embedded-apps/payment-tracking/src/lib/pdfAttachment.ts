// Client-side PDF invoice-attachment helpers, shared by Provision Tracking's Vendor
// ("upcoming.tsx") and Admin ("admin-upcoming.tsx") Upcoming Provision screens — both attach a
// mandatory invoice PDF (when Delivery Confirmed = Yes) that gets base64-encoded into
// ZProvHeaderSet's Value/Mimetype/Filename fields (see paymentTrackingApi.ts's toProvItem).
//
// Dev testing (2026-09-10) confirmed SAP's ZProvHeaderSet POST 413s (Payload Too Large, no CORS
// header on the error so the browser reports it as a blocked cross-origin request) well below
// what even a small PDF's base64 encoding needs — something in front of that OData service caps
// the request body. Anything over MAX_ATTACHMENT_BYTES is therefore compressed before it's
// attached: each page is rasterized via pdf.js, re-encoded as a JPEG, and rebuilt into a new PDF
// via pdf-lib, stepping resolution/quality down until it fits. This only works on web (rasterizing
// to a <canvas> has no native-mobile equivalent here) — native just rejects an oversized file.
export const MAX_ATTACHMENT_BYTES = 70 * 1024;

const PDFJS_VERSION = '3.11.174';

/** Reads a picked attachment (blob:/file:/data: uri — same call shape on web and native via
 * expo-document-picker) into a plain base64 string, so it can travel as JSON text rather than a
 * raw binary multipart upload — same approach as non-ctc-expense's ClaimContext. */
export function readAttachmentAsBase64(uri: string): Promise<string> {
  return fetch(uri)
    .then((res) => res.blob())
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = (reader.result as string) || '';
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

/** Byte length of the file a base64 string decodes to, without actually decoding it. */
export function base64ByteLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** atob/btoa-based — both web-only globals. Exported so callers can validate the decoded bytes
 * (see looksLikePdf below) before handing them to a Blob/viewer. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True if `bytes` starts with the PDF magic number ("%PDF") — a cheap sanity check that what came
 * back actually decoded into a real PDF, rather than silently handing a viewer/iframe truncated or
 * mis-encoded bytes it'll just render as raw garbage with no explanation of what went wrong. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** The read-back counterpart to readAttachmentAsBase64 above — turns a base64 attachment already
 * in hand (e.g. ZVendorPOFollowupSet's inline Value field) into a Blob a browser can open/download,
 * without a network round-trip. Web-only (atob), same posture as the rest of this file. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  // Cast needed because TS's Blob typing wants an ArrayBuffer-backed view specifically, while
  // Uint8Array's declared buffer type is the broader ArrayBufferLike — a runtime non-issue, every
  // browser accepts a plain Uint8Array here.
  return new Blob([base64ToBytes(base64) as unknown as BlobPart], { type: mimeType || 'application/octet-stream' });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Tried largest/highest-quality first, only stepping down when the previous combination didn't
// fit — a 1-3 page invoice PDF (the common case) usually fits well before reaching the floor.
const RENDER_SCALES = [1.5, 1.0, 0.75, 0.5];
const JPEG_QUALITIES = [0.7, 0.5, 0.35, 0.2];

async function renderPageCanvases(pdfjsLib: any, bytes: Uint8Array, scale: number): Promise<HTMLCanvasElement[]> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    // eslint-disable-next-line no-await-in-loop
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('JPEG encode failed.')); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/jpeg', quality);
  });
}

async function buildPdfFromCanvases(PDFDocument: any, canvases: HTMLCanvasElement[], quality: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const canvas of canvases) {
    // eslint-disable-next-line no-await-in-loop
    const jpeg = await canvasToJpeg(canvas, quality);
    // eslint-disable-next-line no-await-in-loop
    const img = await doc.embedJpg(jpeg);
    const page = doc.addPage([canvas.width, canvas.height]);
    page.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  }
  return doc.save();
}

/** Web-only: rasterizes every page (pdf.js) and rebuilds the PDF from JPEG-compressed pages
 * (pdf-lib), stepping resolution/quality down until the rebuilt file fits under maxBytes. Returns
 * null if even the lowest scale/quality combination still doesn't fit — the caller then asks the
 * user for a smaller file rather than silently shipping something over the limit. */
export async function compressPdfToMaxBytes(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array | null> {
  const [pdfjsLib, pdfLib] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf'),
    import('pdf-lib'),
  ]);
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.js`;

  let smallest: Uint8Array | null = null;
  for (const scale of RENDER_SCALES) {
    // eslint-disable-next-line no-await-in-loop
    const canvases = await renderPageCanvases(pdfjsLib, bytes, scale);
    for (const quality of JPEG_QUALITIES) {
      // eslint-disable-next-line no-await-in-loop
      const rebuilt = await buildPdfFromCanvases(pdfLib.PDFDocument, canvases, quality);
      if (!smallest || rebuilt.byteLength < smallest.byteLength) smallest = rebuilt;
      if (rebuilt.byteLength <= maxBytes) return rebuilt;
    }
  }
  return null;
}

/** Given a freshly-picked file's base64 content, returns base64 content guaranteed to be under
 * MAX_ATTACHMENT_BYTES — as-is if it already fits, compressed (web only) if it doesn't, or null if
 * it's over the limit and (native, or compression couldn't get it under the limit) so the caller
 * should reject the file. */
export async function ensureAttachmentUnderLimit(base64: string, isWeb: boolean): Promise<string | null> {
  if (base64ByteLength(base64) <= MAX_ATTACHMENT_BYTES) return base64;
  if (!isWeb) return null;
  const compressed = await compressPdfToMaxBytes(base64ToBytes(base64), MAX_ATTACHMENT_BYTES);
  return compressed ? bytesToBase64(compressed) : null;
}
