'use client';

import React, { useEffect, useMemo } from 'react';
import { Download, FileText } from 'lucide-react';
import { base64ToBlob } from '../lib/pdfAttachment';
import type { PoAttachment } from '../lib/paymentTrackingApi';
import { Button, Modal } from './ui';

interface Props {
  attachment: PoAttachment;
  onClose: () => void;
}

/** Preview + download for a PO header's quotation (see fetchPoAttachment in
 * paymentTrackingApi.ts — a keyed GetEntity read against ZPOAttachmentSet). PDF gets an inline
 * preview; anything else (images included, to keep this simple and not silently mis-render a
 * non-PDF/image type) just offers Download, since there's no confirmed need yet for an
 * image-specific preview here. */
export function QuotationPreviewModal({ attachment, onClose }: Props) {
  const { filename, mimetype, value } = attachment;
  const isPdf = mimetype.toLowerCase().includes('pdf');

  const blobUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    try {
      return URL.createObjectURL(base64ToBlob(value, mimetype));
    } catch {
      return '';
    }
  }, [value, mimetype]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleDownload = () => {
    if (!blobUrl || typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Modal
      title={<span title={filename}>{filename}</span>}
      subtitle="Quotation attachment"
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          <Button size="sm" variant="primary" icon={Download} onClick={handleDownload} disabled={!blobUrl} aria-label="Download">
            Download
          </Button>
        </>
      }
    >
      <div className="h-[68vh] overflow-hidden rounded-lg border border-border bg-appBg">
        {blobUrl && isPdf ? (
          <iframe src={blobUrl} title={filename} className="h-full w-full border-0" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FileText size={28} className="text-inkFaint" />
            <p className="text-sm text-inkSoft">
              {blobUrl ? "Preview isn't available for this file type — use Download to open it." : 'Could not prepare a preview for this file.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
