'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { inputCls } from './ui';

/** Policy-year selector for the year-based master tables. */
export default function YearBar({ year, onChange, label = 'Policy year' }: { year: string; onChange: (y: string) => void; label?: string }) {
  const step = (d: number) => {
    const n = Number(year);
    if (n) onChange(String(n + d));
  };
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="field-label !mb-0">{label}</span>
      <button type="button" className="btn-ghost !p-1.5" onClick={() => step(-1)} aria-label="Previous year"><ChevronLeft size={14} /></button>
      <input className={`${inputCls()} !w-20 text-center font-bold`} value={year} maxLength={4} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} aria-label={label} />
      <button type="button" className="btn-ghost !p-1.5" onClick={() => step(1)} aria-label="Next year"><ChevronRight size={14} /></button>
    </div>
  );
}
