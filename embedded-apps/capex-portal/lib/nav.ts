/** One entry per screen. `href` is relative to the app's basePath. Detail screens take ?id=... (static export has no dynamic routes). */
export interface NavItem { href: string; label: string; group: string; adminOnly?: boolean; hidden?: boolean; fiori: string }

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', group: 'Overview', fiori: 'Dashboard' },
  { href: '/approvals/', label: 'My Approvals', group: 'Overview', fiori: 'ApprovalInbox' },
  { href: '/budget/', label: 'Budgets', group: 'Budget', fiori: 'BudgetList' },
  { href: '/budget/create/', label: 'New Budget', group: 'Budget', fiori: 'BudgetCreate' },
  { href: '/cpe/', label: 'All CPEs', group: 'CPE', fiori: 'CPEList' },
  { href: '/cpe/create/', label: 'New CPE', group: 'CPE', fiori: 'CPECreate' },
  { href: '/po/', label: 'Purchase Orders', group: 'Procurement', fiori: 'POList' },
  { href: '/grn/', label: 'Goods Receipts', group: 'Procurement', fiori: 'GRNList' },
  { href: '/ic/', label: 'Installation Certificates', group: 'Assets', fiori: 'ICList' },
  { href: '/capitalization/', label: 'Capitalization', group: 'Assets', fiori: 'Capitalization' },
  { href: '/quota/', label: 'Unit Quota', group: 'Assets', fiori: 'UnitQuota' },
  { href: '/reports/', label: 'Reports', group: 'Insights', fiori: 'Reports' },
  { href: '/audit/', label: 'Audit Trail', group: 'Insights', fiori: 'AuditTrail' },
  { href: '/admin/doa/', label: 'Maintenance', group: 'Admin', adminOnly: true, fiori: 'DOAMatrix' },
  // detail / action screens (not in the side menu)
  { href: '/budget/detail/', label: 'Budget', group: 'Budget', hidden: true, fiori: 'BudgetDetail' },
  { href: '/cpe/detail/', label: 'CPE', group: 'CPE', hidden: true, fiori: 'CPEDetail' },
  { href: '/evaluation/', label: 'Evaluation', group: 'CPE', hidden: true, fiori: 'Evaluation' },
  { href: '/approvals/detail/', label: 'Approval', group: 'Overview', hidden: true, fiori: 'ApprovalDetail + BudgetApprovalDetail' },
  { href: '/cwip/create/', label: 'Create CWIP', group: 'Procurement', hidden: true, fiori: 'CWIPCreate' },
  { href: '/po/detail/', label: 'Purchase Order', group: 'Procurement', hidden: true, fiori: 'PODetail' },
  { href: '/ic/detail/', label: 'Installation Certificate', group: 'Assets', hidden: true, fiori: 'ICDetail' },
  { href: '/quota/detail/', label: 'Quota Item', group: 'Assets', hidden: true, fiori: 'QuotaItemDetail' },
];
