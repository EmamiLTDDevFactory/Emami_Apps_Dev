'use client';

import React from 'react';
import type { AppItem, AppRole } from '../types';
import AppCard from './AppCard';
import EmptyState from './EmptyState';
import { topUsedAppId } from '../data/mockData';
import { useColumnCount } from '../hooks/useColumnCount';

interface AppGridProps {
  apps: AppItem[];
  favorites: Set<string>;
  query: string;
  onOpenApp: (app: AppItem) => void;
  onToggleFavorite: (id: string) => void;
  ListHeaderComponent?: React.ReactNode;
  /** App IDs the signed-in user is granted (see useUnlockedAppIds) — every app still renders
   * regardless, anything not in this set just renders locked (see AppCard's `locked` prop) rather
   * than being hidden. Omit to leave every app unlocked (e.g. a context with no access data yet). */
  unlockedAppIds?: Set<string>;
  /** appId -> the signed-in user's own role for that app (see useAppRoles) — passed through to
   * each AppCard so it can show "Your role: <role>". Omit to show no role chips. */
  appRoles?: Map<string, AppRole>;
}

export default function AppGrid({ apps, favorites, query, onOpenApp, onToggleFavorite, ListHeaderComponent, unlockedAppIds, appRoles }: AppGridProps) {
  const numColumns = useColumnCount();
  // Apps the user has no grant for aren't shown at all (no locked tiles).
  const visibleApps = unlockedAppIds ? apps.filter((a) => unlockedAppIds.has(a.id)) : apps;

  return (
    <div style={{ paddingBottom: 8 }}>
      {ListHeaderComponent}
      {visibleApps.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: 12 }}>
          {visibleApps.map((item) => (
            <AppCard
              key={item.id}
              app={item}
              isFavorite={favorites.has(item.id)}
              isTopUsed={item.id === topUsedAppId}
              locked={!!unlockedAppIds && !unlockedAppIds.has(item.id)}
              role={appRoles?.get(item.id) ?? null}
              onPress={onOpenApp}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
