'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import Banner, { type BannerState } from './Banner';
import { ConfirmDialog, Section, Spinner, TableWrap, inputCls, selectCls, td, th } from './ui';
import { blankRow, type MaintApi, type MaintRow } from '../lib/maint';

/** One editable column of a master table. `field` is the MaintRow property the value is read from and written to. */
export interface GridCol {
  field: keyof MaintRow;
  label: string;
  type?: 'text' | 'number' | 'select';
  options?: { value: string; label: string }[];
  width?: string;
  /** Cannot be edited on a row that already exists in SAP (the key). */
  keyCol?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Shown value of what SAP sent (for example strip the leading zeros of a NUMC age). */
  load?: (v: string) => string;
  maxLength?: number;
}

export interface GridProps {
  /** SAP table code (BASE, TOPUP, MPERIOD, AUTH, SLAB, LIMIT, ...). */
  table: string;
  title: string;
  note?: string;
  cols: GridCol[];
  api: MaintApi;
  /** Rows belong to one policy year: a year is passed to SAP, the whole year is replaced on save, and it can be copied to another year. */
  year?: string;
  onYearChange?: (y: string) => void;
  /** replace = the grid is the whole table / year (one atomic call). diff = only added, changed and removed rows are sent (large or keyed lists). */
  mode: 'replace' | 'diff';
  /** Fields that identify a row (diff mode). Default: the keyCol columns. */
  identity?: (keyof MaintRow)[];
  searchable?: boolean;
  canCopy?: boolean;
  /** Extra client-side check before saving; return the message to show or null. */
  validate?: (rows: MaintRow[]) => string | null;
  /** Last step before a replace-save: order or renumber the rows. */
  prepare?: (rows: MaintRow[]) => MaintRow[];
  /** Prefill of a new row. */
  newRow?: (rows: MaintRow[]) => Partial<MaintRow>;
  /** Called after a successful save (for example to refresh the app context). */
  onSaved?: () => void;
  emptyText?: string;
}

interface Item {
  id: number;
  row: MaintRow;
  /** Values as loaded; null for a row added in this session. */
  orig: MaintRow | null;
}

const SHOW_MAX = 300;
let seq = 1;

const sameRow = (a: MaintRow, b: MaintRow, cols: GridCol[]) => cols.every((c) => a[c.field] === b[c.field]);

export default function MasterGrid(p: GridProps) {
  const { table, cols, api, year, mode } = p;
  const [items, setItems] = useState<Item[]>([]);
  const [removed, setRemoved] = useState<MaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [q, setQ] = useState('');
  const [copyTo, setCopyTo] = useState('');
  const [confirm, setConfirm] = useState<null | 'clear' | 'copy'>(null);
  const identity = useMemo(() => p.identity ?? cols.filter((c) => c.keyCol).map((c) => c.field), [p.identity, cols]);

  const load = useCallback(async () => {
    setLoading(true);
    setBanner(null);
    try {
      const rows = await api.list(table, year);
      const norm = rows.map((r) => {
        const out = { ...r };
        for (const c of cols) if (c.load) out[c.field] = c.load(out[c.field]);
        return out;
      });
      setItems(norm.map((r) => ({ id: seq++, row: r, orig: { ...r } })));
      setRemoved([]);
    } catch (e) {
      setItems([]);
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not load.' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, table, year]);
  useEffect(() => {
    if (p.onYearChange && !year) {
      setItems([]);
      setLoading(false);
      return;
    }
    void load();
  }, [load, p.onYearChange, year]);

  const dirty = removed.length > 0 || items.some((i) => !i.orig || !sameRow(i.row, i.orig, cols));

  const edit = (id: number, field: keyof MaintRow, value: string) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, row: { ...i.row, [field]: value } } : i)));
  const add = () =>
    setItems((cur) => [{ id: seq++, row: { ...blankRow(), year: year ?? '', ...(p.newRow ? p.newRow(cur.map((i) => i.row)) : {}) }, orig: null }, ...cur]);
  const del = (it: Item) => {
    setItems((cur) => cur.filter((i) => i.id !== it.id));
    if (it.orig) setRemoved((cur) => [...cur, it.orig as MaintRow]);
  };

  const check = (rows: MaintRow[]): string | null => {
    for (const r of rows) {
      for (const c of cols) {
        const v = r[c.field].trim();
        if (c.required && !v) return `${c.label} is required.`;
        if (c.type === 'number' && v && !/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, ''))) return `${c.label} "${v}" is not a number.`;
      }
    }
    return p.validate ? p.validate(rows) : null;
  };
  const clean = (r: MaintRow): MaintRow => {
    const out = { ...r, year: year ?? r.year };
    for (const c of cols) out[c.field] = out[c.field].trim().replace(c.type === 'number' ? /,/g : /$^/, '');
    return out;
  };

  const save = async (confirmedClear = false) => {
    setBanner(null);
    const rows = items.map((i) => i.row);
    const msg = check(rows);
    if (msg) return setBanner({ type: 'error', message: msg });
    if (mode === 'replace' && rows.length === 0 && !confirmedClear) return setConfirm('clear');
    setBusy(true);
    try {
      if (mode === 'replace') {
        await api.apply(table, 'REPLACE', (p.prepare ? p.prepare(rows.map(clean)) : rows.map(clean)), { year });
      } else {
        const sameKey = (a: MaintRow, b: MaintRow) => identity.every((f) => a[f] === b[f]);
        const changed = items.filter((i) => !i.orig || !sameRow(i.row, i.orig, cols)).map((i) => clean(i.row));
        const gone = removed.filter((r) => !rows.some((x) => sameKey(x, r)));
        if (changed.length) await api.apply(table, 'SAVE', changed, { year });
        if (gone.length) await api.apply(table, 'DELETE', gone.map(clean), { year });
      }
      setBanner({ type: 'success', message: 'Saved.' });
      p.onSaved?.();
      await load();
      setBanner({ type: 'success', message: 'Saved.' });
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    setConfirm(null);
    setBusy(true);
    setBanner(null);
    try {
      const n = await api.apply(table, 'COPY', [], { year, toYear: copyTo });
      p.onYearChange?.(copyTo);
      setBanner({ type: 'success', message: `Copied ${n} row(s) from ${year} to ${copyTo}.` });
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not copy.' });
    } finally {
      setBusy(false);
    }
  };

  const needle = q.trim().toLowerCase();
  const visible = needle ? items.filter((i) => Object.values(i.row).some((v) => v.toLowerCase().includes(needle))) : items;
  const shown = visible.slice(0, SHOW_MAX);

  return (
    <Section
      title={p.title}
      note={p.note}
      right={
        <div className="flex flex-wrap items-center gap-2">
          {p.searchable && (
            <label className="relative">
              <Search size={13} className="pointer-events-none absolute left-2 top-2.5 text-inkSoft" />
              <input className={`${inputCls()} !w-40 !pl-7`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-[12px]" onClick={() => void load()} disabled={busy || loading}>
            <RefreshCw size={13} /> Reload
          </button>
          <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-[12px]" onClick={add} disabled={busy || loading}>
            <Plus size={13} /> Add row
          </button>
        </div>
      }
    >
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      {loading ? (
        <Spinner />
      ) : (
        <>
          <TableWrap>
            <table className="w-full min-w-[420px]">
              <thead className="bg-appBg">
                <tr>
                  {cols.map((c) => (
                    <th key={c.field} className={th} style={c.width ? { width: c.width } : undefined}>
                      {c.label}
                      {c.required && <span className="ml-0.5 text-red">*</span>}
                    </th>
                  ))}
                  <th className={th} style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td className={`${td} text-inkSoft`} colSpan={cols.length + 1}>
                      {p.emptyText ?? 'No rows. Use Add row.'}
                    </td>
                  </tr>
                )}
                {shown.map((it) => (
                  <tr key={it.id} className={`border-t border-border ${!it.orig ? 'bg-greenBg/40' : it.orig && !sameRow(it.row, it.orig, cols) ? 'bg-glassRust/40' : ''}`}>
                    {cols.map((c) => {
                      const locked = c.keyCol && !!it.orig;
                      const v = it.row[c.field];
                      return (
                        <td key={c.field} className="px-1.5 py-1">
                          {c.type === 'select' ? (
                            <select className={selectCls()} value={v} onChange={(e) => edit(it.id, c.field, e.target.value)} disabled={locked}>
                              {c.options?.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className={inputCls()}
                              value={v}
                              inputMode={c.type === 'number' ? 'decimal' : undefined}
                              placeholder={c.placeholder}
                              maxLength={c.maxLength}
                              disabled={locked}
                              onChange={(e) => edit(it.id, c.field, e.target.value)}
                              aria-label={c.label}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-1.5 py-1 text-center">
                      <button type="button" onClick={() => del(it)} aria-label="Remove row" className="p-1 text-inkSoft hover:text-red">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="mt-1.5 text-[11.5px] font-semibold text-inkSoft">
            {visible.length} row(s){visible.length > SHOW_MAX ? ` - showing the first ${SHOW_MAX}, use Search to narrow down` : ''}
            {dirty ? ' - unsaved changes' : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary !px-4 !py-2 text-[12.5px]" onClick={() => void save()} disabled={busy || !dirty}>
              <Save size={14} /> {busy ? 'Saving...' : 'Save'}
            </button>
            {p.canCopy && year && (
              <span className="ml-auto flex items-center gap-2">
                <input className={`${inputCls()} !w-24`} placeholder="To year" value={copyTo} maxLength={4} onChange={(e) => setCopyTo(e.target.value.replace(/\D/g, ''))} aria-label="Copy to year" />
                <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-[12px]" disabled={busy || dirty || copyTo.length !== 4} onClick={() => setConfirm('copy')}>
                  <Copy size={13} /> Copy {year} to this year
                </button>
              </span>
            )}
          </div>
        </>
      )}
      {confirm === 'clear' && (
        <ConfirmDialog
          title="Clear this year?"
          message={`There are no rows left, so saving removes every ${p.title.toLowerCase()} row of ${year ?? 'the table'}.`}
          confirmLabel="Clear"
          onConfirm={() => {
            setConfirm(null);
            void save(true);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === 'copy' && (
        <ConfirmDialog
          title={`Copy ${year} to ${copyTo}?`}
          message={`Every row of ${year} is copied to ${copyTo}. This fails when ${copyTo} already has rows.`}
          confirmLabel="Copy"
          onConfirm={() => void copy()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Section>
  );
}
