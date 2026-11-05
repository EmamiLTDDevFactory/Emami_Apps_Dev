'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertOctagon, Inbox, LayoutGrid, RefreshCw, Ticket } from 'lucide-react';
import { getBreakdown, type TicketQuery } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { fmtDate, fmtNum, istToday, SEVERITY_LABEL, SEVERITY_TONE } from '@/lib/format';
import type { Breakdown, NameValue } from '@/lib/types';
import { BarList, type BarRow } from './charts';
import { Button, Card, Empty, Kpi, Notice, Pill, Select, Skeleton } from './ui';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 365 days' },
];

/** "None" is the bucket for tickets without the field set - there is no list filter for it. */
const NONE = 'None';

const rowsOf = (list: NameValue[]): BarRow[] =>
  list.map((r) => ({ key: r.name, label: r.name, value: r.value, detail: r.name === NONE ? 'Not set - no drill-down' : 'Click to open these tickets' }));

/** Ticket counts by region, status, type, source ... (Freshdesk's "Emami Secondary Helpdesk Dashboard"). */
export default function Helpdesk() {
  const { meta, openList, openTicket } = useSetu();
  const [days, setDays] = useState('30');
  const [groupId, setGroupId] = useState('');
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setBusy(true);
    try {
      const d = await getBreakdown({ days: Number(days), groupId: groupId ? Number(groupId) : undefined });
      if (n !== seq.current) return;
      setData(d);
      setError('');
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'Could not load the helpdesk dashboard.');
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }, [days, groupId]);

  useEffect(() => { load(); }, [load]);

  /** Ticket list filtered like this dashboard: same period start (IST) and group. */
  const drill = (q: TicketQuery) => {
    const base: TicketQuery = { from: istToday(-Number(days)) };
    if (groupId) base.groupId = groupId;
    openList({ ...base, ...q });
  };
  const pick = (make: (name: string) => TicketQuery) => (key: string) => { if (key !== NONE) drill(make(key)); };

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Helpdesk dashboard</h2>
        <p className="text-sm text-muted">Ticket counts by region, status, type and source - click a bar to open those tickets</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Period" value={days} onChange={setDays} options={PERIODS} />
        <Select label="Group" value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All groups' }, ...meta.groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
        <Button size="sm" onClick={load} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh</Button>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {header}
        {error ? <Notice>{error}</Notice> : <Card><Skeleton /></Card>}
      </div>
    );
  }

  const bars = (title: string, sub: string, list: NameValue[], onPick: (key: string) => void, unit = 'tickets') => (
    <Card title={title} sub={sub}>
      {list.length === 0 ? <p className="text-sm text-muted">No tickets in this period.</p> : <BarList rows={rowsOf(list)} unit={unit} onPick={onPick} />}
    </Card>
  );

  const statusRows: BarRow[] = data.status.map((s) => ({
    key: s.id === null ? `none:${s.name}` : String(s.id),
    label: s.name,
    value: s.value,
    detail: s.id === null ? 'No drill-down' : 'Click to open these tickets',
  }));

  return (
    <div className="space-y-4">
      {header}
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Tickets" value={fmtNum(data.totals.total)} sub={`Created in the last ${data.days} days`} icon={Ticket} onClick={() => drill({ view: '' })} />
        <Kpi label="Unresolved" value={fmtNum(data.totals.unresolved)} sub="Of those, still open" icon={Inbox} tone={data.totals.unresolved ? 'warn' : 'good'} onClick={() => drill({ view: 'open' })} />
      </div>

      {data.totals.total === 0 ? (
        <Card><Empty icon={LayoutGrid} title="No tickets in this period">Pick a longer period or another group.</Empty></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bars('Region wise', 'All tickets in the period', data.region, pick((name) => ({ view: '', region: name })))}
          <Card title="Status wise" sub="All tickets in the period">
            {statusRows.length === 0 ? (
              <p className="text-sm text-muted">No tickets in this period.</p>
            ) : (
              <BarList rows={statusRows} unit="tickets" onPick={(k) => { if (!k.startsWith('none:')) drill({ view: '', statusId: k }); }} />
            )}
          </Card>
          {bars('Type wise', 'All tickets in the period', data.type, pick((name) => ({ view: '', type: name })))}
          {bars('Source wise', 'All tickets in the period', data.source, pick((name) => ({ view: '', source: name })))}
          {bars('Category wise', 'Unresolved tickets', data.category, pick((name) => ({ view: 'open', category: name })), 'unresolved tickets')}
          {bars('Depot wise', 'Unresolved tickets', data.depot, pick((name) => ({ view: 'open', depot: name })), 'unresolved tickets')}
          {bars('State wise', 'All tickets in the period', data.state, pick((name) => ({ view: '', state: name })))}

          <Card title="Fatal and Serious (unresolved)" sub="Click a ticket to open it" className="md:col-span-2 xl:col-span-2" bodyClass="p-2">
            {data.critical.length === 0 ? (
              <Empty icon={AlertOctagon} title="Nothing critical open">No Fatal or Serious tickets are unresolved in this period.</Empty>
            ) : (
              <ul className="scroll-thin max-h-96 divide-y divide-line overflow-y-auto">
                {data.critical.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTicket(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-sunken">
                      <Pill tone={SEVERITY_TONE[t.severity]}>{SEVERITY_LABEL[t.severity]}</Pill>
                      <span className="num shrink-0 text-xs font-bold text-accent">#{t.id}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={t.subject}>{t.subject}</span>
                      <span className="hidden shrink-0 text-2xs text-faint sm:inline">{fmtDate(t.createdAt)}</span>
                      <Pill>{t.statusName}</Pill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
