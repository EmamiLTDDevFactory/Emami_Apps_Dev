import { useEffect, useState } from 'react';
import { apiMe, apiAccessMe } from './api.js';

// Resolves the signed-in person's hub profile name and their Dev Tracker role in one
// place. Every page that renders the Sidebar + Topbar shell needs both — the role gates
// the Sidebar's admin-only nav entries, the name drives the Topbar's identity strip —
// and the two API calls were duplicated verbatim across Home and (until now) every page
// still using the old AccountBar strip.
export function useDevTrackerSession(email) {
  const [isAdmin, setIsAdmin] = useState(null);
  const [roleLabel, setRoleLabel] = useState(null);
  const [profileName, setProfileName] = useState(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    apiAccessMe(email).then((data) => {
      if (cancelled) return;
      const role = data?.success ? data.apps?.find((a) => a.appId === 'dev-tracker')?.role : null;
      setIsAdmin(role === 'Admin');
      setRoleLabel(role || null);
    });
    apiMe(email).then((data) => {
      if (!cancelled && data?.success && data.profile?.name) setProfileName(data.profile.name);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  return { isAdmin, roleLabel, profileName };
}
