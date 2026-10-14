// Client-side PDF attachment compression — ported from the Expo version of this app (which itself
// ported it from payment-tracking/IBD Provision Tracking), which already solved this exact
// problem: a claim POSTs as one base64-embedded JSON body straight to SAP, with no app-controlled
// size limit anywhere in that path, and something in front of the OData service caps the request
// body well below what even a small PDF's base64 encoding needs (~70KB real-world ceiling,
// measured directly).
export const MAX_ATTACHMENT_BYTES = 70 * 1024;

/** Reads a picked attachment (blob:/file: uri) into a plain base64 string. */
function readAttachmentAsBase64(uri: string): Promise<string> {
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
function base64ByteLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Tried largest/highest-quality first, only stepping down when the previous combination didn't
// fit — a 1-3 page invoice/receipt PDF (the common case) usually fits well before reaching the
// first few steps. The steps below the old floor (0.5 / 0.2) exist for much larger source files
// (many pages, and/or high-resolution scans up to ~10MB) that need to shrink far harder to land
// under the real combined attachment ceiling - existing small/few-page PDFs are unaffected since
// they already succeed at one of the original first four combinations, never reaching these.
const RENDER_SCALES = [1.5, 1.0, 0.75, 0.5, 0.35, 0.25, 0.18, 0.12];
const JPEG_QUALITIES = [0.7, 0.5, 0.35, 0.2, 0.12, 0.08, 0.05, 0.03];

type RenderedPage = { width: number; height: number; jpegsByQuality: Map<number, Uint8Array> };

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('JPEG encode failed.')); return; }
      blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
    }, 'image/jpeg', quality);
  });
}

// Renders one page at a time and immediately JPEG-encodes it at every candidate quality before
// moving to the next page, instead of rendering every page's full-resolution canvas up front and
// holding them all in memory simultaneously (what previously made this throw partway through a
// multi-page PDF — each page's raw canvas bitmap is tens of MB, while a JPEG of the same page is
// 50-200x smaller, so holding N pages' JPEGs instead of N pages' canvases is the fix). The canvas
// is explicitly zeroed out right after encoding so its backing store is released immediately
// rather than waiting on garbage collection to catch up mid-loop.
async function renderPageJpegsAtAllQualities(pdfjsLib: any, bytes: Uint8Array, scale: number): Promise<RenderedPage[]> {
  // pdf.js transfers (not copies) this buffer to its worker, detaching it afterward — the caller
  // loops over multiple scales reusing the same `bytes`, so each call needs its own fresh copy or
  // every call after the first throws "ArrayBuffer is detached".
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const pages: RenderedPage[] = [];
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

    const jpegsByQuality = new Map<number, Uint8Array>();
    for (const quality of JPEG_QUALITIES) {
      // eslint-disable-next-line no-await-in-loop
      jpegsByQuality.set(quality, await canvasToJpeg(canvas, quality));
    }
    pages.push({ width: canvas.width, height: canvas.height, jpegsByQuality });
    canvas.width = 0;
    canvas.height = 0;
  }
  return pages;
}

async function buildPdfFromJpegPages(PDFDocument: any, pages: RenderedPage[], quality: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of pages) {
    const jpeg = p.jpegsByQuality.get(quality)!;
    // eslint-disable-next-line no-await-in-loop
    const img = await doc.embedJpg(jpeg);
    const page = doc.addPage([p.width, p.height]);
    page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
  }
  return doc.save();
}

let workerConfigured = false;

/** Web-only: rasterizes every page (pdf.js) and rebuilds the PDF from JPEG-compressed pages
 * (pdf-lib), stepping resolution/quality down until the rebuilt file fits under maxBytes. Returns
 * null if even the lowest scale/quality combination still doesn't fit — the caller then asks the
 * user for a smaller file rather than silently shipping something over the limit. */
export async function compressPdfToMaxBytes(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array | null> {
  const [pdfjsLib, pdfLib] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf'),
    import('pdf-lib'),
  ]);

  if (!workerConfigured) {
    // Self-hosted, not a CDN URL — confirmed live in the Expo version that a corporate network
    // blocking unpkg.com breaks PDF compression entirely (images still worked since they don't
    // need this worker). The file is copied into public/pdf.worker.min.js, which Next's static
    // export places at this app's own dist root under the basePath, same as every other asset.
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `${process.env.NEXT_PUBLIC_BASE_PATH || '/apps/expense'}/pdf.worker.min.js`;
    workerConfigured = true;
  }

  let smallest: Uint8Array | null = null;
  for (const scale of RENDER_SCALES) {
    // eslint-disable-next-line no-await-in-loop
    const pages = await renderPageJpegsAtAllQualities(pdfjsLib, bytes, scale);
    for (const quality of JPEG_QUALITIES) {
      // eslint-disable-next-line no-await-in-loop
      const rebuilt = await buildPdfFromJpegPages(pdfLib.PDFDocument, pages, quality);
      if (!smallest || rebuilt.byteLength < smallest.byteLength) smallest = rebuilt;
      if (rebuilt.byteLength <= maxBytes) return rebuilt;
    }
  }
  return null;
}

/** Given a freshly-picked PDF's uri, returns a new { uri, size } under MAX_ATTACHMENT_BYTES if
 * possible — null if it's already small enough (caller keeps the original uri/size as-is, same
 * as the image path when compression doesn't apply), or null if it's over the limit and
 * compression couldn't get it under the limit, so the caller should reject the file rather than
 * let it fail later with a confusing SAP/gateway error.
 *
 * Returns a blob: uri (not a raw base64 string) deliberately — Attachment.uri is always something
 * ClaimContext.tsx's existing readAttachmentAsBase64(att.uri) can re-fetch at submit time, exactly
 * like every other attachment (including compressed images). Keeping that contract means the
 * submission flow itself needs zero changes for this to work. */
export async function ensurePdfAttachmentUnderLimit(
  uri: string,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<{ uri: string; size: number } | null> {
  const base64 = await readAttachmentAsBase64(uri);
  const originalSize = base64ByteLength(base64);
  if (originalSize <= maxBytes) return null;

  try {
    const compressed = await compressPdfToMaxBytes(base64ToBytes(base64), maxBytes);
    if (!compressed) return null;
    const blob = new Blob([compressed as unknown as BlobPart], { type: 'application/pdf' });
    return { uri: URL.createObjectURL(blob), size: compressed.byteLength };
  } catch (e) {
    console.warn('Failed to compress PDF attachment', e);
    return null;
  }
}
