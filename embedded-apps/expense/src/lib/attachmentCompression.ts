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

// Flat per-file size limit for any attachment picked when creating a claim. Compression (image
// re-encoding, PDF rasterize-and-rebuild) was removed at the user's explicit request — attachments
// are no longer shrunk, just capped at a normal size.
export const MAX_ATTACHMENT_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENT_FILE_LABEL = '3 MB';
