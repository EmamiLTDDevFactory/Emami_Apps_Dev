'use client';
/** Name mapping helper (AI insights tab): SAP brands without a management name, with suggested matches to review. Display only: nothing is saved or sent to SAP. */
import { useState } from 'react';
import { ClipboardCopy, Sparkles } from 'lucide-react';
import { Button, Pill, Spinner } from '../ui';
import { loadBrands } from '@/lib/client/hier';
import { loadMgmt, mgmtBrand } from '@/lib/client/mgmtNames';
import { suggestBrandNames, type Suggestion } from '@/lib/ai/mapping';
import { readHubSession } from '@/lib/client/session';
import { errorText } from '../budget-mgmt/shared';

export default function NameMapper() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [note, setNote] = useState('');
  async function run() {
    setBusy(true); setNote(''); setRows(null);
    try {
      const d = await loadMgmt();
      if (!d) { setNote('The management names are switched off in this build.'); setBusy(false); return; }
      const b = await loadBrands({}, { force: true });
      const un = b.brands.filter((x) => !mgmtBrand(d, x.code, x.sapDescr ?? x.descr)).map((x) => ({ code: x.code, text: x.sapDescr ?? x.descr }));
      if (!un.length) { setNote(`All ${b.brands.length} SAP brands already have a management name.`); setBusy(false); return; }
      const names = Array.from(new Set(Object.values(d.brandText)));
      setRows(await suggestBrandNames(un, names, readHubSession()?.email ?? 'unknown'));
      setNote(`${un.length} of ${b.brands.length} SAP brands have no management name.`);
    } catch (e) { setNote(errorText(e)); }
    setBusy(false);
  }
  const csv = () => rows && void navigator.clipboard?.writeText(['SAP code,SAP text,Suggested management name,Confidence,Reason', ...rows.map((r) => [r.code, r.text, r.suggestion, r.confidence, r.reason].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n'));
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-sm font-extrabold">Name mapping helper</h3>
      <p className="mb-2 text-xs text-muted">Finds SAP brands that have no management name and suggests the matching name from the product hierarchy workbook. A suggestion is only a draft to review: nothing is saved or changed in SAP.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run()} disabled={busy}><Sparkles size={13} /> {busy ? 'Working…' : 'Find unmapped brands'}</Button>
        {busy && <Spinner className="h-4 w-4" />}
        {rows && rows.length > 0 && <Button size="sm" variant="ghost" onClick={csv}><ClipboardCopy size={13} /> Copy as CSV</Button>}
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      {rows && rows.length > 0 && (
        <div className="mt-3 max-h-[50vh] overflow-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-sunken/80 text-2xs uppercase text-muted"><tr><th className="px-2 py-1.5 text-left">SAP code</th><th className="text-left">SAP text</th><th className="text-left">Suggested name</th><th className="text-left">Confidence</th><th className="text-left">Why</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.code} className="border-t border-line/60"><td className="px-2 py-1 font-mono">{r.code}</td><td>{r.text}</td><td className="font-semibold">{r.suggestion || '—'}</td>
                <td>{r.confidence ? <Pill tone={r.confidence === 'high' ? 'good' : r.confidence === 'medium' ? 'warn' : 'neutral'}>{r.confidence}</Pill> : ''}</td><td className="text-muted">{r.reason}</td></tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
