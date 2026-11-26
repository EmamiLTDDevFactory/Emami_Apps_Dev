'use client';
/** The specification / artwork PDF of a material, shown inside the app (latest by default, older versions in the list). Read-only: nothing is changed in SAP. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink } from 'lucide-react';
import { Drawer, Spinner } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { docPdf, docVersions } from '@/lib/matdocs/service';
import { DOC_LABEL } from '@/lib/matdocs/fields';
import { sizeText, type MatDoc } from '@/lib/matdocs/model';

export default function DocViewer({ doc, onClose }: { doc: MatDoc; onClose: () => void }) {
  const [versions, setVersions] = useState<MatDoc[]>([doc]);
  const [cur, setCur] = useState<MatDoc>(doc);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [prog, setProg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (doc.versions <= 1) return;
    const c = new AbortController();
    docVersions(doc.matnr, doc.type, c.signal).then((v) => { if (v.length) setVersions(v); }).catch(() => { /* the latest alone is still shown */ });
    return () => c.abort();
  }, [doc]);
  useEffect(() => {
    const c = new AbortController(); let made = '';
    setBusy(true); setError(''); setUrl(''); setProg('');
    docPdf(cur.matnr, cur.docId, c.signal, (d, t) => { if (t > 1) setProg(`part ${d} of ${t}`); })
      .then((b) => { made = URL.createObjectURL(b); setUrl(made); })
      .catch((e) => { if (!c.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => { c.abort(); if (made) URL.revokeObjectURL(made); };
  }, [cur]);
  const file = `${cur.title || `${cur.type}_${cur.matnr}`}.pdf`.replace(/[\\/:*?"<>|]+/g, '_');
  const body = (
    <Drawer open onClose={onClose} width={1100} title={
      <div>
        <div className="text-sm font-bold">{DOC_LABEL[cur.type]}: <span className="font-mono">{cur.matnr}</span> {cur.maktx}</div>
        <div className="text-2xs text-muted">{cur.title} · attached {cur.created || '-'}{cur.createdBy ? ` by ${cur.createdBy}` : ''}{cur.size ? ` · ${sizeText(cur.size)}` : ''}</div>
      </div>
    }>
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {versions.length > 1 && (
            <label className="flex items-center gap-1.5 text-xs font-semibold">Version
              <select className="rounded-lg border border-line bg-panel px-2 py-1 text-xs" value={cur.docId} onChange={(e) => { const v = versions.find((x) => x.docId === e.target.value); if (v) setCur(v); }}>
                {versions.map((v, i) => <option key={v.docId} value={v.docId}>{i === 0 ? 'Latest · ' : ''}{v.created || v.title} · {v.title}</option>)}
              </select>
            </label>
          )}
          {url && <a href={url} download={file} className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-2xs font-bold hover:border-accent"><Download size={13} aria-hidden /> Download</a>}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-2xs font-bold hover:border-accent"><ExternalLink size={13} aria-hidden /> Open in new tab</a>}
          {doc.versions > 1 && <span className="text-2xs text-muted">{doc.versions} versions in SAP</span>}
        </div>
        {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the PDF from SAP {prog}</p>}
        {error && <ErrorBox>{error}</ErrorBox>}
        {url && <iframe title={`${DOC_LABEL[cur.type]} ${cur.matnr}`} src={url} className="min-h-[70vh] w-full flex-1 rounded-xl border border-line bg-white" />}
        <p className="text-2xs text-muted">Read-only, from the material master attachments (titles SPEC_ / ARTWORK_). Nothing is changed in SAP.</p>
      </div>
    </Drawer>
  );
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
