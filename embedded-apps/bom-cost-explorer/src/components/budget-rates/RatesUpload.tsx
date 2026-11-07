'use client';
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button, Card, Field, Pill, Spinner, cx, inputCls } from '../ui';
import { parseDomesticExcel, parseIntlExcel } from '@/lib/budgetRatesExcel';
import { writeBudget } from '@/lib/budgetRatesApi';
import { generateTemplate } from '@/lib/budgetRatesTemplate';
import { LAND1_FLAG, LAND1_LABEL, LAND1_LIST, type Land1, type TableType, type UploadResult } from '@/lib/budgetRatesTypes';

type Status = 'idle' | 'parsing' | 'uploading' | 'done' | 'error';

export default function RatesUpload({ tableType, gjahr: gjahr0, defaultWerks }: { tableType: TableType; gjahr: string; defaultWerks: string[] }) {
  const [type, setType] = useState<TableType>(tableType);
  const [file, setFile] = useState<File | null>(null);
  const [land1, setLand1] = useState<Land1>('LK');
  const [gjahr, setGjahr] = useState(gjahr0);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function load(f: File | undefined, t = type, l = land1) {
    if (!f) return;
    setFile(f); setResult(null); setError(''); setParseError(null); setRows([]); setStatus('parsing');
    try {
      const parsed = (t === 'DOM' ? await parseDomesticExcel(f) : await parseIntlExcel(f, l)) as Record<string, unknown>[];
      if (!parsed.length) throw new Error('No data rows found in the first sheet.');
      setRows(parsed);
    } catch (e) {
      setParseError((e as Error).message);
    }
    setStatus('idle');
  }

  async function upload() {
    if (!/^\d{4}$/.test(gjahr)) return setError('Fiscal year must be 4 digits.');
    if (!window.confirm(`Write ${rows.length} ${type === 'DOM' ? 'domestic' : land1} budget rows for ${gjahr} to SAP?`)) return;
    setStatus('uploading'); setError(''); setResult(null);
    try {
      const werks = Array.from(new Set(rows.map((r) => String(r.Werks ?? '')).filter(Boolean)));
      setResult(await writeBudget({ tableType: type, gjahr, land1: type === 'INTL' ? land1 : '', werksCsv: (werks.length ? werks : defaultWerks).join(','), rows }));
      setStatus('done');
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }

  const keys = Array.from(new Set(rows.slice(0, 5).flatMap((r) => Object.keys(r))));
  const busy = status === 'parsing' || status === 'uploading';
  const errs = result?.Errors ? result.Errors.split('|').map((s) => s.trim()).filter(Boolean) : [];

  return (
    <Card title="Upload to SAP" actions={<Button size="sm" onClick={() => void generateTemplate(type, land1)}><Download size={14} /> Template</Button>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Table">
          {(id) => (
            <select id={id} className={inputCls} value={type} onChange={(e) => { const t = e.target.value as TableType; setType(t); if (file) void load(file, t); }}>
              <option value="DOM">Domestic (IN)</option>
              <option value="INTL">International</option>
            </select>
          )}
        </Field>
        <Field label="Fiscal year">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={4} value={gjahr} onChange={(e) => setGjahr(e.target.value)} />}</Field>
        {type === 'INTL' && (
          <div className="flex flex-wrap items-end gap-3 text-sm">
            {LAND1_LIST.map((l) => (
              <label key={l} className="flex items-center gap-1.5">
                <input type="radio" name="land1" checked={land1 === l} onChange={() => { setLand1(l); if (file) void load(file, type, l); }} />
                {LAND1_FLAG[l]} {LAND1_LABEL[l]} ({l})
              </label>
            ))}
          </div>
        )}
      </div>

      <div
        className="mt-3 grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line px-4 py-8 text-center text-sm text-muted hover:bg-sunken"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void load(e.dataTransfer.files[0]); }}
      >
        <Upload size={20} className="mb-1 text-accent" />
        {file ? <span className="font-semibold text-ink">{file.name}</span> : 'Drop an .xlsx file here or click to choose'}
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {status === 'parsing' && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Spinner /> Reading the file…</p>}
      {parseError && <p className="mt-2 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{parseError}</p>}
      {rows.length > 0 && (
        <div className="mt-3">
          <Pill tone="good">{rows.length} rows loaded</Pill>
          <div className="mt-2 max-h-60 overflow-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-sunken"><tr>{keys.map((k) => <th key={k} className="whitespace-nowrap border-b border-line px-2 py-1 text-left font-bold">{k}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-b border-line/60">{keys.map((k) => <td key={k} className="num whitespace-nowrap px-2 py-1">{String(r[k] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-1 text-2xs text-muted">First 5 rows shown.</p>
        </div>
      )}

      <div className="mt-3"><Button variant="primary" disabled={busy || !rows.length} onClick={() => void upload()}>{status === 'uploading' ? <Spinner /> : <Upload size={14} />} Upload to SAP</Button></div>

      {error && <p className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {result && (
        <div className={cx('mt-3 rounded-xl border px-3 py-2 text-sm', result.RowsFailed > 0 ? 'border-warn/40 bg-warn/10 text-warn' : 'border-good/40 bg-good/10 text-good')}>
          <p className="font-semibold">{result.RowsFailed > 0 ? '' : '✓ '}{result.RowsSaved} rows saved{result.RowsFailed > 0 && `, ${result.RowsFailed} failed`}</p>
          {result.Message && <p className="text-ink">{result.Message}</p>}
          {errs.length > 0 && <details className="mt-1 text-ink"><summary className="cursor-pointer">{errs.length} errors</summary><ul className="ml-4 list-disc">{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
        </div>
      )}
    </Card>
  );
}
