/**
 * Budget component rates, browser -> SAP gateway (the app is a static export, so there are no API routes;
 * the gateway does the CSRF handshake with SAP for writes, as for the Production Plan upload).
 * Entity sets BudCompSet (ZCOMPONENT), BudCompNSet (ZCOMPONENT_N) and BudUploadSet: names as specified,
 * not yet checked against the live $metadata.
 */
import { sapGetCollection, sapWrite, type SapGetOptions } from './sap/client';
import { odataString } from './sap/filter';
import { columnsFor, type BudCompDom, type BudCompIntl, type BudgetSearchParams, type TableType, type UploadResult } from './budgetRatesTypes';

export { BUDGET_RATES_ENABLED } from './budgetRatesFlag';

export const BUD_SET = { DOM: 'BudCompSet', INTL: 'BudCompNSet', UPLOAD: 'BudUploadSet' } as const;

/** Matnr is CHAR18 with leading zeros in SAP: numeric material numbers are padded. */
export const padMatnr = (m: string) => { const t = String(m).trim().toUpperCase(); return /^\d+$/.test(t) ? t.padStart(18, '0') : t; };

const orClause = (field: string, values: string[]) => {
  const u = Array.from(new Set(values.filter(Boolean).map(odataString)));
  if (!u.length) return null;
  const parts = u.map((l) => `${field} eq ${l}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' or ')})`;
};

export function budgetFilter(p: BudgetSearchParams): string {
  return [
    `Gjahr eq ${odataString(p.gjahr)}`,
    orClause('Werks', p.werks.map((w) => w.toUpperCase())),
    orClause('Matnr', p.matnr.map(padMatnr)),
    p.tableType === 'INTL' ? orClause('Land1', p.land1) : null,
  ].filter(Boolean).join(' and ');
}

/** Edm.DateTime comes as "/Date(ms)/" from SAP gateways: kept as YYYYMMDD like the other date fields. */
function dateText(v: unknown): string {
  const s = String(v ?? '');
  const m = /^\/Date\((-?\d+)/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function normalizeRow(raw: Record<string, unknown>, t: TableType): BudCompDom | BudCompIntl {
  const out: Record<string, unknown> = {};
  for (const col of columnsFor(t)) {
    const v = raw[col.key];
    out[col.key] = col.kind === 'a' || col.kind === 'p' ? (Number(v) || 0) : col.kind === 'd' ? dateText(v) : String(v ?? '');
  }
  return out as unknown as BudCompDom | BudCompIntl;
}

export async function fetchBudget(p: BudgetSearchParams, opts: SapGetOptions = {}) {
  const r = await sapGetCollection(p.tableType === 'DOM' ? BUD_SET.DOM : BUD_SET.INTL, { $filter: budgetFilter(p) }, opts);
  return { rows: r.rows.map((x) => normalizeRow(x as Record<string, unknown>, p.tableType)), messages: r.messages, ms: r.ms };
}

export interface BudgetWriteInput {
  tableType: 'DOM' | 'INTL' | 'RECALC';
  gjahr: string;
  land1?: string;
  werksCsv?: string;
  matnrCsv?: string;
  rows?: object[];
}

/** Create on BudUploadSet. TableType DOM / INTL = upload the rows, RECALC = recompute the rows SAP already has. */
export async function writeBudget(i: BudgetWriteInput, opts: SapGetOptions = {}): Promise<UploadResult> {
  const r = await sapWrite('POST', BUD_SET.UPLOAD, {
    TableType: i.tableType,
    Gjahr: i.gjahr,
    Land1: i.land1 ?? '',
    WerksCsv: i.werksCsv ?? '',
    MatnrCsv: i.matnrCsv ?? '',
    Payload: JSON.stringify(i.rows ?? []),
  }, opts);
  const d = ((r.body as { d?: Record<string, unknown> } | null)?.d ?? r.body ?? {}) as Record<string, unknown>;
  return {
    TableType: String(d.TableType ?? i.tableType),
    RowsSaved: Number(d.RowsSaved) || 0,
    RowsFailed: Number(d.RowsFailed) || 0,
    Message: String(d.Message ?? ''),
    Errors: String(d.Errors ?? ''),
  };
}

/** Recalculate the SAP rows of a search (no file). The domestic / international table is told apart by Land1. */
export const recalcBudget = (p: BudgetSearchParams, opts: SapGetOptions = {}) =>
  writeBudget({ tableType: 'RECALC', gjahr: p.gjahr, land1: p.tableType === 'INTL' ? p.land1.join(',') : '', werksCsv: p.werks.join(','), matnrCsv: p.matnr.map(padMatnr).join(',') }, opts);
