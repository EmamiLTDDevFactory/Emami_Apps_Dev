'use client';
/** The two icons of the BOM costing line drawer: Cost breakup (always) and Mould details (only when ZRIGID has a mould for the material). Display only. */
import { useEffect, useState } from 'react';
import { Factory, Layers } from 'lucide-react';
import { rigidMoulds } from '@/lib/rigid/service';
import { cx } from '../ui';

export type RigidPanel = 'cost' | 'mould' | null;

export default function RigidIcons({ matnr, active, onOpen }: { matnr: string; active: RigidPanel; onOpen: (p: RigidPanel) => void }) {
  const [moulds, setMoulds] = useState(0);
  useEffect(() => {
    let live = true; setMoulds(0);
    if (matnr) void rigidMoulds(matnr).then((n) => { if (live) setMoulds(n); });
    return () => { live = false; };
  }, [matnr]);
  const btn = 'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-2xs font-bold transition';
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" aria-label="Cost breakup (budget)" title="Cost breakup: the budget rate build-up of this material" onClick={() => onOpen(active === 'cost' ? null : 'cost')}
        className={cx(btn, active === 'cost' ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent hover:bg-accent/10')}><Layers size={13} aria-hidden /> Cost breakup</button>
      {moulds > 0 && (
        <button type="button" aria-label="Mould details (ZRIGID)" title={`Mould details: the ZRIGID rate of this rigid packing item (${moulds} mould${moulds === 1 ? '' : 's'})`} onClick={() => onOpen(active === 'mould' ? null : 'mould')}
          className={cx(btn, active === 'mould' ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent hover:bg-accent/10')}><Factory size={13} aria-hidden /> Mould details</button>
      )}
    </span>
  );
}
