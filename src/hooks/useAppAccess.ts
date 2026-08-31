import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * The set of app IDs the signed-in user is actually granted (emami_apps.authorized_user_apps, via
 * AuthContext's access.apps) — every other app is filtered out of tile grids, the drawer's quick
 * access strip, Recently Used, and Help's app chips entirely, regardless of the viewer's hub-wide
 * access level (Super Admin/Admin/Viewer). Those are two independent axes: access level gates the
 * Manage Access screen, this gates which apps show as usable. While access hasn't loaded yet,
 * everything is treated as locked (hidden) rather than briefly flashing visible.
 */
export function useUnlockedAppIds(): Set<string> {
  const { access } = useAuth();
  return useMemo(() => new Set((access?.apps ?? []).map((a) => a.appId)), [access]);
}
