'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Input, Kpi, Modal, PageHeader, Spinner, TextArea, useAction } from '@/components/ui';
import { fn, isOk } from '@/lib/api';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import type { QuotaItem, QuotaSummary } from '@/lib/entities';
import { currentFiscalYear, fmtDate, fmtInrFull, statusLabel, statusTone } from '@/lib/format';
import { LoadMore, PlantSelect, useGrowing } from '@/components/procure/Bits';
import { plantOptions } from '@/components/procure/procureLogic';
import { capsFromConfig, quotaCheck, rollupUnits, usedPct, usedTone, validateQuota, type QuotaDraft } from './quotaLogic';

const BAR = { error: 'bg-red-500', warning: 'bg-amber-500', success: 'bg-emerald-500' };

export default function UnitQuota() {
  const router = useRouter();
  const { config, plants, fiscalYear, loading: sessLoading } = useSession();
  const { busy, run } = useAction();
  const summary = useList<QuotaSummary>('QuotaSummarySet');
  const items = useList<QuotaItem>('QuotaItemSet');
  const caps = useMemo(() => capsFromConfig(config), [config]);
  const fy = fiscalYear || currentFiscalYear();
  const units = useMemo(() => rollupUnits(summary.rows, items.rows, caps, fy), [summary.rows, items.rows, caps, fy]);
  const opts = useMemo(() => plantOptions(plants, [...items.rows, ...summary.rows]), [plants, items.rows, summary.rows]);
  const [draft, setDraft] = useState<QuotaDraft>({ plant: '', title: '', amount: '', justification: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [ok, setOk] = useState('');
  const consumption = useRef<HTMLDivElement>(null);
  const g = useGrowing(items.rows, 15);

  useEffect(() => { if (!draft.plant && opts.length) setDraft((d) => ({ ...d, plant: opts[0].code })); }, [opts, draft.plant]);
  const set = (p: Partial<QuotaDraft>) => { setDraft((d) => ({ ...d, ...p })); setOk(''); };
  const check = quotaCheck(draft, units, caps); // live on every keystroke (log #93)
  const goCaps = () => consumption.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const myYearCap = caps.plantCaps[draft.plant] ?? caps.yearCap;

  const onSubmit = () => {
    const errs = validateQuota(draft, units, caps);
    setProblems(errs);
    if (!errs.length) setConfirm(true);
  };
  const doSubmit = async () => {
    setConfirm(false);
    const r = await run(async () => {
      const res = await fn('SubmitQuotaCapex', { Plant: draft.plant, Amount: Number(draft.amount), Title: draft.title.trim(), Justification: draft.justification });
      if (!isOk(res)) throw new Error(res.Message || 'Submission failed.');
      return res;
    });
    if (r) {
      setOk(r.Message || 'Quota capex submitted for unit approval.');
      setDraft((d) => ({ plant: d.plant, title: '', amount: '', justification: '' }));
      summary.reload(); items.reload(); // log #23: no stale rows
    }
  };

  if (sessLoading) return <Spinner />;
  return (
    <>
      <PageHeader title="Unit Quota" subtitle={`Annual cap ${fmtInrFull(myYearCap)} per unit, ${fmtInrFull(caps.singleCap)} per single item. Approved at unit level, no DOA chain.`} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Kpi label="Annual Cap" value={fmtInrFull(caps.yearCap)} foot="Per unit, per financial year" onClick={goCaps} />
        <Kpi label="Single Item Cap" value={fmtInrFull(caps.singleCap)} foot="Maximum for any single capex item" tone="warning" onClick={goCaps} />
      </div>
      {(summary.error || items.error) && <div className="mb-3"><ErrorBox message={summary.error || items.error} onRetry={() => { summary.reload(); items.reload(); }} /></div>}

      <div ref={consumption} />
      <Card title="Quota Consumption by Unit">
        {summary.loading && units.length === 0 ? <Spinner /> : units.length === 0 ? <div className="py-4 text-center text-[12px] text-sap-muted">No quota used yet this financial year.</div> : (
          <div className="grid gap-4">
            {units.map((u) => (
              <div key={u.werks}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div><div className="text-[12px] font-bold">{u.plantName}</div><div className="text-[11px] text-sap-muted">{u.count} items this year{u.reserved ? ` - ${fmtInrFull(u.reserved)} awaiting approval` : ''}</div></div>
                  <div className="text-right"><div className="text-[12px] font-semibold">{fmtInrFull(u.used)} of {fmtInrFull(u.cap)}</div><div className="text-[11px] text-sap-muted">{fmtInrFull(u.remaining)} remaining</div></div>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#EEF0FB]" role="progressbar" aria-valuenow={Math.round(usedPct(u))} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full ${BAR[usedTone(u)]}`} style={{ width: usedPct(u) + '%' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="New Quota Capex" className="mt-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Plant *"><PlantSelect value={draft.plant} onChange={(v) => set({ plant: v })} plants={opts} allLabel="" /></Field>
          <Field label="Description *"><Input value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Pallet Trolleys (4 nos)" /></Field>
          <Field label="Amount (INR) *"><Input inputMode="numeric" value={draft.amount} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
        </div>
        <Field label="Justification *" className="mt-3"><TextArea rows={2} maxLength={500} value={draft.justification} onChange={(e) => set({ justification: e.target.value })} placeholder="Brief reason for the purchase." /></Field>
        {check && (
          <div role="status" className={`mt-3 rounded-lg border px-4 py-2 text-[12px] ${check.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {check.ok ? `Within unit quota limits. Remaining after this item: ${fmtInrFull(check.remainingAfter)}.` : check.reason}
          </div>
        )}
        {problems.length > 0 && <div className="mt-3"><ErrorBox message={'Quota submission blocked. ' + problems.join(' ')} /></div>}
        {ok && <div role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800">{ok}</div>}
        <div className="mt-3 flex justify-end"><Button variant="primary" disabled={busy || (!!check && !check.ok)} onClick={onSubmit}>{busy ? 'Submitting...' : 'Submit'}</Button></div>
      </Card>

      <Card title="Quota Items" className="mt-4">
        <DataTable<QuotaItem> loading={items.loading && items.rows.length === 0} rows={g.visible} rowKey={(r) => r.Quotaid} empty="No data"
          onRowClick={(r) => router.push('/quota/detail/?id=' + encodeURIComponent(r.Quotaid))}
          columns={[
            { key: 'Quotaid', header: 'ID', render: (r) => <><div className="font-bold">{r.Quotaid}</div><div className="text-[11px] text-sap-muted">{fmtDate(r.CreatedOn)}</div></> },
            { key: 'Title', header: 'Description', hideBelow: 'md' },
            { key: 'Werks', header: 'Plant', hideBelow: 'md' },
            { key: 'Amount', header: 'Amount', align: 'right', render: (r) => <b>{fmtInrFull(r.Amount)}</b> },
            { key: 'CreatedByName', header: 'Created By', hideBelow: 'lg' },
            { key: 'Status', header: 'Status', align: 'right', render: (r) => <Chip tone={statusTone(r.Status)}>{statusLabel(r.Status)}</Chip> },
          ]}
          footer={<LoadMore g={g} />} />
      </Card>

      <Modal open={confirm} title="Submit Quota Capex" onClose={() => setConfirm(false)}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={doSubmit}>Submit Quota Capex</Button></>}>
        <p className="text-[12px]">Submit {fmtInrFull(draft.amount)} under the unit quota?</p>
        <p className="mt-2 text-[12px] text-sap-muted">Unit quota capex is approved at unit level and does not go through the DOA chain.</p>
      </Modal>
    </>
  );
}
