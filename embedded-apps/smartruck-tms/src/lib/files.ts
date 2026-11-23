export const MAX_FILE = 4 * 1024 * 1024;
export interface Upload { name: string; mime: string; dataBase64: string }
/** Reads a chosen file as base64 for the server (which re-checks type, size and content). */
export function readUpload(f: File, imageOnly = false): Promise<Upload> {
  return new Promise((resolve, reject) => {
    if (f.size > MAX_FILE) return reject(new Error('The file is larger than 4 MB.'));
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(f.type) || (imageOnly && !f.type.startsWith('image/'))) return reject(new Error(imageOnly ? 'Choose a PNG or JPEG photo.' : 'Choose a PDF, PNG or JPEG file.'));
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.onload = () => resolve({ name: f.name, mime: f.type, dataBase64: String(r.result).split(',')[1] ?? '' });
    r.readAsDataURL(f);
  });
}
