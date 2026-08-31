import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import type { AppItem } from '../types';
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
  ListHeaderComponent?: React.ReactElement;
  scrollEnabled?: boolean;
  /** App IDs the signed-in user is granted (see useUnlockedAppIds) — anything not in this set is
   * filtered out of the grid entirely. Omit to leave every app visible (e.g. a context with no
   * access data yet). */
  unlockedAppIds?: Set<string>;
}

export default function AppGrid({ apps, favorites, query, onOpenApp, onToggleFavorite, ListHeaderComponent, scrollEnabled = true, unlockedAppIds }: AppGridProps) {
  const numColumns = useColumnCount();
  const visibleApps = unlockedAppIds ? apps.filter((a) => unlockedAppIds.has(a.id)) : apps;
  return (
    <FlatList
      key={`cols-${numColumns}`}
      data={visibleApps}
      keyExtractor={(item) => item.id}
      numColumns={numColumns}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={<EmptyState query={query} />}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      renderItem={({ item }) => (
        // maxWidth caps a card at what a full row's share would be, so a partial last row (e.g.
        // one lone app) doesn't stretch that card to fill the whole row width — it stays the same
        // size as every card above, leaving empty space beside it instead.
        <View style={[styles.cell, { maxWidth: `${100 / numColumns}%` }]}>
          <AppCard
            app={item}
            isFavorite={favorites.has(item.id)}
            isTopUsed={item.id === topUsedAppId}
            onPress={onOpenApp}
            onToggleFavorite={onToggleFavorite}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 8,
  },
  row: {
    gap: 12,
  },
  cell: {
    flex: 1,
    marginBottom: 12,
  },
});
