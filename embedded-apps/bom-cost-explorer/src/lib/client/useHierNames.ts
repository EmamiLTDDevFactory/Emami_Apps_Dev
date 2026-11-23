'use client';
import { useEffect, useMemo, useState } from 'react';
import { loadMgmt, type MgmtData } from './mgmtNames';
import { EMPTY_NAMES, loadHierNames, withName, type HierNames } from './hierNames';

/** Labels with the SAP description for brand and product codes (the code alone until / unless SAP answers). */
export function useHierNames() {
  const [names, setNames] = useState<HierNames>(EMPTY_NAMES);
  useEffect(() => { let on = true; void loadHierNames().then((n) => { if (on) setNames(n); }); return () => { on = false; }; }, []);
  return useMemo(() => ({
    brand: (code: string) => withName(code, names.brand),
    product: (code: string) => withName(code, names.product),
    brandList: [...names.brand].map(([code, descr]) => ({ code, descr })).sort((a, b) => a.descr.localeCompare(b.descr)),
    productList: [...names.product].map(([code, descr]) => ({ code, descr })).sort((a, b) => a.descr.localeCompare(b.descr)),
  }), [names]);
}

/** The management name data (null until loaded, or when switched off). */
export function useMgmt(): MgmtData | null {
  const [d, setD] = useState<MgmtData | null>(null);
  useEffect(() => { let on = true; void loadMgmt().then((x) => { if (on) setD(x); }); return () => { on = false; }; }, []);
  return d;
}
