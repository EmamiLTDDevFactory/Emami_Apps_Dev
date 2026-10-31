'use client';
/** A bar of price strips for the finished goods a screen shows (first few, "show all" for more). Renders nothing with the switch off. */
import { useState } from 'react';
import PriceScope from './PriceScope';
import PriceStrip from './PriceStrip';
import { usePcApi } from '@/lib/price-context/context';
import { materialsOf, type Fg } from '@/lib/price-context/fgs';

const FIRST = 4;

function Bar({ fgs, costCurr }: { fgs: Fg[]; costCurr?: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? fgs : fgs.slice(0, FIRST);
  // Only the finished goods actually shown are priced (the first few, or all after "Show all").
  return (
    <PriceScope materials={materialsOf(shown)}>
    <div className="flex flex-col gap-1.5" role="group" aria-label="Price context of the finished goods shown">
      {shown.map((f) => (
        <div key={`${f.plant}|${f.matnr}`} className="flex flex-wrap items-start gap-2">
          <span className="w-44 shrink-0 truncate text-xs"><span className="font-mono font-bold text-accent">{f.matnr}</span>{f.text && <span className="text-muted"> {f.text}</span>}{f.plant && <span className="text-faint"> · {f.plant}</span>}</span>
          <PriceStrip matnr={f.matnr} plant={f.plant} costCurr={costCurr} />
        </div>
      ))}
      {fgs.length > FIRST && <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className="self-start text-xs font-bold text-accent underline">{all ? 'Show fewer' : `Show all ${fgs.length} finished goods`}</button>}
    </div>
    </PriceScope>
  );
}

export default function FgStrips({ fgs, costCurr = 'INR' }: { fgs: Fg[]; costCurr?: string }) {
  const { state, admin } = usePcApi();
  if (!admin || !state.on || !state.vkorg.length || !fgs.length) return null;
  return <Bar fgs={fgs} costCurr={costCurr} />;
}
