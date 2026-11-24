'use client';
import { useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { list, q } from '@/lib/api';
import type { Vend } from '@/lib/entities';
import { RankChip } from './Bits';
import type { DraftVendor } from './logic';

let vendorCache: Promise<Vend[]> | null = null;
/** All vendors, fetched at most once; a failed load is not cached so the next keystroke retries. */
function loadVendors(): Promise<Vend[]> {
  if (!vendorCache) vendorCache = list<Vend>('VendSet').then((r) => r.rows).catch((e) => { vendorCache = null; throw e; });
  return vendorCache;
}

interface Hit { lifnr: string; name: string }

/**
 * Vendor quote rows (log #22/#33/#34/#46/#52). Every cell patches ITS OWN row by id (never the whole array), the row key is the
 * stable id, and the per-row vendor-name search keeps its own results and debounce timer, so adding, removing or searching in
 * one row can never erase what is typed in another. Quality and Total Cost are not shown (log #138) but keep their defaults.
 */
export default function VendorTable({ vendors, onPatch, onSelect, onRemove }: {
  vendors: DraftVendor[];
  onPatch: (id: string, p: Partial<DraftVendor>) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [hits, setHits] = useState<Record<string, Hit[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState('');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latest = useRef<Record<string, string>>({});

  function search(id: string, term: string) {
    clearTimeout(timers.current[id]);
    latest.current[id] = term;
    const t = term.trim();
    if (t.length < 2) { setHits((h) => ({ ...h, [id]: [] })); setBusy((b) => ({ ...b, [id]: false })); return; }
    setBusy((b) => ({ ...b, [id]: true }));
    timers.current[id] = setTimeout(async () => {
      let found: Hit[] = [];
      try {
        // VendSet ignores $filter and $top on the live gateway (log #22, re-verified 2026-11-24: ~57k rows every time), so the list is
        // loaded ONCE per page view, kept in memory, and searched here by name or vendor code.
        const all = await loadVendors();
        const low = t.toLowerCase();
        found = all.filter((x) => (x.Name1 || '').toLowerCase().includes(low) || (x.Lifnr || '').includes(low)).slice(0, 50).map((x) => ({ lifnr: x.Lifnr || '', name: x.Name1 }));
      } catch { found = []; }
      if (latest.current[id] !== term) return; // a newer keystroke owns this row now
      setHits((h) => ({ ...h, [id]: found }));
      setBusy((b) => ({ ...b, [id]: false }));
    }, 300);
  }

  return (
    <div className="scroll-glass overflow-x-auto">
      <table className="glass-table w-full min-w-[640px] border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            <th className="w-14 px-3 py-2 text-left text-[11px] font-bold">Rank</th>
            <th className="px-3 py-2 text-center text-[11px] font-bold">Vendor</th>
            <th className="w-40 px-3 py-2 text-center text-[11px] font-bold">Quote (₹)</th>
            <th className="w-32 px-3 py-2 text-right text-[11px] font-bold">Delivery (days)</th>
            <th className="w-20 px-3 py-2 text-center text-[11px] font-bold">Select</th>
            <th className="w-12 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {vendors.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sap-muted">Add at least one vendor quote.</td></tr>}
          {vendors.map((v) => (
            <tr key={v.id} className="border-b border-sap-line align-top">
              <td className="border-b border-sap-line px-3 py-2"><RankChip rank={v.rank} /></td>
              <td className="relative border-b border-sap-line px-3 py-2">
                <Input
                  className="w-full" placeholder="Search vendor name..." autoComplete="off" value={v.name} aria-label="Vendor name"
                  onFocus={() => setOpenId(v.id)} onBlur={() => setTimeout(() => setOpenId((o) => (o === v.id ? '' : o)), 150)}
                  onChange={(e) => { onPatch(v.id, { name: e.target.value, lifnr: '' }); search(v.id, e.target.value); setOpenId(v.id); }}
                />
                {v.lifnr && <div className="mt-0.5 text-[10.5px] text-sap-muted">Vendor code {v.lifnr}</div>}
                {openId === v.id && v.name.trim().length >= 2 && (
                  <ul role="listbox" className="absolute left-3 right-3 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-sap-line bg-white py-1 text-[12px] shadow-card">
                    {busy[v.id] && <li className="px-3 py-1.5 text-sap-muted">Searching…</li>}
                    {!busy[v.id] && !(hits[v.id]?.length) && <li className="px-3 py-1.5 text-sap-muted">No vendor-master match. The name you typed is saved as it is.</li>}
                    {(hits[v.id] ?? []).map((h, i) => (
                      <li key={h.lifnr + '|' + i} role="option" aria-selected={false} className="cursor-pointer px-3 py-1.5 hover:bg-plum-soft"
                        onMouseDown={(e) => { e.preventDefault(); onPatch(v.id, { name: h.name, lifnr: h.lifnr }); setHits((s) => ({ ...s, [v.id]: [] })); setOpenId(''); }}>
                        {h.name}{h.lifnr && <span className="ml-2 text-[10.5px] text-sap-muted">{h.lifnr}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="border-b border-sap-line px-3 py-2"><Input className="w-full text-right" type="number" inputMode="decimal" min="0" aria-label="Quote" value={v.quote} onChange={(e) => onPatch(v.id, { quote: e.target.value })} /></td>
              <td className="border-b border-sap-line px-3 py-2"><Input className="w-full text-right" type="number" inputMode="numeric" min="0" aria-label="Delivery days" value={v.deliveryDays} onChange={(e) => onPatch(v.id, { deliveryDays: e.target.value })} /></td>
              <td className="border-b border-sap-line px-3 py-2 text-center"><input type="radio" name="vendorSelect" aria-label={`Select ${v.name || 'vendor'}`} checked={v.selected} onChange={() => onSelect(v.id)} /></td>
              <td className="border-b border-sap-line px-3 py-2 text-center"><Button variant="danger" aria-label="Remove vendor" className="!px-2" onClick={() => onRemove(v.id)}>{'×'}</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
