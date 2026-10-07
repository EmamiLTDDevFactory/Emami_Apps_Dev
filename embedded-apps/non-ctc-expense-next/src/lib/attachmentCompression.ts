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
// size limit anywhere in that path — a modest image can trip a 413 from the gateway sitting in
// front of SAP well before it reaches the 30MB ceiling the Create Claim screen warns about. Images
// can be safely re-encoded smaller without losing their usefulness as a receipt; compression tries
// progressively smaller width/quality combinations (most lenient first) until the file is at or
// under TARGET_FILE_BYTES, falling back to whatever got smallest if none of the steps quite reach
// it. PDF/XLS/XLSX/CSV/TXT attachments can't be shrunk this way and are deliberately left
// untouched.
export const TARGET_FILE_BYTES = 70 * 1024;
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

export async function compressAttachmentImage(uri: string, knownWidth?: number): Promise<{ uri: string; size: number } | null> {
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
      if (blob && blob.size <= TARGET_FILE_BYTES) break;
    }
    return bestBlob ? { uri: URL.createObjectURL(bestBlob), size: bestBlob.size } : null;
  } catch (e) {
    console.warn('Failed to compress attachment image, falling back to the original', e);
    return null;
  }
}
