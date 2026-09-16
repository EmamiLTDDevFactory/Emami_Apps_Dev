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

function chunkIntoRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

export default function AppGrid({ apps, favorites, query, onOpenApp, onToggleFavorite, ListHeaderComponent, scrollEnabled = true, unlockedAppIds }: AppGridProps) {
  const numColumns = useColumnCount();
  const visibleApps = unlockedAppIds ? apps.filter((a) => unlockedAppIds.has(a.id)) : apps;

  const renderCard = (item: AppItem) => (
    // maxWidth caps a card at what a full row's share would be, so a partial last row (e.g.
    // one lone app) doesn't stretch that card to fill the whole row width — it stays the same
    // size as every card above, leaving empty space beside it instead.
    <View key={item.id} style={[styles.cell, { maxWidth: `${100 / numColumns}%` }]}>
      <AppCard
        app={item}
        isFavorite={favorites.has(item.id)}
        isTopUsed={item.id === topUsedAppId}
        onPress={onOpenApp}
        onToggleFavorite={onToggleFavorite}
      />
    </View>
  );

  // HomeScreen embeds this grid (scrollEnabled=false) inside its OWN outer ScrollView, as a
  // fixed-size preview rather than a scrollable list of its own. FlatList is still a
  // VirtualizedList under the hood even with scrolling disabled — it mounts its own touch
  // responder, and nesting that inside another ScrollView's responder is what was making the
  // Home screen's app-tiles scroll feel janky/non-smooth specifically on mobile touch devices
  // (two responders negotiating the same touch gesture). A plain View grid has no responder of
  // its own, so the outer ScrollView is the only thing handling touch there. The standalone case
  // below (All Apps/Favorites, never nested in another scrollable) keeps using FlatList, which is
  // the right choice there since it IS the page's own scrollable list.
  if (!scrollEnabled) {
    const rows = chunkIntoRows(visibleApps, numColumns);
    return (
      <View style={styles.content}>
        {ListHeaderComponent}
        {rows.length === 0 ? <EmptyState query={query} /> : rows.map((row, i) => <View key={i} style={styles.row}>{row.map(renderCard)}</View>)}
      </View>
    );
  }

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
      renderItem={({ item }) => renderCard(item)}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cell: {
    flex: 1,
  },
});
