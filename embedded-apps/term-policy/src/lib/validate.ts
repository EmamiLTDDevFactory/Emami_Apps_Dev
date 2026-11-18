// Helpers for the form. The Web Dynpro's submit rules live in SAP (ZCL_LIFE_INS_UTILS->SAVE_POLICY), which is the only authority:
// Submit always goes to SAP, so the first error is the one SAP raises (the cut-off date first, then the legacy field checks).
import { type Nominee } from '../types/policy';

export function activeNominees(nominees: Nominee[]): Nominee[] {
  return nominees.filter((n) => n.name.trim() || n.share.trim());
}

export function shareTotal(nominees: Nominee[]): number {
  return activeNominees(nominees).reduce((s, n) => s + (Number(n.share) || 0), 0);
}

/** Which field a SAP message is about, to highlight it ('' = no particular field, e.g. the date limit). */
export function fieldFor(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('mobile')) return 'contact';
  if (m.includes('mail')) return 'personalEmail';
  if (m.includes('sum')) return 'sumAssured';
  if (m.includes('nominee') || m.includes('share') || m.includes('relation')) return 'nominees';
  return '';
}

export const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
