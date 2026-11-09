'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pencil, Save, Search, X } from 'lucide-react';
import { Button, Card, Field, Pill, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, NO_RECORDS, OkBox, SkeletonRows, SourceChip, StatusBadge, errorText, td, th } from './shared';
import RateEditPanel from './RateEditPanel';
import SourcePriorityEditor from '../rates/SourcePriorityEditor';
import { fetchRates, patchRate } from '@/lib/budgetMgmt/api';
import { COUNTRIES, STATUS_LABEL, type AdjType, type BudRateRow, type RateEdit } from '@/lib/budgetMgmt/types';
import { DEFAULT_B_PRIORITY, isEditable, stripZeros, validateEdit, type Errors } from '@/lib/budgetMgmt/rules';
import { fmtNum } from '@/lib/format';

const PRIO_KEY = 'bud-mgmt-b-priority';
const keyOf = (r: BudRateRow) => `${r.Gjahr}|${r.Land1}|${r.Matnr}|${r.Werks}|${r.ValidFrom}`;
const ADJ: { v: AdjType; label: string }[] = [{ v: 'N', label: 'None' }, { v: 'P', label: 'Percent (%)' }, { v: 'A', label: 'Amount' }];

export default function RatesTab({ gjahr, generated }: { gjahr: string; generated?: { land1: string; gjahr: string; message: string } | null }) {
  const [land1, setLand1] = useState(generated?.land1 ?? 'IN');
  const [year, setYear] = useState(generated?.gjahr ?? gjahr);
  const [status, setStatus] = useState('D');
  const [rows, setRows] = useState<BudRateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [yearErr, setYearErr] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState('');
  const [form, setForm] = useState<RateEdit>({ adjType: 'N', adjValue: '', overrideRate: '', overrideRsn: '' });
  const [fErr, setFErr] = useState<Errors<keyof RateEdit>>({});
  const [saveErr, setSaveErr] = useState('');
  const [saving, setSaving] = useState(false);
  // Category B source priority (spec 7.2): kept in this browser until a central setting exists.
  const [prio, setPrioState] = useState<string[]>([...DEFAULT_B_PRIORITY]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(PRIO_KEY) ?? 'null'); if (Array.isArray(v) && v.length) setPrioState(v.map(String)); } catch { /* default */ } }, []);
  const setPrio = (v: string[]) => { setPrioState(v); try { localStorage.setItem(PRIO_KEY, JSON.stringify(v)); } catch { /* not kept */ } };
  const [yearShown, setYearShown] = useState(generated?.gjahr ?? gjahr);
  // Shared FY changed from the page header: pre-fill (the user's own edit of the field is kept until the header changes again).
  if (yearShown !== gjahr) { setYearShown(gjahr); setYear(gjahr); }

  async function load(y = year, l = land1, s = status) {
    if (!/^\d{4}$/.test(y)) return setYearErr('Year must be 4 digits');
    setYearErr(''); setLoading(true); setError(''); setEditing('');
    try { setRows(await fetchRates({ gjahr: y, land1: l, status: s })); } catch (x) { setRows(null); setError(errorText(x)); }
    setLoading(false);
  }

  // Opened by Generate Draft Rates: load the drafts of what was just generated.
  useEffect(() => { if (generated) void load(generated.gjahr, generated.land1, 'D'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function startEdit(r: BudRateRow) {
    setEditing(keyOf(r)); setFErr({}); setSaveErr('');
    setForm({ adjType: (r.AdjType === 'P' || r.AdjType === 'A' ? r.AdjType : 'N') as AdjType, adjValue: r.AdjValue ? String(r.AdjValue) : '', overrideRate: r.OverrideRate ? String(r.OverrideRate) : '', overrideRsn: r.OverrideRsn });
  }

  async function save(r: BudRateRow) {
    const e = validateEdit(form, r.SrcRate > 0 ? r.SrcRate : undefined);
    setFErr(e);
    if (Object.keys(e).length) return;
    setSaving(true); setSaveErr('');
    try { await patchRate(r, form); setEditing(''); await load(); } catch (x) { setSaveErr(errorText(x)); }
    setSaving(false);
  }

  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return (rows ?? []).filter((r) => !n || stripZeros(r.Matnr).toLowerCase().includes(n) || r.Matnr.toLowerCase().includes(n)); }, [rows, q]);

  return (
    <div className="flex flex-col gap-3">
      <Card title="Filters">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void load(); }}>
          <Field label="Country">{(id) => <select id={id} className={inputCls} value={land1} onChange={(e) => setLand1(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Year" error={yearErr}>{(id) => <input id={id} className={cx(inputCls, yearErr && 'border-bad')} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} />}</Field>
          <Field label="Status">{(id) => <select id={id} className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select>}</Field>
          <div className="flex items-end"><Button type="submit" variant="primary" disabled={loading}>{loading ? <Spinner /> : <Search size={14} />} Load</Button></div>
        </form>
      </Card>

      <details className="rounded-2xl border border-line bg-panel px-4 py-2 shadow-card">
        <summary className="cursor-pointer text-sm font-bold">Category B rate source priority <span className="font-normal text-muted">(first source with a valid rate is used)</span></summary>
        <div className="mt-2 max-w-sm"><SourcePriorityEditor value={prio} onChange={setPrio} compact /></div>
      </details>

      {generated && <OkBox>✅ {generated.message}</OkBox>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {rows && rows.length === 0 && !error && <Card><p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p></Card>}

      {(loading || (rows && rows.length > 0)) && (
        <Card
          title={<span className="flex items-center gap-2">Rates {rows && <Pill tone="accent">{shown.length} rows</Pill>}</span>}
          actions={<input className={cx(inputCls, 'w-48')} placeholder="Filter: material" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter by material" />}
          bodyClass="p-0"
        >
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr><th className={th}>Material</th><th className={th}>Plant</th><th className={th}>Valid from</th><th className={th}>Cat</th><th className={th}>Source</th><th className={cx(th, 'text-right')}>Src rate</th><th className={cx(th, 'text-right')}>Derived</th>
                  <th className={th}>Adj</th><th className={cx(th, 'text-right')}>Override</th><th className={cx(th, 'text-right')}>Freight</th><th className={cx(th, 'text-right')}>Landed rate</th><th className={th}>Status</th><th className={th} /></tr>
              </thead>
              {loading ? <SkeletonRows cols={13} /> : (
                <tbody>
                  {shown.map((r) => {
                    const k = keyOf(r); const isEd = editing === k;
                    return (
                      <Fragment key={k}>
                        <tr className={cx('border-b border-line/60', isEd && 'bg-accent/5')}>
                          <td className={cx(td, 'num')}>{stripZeros(r.Matnr)}</td><td className={td}>{r.Werks}</td><td className={td}>{r.ValidFrom.length === 8 ? `${r.ValidFrom.slice(6)}.${r.ValidFrom.slice(4, 6)}.${r.ValidFrom.slice(0, 4)}` : r.ValidFrom}</td>
                          <td className={td}><CatBadge cat={r.Matcat} /></td><td className={td}><SourceChip src={r.RateSrc} /></td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(r.SrcRate, 4)}</td><td className={cx(td, 'num text-right')}>{fmtNum(r.DerivedRate, 4)} {r.DerivedCurr}</td>
                          <td className={cx(td, 'num')}>{r.AdjType && r.AdjType !== 'N' ? `${r.AdjType} ${fmtNum(r.AdjValue, 2)}` : '—'}</td>
                          <td className={cx(td, 'num text-right')} title={r.OverrideRsn}>{r.OverrideRate ? fmtNum(r.OverrideRate, 4) : '—'}</td>
                          <td className={cx(td, 'num text-right')}>{fmtNum(r.FrtTotal, 4)}</td><td className={cx(td, 'num text-right font-extrabold')}>{fmtNum(r.LandedRate, 4)} {r.LandedCurr}</td>
                          <td className={td}><StatusBadge status={r.ApprStatus} /></td>
                          <td className={td}>{isEditable(r.ApprStatus) && !isEd && <Button size="sm" onClick={() => startEdit(r)}><Pencil size={12} /> Edit</Button>}</td>
                        </tr>
                        {isEd && (
                          <tr className="border-b border-line bg-accent/5">
                            <td colSpan={13} className="px-4 py-3">
                              <RateEditPanel r={r} form={form} setForm={setForm} errs={fErr} prio={prio} />
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button variant="primary" size="sm" disabled={saving} onClick={() => void save(r)}>{saving ? <Spinner /> : <Save size={13} />} Save changes</Button>
                                <Button size="sm" disabled={saving} onClick={() => setEditing('')}><X size={13} /> Cancel</Button>
                                {saveErr && <span role="alert" className="text-sm text-bad">{saveErr}</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
