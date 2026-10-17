'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { getDailyReport } from '@/lib/api';
import { istToday } from '@/lib/format';
import { Button, Card, Field, Notice, Spinner, inputCls } from './ui';

// Neutralise spreadsheet formulas in user-supplied text (same rule as the other apps' exports).
const safeCell = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** The 36-column daily report in Daily_Report_template.xlsx order, built in the browser with SheetJS. */
export default function Reports() {
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [{ columns, rows }, XLSX] = await Promise.all([getDailyReport(from, to), import('xlsx')]);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map(safeCell))]);
      ws['!cols'] = columns.map((_, i) => ({ wch: i === 1 || i >= 31 ? 40 : 18 }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `Setu_Daily_Report_${from}_to_${to}.xlsx`);
      setMsg({ tone: 'good', text: `Downloaded ${rows.length} ticket${rows.length === 1 ? '' : 's'}.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not build the report.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Daily report</h2>
        <p className="text-sm text-muted">Tickets created in the date range (IST), in the 36-column order of the daily report template. Includes requesters&apos; phone numbers and emails - supervisors and admins only.</p>
      </div>
      <Card title="Download" actions={<FileSpreadsheet size={16} className="text-accent" />} className="max-w-xl">
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
        <Button variant="primary" className="mt-4" onClick={download} disabled={busy || !from || !to || from > to}>
          {busy ? <Spinner /> : <Download size={14} />} Download .xlsx
        </Button>
      </Card>
    </div>
  );
}
