'use client';
import { Button, ErrorBox, Header, Kpi, type ScreenProps } from '../ui';
import { getStats } from '@/lib/api';
import { short } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { EXCEPTION_INFO, type PoStatus } from '@/lib/types';

const FLOW: { id: string; label: string; screen: string; statuses: PoStatus[] }[] = [
  { id: 'captured', label: 'Captured', screen: 'exceptions', statuses: ['captured'] },
  { id: 'exceptions', label: 'Exceptions', screen: 'exceptions', statuses: ['exceptions'] },
  { id: 'ready', label: 'Ready', screen: 'sales-orders', statuses: ['ready', 'creating', 'so_unknown'] },
  { id: 'so', label: 'Sales orders', screen: 'sales-orders', statuses: ['so_created'] },
];

/** Control tower: the PO funnel (last 30 days), touchless rate, top exception causes, dispute money, links to every step. */
export default function Overview({ active, go }: ScreenProps) {
  const s = useLoad(() => getStats(), active, { pos: [], disputes: [], exceptionCodes: [] } as Awaited<ReturnType<typeof getStats>>);
  const by = (st: PoStatus[]) => s.data.pos.filter((p) => st.includes(p.status)).reduce((a, p) => a + p.n, 0);
  const total = s.data.pos.reduce((a, p) => a + p.n, 0);
  const today = s.data.pos.reduce((a, p) => a + p.today, 0);
  const created = by(['so_created']);
  const straight = s.data.pos.reduce((a, p) => a + p.straight, 0);
  const touchless = created ? Math.round((straight / created) * 100) : 0;
  const openDisp = s.data.disputes.filter((d) => !['resolved', 'written_off'].includes(d.status));
  const openAmt = openDisp.reduce((a, d) => a + d.amount, 0);
  const recovered = s.data.disputes.filter((d) => d.status === 'resolved').reduce((a, d) => a + d.amount, 0);
  const maxEx = Math.max(1, ...s.data.exceptionCodes.map((e) => e.n));

  return (
    <div>
      <Header title="Overview" hint="Last 30 days of POs through the flow, and where money leaks." right={<Button onClick={() => void s.reload()} disabled={s.loading}>Refresh</Button>} />
      <ErrorBox error={s.error} onRetry={() => void s.reload()} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="POs received" value={total.toLocaleString('en-IN')} sub={`${today} in the last 24 h`} onClick={() => go('capture')} />
        <Kpi label="Sales orders created" value={created.toLocaleString('en-IN')} sub={total ? `${Math.round((created / total) * 100)}% of POs` : ''} tone="green" onClick={() => go('sales-orders')} />
        <Kpi label="Touchless" value={`${touchless}%`} sub="SOs with no manual edit" tone="plum" />
        <Kpi label="Open disputes" value={`₹ ${short(openAmt)}`} sub={`${openDisp.length} open · ₹ ${short(recovered)} recovered`} tone="red" onClick={() => go('disputes')} />
      </div>

      <div className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-sap-line">
        <p className="mb-3 text-2xs font-bold uppercase tracking-wider text-sap-muted">Order management flow</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {FLOW.map((f, i) => (
            <button key={f.id} type="button" onClick={() => go(f.screen)} className="relative rounded-xl bg-sap-head px-4 py-3 text-left transition hover:bg-plum-soft">
              <p className="text-2xs font-bold uppercase text-sap-muted">{i + 1}. {f.label}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{by(f.statuses)}</p>
              {i < FLOW.length - 1 && <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-plum md:block" aria-hidden="true">›</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-sap-line">
          <p className="mb-3 text-2xs font-bold uppercase tracking-wider text-sap-muted">Open exceptions by cause</p>
          {!s.data.exceptionCodes.length && <p className="text-xs text-sap-muted">No open exceptions.</p>}
          {s.data.exceptionCodes.map((e) => (
            <div key={e.code} className="mb-1.5 flex items-center gap-2 text-xs">
              <span className="w-36 shrink-0 font-semibold" title={EXCEPTION_INFO[e.code]?.text}>{EXCEPTION_INFO[e.code]?.short ?? e.code}</span>
              <div className="h-3 flex-1 rounded bg-sap-head"><div className={`h-3 rounded ${EXCEPTION_INFO[e.code]?.blocking ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${(e.n / maxEx) * 100}%` }} /></div>
              <span className="w-10 text-right tabular-nums">{e.n}</span>
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-sap-line">
          <p className="mb-3 text-2xs font-bold uppercase tracking-wider text-sap-muted">Fulfilment and cash (live from SAP)</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[['tracker', 'Order Tracker', 'stuck and blocked orders'], ['backorders', 'Back Orders', 'fill rate, ship now'], ['asn', 'ASN', 'dispatched without ASN'], ['grn', 'GRN Reconciliation', 'short and rejected'],
              ['invoices', 'Invoices', 'ageing, overdue'], ['cash', 'Cash Application', 'match remittances'], ['deductions', 'Deductions', 'by reason'], ['appointments', 'Appointments', 'slots, missed']].map(([id, t, h]) => (
              <button key={id} type="button" onClick={() => go(id)} className="rounded-xl bg-sap-head px-3 py-2 text-left hover:bg-plum-soft"><b>{t}</b><br /><span className="text-sap-muted">{h}</span></button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
