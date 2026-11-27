/**
 * The side pane of Costing Cockpit: six sections, each opening a page of tiles. One list drives the side pane, the section pages and the header
 * chip, so a screen is added in one place. Flags and roles decide what is listed; a section with no visible item is dropped.
 */
import { BellRing, Boxes, Percent, Calculator, Calendar, ClipboardList, Factory, GitCompareArrows, Layers, LineChart, Scale, Tags, TrendingUp, Truck, Upload, type LucideIcon } from 'lucide-react';
import { PLAN_MODULE_ENABLED } from '../plan/flag';
import { AI_ENABLED } from '../ai/config';
import { WATCH_ENABLED } from '../watch/api';
import { COGM_ENABLED } from '../margin/flag';
import { canDisplay } from '../margin/roles';
import { BUDGET_ENABLED } from '../budget/flag';
import { BUDGET_RATE_MGMT_ENABLED } from '../budgetMgmt/flag';
import { PKG_BUDGET_ENABLED } from '../pkg/flag';
import { DASH_ENABLED } from '../dash/flag';
import { BUDGET_RATES_ENABLED } from '../budgetRatesFlag';
import { budgetNavItems } from '../budget/roles';
import { MODE_LABEL, type Mode } from '../query/schema';

/** Which screen of a route-based page is active (also the `active` prop of PlanFrame). */
export type PlanNav = 'plans' | 'upload' | 'watch' | 'freight' | 'freight-analysis' | 'wac' | 'ck' | 'so' | 'psum' | 'psum-report' | 'margin' | 'margin-whatif' | 'margin-alerts' | 'margin-portfolio' | 'margin-history' | 'margin-data' | 'budget' | 'budget-rates' | 'budget-rate-mgmt' | 'pkg-budget' | 'dash' | 'povar' | 'section';
export type SectionId = 'costing' | 'analysis' | 'variance' | 'margin' | 'budget' | 'plan' | 'monitoring';

export interface NavItem {
  id: string; label: string; hint: string; icon: LucideIcon;
  /** a screen of the costing page (opened in place) */
  mode?: Mode;
  /** a route of the app, relative to the base path */
  path?: string;
  /** the PlanFrame `active` value of that route */
  plan?: PlanNav;
}
export interface NavSection { id: SectionId; label: string; hint: string; icon: LucideIcon; items: NavItem[] }
export interface NavFlags { wac: boolean; ck: boolean; so: boolean; psum: boolean; /** Variance check (ZMM_PCOST / ZMM_COST); absent = hidden */ povar?: boolean; marginRole: string; budgetRole: string; /** screens this person is limited to in Manage Access (null / absent = every screen their role gets) */ tiles?: string[] | null }

/** The Manage Access screen id of a nav item or `plan` value. Must match backend/appTiles.js (margin screens and plan screens share one id each). */
export const tileOf = (id: string): string => (id.startsWith('margin') ? 'margin' : id === 'plans' || id === 'upload' ? 'plan' : id);
/** Whether a screen limit (null = none) lets this person open the screen. */
export const tileAllowed = (tiles: string[] | null | undefined, id: string): boolean => !tiles || tiles.includes(tileOf(id));

const MODE_ICON: Record<Mode, LucideIcon> = { B: Layers, C: Scale, R: Tags, F: Truck, M: Boxes };
const MODE_HINT: Record<Mode, string> = {
  B: 'Multi-level costing of a finished good, by plant',
  C: 'One BOM compared across plants, in INR',
  R: 'Rate records in the look-back',
  F: 'Freight per PO, actual vs standard',
  M: 'Exploded RM / PM requirement',
};
const modeItem = (m: Mode): NavItem => ({ id: `mode-${m}`, label: MODE_LABEL[m], hint: MODE_HINT[m], icon: MODE_ICON[m], mode: m });

export function navSections(f: NavFlags): NavSection[] {
  const analysis: NavItem[] = [
    modeItem('R'), modeItem('F'), modeItem('M'),
    { id: 'freight', label: 'Freight comparison', hint: 'Actual vs standard, plant and FG wise', icon: GitCompareArrows, path: '/freight-compare/', plan: 'freight' },
    { id: 'freight-analysis', label: 'Freight analysis', hint: 'Component standard vs actual, with alerts', icon: GitCompareArrows, path: '/freight-analysis/', plan: 'freight-analysis' },
    ...(f.wac ? [{ id: 'wac', label: 'Actual vs rate sources', hint: 'Weighted average actual cost vs rates', icon: Scale, path: '/actual/', plan: 'wac' as PlanNav }] : []),
    ...(f.psum ? [
      { id: 'psum', label: 'Plant production summary', hint: 'FGs, cost and components by plant', icon: Factory, path: '/plant-summary/', plan: 'psum' as PlanNav },
      { id: 'psum-report', label: 'Cost and margin report', hint: 'Cost per pc vs MRP and selling price', icon: TrendingUp, path: '/cost-report/', plan: 'psum-report' as PlanNav },
    ] : []),
    ...(f.ck ? [{ id: 'ck', label: 'Standard cost', hint: 'Cost estimate, like CK13N', icon: Layers, path: '/standard-cost/', plan: 'ck' as PlanNav }] : []),
    ...(f.so ? [{ id: 'so', label: 'Sales price', hint: 'MRP and selling price, latest order', icon: Tags, path: '/sales-price/', plan: 'so' as PlanNav }] : []),
  ];
  const margin: NavItem[] = COGM_ENABLED && canDisplay(f.marginRole) ? [
    { id: 'margin', label: 'Board', hint: 'Cost vs selling price, by scenario', icon: Scale, path: '/margin/', plan: 'margin' },
    { id: 'margin-whatif', label: 'What-if', hint: 'New price or cost, before and after', icon: GitCompareArrows, path: '/margin/what-if/', plan: 'margin-whatif' },
    { id: 'margin-alerts', label: 'Alerts', hint: 'Rules E1-E9 by impact', icon: BellRing, path: '/margin/alerts/', plan: 'margin-alerts' },
    { id: 'margin-portfolio', label: 'Portfolio', hint: 'Groups, weighted ratios, impact', icon: Boxes, path: '/margin/portfolio/', plan: 'margin-portfolio' },
    { id: 'margin-history', label: 'History', hint: 'Cost scenarios over time', icon: Calendar, path: '/margin/history/', plan: 'margin-history' },
    { id: 'margin-data', label: 'Data', hint: 'Prices, rules, volumes, budgets, targets', icon: Tags, path: '/margin/data/', plan: 'margin-data' },
  ] : [];
  const dash: NavItem[] = DASH_ENABLED ? [{ id: 'dash', label: 'Costing dashboard', hint: 'COGM budget vs actual by brand, margin, notes', icon: LineChart, path: '/dashboard/', plan: 'dash' }] : [];
  const budget: NavItem[] = budgetNavItems(BUDGET_ENABLED, f.budgetRole).map((n) => ({ id: 'budget', label: n.label, hint: 'Run, brand / product / SKU, BOM checklist, approvals', icon: Calculator, path: n.path, plan: 'budget' as PlanNav }));
  if (BUDGET_RATES_ENABLED) budget.push({ id: 'budget-rates', label: 'Component rates', hint: 'Domestic / international rates from SAP, Excel upload, recalculate', icon: Tags, path: '/budget-rates/', plan: 'budget-rates' });
  if (BUDGET_RATE_MGMT_ENABLED) budget.push({ id: 'budget-rate-mgmt', label: 'Raw Material (Budget Rate Preparation)', hint: 'History and A/B/C classes, Raw Material / Perfume, edit rates, submit, approve', icon: Scale, path: '/budget-rate-management/', plan: 'budget-rate-mgmt' });
  if (PKG_BUDGET_ENABLED) budget.push({ id: 'pkg-budget', label: 'Packing budget rate', hint: 'Packing material scenarios, edit rates and ZBUD %, finalise', icon: Boxes, path: '/pkg/', plan: 'pkg-budget' });
  const plan: NavItem[] = PLAN_MODULE_ENABLED ? [
    { id: 'plans', label: 'Plans', hint: 'Plans in SAP, breakup and cost', icon: ClipboardList, path: '/plan/', plan: 'plans' },
    { id: 'upload', label: 'Upload plan', hint: 'Excel template, check, save', icon: Upload, path: '/plan/upload/', plan: 'upload' },
  ] : [];
  const variance: NavItem[] = f.povar ? [{ id: 'povar', label: 'Process order variance', hint: 'Orders over 4 % vs standard (ZMM_PCOST) and the component rates behind them (ZMM_COST)', icon: Percent, path: '/variance-check/', plan: 'povar' }] : [];
  const monitoring: NavItem[] = AI_ENABLED && WATCH_ENABLED ? [{ id: 'watch', label: 'Cost watch', hint: 'Daily 06:00 cost alerts and digest', icon: BellRing, path: '/watch/', plan: 'watch' }] : [];
  const all: NavSection[] = [
    { id: 'costing', label: 'Costing', hint: 'Cost a finished good', icon: Layers, items: [modeItem('B'), modeItem('C')] },
    { id: 'analysis', label: 'Analysis', hint: 'Rates, freight, actual cost, standard cost and prices', icon: LineChart, items: [...analysis, ...dash] },
    { id: 'variance', label: 'Variance check', hint: 'Process orders vs standard, and the components behind the variance', icon: Percent, items: variance },
    { id: 'margin', label: 'Margin', hint: 'Cost against selling price', icon: Scale, items: margin },
    { id: 'budget', label: 'Budget', hint: 'Budget cost of finished goods', icon: Calculator, items: budget },
    { id: 'plan', label: 'Production Plan', hint: 'Plans, breakup and cost', icon: ClipboardList, items: plan },
    { id: 'monitoring', label: 'Monitoring', hint: 'Daily cost alerts', icon: BellRing, items: monitoring },
  ];
  // A screen limit from Manage Access only narrows: the lists above already applied flags and roles.
  return all.map((s) => ({ ...s, items: s.items.filter((i) => tileAllowed(f.tiles, i.id)) })).filter((s) => s.items.length > 0);
}

/** Where a section opens: a section with one screen goes straight to it, the others to their page of tiles. */
export const sectionPath = (s: NavSection): string | null => (s.items.length === 1 && s.items[0].path ? s.items[0].path : s.items.some((i) => i.mode) ? null : `/section/?s=${s.id}`);

/** The section and screen that are showing: a route page by its `plan` value, the costing page by its mode. */
export function activeOf(sections: NavSection[], plan: PlanNav | undefined, mode: Mode, section?: SectionId): { section?: NavSection; item?: NavItem } {
  if (section) return { section: sections.find((s) => s.id === section) };
  for (const s of sections) for (const i of s.items) if (plan ? i.plan === plan : i.mode === mode) return { section: s, item: i };
  return {};
}
