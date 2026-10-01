import {
  LayoutGrid, Coins, TrendingUp, Globe, Truck, Factory, Users, Monitor, ClipboardCheck, Workflow, Package, Briefcase,
  type LucideIcon,
} from 'lucide-react';

/** One icon per category — shared by the Home tiles, the sidebar's Categories section and the
 * My Applications filter bar, so the three can't drift apart. Glyphs follow the reference Emami
 * Apps home screen (Globe for IBD, TrendingUp for sales, Users for HR, Monitor for IT, LayoutGrid
 * for the all-apps tile). 'All' isn't a real category, so it gets the neutral catalog grid. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  All: LayoutGrid,
  Finance: Coins,
  SD: TrendingUp,
  IBD: Globe,
  'Supply Chain': Truck,
  CPD: Factory,
  HR: Users,
  IT: Monitor,
  CQA: ClipboardCheck,
  'Cross-Function': Workflow,
  Packaging: Package,
  MSD: Briefcase,
};

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
