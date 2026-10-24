'use client';
import { useCallback, useMemo, useState } from 'react';
import { rowKey, type Row } from './types';

export interface Selection {
  isSelected: (row: Row) => boolean;
  toggle: (row: Row) => void;
  /** Select All / Deselect All for the rows currently shown. */
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
  selectedRows: Row[];
}

/**
 * Selected row keys (rowKey: __id, MATNR or the cascade key) for the rows shown; keys of rows that are no longer shown
 * drop out of selectedRows, so a reload or a filter never acts on hidden rows.
 */
export function useSelection(shown: Row[], kind?: 'material'): Selection {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const keyOf = useCallback((r: Row) => rowKey(r, kind), [kind]);
  const keys = useMemo(() => shown.map(keyOf), [shown, keyOf]);
  const selectedRows = useMemo(() => shown.filter((r) => selected.has(keyOf(r))), [shown, selected, keyOf]);
  const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));

  const toggle = useCallback((row: Row) => {
    const k = keyOf(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }, [keyOf]);
  const toggleAll = useCallback(() => setSelected((prev) => {
    const next = new Set(prev);
    if (allSelected) keys.forEach((k) => next.delete(k)); else keys.forEach((k) => next.add(k));
    return next;
  }), [allSelected, keys]);
  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((row: Row) => selected.has(keyOf(row)), [selected, keyOf]);

  return { isSelected, toggle, toggleAll, clear, allSelected, someSelected: selectedRows.length > 0 && !allSelected, selectedRows };
}
