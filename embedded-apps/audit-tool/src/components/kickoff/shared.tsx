'use client';

// Helpers shared by the Audit Kickoff and Pending screens (ported from auditKickoff.controller.js
// and pending.controller.js, which share the same filter-bar logic line for line).
import React, { useEffect, useState } from 'react';
import { F, Or, And, type Filter, type MultiFilter } from '../../lib/odata';

/** The source's exact dedupe idiom:
 *   Object.values(rows.reduce((acc, cur) => Object.assign(acc, { [cur[key]]: cur }), {}))
 * kept literally (rather than a Map) so the resulting order matches — JS objects put
 * integer-like keys (e.g. financial years "2024") first in ascending order. */
export function dedupeBy<T extends Record<string, any>>(rows: T[], key: string): T[] {
  return Object.values(rows.reduce((acc: Record<string, T>, cur) => Object.assign(acc, { [cur[key]]: cur }), {}));
}

/** Non-empty unique values of `key` as Select options, in dedupeBy order. */
export function keyOptions(rows: Record<string, any>[], key: string): { key: string; text: string }[] {
  return dedupeBy(rows, key)
    .map((r) => (r[key] == null ? '' : String(r[key])))
    .filter((k) => k !== '')
    .map((k) => ({ key: k, text: k }));
}

/** new Filter({ filters: [ new Filter({ filters: [new Filter(path, EQ, value)], and: false }) ], and: true }) —
 * the Legal Entity root every filter-bar handler starts from. Further criteria are pushed onto
 * .filters (aFilters.push) each wrapped in its own single-item OR group, same as the source. */
export function rootFilter(legalEntity: string): MultiFilter {
  return And([Or([F('LglEnt', 'EQ', legalEntity)])]);
}

export function pushEq(root: MultiFilter, path: string, value: string) {
  root.filters.push(Or([F(path, 'EQ', value)]) as Filter);
}

/** Header clock (the source's timeText/dateText pair, refreshed continuously). */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="text-[12px] font-semibold text-inkSoft">
      {now.toLocaleTimeString()} &nbsp; {now.toDateString()}
    </span>
  );
}

export interface UserRow {
  Fname?: string;
  Lname?: string;
  Uname?: string;
  IsAuditManager?: string;
  [k: string]: any;
}

export function fullName(u: UserRow): string {
  return `${u.Fname} ${u.Lname}`;
}

/** Audit managers only — every ZUSER_MASTERSet read in these screens keeps IsAuditManager == 'X'. */
export function auditManagers(results: UserRow[]): UserRow[] {
  return results.filter((u) => u.IsAuditManager == 'X');
}

/** A sap.m.Select bound to a user list with key "{Fname} {Lname}" (forceSelection=false): the
 * blank entry stands for "no selection". onPick receives the exact user row chosen (the source
 * reads the selected item's binding context), not just the name. */
export function UserSelect({
  users,
  value,
  onPick,
  className = '',
  placeholder = '',
}: {
  users: UserRow[];
  value: string;
  onPick: (name: string, user: UserRow | null) => void;
  className?: string;
  placeholder?: string;
}) {
  const idx = users.findIndex((u) => fullName(u) === value);
  return (
    <select
      className={`select ${className}`}
      value={idx >= 0 ? String(idx) : ''}
      onChange={(e) => {
        const i = e.target.value === '' ? -1 : Number(e.target.value);
        if (i < 0) onPick('', null);
        else onPick(fullName(users[i]), users[i]);
      }}
    >
      <option value="">{placeholder}</option>
      {users.map((u, i) => (
        <option key={i} value={String(i)}>
          {fullName(u)}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------------------------
// Filter bar (Legal Entity / Financial Year / Sub Entity 1 / Sub Entity 2 / Scheduling /
// Performer / Reviewer) — onFilterFinancialYear, onFilterSubEntity1/2/3, onFilterPerformer and
// onFilterReviewer ported exactly, including which criteria each handler includes
// unconditionally vs. only when non-blank.
// ---------------------------------------------------------------------------------------------

export interface FilterBarState {
  le: string;
  fy: string;
  s1: string;
  s2: string;
  s3: string;
  perf: string;
  rev: string;
}

export const EMPTY_BAR: FilterBarState = { le: '', fy: '', s1: '', s2: '', s3: '', perf: '', rev: '' };

export interface FilterBarOptions {
  sub1: Record<string, any>[];
  sub2: Record<string, any>[];
  sub3: Record<string, any>[];
}

export const EMPTY_OPTIONS: FilterBarOptions = { sub1: [], sub2: [], sub3: [] };

type Change = { bar: FilterBarState; options?: Partial<FilterBarOptions>; tableFilter: MultiFilter };

/** `data` is the screen's /…/Data (all rows of the last non-empty read); `le` is the Legal
 * Entity select's effective key (forceSelection=true, so the first entry when none chosen). */
export function filterBarChange(
  field: keyof Omit<FilterBarState, 'le'>,
  key: string,
  bar: FilterBarState,
  le: string,
  data: Record<string, any>[],
  opts: { performerAlwaysFY: boolean },
): Change {
  const root = rootFilter(le);
  let next: FilterBarState;
  let options: Partial<FilterBarOptions> | undefined;

  switch (field) {
    case 'fy': {
      const sub1 = dedupeBy(data.filter((d) => d.FinancialYear == key), 'SubLglEntL1');
      sub1.push({ SubLglEntL1: '' });
      options = { sub1 };
      next = { ...bar, fy: key, s1: '', s2: '', s3: '', perf: '', rev: '' };
      if (key != '') pushEq(root, 'FinancialYear', key);
      break;
    }
    case 's1': {
      const sub2 = dedupeBy(data.filter((d) => d.SubLglEntL1 == key), 'SubLglEntL2');
      sub2.push({ SubLglEntL2: '' });
      options = { sub2 };
      next = { ...bar, s1: key, s2: '', s3: '', perf: '', rev: '' };
      pushEq(root, 'FinancialYear', bar.fy);
      if (key != '') pushEq(root, 'SubLglEntL1', key);
      break;
    }
    case 's2': {
      const sub3 = dedupeBy(data.filter((d) => d.SubLglEntL2 == key), 'Scheduling');
      sub3.push({ Scheduling: '' });
      options = { sub3 };
      next = { ...bar, s2: key, s3: '', perf: '', rev: '' };
      pushEq(root, 'FinancialYear', bar.fy);
      pushEq(root, 'SubLglEntL1', bar.s1);
      if (key != '') pushEq(root, 'SubLglEntL2', key);
      break;
    }
    case 's3': {
      next = { ...bar, s3: key, perf: '', rev: '' };
      pushEq(root, 'FinancialYear', bar.fy);
      pushEq(root, 'SubLglEntL1', bar.s1);
      pushEq(root, 'SubLglEntL2', bar.s2);
      if (key != '') pushEq(root, 'Scheduling', key);
      break;
    }
    case 'perf': {
      next = { ...bar, perf: key };
      if (opts.performerAlwaysFY || bar.fy != '') pushEq(root, 'FinancialYear', bar.fy);
      if (bar.s1 != '') pushEq(root, 'SubLglEntL1', bar.s1);
      if (bar.s2 != '') pushEq(root, 'SubLglEntL2', bar.s2);
      if (bar.rev != '') pushEq(root, 'Reviewer', bar.rev);
      if (key != '') pushEq(root, 'Performer', key);
      break;
    }
    case 'rev':
    default: {
      next = { ...bar, rev: key };
      if (bar.fy != '') pushEq(root, 'FinancialYear', bar.fy);
      if (bar.s1 != '') pushEq(root, 'SubLglEntL1', bar.s1);
      if (bar.s2 != '') pushEq(root, 'SubLglEntL2', bar.s2);
      if (bar.perf != '') pushEq(root, 'Performer', bar.perf);
      if (key != '') pushEq(root, 'Reviewer', key);
      break;
    }
  }
  return { bar: next, options, tableFilter: root };
}

function OptSelect({
  value,
  onChange,
  rows,
  field,
  force,
  label,
}: {
  value: string;
  onChange: (k: string) => void;
  rows: Record<string, any>[];
  field: string;
  force?: boolean;
  label: string;
}) {
  const keys = rows.map((r) => (r[field] == null ? '' : String(r[field])));
  const nonBlank = keys.filter((k, i) => k !== '' && keys.indexOf(k) === i);
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="field-label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {!force && <option value="" />}
        {nonBlank.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The screen's two filter rows. `legalEntities`/`financialYears` are the /…/LegalEntity and
 * /…/FinancialYear lists; `users` is /…/FilterUserPerformer (Pending binds BOTH selects to it). */
export function FilterBar({
  bar,
  effectiveLe,
  legalEntities,
  financialYears,
  options,
  performers,
  reviewers,
  onLegalEntity,
  onChange,
  children,
}: {
  bar: FilterBarState;
  effectiveLe: string;
  legalEntities: Record<string, any>[];
  financialYears: Record<string, any>[];
  options: FilterBarOptions;
  performers: UserRow[];
  reviewers: UserRow[];
  onLegalEntity: (k: string) => void;
  onChange: (field: keyof Omit<FilterBarState, 'le'>, key: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="card space-y-2 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <OptSelect label="Legal Entity" value={effectiveLe} onChange={onLegalEntity} rows={legalEntities} field="LglEnt" force />
        <OptSelect label="Financial Year" value={bar.fy} onChange={(k) => onChange('fy', k)} rows={financialYears} field="FinancialYear" />
        <OptSelect label="Sub Entity 1" value={bar.s1} onChange={(k) => onChange('s1', k)} rows={options.sub1} field="SubLglEntL1" />
        <OptSelect label="Sub Entity 2" value={bar.s2} onChange={(k) => onChange('s2', k)} rows={options.sub2} field="SubLglEntL2" />
      </div>
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <OptSelect label="Scheduling" value={bar.s3} onChange={(k) => onChange('s3', k)} rows={options.sub3} field="Scheduling" />
        <label className="flex min-w-0 flex-col gap-1">
          <span className="field-label">Performer</span>
          <UserSelect users={performers} value={bar.perf} onPick={(name) => onChange('perf', name)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="field-label">Reviewer</span>
          <UserSelect users={reviewers} value={bar.rev} onPick={(name) => onChange('rev', name)} />
        </label>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}

/** forceSelection="true" on the Legal Entity select: the chosen key if still listed, else the first. */
export function effectiveLegalEntity(le: string, legalEntities: Record<string, any>[]): string {
  const keys = legalEntities.map((r) => (r.LglEnt == null ? '' : String(r.LglEnt)));
  if (keys.includes(le)) return le;
  return keys[0] ?? '';
}
