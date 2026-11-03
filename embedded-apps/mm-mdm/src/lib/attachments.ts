// Pure helpers of attachments: the transport guards of the front end and the base64 conversion.
// The guards (size, extension) only stop a useless upload early and protect the server; SAP decides what is accepted in the end.
import type { Message } from './types';

/** Upload limit of the live backend (backend/mmMdm.js MAX_UPLOAD_BYTES); the demo service keeps files in the browser and allows less. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DEMO_MAX_UPLOAD_BYTES = 1024 * 1024;
export const MAX_COMMENT_LENGTH = 1000;

/** File types that may be uploaded. Decision: documents, spreadsheets, images, text and archives of those; no executables or scripts. */
export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'msg', 'eml', 'zip'] as const;

export const extensionOf = (fileName: string): string => {
  const i = fileName.lastIndexOf('.');
  return i < 0 ? '' : fileName.slice(i + 1).toLowerCase();
};

export type FileProblem = { kind: 'empty' | 'tooLarge' | 'type' | 'name'; limit?: number };

/** null = the file may be sent. */
export function checkFile(fileName: string, size: number, maxBytes: number = MAX_UPLOAD_BYTES): FileProblem | null {
  if (!fileName.trim() || /[\\/:*?"<>|\u0000-\u001f]/.test(fileName) || fileName.length > 255) return { kind: 'name' };
  if (size <= 0) return { kind: 'empty' };
  if (size > maxBytes) return { kind: 'tooLarge', limit: maxBytes };
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extensionOf(fileName))) return { kind: 'type' };
  return null;
}

export function fileProblemMessage(p: FileProblem): string {
  switch (p.kind) {
    case 'name': return 'The file name is not valid.';
    case 'empty': return 'The file is empty.';
    case 'tooLarge': return `The file is larger than ${fmtSize(p.limit ?? MAX_UPLOAD_BYTES)}.`;
    default: return `This file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
}

export const fileProblemAsMessage = (p: FileProblem): Message => ({ code: 'ATT', message: fileProblemMessage(p), severity: 'E' });

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Size in bytes of the content a base64 string stands for. */
export const base64Size = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
