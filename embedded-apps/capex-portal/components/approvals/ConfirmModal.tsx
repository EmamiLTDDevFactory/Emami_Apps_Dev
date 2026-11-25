'use client';
import type { ReactNode } from 'react';
import { Button, Modal } from '@/components/ui';

/** Fiori's sap.m.MessageBox.confirm. */
export default function ConfirmModal({ open, title, children, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }: {
  open: boolean; title: ReactNode; children: ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => undefined : onClose}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button></>}>
      <div className="whitespace-pre-line text-[13px] text-sap-ink">{children}</div>
    </Modal>
  );
}
