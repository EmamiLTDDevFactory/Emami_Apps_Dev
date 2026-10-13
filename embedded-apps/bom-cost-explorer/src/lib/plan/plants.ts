/**
 * Plans per plant. PlanHeadSet answers one row per plan AND plant; the plans page groups them by plan and
 * sums the plants' totals here (decimal.js). Totals add quantities of different materials, which can be
 * in different units (pieces, kg), so they are indicative only.
 *
 * Plan URL: /plan/view/?plan=<name>&werks=UN13&werks=UN14 (zero or more werks). A static export has no
 * dynamic /plan/[plan] route, so the plan is a query parameter too. Built with encodeURIComponent, never
 * URLSearchParams.toString() (that writes a space as "+").
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import type { PlanHead } from './fields';

export interface PlanPlant { werks: string; name: string; rows: number; total: Decimal }
export interface PlanGroup { plan: string; plants: PlanPlant[]; rows: number; total: Decimal }

export function groupPlanHeads(heads: PlanHead[]): PlanGroup[] {
  const by = new Map<string, PlanGroup>();
  for (const h of heads) {
    let g = by.get(h.Plan1);
    if (!g) by.set(h.Plan1, (g = { plan: h.Plan1, plants: [], rows: 0, total: ZERO }));
    const total = D(h.Total);
    g.plants.push({ werks: h.Werks, name: h.WerksTxt, rows: h.RowCnt, total });
    g.rows += h.RowCnt;
    g.total = g.total.plus(total);
  }
  for (const g of by.values()) g.plants.sort((a, b) => a.werks.localeCompare(b.werks));
  return [...by.values()].sort((a, b) => a.plan.localeCompare(b.plan));
}

/** Search (plan name, plant code or name) and plant filter; a plan keeps only the matching plants. */
export function filterPlanGroups(groups: PlanGroup[], search: string, plants: string[]): PlanGroup[] {
  const t = search.trim().toLowerCase();
  const sel = new Set(plants.map((p) => p.toUpperCase()));
  const out: PlanGroup[] = [];
  for (const g of groups) {
    let ps = sel.size ? g.plants.filter((p) => sel.has(p.werks)) : g.plants;
    if (t && !g.plan.toLowerCase().includes(t)) ps = ps.filter((p) => p.werks.toLowerCase().includes(t) || p.name.toLowerCase().includes(t));
    if (!ps.length) continue;
    out.push(ps.length === g.plants.length ? g : { ...g, plants: ps, rows: ps.reduce((a, p) => a + p.rows, 0), total: ps.reduce((a, p) => a.plus(p.total), ZERO) });
  }
  return out;
}

export const plantLabel = (p: Pick<PlanPlant, 'werks' | 'name'>) => (p.name ? `${p.werks} - ${p.name}` : p.werks);

export function planHref(plan: string, werks: string[] = []): string {
  return `/plan/view/?plan=${encodeURIComponent(plan)}${werks.map((w) => `&werks=${encodeURIComponent(w)}`).join('')}`;
}

/** Plan and plants from a location search ("?plan=X&werks=A&werks=B"; "werks=A,B" is accepted too). */
export function readPlanUrl(search: string): { plan: string; werks: string[] } {
  const sp = new URLSearchParams(search);
  const werks = sp.getAll('werks').flatMap((w) => w.split(',')).map((w) => w.trim().toUpperCase()).filter(Boolean);
  return { plan: (sp.get('plan') ?? '').trim(), werks: [...new Set(werks)] };
}

/** Heavy tabs (Breakup & cost, Requirement, Checks, WIP, Scenarios) need a plant when the plan has several.
 * `planPlants` null = still loading (blocks too, so nothing runs plan-wide before the plants are known). */
export const needsPlant = (selected: string[], planPlants: unknown[] | null) => selected.length === 0 && (planPlants === null || planPlants.length > 1);
