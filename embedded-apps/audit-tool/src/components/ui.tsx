'use client';

// Small, shared building blocks standing in for the sap.m controls the source Fiori views are
// built from — Page (with a nav-back to the dashboard), Table (with MultiSelect/SingleSelect modes
// and growing), Dialog, SelectDialog/TableSelectDialog (value help with search), IconTabBar, plus
// labelled form fields. Styled with the hub's own palette (tailwind.config.ts) so the app reads as
// part of Emami Apps rather than a SAP theme.
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Search, X, ChevronDown } from 'lucide-react';

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export function Page({
  title,
  onBack,
  backHref = '/',
  actions,
  children,
}: {
  title: React.ReactNode;
  /** Custom back behaviour; defaults to navigating to backHref (the dashboard), like each Fiori
   * page's onNavBack -> navTo("secondImage"). Pass null to hide the back button. */
  onBack?: (() => void) | null;
  backHref?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const showBack = onBack !== null;
  return (
    <div className="animate-fadeIn space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {showBack && (
          <button
            type="button"
            onClick={() => (onBack ? onBack() : router.push(backHref))}
            aria-label="Back"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-inkSoft hover:text-ink"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="flex-1 text-[17px] font-bold text-ink">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`card p-3 sm:p-4 ${className}`}>{children}</div>;
}

export function Toolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-end gap-2 ${className}`}>{children}</div>;
}

// ---------------------------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------------------------

export function Field({
  label,
  required,
  children,
  className = '',
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="field-label">
        {label}
        {required && <span className="ml-0.5 text-red">*</span>}
      </span>
      {children}
    </label>
  );
}

export interface Option {
  key: string;
  text: string;
}

/** sap.m.Select. `placeholder` renders an empty-key first option (forceSelection=false). */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className = '',
  width,
}: {
  value: string;
  onChange: (key: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  width?: string;
}) {
  return (
    <div className={`relative ${className}`} style={width ? { width } : undefined}>
      <select
        className="select appearance-none pr-7"
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o, i) => (
          <option key={`${o.key}-${i}`} value={o.key}>
            {o.text}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-inkSoft" />
    </div>
  );
}

/** Unique, order-preserving option list from rows — the Fiori app's recurring
 * Object.values(rows.reduce((acc, cur) => Object.assign(acc, {[cur.X]: cur}), {})) dedupe idiom.
 * Note that idiom keeps the LAST row per key, and — being a plain object — orders integer-like keys
 * (e.g. fiscal years) ascending first, then the rest in first-appearance order. This reproduces it
 * literally rather than with a Map, so option lists come out in the same order as the Fiori. */
export function uniqueBy<T extends Record<string, any>>(rows: T[], key: keyof T): T[] {
  return Object.values(rows.reduce<Record<string, T>>((acc, cur) => Object.assign(acc, { [String(cur[key])]: cur }), {}));
}

export function optionsFrom<T extends Record<string, any>>(rows: T[], key: keyof T, textKey?: keyof T): Option[] {
  return uniqueBy(rows, key)
    .filter((r) => r[key] !== undefined && r[key] !== null && String(r[key]) !== '')
    .map((r) => ({ key: String(r[key]), text: String(textKey ? r[textKey] ?? r[key] : r[key]) }));
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`input ${props.className || ''}`} />;
}

function toInputDate(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** sap.m.DatePicker bound to a JS Date (local midnight), like UI5's Date type. */
export function DateInput({
  value,
  onChange,
  min,
  max,
  disabled,
  className = '',
}: {
  value: Date | null | undefined;
  onChange: (d: Date | null) => void;
  min?: Date | null;
  max?: Date | null;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      type="date"
      className={`input ${className}`}
      value={toInputDate(value)}
      min={toInputDate(min) || undefined}
      max={toInputDate(max) || undefined}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return onChange(null);
        const [y, m, d] = v.split('-').map(Number);
        onChange(new Date(y, m - 1, d));
      }}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 accent-rust"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export function RadioGroup({
  value,
  onChange,
  options,
  name,
  vertical,
}: {
  value: string;
  onChange: (key: string) => void;
  options: Option[];
  name: string;
  vertical?: boolean;
}) {
  return (
    <div className={`flex ${vertical ? 'flex-col' : 'flex-wrap'} gap-3`}>
      {options.map((o) => (
        <label key={o.key} className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input type="radio" name={name} className="h-4 w-4 accent-rust" checked={value === o.key} onChange={() => onChange(o.key)} />
          {o.text}
        </label>
      ))}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
      <input className="input pl-8" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------------------------

const openDialogs: object[] = [];

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    // Only the most recently opened dialog reacts to Escape, so stacked dialogs (e.g. a user value
    // help over the observation dialog) close one at a time.
    const token = {};
    openDialogs.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openDialogs[openDialogs.length - 1] === token) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openDialogs.indexOf(token);
      if (i >= 0) openDialogs.splice(i, 1);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-plumDeep/40 p-3 backdrop-blur-sm">
      <div role="dialog" className={`flex max-h-[92vh] w-full ${width} animate-slideUp flex-col rounded-xl2 border border-border bg-white shadow-pop`}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex-1 text-[14px] font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-inkSoft hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  /** Plain value used for rendering when no render() and for export. */
  value?: (row: T) => unknown;
  width?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export type SelectionMode = 'None' | 'SingleSelect' | 'SingleSelectLeft' | 'MultiSelect';

function cellValue<T>(col: Column<T>, row: T): React.ReactNode {
  const v = col.value ? col.value(row) : (row as any)[col.key];
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDateDisplay(v);
  return String(v);
}

/** sap.m.Table over an in-memory array. `growingThreshold` mirrors growing="true" — shows that
 * many rows at a time with a "More" button. Selection is by row index into `rows`. */
export function DataTable<T>({
  columns,
  rows,
  selectionMode = 'None',
  selected,
  onSelectionChange,
  onRowPress,
  growingThreshold,
  noDataText = 'No data',
  rowKey,
  maxHeight,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  selectionMode?: SelectionMode;
  selected?: Set<number>;
  onSelectionChange?: (next: Set<number>) => void;
  onRowPress?: (row: T, index: number) => void;
  growingThreshold?: number;
  noDataText?: string;
  rowKey?: (row: T, index: number) => string;
  maxHeight?: string;
  rowClassName?: (row: T, index: number) => string;
}) {
  const [limit, setLimit] = useState(growingThreshold || Infinity);
  useEffect(() => {
    setLimit(growingThreshold || Infinity);
  }, [rows, growingThreshold]);

  const visible = useMemo(() => rows.slice(0, limit), [rows, limit]);
  const sel = selected || new Set<number>();
  const multi = selectionMode === 'MultiSelect';
  const single = selectionMode === 'SingleSelect' || selectionMode === 'SingleSelectLeft';
  const allSelected = multi && rows.length > 0 && rows.every((_, i) => sel.has(i));

  const toggle = (i: number) => {
    if (!onSelectionChange) return;
    if (multi) {
      const next = new Set(sel);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      onSelectionChange(next);
    } else if (single) {
      onSelectionChange(new Set([i]));
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-[1] bg-cream">
            <tr>
              {(multi || single) && (
                <th className="w-9 border-b border-border px-2 py-2 text-left">
                  {multi && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-rust"
                      checked={allSelected}
                      onChange={() => onSelectionChange?.(allSelected ? new Set() : new Set(rows.map((_, i) => i)))}
                      aria-label="Select all"
                    />
                  )}
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                  className={`whitespace-nowrap border-b border-border px-2.5 py-2 font-bold text-inkSoft ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + (multi || single ? 1 : 0)} className="px-3 py-8 text-center text-inkSoft">
                  {noDataText}
                </td>
              </tr>
            )}
            {visible.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                onClick={() => {
                  if (onRowPress) onRowPress(row, i);
                  else if (single) toggle(i);
                }}
                className={`border-b border-border/70 last:border-0 ${sel.has(i) ? 'bg-glassRust' : 'hover:bg-appBg/60'} ${onRowPress || single ? 'cursor-pointer' : ''} ${rowClassName ? rowClassName(row, i) : ''}`}
              >
                {(multi || single) && (
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      className="h-4 w-4 accent-rust"
                      checked={sel.has(i)}
                      onChange={() => toggle(i)}
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2.5 py-1.5 align-middle text-ink ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.className || ''}`}
                  >
                    {c.render ? c.render(row, i) : cellValue(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > visible.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + (growingThreshold || 20))}
          className="w-full border-t border-border bg-cream py-2 text-[12px] font-bold text-rust hover:bg-glassRust"
        >
          More [{visible.length}/{rows.length}]
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// SelectDialog / TableSelectDialog (value help)
// ---------------------------------------------------------------------------------------------

/** sap.m.SelectDialog / TableSelectDialog: searchable list, single or multi select, confirm/cancel.
 * `searchKeys` are the row properties the live search matches (case-insensitive contains), like
 * the Fiori handlers' Filter(key, Contains, value) OR-ed per key. */
export function SelectDialog<T>({
  open,
  title,
  rows,
  columns,
  searchKeys,
  multi,
  onConfirm,
  onClose,
  initialSelected,
}: {
  open: boolean;
  title: string;
  rows: T[];
  columns: Column<T>[];
  searchKeys: string[];
  multi?: boolean;
  onConfirm: (selected: T[]) => void;
  onClose: () => void;
  initialSelected?: (row: T) => boolean;
}) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<Set<T>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery('');
      setSel(new Set(initialSelected ? rows.filter(initialSelected) : []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => searchKeys.some((k) => String((r as any)[k] ?? '').toUpperCase().includes(q)));
  }, [rows, query, searchKeys]);

  const selectedIdx = useMemo(() => new Set(filtered.map((r, i) => (sel.has(r) ? i : -1)).filter((i) => i >= 0)), [filtered, sel]);

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          {multi && (
            <button type="button" className="btn-primary" onClick={() => onConfirm(rows.filter((r) => sel.has(r)))}>
              OK
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <SearchField value={query} onChange={setQuery} className="mb-2" />
      <DataTable
        columns={columns}
        rows={filtered}
        selectionMode={multi ? 'MultiSelect' : 'None'}
        selected={selectedIdx}
        onSelectionChange={(next) => {
          const nextSel = new Set(sel);
          filtered.forEach((r, i) => {
            if (next.has(i)) nextSel.add(r);
            else nextSel.delete(r);
          });
          setSel(nextSel);
        }}
        onRowPress={multi ? undefined : (row) => onConfirm([row])}
        growingThreshold={50}
        maxHeight="55vh"
      />
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Tabs (sap.m.IconTabBar)
// ---------------------------------------------------------------------------------------------

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; text: React.ReactNode; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-[12.5px] font-bold ${value === t.key ? 'border-rust text-rust' : 'border-transparent text-inkSoft hover:text-ink'}`}
        >
          {t.text}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-appBg px-1.5 text-[11px]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Link({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="font-semibold text-rust underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

export function StatusText({ text, state }: { text: React.ReactNode; state?: 'Success' | 'Error' | 'Warning' | 'Information' | 'None' }) {
  const cls =
    state === 'Success'
      ? 'bg-greenBg text-green'
      : state === 'Error'
        ? 'bg-redBg text-red'
        : state === 'Warning'
          ? 'bg-amberBg text-amber'
          : state === 'Information'
            ? 'bg-blueBg text-blue'
            : 'bg-appBg text-inkSoft';
  return <span className={`pill ${cls}`}>{text}</span>;
}

// ---------------------------------------------------------------------------------------------
// Formatting shared by the table and screens
// ---------------------------------------------------------------------------------------------

/** UI5 sap.ui.model.type.Date with pattern dd/MM/yyyy — the display format the Fiori views use. */
export function formatDateDisplay(d: unknown, pattern: 'dd/MM/yyyy' | 'dd.MM.yyyy' | 'dd-MM-yyyy' = 'dd/MM/yyyy'): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const sep = pattern[2];
  return `${dd}${sep}${mm}${sep}${d.getFullYear()}`;
}
