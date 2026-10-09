// Shared Excel export for Approvals/Finance history entries — same HTML-table-as-.xls trick
// my-claims/page.tsx already uses, adapted to HistorySet's shape (entries + a claim-summary
// lookup for amount/expenseType/employeeName, since HistorySet itself carries neither).
const escapeExcelCell = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatExcelDate = (value?: string) => {
  if (!value) return '';
  let d = new Date(value);
  const m = value.match(/(\d+)/);
  if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

export const buildHistoryExcelHtml = (
  entries: any[],
  claimSummaryCache: Record<string, { amount: number; expenseType: string; employeeName: string }>,
) => {
  const headers = ['Claim ID', 'Employee Name', 'Expense Type', 'Amount', 'Action', 'Action Date'];

  const rows = entries.map((entry) => {
    const summary = claimSummaryCache[entry.ClaimId];
    return [
      entry.ClaimId || '',
      summary?.employeeName || '',
      summary?.expenseType || entry.Descript || '',
      summary ? summary.amount.toFixed(2) : '',
      entry.Action || '',
      formatExcelDate(entry.ActionDate),
    ];
  });

  const headerHtml = headers.map((h) => `<th>${escapeExcelCell(h)}</th>`).join('');
  const rowsHtml = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeExcelCell(cell)}</td>`).join('')}</tr>`).join('');

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
          th { background: #005A9E; color: #FFFFFF; font-weight: 700; }
          th, td { border: 1px solid #CBD5E1; padding: 8px; mso-number-format: "\\@"; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
    </html>
  `;
};
