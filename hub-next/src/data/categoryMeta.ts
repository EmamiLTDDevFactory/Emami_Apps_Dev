import { LayoutGrid, TrendingUp, Globe, Users, Monitor, FlaskConical } from 'lucide-react';
import {
  CoinsRupeeIcon, TruckRouteIcon, TrolleyGearIcon, NodeConnectorIcon, AnalystChartIcon, CartIcon, type CategoryIcon,
} from '../components/CategoryIcons';

/** One icon per category — shared by the Home tiles, the sidebar's Categories section and the
 * My Applications filter bar, so the three can't drift apart. Each one is the Emami Analytics
 * hub's own module icon: same module where the name matches (IBD, Supply Chain, CPD, HR, IT),
 * F & A for Finance, Sales for SD, Apps for 'All', and the closest-fitting module for the
 * categories Emami Analytics doesn't have — Operations for Cross-Function, R&D for CQA,
 * Subsidiary & D2C for Packaging, CMI for MSD. */
export const CATEGORY_ICONS: Record<string, CategoryIcon> = {
  All: LayoutGrid,
  Finance: CoinsRupeeIcon,
  SD: TrendingUp,
  IBD: Globe,
  'Supply Chain': TruckRouteIcon,
  CPD: TrolleyGearIcon,
  HR: Users,
  IT: Monitor,
  'Cross-Function': NodeConnectorIcon,
  CQA: FlaskConical,
  Packaging: CartIcon,
  MSD: AnalystChartIcon,
};

/** How each category's icon sits in its chip, matched to the Emami Analytics hub: the detailed
 * drawings (F & A, Supply Chain, CPD, CMI, the cart) fill most of the chip with a fine line,
 * while the simple glyphs (globe, flask, people, monitor...) sit noticeably smaller in the middle
 * with a slightly heavier line, so both read at the same visual weight. `scale` is a fraction of
 * the chip's full icon size. */
export interface IconFit {
  scale: number;
  strokeWidth: number;
}
export const SIMPLE_ICON_FIT: IconFit = { scale: 0.58, strokeWidth: 1.5 };
// Per-icon fits for the detailed drawings, measured against the Emami Analytics screenshot.
const DETAILED_ICON_FITS: Record<string, IconFit> = {
  Finance: { scale: 0.86, strokeWidth: 1.05 },
  'Supply Chain': { scale: 0.95, strokeWidth: 0.95 },
  CPD: { scale: 1, strokeWidth: 0.9 },
  MSD: { scale: 0.95, strokeWidth: 0.95 },
  Packaging: { scale: 0.74, strokeWidth: 1.25 },
};
export function categoryIconFit(category: string): IconFit {
  return DETAILED_ICON_FITS[category] ?? SIMPLE_ICON_FIT;
}

/** The one-line description under each Home category tile's name. */
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  All: 'Every application in one place',
  Finance: 'Planning, budgets, analytics, MIS',
  SD: 'Secondary sales, performance, regions',
  IBD: 'International Business Division',
  'Supply Chain': 'Supply planning, inventory, vendors',
  CPD: 'Quality, compliance, cost & production',
  HR: 'Workforce, talent, engagement',
  IT: 'Systems, security, service desk',
  CQA: 'Quality audits & CAPA tracking',
  'Cross-Function': 'Expenses, policies & approvals',
  Packaging: 'Mould health & packaging lines',
  MSD: 'Internal audit, observations & MIS',
};
