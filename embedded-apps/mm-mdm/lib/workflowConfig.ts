import { AppId, StatusCode } from './types';

/**
 * Status codes of the request header as SAP sets them (backend STATUS_TEXT): 00 saved as draft, 01 requested, 02 in progress,
 * 03 completed, 04 sent back, 05 rejected. The workflow itself (levels, routing, who may act) lives in SAP; the front end keeps no copy.
 */
export const STATUS: Record<StatusCode, { label: string; cls: string }> = {
  '00': { label: 'Saved as draft', cls: 'badge-neutral' },
  '01': { label: 'Requested', cls: 'badge-info' },
  '02': { label: 'In progress', cls: 'badge-info' },
  '03': { label: 'Completed', cls: 'badge-success' },
  '04': { label: 'Sent back', cls: 'badge-warn' },
  '05': { label: 'Rejected', cls: 'badge-error' },
};

export const STATUS_CODES = Object.keys(STATUS) as StatusCode[];

export const statusOf = (code: string) => STATUS[code as StatusCode] ?? { label: code || 'Unknown', cls: 'badge-neutral' };

export const APPS: { id: AppId; label: string; short: string }[] = [
  { id: 'MC', label: 'Create material', short: 'Create' },
  { id: 'MX', label: 'Change material', short: 'Change' },
  { id: 'ME', label: 'Extend material', short: 'Extension' },
];

export const appLabel = (id: string) => APPS.find((a) => a.id === id)?.short ?? id;

/** 'L3' -> 3, 'L0' -> 0 (initiator); anything else -> 0 */
export const levelNo = (level: string): number => {
  const n = parseInt(/^L(\d+)$/i.exec(level)?.[1] ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
};

/** "Initiator" for L0, "Level 3" otherwise */
export const levelText = (level: string): string => (levelNo(level) === 0 ? 'Initiator' : `Level ${levelNo(level)}`);
