'use client';
import { useEffect, useMemo, useState } from 'react';
import { loadMgmt, mgmtBrand, mgmtProduct, type MgmtData } from './mgmtNames';
import { EMPTY_NAMES, loadHierNames, withName, type HierNames } from './hierNames';

/** Labels with the SAP description for brand and product codes (the code alone until / unless SAP answers). */
export function useHierNames() {
  const [names, setNames] = useState<HierNames>(EMPTY_NAMES);
  const [mgmt, setMgmt] = useState<MgmtData | null>(null);
  useEffect(() => { let on = true; void loadHierNames().then((n) => { if (on) setNames(n); }); void loadMgmt().then((m) => { if (on) setMgmt(m); }); return () => { on = false; }; }, []);
  return useMemo(() => {
    // SAP description (or the management name where the workbook has one); a code SAP gave no text for still gets the management name
    const brandMap = (code: string) => names.brand.get((code ?? '').trim()) ?? mgmtBrand(mgmt, code);
    const productMap = (code: string) => names.product.get((code ?? '').trim()) ?? mgmtProduct(mgmt, code);
    const nm = (f: (c: string) => string | undefined, code: string) => { const c = (code ?? '').trim(); if (!c) return ''; const d = f(c); return d ? `${d} (${c})` : c; };
    return {
      brand: (code: string) => nm(brandMap, code),
      product: (code: string) => nm(productMap, code),
      brandList: [...names.brand].map(([code, descr]) => ({ code, descr })).sort((a, b) => a.descr.localeCompare(b.descr)),
      productList: [...names.product].map(([code, descr]) => ({ code, descr })).sort((a, b) => a.descr.localeCompare(b.descr)),
    };
  }, [names, mgmt]);
}

/** The management name data (null until loaded, or when switched off). */
export function useMgmt(): MgmtData | null {
  const [d, setD] = useState<MgmtData | null>(null);
  useEffect(() => { let on = true; void loadMgmt().then((x) => { if (on) setD(x); }); return () => { on = false; }; }, []);
  return d;
}
