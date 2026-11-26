'use client';
import { useRef, useState } from 'react';
import { Button, Chip, Header, Notice, Table, Toolbar, type ScreenProps } from '../ui';
import { EMPTY_HEADER, HeaderForm, LinesTable, emptyLine } from '../PoEditor';
import { errText, extractPo, listPos, savePo } from '@/lib/api';
import { imageDataUrl, kindOf, pdfText, sheetText } from '@/lib/files';
import { alpha, date, dateTime } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { STATUS_INFO, type Po, type PoHeader, type PoLine, type Source } from '@/lib/types';

interface Draft { source: Source; fileName: string; header: PoHeader; lines: PoLine[]; warnings: string[] }

/** Step 1: every PO captured — PDF, Excel, image or pasted email text is read by AI into header + lines, checked by a person, saved. */
export default function PoCapture({ active, canWrite, notify, go }: ScreenProps) {
  const inbox = useLoad(() => listPos(), active, [] as Po[]);
  const [queue, setQueue] = useState<Draft[]>([]);
  const [busy, setBusy] = useState('');
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const draft = queue[0];

  const read = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      if (kind === 'unknown') { notify(`${file.name}: only PDF, Excel / CSV, image or text files can be read.`, 'error'); continue; }
      if (file.size > 15 * 1024 * 1024) { notify(`${file.name} is larger than 15 MB.`, 'error'); continue; }
      setBusy(`Reading ${file.name}…`);
      try {
        const body = kind === 'image' ? { fileName: file.name, imageDataUrl: await imageDataUrl(file) }
          : { fileName: file.name, text: kind === 'pdf' ? await pdfText(file) : kind === 'excel' ? await sheetText(file) : await file.text() };
        const r = await extractPo(body);
        setQueue((q) => [...q, { source: kind === 'email' ? 'email' : kind, fileName: file.name, header: { ...EMPTY_HEADER, ...r.header }, lines: r.lines, warnings: r.warnings }]);
        notify(`${file.name}: ${r.lines.length} line(s) read. Check them and save.`, 'success');
      } catch (e) {
        notify(`${file.name}: ${errText(e)}`, 'error');
      }
    }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const readPaste = async () => {
    if (paste.trim().length < 20) { notify('Paste the PO email or text first.', 'error'); return; }
    setBusy('Reading the pasted text…');
    try {
      const r = await extractPo({ fileName: 'pasted text', text: paste });
      setQueue((q) => [...q, { source: 'email', fileName: 'Pasted email', header: { ...EMPTY_HEADER, ...r.header }, lines: r.lines, warnings: r.warnings }]);
      setPaste(''); setShowPaste(false);
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(''); }
  };

  const setDraft = (d: Partial<Draft>) => setQueue((q) => [{ ...q[0], ...d }, ...q.slice(1)]);
  const save = async (thenValidate: boolean) => {
    if (!draft) return;
    const lines = draft.lines.filter((l) => l.CUST_MAT || l.EAN || l.DESCRIPTION || l.MATNR || l.QTY);
    if (!lines.length) { notify('The PO has no lines.', 'error'); return; }
    setBusy('Saving…');
    try {
      const po = await savePo({ ...draft, lines });
      notify(`PO ${po.header.BSTKD || `#${po.id}`} saved to the inbox.`, 'success');
      setQueue((q) => q.slice(1));
      void inbox.reload();
      if (thenValidate) go('exceptions', po.id);
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(''); }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); if (canWrite && !busy && e.dataTransfer.files.length) void read(e.dataTransfer.files); };

  return (
    <div>
      <Header title="PO Capture" hint="Customer POs from any channel: drop PDFs, Excel sheets, photos or paste the email. AI reads them; you check before anything goes to SAP." />
      {!canWrite && <Notice tone="warn">Your role is read only: you can see the inbox but not capture POs.</Notice>}
      {canWrite && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="mb-4 flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-plum/25 bg-plum-soft/40 px-4 py-6 text-center">
          <p className="text-sm font-bold text-sap-ink">Drop customer POs here</p>
          <p className="text-xs text-sap-muted">PDF, XLSX / XLS / CSV, PNG / JPG, EML / TXT · several at once · 15 MB each</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <input ref={fileRef} type="file" multiple hidden accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.eml,.txt" onChange={(e) => e.target.files && void read(e.target.files)} />
            <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={!!busy}>Choose files</Button>
            <Button onClick={() => setShowPaste((s) => !s)} disabled={!!busy}>Paste email text</Button>
            <Button onClick={() => setQueue((q) => [...q, { source: 'manual', fileName: 'Manual entry', header: { ...EMPTY_HEADER }, lines: [emptyLine(1)], warnings: [] }])} disabled={!!busy}>Enter by hand</Button>
          </div>
          {busy && <p className="flex items-center gap-2 text-xs text-plum"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-plum" />{busy}</p>}
          {showPaste && (
            <div className="mt-2 w-full max-w-3xl">
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} className="field !h-auto w-full py-2 font-mono" placeholder="Paste the PO email body or table here" aria-label="Pasted PO text" />
              <div className="mt-1 flex justify-end"><Button variant="primary" onClick={() => void readPaste()} disabled={!!busy}>Read</Button></div>
            </div>
          )}
        </div>
      )}

      {draft && (
        <div className="mb-5 rounded-2xl border border-plum/20 bg-white/60 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-bold">Check the reading: {draft.fileName}</h3>
            <Chip>{draft.source}</Chip>
            {queue.length > 1 && <Chip cls="bg-amber-50 text-amber-800 ring-amber-200">{queue.length - 1} more waiting</Chip>}
            <div className="flex-1" />
            <Button variant="danger" onClick={() => setQueue((q) => q.slice(1))} disabled={!!busy}>Discard</Button>
            <Button onClick={() => void save(false)} disabled={!!busy}>Save to inbox</Button>
            <Button variant="primary" onClick={() => void save(true)} disabled={!!busy}>Save and validate</Button>
          </div>
          {draft.warnings.length > 0 && <Notice tone="warn"><ul className="list-disc pl-4">{draft.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
          <HeaderForm header={draft.header} onChange={(h) => setDraft({ header: h })} editable />
          <LinesTable lines={draft.lines} onChange={(l) => setDraft({ lines: l })} editable header={draft.header} showChecks={false} />
          <p className="mt-2 text-2xs text-sap-muted">AI copies what is printed; it does not calculate. Lines flagged at validation: quantity not read, amount not equal to quantity × price.</p>
        </div>
      )}

      <Toolbar>
        <h3 className="flex-1 font-display text-sm font-bold">PO inbox <span className="font-normal text-sap-muted">· last 500</span></h3>
        <Button onClick={() => void inbox.reload()} disabled={inbox.loading}>Refresh</Button>
      </Toolbar>
      {inbox.error && <p className="mb-2 text-xs text-red-700">{inbox.error}</p>}
      <Table rows={inbox.data} loading={inbox.loading} rowKey={(r) => String(r.id)} empty="No POs captured yet."
        onRowClick={(r) => go(r.status === 'so_created' || r.status === 'ready' ? 'sales-orders' : 'exceptions', r.id)}
        cols={[
          { key: 'id', label: '#', num: true },
          { key: 'status', label: 'Status', render: (r) => <Chip cls={STATUS_INFO[r.status as Po['status']].cls}>{STATUS_INFO[r.status as Po['status']].label}</Chip>, value: (r) => r.status },
          { key: 'bstkd', label: 'Customer PO', render: (r) => <span className="font-mono">{r.header.BSTKD}</span>, value: (r) => r.header.BSTKD },
          { key: 'cust', label: 'Customer', render: (r) => r.header.NAME1 || r.header.CUSTOMER_NAME, value: (r) => r.header.NAME1 || r.header.CUSTOMER_NAME },
          { key: 'kunnr', label: 'Sold-to', render: (r) => alpha(r.header.KUNNR), value: (r) => r.header.KUNNR },
          { key: 'podate', label: 'PO date', render: (r) => date(r.header.PO_DATE), value: (r) => r.header.PO_DATE },
          { key: 'lineCount', label: 'Lines', num: true },
          { key: 'openExceptions', label: 'Exceptions', num: true },
          { key: 'soNumber', label: 'Sales order', render: (r) => <span className="font-mono">{alpha(r.soNumber ?? '')}</span> },
          { key: 'source', label: 'Source' },
          { key: 'createdAt', label: 'Received', render: (r) => dateTime(r.createdAt), value: (r) => r.createdAt },
          { key: 'createdBy', label: 'By' },
        ]} />
    </div>
  );
}
