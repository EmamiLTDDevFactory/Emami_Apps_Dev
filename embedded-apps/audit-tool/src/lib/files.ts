// File helpers mirroring the source Fiori app's attachment handling (inProcess2Screen /
// MISinprocess2 / closed2Screen / MailProcessDetail controllers), kept byte-for-byte compatible
// with what SAP already stores:
//  - Upload: FileReader.readAsDataURL, strip the "data:<type>;base64," prefix, then the Fiori
//    code posts `Value: btoa(content)` — i.e. the base64 text is base64-encoded a SECOND time.
//    Existing attachments in SAP were written that way, so uploads here must do the same.
//  - Download: decodeBase64Safe() — atob once, and if that result is itself valid base64, atob
//    again (handles both single- and double-encoded rows already in SAP).

export interface PickedFile {
  name: string;
  type: string;
  /** base64 of the file bytes (data URL prefix already stripped) */
  content: string;
}

/** FileUploader change -> handleValueChange(): read as a data URL and strip the prefix. `.msg`
 * files with an empty browser MIME type get application/octet-stream, as in the source. */
export function readFileAsBase64(file: File): Promise<PickedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let fileType = file.type;
      if (!fileType && file.name.endsWith('.msg')) fileType = 'application/octet-stream';
      const result = String(reader.result || '');
      const content = result.replace(`data:${fileType};base64,`, '').replace(/^data:[^;]*;base64,/, '');
      resolve({ name: file.name, type: fileType, content });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Same as the source's decodeBase64Safe — returns a binary string, or null if not base64. */
export function decodeBase64Safe(value: string): string | null {
  try {
    const once = atob(value);
    try {
      return atob(once);
    } catch {
      return once;
    }
  } catch {
    return null;
  }
}

export function binaryStringToBlob(binary: string, mimeType: string): Blob {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** onPressAttachLineItem(): decode an attachment row's Value and download it as Filename. */
export function downloadAttachment(row: { Value?: string; Mimetype?: string; Filename?: string }): boolean {
  const binary = decodeBase64Safe(row.Value || '');
  if (binary === null) return false;
  downloadBlob(binaryStringToBlob(binary, row.Mimetype || 'application/octet-stream'), row.Filename || 'attachment');
  return true;
}
