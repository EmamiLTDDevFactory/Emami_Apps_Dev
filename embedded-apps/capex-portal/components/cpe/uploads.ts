/**
 * Document upload step of Save Draft / Submit (log #51/#66/#73-#75/#83-#91). Runs after the CPESet create and BEFORE SubmitCPE.
 * Sequential, one call per picked slot. A fixed slot replaces the previous SAP file of that slot; GEN accumulates.
 * `done` records the slots already sent, so a retry after a failure uploads only the failed/remaining files (never twice).
 */
import { uploadDocument } from '@/lib/documents';
import type { Attachments, AttachSlot } from './logic';

export function slotsOf(att: Attachments): Array<{ slot: AttachSlot; category: string }> {
  return [
    ...att.rfq.map((s) => ({ slot: s, category: s.id })),
    ...att.quotation.map((s) => ({ slot: s, category: s.id })),
    { slot: att.tcc, category: 'TCC' },
    { slot: att.negotiation, category: 'NEGOTIATION' },
    { slot: att.justification, category: 'JUSTIFICATION' },
    ...att.general.map((s) => ({ slot: s, category: 'GEN' })),
  ];
}

/** Slots that still have a picked file to send. */
export function pendingUploads(att: Attachments, files: Record<string, File>, done: Set<string>) {
  return slotsOf(att).filter(({ slot }) => files[slot.id] && !done.has(slot.id));
}

/** Sequential upload; rejects with "Upload failed for <slot>: <SAP message>" at the first failure (earlier ones stay in `done`). */
export async function uploadAll(cpeId: string, att: Attachments, files: Record<string, File>, done: Set<string> = new Set()): Promise<void> {
  for (const { slot, category } of pendingUploads(att, files, done)) {
    try {
      await uploadDocument({ doctype: 'CPE', docid: cpeId, category, file: files[slot.id], title: slot.title || slot.label, note: slot.note });
      done.add(slot.id);
    } catch (e) {
      throw new Error('Upload failed for ' + slot.label + ' (' + files[slot.id].name + '): ' + (e instanceof Error ? e.message : 'unknown error'));
    }
  }
}

const CAT_LABEL: Record<string, string> = {
  RFQ1: 'RFQ 1', RFQ2: 'RFQ 2', RFQ3: 'RFQ 3', QUOTE1: 'Quotation 1', QUOTE2: 'Quotation 2', QUOTE3: 'Quotation 3',
  TCC: 'Techno Commercial Comparative', NEGOTIATION: 'Negotiation History', JUSTIFICATION: 'Justification Note',
  GEN: 'General / Additional', AMT_REV: 'Amount Revision',
};
export const categoryLabel = (c: string): string => CAT_LABEL[c] ?? c;

/** Categories offered in the Attachments upload dialog: everything except AMT_REV unless admin. */
export function uploadCategories(all: readonly string[], isAdmin: boolean): string[] {
  return all.filter((c) => isAdmin || c !== 'AMT_REV');
}
