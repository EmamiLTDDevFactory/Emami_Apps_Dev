'use client';
/** "Current data": the read-only data sets (prices, rules, volumes, budgets, targets), loaded only on a button click, every property SAP sends. */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Square } from 'lucide-react';
import { Button, Empty, Spinner, cx } from '../../ui';
import WacMessages from '../../wac/WacMessages';
import { fetchDataSet, type DataSetKey } from '@/lib/margin/service';
import type { SapMessage } from '@/lib/sap/messages';
import { fmtMs } from '@/lib/format';

const SETS: { key: DataSetKey; label: string; set: string }[] = [
  { key: 'PRICE', label: 'Prices', set: 'CogmPriceSet' }, { key: 'VOLUME', label: 'Volumes', set: 'CogmVolumeSet' }, { key: 'BUDGET', label: 'Budgets', set: 'CogmBudgetSet' },
  { key: 'TARGET', label: 'Targets', set: 'CogmTargetSet' }, { key: 'RULE', label: 'Rules', set: 'CogmRuleSet' },
];
interface Loaded { rows: Record<string, string>[]; messages: SapMessage[]; ms: number }
type St = { status: 'idle' | 'loading' | 'done' | 'error' | 'cancelled'; data?: Loaded; error?: string };
const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted whitespace-nowrap';
const td = 'px-2.5 py-1.5 align-top whitespace-nowrap';

export default function CurrentData() {
  const [sel, setSel] = useState<DataSetKey>('PRICE');
  const [state, setState] = useState<Partial<Record<DataSetKey, St>>>({});
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const [, tick] = useState(0);
  const t0 = useRef(0);
  const st = state[sel] ?? { status: 'idle' as const };
  useEffect(() => { if (st.status !== 'loading') return; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [st.status]);

  const load = (key: DataSetKey) => {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c; t0.current = Date.now();
    setState((s) => ({ ...s, [key]: { status: 'loading' } }));
    fetchDataSet(key, c.signal)
      .then((data) => { if (!c.signal.aborted) setState((s) => ({ ...s, [key]: { status: 'done', data } })); })
      .catch((e: Error) => setState((s) => ({ ...s, [key]: c.signal.aborted || e.name === 'AbortError' ? { status: 'cancelled' } : { status: 'error', error: e.message } })));
  };
  const cols = st.data ? Array.from(new Set(st.data.rows.flatMap((r) => Object.keys(r)))) : [];

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Data sets" className="flex flex-wrap gap-1.5">
        {SETS.map((s) => <button key={s.key} role="tab" aria-selected={sel === s.key} onClick={() => setSel(s.key)} className={cx('rounded-full border px-3 py-1 text-xs font-bold', sel === s.key ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{s.label}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {st.status === 'loading' ? <Button variant="ghost" onClick={() => ctl.current?.abort()}><Square size={14} /> Stop ({fmtMs(Date.now() - t0.current)})</Button> : <Button variant="primary" onClick={() => load(sel)}><RefreshCw size={14} /> {st.status === 'done' ? 'Refresh' : 'Load'} {SETS.find((s) => s.key === sel)!.label.toLowerCase()}</Button>}
        <span className="text-xs text-faint">Read-only ({SETS.find((s) => s.key === sel)!.set}). Nothing loads until you press the button. Change the data with the Upload tabs.</span>
        {st.status === 'done' && <span className="text-xs text-muted">{st.data!.rows.length} row(s) · {fmtMs(st.data!.ms)} in SAP</span>}
      </div>
      {st.status === 'loading' && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP…</p>}
      {st.status === 'cancelled' && <p className="text-sm text-muted">Stopped.</p>}
      <WacMessages messages={st.data?.messages ?? []} error={st.status === 'error' ? st.error ?? null : null} />
      {st.status === 'done' && (st.data!.rows.length === 0 ? <Empty title="No rows">SAP holds no entries in this set.</Empty> : (
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-line bg-panel">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken"><tr>{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr></thead>
            <tbody>{st.data!.rows.map((r, i) => <tr key={i} className="border-t border-line/60">{cols.map((c) => <td key={c} className={td}>{r[c] || <span className="text-faint">—</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
