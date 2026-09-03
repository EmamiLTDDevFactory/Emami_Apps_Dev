import { Platform } from 'react-native';
import {
  Landmark, Truck, Activity, Receipt, Home, LayoutGrid, Star, Clock,
  HelpCircle, Settings, ShieldCheck, ClipboardCheck, TrendingUp, Code2, PackageSearch, Wallet,
} from 'lucide-react-native';
import type { AppItem, RecentEntry, NavItem, CategoryFilter } from '../types';

export const CATEGORIES: CategoryFilter[] = ['All', 'Finance', 'Operations'];

/**
 * Live app URLs. Every real app renders inside a WebView on the launch screen
 * via this URL.
 *
 * On web, all five are now genuinely same-origin: their actual frontends
 * (fixed to be base-path aware — see embedded-apps/) are built and served
 * directly by this hub's own server at /apps/expense, /apps/dispatch-tracker,
 * /apps/rc-portal, /apps/mouldhealthcheck and /apps/audit-capa — not a proxy,
 * not an iframe to another domain. A relative URL here is the signal
 * AppDetailScreen uses to do a full page navigation instead of rendering a
 * WebView.
 *
 * Their backend/API endpoints are untouched: Non CTC Expense, RC Portal and
 * Audit & CAPA each get their own real backend brought in too (see each
 * app's own backend/ folder under embedded-apps/, real credentials via its
 * gitignored backend/.env); Dispatch Tracker and MoldHealthCheck need no
 * backend of their own — each frontend already hardcodes an absolute
 * external API domain that works directly (confirmed by testing it), unaffected
 * by where its own frontend is hosted.
 *
 * Native has no such merged build, so it keeps hitting each real external
 * URL via WebView as before.
 */
export const EMBEDDED_APP_URLS: Record<string, string> = {
  hr: Platform.OS === 'web' ? '/apps/dispatch-tracker' : 'https://main.d24jo2310130zc.amplifyapp.com', // Dispatch Tracker
  finance: Platform.OS === 'web' ? '/apps/rc-portal' : 'https://main.due5mcy3my82.amplifyapp.com', // RC Portal
  // MoldHealthCheck no longer has its own login/welcome screens — the bare app root
  // (app/apps/mouldhealthcheck/index.tsx) now resolves the signed-in hub user's role via SAP
  // automatically and drops them straight into the tabs, so this can point there directly again.
  inventory: Platform.OS === 'web' ? '/apps/mouldhealthcheck' : 'https://mould.emamiapps.in', // MoldHealthCheck
  expense: Platform.OS === 'web' ? '/apps/expense' : 'https://non-ctc-expense.onrender.com/zexpense/', // Non CTC Expense
  'audit-capa': Platform.OS === 'web' ? '/apps/audit-capa' : 'https://audit.emamiapps.in', // Audit & CAPA
  // Market Rate has no separate native deployment yet (see embedded-apps/market-rate) — same
  // relative path either way, which only actually resolves on web (isSameOriginRoute in
  // AppDetailScreen.tsx).
  'market-rate': '/apps/market-rate', // Market Rate
  // Development Tracker has no separate native deployment either (see embedded-apps/dev-tracker)
  // — same relative path either way, same reasoning as Market Rate above. Its API calls go
  // straight to the production backend (audit-capa-api.emamiapps.in) regardless of where the
  // frontend itself is hosted, since it has no bundler to inject a build-time env var.
  'dev-tracker': '/apps/dev-tracker', // Development Tracker
  // PO Followup has no separate native deployment either (see embedded-apps/po-followup) — same
  // relative path either way, same reasoning as Market Rate/Development Tracker above. Calls SAP
  // (ZMM_PO_FOLLOWUP_SRV) directly from the client, no backend of its own.
  'po-followup': '/apps/po-followup', // PO Followup
  // Payment Tracking (see embedded-apps/payment-tracking) is PO Followup's sibling app — same
  // service/entity set (ZMM_PO_FOLLOWUP_SRV / ZDelvPendPOSet) and the same tabs, distinguished from
  // Delivery Confirmation purely by the Potype SAP filter ('9' here vs 'M' there).
  'payment-tracking': '/apps/payment-tracking', // Payment Tracking
};

const RAW_APPS: AppItem[] = [
  { id: 'expense', name: 'Non CTC Expense', desc: 'Submit and track non-CTC (non-salary) expense claims and reimbursements.', cat: 'Finance', icon: Receipt, uses: 128 },
  { id: 'finance', name: 'Recruitment Consultant Management Portal', desc: 'Onboarding of an External Recruitment Consultant( Agency or Individual )', cat: 'Finance', icon: Landmark, uses: 96 },
  { id: 'hr', name: 'Dispatch Tracker', desc: 'Track shipment dispatches and delivery status in real time.', cat: 'Operations', icon: Truck, uses: 210 },
  { id: 'inventory', name: 'Mould Health Inspection', desc: 'Monitors mould condition and preventive maintenance health checks.', cat: 'Operations', icon: Activity, uses: 29 },
  { id: 'audit-capa', name: 'Audit & CAPA', desc: 'Manage audits and track Corrective and Preventive Actions (CAPA) to closure.', cat: 'Operations', icon: ClipboardCheck, uses: 0 },
  { id: 'market-rate', name: 'Current Market Rate', desc: 'Update Material Rate for tracking Market Trend', cat: 'Finance', icon: TrendingUp, uses: 0 },
  { id: 'dev-tracker', name: 'Development Tracker', desc: 'Track SAP ABAP development items — status, timelines, and delays across SD, FI-AR, and other modules.', cat: 'Operations', icon: Code2, uses: 0 },
  { id: 'po-followup', name: 'Delivery Confirmation', desc: 'Track upcoming and pending shipments from Emami', cat: 'Operations', icon: PackageSearch, uses: 0 },
  { id: 'payment-tracking', name: 'Payment Tracking', desc: 'Payment progress tracking related.', cat: 'Finance', icon: Wallet, uses: 0 },
];

export const APPS: AppItem[] = RAW_APPS.map((app) => ({
  ...app,
  url: EMBEDDED_APP_URLS[app.id],
}));

export const RECENT: RecentEntry[] = [
  { id: 'expense', when: 'Today, 9:42 AM' },
  { id: 'hr', when: 'Today, 8:15 AM' },
  { id: 'finance', when: 'Yesterday, 5:03 PM' },
  { id: 'inventory', when: 'Yesterday, 11:20 AM' },
];

export const NAV: NavItem[] = [
  { id: 'Home', label: 'Home', icon: Home },
  { id: 'MyApplications', label: 'My Applications', icon: LayoutGrid },
  { id: 'Favorites', label: 'Favorites', icon: Star },
  { id: 'Recent', label: 'Recently Used', icon: Clock },
  { id: 'Help', label: 'Help & Support', icon: HelpCircle },
  { id: 'Settings', label: 'Settings', icon: Settings },
  { id: 'UserAccess', label: 'Manage Access', icon: ShieldCheck },
];

export function appById(id: string) {
  const byId = APPS.find((a) => a.id === id);
  if (byId) return byId;

  // Fallback: match the last segment of the app's own URL, so `/apps/dispatch-tracker`
  // resolves to the app whose id is `hr`.
  //
  // Why this is needed. An embedded app's URL slug and its hub id are different strings
  // (hr -> /apps/dispatch-tracker, finance -> /apps/rc-portal, inventory ->
  // /apps/mouldhealthcheck), and the hub's own route is `apps/:appId` (linking.ts). Hosting
  // serves `/apps/<slug>` as the app's real index.html, but `/apps/<slug>/` — the trailing
  // slash the embedded Expo Router app puts in the address bar once it boots — falls through
  // to the hub's SPA fallback instead. So refreshing an open embedded app loads the HUB at
  // `/apps/<slug>/`, which looked up "dispatch-tracker" as an id, found nothing, and dead-ended
  // on "Application not found."
  //
  // With this fallback the hub recognises the slug, and AppDetailScreen's existing redirect
  // sends the browser to the app's real URL (no trailing slash), which hosting serves
  // correctly — so a refresh recovers by itself instead of erroring.
  //
  // Lookups by real id are unaffected: that search runs first and wins.
  const slug = id.replace(/^\/+|\/+$/g, '');
  return APPS.find((a) => {
    if (!a.url || !a.url.startsWith('/')) return false;
    return a.url.replace(/\/+$/, '').split('/').pop() === slug;
  });
}

export const topUsedAppId = APPS.reduce((a, b) => (b.uses > a.uses ? b : a)).id;
