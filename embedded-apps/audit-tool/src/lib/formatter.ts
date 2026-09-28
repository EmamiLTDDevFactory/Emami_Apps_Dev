// Port of the source app's utility/formatter.js, plus the date helpers its XML views get from
// sap.ui.model.type.Date bindings.
export { formatDateDisplay } from '../components/ui';

/** QTR1 -> Apr - Jun, QTR2 -> Jul - Sept, QTR3 -> Oct - Dec, QTR4 -> Jan - Mar (source change of
 * 28/09/2026). Unknown/empty input -> "". */
export function quarterToPeriod(quarter: unknown): string {
  const key = String(quarter ?? '').toUpperCase().replace(/\s/g, '');
  const map: Record<string, string> = {
    QTR1: 'Apr - Jun',
    QTR2: 'Jul - Sept',
    QTR3: 'Oct - Dec',
    QTR4: 'Jan - Mar',
  };
  return map[key] || '';
}

/** BaseController.handleValidateEmail's regex. */
export const EMAIL_RE = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v);
}

/** Midnight UTC for a local calendar date — how UI5's DatePicker + Edm.DateTime (display-format
 * Date) ends up serializing a picked date, so SAP stores the same calendar day. */
export function toUtcDate(d: Date | null | undefined): Date | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
