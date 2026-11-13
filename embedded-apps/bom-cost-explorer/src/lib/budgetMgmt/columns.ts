/** Columns of the History table that can be hidden (the tick box, the arrow and the Material column always stay). `idx` = 1-based position of the column in the table. */
export const HIST_COLS = [
  { key: 'description', label: 'Description' }, { key: 'uom', label: 'UOM' }, { key: 'netQty', label: 'Net Qty' }, { key: 'netValue', label: 'Net Value (Lakhs)' }, { key: 'curr', label: 'Curr' },
  { key: 'avgRate', label: 'Avg Rate' }, { key: 'ctryValue', label: 'Country Total' }, { key: 'avgBase', label: 'Avg Base Price' }, { key: 'lastPrice', label: 'Last Price' }, { key: 'basis', label: 'Rate basis' },
  { key: 'projRate', label: 'Proj Rate' }, { key: 'projValue', label: 'Proj Value (Lakhs)' }, { key: 'cat', label: 'Cat' }, { key: 'segment', label: 'Segment' }, { key: 'derived', label: 'Derived Rate' },
  { key: 'freight', label: 'Freight' }, { key: 'landed', label: 'Landed Rate' }, { key: 'frtTotal', label: 'Delivery Charges' }, { key: 'rule', label: 'Rule & breakup' },
].map((c, i) => ({ ...c, idx: i + 4 }));

export const HIST_LAYOUT_KEY = 'bm:history:layout';
export const readHistLayout = (): string[] | null => {
  try { const v = JSON.parse(localStorage.getItem(HIST_LAYOUT_KEY) ?? 'null'); return Array.isArray(v?.hidden) ? v.hidden.filter((k: unknown) => HIST_COLS.some((c) => c.key === k)) : null; } catch { return null; }
};
export const writeHistLayout = (hidden: string[]): boolean => { try { localStorage.setItem(HIST_LAYOUT_KEY, JSON.stringify({ hidden })); return true; } catch { return false; } };
export const clearHistLayout = () => { try { localStorage.removeItem(HIST_LAYOUT_KEY); } catch { /* nothing kept */ } };
