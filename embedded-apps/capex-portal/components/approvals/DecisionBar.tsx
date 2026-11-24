'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, TextArea, useAction, useToast } from '@/components/ui';
import { commentError } from './logic';
import ConfirmModal from './ConfirmModal';

export interface DecisionAction {
  key: string; label: string; variant: 'primary' | 'secondary' | 'success' | 'danger';
  /** reject/hold: a comment of COMMENT_MIN_CHARS is mandatory */
  commentRequired?: boolean; requiredVerb?: string;
  confirmTitle: string; confirmText: ReactNode; confirmLabel: string;
  /** performs the SAP call(s); receives the trimmed comment. Must throw on failure. Returns the success toast. */
  run: (comment: string) => Promise<string>;
}

/**
 * "Your Decision" card + action buttons + confirm dialog. One action at a time (log #90). After ANY outcome the caller's `reload`
 * runs (log #23: no stale rows); on success we go back to the inbox, on failure SAP's message is shown and the screen stays.
 */
export default function DecisionBar({ actions, commentMin, placeholder, reload }: { actions: DecisionAction[]; commentMin: number; placeholder: string; reload: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { busy, run } = useAction();
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<DecisionAction | null>(null);

  const start = (a: DecisionAction) => {
    if (a.commentRequired) {
      const e = commentError(comment, commentMin, a.requiredVerb || a.label.toLowerCase());
      setErr(e);
      if (e) { toast(e, 'error'); return; }
    } else setErr('');
    setPending(a);
  };

  const confirm = async () => {
    const a = pending;
    if (!a) return;
    const msg = await run(async () => {
      try { return await a.run(comment.trim()); }
      catch (e) { reload(); throw e; }
    });
    if (msg === undefined) { setPending(null); return; }
    setPending(null);
    reload();
    toast(msg, 'success');
    router.push('/approvals/');
  };

  return (
    <>
      <Card title="Your Decision">
        <Field label="Comment" error={err} hint="Optional for approval. Mandatory when rejecting or holding.">
          <TextArea value={comment} maxLength={1000} rows={3} placeholder={placeholder} onChange={(e) => { setComment(e.target.value); if (err) setErr(''); }} />
        </Field>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {actions.map((a) => <Button key={a.key} variant={a.variant} disabled={busy} onClick={() => start(a)}>{a.label}</Button>)}
        </div>
      </Card>
      <ConfirmModal open={!!pending} title={pending?.confirmTitle ?? ''} confirmLabel={pending?.confirmLabel} danger={pending?.variant === 'danger'} busy={busy}
        onConfirm={confirm} onClose={() => setPending(null)}>{pending?.confirmText}</ConfirmModal>
    </>
  );
}
