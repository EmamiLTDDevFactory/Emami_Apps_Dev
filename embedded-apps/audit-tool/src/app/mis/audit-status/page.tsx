'use client';

// MIS & Reporting > Audit Status — port of the Fiori AuditStatus view/controller.
// SAP: GET /AuditStatusReportSet (no filter), exactly like _objPatternMatched. Everything after
// that (the Legal Entity / Financial Year / Sub Entity 1 / Sub Entity 2 / Scheduling cascade and
// the Export To Excel) works client-side on the rows that one read returned.
//
// The source's add/edit/delete Audit Scheduling handlers (ZMSD_AUDIT_SCHDL001Set creates) are not
// reachable from this screen — their buttons are commented out in the view and their dialogs are
// never instantiated — so they are intentionally not ported here.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Page, Card, DataTable, type Column } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { read, applyFilters, F, And, Or, type Filter, type MultiFilter } from '../../../lib/odata';
import { exportTabSeparatedXls } from '../../../lib/exportFile';
import { fioriDedupe, toOptions, forceSelect, HeaderClock, FilterSelect } from '../../../components/reports/common';

type Row = Record<string, any>;

const DATE_FIELDS = [
  'SchBegda',
  'SchEndda',
  'KickoffDate',
  'KickoffBegda',
  'KickoffEndda',
  'AcceptBegda',
  'AcceptEndda',
  'ActBegda',
  'ActEnnda',
  'AuditClseDate',
];

/** The source's FormatData: mutates every row in place — Schdl "X" -> "Done", every date field
 * -> toLocaleDateString('en-GB') — and the table and the export both read those mutated rows. */
function formatRow(item: Row): Row {
  if (item.Schdl == 'X') item.Schdl = 'Done';
  for (const f of DATE_FIELDS) {
    if (item[f]) item[f] = item[f] instanceof Date ? item[f].toLocaleDateString('en-GB') : item[f];
  }
  return item;
}

function orGroup(path: string, value: string): MultiFilter {
  return Or([F(path, 'EQ', value)]);
}

const COLUMNS: { key: string; header: string }[] = [
  { key: 'FinancialYear', header: 'Financial Year' },
  { key: 'SubLglEntL1', header: 'Legal Entiry 1' },
  { key: 'SubLglEntL2', header: 'Legal Entiry 2' },
  { key: 'Process', header: 'Process Name' },
  { key: 'Scheduling', header: 'Scheduling' },
  { key: 'Period', header: 'Period' },
  { key: 'Schdl', header: 'Scheduling Status' },
  { key: 'SchBegda', header: 'Scheduled Start Date' },
  { key: 'SchEndda', header: 'Scheduled End Date' },
  { key: 'Performer', header: 'Performer' },
  { key: 'Reviewer', header: 'Reviewer' },
  { key: 'KickoffDate', header: 'Kickoff Date' },
  { key: 'KickoffBegda', header: 'Kick Off start date' },
  { key: 'KickoffEndda', header: 'Kick off End Date' },
  { key: 'AcceptBegda', header: 'Planned Start Date' },
  { key: 'AcceptEndda', header: 'Planned End Date' },
  { key: 'ActBegda', header: 'Actual Start Date' },
  { key: 'ActEnnda', header: 'Actual End Date' },
  { key: 'AuditClseDate', header: 'Audit Close Date' },
  { key: 'ReasonDelay', header: 'Reason For Delay' },
];

export default function AuditStatusPage() {
  const ui = useUi();
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [subEntity3, setSubEntity3] = useState<Row[]>([]);
  const [le, setLe] = useState('');
  const [fy, setFy] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [se3, setSe3] = useState('');
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);

  const load = useCallback(async () => {
    ui.busy(true);
    try {
      const { results } = await read<Row>('/AuditStatusReportSet');
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      results.map(formatRow);
      setData(results);

      const leRows = fioriDedupe(results, 'LglEnt');
      if (leRows.length > 0) setLegalEntities(leRows.map((r) => ({ LglEnt: r.LglEnt })));

      const fyRows = fioriDedupe(results, 'FinancialYear');
      if (fyRows.length > 0) setFinancialYears([...fyRows.map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
    } catch {
      // The source's error callback is empty — nothing is shown.
    } finally {
      ui.busy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const leOptions = useMemo(() => toOptions(legalEntities, 'LglEnt'), [legalEntities]);
  // Legal Entity is forceSelection="true" — it always holds a value once items exist.
  useEffect(() => {
    setLe((cur) => forceSelect(cur, leOptions));
  }, [leOptions]);

  const onFilterFinancialYear = (selectedKey: string) => {
    setFy(selectedKey);
    const next = fioriDedupe(data.filter((d) => d.FinancialYear == selectedKey), 'SubLglEntL1');
    next.push({ SubLglEntL1: '' });
    setSubEntity1(next);
    setSe1('');
    setSe2('');
    setSe3('');

    const filter = And([orGroup('LglEnt', le)]);
    if (selectedKey != '') filter.filters.push(orGroup('FinancialYear', selectedKey));
    setTableFilter(filter);
  };

  const onFilterSubEntity1 = (selectedKey: string) => {
    setSe1(selectedKey);
    const next = fioriDedupe(data.filter((d) => d.SubLglEntL1 == selectedKey), 'SubLglEntL2');
    next.push({ SubLglEntL2: '' });
    setSubEntity2(next);
    setSe2('');
    setSe3('');

    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy)]);
    if (selectedKey != '') filter.filters.push(orGroup('SubLglEntL1', selectedKey));
    setTableFilter(filter);
  };

  const onFilterSubEntity2 = (selectedKey: string) => {
    setSe2(selectedKey);
    const next = fioriDedupe(data.filter((d) => d.SubLglEntL2 == selectedKey), 'Scheduling');
    next.push({ Scheduling: '' });
    setSubEntity3(next);
    setSe3('');

    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy), orGroup('SubLglEntL1', se1)]);
    if (selectedKey != '') filter.filters.push(orGroup('SubLglEntL2', selectedKey));
    setTableFilter(filter);
  };

  const onFilterSubEntity3 = (selectedKey: string) => {
    setSe3(selectedKey);
    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy), orGroup('SubLglEntL1', se1), orGroup('SubLglEntL2', se2)]);
    if (selectedKey != '') filter.filters.push(orGroup('Scheduling', selectedKey));
    setTableFilter(filter);
  };

  const rows = useMemo(() => applyFilters(data, tableFilter), [data, tableFilter]);

  const onPressExportToExcel = () => {
    // Same selection as the source: the full result set narrowed by Legal Entity, Sub Entity 1,
    // Sub Entity 2 and Scheduling (Financial Year is not applied to the export in the source).
    let finalData = data;
    if (le) finalData = finalData.filter((item) => item.LglEnt == le);
    if (se1) finalData = finalData.filter((item) => item.SubLglEntL1 == se1);
    if (se2) finalData = finalData.filter((item) => item.SubLglEntL2 == se2);
    if (se3) finalData = finalData.filter((item) => item.Scheduling == se3);
    exportTabSeparatedXls(
      finalData,
      COLUMNS.map((c) => ({ name: c.header, value: (r: Row) => r[c.key] })),
      'Audit Status Report',
    );
  };

  const columns: Column<Row>[] = COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: '10em',
    // Scheduling Status shows "Done" for a scheduled row — see the report's note on Schdl.
    value: c.key === 'Schdl' ? (r: Row) => (r.Schdl === 'X' || r.Schdl === 'Done' ? 'Done' : '') : undefined,
  }));

  return (
    <Page title="Audit Status" actions={<HeaderClock />}>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect label="Legal Entity" value={le} options={leOptions} onChange={setLe} />
          <FilterSelect label="Financial Year" value={fy} options={toOptions(financialYears, 'FinancialYear')} onChange={onFilterFinancialYear} width="7rem" />
          <FilterSelect label="Sub Entity 1" value={se1} options={toOptions(subEntity1, 'SubLglEntL1')} onChange={onFilterSubEntity1} />
          <FilterSelect label="Sub Entity 2" value={se2} options={toOptions(subEntity2, 'SubLglEntL2')} onChange={onFilterSubEntity2} />
          <FilterSelect label="Scheduling" value={se3} options={toOptions(subEntity3, 'Scheduling')} onChange={onFilterSubEntity3} />
        </div>
        <div>
          <button type="button" className="btn-primary" onClick={onPressExportToExcel}>
            <Download size={14} />
            Export To Excel
          </button>
        </div>
        <DataTable columns={columns} rows={rows} maxHeight="400px" />
      </Card>
    </Page>
  );
}
