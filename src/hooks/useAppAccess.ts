import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * The set of app IDs the signed-in user is actually granted (emami_apps.authorized_user_apps, via
 * AuthContext's access.apps), regardless of the viewer's hub-wide access level (Super Admin/Admin/
 * Viewer) — those are two independent axes: access level gates the Manage Access screen, this
 * gates which apps a user can actually open. Every app is always visible in the main catalog (Home
 * "My Applications", All Apps, Favorites — see AppGrid) — anything not in this set just renders
 * locked there (AppCard's `locked` prop) instead of being hidden, so someone can see what exists
 * and request access rather than not knowing an app is there at all. The drawer's quick access
 * strip, Recently Used, and Help's app chips are personal/derived shortcut lists rather than the
 * catalog itself, so those still filter down to only granted apps. While access hasn't loaded yet,
 * everything reads as locked/not-yet-granted rather than briefly flashing unlocked.
 */
export function useUnlockedAppIds(): Set<string> {
  const { access } = useAuth();
  return useMemo(() => new Set((access?.apps ?? []).map((a) => a.appId)), [access]);
}
