'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronDown, ChevronUp, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { fetchPoByNumber, submitPoAction } from '../../lib/sapClient';
import type { PoRow } from '../../types/po';
import { formatCurrency, formatDate } from '../../lib/formatters';
import StatusBadge from '../../components/StatusBadge';
import { RejectDialog } from '../../components/Modals';

function statusVariant(mode: string | null): 'pending' | 'approved' | 'rejected' {
  if (mode === 'A') return 'approved';
  if (mode === 'R') return 'rejected';
  return 'pending';
}

function DetailsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const po = params.get('po') || '';
  const mode = params.get('mode');

  const [header, setHeader] = useState<PoRow | null>(null);
  const [items, setItems] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAll, setExpandedAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [acting, setActing] = useState<'A' | 'R' | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!po) return;
    setLoading(true);
    fetchPoByNumber(po)
      .then(({ header: h, items: i }) => { setHeader(h); setItems(i); })
      .catch(() => setError('Could not load this purchase order.'))
      .finally(() => setLoading(false));
  }, [po]);

  const toggleExpandAll = () => {
    const next = !expandedAll;
    setExpandedAll(next);
    const all: Record<number, boolean> = {};
    items.forEach((_, i) => { all[i] = next; });
    setExpanded(all);
  };

  const runAction = async (action: 'A' | 'R', reason?: string) => {
    if (!header) return;
    setActing(action);
    try {
      await submitPoAction(header, action, reason);
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed. Please try again.');
    } finally {
      setActing(null);
      setShowReject(false);
    }
  };

  const buttonsEnabled = mode === 'P';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  if (!header) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-center text-sm font-semibold text-inkSoft">
        Purchase order not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <button
        onClick={() => router.push('/')}
        className="mb-4 flex items-center gap-1.5 text-sm font-bold text-rust hover:underline"
      >
        <ArrowLeft size={15} /> Back to Approvals
      </button>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-inkSoft">PO Number</p>
            <h1 className="text-xl font-extrabold text-ink">{header.ebeln}</h1>
          </div>
          <StatusBadge variant={statusVariant(mode)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-inkSoft">
          <span>Created by: <b className="text-ink">{header.zname || '—'}</b></span>
          <span>Date: <b className="text-ink">{formatDate(header.erdat)}</b></span>
          <span>Vendor: <b className="text-ink">{header.lifnr} · {header.name1}</b></span>
          <span>Purchase Group: <b className="text-ink">{header.ekgrp || '—'}</b></span>
          <span>Company Code: <b className="text-ink">{header.bukrs || '—'}</b></span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink">Line Items</h2>
        <button onClick={toggleExpandAll} className="btn-ghost !py-1.5 !px-3 text-xs">
          {expandedAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expandedAll ? 'Collapse All' : 'Expand All'}
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-inkSoft">No line items.</p>
        ) : (
          items.map((item, i) => {
            const isOpen = expanded[i] ?? false;
            return (
              <div key={i} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [i]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  {isOpen ? <ChevronUp size={16} className="shrink-0 text-inkSoft" /> : <ChevronDown size={16} className="shrink-0 text-inkSoft" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {item.ebelp} — {item.stxt} — {formatCurrency(item.waers, item.netwr)}
                  </span>
                  {item.loekz && (
                    <span className="pill bg-redBg text-red shrink-0">
                      <Trash2 size={11} /> Deleted
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border p-4 sm:grid-cols-3">
                    <Field label="Delivery date" value={formatDate(item.delDate)} />
                    <Field label="Cost Center" value={item.ccenter} />
                    <Field label="GL Account" value={item.gl} />
                    <Field label="Quantity" value={`${item.menge} ${item.meins}`.trim()} />
                    <Field label="Order" value={item.order} />
                    <Field label="Amount" value={formatCurrency(item.waers, item.netwr)} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {error && <p className="mt-4 rounded-xl bg-redBg px-4 py-2.5 text-sm font-semibold text-red">{error}</p>}

      {buttonsEnabled && (
        <div className="fixed inset-x-0 bottom-0 z-10 flex justify-end gap-2 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button onClick={() => setShowReject(true)} disabled={acting !== null} className="btn-danger">
            <XCircle size={15} /> Reject
          </button>
          <button onClick={() => runAction('A')} disabled={acting !== null} className="btn-success">
            <CheckCircle2 size={15} /> {acting === 'A' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      )}

      {showReject && (
        <RejectDialog busy={acting === 'R'} onClose={() => setShowReject(false)} onConfirm={(reason) => runAction('R', reason)} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-inkSoft">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value || '—'}</p>
    </div>
  );
}

export default function DetailsPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" /></div>}>
      <DetailsContent />
    </Suspense>
  );
}
