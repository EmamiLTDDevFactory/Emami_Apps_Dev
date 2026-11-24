'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, DataTable, ErrorBox, Field, Input, PageHeader, useToast } from '@/components/ui';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import type { GRN } from '@/lib/entities';
import { fmtDate, fmtInr } from '@/lib/format';
import { filterGRNs, plantOptions } from './procureLogic';
import { LoadMore, PlantSelect, useGrowing } from './Bits';

export default function GRNList() {
  const toast = useToast();
  const { plants } = useSession();
  const { rows, loading, error, reload } = useList<GRN>('GRNSet');
  const [q, setQ] = useState('');
  const [plant, setPlant] = useState('');
  const filtered = useMemo(() => filterGRNs(rows, { q, plant }), [rows, q, plant]);
  const g = useGrowing(filtered, 20, `${q}|${plant}`);
  const opts = useMemo(() => plantOptions(plants, rows), [plants, rows]);

  return (
    <>
      <PageHeader title="Goods Receipts" subtitle="Posted in SAP MM - commitment converted to actual spend"
        actions={<Button onClick={() => { reload(); toast('Synced from SAP MM.', 'success'); }}>Refresh</Button>} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="GRN or PO number" /></Field>
          <Field label="Plant"><PlantSelect value={plant} onChange={setPlant} plants={opts} /></Field>
          <div className="flex items-end"><Button onClick={() => { setQ(''); setPlant(''); }}>Clear</Button></div>
        </div>
      </Card>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card title={`Goods Receipts${loading ? '' : ` (${filtered.length})`}`}>
        <DataTable<GRN> loading={loading && rows.length === 0} rows={g.visible} rowKey={(r) => `${r.Mblnr}/${r.Mjahr}/${r.Zeile}`} empty="No data"
          columns={[
            { key: 'Mblnr', header: 'GRN Number', render: (r) => <b>{r.Mblnr}</b> },
            { key: 'Title', header: 'Description', hideBelow: 'md' },
            { key: 'Ebeln', header: 'PO Number', hideBelow: 'md', render: (r) => <Link className="font-semibold text-plum underline" href={'/po/detail/?id=' + encodeURIComponent(r.Ebeln)}>{r.Ebeln}</Link> },
            { key: 'Matnr', header: 'Material', hideBelow: 'lg' },
            { key: 'Qty', header: 'Quantity', align: 'right', render: (r) => `${Number(r.Qty) || 0} ${r.Meins || ''}`.trim() },
            { key: 'Value', header: 'GRN Value', align: 'right', render: (r) => <b className="text-emerald-700">{fmtInr(r.Value)}</b> },
            { key: 'PostedOn', header: 'Posted On', align: 'right', hideBelow: 'md', render: (r) => fmtDate(r.PostedOn) },
          ]}
          footer={<LoadMore g={g} />} />
      </Card>
    </>
  );
}
