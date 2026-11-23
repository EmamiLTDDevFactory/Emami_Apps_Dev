'use client';
/**
 * Budget upload: OB (opening) and RB (revised) budget per reporting row x report header (x site, optional), annual or
 * by month. Template prefilled from the report rows (and the active version, for round-trip edits); every upload is
 * checked first (dry run), then saved as a new version; any earlier version can be made active again.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, History, RotateCcw, Upload } from 'lucide-react';
import { api, type ApiError } from '@/lib/api';
import { useApp } from '@/lib/context';
import { fmtDateTime, fyLabel, short, UNIT_DIV, UNIT_LABEL, ytdLabel, type Unit } from '@/lib/format';
import { MONTHS, mapColumns, readSheet, writeBook, type Cell } from '@/lib/excel';
import type { BudgetStatus, BudgetVersion, UploadResult, UploadRow } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Select, Skeleton, Tabs, cx, inputCls } from '../ui';

type Kind = 'OB' | 'RB';
const KIND_LABEL: Record<Kind, string> = { OB: 'OB - opening budget', RB: 'RB - revised budget' };
const r2 = (x: number) => Math.round(x * 100) / 100;
/** Change against the active version: '–' when there is none. */
const delta = (x: number) => (Math.abs(x) < 0.5 ? '–' : `${x > 0 ? '+' : '−'}${short(Math.abs(x))}`);

const COLUMNS: Record<string, string[]> = {
  key: ['Reporting key', 'Key', 'ReportingKey'], company: ['Company', 'Company code'], category: ['Category'], range: ['Range', 'Brand family'],
  brand: ['Brand'], line: ['Report row', 'Row', 'Item'], header: ['Header', 'Report header', 'Header group'], site: ['Site'], annual: ['Annual', 'Annual budget', 'FY total'],
  ...Object.fromEntries(MONTHS.map((m, i) => [`m${i}`, [m, `P${String(i + 1).padStart(2, '0')}`]])),
};

export default function BudgetAdmin() {
  const { q, filters, config, refreshAll } = useApp();
  const [status, setStatus] = useState<BudgetStatus | { error: string } | null>(null);
  const [kind, setKind] = useState<Kind>('RB');
  const [unit, setUnit] = useState<Unit>('lakh');
  const [file, setFile] = useState<{ name: string; rows: UploadRow[] } | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);
  const label = (id: string) => config.groups.find((g) => g.id === id)?.label ?? id;

  const load = useCallback(() => { setStatus(null); api.budget(filters.fy).then(setStatus).catch((e: ApiError) => setStatus({ error: e.message })); }, [filters.fy]);
  useEffect(load, [load]);
  useEffect(() => { setFile(null); setResult(null); }, [kind, unit, filters.fy]);

  async function template() {
    setBusy('template'); setMsg(null);
    try {
      const lines = await api.budgetTemplate(q, kind);
      const div = UNIT_DIV[unit];
      const v = (x: number | null | undefined) => (x === null || x === undefined ? null : r2(x / div));
      const rows: Cell[][] = [
        ['Reporting key', 'Company', 'Category', 'Range', 'Brand', 'Report row', 'Header', 'Site', 'Annual', ...MONTHS, `PY ${ytdLabel(Number(filters.fy) - 1, filters.period)} (ref)`, `CY ${ytdLabel(filters.fy, filters.period)} (ref)`],
        ...lines.map((l) => [l.key, l.company, l.category, l.range, l.brand, l.line, l.headerLabel, l.site, v(l.annual), ...(l.months ? l.months.map((m) => v(m)) : MONTHS.map(() => null)), v(l.py), v(l.cy)]),
      ];
      const readMe: Cell[][] = [
        [`${KIND_LABEL[kind]} · ${fyLabel(filters.fy)} (fiscal year ${filters.fy}, April - March) · amounts in ${UNIT_LABEL[unit]}`],
        [],
        ['Reporting key + Header', 'Identify the budget line (one row of the MIS x one report header). Keep the keys as they are; add rows for new lines.'],
        ['Header', `One of: ${config.groups.map((g) => g.label).join(', ')}`],
        ['Site', 'Optional: HO or UN (Units). Blank = the whole row.'],
        ['Company', 'Optional company code; blank = the company of the report row.'],
        ['Annual', `Budget for the year in ${UNIT_LABEL[unit]}.`],
        ['Apr ... Mar', 'Optional monthly phasing. If given, the months must add up to Annual (or leave Annual blank). Without months the year is phased straight-line (1/12 a month).'],
        ['Zero / blank', 'Lines with no budget are skipped.'],
        ['Reference columns', 'PY and CY YTD actuals are for reference only and are not read.'],
        ['Upload', 'Settings > Budget upload: choose the same budget type and unit, pick the file, check, then save. Each upload becomes a new version; earlier versions can be made active again.'],
      ];
      await writeBook(`publicity-expenses-budget-${fyLabel(filters.fy).replace("'", '')}-${kind}-${unit}.xlsx`, [
        { name: 'Budget', rows, widths: [12, 8, 22, 22, 22, 30, 14, 6, 12, ...MONTHS.map(() => 10), 14, 14], freeze: { rows: 1, cols: 1 } },
        { name: 'Read me', rows: readMe, widths: [24, 120] },
      ]);
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null); setResult(null); setFile(null); setBusy('check');
    // A file named like the template sets the budget type and unit.
    const n = f.name.toLowerCase();
    const k: Kind = /-ob-/.test(n) ? 'OB' : /-rb-/.test(n) ? 'RB' : kind;
    const u: Unit = /-crore\./.test(n) ? 'crore' : /-inr\./.test(n) ? 'inr' : /-lakh\./.test(n) ? 'lakh' : unit;
    if (k !== kind || u !== unit) { setKind(k); setUnit(u); setMsg({ tone: 'warn', text: `Checked as ${k} in ${UNIT_LABEL[u]}, as the file name says (the template names its files that way). If that is not right, change the type / unit above and pick the file again.` }); }
    try {
      const { rows } = await readSheet(f, 'Budget');
      const { headerRow, col } = mapColumns(rows, COLUMNS, ['key', 'header']);
      const g = (r: Cell[], c: string) => (col[c] === undefined ? null : r[col[c]]);
      const out: UploadRow[] = [];
      rows.slice(headerRow + 1).forEach((r, i) => {
        const months = MONTHS.map((_, m) => g(r, `m${m}`) as number | string | null);
        const key = String(g(r, 'key') ?? '').trim();
        if (!key && g(r, 'annual') === null && months.every((m) => m === null || m === '')) return;
        out.push({
          row: headerRow + i + 2, key, header: String(g(r, 'header') ?? '').trim(), site: String(g(r, 'site') ?? '').trim(), company: String(g(r, 'company') ?? '').trim(),
          annual: g(r, 'annual') as number | string | null, months: months.some((m) => m !== null && m !== '') ? months : undefined,
          labels: { category: String(g(r, 'category') ?? ''), range: String(g(r, 'range') ?? ''), brand: String(g(r, 'brand') ?? ''), line: String(g(r, 'line') ?? '') },
        });
      });
      setFile({ name: f.name, rows: out });
      setResult(await api.uploadBudget({ fy: Number(filters.fy), kind: k, unit: u, rows: out, fileName: f.name, note: '', dryRun: true }));
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }

  async function save() {
    if (!file) return;
    setBusy('save');
    try {
      const res = await api.uploadBudget({ fy: Number(filters.fy), kind, unit, rows: file.rows, fileName: file.name, note, dryRun: false });
      if (res.saved) {
        setMsg({ tone: 'good', text: `${kind} ${fyLabel(filters.fy)} version ${res.saved.version} saved and active: ${short(res.saved.total)} in ${res.saved.lineCount} lines.` });
        setFile(null); setResult(null); setNote(''); load(); refreshAll();
      } else setResult(res);
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }

  async function activate(v: BudgetVersion) {
    if (!window.confirm(`Make ${v.kind} version ${v.version} (${short(v.total)}) the active ${v.kind} for ${fyLabel(v.fy)}?`)) return;
    setBusy(`a${v.id}`);
    try { await api.activateBudget(v.id); setMsg({ tone: 'good', text: `${v.kind} version ${v.version} is active again.` }); load(); refreshAll(); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }
  async function deactivate(k: Kind) {
    if (!window.confirm(`Stop using the uploaded ${k} for ${fyLabel(filters.fy)}? The versions are kept and can be made active again.`)) return;
    setBusy(`d${k}`);
    try { await api.deactivateBudget(Number(filters.fy), k); setMsg({ tone: 'good', text: `Uploaded ${k} switched off for ${fyLabel(filters.fy)}.` }); load(); refreshAll(); }
    catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }
  async function download(v: BudgetVersion) {
    setBusy(`l${v.id}`);
    try {
      const lines = await api.budgetLines(v.id);
      const div = UNIT_DIV.lakh;
      await writeBook(`publicity-expenses-budget-${fyLabel(v.fy).replace("'", '')}-${v.kind}-v${v.version}-lakh.xlsx`, [{
        name: 'Budget', freeze: { rows: 1, cols: 1 }, widths: [12, 8, 22, 22, 22, 30, 14, 6, 12, ...MONTHS.map(() => 10)],
        rows: [['Reporting key', 'Company', 'Category', 'Range', 'Brand', 'Report row', 'Header', 'Site', 'Annual', ...MONTHS],
          ...lines.map((l) => [l.reportingKey, l.companyCode, l.labels?.category ?? '', l.labels?.range ?? '', l.labels?.brand ?? '', l.labels?.line ?? '', label(l.headerGroup), l.site, r2(l.annual / div), ...l.months.map((m) => r2(m / div))])],
      }]);
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); } finally { setBusy(''); }
  }

  if (!status) return <Card><Skeleton rows={8} /></Card>;
  if ('error' in status) return <Notice>{status.error}</Notice>;
  const headers = result ? [...new Set([...Object.keys(result.totals.byHeader), ...Object.keys(result.previous?.byHeader ?? {})])] : [];

  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['OB', 'RB'] as Kind[]).map((k) => {
          const a = status.active[k];
          return (
            <Card key={k} title={`${KIND_LABEL[k]} · ${fyLabel(filters.fy)}`} sub={a ? `Version ${a.version} uploaded by ${a.uploadedBy}, ${fmtDateTime(a.uploadedAt)}` : status.source === 'upload' ? 'Not uploaded - shows as 0 while the other budget type is uploaded' : `Not uploaded - the report uses ${status.source === 'sap' ? 'the SAP values' : 'mock figures'}`}
              actions={a && <Button size="sm" variant="ghost" onClick={() => deactivate(k)} disabled={!!busy} title="Stop using the uploaded budget"><RotateCcw size={13} /> Switch off</Button>}>
              {a ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-2"><span className="num text-2xl font-extrabold">{short(a.total)}</span><span className="text-2xs text-muted">{a.lineCount} lines · {a.phasing === 'straight' ? 'straight-line' : a.phasing === 'monthly' ? 'monthly phasing' : 'monthly + straight-line'}{a.note ? ` · ${a.note}` : ''}</span></div>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-2xs">
                    {Object.entries(a.byHeader ?? {}).sort((x, y) => y[1] - x[1]).map(([h, v]) => <li key={h} className="flex justify-between gap-2"><span className="text-muted">{label(h)}</span><span className="num font-semibold">{short(v)}</span></li>)}
                  </ul>
                </div>
              ) : <p className="text-sm text-muted">Upload an Excel file below to set the {k} for {fyLabel(filters.fy)}.</p>}
            </Card>
          );
        })}
      </div>

      <Card title="Upload a budget" sub="1. download the template  2. fill Annual (and months if phased)  3. pick the file - it is checked first  4. save as a new version">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Budget type"><Tabs<Kind> label="Budget type" value={kind} onChange={setKind} tabs={[{ id: 'OB', label: 'OB · opening' }, { id: 'RB', label: 'RB · revised' }]} /></Field>
          <Field label="Amounts in"><Select label="Unit" value={unit} onChange={(v) => setUnit(v as Unit)} options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} className="w-[8rem]" /></Field>
          <Button onClick={template} disabled={!!busy}><FileSpreadsheet size={14} /> {busy === 'template' ? 'Preparing…' : `Template (${kind}, ${UNIT_LABEL[unit]})`}</Button>
          <label className={cx('inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-panel px-3.5 text-sm font-semibold hover:bg-sunken', busy && 'pointer-events-none opacity-50')}>
            <Upload size={14} /> Pick file…
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} aria-label="Budget file" />
          </label>
        </div>
        {busy === 'check' && <div className="mt-3"><Skeleton rows={3} /></div>}
        {result && file && (
          <div className="mt-4 space-y-3 border-t border-line pt-3" data-testid="budget-check">
            <Notice tone={result.errorCount ? 'bad' : 'good'}>
              {file.name}: {result.lineCount} budget line{result.lineCount === 1 ? '' : 's'}, {short(result.totals.total)} for {fyLabel(filters.fy)} {kind}
              {result.errorCount ? ` - ${result.errorCount} row${result.errorCount === 1 ? '' : 's'} with errors, nothing saved. Fix them and pick the file again.` : ' - ready to save.'}
            </Notice>
            {result.warnings.map((w, i) => <Notice key={i} tone="warn">{w.message}</Notice>)}
            {result.errorCount > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs"><tbody className="divide-y divide-line">
                  {result.errors.map((e, i) => <tr key={i}><td className="w-20 px-3 py-1.5 font-bold">{e.row ? `Row ${e.row}` : 'File'}</td><td className="px-3 py-1.5">{e.message}</td></tr>)}
                </tbody></table>
                {result.errorCount > result.errors.length && <p className="px-3 py-1.5 text-2xs text-muted">… and {result.errorCount - result.errors.length} more.</p>}
              </div>
            )}
            {result.errorCount === 0 && (
              <>
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-xs">
                    <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-muted"><th className="py-1.5">Header</th><th className="text-right">This file</th><th className="text-right">{result.previous ? `Active v${result.previous.version}` : 'Active'}</th><th className="text-right">Change</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {headers.map((h) => { const a = result.totals.byHeader[h] ?? 0; const b = result.previous?.byHeader[h] ?? 0; return (
                        <tr key={h}><td className="py-1.5 font-semibold">{label(h)}</td><td className="num text-right">{short(a)}</td><td className="num text-right text-muted">{result.previous ? short(b) : '–'}</td><td className={cx('num text-right', a - b > 0 ? 'text-warn' : a - b < 0 ? 'text-good' : '')}>{result.previous ? delta(a - b) : '–'}</td></tr>
                      ); })}
                      <tr className="font-bold"><td className="py-1.5">Total</td><td className="num text-right">{short(result.totals.total)}</td><td className="num text-right">{result.previous ? short(result.previous.total) : '–'}</td><td className="num text-right">{result.previous ? delta(result.totals.total - result.previous.total) : '–'}</td></tr>
                    </tbody>
                  </table>
                </div>
                <Field label="Note for this version (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputCls} placeholder="e.g. RB after Q2 review" aria-label="Version note" /></Field>
                <div className="flex justify-end gap-2">
                  <Button onClick={() => { setFile(null); setResult(null); }}>Cancel</Button>
                  <Button variant="primary" onClick={save} disabled={!!busy}><CheckCircle2 size={14} /> {busy === 'save' ? 'Saving…' : `Save as ${kind} version ${(status.versions.filter((v) => v.kind === kind).reduce((m, v) => Math.max(m, v.version), 0)) + 1}`}</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title={`Version history · ${fyLabel(filters.fy)}`} sub="Every upload is kept; make an earlier version active to roll back" bodyClass="p-0" actions={<History size={15} className="text-faint" />}>
        {status.versions.length === 0 ? <p className="p-4 text-sm text-muted">No uploads for {fyLabel(filters.fy)} yet.</p> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-[12px]">
              <thead><tr className="border-b border-line text-2xs uppercase tracking-wide text-muted">{['Budget', 'Version', 'Status', 'Total', 'Lines', 'Uploaded', 'Note / file', ''].map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {status.versions.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-1.5 font-semibold">{v.kind}</td>
                    <td className="px-3 py-1.5">v{v.version}</td>
                    <td className="px-3 py-1.5">{v.status === 'active' ? <Pill tone="good">Active</Pill> : <Pill>Superseded</Pill>}</td>
                    <td className="num px-3 py-1.5 font-semibold">{short(v.total)}</td>
                    <td className="num px-3 py-1.5">{v.lineCount}</td>
                    <td className="px-3 py-1.5 text-2xs">{v.uploadedBy}<br />{fmtDateTime(v.uploadedAt)}</td>
                    <td className="max-w-[14rem] px-3 py-1.5 text-2xs"><div className="truncate" title={v.note ?? ''}>{v.note || '–'}</div><div className="truncate text-faint" title={v.fileName ?? ''}>{v.fileName}</div></td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => download(v)} disabled={!!busy} aria-label={`Download ${v.kind} v${v.version}`}><Download size={13} /></Button>
                      {v.status !== 'active' && <Button size="sm" onClick={() => activate(v)} disabled={!!busy}>Make active</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
