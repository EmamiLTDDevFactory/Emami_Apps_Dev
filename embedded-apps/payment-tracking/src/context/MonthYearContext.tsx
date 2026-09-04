import React, { createContext, useContext, useState } from 'react';

export const MONTH_OPTIONS = [
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

const CURRENT_YEAR = new Date().getFullYear();
export const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i));
const CURRENT_MONTH_VALUE = String(new Date().getMonth() + 1).padStart(2, '0');

interface MonthYearValue {
  month: string;
  year: string;
  setMonth: (m: string) => void;
  setYear: (y: string) => void;
}

const MonthYearContext = createContext<MonthYearValue>({
  month: CURRENT_MONTH_VALUE,
  year: String(CURRENT_YEAR),
  setMonth: () => {},
  setYear: () => {},
});

/** Per-app-wide Month/Year selection, shared across every Provision Tracking screen via
 * useMonthYear() — mounted once in _layout.tsx, same pattern as PaymentTrackingAuthProvider.
 *
 * IMPORTANT: this is UI state only, not wired into any SAP call. ZProvisionTrackSet doesn't expose
 * a live date field yet (AEDAT/ERDAT_SES are "recommended but NOT yet exposed" per
 * paymentTrackingApi.ts's own header comment), so there's nothing to filter by, server- or
 * client-side. The picker is visible everywhere per instruction, but every screen's data is
 * unaffected by month/year until SAP exposes a real date field — don't wire a $filter or a
 * client-side row filter off this until that's confirmed live. */
export function MonthYearProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = useState(CURRENT_MONTH_VALUE);
  const [year, setYear] = useState(String(CURRENT_YEAR));

  return (
    <MonthYearContext.Provider value={{ month, year, setMonth, setYear }}>
      {children}
    </MonthYearContext.Provider>
  );
}

export function useMonthYear(): MonthYearValue {
  return useContext(MonthYearContext);
}
