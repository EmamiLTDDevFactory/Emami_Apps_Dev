'use client';
/**
 * Who may see the material documents: the hub's Manage Access role of this app, "Admin" or the new role "mat-docs" (a plain string in Manage Access).
 * Looked up once per page session; fails closed (no buttons, no SAP call).
 */
import { useEffect, useState } from 'react';
import { fetchAppRole } from '../client/hubAccess';
import { readHubSession } from '../client/session';

export const MATDOC_ROLES = ['Admin', 'mat-docs'];
export const canSeeDocs = (role: string): boolean => MATDOC_ROLES.includes(role);

let access: Promise<boolean> | null = null;
function checkAccess(): Promise<boolean> {
  if (!access) {
    const s = readHubSession();
    access = s ? fetchAppRole(s.email).then(canSeeDocs).catch(() => false) : Promise.resolve(false);
    void access.then((ok) => { if (!ok) access = null; }); // a later look-up may succeed (role granted while the app is open)
  }
  return access;
}
export function useMatDocAccess(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => { let live = true; void checkAccess().then((v) => { if (live) setOk(v); }); return () => { live = false; }; }, []);
  return ok;
}
