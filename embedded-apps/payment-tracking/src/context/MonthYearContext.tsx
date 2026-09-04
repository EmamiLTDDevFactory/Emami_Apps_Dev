import React, { createContext, useContext, useState } from 'react';

export const MONTH_OPTIONS = [
  { value: 'all', label: 'All Months' },
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

// Financial year starts April (matches ZPROVISIONTRACKS_GET_ENTITYSET's own lc_fy_start = 4) — a
// FY "value" is its starting calendar year (SAP's GJAHR), e.g. '2025' means Apr-2025..Mar-2026.
const FY_START_MONTH = 4;

function currentFyStartYear(): number {
  const now = new Date();
  const calendarMonth = now.getMonth() + 1; // 1-12
  return calendarMonth >= FY_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
}

export function fiscalYearLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`;
}

const CURRENT_FY_START_YEAR = currentFyStartYear();
export const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const fy = CURRENT_FY_START_YEAR - i;
  return { value: String(fy), label: fiscalYearLabel(fy) };
});
export const CURRENT_FY_LABEL = fiscalYearLabel(CURRENT_FY_START_YEAR);

interface MonthYearValue {
  /** '01'-'12' (calendar month) or 'all'. */
  month: string;
  /** GJAHR — the financial year's starting calendar year, e.g. '2025' for FY 2025-26. */
  year: string;
  setMonth: (m: string) => void;
  setYear: (y: string) => void;
}

const MonthYearContext = createContext<MonthYearValue>({
  month: 'all',
  year: String(CURRENT_FY_START_YEAR),
  setMonth: () => {},
  setYear: () => {},
});

/** Per-app-wide Month/Year selection, shared across every Provision Tracking screen via
 * useMonthYear() — mounted once in _layout.tsx, same pattern as PaymentTrackingAuthProvider.
 * `year` is sent to SAP as a Gjahr filter (ZProvisionTrackSet defaults to the current financial
 * year when Gjahr is omitted, so picking a different one is what actually changes which year's
 * data gets fetched); `month` narrows the already-fetched rows client-side by their Eindt
 * (delivery date) calendar month, same as every other Provision Filter dimension. */
export function MonthYearProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState(String(CURRENT_FY_START_YEAR));

  return (
    <MonthYearContext.Provider value={{ month, year, setMonth, setYear }}>
      {children}
    </MonthYearContext.Provider>
  );
}

export function useMonthYear(): MonthYearValue {
  return useContext(MonthYearContext);
}
