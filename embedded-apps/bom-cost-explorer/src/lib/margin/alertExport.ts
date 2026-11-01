'use client';
/** Excel export of the Alerts screen: one sheet in the order shown, and the parameters. SAP figures as sent. */
import type { WacSheet } from '../wac/export';
import { downloadWacWorkbook } from '../wac/export';
import { dec } from '../wac/view';
import { IMPACT_WORD, SEVERITY_WORD, impactDirection, scopeText } from './alertView';
import type { MarginAlert } from './types';

const n = (v: string) => { const d = dec(v); return d ? Number(d.toFixed(6)) : null; };
export const ALERT_HEADERS = ['Rule', 'Severity', 'Scope', 'Finished good', 'Description', 'Plant', 'Market', 'Channel', 'Component', 'Finished goods affected', 'Text', 'Value', 'Threshold', 'Impact INR', 'Loss / saving'] as const;
export function alertSheet(rows: MarginAlert[]): WacSheet {
  const t = (k: keyof MarginAlert) => (i: number) => String(rows[i][k] ?? '');
  const cols = [
    { header: ALERT_HEADERS[0], width: 7, get: t('Rule') }, { header: ALERT_HEADERS[1], width: 10, get: (i: number) => SEVERITY_WORD[rows[i].Severity] },
    { header: ALERT_HEADERS[2], width: 40, get: (i: number) => scopeText(rows[i]) }, { header: ALERT_HEADERS[3], width: 14, get: t('Matnr') }, { header: ALERT_HEADERS[4], width: 34, get: t('Maktx') },
    { header: ALERT_HEADERS[5], width: 8, get: t('Werks') }, { header: ALERT_HEADERS[6], width: 10, get: t('Market') }, { header: ALERT_HEADERS[7], width: 12, get: t('Channel') },
    { header: ALERT_HEADERS[8], width: 14, get: t('Comp') }, { header: ALERT_HEADERS[9], width: 10, get: (i: number) => (rows[i].Scope === 'C' ? rows[i].FgCnt ?? null : null) }, { header: ALERT_HEADERS[10], width: 60, get: t('Text') },
    { header: ALERT_HEADERS[11], dp: 4, width: 14, get: (i: number) => n(rows[i].Value) }, { header: ALERT_HEADERS[12], dp: 4, width: 14, get: (i: number) => n(rows[i].Threshold) },
    { header: ALERT_HEADERS[13], dp: 2, curr: 'INR', width: 16, get: (i: number) => n(rows[i].ImpactInr) }, { header: ALERT_HEADERS[14], width: 12, get: (i: number) => IMPACT_WORD[impactDirection(rows[i].ImpactInr)] },
  ];
  return { name: 'Alerts', cols, count: rows.length };
}
export const downloadAlerts = (rows: MarginAlert[], params: [string, string][]) => downloadWacWorkbook([alertSheet(rows)], params, 'margin-alerts');
