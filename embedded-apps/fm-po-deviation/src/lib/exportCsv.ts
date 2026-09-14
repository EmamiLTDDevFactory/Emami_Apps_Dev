/** Minimal CSV writer for the failed-rows export — plain text/csv (not xlsx) so any spreadsheet
 * app opens it directly. Only Rowno + Message per the spec, so the user can find and fix just
 * those rows in their original file. Message can contain commas/quotes/newlines, hence the
 * escaping. */
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportFailedRowsToCsv(rows: { rowno: number; message: string }[], filenamePrefix: string): void {
  const lines = [
    'Row,Message',
    ...rows.map((r) => `${r.rowno},${csvEscape(r.message)}`),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
