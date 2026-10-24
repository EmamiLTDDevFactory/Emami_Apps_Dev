/**
 * Rate source coverage (tab "Rate coverage"), leaf rows only:
 *  - per source: components with a rate from it (from the rate options) and the share of leaf rows that use it;
 *  - "MBEW only": leaf rows whose only source is MBEW (SrcCount = 1 and SelSource = MBEW), grouped by component;
 *  - "Source outside priority": lines where SrcCount > the number of priority sources that have a rate, with the
 *    source(s) outside the priority named and their best rate;
 *  - donor rows: lines costed from a donor plant (Donor set).
 */
import { D, type Decimal } from '../cost/decimal';
import { isLeafRow } from '../cost/tree';
import type { CostLine } from '../sap/fields';
import { ALL_RATE_SOURCES, normalizePrio } from './priority';

type Line = CostLine & { RateOptions?: CostLine['RateOptions'] };

export interface SourceCoverage { source: string; components: number; usedLeaf: number; share: number }
export interface MbewOnlyGroup { idnrk: string; maktx: string; rows: { idx: number; hwerks: string; headmat: string; werks: string }[] }
export interface OutsidePrioLine { idx: number; line: Line; prioWithRate: number; unused: { source: string; ratePcInr: Decimal }[] }

export interface Coverage {
  leafRows: number;
  sources: SourceCoverage[];
  mbewOnly: MbewOnlyGroup[];
  outsidePrio: OutsidePrioLine[];
  donorRows: number;
  donorPlants: string[];
  optionsLoaded: boolean;
}

const bestBySource = (l: Line) => {
  const m = new Map<string, Decimal>();
  for (const o of l.RateOptions ?? []) {
    const r = D(o.RatePcInr);
    if (!r.gt(0)) continue;
    const prev = m.get(o.Source);
    if (!prev || r.lt(prev)) m.set(o.Source, r);
  }
  return m;
};

export function rateCoverage(lines: readonly Line[], prio: readonly string[], optionsLoaded: boolean): Coverage {
  const p = normalizePrio(prio);
  const leaf = lines.map((l, idx) => ({ l, idx })).filter(({ l }) => isLeafRow(l));
  const extra = new Set<string>();
  const comps = new Map<string, Set<string>>();
  const used = new Map<string, number>();
  const mbew = new Map<string, MbewOnlyGroup>();
  const outside: OutsidePrioLine[] = [];
  const donors = new Set<string>();
  let donorRows = 0;
  for (const { l, idx } of leaf) {
    if (l.Donor) { donorRows++; donors.add(l.Donor); }
    if (l.SelSource) used.set(l.SelSource, (used.get(l.SelSource) ?? 0) + 1);
    if (Number(l.SrcCount ?? 0) === 1 && l.SelSource === 'MBEW') {
      const g = mbew.get(l.Idnrk) ?? { idnrk: l.Idnrk, maktx: l.Maktx, rows: [] };
      g.rows.push({ idx, hwerks: l.Hwerks, headmat: l.Headmat, werks: l.Werks });
      mbew.set(l.Idnrk, g);
    }
    if (!optionsLoaded) continue;
    const best = bestBySource(l);
    for (const s of best.keys()) {
      if (!ALL_RATE_SOURCES.includes(s)) extra.add(s);
      const set = comps.get(s) ?? new Set<string>();
      set.add(`${l.Idnrk}|${l.Werks}`);
      comps.set(s, set);
    }
    const prioWithRate = [...best.keys()].filter((s) => p.includes(s)).length;
    if (p.length && Number(l.SrcCount ?? 0) > prioWithRate) {
      const unused = [...best.entries()].filter(([s]) => !p.includes(s)).map(([source, ratePcInr]) => ({ source, ratePcInr }));
      if (unused.length) outside.push({ idx, line: l, prioWithRate, unused });
    }
  }
  const n = leaf.length;
  const sources = [...ALL_RATE_SOURCES, ...[...extra].sort()].map((source) => ({
    source,
    components: comps.get(source)?.size ?? 0,
    usedLeaf: used.get(source) ?? 0,
    share: n ? (used.get(source) ?? 0) / n : 0,
  }));
  return { leafRows: n, sources, mbewOnly: [...mbew.values()].sort((a, b) => b.rows.length - a.rows.length || a.idnrk.localeCompare(b.idnrk)), outsidePrio: outside, donorRows, donorPlants: [...donors].sort(), optionsLoaded };
}

export const MBEW_ONLY_HINT = 'Only a C-MAP (MBEW) rate: no contract / info record / market / consumption rate in the look-back window. Try a donor plant or a longer look-back.';
