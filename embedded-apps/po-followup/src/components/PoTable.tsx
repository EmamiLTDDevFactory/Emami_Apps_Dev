import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../theme/tokens';
import type { PoFollowupRow } from '../lib/poFollowupApi';

/** "MaterialDescription" -> "Material Description" — turns a raw SAP field name into a readable
 * column header without a hardcoded label list, since the real field names haven't been confirmed
 * live yet (see PoFollowupRow's own note). */
function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^Z/, '')
    .trim();
}

const COLUMN_WIDTH = 160;

interface PoTableProps {
  rows: PoFollowupRow[];
  emptyMessage: string;
}

/** Renders whatever columns ZDelvPendPOSet actually returns, rather than hardcoding field names
 * this hasn't been verified against a live call yet — once the real PO/material/date field names
 * are confirmed, this can be swapped for an explicit column list the way Market Rate's table is
 * (see embedded-apps/market-rate's TEXT_COLUMNS), but functions correctly against the live service
 * either way in the meantime. */
export default function PoTable({ rows, emptyMessage }: PoTableProps) {
  const columns = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]) : []), [rows]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
      <View style={[styles.card, { width: columns.length * COLUMN_WIDTH }]}>
        <View style={styles.headerRow}>
          {columns.map((col) => (
            <Text key={col} style={[styles.headerCell, { width: COLUMN_WIDTH }]} numberOfLines={1}>
              {humanizeKey(col)}
            </Text>
          ))}
        </View>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {columns.map((col) => (
              <Text key={col} style={[styles.cell, { width: COLUMN_WIDTH }]} numberOfLines={2}>
                {row[col] != null ? String(row[col]) : '—'}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.rust,
  },
  headerCell: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cell: {
    fontSize: 12.5,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
