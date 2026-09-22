import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { AppRole } from '../types';

/**
 * The set of app IDs the signed-in user is actually granted (emami_apps.authorized_user_apps, via
 * AuthContext's access.apps), regardless of the viewer's hub-wide access level (Super Admin/Admin/
 * Viewer) — those are two independent axes: access level gates the Manage Access screen, this
 * gates which apps a user can actually open. Every app is always visible in the main catalog (Home
 * "My Applications", All Apps, Favorites — see AppGrid) — anything not in this set just renders
 * locked there (AppCard's `locked` prop) instead of being hidden, so someone can see what exists
 * and request access rather than not knowing an app is there at all. While access hasn't loaded
 * yet, everything reads as locked/not-yet-granted rather than briefly flashing unlocked.
 */
export function useUnlockedAppIds(): Set<string> {
  const { access } = useAuth();
  return useMemo(() => new Set((access?.apps ?? []).map((a) => a.appId)), [access]);
}

/**
 * appId -> the signed-in user's own role for that app (User/Admin/CQA/Depot/Finance — see
 * AppRole). Lets a tile show "your role for this app" (see AppCard's `role` prop) instead of
 * just whether it's unlocked, so someone can tell at a glance whether they're an Admin or a
 * plain User on a given app without opening it first.
 */
export function useAppRoles(): Map<string, AppRole> {
  const { access } = useAuth();
  return useMemo(() => new Map((access?.apps ?? []).map((a) => [a.appId, a.role])), [access]);
}
