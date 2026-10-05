/**
 * Logged-in user — the Emami Apps hub user.
 *
 * UI5 original (_getLoggedInUser in App/Approvals controllers):
 *   try { return sap.ushell.Container.getUser().getId(); }
 *   catch (e) { return "IT_FCOMMON"; }
 *
 * In Emami Apps there is no Fiori Launchpad and no SAP logon: every call goes through the shared
 * Azure gateway as its technical user, so SAP can't tell who the user is (sy-uname). Same as every
 * sibling embedded app (audit-tool, fm-po-deviation, ...), the signed-in hub user's email from
 * hubEmailLogin.ts is passed to SAP explicitly instead. It replaces _getLoggedInUser() in its two
 * uses:
 *   - key of  UserSet(Email='<email>')?$expand=NAV_UserToAction   (worklist + approver Flag)
 *   - ApprName in the POST ActionSet payload on approve
 *
 * No IT_FCOMMON fallback: Shell only renders the app once hasHubSession() is true, so an email is
 * always present here.
 */
import { getHubEmail } from './hubEmailLogin';

export function getLoggedInUser(): string {
  return (getHubEmail() || '').trim();
}

/** "/UserSet(Email='<email>')" — the key is named Email (the Emami Apps login email, not a SAP
 * UserId); quote-escaped and URL-encoded the same way audit-tool's readEntity builds its email
 * keys. */
export function userSetPath(): string {
  const user = getLoggedInUser();
  return `/UserSet(Email='${encodeURIComponent(user.replace(/'/g, "''"))}')`;
}
