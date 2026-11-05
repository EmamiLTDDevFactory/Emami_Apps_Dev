'use client';
/** Hooks over the shared in-memory cache (lib/wac/cache.ts): same selection -> same key -> one result until Refresh; nothing loads by itself. */
import { useSyncExternalStore } from 'react';
import { ensure, peek, subscribe, type WacEntry } from '../wac/cache';
import { buildBudgetFilter, type BudgetQuery } from './filter';
import { fetchBudgetCheck, fetchBudgetSplit, fetchBudgetSummary, fetchPending, fetchPendingDet } from './service';
import type { BudgetCheckRow, BudgetPendingDetRow, BudgetPendingRow, BudgetSplitRow, BudgetSummaryRow } from './types';

const planKey = (q: BudgetQuery) => q.plants.map((p) => p.trim().toUpperCase()).sort().join(',');
/** Stable key of a whole run (every plant); '' when the selection is not valid yet. */
export function runKey(q: BudgetQuery | null, appUser = ''): string | null {
  if (!q) return null;
  try { return `bud|SUM|${planKey(q)}|${buildBudgetFilter(q, { werks: q.plants[0], appUser })}`; } catch { return null; }
}
export const splitKey = (q: BudgetQuery, matnr: string, werks: string, appUser = ''): string => `bud|SPLIT|${buildBudgetFilter(q, { werks, matnr, appUser })}`;
export const checkKey = (q: BudgetQuery, appUser = ''): string => `bud|CHK|${planKey(q)}|${buildBudgetFilter({ ...q, checklist: true }, { werks: q.plants[0], appUser })}`;
export const pendingKey = (appUser: string) => `bud|PEND|${appUser.toLowerCase()}`;
export const pendingDetKey = (appUser: string, gjahr: string, version: string) => `bud|PDET|${appUser.toLowerCase()}|${gjahr}|${version}`;

export function useEntry<T>(key: string | null): WacEntry<T> | undefined {
  return useSyncExternalStore(subscribe, () => peek<T>(key), () => undefined);
}
export const startRun = (q: BudgetQuery, ctx: string, appUser: string, force = false, onPlant?: (w: string, i: number, n: number) => void) =>
  ensure<BudgetSummaryRow>(runKey(q, appUser) as string, ctx, 'BudgetSumSet', (signal) => fetchBudgetSummary(q, { signal, appUser, onPlant }), force);
export const startSplit = (q: BudgetQuery, matnr: string, werks: string, ctx: string, appUser: string, force = false) =>
  ensure<BudgetSplitRow>(splitKey(q, matnr, werks, appUser), ctx, 'BudgetSplitSet', (signal) => fetchBudgetSplit(q, matnr, werks, { signal, appUser }), force);
export const startCheck = (q: BudgetQuery, ctx: string, appUser: string, force = false) =>
  ensure<BudgetCheckRow>(checkKey(q, appUser), ctx, 'BudgetChkSet', (signal) => fetchBudgetCheck(q, { signal, appUser }), force);
export const startPending = (appUser: string, ctx: string, force = false) =>
  ensure<BudgetPendingRow>(pendingKey(appUser), ctx, 'BudgetPendSet', (signal) => fetchPending(appUser, { signal }), force);
export const startPendingDet = (appUser: string, gjahr: string, version: string, ctx: string, force = false) =>
  ensure<BudgetPendingDetRow>(pendingDetKey(appUser, gjahr, version), ctx, 'BudgetPendDetSet', (signal) => fetchPendingDet(appUser, gjahr, version, { signal }), force);
