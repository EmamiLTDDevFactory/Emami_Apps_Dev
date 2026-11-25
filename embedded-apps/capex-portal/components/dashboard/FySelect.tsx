'use client';
import { fyLabel } from '@/lib/format';

/** Local fiscal-year picker (the Shell has none; Fiori had it in the app header, log #43). Options are the real years found in SAP data. */
export default function FySelect({ years, value, onChange, className = '' }: { years: string[]; value: string; onChange: (fy: string) => void; className?: string }) {
  return (
    <label className={`flex items-center gap-2 text-[11px] font-bold text-white/80 ${className}`}>
      Fiscal year
      <select aria-label="Fiscal year" value={value} onChange={(e) => onChange(e.target.value)} className="field !h-8 !w-auto !py-0 text-[12px] text-sap-ink">
        {years.length === 0 && <option value={value}>{fyLabel(value) || '-'}</option>}
        {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
      </select>
    </label>
  );
}
