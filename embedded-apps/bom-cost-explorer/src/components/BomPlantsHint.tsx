'use client';
/** BOM costing: under the materials, the plants SAP has a BOM for (click a plant to add it to the plant field). */
import { useEffect, useMemo, useState } from 'react';
import { Factory } from 'lucide-react';
import { loadBomPlants, type BomPlant } from '@/lib/client/bomPlants';
import { cx } from './ui';

export default function BomPlantsHint({ materials, selected, single, onPick }: { materials: string[]; selected: string[]; single?: boolean; onPick: (plants: string[]) => void }) {
  const [rows, setRows] = useState<BomPlant[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [note, setNote] = useState('');
  const key = useMemo(() => [...new Set(materials.map((m) => m.trim().toUpperCase()).filter(Boolean))].sort().join(','), [materials]);
  useEffect(() => {
    if (!key) { setRows(null); setState('idle'); return; }
    const c = new AbortController();
    setState('loading'); setNote('');
    const t = setTimeout(() => {
      loadBomPlants(key.split(','), { signal: c.signal })
        .then((r) => { if (!c.signal.aborted) { setRows(r); setState('idle'); } })
        .catch((e) => { if (!c.signal.aborted) { setRows(null); setState('error'); setNote(e instanceof Error ? e.message : 'not available'); } });
    }, 400);
    return () => { clearTimeout(t); c.abort(); };
  }, [key]);
  if (!key) return null;
  const n = key.split(',').length;
  if (state === 'loading') return <p className="mt-2 text-[11.5px] text-muted">Looking up the plants that have a BOM…</p>;
  if (state === 'error') return <p className="mt-2 text-[11.5px] text-muted" title={note}>The plants with a BOM are not available from this SAP system yet.</p>;
  if (!rows) return null;
  if (!rows.length) return <p className="mt-2 text-[11.5px] font-semibold text-warn">SAP has no BOM for {n === 1 ? 'this material' : 'these materials'} in any plant you can see.</p>;
  const add = (w: string) => onPick(single ? [w] : selected.includes(w) ? selected : [...selected, w]);
  return (
    <div className="mt-2 rounded-xl border border-line bg-sunken/40 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold text-ink"><Factory size={12} className="text-accent" /> BOM exists in these plants (click to select)</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((p) => {
          const on = selected.includes(p.werks);
          const all = p.materials.length === n;
          return (
            <button key={p.werks} type="button" onClick={() => add(p.werks)} aria-pressed={on}
              title={`${p.name}: BOM of ${p.materials.join(', ')} (${p.alternatives} alternative${p.alternatives === 1 ? '' : 's'})`}
              className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold transition', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-ink hover:border-accent hover:bg-accent/10')}>
              <span className="font-mono">{p.werks}</span> <span className={cx('font-normal', on ? 'text-white/80' : 'text-muted')}>{p.name}</span>
              {n > 1 && <span className={cx('ml-1 rounded-full px-1.5 text-2xs', all ? 'bg-good/20 text-good' : 'bg-warn/20 text-warn')}>{p.materials.length}/{n}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
