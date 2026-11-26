'use client';
import { useState } from 'react';
import { Button, Field, Input } from './ui';
import { daysAgo, fromInput, toInput, ymd } from '@/lib/format';
import type { Row } from '@/lib/types';

export interface FilterValue { DATE_FROM: string; DATE_TO: string; KUNNR: string; VKORG: string }

/** Date range + customer + sales org; Load sends them to SAP. */
export function useFilters(days = 30) {
  const [f, setF] = useState<FilterValue>({ DATE_FROM: daysAgo(days), DATE_TO: ymd(new Date()), KUNNR: '', VKORG: '' });
  const payload = (): Row => ({ DATE_FROM: f.DATE_FROM, DATE_TO: f.DATE_TO, ...(f.KUNNR ? { KUNNR: f.KUNNR.padStart(10, '0') } : {}), ...(f.VKORG ? { VKORG: f.VKORG } : {}) });
  return { f, setF, payload };
}

export function FilterBar({ f, setF, onLoad, loading, noDates, children }: { f: FilterValue; setF: (f: FilterValue) => void; onLoad: () => void; loading: boolean; noDates?: boolean; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-2xl bg-sap-head/70 px-3 py-2 ring-1 ring-sap-line">
      {!noDates && <Field label="From"><Input type="date" value={toInput(f.DATE_FROM)} onChange={(v) => setF({ ...f, DATE_FROM: fromInput(v) })} /></Field>}
      {!noDates && <Field label="To"><Input type="date" value={toInput(f.DATE_TO)} onChange={(v) => setF({ ...f, DATE_TO: fromInput(v) })} /></Field>}
      <Field label="Customer"><Input value={f.KUNNR} onChange={(v) => setF({ ...f, KUNNR: v.replace(/\D/g, '') })} placeholder="all" className="w-28 font-mono" /></Field>
      <Field label="Sales org."><Input value={f.VKORG} onChange={(v) => setF({ ...f, VKORG: v.toUpperCase() })} placeholder="all" className="w-20 font-mono" /></Field>
      <Button variant="primary" onClick={onLoad} disabled={loading}>{loading ? 'Loading…' : 'Load from SAP'}</Button>
      <div className="flex-1" />
      {children}
    </div>
  );
}
