/*
   v7 attachments - client-side helpers (master prompt §L). The server checks everything again (type by content,
   limits, permissions); these only give a quick, friendly answer before a file is sent.
*/

const ALLOWED = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'pdf', 'txt', 'log', 'csv', 'json', 'xml', 'eml', 'msg', 'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'zip'];
export const ACCEPT = ALLOWED.map((e) => `.${e}`).join(',');
export const ALLOWED_TEXT = 'images, PDF, text / log / CSV, Office files, .msg / .eml, XML / JSON and ZIP';

export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
export const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** A file the person picked, pasted or dropped, waiting to be uploaded. */
export interface PendingFile {
  key: string;
  name: string;
  original: File;
  /** The compressed version of a large screenshot / photo, when it is smaller. */
  compressed: Blob | null;
  useOriginal: boolean;
  error: string | null;
}
export const blobOf = (p: PendingFile): Blob => (p.compressed && !p.useOriginal ? p.compressed : p.original);
export const sizeOf = (p: PendingFile) => blobOf(p).size;

export function checkClientSide(name: string, size: number, perFileMb: number): string | null {
  const ext = extOf(name);
  if (!ALLOWED.includes(ext)) return `.${ext || '?'} files are not allowed (allowed: ${ALLOWED_TEXT}).`;
  if (size > perFileMb * 1048576) return `Larger than ${perFileMb} MB.`;
  return null;
}

/**
 * Images over 2 MB or 2000 px on the long edge are re-encoded in the browser as JPEG (WebP when smaller) at about
 * 85 % quality, at most 2000 px. Returns null when the image cannot be decoded or would not get smaller.
 */
export async function compressImage(file: File): Promise<Blob | null> {
  if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const long = Math.max(bitmap.width, bitmap.height);
  if (file.size <= 2 * 1048576 && long <= 2000) { bitmap.close(); return null; }
  const scale = Math.min(1, 2000 / long);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return null; }
  ctx.fillStyle = '#fff'; // PNG transparency becomes white in a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  const [jpeg, webp] = await Promise.all([encode('image/jpeg'), encode('image/webp')]);
  const best = [jpeg, webp].filter((b): b is Blob => !!b && b.size > 0).sort((a, b) => a.size - b.size)[0];
  return best && best.size < file.size ? best : null;
}

/** File name to store for a compressed image (extension follows the new format). */
export function compressedName(name: string, blob: Blob): string {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
}
export const uploadName = (p: PendingFile) => (p.compressed && !p.useOriginal ? compressedName(p.name, p.compressed) : p.name);

/** Pasted screenshots have no useful name: give them one with the time. */
export function nameForPasted(file: File): string {
  if (file.name && file.name !== 'image.png') return file.name;
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `screenshot-${ts}.${extOf(file.name) || (file.type.split('/')[1] ?? 'png')}`;
}

export async function toPending(files: File[], perFileMb: number, pasted = false): Promise<PendingFile[]> {
  const out: PendingFile[] = [];
  for (const f of files) {
    const name = pasted ? nameForPasted(f) : f.name;
    const compressed = await compressImage(f);
    const size = compressed ? compressed.size : f.size;
    out.push({ key: `${name}-${f.size}-${Math.random().toString(36).slice(2)}`, name, original: f, compressed, useOriginal: false, error: checkClientSide(name, size, perFileMb) });
  }
  return out;
}
