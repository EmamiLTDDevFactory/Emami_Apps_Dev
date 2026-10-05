import {
  Landmark, Truck, Activity, Receipt, Home, LayoutGrid, Star,
  HelpCircle, CircleUserRound, ShieldCheck, ClipboardCheck, TrendingUp, Code2, PackageSearch, Wallet, BarChart3,
  CalendarClock, FileCheck2, HeartPulse, LineChart, ScanSearch, ShieldAlert, FileSpreadsheet, FileSearch, Gavel, Calculator, Hourglass,
} from 'lucide-react';
import type { AppItem, NavItem, CategoryFilter } from '../types';

// 'All' first, then every category A-Z (case-insensitive) — sorted here rather than hand-ordered
// so a newly added category lands in the right place. Every category list in the hub (Home tiles,
// side pane, filter bar, My Applications) renders from this one array.
const CATEGORY_NAMES: CategoryFilter[] = ['CQA', 'CPD', 'IT', 'Supply Chain', 'IBD', 'HR', 'Cross-Function', 'Packaging', 'Finance', 'SD', 'MSD'];
export const CATEGORIES: CategoryFilter[] = ['All', ...[...CATEGORY_NAMES].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))];

/**
 * Live app URLs. Every real app renders inline on the launch screen — same-origin apps
 * (relative paths, merged into this hub's own build at /apps/<slug>) get a full page navigation,
 * everything else gets an iframe (see AppDetail's isSameOriginRoute / EmbeddedWebView).
 *
 * This hub build is web-only (no native counterpart), so every entry is the relative same-origin
 * path unconditionally — unlike the pre-conversion Expo app, which had to branch on
 * `Platform.OS === 'web'` and fall back to an absolute external URL on native.
 */
export const EMBEDDED_APP_URLS: Record<string, string> = {
  hr: '/apps/dispatch-tracker', // Dispatch Tracker
  finance: '/apps/rc-portal', // RC Portal
  inventory: '/apps/mouldhealthcheck', // MoldHealthCheck
  expense: '/apps/expense', // Non CTC Expense
  'audit-capa': '/apps/audit-capa', // Audit & CAPA
  'market-rate': '/apps/market-rate', // Market Rate
  'dev-tracker': '/apps/dev-tracker', // Development Tracker
  'po-followup': '/apps/po-followup', // PO Followup
  // IBD Provision Tracking (see embedded-apps/payment-tracking — folder/id kept as
  // "payment-tracking" for routing stability) is PO Followup's sibling app.
  'payment-tracking': '/apps/payment-tracking', // IBD Provision Tracking
  timesheet: '/apps/timesheet', // TimeSheet
  'fm-po-deviation': '/apps/fm-po-deviation', // PO Approval
  mediclaim: '/apps/mediclaim', // Mediclaim Policy
  'term-policy': '/apps/term-policy', // Term Policy
  'cashflow-forecast': '/apps/cashflow-forecast', // CashFlow Intelligence
  'journal-anomaly-agent': '/apps/journal-anomaly-agent', // Journal Entry & GL Anomaly Agent
  'credit-risk-advisory': '/apps/credit-risk-advisory', // Credit Risk Advisory
  salescode: '/apps/salescode', // Salescode
  'audit-tool': '/apps/audit-tool', // Audit Tool (MSD internal audit)
  'rate-auction': '/apps/rate-auction', // Rate Auction
  'bom-cost-explorer': '/apps/bom-cost-explorer', // BOM Simulator
  'shelf-life-deviation': '/apps/shelf-life-deviation', // Shelf Life Deviation (CPD approval + CADE Z-Report)
};

const RAW_APPS: AppItem[] = [
  { id: 'expense', name: 'Non CTC Expense', desc: 'Submit and track non-CTC (non-salary) expense claims and reimbursements.', cat: 'Cross-Function', icon: Receipt, uses: 128 },
  { id: 'finance', name: 'Recruitment Consultant Management Portal', desc: 'Onboarding of an External Recruitment Consultant( Agency or Individual )', cat: 'HR', icon: Landmark, uses: 96 },
  { id: 'hr', name: 'Dispatch Tracker', desc: 'Track shipment dispatches and delivery status in real time.', cat: 'Supply Chain', icon: Truck, uses: 210 },
  { id: 'inventory', name: 'Mould Health Inspection', desc: 'Monitors mould condition and preventive maintenance health checks.', cat: 'Packaging', icon: Activity, uses: 29 },
  { id: 'audit-capa', name: 'Audit & CAPA', desc: 'Manage audits and track Corrective and Preventive Actions (CAPA) to closure.', cat: 'CQA', icon: ClipboardCheck, uses: 0 },
  { id: 'market-rate', name: 'Current Market Rate', desc: 'Update Material Rate for tracking Market Trend', cat: 'CPD', icon: TrendingUp, uses: 0 },
  { id: 'dev-tracker', name: 'Development Tracker', desc: 'Track SAP ABAP development items — status, timelines, and delays across SD, FI-AR, and other modules.', cat: 'IT', icon: Code2, uses: 0 },
  { id: 'po-followup', name: 'Delivery Confirmation', desc: 'Track upcoming and pending shipments from Emami', cat: 'CPD', icon: PackageSearch, uses: 0 },
  { id: 'payment-tracking', name: 'IBD Provision Tracking', desc: 'Payment progress tracking related.', cat: 'IBD', icon: Wallet, uses: 0 },
  { id: 'timesheet', name: 'TimeSheet', desc: 'Log work hours, submit monthly timesheets, and manage team approvals.', cat: 'IT', icon: CalendarClock, uses: 0 },
  { id: 'fm-po-deviation', name: 'PO Approval', desc: 'Review, approve, or reject purchase order deviations, with full history and printable PO forms.', cat: 'Cross-Function', icon: FileCheck2, uses: 0 },
  { id: 'mediclaim', name: 'Mediclaim Policy', desc: 'Submit your Mediclaim policy details and view admin submission reports.', cat: 'Cross-Function', icon: HeartPulse, uses: 0 },
  { id: 'term-policy', name: 'Term Policy', desc: 'Submit your Term Life policy details and view admin submission reports.', cat: 'Cross-Function', icon: ShieldCheck, uses: 0 },
  { id: 'cashflow-forecast', name: 'CashFlow Intelligence', desc: 'AI-driven 13-week cash flow forecast, risk dashboard and explainability with SAP OData integration.', cat: 'Finance', icon: LineChart, uses: 0 },
  { id: 'journal-anomaly-agent', name: 'Journal Entry & GL Anomaly Agent', desc: 'AI-driven journal entry and GL anomaly monitoring, case management and audit evidence with SAP OData integration.', cat: 'Finance', icon: ScanSearch, uses: 0 },
  { id: 'credit-risk-advisory', name: 'Credit Risk Advisory', desc: 'Credit risk advisory command center — executive KPIs, worklist, Customer 360, portfolio analytics and governed approval workflow with SAP OData integration.', cat: 'Finance', icon: ShieldAlert, uses: 0 },
  { id: 'salescode', name: 'Salescode', desc: 'SD master and transactional data for Emami products sold through SalesCode.ai.', cat: 'SD', icon: FileSpreadsheet, uses: 0 },
  { id: 'audit-tool', name: 'Audit Tool', desc: 'MSD internal audit — masters, checklist, audit scheduling and kickoff, observations workflow and MIS reporting on SAP.', cat: 'MSD', icon: FileSearch, uses: 0 },
  { id: 'rate-auction', name: 'Rate Auction', desc: 'Live reverse auction for material and freight rates — vendors bid anonymously, Central Purchase awards and creates the SAP info record or contract.', cat: 'CPD', icon: Gavel, uses: 0 },
  { id: 'bom-cost-explorer', name: 'BOM Simulator', desc: 'Multi-level BOM costing from SAP by plant — rate sources, freight, budget and coverage, plant comparison, and what-if scenario simulation.', cat: 'CPD', icon: Calculator, uses: 0 },
  { id: 'shelf-life-deviation', name: 'Shelf Life Deviation', desc: 'CPD Category Head approval of shelf-life deviation inspection lots, plus the CADE deviation report on SAP.', cat: 'CPD', icon: Hourglass, uses: 0 },
];

export const APPS: AppItem[] = RAW_APPS.map((app) => ({
  ...app,
  url: EMBEDDED_APP_URLS[app.id],
}));

export const NAV: NavItem[] = [
  { id: 'Home', label: 'Home', icon: Home },
  { id: 'MyApplications', label: 'My Applications', icon: LayoutGrid },
  { id: 'Favorites', label: 'Favorites', icon: Star },
  { id: 'Help', label: 'Help & Support', icon: HelpCircle },
  { id: 'Settings', label: 'My Profile', icon: CircleUserRound },
  { id: 'UserAccess', label: 'Manage Access', icon: ShieldCheck },
  { id: 'Administration', label: 'Administration', icon: BarChart3 },
];

/** Maps a nav item id to its real route — kept alongside NAV rather than folded into it since
 * NAV also drives native-app-era navigation-key lookups elsewhere (kept as the stable id). */
export const NAV_ROUTES: Record<string, string> = {
  Home: '/',
  MyApplications: '/my-applications',
  Favorites: '/favorites',
  Recent: '/recent',
  Help: '/help',
  Settings: '/settings',
  UserAccess: '/manage-access',
  SsoConfig: '/manage-access/sso',
  Administration: '/administration',
};

export function appById(id: string) {
  const byId = APPS.find((a) => a.id === id);
  if (byId) return byId;

  // Fallback: match the last segment of the app's own URL, so `/apps/dispatch-tracker`
  // resolves to the app whose id is `hr`.
  //
  // Why this is needed. An embedded app's URL slug and its hub id are different strings
  // (hr -> /apps/dispatch-tracker, finance -> /apps/rc-portal, inventory ->
  // /apps/mouldhealthcheck), and the hub's own route is `/apps/:appId`. Hosting serves
  // `/apps/<slug>` as the app's real index.html, but `/apps/<slug>/` — the trailing slash an
  // embedded app puts in the address bar once it boots — falls through to the hub's own
  // `/apps/[appId]` route instead. So refreshing an open embedded app loads the HUB at
  // `/apps/<slug>/`, which looked up "dispatch-tracker" as an id, found nothing, and dead-ended
  // on "Application not found."
  //
  // With this fallback the hub recognises the slug, and AppDetail's existing redirect sends the
  // browser to the app's real URL (no trailing slash), which hosting serves correctly — so a
  // refresh recovers by itself instead of erroring.
  //
  // Lookups by real id are unaffected: that search runs first and wins.
  const slug = id.replace(/^\/+|\/+$/g, '');
  return APPS.find((a) => {
    if (!a.url || !a.url.startsWith('/')) return false;
    return a.url.replace(/\/+$/, '').split('/').pop() === slug;
  });
}

export const topUsedAppId = APPS.reduce((a, b) => (b.uses > a.uses ? b : a)).id;
