/**
 * Feature detection against the live service shape (docs/capexMeta.json is generated from docs/metadata.live.xml).
 * Rev3 T6 (SetCpeVendorCode) and T8 (ReviseCpeAmount) are in the Fiori source but NOT in the live metadata: while a
 * function import is absent the matching control stays hidden, never a guess (BaseController.hasFunctionImport).
 */
import meta from '@/docs/capexMeta.json';

const FUNCS = meta.functions as Record<string, { method: string; params: Record<string, string> }>;

export function hasFunctionImport(name: string, params: string[] = []): boolean {
  const f = FUNCS[name];
  return !!f && params.every((p) => p in f.params);
}

export const canSetVendorCode = () => hasFunctionImport('SetCpeVendorCode', ['CpeId', 'Lifnr']);
export const canReviseAmount = () => hasFunctionImport('ReviseCpeAmount', ['CpeId', 'NewAmount', 'Reason']);
