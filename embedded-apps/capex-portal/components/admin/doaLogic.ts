import type { DoaRule, DoaChain } from '@/lib/entities';
import { num } from '@/lib/format';

/** Matrix row shape (Component.js#mapDoaRuleEntity). amountTo null = no upper bound (SAP sends 0). */
export interface MatrixRule {
  id: string; capexType: string; capexTypeText: string;
  amountFrom: number; amountTo: number | null; rangeText: string;
  docType: string; active: boolean;
  chain: { role: string; approver: string; approverName: string; slaDays: number; mandatory: boolean }[];
}

/** DoaRuleSet?$expand=DoaRuleToChain row (OData v2 expands to { results: [...] }; Doctype is not in the live metadata yet). */
export type RawDoaRule = DoaRule & { Doctype?: string };

export function mapDoaRule(raw: RawDoaRule): MatrixRule {
  const e = raw.DoaRuleToChain as { results?: DoaChain[] } | DoaChain[] | undefined;
  const rows: DoaChain[] = Array.isArray(e) ? e : e?.results ?? [];
  const chain = rows.slice().sort((a, b) => String(a.Seqnr).localeCompare(String(b.Seqnr), undefined, { numeric: true }))
    .map((r) => ({ role: r.Role, approver: r.Approver, approverName: r.ApproverName, slaDays: num(r.SlaDays), mandatory: r.Mandatory === 'X' }));
  return {
    id: raw.Doaid, capexType: raw.Capextype, capexTypeText: raw.CapextypeText || raw.Capextype,
    amountFrom: num(raw.AmountFrom), amountTo: num(raw.AmountTo) || null, rangeText: raw.RangeText,
    docType: raw.Doctype || '', active: raw.Active === 'X', chain,
  };
}

export const totalSlaDays = (chain: { slaDays: number }[]): number => chain.reduce((s, r) => s + (Number(r.slaDays) || 0), 0);
export const formatTotalSla = (chain: { slaDays: number }[]): string => (chain.length ? `${totalSlaDays(chain)} days` : '-');

export const DOC_TYPES = [{ key: 'CPE', text: 'CPE' }, { key: 'BUD', text: 'Budget (CJN)' }];
export const docTypeLabel = (s: string): string => (s === 'CPE' ? 'CPE' : s === 'BUD' ? 'Budget (CJN)' : 'Any');

/** Matrix filter: a rule with no doc type ("Any") always stays visible; capex type filter is by code. */
export function filterMatrix(rules: MatrixRule[], docType: string, capexType: string): MatrixRule[] {
  return rules.filter((r) => (!docType || r.docType === docType || r.docType === '') && (!capexType || r.capexType === capexType));
}

/** Capex type picker options: ValueHelpSet rows of a capex-type domain, else derived from the rules themselves. */
export function capexTypeOptions(vh: { Domain: string; Keyval: string; Textval: string; Sortorder?: string }[], rules: MatrixRule[]): { key: string; text: string }[] {
  const fromVh = vh.filter((r) => /capex.?type/i.test(r.Domain))
    .sort((a, b) => String(a.Sortorder ?? '').localeCompare(String(b.Sortorder ?? '')))
    .map((r) => ({ key: r.Keyval, text: r.Textval || r.Keyval }));
  if (fromVh.length) return fromVh;
  const seen = new Map<string, string>();
  rules.forEach((r) => { if (r.capexType && r.capexType !== '*' && !seen.has(r.capexType)) seen.set(r.capexType, r.capexTypeText); });
  return [...seen].map(([key, text]) => ({ key, text }));
}

/** Combo-box style search by code or text (log #117). */
export const searchOptions = (opts: { key: string; text: string }[], term: string) => {
  const t = term.trim().toLowerCase();
  return t ? opts.filter((o) => o.key.toLowerCase().includes(t) || o.text.toLowerCase().includes(t)) : opts;
};

/** ConfigSet value as a number, or null when absent/blank (shows '-', #5/#95). */
export function cfgNumOrNull(config: Record<string, string>, param: string): number | null {
  const v = config[param];
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export const cfgFlagOrNull = (config: Record<string, string>, param: string): boolean | null => (config[param] === undefined ? null : config[param] === 'X');

/** QUOTA_YEAR_CAP_<WERKS> rows (Rev3 T10). */
export function plantCaps(config: Record<string, string>): { werks: string; cap: number }[] {
  return Object.keys(config).filter((k) => k.startsWith('QUOTA_YEAR_CAP_')).map((k) => ({ werks: k.slice('QUOTA_YEAR_CAP_'.length), cap: Number(config[k]) || 0 })).sort((a, b) => a.werks.localeCompare(b.werks));
}
