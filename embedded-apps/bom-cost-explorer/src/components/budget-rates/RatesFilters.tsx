'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Button, Card, Field, Segmented, Spinner, inputCls } from '../ui';
import { LAND1_FLAG, LAND1_LABEL, LAND1_LIST, type BudgetSearchParams, type Land1, type TableType } from '@/lib/budgetRatesTypes';

/** SAP fiscal year (April start) as a 4-digit string. */
export const currentFiscalYear = (d = new Date()) => String(d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1);

const words = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));

export default function RatesFilters({ onSearch, busy, initial }: { onSearch: (p: BudgetSearchParams) => void; busy: boolean; initial?: Partial<BudgetSearchParams> }) {
  const [tableType, setTableType] = useState<TableType>(initial?.tableType ?? 'DOM');
  const [gjahr, setGjahr] = useState(initial?.gjahr ?? currentFiscalYear());
  const [werks, setWerks] = useState((initial?.werks ?? []).join(' '));
  const [matnr, setMatnr] = useState((initial?.matnr ?? []).join(' '));
  const [land1, setLand1] = useState<Land1[]>(initial?.land1?.length ? initial.land1 : LAND1_LIST);
  const [error, setError] = useState('');

  function submit() {
    const plants = words(werks);
    if (!plants.length) return setError('Enter at least one plant.');
    if (!/^\d{4}$/.test(gjahr)) return setError('Fiscal year must be 4 digits, e.g. 2026.');
    if (tableType === 'INTL' && !land1.length) return setError('Pick at least one country.');
    setError('');
    onSearch({ tableType, gjahr, werks: plants, matnr: words(matnr), land1: tableType === 'INTL' ? land1 : [] });
  }

  return (
    <Card title="Select">
      <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-[auto_8rem_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Table">
          {() => <Segmented label="Table" value={tableType} onChange={setTableType} options={[{ value: 'DOM' as TableType, label: 'Domestic (IN)' }, { value: 'INTL' as TableType, label: 'International' }]} />}
        </Field>
        <Field label="Fiscal year">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={4} value={gjahr} onChange={(e) => setGjahr(e.target.value)} />}</Field>
        <Field label="Plants" error={error.includes('plant') ? error : undefined} hint="Space or comma separated">
          {(id) => <input id={id} className={inputCls} placeholder="e.g. UN13 UB01" value={werks} onChange={(e) => setWerks(e.target.value)} />}
        </Field>
        <Field label="Materials (optional)">{(id) => <input id={id} className={inputCls} placeholder="All materials" value={matnr} onChange={(e) => setMatnr(e.target.value)} />}</Field>
        <div className="flex items-end"><Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <Search size={14} />} Search</Button></div>
        {tableType === 'INTL' && (
          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2 xl:col-span-5">
            <span className="font-semibold">Country</span>
            {LAND1_LIST.map((l) => (
              <label key={l} className="flex items-center gap-1.5">
                <input type="checkbox" checked={land1.includes(l)} onChange={(e) => setLand1(e.target.checked ? [...land1, l] : land1.filter((x) => x !== l))} />
                {LAND1_FLAG[l]} {LAND1_LABEL[l]} ({l})
              </label>
            ))}
          </div>
        )}
        {error && !error.includes('plant') && <p className="text-sm text-bad md:col-span-2 xl:col-span-5">{error}</p>}
      </form>
    </Card>
  );
}
