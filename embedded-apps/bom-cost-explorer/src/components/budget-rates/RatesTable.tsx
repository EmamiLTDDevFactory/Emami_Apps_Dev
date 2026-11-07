'use client';
import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button, Card, Pill, Spinner, cx, inputCls } from '../ui';
import { fmtNum } from '@/lib/format';
import { columnsFor, stripLeadingZeros, type BudCompDom, type BudCompIntl, type BudgetColumn, type TableType } from '@/lib/budgetRatesTypes';

const SHOW_MAX = 1000;
type Row = BudCompDom | BudCompIntl;

const dateText = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(6)}.${v.slice(4, 6)}.${v.slice(0, 4)}` : v);

function cell(col: BudgetColumn, row: Row): string {
  const v = (row as unknown as Record<string, unknown>)[col.key];
  if (col.kind === 'a' || col.kind === 'p') return !v ? '—' : fmtNum(v as number, col.kind === 'p' ? 4 : 2);
  if (col.kind === 'm') return stripLeadingZeros(String(v ?? ''));
  if (col.kind === 'd') return dateText(String(v ?? ''));
  return String(v ?? '');
}

const label = (c: BudgetColumn) => (c.kind === 'p' ? `${c.key} (%)` : c.key);

export default function RatesTable({ rows, tableType, gjahr, onRecalc, recalcBusy }: { rows: Row[]; tableType: TableType; gjahr: string; onRecalc: () => void; recalcBusy: boolean }) {
  const [q, setQ] = useState('');
  const cols = columnsFor(tableType);
  const lines = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = rows.map((r) => ({ r, cells: cols.map((c) => cell(c, r)) }));
    return needle ? all.filter((l) => l.cells.some((t) => t.toLowerCase().includes(needle))) : all;
  }, [rows, cols, q]);

  async function exportXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${tableType}_${gjahr}`);
    ws.addRow(cols.map((c) => c.key));
    ws.getRow(1).font = { bold: true };
    for (const l of lines) ws.addRow(cols.map((c) => { const v = (l.r as unknown as Record<string, unknown>)[c.key]; return c.kind === 'm' ? stripLeadingZeros(String(v ?? '')) : v; }));
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = `budget_${tableType}_${gjahr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Card
      title={<span className="flex items-center gap-2">Component rates <Pill tone="accent">{lines.length} rows</Pill></span>}
      actions={
        <>
          <input className={cx(inputCls, 'w-56')} placeholder="Filter rows" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter rows" />
          <Button size="sm" onClick={() => void exportXlsx()}><Download size={14} /> Excel</Button>
          <Button size="sm" onClick={onRecalc} disabled={recalcBusy}>{recalcBusy ? <Spinner /> : <RefreshCw size={14} />} Recalculate</Button>
        </>
      }
      bodyClass="p-0"
    >
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-sunken">
            <tr>{cols.map((c) => <th key={c.key} className={cx('whitespace-nowrap border-b border-line px-2 py-1.5 font-bold', c.kind === 'a' || c.kind === 'p' ? 'text-right' : 'text-left')}>{label(c)}</th>)}</tr>
          </thead>
          <tbody>
            {lines.slice(0, SHOW_MAX).map((l, i) => (
              <tr key={i} className="border-b border-line/60 hover:bg-sunken/60">
                {cols.map((c, j) => <td key={c.key} className={cx('num whitespace-nowrap px-2 py-1', c.kind === 'a' || c.kind === 'p' ? 'text-right' : 'text-left', c.key === 'Landed' && 'font-semibold')}>{l.cells[j]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length > SHOW_MAX && <p className="px-3 py-2 text-2xs text-muted">Showing the first {SHOW_MAX} of {lines.length} rows; the Excel export has all of them.</p>}
    </Card>
  );
}
