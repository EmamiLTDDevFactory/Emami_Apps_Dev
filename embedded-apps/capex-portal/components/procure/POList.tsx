'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Input, PageHeader, Select, useToast } from '@/components/ui';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import type { PurchaseOrder } from '@/lib/entities';
import { fmtDate, fmtInr } from '@/lib/format';
import { filterPOs, isFlag, plantOptions } from './procureLogic';
import { LoadMore, PlantSelect, useGrowing } from './Bits';

export default function POList() {
  const router = useRouter();
  const toast = useToast();
  const { plants } = useSession();
  const { rows, loading, error, reload } = useList<PurchaseOrder>('PurchaseOrderSet');
  const [q, setQ] = useState('');
  const [plant, setPlant] = useState('');
  const [grn, setGrn] = useState<'' | 'YES' | 'NO'>('');
  const filtered = useMemo(() => filterPOs(rows, { q, plant, grn }), [rows, q, plant, grn]);
  const g = useGrowing(filtered, 20, `${q}|${plant}|${grn}`);
  const opts = useMemo(() => plantOptions(plants, rows), [plants, rows]);

  return (
    <>
      <PageHeader title="Purchase Orders" subtitle="Issued from approved CPEs - synced from SAP MM"
        actions={<Button onClick={() => { reload(); toast('Synced from SAP MM.', 'success'); }}>Refresh</Button>} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO number or vendor" /></Field>
          <Field label="Plant"><PlantSelect value={plant} onChange={setPlant} plants={opts} /></Field>
          <Field label="GRN Status">
            <Select value={grn} onChange={(e) => setGrn(e.target.value as '' | 'YES' | 'NO')}>
              <option value="">All</option><option value="YES">GRN Posted</option><option value="NO">Awaiting GRN</option>
            </Select>
          </Field>
          <div className="flex items-end"><Button onClick={() => { setQ(''); setPlant(''); setGrn(''); }}>Clear</Button></div>
        </div>
      </Card>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card title={`Purchase Orders${loading ? '' : ` (${filtered.length})`}`}>
        <DataTable<PurchaseOrder> loading={loading && rows.length === 0} rows={g.visible} rowKey={(r) => r.Ebeln}
          onRowClick={(r) => router.push('/po/detail/?id=' + encodeURIComponent(r.Ebeln))} empty="No data"
          columns={[
            { key: 'Ebeln', header: 'PO Number', render: (r) => <><div className="font-bold">{r.Ebeln}</div><div className="text-[11px] text-sap-muted">{fmtDate(r.IssuedOn)}</div></> },
            { key: 'Title', header: 'CPE Title', hideBelow: 'md' },
            { key: 'Vendorname', header: 'Vendor', hideBelow: 'md' },
            { key: 'PlantName', header: 'Plant', hideBelow: 'lg' },
            { key: 'Amount', header: 'Value', align: 'right', render: (r) => <b>{fmtInr(r.Amount)}</b> },
            { key: 'ExpDelivery', header: 'Expected Delivery', hideBelow: 'lg', render: (r) => fmtDate(r.ExpDelivery) },
            { key: 'GrnPosted', header: 'GRN', align: 'right', render: (r) => <Chip tone={isFlag(r.GrnPosted) ? 'success' : 'warning'}>{isFlag(r.GrnPosted) ? 'Posted' : 'Awaiting'}</Chip> },
          ]}
          footer={<LoadMore g={g} />} />
      </Card>
    </>
  );
}
