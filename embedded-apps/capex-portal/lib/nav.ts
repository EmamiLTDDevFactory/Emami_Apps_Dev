/** One entry per screen. `href` is relative to the app's basePath. Detail screens take ?id=... (static export has no dynamic routes). */
export interface NavItem { href: string; label: string; group: string; adminOnly?: boolean; hidden?: boolean; fiori: string; /** one line under the label in the side pane */ hint?: string }

export const NAV: NavItem[] = [
  { href: '/', hint: 'Your CAPEX at a glance', label: 'Dashboard', group: 'Overview', fiori: 'Dashboard' },
  { href: '/approvals/', hint: 'Documents waiting for you', label: 'My Approvals', group: 'Overview', fiori: 'ApprovalInbox' },
  { href: '/budget/', hint: 'Budgets and cash flow', label: 'Budgets', group: 'Budget', fiori: 'BudgetList' },
  { href: '/budget/create/', hint: 'Raise a new budget', label: 'New Budget', group: 'Budget', fiori: 'BudgetCreate' },
  { href: '/cpe/', hint: 'Capital purchase expenditure', label: 'All CPEs', group: 'CPE', fiori: 'CPEList' },
  { href: '/cpe/create/', hint: 'Raise a new CPE', label: 'New CPE', group: 'CPE', fiori: 'CPECreate' },
  { href: '/po/', hint: 'Purchase orders raised', label: 'Purchase Orders', group: 'Procurement', fiori: 'POList' },
  { href: '/grn/', hint: 'Goods receipts', label: 'Goods Receipts', group: 'Procurement', fiori: 'GRNList' },
  { href: '/ic/', hint: 'Installation certificates', label: 'Installation Certificates', group: 'Assets', fiori: 'ICList' },
  { href: '/capitalization/', hint: 'Capitalise finished assets', label: 'Capitalization', group: 'Assets', fiori: 'Capitalization' },
  { href: '/quota/', hint: 'Unit quota requests', label: 'Unit Quota', group: 'Assets', fiori: 'UnitQuota' },
  { href: '/reports/', hint: 'Reports and exports', label: 'Reports', group: 'Insights', fiori: 'Reports' },
  { href: '/audit/', hint: 'Who did what, when', label: 'Audit Trail', group: 'Insights', fiori: 'AuditTrail' },
  { href: '/admin/doa/', hint: 'Users, DOA rules, settings', label: 'Maintenance', group: 'Admin', adminOnly: true, fiori: 'DOAMatrix' },
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
