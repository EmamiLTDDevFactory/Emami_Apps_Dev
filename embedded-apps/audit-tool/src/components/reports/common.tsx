'use client';

// Helpers shared by the three report screens ported from the Fiori app's AuditStatus, MISReport
// and DraftReport controllers (src/app/mis/audit-status, src/app/mis/report,
// src/app/ars/draft-report).
import React, { useEffect, useState } from 'react';
import type { Option } from '../ui';

/** The Fiori controllers' dedupe idiom, reproduced literally:
 *   Object.values(rows.reduce((acc, cur) => Object.assign(acc, {[cur[key]]: cur}), {}))
 * Last row per key wins, and — because it goes through a plain object — integer-like keys
 * (e.g. financial years "2024", "2025") come out in ascending numeric order ahead of the rest,
 * exactly as in the source. Rows are deep-copied first, like the source's JSON round-trip. */
export function fioriDedupe<T extends Record<string, any>>(rows: T[], key: string): T[] {
  const copy: T[] = JSON.parse(JSON.stringify(rows));
  return Object.values(copy.reduce((acc: Record<string, T>, cur) => Object.assign(acc, { [cur[key]]: cur }), {}));
}

/** sap.m.Select items bound to a list of objects: key and text are the same property. Empty
 * values are kept (the source appends an explicit "" entry to most lists). */
export function toOptions(rows: Record<string, any>[], key: string): Option[] {
  return rows.map((r) => {
    const v = r[key] === undefined || r[key] === null ? '' : String(r[key]);
    return { key: v, text: v };
  });
}

/** forceSelection="true": when the current key isn't among the options, the first one is taken. */
export function forceSelect(current: string, options: Option[]): string {
  if (options.some((o) => o.key === current)) return current;
  return options.length > 0 ? options[0].key : '';
}

/** The ticking time/date the Fiori screen headers show (handleTimeEvent). */
export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return null;
  return (
    <span className="whitespace-nowrap text-[12px] font-semibold text-inkSoft">
      {now.toLocaleTimeString()} &nbsp; {now.toDateString()}
    </span>
  );
}

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  width = '13rem',
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (key: string) => void;
  width?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1" style={{ width }}>
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {!options.some((o) => o.key === value) && <option value={value}>{value}</option>}
        {options.map((o, i) => (
          <option key={`${o.key}-${i}`} value={o.key}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );
}
