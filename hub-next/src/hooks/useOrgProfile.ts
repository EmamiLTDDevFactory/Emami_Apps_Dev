'use client';

import { useEffect, useState } from 'react';
import { getOrgProfile, type OrgProfile } from '../lib/authApi';

// One directory lookup per signed-in email per page load, shared by every component that shows it (header, profile).
let cached: { email: string; promise: Promise<OrgProfile | null> } | null = null;

/** The signed-in person's Microsoft Entra ID details (job title, department, phones, L1/L2 managers);
 * null while loading, when the server has no Graph connection, or when the directory has no record. */
export function useOrgProfile(email: string | null | undefined): OrgProfile | null {
  const [org, setOrg] = useState<OrgProfile | null>(null);
  useEffect(() => {
    if (!email) return setOrg(null);
    if (!cached || cached.email !== email) cached = { email, promise: getOrgProfile().then((r) => r.org) };
    let alive = true;
    cached.promise.then((o) => { if (alive) setOrg(o); });
    return () => { alive = false; };
  }, [email]);
  return org;
}
