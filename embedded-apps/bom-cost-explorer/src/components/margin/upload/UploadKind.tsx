'use client';
/** One Upload tab (one Kind): template, file, preview, Check (Dryrun X), Save (only after a clean check of the same rows). */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileUp, Save, ShieldCheck, XCircle } from 'lucide-react';
import { Button, Spinner, cx } from '../../ui';
import { columnsOf, KIND_LABEL, type UploadKind } from '@/lib/margin/uploadKinds';
import { canSave, downloadTemplate, fingerprint, isClean, nothingSaved, orderRowResults, readUploadFile, submitUpload, validateRows, type CheckState, type UploadResult, type UploadRowInput } from '@/lib/margin/upload';

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const td = 'px-2.5 py-1.5 align-top';
const PREVIEW = 200;

function Result({ r, rows, title }: { r: UploadResult; rows: UploadRowInput[]; title: string }) {
  const ordered = useMemo(() => orderRowResults(r.rows), [r.rows]);
  const bad = nothingSaved(r);
  return (
    <section aria-label={title} className={cx('rounded-xl border px-3 py-2', bad ? 'border-bad/40 bg-bad/[0.05]' : 'border-good/40 bg-good/[0.05]')}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold" role={bad ? 'alert' : 'status'}>
        {bad ? <XCircle size={16} className="text-bad" aria-hidden /> : <CheckCircle2 size={16} className="text-good" aria-hidden />}
        {title}: {bad ? `${r.errors || ordered.filter((x) => x.status === 'E').length} error row(s). Nothing was saved.` : r.dryrun ? 'the check passed. Nothing is saved yet.' : `saved ${r.saved} row(s).`}
        <span className="text-xs font-normal text-muted">Status {r.status || '—'}{r.msgTxt ? ` · ${r.msgTxt}` : ''}</span>
      </p>
      {ordered.length > 0 && (
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken"><tr><th className={th}>Row</th><th className={th}>Result</th><th className={th}>Message from SAP</th></tr></thead>
            <tbody>
              {ordered.map((x) => (
                <tr key={x.rowno} className="border-t border-line/60">
                  <td className={cx(td, 'num')}>{rows.find((q) => q.rowNo === x.rowno)?.rowNo ?? x.rowno}</td>
                  <td className={td}>{x.status === 'E' ? <span className="font-bold text-bad">✕ Error</span> : x.status === 'W' ? <span className="font-bold text-warn">! Warning</span> : <span className="text-good">✓ OK</span>}</td>
                  <td className={td}>{x.msg || <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function UploadKindTab({ kind, email }: { kind: UploadKind; email: string }) {
  const cols = columnsOf(kind);
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<UploadRowInput[]>([]);
  const [note, setNote] = useState('');
  const [readErr, setReadErr] = useState('');
  const [check, setCheck] = useState<CheckState | null>(null);
  const [saved, setSaved] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState<'' | 'read' | 'check' | 'save'>('');
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => (rows.length || file ? validateRows(kind, rows) : []), [kind, rows, file]);
  const fp = useMemo(() => fingerprint(kind, rows), [kind, rows]);
  const checkValid = !!check && check.fingerprint === fp; // an old check never counts for changed rows
  const allowSave = canSave(kind, rows, check, issues) && busy === '';
  const issueRows = new Set(issues.filter((i) => i.rowNo > 0).map((i) => i.rowNo));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy('read'); setReadErr(''); setErr(''); setCheck(null); setSaved(null); setFile(f.name);
    try {
      const r = await readUploadFile(kind, f);
      setRows(r.rows);
      setNote(r.headerFound ? (r.unknown.length ? `Columns not used: ${r.unknown.join(', ')}.` : '') : 'No header row found: the template column order was assumed.');
    } catch (e) { setRows([]); setReadErr(`The file could not be read: ${(e as Error).message}`); }
    finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const run = async (dryrun: boolean) => {
    setBusy(dryrun ? 'check' : 'save'); setErr('');
    try {
      const result = await submitUpload(kind, rows, dryrun, email);
      if (dryrun) { setCheck({ fingerprint: fp, result }); setSaved(null); } else { setSaved(result); if (isClean(result)) setCheck(null); }
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void downloadTemplate(kind)}><Download size={14} /> Download template</Button>
        <input ref={input} type="file" accept=".xlsx,.csv,.txt" className="sr-only" id={`margin-file-${kind}`} onChange={(e) => void onFile(e.target.files?.[0])} />
        <label htmlFor={`margin-file-${kind}`} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold hover:bg-sunken focus-within:ring-2"><FileUp size={14} aria-hidden /> Choose file (xlsx or csv)</label>
        {file && <span className="text-xs text-muted">{file} · {rows.length} row(s)</span>}
        {busy === 'read' && <Spinner className="h-4 w-4" />}
      </div>
      <p className="text-xs text-muted">{KIND_LABEL[kind]}: columns {cols.map((c) => `${c.header}${c.required ? '*' : ''}`).join(', ')}. The browser checks the format only (required columns, numbers, dates); SAP checks the content.</p>
      {readErr && <p role="alert" className="text-sm text-bad">{readErr}</p>}
      {note && <p className="text-xs text-warn">{note}</p>}

      {issues.length > 0 && (
        <div role="alert" className="rounded-xl border border-warn/40 bg-warn/[0.06] px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-bold text-warn"><AlertTriangle size={15} aria-hidden /> {issues.length} format problem(s): fix the file and choose it again.</p>
          <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5 text-xs">{issues.slice(0, 100).map((i, n) => <li key={n}>{i.rowNo ? `Row ${i.rowNo}, ${i.field}: ` : ''}{i.message}</li>)}</ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="bg-sunken"><tr><th className={th}>Row</th>{cols.map((c) => <th key={c.key} className={th}>{c.header}</th>)}</tr></thead>
            <tbody>
              {rows.slice(0, PREVIEW).map((r) => (
                <tr key={r.rowNo} className={cx('border-t border-line/60', issueRows.has(r.rowNo) && 'bg-warn/[0.08]')}>
                  <td className={cx(td, 'num')}>{issueRows.has(r.rowNo) ? <span title="Format problem">! </span> : null}{r.rowNo}</td>
                  {cols.map((c) => <td key={c.key} className={td}>{r.cells[c.key] || <span className="text-faint">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > PREVIEW && <p className="px-3 py-2 text-xs text-muted">Showing the first {PREVIEW} of {rows.length} rows; all rows are checked and saved.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void run(true)} disabled={!rows.length || issues.length > 0 || busy !== ''}>{busy === 'check' ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck size={14} />} Check (nothing is saved)</Button>
        <Button onClick={() => void run(false)} disabled={!allowSave} title={allowSave ? 'Save these rows in SAP' : 'Check these rows first: Save is allowed only after a clean check of exactly these rows'}>{busy === 'save' ? <Spinner className="h-3.5 w-3.5" /> : <Save size={14} />} Save</Button>
        {!!check && !checkValid && <span className="text-xs text-warn">The rows changed since the check: check again.</span>}
        {busy === 'check' || busy === 'save' ? <span className="text-xs text-muted">Waiting for SAP… (no time limit of its own)</span> : null}
      </div>
      {err && <p role="alert" className="text-sm text-bad">{err}</p>}
      {check && <Result r={check.result} rows={rows} title={checkValid ? 'Check' : 'Earlier check (rows changed)'} />}
      {saved && <Result r={saved} rows={rows} title="Save" />}
    </div>
  );
}
