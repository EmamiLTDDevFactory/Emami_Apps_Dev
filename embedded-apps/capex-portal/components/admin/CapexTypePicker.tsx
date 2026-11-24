'use client';
import { useState } from 'react';
import { Input, Select } from '@/components/ui';
import { searchOptions } from './doaLogic';

/** Capex type select with a search box that matches code or text (log #117). */
export default function CapexTypePicker({ options, value, onChange, allLabel }: { options: { key: string; text: string }[]; value: string; onChange: (k: string) => void; allLabel?: string }) {
  const [term, setTerm] = useState('');
  const shown = searchOptions(options, term);
  const withCurrent = value && !shown.some((o) => o.key === value) ? [...shown, ...options.filter((o) => o.key === value)] : shown;
  return (
    <div className="flex flex-col gap-1">
      <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search code or name" aria-label="Search capex type" />
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Capex type">
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {withCurrent.map((o) => <option key={o.key} value={o.key}>{o.text} ({o.key})</option>)}
      </Select>
    </div>
  );
}
