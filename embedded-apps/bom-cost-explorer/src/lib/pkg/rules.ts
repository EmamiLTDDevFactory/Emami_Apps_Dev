/** Pure rules of the packing material budget rate screens: formats, status / flag meaning, grouping, KPIs, compare, edit payloads and validation.
 *  SAP does the costing; nothing here recalculates a rate. Sums and averages of SAP numbers go through decimal.js. */
import Decimal from 'decimal.js';
import type { EditLevel, EditRule, NewScenarioForm, PkgActionBody, PkgGroup, PkgItem, PkgScen, PkgStatus } from './types';

export const EPS = 1e-9;
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const stripZeros = (m: string) => (/^\d+$/.test(m) ? m.replace(/^0+(?=\d)/, '') : m);
export const padScen = (id: string) => (/^\d+$/.test(id) ? id.padStart(10, '0') : id);
export const NO_SCEN = '0000000000';

// ---- formats (en-IN) -------------------------------------------------------------------------------------------------
const nf = (dp: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtRate4 = (n: number) => nf(4).format(n);
export const fmtPct3 = (n: number) => nf(3).format(n);
export const fmtVar2 = (n: number) => `${nf(2).format(n)}%`;
export const fmtSigned3 = (n: number) => `${n > 0 ? '+' : ''}${nf(3).format(n)}`;
export const fmtInt = (n: number) => new Intl.NumberFormat('en-IN').format(n);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** SAP / OData date (/Date(ms)/, YYYYMMDD or ISO) -> YYYY-MM-DD ('' when none). */
export function isoDate(v: unknown): string {
  const s = String(v ?? '').trim();
  const ms = /^\/Date\((-?\d+)/.exec(s);
  if (ms) { const d = new Date(Number(ms[1])); return d.getTime() ? d.toISOString().slice(0, 10) : ''; }
  if (/^\d{8}$/.test(s)) return s === '00000000' ? '' : `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) && !s.startsWith('0000') ? s.slice(0, 10) : '';
}
/** YYYY-MM-DD -> dd-MMM-yyyy. */
export const showDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}-${MON[Number(m[2]) - 1]}-${m[1]}` : iso || '—'; };
/** Edm.Time (PT10H30M00S) or HH:MM:SS -> HH:MM:SS. */
export function timeText(v: unknown): string {
  const s = String(v ?? '');
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => String(x ?? 0).padStart(2, '0')).join(':');
  return s;
}

// ---- status and permissions -------------------------------------------------------------------------------------------
export const STATUS_META: Record<PkgStatus, { label: string; cls: string }> = {
  D: { label: 'Draft - recalculate', cls: 'bg-warn/10 text-warn ring-warn/30' },
  C: { label: 'Calculated', cls: 'bg-accent/10 text-accent ring-accent/30' },
  S: { label: 'Submitted', cls: 'bg-purple-500/10 text-purple-600 ring-purple-500/30' },
  F: { label: 'Final', cls: 'bg-good/10 text-good ring-good/30' },
  X: { label: 'Superseded', cls: 'bg-sunken text-muted ring-line' },
};
export const statusOf = (s: string): PkgStatus => (s in STATUS_META ? (s as PkgStatus) : 'D');
export const canEdit = (s: string) => s === 'D' || s === 'C';
export const canRecalc = (s: string) => s === 'D';
export const canSubmit = (s: string) => s === 'C';
export const canFinalise = (s: string) => s === 'C' || s === 'S';
export const canReopen = (s: string) => s === 'F';
export const canDelete = (s: string) => s !== 'F';

export const SRC_META: Record<string, string> = {
  CONTRACT: 'bg-green-500/15 text-green-700', INFOREC: 'bg-yellow-500/20 text-yellow-700', MARKT: 'bg-cyan-500/15 text-cyan-700',
  CONSUMP: 'bg-orange-500/15 text-orange-700', MBEW: 'bg-red-500/15 text-red-700',
};
// Packing material rate sources (spec): info record, then consumption, then MBEW. CONTRACT / MARKT are not used for PKGN / VERP.
export const PRIO_DEFAULT = ['INFOREC', 'CONSUMP', 'MBEW'];
export const PRIO_ALL = ['INFOREC', 'CONSUMP', 'MBEW'];

// ---- flags -----------------------------------------------------------------------------------------------------------
export const BLOCKING = ['NOBOM', 'PCT100', 'NORATE'] as const;
export const WARNING = ['NOZBUD', 'DUP', 'NOFRT'] as const;
export const parseFlags = (s: string) => Array.from(new Set(String(s ?? '').split(/[\s,;|]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)));
export const isBlockingFlag = (f: string) => (BLOCKING as readonly string[]).includes(f);
export const blocked = (h: Pick<PkgItem, 'MsgFlags'>) => parseFlags(h.MsgFlags).some(isBlockingFlag);
export const warned = (h: Pick<PkgItem, 'MsgFlags'>) => { const f = parseFlags(h.MsgFlags); return f.length > 0 && !f.some(isBlockingFlag); };
export const changed = (used: number, sap: number) => Math.abs(used - sap) > EPS;

export function flagHint(flag: string, g: PkgGroup): string {
  const total = g.comps.reduce((s, c) => s.plus(String(c.PctUsed)), new Decimal(0));
  switch (flag) {
    case 'NOBOM': return `No ZBUD material or BOM for group ${g.head.Matkl || '—'}`;
    case 'PCT100': return `BOM % total is ${fmtPct3(total.toNumber())}, must be 100`;
    case 'NORATE': return 'No valid ZBAS rate on key date';
    case 'NOZBUD': return 'No ZBUD condition, 0 % used';
    case 'DUP': return 'Overlapping ZBUD records';
    case 'NOFRT': return 'No freight rate found for material + plant';
    default: return '';
  }
}

// ---- grouping, KPIs, compare -----------------------------------------------------------------------------------------
/** Header rows (Idnrk = '') with their component rows, in the order SAP returned them. */
export function groupItems(items: PkgItem[]): PkgGroup[] {
  const by = new Map<string, PkgGroup>();
  const orphans = new Map<string, PkgItem[]>();
  for (const it of items) {
    if (!it.Idnrk) { by.set(it.Matnr, { head: it, comps: orphans.get(it.Matnr) ?? [] }); continue; }
    const g = by.get(it.Matnr);
    if (g) g.comps.push(it); else orphans.set(it.Matnr, [...(orphans.get(it.Matnr) ?? []), it]);
  }
  return Array.from(by.values());
}

export const groupOverridden = (g: PkgGroup) =>
  changed(g.head.BasicRateUsed, g.head.BasicRateSap) || g.comps.some((c) => changed(c.PctUsed, c.PctSap) || changed(c.ZbudUsed, c.ZbudSap));

export interface Kpis { materials: number; blocked: number; warnings: number; avgVarPct: number | null; overridden: number }
export function kpis(groups: PkgGroup[]): Kpis {
  const ok = groups.filter((g) => !blocked(g.head));
  const avg = ok.length ? ok.reduce((s, g) => s.plus(String(g.head.VariancePct)), new Decimal(0)).div(ok.length).toNumber() : null;
  return { materials: groups.length, blocked: groups.length - ok.length, warnings: groups.filter((g) => warned(g.head)).length, avgVarPct: avg, overridden: groups.filter(groupOverridden).length };
}

export interface CompareRow {
  Matnr: string; Maktx: string; basicThis: number; budThis: number; varThis: number;
  basicOther: number | null; budOther: number | null; varOther: number | null; delta: number | null;
}
const varPct = (bud: number, basic: number) => (basic ? new Decimal(String(bud)).minus(String(basic)).div(String(basic)).times(100).toNumber() : 0);
/** `other` null = baseline: pure SAP data of the same scenario (BasicRateSap / BudgetRateSap). */
export function compareRows(mine: PkgGroup[], other: PkgGroup[] | null): CompareRow[] {
  const om = new Map((other ?? []).map((g) => [g.head.Matnr, g.head]));
  return mine.map(({ head: h }) => {
    const o = other ? om.get(h.Matnr) : null;
    const base = other ? null : { basic: h.BasicRateSap, bud: h.BudgetRateSap, v: varPct(h.BudgetRateSap, h.BasicRateSap) };
    const ob = o ? { basic: o.BasicRateUsed, bud: o.BudgetRate, v: o.VariancePct } : base;
    return {
      Matnr: h.Matnr, Maktx: h.Maktx, basicThis: h.BasicRateUsed, budThis: h.BudgetRate, varThis: h.VariancePct,
      basicOther: ob?.basic ?? null, budOther: ob?.bud ?? null, varOther: ob?.v ?? null,
      delta: ob ? new Decimal(String(h.BudgetRate)).minus(String(ob.bud)).toNumber() : null,
    };
  });
}

export const finaliseCounts = (groups: PkgGroup[]) => { const m = groups.filter((g) => blocked(g.head)).length; return { n: groups.length - m, m }; };
export const finaliseTarget = (werks: string) => (werks === 'HO00' || !werks ? 'ZCOMPONENT (India)' : `ZCOMPONENT (plant ${werks})`);

// ---- edits ------------------------------------------------------------------------------------------------------------
export type RuleKey = 'set' | 'inc' | 'dec' | 'add' | 'sub';
export const RULE_LABEL: Record<RuleKey, string> = { set: 'Set to', inc: 'Increase by %', dec: 'Decrease by %', add: 'Add amount', sub: 'Subtract amount' };
// BOM % (P) can never be overridden (spec): only the basic rate and the ZBUD factor are editable.
export const LEVEL_LABEL: Record<EditLevel, string> = { R: 'Basic rate', Z: 'ZBUD %', P: 'BOM component %' };
export const EDIT_LEVELS: EditLevel[] = ['R', 'Z'];
export const LEVEL_NAME: Record<string, string> = { R: 'Basic rate', Z: 'ZBUD', P: 'BOM %' };
export const RULE_NAME: Record<string, string> = { S: 'Set', P: 'Percent', A: 'Absolute', V: 'Revert to SAP' };

/** set -> S, +v; increase % -> P, +v; decrease % -> P, -v; add -> A, +v; subtract -> A, -v. */
export function ruleToApi(rule: RuleKey, value: number): { rule: EditRule; value: string } {
  const v = Math.abs(value);
  switch (rule) {
    case 'set': return { rule: 'S', value: String(value) };
    case 'inc': return { rule: 'P', value: String(v) };
    case 'dec': return { rule: 'P', value: String(-v) };
    case 'add': return { rule: 'A', value: String(v) };
    case 'sub': return { rule: 'A', value: String(-v) };
  }
}

/** A typed number: not empty, not NaN. ZBUD may be negative; a basic rate or a BOM % may not. */
export function validateValue(raw: string, level: EditLevel, rule: RuleKey = 'set'): string {
  const t = String(raw ?? '').replace(/,/g, '').trim();
  if (t === '') return 'Enter a number';
  const n = Number(t);
  if (!Number.isFinite(n)) return 'Enter a valid number';
  if (rule === 'set' && level !== 'Z' && n < 0) return level === 'P' ? '% must be 0 or more' : 'Rate must be 0 or more';
  return '';
}
export const parseValue = (raw: string) => Number(String(raw).replace(/,/g, '').trim());

export type ScopeKind = 'filter' | 'selected' | 'matkl' | 'component';
export interface ScopeCtx { visible: string[]; filterActive: boolean; selected: string[]; matkl: string; idnrk: string }
export function resolveScope(kind: ScopeKind, c: ScopeCtx): Pick<PkgActionBody, 'scopeMatnr' | 'scopeMatkl' | 'scopeIdnrk'> {
  if (kind === 'filter') return c.filterActive ? { scopeMatnr: c.visible.join(',') } : {};
  if (kind === 'selected') return { scopeMatnr: c.selected.join(',') };
  if (kind === 'matkl') return { scopeMatkl: c.matkl.trim().toUpperCase() };
  return { scopeIdnrk: c.idnrk.trim().toUpperCase() };
}

// ---- new scenario -----------------------------------------------------------------------------------------------------
export function newScenarioDefaults(from = ''): NewScenarioForm {
  return { werks: 'HO00', descr: '', validFrom: from, validTo: '', keyDate: '', budgetVersion: '', mtart: ['PKGN', 'VERP'], matkl: '', matnr: '', prio: [...PRIO_DEFAULT], norm: false };
}
export function validateNewScenario(f: NewScenarioForm): Partial<Record<keyof NewScenarioForm, string>> {
  const e: Partial<Record<keyof NewScenarioForm, string>> = {};
  if (!f.descr.trim()) e.descr = 'Enter a description';
  if (f.werks.trim() && !/^[A-Za-z0-9]{4}$/.test(f.werks.trim())) e.werks = 'Plant is 4 characters';
  if (!f.validFrom) e.validFrom = 'Validity from is required';
  if (!f.validTo) e.validTo = 'Validity to is required';
  if (f.validFrom && f.validTo && f.validTo < f.validFrom) e.validTo = 'Validity to must not be before from';
  if (f.budgetVersion.trim() && !/^[1-9]\d{0,2}$/.test(f.budgetVersion.trim())) e.budgetVersion = 'Version must be a whole number';
  if (!f.mtart.length) e.mtart = 'Choose at least one material type';
  if (!f.prio.length) e.prio = 'Keep at least one rate source';
  return e;
}
const list = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))).join(',');
export function createBody(f: NewScenarioForm): PkgActionBody {
  return {
    action: 'CREATE', werks: f.werks.trim().toUpperCase() || 'HO00', descr: f.descr.trim(), validFrom: f.validFrom, validTo: f.validTo, keyDate: f.keyDate || f.validFrom,
    ...(f.budgetVersion.trim() ? { budgetVersion: Number(f.budgetVersion) } : {}),
    mtartSel: f.mtart.join(','), matklSel: list(f.matkl), matnrSel: list(f.matnr), prio: f.prio.join(','), norm: f.norm ? 'X' : '',
  };
}

export const scenLabel = (s: PkgScen) => `v${s.BudgetVersion} #${stripZeros(s.ScenId)} ${s.Descr} - ${STATUS_META[statusOf(s.Status)].label}`;

// ---- why a material has no rate ---------------------------------------------------------------------------------------
export interface RateWindow { RateSrc: string; CondType: string; Vendor: string; ValidFrom: string; ValidTo: string }
/** Where a rate's validity (YYYYMMDD from / to) lies against the scenario key date (YYYY-MM-DD). */
export function windowVerdict(w: Pick<RateWindow, 'ValidFrom' | 'ValidTo'>, keyDate: string): { ok: boolean; text: string } {
  const k = keyDate.replace(/-/g, '');
  const days = (a: string, b: string) => Math.round((Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8)) - Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8))) / 86400000);
  if (!/^\d{8}$/.test(k) || !/^\d{8}$/.test(w.ValidFrom)) return { ok: false, text: 'validity unknown' };
  if (k < w.ValidFrom) return { ok: false, text: `starts ${days(w.ValidFrom, k)} day(s) after the key date` };
  if (/^\d{8}$/.test(w.ValidTo) && k > w.ValidTo) return { ok: false, text: `ended ${days(k, w.ValidTo)} day(s) before the key date` };
  return { ok: true, text: 'valid on the key date' };
}
