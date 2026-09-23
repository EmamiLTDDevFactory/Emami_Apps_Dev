import type { LucideIcon } from 'lucide-react';

export type Category = 'CQA' | 'CPD' | 'IT' | 'Supply Chain' | 'IBD' | 'HR' | 'Cross-Function' | 'Packaging' | 'Finance' | 'Sales';

export interface AppItem {
  id: string;
  name: string;
  desc: string;
  cat: Category;
  icon: LucideIcon;
  uses: number;
  isNew?: boolean;
  /** Same-origin path or externally hosted web app URL. When set, AppDetail embeds it in an iframe
   * (cross-origin) or does a full-page navigation (same-origin, see isSameOriginRoute). */
  url?: string;
}

export interface RecentEntry {
  id: string;
  when: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export type SortOption = 'Alphabetical' | 'Most Used' | 'Recently Used';
export type CategoryFilter = 'All' | Category;

/** Most apps use the generic 'User'/'Admin' pair. Audit & CAPA is the one app with its own
 * domain-specific role vocabulary — 'CQA' (quality-assurance side, equivalent to 'Admin') and
 * 'Depot' (depot/site side, equivalent to 'User') — see the Manage Access screen's roleOptionsFor.
 * 'Finance' is Provision Tracking's own third role (Pending Approval, Upcoming Provision (All
 * Vendors), Submission History, Purchase Order Creation and Details) — also gated per-app, and
 * only valid for 'payment-tracking' server-side (see backend/server.js's VALID_ROLES_BY_APP). */
export type AppRole = 'User' | 'Admin' | 'CQA' | 'Depot' | 'Finance';

export interface UserAppGrant {
  appId: string;
  role: AppRole;
  /** Only meaningful for Audit & CAPA's 'Depot' role — which depot that person belongs to (see
   * embedded-apps/audit-capa/src/data/depots.js). Unused by every other app/role. */
  depot?: string | null;
}

/** Hub-wide role (emami_apps.authorized_users.access_level) — distinct from AppRole above, which
 * is per-app. Controls who can see/use Manage Access (Super Admin + Admin) and who can grant what
 * (Super Admin can grant Admin or Viewer; Admin can only grant Viewer). A fixed set of emails
 * (PERMANENT_SUPER_ADMIN_EMAILS in db.js) is permanently Super Admin, enforced server-side
 * — 'Super Admin' is never itself grantable through the UI. */
export type AccessLevel = 'Super Admin' | 'Admin' | 'Viewer';

export interface UserAccessEntry {
  email: string;
  /** Inactive users are blocked at login even though their grants are kept. */
  isActive: boolean;
  accessLevel: AccessLevel;
  /** The person's own Settings-page mobile once they've logged in at least once, falling back to
   * whatever an admin set for them in the Add Users dialog before that (see
   * authorized_users.pre_registered_mobile) — null if neither exists yet. */
  mobile?: string | null;
  /** Per-app grants (see AppItem for appId) — each with its own role, not just a boolean. */
  apps: UserAppGrant[];
}

/** One row of the Manage Access change-history audit trail (emami_apps.access_change_history) —
 * every add/remove/activate-deactivate/access-level/app-role/mobile change, who made it, and what
 * changed. Shown per-user or org-wide in the Administration tab. */
export type AccessChangeType = 'USER_ADDED' | 'USER_REMOVED' | 'ACTIVE_STATUS' | 'ACCESS_LEVEL' | 'APP_ROLE' | 'MOBILE_SET';

export interface AccessChangeEntry {
  id: number;
  targetEmail: string;
  /** Who made the change — the acting admin's email, or the same as targetEmail for a self-service
   * mobile edit. Null for a change recorded before this field existed, or the admin caller. */
  changedBy: string | null;
  changeType: AccessChangeType;
  /** Only set for APP_ROLE changes — which app the role change was for. */
  appId: string | null;
  oldValue: string | null;
  newValue: string | null;
  occurredAt: string;
}

/** What GET /access/me returns for the currently signed-in user — their own hub-wide role plus
 * which apps they're personally granted. Drives both the Manage Access nav visibility and which
 * app tiles render unlocked (see AuthContext.tsx). */
export interface MyAccess {
  accessLevel: AccessLevel;
  apps: UserAppGrant[];
}

/** What the SP side needs Azure told about — shown on the Configure SSO screen so an admin can
 * copy these into the Entra Enterprise Application's Identifier / Reply URL fields. */
export interface SsoServiceProviderInfo {
  entityId: string;
  acsUrl: string;
}

/** Parsed out of the IdP's uploaded Federation Metadata XML (backend/saml-sso.js) — the raw XML
 * itself isn't sent to the client, only what's needed to show status. */
export interface SsoIdentityProviderInfo {
  configured: boolean;
  isEnabled: boolean;
  entityId?: string;
  ssoUrl?: string;
  uploadedBy?: string | null;
  uploadedAt?: string | null;
  certificateFingerprint?: string | null;
  certificateExpiresAt?: string | null;
}

export interface SsoConfig {
  sp: SsoServiceProviderInfo;
  idp: SsoIdentityProviderInfo;
}
