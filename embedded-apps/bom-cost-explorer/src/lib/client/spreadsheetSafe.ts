/** Spreadsheet formula-injection guard (CWE-1236, VAPT round 2) for EXPORTED cells only — never
 * for on-screen data or anything sent to SAP. A text cell starting with = + - @ tab or CR can be
 * evaluated as a formula when the file is opened in Excel/Sheets, so it gets a leading ' (Excel's
 * own "treat as text" marker). Plain numbers, amounts, percentages, short unit suffixes and phone
 * numbers ("-500", "-1,234.50", "-12.5%", "-3d", "+91 98765 43210") and a lone "-" placeholder
 * are left exactly as they are; non-strings (numbers, dates, booleans, null) pass through. */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_VALUE = /^(?:[+-]?\d[\d ,]*(?:\.\d+)?(?: ?[A-Za-z%]{1,4})?|-)$/;

export function sanitizeCell<T>(value: T): T {
  if (typeof value !== 'string' || !FORMULA_START.test(value) || PLAIN_VALUE.test(value)) return value;
  return `'${value}` as unknown as T;
}

/** sanitizeCell over every value of an export row object, keys (column headers/order) untouched. */
export function sanitizeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(row)) out[key] = sanitizeCell(row[key]);
  return out as T;
}
