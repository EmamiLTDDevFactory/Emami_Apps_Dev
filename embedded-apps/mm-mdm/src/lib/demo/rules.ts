import { FORM, MANDATORY_EXCLUDED, fieldMeta, isEmptyValue, staticFieldControl } from '@/lib/form';
import type { Message, RequestData, Row } from '@/lib/types';

// Demo rules. They stand in for the SAP validator (class ZCL_MM_MDM_VALIDATOR), which holds the real
// 635 error points. Texts are the ones of message class /INOWITS/CL_MDM_MSG.

const FLAG_DOMAINS = new Set(['XFELD', 'FLAG', 'X', 'CHAR1_X', 'QKZ', 'JV_PPINV', 'LIFO_FIFO']);

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}

export function runRules(data: RequestData): Message[] {
  const out: Message[] = [];
  const mat: Row = data.single['Material'] ?? {};
  const desc: Row = data.single['Description'] ?? {};
  const err = (code: string, message: string, target?: string) => out.push({ code, message, severity: 'E', target });

  if (isEmptyValue(mat['MTART'])) err('E022', 'Please fill Material Type', 'Material/MTART');
  if (isEmptyValue(mat['MBRSH'])) err('E021', 'Please fill Industry Sector', 'Material/MBRSH');
  if (isEmptyValue(desc['MAKTX'])) err('E023', 'Please fill Material Description', 'Description/MAKTX');

  const net = num(mat['NTGEW']);
  const gross = num(mat['BRGEW']);
  if (net !== undefined && gross !== undefined && net > gross) err('E027', 'Net weight is greater than gross weight', 'Material/NTGEW');

  const ean = mat['EAN11'];
  if (!isEmptyValue(ean) && !/^\d+$/.test(String(ean))) err('E055', 'EAN/UPC value can be Numeric only', 'Material/EAN11');

  const minRem = num(mat['MHDRZ']);
  const total = num(mat['MHDHB']);
  if (minRem !== undefined && total !== undefined && minRem > total) err('E063', 'Min. Rem. Shelf Life should be smaller or equal to Total Shelf Life', 'Material/MHDRZ');

  // Hardcoded business rule kept as in the current code (UFGS shelf life)
  if (mat['MTART'] === 'UFGS') {
    if (minRem !== 100) err('E064', 'Please enter the Min. Rem. Shelf Life as 100 for UFGS material type', 'Material/MHDRZ');
    if (total !== 180) err('E065', 'Please enter the Total shelf life as 180 for UFGS material type', 'Material/MHDHB');
  }

  // Generic mandatory check: only for the selected (active) views, fields that are shown, editable and required,
  // not for fields whose domain allows an empty value, never for PLIFZ and STCD4.
  const control = staticFieldControl(String(mat['MTART'] ?? ''));
  for (const viewId of data.views) {
    const view = FORM.views.find((v) => v.id === viewId);
    if (!view || view.multi) continue;
    for (const f of control[viewId] ?? []) {
      if (!f.shown || f.displayOnly || !f.required) continue;
      const meta = fieldMeta(f.field);
      if (!meta || MANDATORY_EXCLUDED.has(meta.name)) continue;
      if (meta.type === 'CHAR' && meta.len === 1 && FLAG_DOMAINS.has(meta.domain)) continue;
      const row = data.single[meta.entity] ?? {};
      if (isEmptyValue(row[meta.name])) {
        const target = `${meta.entity}/${meta.name}`;
        if (!out.some((m) => m.target === target)) err('WD014', `Please enter ${meta.label}`, target);
      }
    }
  }
  return out;
}
