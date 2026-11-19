'use client';

import React, { useState } from 'react';
import { useTms } from '../../lib/store';
import { Card, Field, Modal, PageHead, Table } from '../../components/ui';

export default function Customers() {
  const t = useTms();
  const [add, setAdd] = useState<{ name: string; zone: string; contact: string }>();
  const [q, setQ] = useState('');
  const rows = t.db.customers.filter((c) => !q || (c.name + c.rCode).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="Customer Master List" sub="Customer directory with coordinator (CSL) assignment" right={<button className="btn-primary" onClick={() => t.can('customer.edit') ? setAdd({ name: '', zone: 'East', contact: '' }) : t.toast('Only Marketing can edit customers', 'err')}>+ Add customer</button>} />
      <input className="input mb-3 !w-72" placeholder="Search name or R-code…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card pad={false}><Table rows={rows} rowKey={(c) => c.id} cols={[{ h: 'Customer', r: (c) => <b>{c.name}</b> }, { h: 'Ref / R-code', r: (c) => c.rCode }, { h: 'Zone', r: (c) => c.zone }, { h: 'Segment', r: (c) => c.segment }, { h: 'Contact', r: (c) => c.contact }, { h: 'CSL / Coordinator', r: (c) => c.csl }]} /></Card>
      {add && <Modal title="Add customer" onClose={() => setAdd(undefined)} footer={<button className="btn-primary" onClick={() => { if (!add.name.trim()) return t.toast('Name required', 'err'); t.addCustomer(add.name.trim(), add.zone, add.contact); t.toast('Customer added'); setAdd(undefined); }}>Save</button>}>
        <div className="space-y-3"><Field label="Name"><input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></Field><Field label="Zone"><select className="input" value={add.zone} onChange={(e) => setAdd({ ...add, zone: e.target.value })}>{['NE', 'East', 'North', 'West', 'South', 'Central'].map((z) => <option key={z}>{z}</option>)}</select></Field><Field label="Contact"><input className="input" value={add.contact} onChange={(e) => setAdd({ ...add, contact: e.target.value })} /></Field></div></Modal>}
    </div>
  );
}
