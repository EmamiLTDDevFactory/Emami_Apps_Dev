'use client';

// The source app's manifest.json routes, keyed by the same route NAMES its controllers pass to
// oRouter.navTo(), mapped to this app's real paths. Ported screens call navTo('<fiori route>')
// so the navigation graph stays identical to the original.
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import type { ScreenAuth } from '../context/AppContext';

export const ROUTES = {
  secondImage: '/',
  // Masters
  userDetails: '/masters/users/',
  verticalMaster: '/masters/vertical/',
  legalEntity: '/masters/legal-entity/',
  legalSubEntity1: '/masters/legal-entity/sub-entity-1/',
  legalSubEntity2: '/masters/legal-entity/sub-entity-2/',
  legalSubEntity3: '/masters/legal-entity/sub-entity-3/',
  businessProcess: '/masters/business-process/',
  subProcessList: '/masters/business-process/sub-process/',
  subActivityList: '/masters/business-process/sub-activity/',
  observationCategory: '/masters/observation-category/',
  riskCategory: '/masters/risk-category/',
  locationTypeMaster: '/masters/location-type/',
  legalEntityTypeMaster: '/masters/legal-entity-type/',
  subEntityTypeMaster: '/masters/sub-entity-type/',
  industryMaster: '/masters/industry/',
  stateMaster: '/masters/state/',
  cityMaster: '/masters/city/',
  departmentMaster: '/masters/department/',
  // Audit Reporting System
  RouteCheckList: '/ars/check-list/',
  auditScheduling: '/ars/audit-scheduling/',
  auditKickoff: '/ars/audit-kickoff/',
  pending: '/ars/pending/',
  inProcess: '/ars/accepted/',
  inProcessSumry: '/ars/accepted/summary/',
  inProcess2Screen: '/ars/observation/',
  closed: '/ars/closed/',
  closed2Screen: '/ars/closed/detail/',
  RouteDraftReport: '/ars/draft-report/',
  RouteMailProcessDetail: '/ars/mail-process-detail/',
  // MIS & Reporting
  RouteAuditStatus: '/mis/audit-status/',
  MISinProcess: '/mis/in-process/',
  MISinprocessSmry: '/mis/in-process/summary/',
  MISinprocess2: '/mis/in-process/observation/',
  MISClosed: '/mis/closed/',
  MISClosed2: '/mis/closed/detail/',
  MISReport: '/mis/report/',
} as const;

export type RouteName = keyof typeof ROUTES;

/** oRouter.navTo(name[, params]) — params become query-string values (the Fiori
 * RouteMailProcessDetail pattern "MailProcessDetail/{SubLglEntL1},{SubLglEntL2},{Process},{SubProcess}"
 * carries its four segments this way). */
export function useNavTo() {
  const router = useRouter();
  return useCallback(
    (name: RouteName, params?: Record<string, string>) => {
      const path = ROUTES[name];
      const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
      router.push(`${path}${qs}`);
    },
    [router],
  );
}

// ---------------------------------------------------------------------------------------------
// Side navigation (secondImage.view.xml's tnt:SideNavigation, commented-out items omitted exactly
// as in the source) and its authorization rules (BaseController.handleNavigationItemPress).
// ---------------------------------------------------------------------------------------------

export type NavGate = 'open' | 'master' | 'checklist' | 'scheduling' | 'kickoff';

export interface NavLeaf {
  text: string;
  route: RouteName;
  gate: NavGate;
}

export interface NavGroup {
  text: string;
  key: 'Masters' | 'AuditReportingSystem' | 'MisAndReporting';
  items: NavLeaf[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    text: 'Masters',
    key: 'Masters',
    items: [
      { text: 'Users', route: 'userDetails', gate: 'master' },
      { text: 'Vertical Master', route: 'verticalMaster', gate: 'master' },
      { text: 'Legal Entity', route: 'legalEntity', gate: 'master' },
      { text: 'Business Process', route: 'businessProcess', gate: 'master' },
      { text: 'Observation Category', route: 'observationCategory', gate: 'master' },
      { text: 'Risk Category', route: 'riskCategory', gate: 'master' },
      { text: 'Location Type Master', route: 'locationTypeMaster', gate: 'master' },
      { text: 'Legal Entity Type Master', route: 'legalEntityTypeMaster', gate: 'master' },
      { text: 'Sub Entity Type Master', route: 'subEntityTypeMaster', gate: 'master' },
      { text: 'Industry Master', route: 'industryMaster', gate: 'master' },
      { text: 'State Master', route: 'stateMaster', gate: 'master' },
      { text: 'City Master', route: 'cityMaster', gate: 'master' },
      { text: 'Department Master', route: 'departmentMaster', gate: 'master' },
    ],
  },
  {
    text: 'Audit Reporting System',
    key: 'AuditReportingSystem',
    items: [
      { text: 'Check List', route: 'RouteCheckList', gate: 'checklist' },
      { text: 'Audit Scheduling', route: 'auditScheduling', gate: 'scheduling' },
      { text: 'Audit Kickoff', route: 'auditKickoff', gate: 'kickoff' },
      { text: 'Pending', route: 'pending', gate: 'open' },
      { text: 'Accepted', route: 'inProcess', gate: 'open' },
      { text: 'Closed', route: 'closed', gate: 'open' },
      { text: 'Draft Report', route: 'RouteDraftReport', gate: 'open' },
    ],
  },
  {
    text: 'MIS & Reporting',
    key: 'MisAndReporting',
    items: [
      { text: 'Audit Status', route: 'RouteAuditStatus', gate: 'open' },
      { text: 'MIS InProcess', route: 'MISinProcess', gate: 'open' },
      { text: 'MIS Closed', route: 'MISClosed', gate: 'open' },
      { text: 'MIS Report', route: 'MISReport', gate: 'open' },
    ],
  },
];

/** Same decision as handleNavigationItemPress: Home/Pending/Accepted/Closed/Draft Report/MIS are
 * always open; everything else needs ActAll, or the matching Act* flag. */
export function isGateAllowed(gate: NavGate, auth: ScreenAuth): boolean {
  if (gate === 'open') return true;
  if (auth.All) return true;
  if (gate === 'master') return !!auth.Master;
  if (gate === 'checklist') return !!auth.CheckList;
  if (gate === 'scheduling') return !!auth.Scheduling;
  if (gate === 'kickoff') return !!auth.KickOff;
  return false;
}

/** Which gate a path falls under — used by the page-level guard so a typed/bookmarked URL gets
 * the same check a side-nav click does. Drill-down screens inherit their parent's gate. */
export function gateForPath(pathname: string): NavGate {
  const p = pathname.replace(/^\/apps\/audit-tool/, '');
  if (p.startsWith('/masters/')) return 'master';
  if (p.startsWith('/ars/check-list')) return 'checklist';
  if (p.startsWith('/ars/audit-scheduling')) return 'scheduling';
  if (p.startsWith('/ars/audit-kickoff')) return 'kickoff';
  return 'open';
}

export function navTextForPath(pathname: string): string {
  const p = pathname.replace(/^\/apps\/audit-tool/, '');
  for (const g of NAV_GROUPS) {
    for (const i of g.items) {
      if (p.startsWith(ROUTES[i.route])) return i.text;
    }
  }
  return 'this';
}
