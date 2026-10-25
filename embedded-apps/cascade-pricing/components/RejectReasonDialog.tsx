'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  count: number;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

const MAX = 255;
const MIN = 5;

/**
 * Collects the rejection reason before REJECT_WITH_REASON. Focus starts in the textarea; Tab cycles textarea -> Submit
 * -> Cancel; Escape cancels. The overlay does not close it - only the buttons or Escape do.
 */
export default function RejectReasonDialog({ count, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const tooShort = reason.trim().length < MIN;
  // Submit stays disabled while the reason is too short, so the message shows as soon as something too short is typed.
  const showErr = tooShort && (tried || reason.length > 0);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      // Submit is skipped while it is disabled (the browser cannot focus it).
      const order = [textRef.current, submitRef.current, cancelRef.current].filter((x): x is HTMLTextAreaElement | HTMLButtonElement => !!x && !(x as HTMLButtonElement).disabled);
      const i = order.indexOf(document.activeElement as HTMLTextAreaElement | HTMLButtonElement);
      e.preventDefault();
      order[(i + (e.shiftKey ? order.length - 1 : 1) + order.length) % order.length]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); before?.focus(); };
  }, [onCancel]);

  const submit = () => {
    setTried(true);
    if (tooShort) return;
    onSubmit(reason.trim());
  };

  // On document.body: the glass panels (backdrop-filter) would otherwise confine a fixed overlay to the panel.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/40 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="fade-up w-[480px] max-w-full rounded-3xl bg-white p-6 shadow-pop ring-1 ring-white">
        <h2 id="reject-title" className="font-display text-base font-bold text-sap-ink">Reject {count} row(s)</h2>
        <label htmlFor="reject-reason" className="mt-4 block text-xs font-semibold text-sap-ink">Reason for rejection <span className="text-red-600" aria-hidden="true">*</span></label>
        <textarea id="reject-reason" ref={textRef} rows={4} value={reason} maxLength={MAX} required aria-label="Reason for rejection" aria-invalid={showErr ? true : undefined} aria-describedby="reject-count reject-err"
          onChange={(e) => setReason(e.target.value.slice(0, MAX))}
          className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2 text-sm text-sap-ink focus:outline-none focus:ring-4 ${showErr ? 'border-red-500 focus:ring-red-500/15' : 'border-plum/20 focus:border-violet-400 focus:ring-violet-500/15'}`} />
        <div className="mt-1 flex items-start justify-between gap-3 text-2xs">
          <span id="reject-err" className="text-red-600" role={showErr ? 'alert' : undefined}>{showErr ? `Reason must be at least ${MIN} characters` : ''}</span>
          <span id="reject-count" className="shrink-0 text-sap-muted">{reason.length} / {MAX} characters</span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={submitRef} type="button" onClick={submit} disabled={tooShort} className="btn btn-primary">Submit</button>
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
