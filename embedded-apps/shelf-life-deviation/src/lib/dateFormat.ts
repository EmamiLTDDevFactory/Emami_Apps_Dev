/**
 * Replacements for the UI5 formatting APIs used by the app:
 *   - sap.ui.core.format.DateFormat.getDateTimeInstance({ pattern })
 *   - sap.ui.core.format.DateFormat.getDateInstance({ pattern })
 *   - binding type sap.ui.model.type.Date with formatOptions { style: "medium" }
 *
 * Like UI5 (without UTC:true), all formatting is done in the browser's
 * local time zone and the browser's locale.
 */

function locale(): string {
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Supports the tokens used in this app: dd, d, MMM, MM, yyyy, yy, HH, mm, ss */
export function formatPattern(date: Date, pattern: string): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const monthShort = new Intl.DateTimeFormat(locale(), { month: "short" }).format(date);
  return pattern.replace(/yyyy|yy|MMM|MM|dd|d|HH|mm|ss/g, (tok) => {
    switch (tok) {
      case "yyyy": return String(date.getFullYear());
      case "yy":   return pad(date.getFullYear() % 100);
      case "MMM":  return monthShort;
      case "MM":   return pad(date.getMonth() + 1);
      case "dd":   return pad(date.getDate());
      case "d":    return String(date.getDate());
      case "HH":   return pad(date.getHours());
      case "mm":   return pad(date.getMinutes());
      case "ss":   return pad(date.getSeconds());
      default:     return tok;
    }
  });
}

/** sap.ui.model.type.Date, formatOptions: { style: 'medium' } */
export function formatMediumDate(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value as any);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium" }).format(d);
}
