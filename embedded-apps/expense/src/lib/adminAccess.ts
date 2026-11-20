// Non-CTC Expense: admin is a PERNR-list flag (SAP variable ZEXP_ADMIN), layered on top of
// whatever role (employee/manager/finance/B) the user already has - not a role itself, since one
// person can be both e.g. a manager and an admin. The login response doesn't return this flag yet
// (open backend prerequisite as of the Nov 2026 DOA handover), so this checks several plausible
// real field names for when it lands, falling back to a local/QA-only PERNR allowlist so the admin
// screens are testable before the backend change ships - never enabled for real users since the
// env var is unset in production.
export function resolveIsAdmin(loginInfo: any, employeeId: string): boolean {
  const raw = loginInfo?.IsAdmin ?? loginInfo?.Isadmin ?? loginInfo?.AdminFlag ?? loginInfo?.ZexpAdmin;
  if (raw === true || raw === 'X' || raw === 'Y' || raw === '1') return true;

  const allowlist = (process.env.NEXT_PUBLIC_EXP_ADMIN_TEST_PERNRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const numericId = (employeeId || '').replace(/\D/g, '').padStart(8, '0');
  return allowlist.includes(numericId);
}
