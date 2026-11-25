'use client';
import { Button, Input, useToast } from '@/components/ui';
import { validateFile } from '@/lib/documents';
import { nextId, type Attachments, type AttachSlot } from './logic';

type Patch = (fn: (a: Attachments) => Attachments) => void;

/**
 * The attachment matrix (log #51/#68/#69/#102/#103/#106): RFQ + Quotation (3 slots, 1 for Single Vendor), the three single
 * documents, and any number of General documents. Files are picked here and uploaded on Save Draft / Submit (uploads.ts);
 * mandatory slots carry an asterisk. A saved file cannot be removed (no DELETE in the proxy) - only a local pick can be cleared.
 */
export default function AttachmentMatrix({ att, onChange, single, onFile, getFile, maxMb, extensions }: {
  att: Attachments; onChange: Patch; single: boolean; onFile: (slotId: string, file: File | null) => void; getFile?: (slotId: string) => File | undefined; maxMb: number; extensions: string;
}) {
  const toast = useToast();
  const exts = extensions.split(',').map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
  const accept = exts.map((e) => '.' + e).join(',');

  const patchSlot = (get: (a: Attachments) => AttachSlot | AttachSlot[], id: string, p: Partial<AttachSlot>) =>
    onChange((a) => {
      const cur = get(a);
      if (Array.isArray(cur)) {
        const key = (['rfq', 'quotation', 'general'] as const).find((k) => a[k] === cur)!;
        return { ...a, [key]: cur.map((s) => (s.id === id ? { ...s, ...p } : s)) };
      }
      const key = (['tcc', 'negotiation', 'justification'] as const).find((k) => a[k] === cur)!;
      return { ...a, [key]: { ...cur, ...p } };
    });

  function pick(slotId: string, f: File | undefined, apply: (name: string) => void, input: HTMLInputElement) {
    if (!f) { onFile(slotId, null); apply(''); return; }
    const bad = validateFile(f, { extensions: exts, maxMb });
    if (bad) { toast(bad, 'error'); input.value = ''; return; }
    onFile(slotId, f);
    apply(f.name);
  }
  function view(slotId: string) {
    const f = getFile?.(slotId);
    if (!f) return;
    const url = URL.createObjectURL(f);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // A plain render function (not a component): a component defined in here would remount on every keystroke and lose focus / the file.
  const slot = (s: AttachSlot, get: (a: Attachments) => AttachSlot | AttachSlot[], required?: boolean, removable?: () => void) => (
    <div key={s.id} className="w-full rounded-lg border border-sap-line bg-white/60 p-3 sm:w-[17rem]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] font-bold text-sap-ink">{s.label}{required && <span className="text-red-600"> *</span>}</div>
        {removable && <button type="button" onClick={removable} aria-label={`Remove ${s.label}`} className="text-sap-muted hover:text-red-600">{'\u00d7'}</button>}
      </div>
      <input
        type="file" accept={accept} aria-label={`${s.label} file`}
        onChange={(e) => pick(s.id, e.target.files?.[0], (name) => patchSlot(get, s.id, { fileName: name }), e.target)}
        className="mt-2 block w-full text-[11px] file:mr-2 file:rounded-md file:border file:border-sap-line file:bg-white file:px-2 file:py-1"
      />
      {s.fileName && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-sap-muted">
          <span className="break-all">Selected: {s.fileName}</span>
          <button type="button" className="font-bold text-plum hover:underline" onClick={() => view(s.id)}>View</button>
          <button type="button" className="font-bold text-red-600 hover:underline"
            onClick={(e) => {
              const inp = e.currentTarget.closest('div.w-full')?.querySelector('input[type=file]') as HTMLInputElement | null;
              if (inp) inp.value = '';
              onFile(s.id, null); patchSlot(get, s.id, { fileName: '' });
            }}>Clear</button>
        </div>
      )}
      <Input className="mt-2 w-full" placeholder="Document title" value={s.title} onChange={(e) => patchSlot(get, s.id, { title: e.target.value })} />
      <Input className="mt-2 w-full" placeholder="Note (optional)" value={s.note} onChange={(e) => patchSlot(get, s.id, { note: e.target.value })} />
    </div>
  );

  const label = (t: string) => <div className="mb-1 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-sap-muted first:mt-0">{t}</div>;

  return (
    <div>
      {label('RFQ')}
      <p className="mb-2 text-[11px] text-sap-muted">{single ? '1 RFQ is required for this CPE.' : '3 RFQs are required for every CPE.'}</p>
      <div className="flex flex-wrap gap-3">{att.rfq.map((s) => slot(s, (a) => a.rfq, true))}</div>
      {label('Quotation')}
      <p className="mb-2 text-[11px] text-sap-muted">{single ? '1 Quotation is required for this CPE.' : '3 Quotations are required for every CPE.'}</p>
      <div className="flex flex-wrap gap-3">{att.quotation.map((s) => slot(s, (a) => a.quotation, true))}</div>
      {label('Other required documents')}
      <div className="flex flex-wrap gap-3">
        {slot(att.tcc, (a) => a.tcc, true)}
        {slot(att.negotiation, (a) => a.negotiation, true)}
        {slot(att.justification, (a) => a.justification, true)}
      </div>
      {label('General / Additional documents')}
      <div className="flex flex-wrap gap-3">
        {att.general.map((s) => slot(s, (a) => a.general, false,
          () => { onFile(s.id, null); onChange((a) => ({ ...a, general: a.general.filter((g) => g.id !== s.id) })); }))}
      </div>
      <Button className="mt-3"
        onClick={() => onChange((a) => ({ ...a, general: [...a.general, { id: nextId('GEN', a.general), label: 'Additional Document', title: '', note: '', fileName: '' }] }))}>
        + Add document
      </Button>
    </div>
  );
}
