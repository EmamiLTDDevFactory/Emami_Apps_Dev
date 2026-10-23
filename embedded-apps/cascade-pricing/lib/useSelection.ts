'use client';
import { useCallback, useMemo, useState } from 'react';
import { rowKey, type CascadeSet, type Row } from './types';

export interface Selection {
  selected: ReadonlySet<string>;
  isSelected: (row: Row) => boolean;
  toggle: (row: Row) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
  selectedRows: Row[];
}

/** Selected row keys for one table; keys that disappear from rows (after a reload) drop out of selectedRows. */
export function useSelection(rows: Row[], set?: CascadeSet | 'RateRows' | 'SimRows'): Selection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const keyOf = useCallback((r: Row) => rowKey(r, set), [set]);
  const keys = useMemo(() => rows.map(keyOf), [rows, keyOf]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected, keyOf]);
  const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));

  const toggle = useCallback((row: Row) => {
    const k = keyOf(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, [keyOf]);
  const toggleAll = useCallback(() => setSelected(allSelected ? new Set() : new Set(keys)), [allSelected, keys]);
  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((row: Row) => selected.has(keyOf(row)), [selected, keyOf]);

  return { selected, isSelected, toggle, toggleAll, clear, allSelected, someSelected: selectedRows.length > 0 && !allSelected, selectedRows };
}
