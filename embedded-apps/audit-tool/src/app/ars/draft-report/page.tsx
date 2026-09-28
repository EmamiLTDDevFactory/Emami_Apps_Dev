'use client';

// Audit Reporting System > Draft Report — port of the Fiori DraftReport view/controller.
// SAP: GET /Draft_ReportSet (no filter) and GET /ZUSER_MASTERSet (no filter), exactly like
// _objPatternMatched. Legal Entity / Financial Year / Sub Entity 1 / Sub Entity 2 filter the table
// client-side; picking a Sub Entity 2 appends it to the "MSD Audit Draft Report" title
// (auditJsonModel>/DraftReport/FixedHeader -> DynamicHeader). Export To Excel writes the
// on-screen columns.
//
// Not ported because nothing on this screen can trigger them in the source: the second table
// (inProgressTableId, bound to a local model/auditScheduilng.json that isn't shipped, inside a
// visible="false" layout) with its handleInProgressNextScreenPress -> inProcessParameters ->
// navTo("inProcess2Screen"); the hidden Performer/Reviewer selects and file upload controls; the
// commented-out Get button (onPressGetData); and the ZMSD_AUDIT_KICKOFFSet update/delete handlers,
// which address controls (auditKickoffTableId, valueHelpForViewProcessDetails) that don't exist
// in this view.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Page, Card, DataTable, type Column } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { read, applyFilters, F, And, Or, type Filter, type MultiFilter } from '../../../lib/odata';
import { exportTabSeparatedXls } from '../../../lib/exportFile';
import { fioriDedupe, toOptions, forceSelect, HeaderClock, FilterSelect } from '../../../components/reports/common';

type Row = Record<string, any>;

// auditJsonModel>/DraftReport/FixedHeader (model/auditJsonModel.json).
const FIXED_HEADER = 'MSD Audit Draft Report';

const COLUMNS: { header: string; field: string; width?: string }[] = [
  { header: 'Sl No.', field: 'SlNo', width: '3rem' },
  { header: 'Observations', field: 'Observations', width: '15rem' },
  { header: 'RS.(In Lacs)', field: 'Rslks' },
  { header: 'Agreed Action Plan', field: 'ActionPlan' },
  { header: 'Person Concerned', field: 'Concern' },
  { header: 'Owner', field: 'Owner' },
  { header: 'Timeline', field: 'Timeline' },
  { header: 'Risk', field: 'Risk' },
  { header: 'Process Improvement Category (See Note below)', field: 'Improvement' },
];

const EXPORT_NAMES: Record<string, string> = { SlNo: 'Sl No' };

function orGroup(path: string, value: string): MultiFilter {
  return Or([F(path, 'EQ', value)]);
}

export default function DraftReportPage() {
  const ui = useUi();
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [le, setLe] = useState('');
  const [fy, setFy] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [dynamicHeader, setDynamicHeader] = useState(FIXED_HEADER);
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);

  const load = useCallback(async () => {
    ui.busy(true);
    try {
      const { results } = await read<Row>('/Draft_ReportSet');
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      setData(results);
      setLoaded(true);

      const leRows = fioriDedupe(results, 'LglEnt');
      if (leRows.length > 0) setLegalEntities(leRows.map((r) => ({ LglEnt: r.LglEnt })));

      const fyRows = fioriDedupe(results, 'FinancialYear');
      if (fyRows.length > 0) setFinancialYears([...fyRows.map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
    } catch {
      // The source's error callback is empty — nothing is shown.
    } finally {
      ui.busy(false);
    }

    // Read for parity with the source (audit managers -> /InProcess/FilterUser*, bound only to the
    // hidden Performer/Reviewer selects); only its error is visible.
    try {
      await read<Row>('/ZUSER_MASTERSet');
    } catch {
      ui.messageBox.error('Internal Server error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const leOptions = useMemo(() => toOptions(legalEntities, 'LglEnt'), [legalEntities]);
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

    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy)]);
    if (selectedKey != '') filter.filters.push(orGroup('SubLglEntL1', selectedKey));
    setTableFilter(filter);
  };

  const onFilterSubEntity2 = (selectedKey: string) => {
    setSe2(selectedKey);
    setDynamicHeader(`${FIXED_HEADER} ${selectedKey}`);

    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy), orGroup('SubLglEntL1', se1)]);
    if (selectedKey != '') filter.filters.push(orGroup('SubLglEntL2', selectedKey));
    setTableFilter(filter);
  };

  const rows = useMemo(() => applyFilters(data, tableFilter), [data, tableFilter]);

  const onPressExportToExcel = () => {
    if (!loaded) {
      ui.messageBox.error('No data found! Fetch data by clicking on Get button.');
      return;
    }
    // Same selection as the source: Legal Entity, Sub Entity 1, Sub Entity 2 (not Financial Year).
    let finalData = data;
    if (le) finalData = finalData.filter((item) => item.LglEnt == le);
    if (se1) finalData = finalData.filter((item) => item.SubLglEntL1 == se1);
    if (se2) finalData = finalData.filter((item) => item.SubLglEntL2 == se2);
    exportTabSeparatedXls(
      finalData,
      COLUMNS.map((c) => ({ name: EXPORT_NAMES[c.field] || c.header, value: (r: Row) => r[c.field] })),
      'Draft Report',
    );
  };

  const columns: Column<Row>[] = COLUMNS.map((c) => ({
    key: c.field,
    header: c.header,
    width: c.width,
    className: 'whitespace-pre-wrap',
  }));

  return (
    <Page title={dynamicHeader} actions={<HeaderClock />}>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect label="Legal Entity" value={le} options={leOptions} onChange={setLe} width="14rem" />
          <FilterSelect label="Financial Year" value={fy} options={toOptions(financialYears, 'FinancialYear')} onChange={onFilterFinancialYear} width="7rem" />
          <FilterSelect label="Sub Entity 1" value={se1} options={toOptions(subEntity1, 'SubLglEntL1')} onChange={onFilterSubEntity1} width="14rem" />
          <FilterSelect label="Sub Entity 2" value={se2} options={toOptions(subEntity2, 'SubLglEntL2')} onChange={onFilterSubEntity2} width="14rem" />
          <button type="button" className="btn-primary" onClick={onPressExportToExcel}>
            <Download size={14} />
            Export To Excel
          </button>
        </div>
        <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="385px" />
      </Card>
    </Page>
  );
}
