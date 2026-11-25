// Extracted out of the original Expo app's create.tsx so Claim Detail (and any other screen that
// needs to re-derive an attachment's extension or re-check its allowed type) can reuse this
// without duplicating it — see the plan's slice 1 notes.

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'xls', 'xlsx', 'csv', 'txt']);
export const ALLOWED_ATTACHMENT_LABEL = 'PDF, PNG, JPG, JPEG, XLS, XLSX, CSV, TXT';

// SAP's stored Filename never includes an extension — used only to reconstruct one for
// resubmitted attachments, so the submit-time extension check has something valid to find instead
// of treating the whole extension-less name as one.
export const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

// The claim gets POSTed as one base64-embedded JSON body straight to SAP, with no app-controlled
// size limit anywhere in that path. Measured directly against the real gateway in front of SAP: a
// request body over ~100KB gets rejected with no CORS header at all, which the browser then
// reports to the app as a generic "Network Error" rather than a real status code. A single
// attachment compressed to ~70KB keeps the whole request safely under that — but with N
// attachments, each one needs to target roughly a 1/N share of the same combined budget, or two
// "individually fine" 70KB files together still blow past the real ceiling. Images can be safely
// re-encoded smaller without losing their usefulness as a receipt; compression tries progressively
// smaller width/quality combinations (most lenient first) until the file is at or under the target,
// falling back to whatever got smallest if none of the steps quite reach it. XLS/XLSX/CSV/TXT
// attachments can't be shrunk this way and are deliberately left untouched (PDFs are rasterized and
// rebuilt smaller instead — see pdfAttachment.ts).
export const TARGET_FILE_BYTES = 70 * 1024;

// Combined raw (pre-base64) budget shared across every attachment on one claim, chosen with a
// safety margin under the measured real ceiling (~100KB request body ≈ ~75KB raw attachment
// content once base64 + JSON overhead is accounted for).
export const SAFE_COMBINED_RAW_ATTACHMENT_BYTES = TARGET_FILE_BYTES;
// Below this, a compressed image/PDF stops being a useful receipt — if the shared budget would
// push a file's target under this floor, the app asks the user to remove an attachment instead of
// silently producing something unusable.
export const MIN_PER_FILE_TARGET_BYTES = 12 * 1024;

/** Per-file compression target for one more attachment, given how much of the shared combined
 * budget is already spoken for by attachments that can't be (further) compressed. Returns null
 * if there's no room left even at the minimum floor — the caller should reject the new attachment
 * rather than compress it into something unusable. */
export function getPerFileTargetBytes(recompressibleCount: number, reservedBytes: number): number | null {
  const count = Math.max(1, recompressibleCount);
  const available = SAFE_COMBINED_RAW_ATTACHMENT_BYTES - reservedBytes;
  const target = Math.floor(available / count);
  return target >= MIN_PER_FILE_TARGET_BYTES ? target : null;
}
const MAX_IMAGE_WIDTH = 1280;
const MIN_IMAGE_WIDTH = 320;
const COMPRESSION_STEPS = [
  { width: MAX_IMAGE_WIDTH, quality: 0.6 },
  { width: MAX_IMAGE_WIDTH, quality: 0.4 },
  { width: 960, quality: 0.4 },
  { width: 960, quality: 0.25 },
  { width: 640, quality: 0.3 },
  { width: 640, quality: 0.18 },
  { width: MIN_IMAGE_WIDTH, quality: 0.2 },
  { width: MIN_IMAGE_WIDTH, quality: 0.1 },
];

function loadImageElement(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = uri;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

export async function compressAttachmentImage(
  uri: string,
  targetBytes: number = TARGET_FILE_BYTES,
  knownWidth?: number,
): Promise<{ uri: string; size: number } | null> {
  try {
    const img = await loadImageElement(uri);
    const naturalWidth = img.naturalWidth || knownWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    let bestBlob: Blob | null = null;
    for (const step of COMPRESSION_STEPS) {
      const targetWidth = Math.min(naturalWidth, step.width); // never upscale past the original
      const targetHeight = Math.max(1, Math.round(naturalHeight * (targetWidth / naturalWidth)));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      // eslint-disable-next-line no-await-in-loop
      const blob = await canvasToJpegBlob(canvas, step.quality);
      if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob;
      if (blob && blob.size <= targetBytes) break;
    }
    return bestBlob ? { uri: URL.createObjectURL(bestBlob), size: bestBlob.size } : null;
  } catch (e) {
    console.warn('Failed to compress attachment image, falling back to the original', e);
    return null;
  }
}
