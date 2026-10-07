'use client';

// Browser replacement for expo-document-picker's getDocumentAsync, with the SAME result shape the
// Expo screens consumed ({ canceled, assets: [{ uri, name, size, mimeType, file }] }), so every
// call site ports over unchanged. `uri` is a blob: URL, which is exactly what
// src/lib/pdfAttachment.ts's readAttachmentAsBase64 already fetches on web. Ported verbatim from
// payment-tracking/src/lib/documentPicker.ts (already proven there).

export interface PickedAsset {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  file: File;
}

export type PickResult = { canceled: true; assets: null } | { canceled: false; assets: PickedAsset[] };

export function getDocumentAsync(opts: { type?: string | string[]; multiple?: boolean } = {}): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts.type) input.accept = Array.isArray(opts.type) ? opts.type.join(',') : opts.type;
    input.multiple = !!opts.multiple;
    input.style.display = 'none';
    let settled = false;
    const done = (r: PickResult) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(r);
    };
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      if (!files.length) return done({ canceled: true, assets: null });
      done({
        canceled: false,
        assets: files.map((f) => ({ uri: URL.createObjectURL(f), name: f.name, size: f.size, mimeType: f.type, file: f })),
      });
    });
    // Closing the dialog without choosing fires 'cancel' in current browsers.
    input.addEventListener('cancel', () => done({ canceled: true, assets: null }));
    document.body.appendChild(input);
    input.click();
  });
}
