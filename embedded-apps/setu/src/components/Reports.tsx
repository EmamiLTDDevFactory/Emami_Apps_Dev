'use client';
import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, RefreshCw, X } from 'lucide-react';
import { getDailyReport } from '@/lib/api';
import { fmtNum, istToday } from '@/lib/format';
import { Button, Card, Field, MultiSelect, Notice, Spinner, cx, inputCls } from './ui';

// Neutralise spreadsheet formulas in user-supplied text (same rule as the other apps' exports).
const safeCell = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

type Cell = string | number;
type Report = { columns: string[]; rows: Cell[][]; from: string; to: string };
// A column with this many different values or fewer gets a pick list; anything else gets a "contains" box.
const PICK_LIST_MAX = 40;
const BLANK = '(blank)';
const PREVIEW_ROWS = 100;

const text = (v: Cell) => String(v ?? '').trim();

/**
 * The 36-column daily report in Daily_Report_template.xlsx order. Load a date range, narrow it down with a filter on
 * any of the 36 columns (pick values, or "contains" for free text), check the preview, then download what matches.
 */
export default function Reports() {
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [contains, setContains] = useState<Record<number, string>>({});
  const [showFilters, setShowFilters] = useState(true);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const load = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await getDailyReport(from, to);
      setReport({ ...r, from, to });
      setPicks({});
      setContains({});
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not load the report.' });
    } finally {
      setBusy(false);
    }
  };

  // Per column: its distinct values (for a pick list) or null (free text -> "contains").
  const choices = useMemo(() => {
    if (!report) return [];
    return report.columns.map((_, i) => {
      const values = new Set<string>();
      for (const r of report.rows) {
        values.add(text(r[i]) || BLANK);
        if (values.size > PICK_LIST_MAX) return null;
      }
      return [...values].sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, 'en', { numeric: true })));
    });
  }, [report]);

  const active = Object.values(picks).filter((v) => v.length).length + Object.values(contains).filter((v) => v.trim()).length;
  const rows = useMemo(() => {
    if (!report) return [];
    const pickEntries = Object.entries(picks).filter(([, v]) => v.length).map(([k, v]) => [Number(k), new Set(v)] as const);
    const textEntries = Object.entries(contains).filter(([, v]) => v.trim()).map(([k, v]) => [Number(k), v.trim().toLowerCase()] as const);
    return report.rows.filter((r) =>
      pickEntries.every(([i, set]) => set.has(text(r[i]) || BLANK)) && textEntries.every(([i, q]) => text(r[i]).toLowerCase().includes(q)));
  }, [report, picks, contains]);

  const download = async () => {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const { columns } = report;
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map(safeCell))]);
      ws['!cols'] = columns.map((_, i) => ({ wch: i === 1 || i >= 31 ? 40 : 18 }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `Setu_Daily_Report_${report.from}_to_${report.to}${active ? '_filtered' : ''}.xlsx`);
      setMsg({ tone: 'good', text: `Downloaded ${rows.length} ticket${rows.length === 1 ? '' : 's'}${active ? ` (${active} filter${active === 1 ? '' : 's'} applied)` : ''}.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not build the report.' });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => { setPicks({}); setContains({}); };
  const stale = report && (report.from !== from || report.to !== to);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Daily report</h2>
        <p className="text-sm text-muted">Tickets created in the date range (IST), in the 36-column order of the daily report template. Filter on any column before downloading. Includes requesters&apos; phone numbers and emails - supervisors and admins only.</p>
      </div>
      <Card title="Date range" actions={<FileSpreadsheet size={16} className="text-accent" />} className="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setFrom(istToday()); setTo(istToday()); }}>Today</Button>
          <Button size="sm" onClick={() => { setFrom(istToday(-1)); setTo(istToday(-1)); }}>Yesterday</Button>
          <Button size="sm" onClick={() => { setFrom(istToday(-6)); setTo(istToday()); }}>Last 7 days</Button>
          <Button size="sm" onClick={() => { setFrom(`${istToday().slice(0, 8)}01`); setTo(istToday()); }}>This month</Button>
        </div>
        {msg && <div className="mt-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={load} disabled={busy || !from || !to || from > to}>
            {busy ? <Spinner /> : <RefreshCw size={14} />} {report ? 'Reload' : 'Load tickets'}
          </Button>
          {report && (
            <Button onClick={download} disabled={busy || rows.length === 0 || !!stale} title={stale ? 'The dates changed - reload first' : undefined}>
              <Download size={14} /> Download {fmtNum(rows.length)} as .xlsx
            </Button>
          )}
        </div>
        {stale && <p className="mt-2 text-2xs text-warn">The dates changed since the tickets were loaded. Reload to download this range.</p>}
      </Card>

      {report && (
        <Card
          title={<span className="inline-flex items-center gap-2"><Filter size={15} className="text-accent" /> Filters on all {report.columns.length} fields</span>}
          sub={`${fmtNum(rows.length)} of ${fmtNum(report.rows.length)} tickets match`}
          actions={
            <div className="flex items-center gap-2">
              {active > 0 && <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><X size={12} /> Clear {active}</button>}
              <Button size="sm" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>{showFilters ? 'Hide' : 'Show'} filters</Button>
            </div>
          }
        >
          {showFilters && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {report.columns.map((col, i) => {
                const list = choices[i];
                return list ? (
                  <MultiSelect key={col} label={col} values={picks[i] ?? []} onChange={(v) => setPicks((p) => ({ ...p, [i]: v }))} options={list.map((v) => ({ value: v, label: v }))} />
                ) : (
                  <label key={col} className={cx('flex h-9 items-center gap-1.5 rounded-xl border bg-panel px-3', contains[i]?.trim() ? 'border-accent/50' : 'border-line')}>
                    <span className="shrink-0 text-2xs font-bold uppercase tracking-wide text-muted">{col}</span>
                    <input value={contains[i] ?? ''} onChange={(e) => setContains((c) => ({ ...c, [i]: e.target.value }))} placeholder="contains…" aria-label={`${col} contains`} className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none" />
                  </label>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {report && (
        <Card title="Preview" sub={rows.length > PREVIEW_ROWS ? `First ${PREVIEW_ROWS} of ${fmtNum(rows.length)} - the download has them all` : undefined} bodyClass="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted">{report.rows.length ? 'No ticket matches these filters.' : 'No tickets were created in this date range.'}</p>
          ) : (
            <div className="scroll-thin max-h-[480px] overflow-auto">
              <table className="min-w-max text-left text-xs">
                <thead className="sticky top-0 z-10 bg-sunken">
                  <tr>{report.columns.map((c) => <th key={c} className="whitespace-nowrap border-b border-line px-2.5 py-2 text-2xs font-bold uppercase tracking-wide text-muted">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                    <tr key={ri} className="hover:bg-sunken/60">
                      {r.map((v, ci) => <td key={ci} className="max-w-[260px] truncate px-2.5 py-1.5" title={text(v)}>{text(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
