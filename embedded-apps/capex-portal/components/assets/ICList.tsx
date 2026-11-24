'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Chip, DataTable, ErrorBox, Input, Modal, PageHeader, useToast } from '@/components/ui';
import { useList } from '@/lib/useData';
import type { InstallCert, PurchaseOrder } from '@/lib/entities';
import { fmtDate, fmtInr, orDash, statusLabel, statusTone } from '@/lib/format';
import { icEligiblePOs } from '@/components/procure/procureLogic';
import { LoadMore, useGrowing } from '@/components/procure/Bits';
import { icSearch } from './icLogic';

export default function ICList() {
  const router = useRouter();
  const toast = useToast();
  const ic = useList<InstallCert>('InstallCertSet');
  const po = useList<PurchaseOrder>('PurchaseOrderSet');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(false);
  const filtered = useMemo(() => icSearch(ic.rows, q), [ic.rows, q]);
  const g = useGrowing(filtered, 20, q);

  const create = () => {
    const eligible = icEligiblePOs(po.rows, ic.rows);
    if (!eligible.length) {
      toast('No CPE is ready for an installation certificate. A goods receipt must be posted before the IC can be uploaded.', 'error');
      return;
    }
    if (eligible.length === 1) { router.push('/ic/detail/?new=' + encodeURIComponent(eligible[0].Cpeid)); return; }
    setPick(true);
  };
  const eligible = useMemo(() => icEligiblePOs(po.rows, ic.rows), [po.rows, ic.rows]);

  return (
    <>
      <PageHeader title="Installation Certificates" subtitle="Commissioning evidence and capitalization cost"
        actions={<Button variant="primary" disabled={po.loading || ic.loading} onClick={create}>Create Installation Certificate</Button>} />
      {(ic.error || po.error) && <div className="mb-3"><ErrorBox message={ic.error || po.error} onRetry={() => { ic.reload(); po.reload(); }} /></div>}
      <Card title={`Installation Certificates${ic.loading ? '' : ` (${filtered.length})`}`}
        actions={<Input className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder="IC or CPE number" aria-label="Search" />}>
        <DataTable<InstallCert> loading={ic.loading && ic.rows.length === 0} rows={g.visible} rowKey={(r) => r.Icid} empty="No data"
          onRowClick={(r) => router.push('/ic/detail/?id=' + encodeURIComponent(r.Icid))}
          columns={[
            { key: 'Icid', header: 'IC Number', render: (r) => <><div className="font-bold">{r.Icid}</div><div className="text-[11px] text-sap-muted">{r.Cpeid}</div></> },
            { key: 'Title', header: 'Description', hideBelow: 'md' },
            { key: 'PlantName', header: 'Plant', hideBelow: 'md' },
            { key: 'CommissionDt', header: 'Commissioning Date', hideBelow: 'lg', render: (r) => fmtDate(r.CommissionDt) },
            { key: 'TotalCost', header: 'Total Capital Cost', align: 'right', render: (r) => <b>{fmtInr(r.TotalCost)}</b> },
            { key: 'Anln1', header: 'Asset Number', hideBelow: 'lg', render: (r) => orDash(r.Anln1) },
            { key: 'Status', header: 'Status', align: 'right', render: (r) => <Chip tone={statusTone(r.Status)}>{statusLabel(r.Status)}</Chip> },
          ]}
          footer={<LoadMore g={g} />} />
      </Card>

      <Modal open={pick} title="Choose a purchase order" onClose={() => setPick(false)}>
        <p className="mb-2 text-[12px] text-sap-muted">These purchase orders have a posted goods receipt and no installation certificate yet.</p>
        <ul className="grid gap-1.5">
          {eligible.map((p) => (
            <li key={p.Ebeln}>
              <button type="button" className="w-full rounded-lg border border-sap-line px-3 py-2 text-left text-[12px] hover:bg-[#EEF1FB]"
                onClick={() => { setPick(false); router.push('/ic/detail/?new=' + encodeURIComponent(p.Cpeid)); }}>
                <b>{p.Cpeid}</b> &middot; PO {p.Ebeln} &middot; {p.Title} <span className="text-sap-muted">({p.PlantName}, {fmtInr(p.Amount)})</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
