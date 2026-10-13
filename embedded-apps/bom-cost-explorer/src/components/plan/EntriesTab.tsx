'use client';
/** Entries tab: the plan's rows (PlanEntrySet) as an editable monthly grid. Changed rows are saved one PUT
 * each; a row can be deleted. Same checks as the upload (numbers >= 0). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Search, Trash2, Undo2 } from 'lucide-react';
import { ErrorNote, RoleNote, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Modal, Pill, Skeleton, Spinner, cx, inputBase } from '../ui';
import { fetchPlanEntries } from '@/lib/plan/client';
import { deletePlanEntryWithFallback, entryKeyPath, updatePlanEntry } from '@/lib/plan/write';
import { FISCAL_MONTHS, monthKeys, type PlanEntry } from '@/lib/plan/fields';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { D, ZERO } from '@/lib/cost/decimal';
import { fmtNum } from '@/lib/format';

const MTH = monthKeys('Mth');
const monthsOf = (e: PlanEntry) => MTH.map((k) => D((e as unknown as Record<string, string>)[k]).toString());
const bad = (v: string) => { const n = Number(v.replace(/,/g, '')); return v.trim() === '' || !Number.isFinite(n) || n < 0; };

export default function EntriesTab({ ws }: { ws: PlanWorkspace }) {
  const [rows, setRows] = useState<PlanEntry[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [rowState, setRowState] = useState<Record<string, { status: 'saving' | 'ok' | 'error'; msg: string }>>({});
  const [q, setQ] = useState('');
  const [toDelete, setToDelete] = useState<PlanEntry | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    fetchPlanEntries(ws.plan, { plants: ws.plants }, { signal })
      .then((r) => { setRows(r.rows); setDraft({}); })
      .catch((e) => { if (!signal?.aborted) setError((e as Error).message); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, [ws.plan, ws.plants]);
  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load, ws.version]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !t || `${r.Matnr} ${r.Maktx} ${r.Werks} ${r.Land1}`.toLowerCase().includes(t));
  }, [rows, q]);
  const valueOf = (e: PlanEntry) => draft[entryKeyPath(e)] ?? monthsOf(e);
  const changed = useMemo(() => (rows ?? []).filter((e) => {
    const d = draft[entryKeyPath(e)];
    return d && d.some((v, i) => bad(v) || !D(v.replace(/,/g, '')).eq(D(monthsOf(e)[i])));
  }), [rows, draft]);
  const invalid = changed.some((e) => draft[entryKeyPath(e)].some(bad));

  const totals = useMemo(() => {
    const m = Array(12).fill(ZERO);
    for (const e of shown) valueOf(e).forEach((v, i) => { if (!bad(v)) m[i] = m[i].plus(D(v.replace(/,/g, ''))); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, draft]);

  const edit = (e: PlanEntry, i: number, v: string) => {
    const k = entryKeyPath(e);
    const next = [...valueOf(e)];
    next[i] = v;
    setDraft((d) => ({ ...d, [k]: next }));
  };

  async function saveAll() {
    let any = false;
    for (const e of changed) {
      const k = entryKeyPath(e);
      setRowState((s) => ({ ...s, [k]: { status: 'saving', msg: '' } }));
      try {
        await updatePlanEntry(e, draft[k].map((v) => v.replace(/,/g, '')));
        setRowState((s) => ({ ...s, [k]: { status: 'ok', msg: 'Saved' } }));
        any = true;
      } catch (err) {
        setRowState((s) => ({ ...s, [k]: { status: 'error', msg: (err as Error).message } }));
      }
    }
    if (any) ws.changed();
  }

  async function doDelete(e: PlanEntry) {
    setToDelete(null);
    const k = entryKeyPath(e);
    setRowState((s) => ({ ...s, [k]: { status: 'saving', msg: '' } }));
    try {
      await deletePlanEntryWithFallback(e, ws.user);
      setRows((r) => (r ?? []).filter((x) => entryKeyPath(x) !== k));
      ws.changed();
    } catch (err) {
      setRowState((s) => ({ ...s, [k]: { status: 'error', msg: (err as Error).message } }));
    }
  }

  const saving = Object.values(rowState).some((s) => s.status === 'saving');
  return (
    <div className="flex flex-col gap-3">
      <RoleNote ws={ws} />
      <Card
        title="Plan entries"
        actions={
          <>
            {changed.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDraft({})}><Undo2 size={14} /> Discard</Button>}
            <Button size="sm" variant="primary" disabled={!ws.canWrite || !changed.length || invalid || saving} onClick={() => void saveAll()} title={invalid ? 'Fix the red cells first' : 'One PUT per changed row'}>
              {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save size={14} />} Save {changed.length || ''} row{changed.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input aria-label="Search entries" className={cx(inputBase, 'h-9 w-full pl-8')} placeholder="Material, plant, country…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading} title="Reload"><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></Button>
          {rows && <span className="ml-auto text-xs text-muted">{shown.length} of {rows.length} rows{ws.plants.length ? ` in ${ws.plants.join(', ')}` : ' (all plants)'} · quantities in the material&apos;s base unit</span>}
        </div>
        <ErrorNote error={error} />
        {!rows && loading ? <Skeleton rows={6} /> : rows && !rows.length ? <Empty title="This plan has no rows">Upload rows from the Upload plan page.</Empty> : rows ? (
          <div className="scroll-thin max-h-[65vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr>
                  <th className={thCls}>Material</th><th className={thCls}>Plant</th><th className={thCls}>Country</th>
                  {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
                  <th className={thNum}>Total</th><th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const k = entryKeyPath(e);
                  const vals = valueOf(e);
                  const st = rowState[k];
                  const tot = vals.reduce((a, v) => (bad(v) ? a : a.plus(D(v.replace(/,/g, '')))), ZERO);
                  const dirty = changed.includes(e);
                  return (
                    <tr key={k} className={cx('border-t border-line/60', dirty && 'bg-accent/[0.04]')}>
                      <td className={tdCls}><span className="font-mono font-semibold">{e.Matnr}</span> <span className="text-muted">{e.Maktx}</span></td>
                      <td className={cx(tdCls, 'font-mono')}>{e.Werks}</td>
                      <td className={tdCls}>{e.Land1}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="px-0.5 py-0.5">
                          <input
                            aria-label={`${e.Matnr} ${e.Werks} ${FISCAL_MONTHS[i]}`}
                            disabled={!ws.canWrite}
                            inputMode="decimal"
                            className={cx('num h-7 w-20 rounded-md border bg-panel px-1.5 text-right text-xs focus:border-accent focus:outline-none', bad(v) ? 'border-bad bg-bad/[0.06]' : 'border-line/70', !ws.canWrite && 'border-transparent bg-transparent')}
                            value={v}
                            onChange={(ev) => edit(e, i, ev.target.value)}
                          />
                        </td>
                      ))}
                      <td className={cx(tdNum, 'font-semibold')}>{fmtNum(tot, 3, 'X')}</td>
                      <td className={cx(tdCls, 'text-right')}>
                        {st?.status === 'saving' ? <Spinner className="h-3.5 w-3.5" /> : st?.status === 'error' ? <span title={st.msg}><Pill tone="bad">Error</Pill></span> : st?.status === 'ok' && !dirty ? <Pill tone="good">Saved</Pill> : null}
                        {ws.canWrite && <Button size="sm" variant="ghost" aria-label={`Delete ${e.Matnr} ${e.Werks}`} onClick={() => setToDelete(e)}><Trash2 size={13} /></Button>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="sticky bottom-0 border-t-2 border-line bg-sunken font-bold">
                  <td className={tdCls} colSpan={3}>Total ({shown.length} rows)</td>
                  {totals.map((t, i) => <td key={i} className={tdNum}>{fmtNum(t, 0, 'X')}</td>)}
                  <td className={tdNum}>{fmtNum(totals.reduce((a, v) => a.plus(v), ZERO), 0, 'X')}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            {Object.entries(rowState).filter(([, s]) => s.status === 'error').map(([k, s]) => <p key={k} className="mt-1 text-xs text-bad">{k}: {s.msg}</p>)}
          </div>
        ) : null}
      </Card>
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete this plan row?" footer={<><Button onClick={() => setToDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => toDelete && void doDelete(toDelete)}>Delete</Button></>}>
        {toDelete && <p className="text-sm"><b>{toDelete.Matnr}</b> in plant <b>{toDelete.Werks}</b> ({toDelete.Land1}) is removed from {toDelete.Plan1}.</p>}
      </Modal>
    </div>
  );
}
