'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Chip, DataTable, ErrorBox, Kpi, PageHeader } from '@/components/ui';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import type { CwipAgeing, InstallCert } from '@/lib/entities';
import { fmtDate, fmtInr, orDash, statusTone } from '@/lib/format';
import { LoadMore, useGrowing } from '@/components/procure/Bits';
import { DEFAULT_CWIP_OVERDUE_DAYS, capSummary, icStatusText, isCapitalized, overdueRows, riskTone } from './icLogic';

export default function Capitalization() {
  const router = useRouter();
  const { cfgNum } = useSession();
  const overdueDays = cfgNum('CWIP_OVERDUE_DAYS', DEFAULT_CWIP_OVERDUE_DAYS);
  const ageing = useList<CwipAgeing>('CwipAgeingSet');
  const ics = useList<InstallCert>('InstallCertSet');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const sum = useMemo(() => capSummary(ageing.rows, overdueDays), [ageing.rows, overdueDays]);
  const sorted = useMemo(() => [...ageing.rows].sort((a, b) => (Number(b.AgeDays) || 0) - (Number(a.AgeDays) || 0)), [ageing.rows]);
  const shownAgeing = useMemo(() => (onlyOverdue ? overdueRows(sorted, overdueDays) : sorted), [sorted, onlyOverdue, overdueDays]);
  const capitalized = useMemo(() => ics.rows.filter((r) => isCapitalized(r.Status)), [ics.rows]);
  const gA = useGrowing(shownAgeing, 20, String(onlyOverdue));
  const gC = useGrowing(capitalized, 20);

  /** Upload IC: continue a pending IC, otherwise start one from the CPE (Fiori opened NEW-<cpe>). */
  const openIc = (r: CwipAgeing) => {
    if (r.Icid) router.push('/ic/detail/?id=' + encodeURIComponent(r.Icid));
    else router.push('/ic/detail/?new=' + encodeURIComponent(r.Cpeid));
  };

  return (
    <>
      <PageHeader title="Capitalization" subtitle="CWIP ageing and fixed-asset creation"
        actions={<div className="text-right text-white"><div className="text-[11px] text-white/75">CWIP Pending</div><div className="font-display text-lg font-extrabold">{fmtInr(sum.value)}</div><div className="text-[11px] text-white/75">{sum.count} assets &middot; avg {sum.avgAge} days old</div></div>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open CWIP" value={sum.count} foot="assets" onClick={() => setOnlyOverdue(false)} />
        <Kpi label="CWIP Value" value={fmtInr(sum.value)} tone="info" />
        <Kpi label="Average Age" value={<>{sum.avgAge} <span className="text-[12px] font-semibold text-sap-muted">days</span></>} tone="warning" />
        <Kpi label={`Over ${overdueDays} Days`} value={sum.overdue} foot="require action - click to filter" tone="error" onClick={() => setOnlyOverdue(true)} />
      </div>

      {onlyOverdue && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-[12px] text-blue-800">
          <span>Showing CWIP open more than {overdueDays} days only.</span>
          <button type="button" className="font-bold underline" onClick={() => setOnlyOverdue(false)}>Clear</button>
        </div>
      )}
      {sum.overdue > 0 && (
        <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          {sum.overdue} CWIP item{sum.overdue === 1 ? ' has' : 's have'} been open more than {overdueDays} days. Depreciation is not running on these assets and the balance sheet overstates capital work in progress.
        </div>
      )}
      {(ageing.error || ics.error) && <div className="mb-3"><ErrorBox message={ageing.error || ics.error} onRetry={() => { ageing.reload(); ics.reload(); }} /></div>}

      <Card title="CWIP Ageing">
        <DataTable<CwipAgeing> loading={ageing.loading && ageing.rows.length === 0} rows={gA.visible} rowKey={(r) => r.Cwipid} empty="No open CWIP. Everything is capitalized."
          columns={[
            { key: 'Cwipid', header: 'CWIP', render: (r) => <b>{r.Cwipid}</b> },
            { key: 'Title', header: 'Description', hideBelow: 'md' },
            { key: 'Werks', header: 'Plant', hideBelow: 'md', render: (r) => r.PlantName || r.Werks },
            { key: 'Amount', header: 'Value', align: 'right', hideBelow: 'sm', render: (r) => <b>{fmtInr(r.Amount)}</b> },
            { key: 'AgeDays', header: 'Age (days)', align: 'right', hideBelow: 'sm', render: (r) => <Chip tone={riskTone(r.Risk)}>{r.Risk === 'Error' ? '⚠ ' : ''}{r.AgeDays}</Chip> },
            { key: 'IcStatus', header: 'IC Status', align: 'right', hideBelow: 'sm', render: (r) => <Chip tone={statusTone(r.IcStatus)}>{icStatusText(r.IcStatus)}</Chip> },
            { key: 'act', header: '', align: 'right', render: (r) => <Button variant="primary" onClick={() => openIc(r)}>{r.Icid ? 'Open IC' : 'Upload IC'}</Button> },
          ]}
          footer={<LoadMore g={gA} />} />
      </Card>

      <Card title="Capitalized Assets" className="mt-4">
        <DataTable<InstallCert> loading={ics.loading && ics.rows.length === 0} rows={gC.visible} rowKey={(r) => r.Icid} empty="No assets capitalized yet."
          onRowClick={(r) => router.push('/ic/detail/?id=' + encodeURIComponent(r.Icid))}
          columns={[
            { key: 'Anln1', header: 'Asset Number', render: (r) => <><div className="font-bold">{orDash(r.Anln1)}</div><div className="text-[11px] text-sap-muted">{r.Icid}</div></> },
            { key: 'Title', header: 'Description', hideBelow: 'md' },
            { key: 'PlantName', header: 'Plant', hideBelow: 'md' },
            { key: 'TotalCost', header: 'Total Capital Cost', align: 'right', hideBelow: 'sm', render: (r) => <b className="text-emerald-700">{fmtInr(r.TotalCost)}</b> },
            { key: 'CapitalizedOn', header: 'Capitalized On', align: 'right', hideBelow: 'sm', render: (r) => fmtDate(r.CapitalizedOn) },
          ]}
          footer={<LoadMore g={gC} />} />
      </Card>
    </>
  );
}
