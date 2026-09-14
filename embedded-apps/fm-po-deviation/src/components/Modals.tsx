'use client';

import { useState } from 'react';
import { X, Download, MessageSquare, Clock3 } from 'lucide-react';
import type { PoRow } from '../types/po';
import { formatDateTime } from '../lib/formatters';

function ModalShell({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-plumDeep/60 p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-3xl h-[85vh]' : 'max-w-md'} rounded-2xl bg-white shadow-pop animate-slideUp overflow-hidden flex flex-col`}
      >
        {children}
      </div>
    </div>
  );
}

/** Enhancement over the source app's plain window.prompt-like Dialog: same reject-reason capture,
 * styled to match the rest of this app instead of a bare native dialog. */
export function RejectDialog({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-extrabold text-ink">Reject Reason</h3>
        <button onClick={onClose} className="text-inkSoft hover:text-ink"><X size={18} /></button>
      </div>
      <div className="p-5 space-y-2">
        <p className="text-sm text-inkSoft">Please enter the reason for rejection:</p>
        <textarea
          value={reason}
          onChange={(e) => { setReason(e.target.value); setError(''); }}
          rows={4}
          placeholder="Enter rejection reason..."
          className="w-full resize-none rounded-xl border border-border p-3 text-sm text-ink focus:border-rust focus:outline-none focus:ring-2 focus:ring-rust/20"
        />
        {error && <p className="text-xs font-semibold text-red">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
        <button
          onClick={() => {
            const trimmed = reason.trim();
            if (!trimmed) { setError('Please enter a rejection reason.'); return; }
            onConfirm(trimmed);
          }}
          className="btn-danger bg-red text-white border-red"
          disabled={busy}
        >
          {busy ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </ModalShell>
  );
}

/** Enhancement over the source app's raw MessageBox text dump: the same Date/Time/User/Comments
 * log entries (Status 'L' rows), rendered as a proper timeline instead of one big joined string. */
export function HistoryLogModal({ poNumber, entries, onClose }: { poNumber: string; entries: PoRow[]; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-base font-extrabold text-ink">PO History — {poNumber}</h3>
        <button onClick={onClose} className="text-inkSoft hover:text-ink"><X size={18} /></button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto p-5">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-inkSoft">No history records found.</p>
        ) : (
          <ol className="relative border-l-2 border-border pl-5 space-y-5">
            {entries.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[27px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rust">
                  <Clock3 size={9} className="text-white" />
                </span>
                <p className="text-xs font-bold text-inkSoft">{formatDateTime(e.erdat, e.uzeit)}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{e.addInfo || 'N/A'}</p>
                {e.initRem && (
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-inkSoft">
                    <MessageSquare size={13} className="mt-0.5 shrink-0" />
                    {e.initRem}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </ModalShell>
  );
}

/** Enhancement over the source app's download-only print button: an in-app PDF preview (same
 * blob-URL + iframe approach IBD Provision Tracking's own attachment preview uses), with an
 * explicit Download action alongside it rather than only a browser-triggered file save. */
export function PdfPreviewModal({ blobUrl, filename, onClose }: { blobUrl: string; filename: string; onClose: () => void }) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="truncate text-sm font-bold text-ink">{filename}</h3>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload} className="btn-primary !py-1.5 !px-3 text-xs">
            <Download size={14} /> Download
          </button>
          <button onClick={onClose} className="text-inkSoft hover:text-ink"><X size={20} /></button>
        </div>
      </div>
      <iframe src={blobUrl} title={filename} className="flex-1 w-full bg-appBg" />
    </ModalShell>
  );
}
