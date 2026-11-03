// Row operations and keyboard movement of the grids (entities with several rows). Pure, so they can be tested without a browser.
import type { Row } from './types';

export const addRow = (rows: Row[]): Row[] => [...rows, {}];
export const removeRow = (rows: Row[], i: number): Row[] => rows.filter((_, j) => j !== i);

/** A copy of row i placed under it, without the key fields (the key must be new; SAP checks it). */
export function duplicateRow(rows: Row[], i: number, keyFields: string[]): Row[] {
  const src = rows[i];
  if (!src) return rows;
  const copy: Row = { ...src };
  for (const k of keyFields) delete copy[k];
  return [...rows.slice(0, i + 1), copy, ...rows.slice(i + 1)];
}

export type CellKind = 'text' | 'combo' | 'select' | 'textarea' | 'date' | 'checkbox';

export interface KeyEvent { key: string; ctrl: boolean; shift: boolean; alt: boolean }
export type GridMove = { row: number; col: number } | 'add' | 'remove' | null;

/**
 * Where a key press in a grid cell goes. Documented on the screen:
 *   Enter / Shift+Enter       next / previous row, same column
 *   Arrow Up / Down           previous / next row (text, number and checkbox cells; in lists and dates use Ctrl+Arrow)
 *   Arrow Left / Right        previous / next cell at the edge of the text (always in checkbox cells)
 *   Ctrl+Arrow                move in any cell
 *   Ctrl+Enter                add a row      Alt+Delete   remove this row
 */
export function nextCell(e: KeyEvent, pos: { row: number; col: number }, dims: { rows: number; cols: number }, ctx: { kind: CellKind; atStart: boolean; atEnd: boolean }): GridMove {
  const { row, col } = pos;
  const go = (r: number, c: number): GridMove => {
    const nr = Math.min(Math.max(r, 0), dims.rows - 1);
    const nc = Math.min(Math.max(c, 0), dims.cols - 1);
    return nr === row && nc === col ? null : { row: nr, col: nc };
  };
  if (e.key === 'Enter' && e.ctrl) return 'add';
  if (e.key === 'Delete' && e.alt) return 'remove';
  if (e.key === 'Enter' && !e.alt && ctx.kind !== 'textarea') return go(row + (e.shift ? -1 : 1), col);
  const plainRows = ctx.kind === 'text' || ctx.kind === 'checkbox';
  const edgeCols = ctx.kind === 'checkbox' || ctx.kind === 'text' || ctx.kind === 'combo';
  if (e.key === 'ArrowDown' && !e.alt && !e.shift && (e.ctrl || plainRows)) return go(row + 1, col);
  if (e.key === 'ArrowUp' && !e.alt && !e.shift && (e.ctrl || plainRows)) return go(row - 1, col);
  if (e.key === 'ArrowRight' && !e.alt && !e.shift && (e.ctrl || (edgeCols && (ctx.kind === 'checkbox' || ctx.atEnd)))) return go(row, col + 1);
  if (e.key === 'ArrowLeft' && !e.alt && !e.shift && (e.ctrl || (edgeCols && (ctx.kind === 'checkbox' || ctx.atStart)))) return go(row, col - 1);
  return null;
}
