// Shared Excel export for Approvals/Finance history entries and My Claims' own list, adapted to
// HistorySet's shape (entries + a claim-summary lookup for amount/expenseType/employeeName, since
// HistorySet itself carries neither).
//
// Emits genuine Excel 2003 XML Spreadsheet markup (SpreadsheetML), not an HTML table saved with a
// .xls extension - Excel's own format-sniffing flags that combination as "the file format and
// extension don't match, this could corrupt the file" and makes the user click through a warning
// (reported as the download "getting corrupted"). SpreadsheetML is a real native Excel format, so
// the same .xls extension opens cleanly with no warning, with no new library/dependency needed.
const escapeExcelCell = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildSpreadsheetMLWorkbook = (headers: string[], rows: unknown[][]): string => {
  const headerRowXml = headers.map((h) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeExcelCell(h)}</Data></Cell>`).join('');
  const bodyRowsXml = rows
    .map((row) => `<Row>${row.map((cell) => `<Cell ss:StyleID="sText"><Data ss:Type="String">${escapeExcelCell(cell)}</Data></Cell>`).join('')}</Row>`)
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#005A9E" ss:Pattern="Solid"/></Style>
  <Style ss:ID="sText"><NumberFormat ss:Format="@"/></Style>
 </Styles>
 <Worksheet ss:Name="Sheet1">
  <Table>
   <Row>${headerRowXml}</Row>
   ${bodyRowsXml}
  </Table>
 </Worksheet>
</Workbook>`;
};

const formatExcelDate = (value?: string) => {
  if (!value) return '';
  let d = new Date(value);
  const m = value.match(/(\d+)/);
  if (m && value.includes('/Date(')) d = new Date(parseInt(m[1], 10));
  if (Number.isNaN(d.getTime())) return value;
  // SAP's date-only values are midnight UTC for the intended calendar day - UTC getters keep the
  // exported day from shifting based on the viewer's local timezone.
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
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

  return buildSpreadsheetMLWorkbook(headers, rows);
};
