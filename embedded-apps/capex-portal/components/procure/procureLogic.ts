/** Pure logic for CWIP create, PO list/detail, GRN list (ported from CWIPCreate/POList/PODetail/GRNList/ICList controllers). */
import type { GRN, InstallCert, PurchaseOrder } from '@/lib/entities';
import { isStatus } from '@/lib/format';

export const isFlag = (v: unknown) => v === 'X' || v === true;
const has = (hay: string | undefined, needle: string) => (hay || '').toLowerCase().includes(needle.toLowerCase());

/** SAP CreateCWIP now accepts AssetDesc (log #77) - stored in its own table, ZCAPEX_CWPX (built on
 * EDSK9B0EO7), not a CWIP header field, so it doesn't appear as a CWIP property in $metadata; it
 * round-trips back via the same table when a CWIP is re-read. docs/metadata.live.xml predates this
 * (2026-11-24) and does not list it - that snapshot is stale, not the live service. */
export const CREATE_CWIP_HAS_ASSET_DESC = true;

/** CWIPCreate: no backend picklist for these (log #50 / Component.js), kept as in Fiori. */
export const EXEC_PROCESSES = [
  { key: 'TURNKEY', text: 'Turnkey (Supply + Install + Commission)' },
  { key: 'SUPPLY', text: 'Supply Only' },
  { key: 'SI', text: 'Supply & Installation' },
  { key: 'SERVICE', text: 'Service / AMC' },
];

/** CWIPCreate._suggestAssetClass. */
export function suggestAssetClass(capexType: string | undefined): string {
  const map: Record<string, string> = { MANUFACTURING: '3000', MOULDS: '3100', IT: '4000' };
  return map[(capexType || '').toUpperCase()] || '3000';
}

export interface AssetClassOption { key: string; text: string }

/** Asset class code AssetClass param is MaxLength 8 on CreateCWIP (log #50): typed codes are cut to it. */
export const ASSET_CLASS_MAX = 8;

/** Select-or-type: filter by code OR text (log #92/#54). */
export function filterAssetClasses(opts: AssetClassOption[], query: string): AssetClassOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return opts;
  return opts.filter((o) => o.key.toLowerCase().includes(q) || o.text.toLowerCase().includes(q));
}

/** A ValueHelp row's display text with the code stripped, e.g. "3000 - Plant & Machinery" -> "Plant & Machinery". */
export function assetClassDesc(opt: AssetClassOption | undefined): string {
  if (!opt) return '';
  const t = opt.text.trim();
  const m = new RegExp('^' + opt.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[-—–:]\\s*(.*)$').exec(t);
  return (m ? m[1] : t).slice(0, 50);
}

export interface CwipDraft {
  assetClass: string; assetDesc: string; costCenter: string; profitCenter: string;
  executionProcess: string; timeframeWeeks: string; paymentTerms: string; remarks: string;
}

/** CWIPCreate._validate, same messages. */
export function validateCwip(d: CwipDraft): { errors: string[]; fields: Partial<Record<keyof CwipDraft, string>> } {
  const errors: string[] = [];
  const fields: Partial<Record<keyof CwipDraft, string>> = {};
  if (!d.assetClass.trim()) { errors.push('Asset class is required.'); fields.assetClass = 'Required'; }
  if (!d.costCenter.trim()) { errors.push('Cost center is required.'); fields.costCenter = 'Required'; }
  if (!d.timeframeWeeks || Number(d.timeframeWeeks) <= 0) { errors.push('Execution timeframe is required.'); fields.timeframeWeeks = 'Required'; }
  if (!d.paymentTerms || d.paymentTerms.trim().length < 15) { errors.push('Payment terms are required (at least 15 characters).'); fields.paymentTerms = 'At least 15 characters'; }
  return { errors, fields };
}

/** CreateCWIP params (exact names from $metadata). AssetDesc only when the service declares it. */
export function buildCreateCwipParams(cpeId: string, d: CwipDraft, supportsAssetDesc = CREATE_CWIP_HAS_ASSET_DESC): Record<string, string | number> {
  const p: Record<string, string | number> = {
    CpeId: cpeId,
    AssetClass: d.assetClass.trim().slice(0, ASSET_CLASS_MAX),
    CostCenter: d.costCenter.trim(),
    WbsElement: '',
    PaymentTerms: d.paymentTerms,
    TimeframeWeeks: Number(d.timeframeWeeks),
    ExecProcess: d.executionProcess,
    ProfitCenter: d.profitCenter,
    Remarks: d.remarks,
  };
  if (supportsAssetDesc) p.AssetDesc = d.assetDesc;
  return p;
}

// ------------------------------------------------------------------ PO / GRN lists

export interface PoFilter { q: string; plant: string; grn: '' | 'YES' | 'NO' }

/** POList.onFilter: search PO number / vendor / title (contains), plant, GRN posted. */
export function filterPOs(rows: PurchaseOrder[], f: PoFilter): PurchaseOrder[] {
  return rows.filter((r) => {
    if (f.q && !(has(r.Ebeln, f.q) || has(r.Vendorname, f.q) || has(r.Title, f.q))) return false;
    if (f.plant && r.Werks !== f.plant) return false;
    if (f.grn === 'YES' && !isFlag(r.GrnPosted)) return false;
    if (f.grn === 'NO' && isFlag(r.GrnPosted)) return false;
    return true;
  });
}

/** GRNList.onFilter: search GRN (material doc) / PO / title, plant. */
export function filterGRNs(rows: GRN[], f: { q: string; plant: string }): GRN[] {
  return rows.filter((r) => {
    if (f.q && !(has(r.Mblnr, f.q) || has(r.Ebeln, f.q) || has(r.Title, f.q))) return false;
    if (f.plant && r.Werks !== f.plant) return false;
    return true;
  });
}

/** PODetail: ConfirmPO is offered while the PO is PENDING (prefix-safe). */
export const isPoPending = (status: string | undefined) => isStatus(status, 'PENDING');

/** ICList.onCreate: POs with a posted GRN whose CPE has no IC yet. */
export function icEligiblePOs(pos: PurchaseOrder[], ics: Pick<InstallCert, 'Cpeid'>[]): PurchaseOrder[] {
  const done = new Set(ics.map((i) => i.Cpeid));
  return pos.filter((p) => isFlag(p.GrnPosted) && p.Cpeid && !done.has(p.Cpeid));
}

/** Plant options for a dropdown: the person's plants, else (global user) whatever plants the loaded rows carry. */
export function plantOptions(sessionPlants: { code: string; name: string }[], rows: { Werks: string; PlantName?: string }[]): { code: string; name: string }[] {
  if (sessionPlants.length) return sessionPlants;
  const m = new Map<string, string>();
  rows.forEach((r) => { if (r.Werks && !m.has(r.Werks)) m.set(r.Werks, r.PlantName || r.Werks); });
  return [...m.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code));
}
