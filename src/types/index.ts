import type { LucideIcon } from 'lucide-react-native';

export type Category = 'Finance' | 'People' | 'Operations' | 'Sales' | 'Insights' | 'IBD';

export interface AppItem {
  id: string;
  name: string;
  desc: string;
  cat: Category;
  icon: LucideIcon;
  uses: number;
  isNew?: boolean;
  /** AWS Amplify (or any) hosted web app URL. When set, AppDetailScreen embeds it in a WebView. */
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
 * 'Depot' (depot/site side, equivalent to 'User') — see UserAccessScreen.tsx's roleOptionsFor. */
export type AppRole = 'User' | 'Admin' | 'CQA' | 'Depot';

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
  /** Per-app grants (see AppItem for appId) — each with its own role, not just a boolean. */
  apps: UserAppGrant[];
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
