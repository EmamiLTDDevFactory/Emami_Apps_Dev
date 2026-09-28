'use client';

// MIS & Reporting > MIS Report — port of the Fiori MISReport view/controller.
// SAP: GET /MISReportSet (no filter) and GET /ZUSER_MASTERSet (no filter), exactly like
// _objPatternMatched. The Audit Type select switches which columns are shown (OnFilterAuditType's
// visibility map) and which column set Export To Excel writes; Legal Entity / Financial Year /
// Sub Entity 1 / Sub Entity 2 filter the table client-side.
//
// Not wired to any control in the source view, so not ported: onTest (navTo RouteMailProcessDetail
// with hard-coded test values) and handledraftNextScreenPress (navTo "MISdraft2", a route that
// doesn't exist in the manifest — a no-op in UI5).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Page, Card, DataTable, type Column } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { read, applyFilters, F, And, Or, type Filter, type MultiFilter } from '../../../lib/odata';
import { exportTabSeparatedXls, type ExportColumn } from '../../../lib/exportFile';
import { quarterToPeriod } from '../../../lib/formatter';
import { fioriDedupe, toOptions, forceSelect, HeaderClock, FilterSelect } from '../../../components/reports/common';

type Row = Record<string, any>;

type VisKey =
  | 'grossRisk' | 'obsTitle' | 'observations' | 'busImplication' | 'rootCause' | 'rsInLacs' | 'agreedActionPlan'
  | 'msdRemarks' | 'annexure' | 'personConcerned' | 'owner' | 'timeline' | 'residualRisk' | 'status' | 'category'
  | 'rootCauseType' | 'teamLead' | 'processName' | 'processLocationWise' | 'department1' | 'relatedPeriod'
  | 'relatedYear' | 'quarters' | 'earlierTimeline' | 'ageing';

type Visibility = Record<VisKey, boolean>;

const ALL_VISIBLE: Visibility = {
  grossRisk: true, obsTitle: true, observations: true, busImplication: true, rootCause: true, rsInLacs: true,
  agreedActionPlan: true, msdRemarks: true, annexure: true, personConcerned: true, owner: true, timeline: true,
  residualRisk: true, status: true, category: true, rootCauseType: true, teamLead: true, processName: true,
  processLocationWise: true, department1: true, relatedPeriod: true, relatedYear: true, quarters: true,
  earlierTimeline: true, ageing: true,
};

// OnFilterAuditType's visMap (department2-4 in the source bind to no column, so they're omitted).
const VIS_MAP: Record<string, Visibility> = {
  '': ALL_VISIBLE,
  MSD_MIS: ALL_VISIBLE,
  INDEX: {
    ...ALL_VISIBLE,
    observations: false, busImplication: false, rootCause: false, agreedActionPlan: false, msdRemarks: false,
    annexure: false, personConcerned: false, owner: false, timeline: false,
  },
  AUDITEE_MIS: {
    ...ALL_VISIBLE,
    teamLead: false, processName: false, processLocationWise: false, department1: false, relatedPeriod: false,
    relatedYear: false, quarters: false, earlierTimeline: false, ageing: false,
  },
  NHB_MIS: {
    grossRisk: false, obsTitle: true, observations: true, busImplication: false, rootCause: false, rsInLacs: true,
    agreedActionPlan: true, msdRemarks: true, annexure: true, personConcerned: false, owner: true, timeline: true,
    residualRisk: false, status: true, category: false, rootCauseType: false, teamLead: false, processName: false,
    processLocationWise: false, department1: false, relatedPeriod: false, relatedYear: false, quarters: false,
    earlierTimeline: false, ageing: false,
  },
};

const AUDIT_TYPES = [
  { key: '', text: 'Select Option' },
  { key: 'MSD_MIS', text: 'MSD MIS' },
  { key: 'INDEX', text: 'Index' },
  { key: 'AUDITEE_MIS', text: 'Auditee MIS' },
  { key: 'NHB_MIS', text: 'NHB MIS' },
];

// The view's columns: header, bound property, width, and the visibility flag that controls it.
const TABLE_COLUMNS: { header: string; field: string; width: string; vis?: VisKey }[] = [
  { header: 'Sl No.', field: 'SlNo', width: '4rem' },
  { header: 'Gross Risk', field: 'GrossRisk', width: '9rem', vis: 'grossRisk' },
  { header: 'Observation Title', field: 'ObservationTitle', width: '12rem', vis: 'obsTitle' },
  { header: 'Observations', field: 'Observations', width: '15rem', vis: 'observations' },
  { header: 'Business Implication', field: 'BusinessImplication', width: '14rem', vis: 'busImplication' },
  { header: 'Root Cause', field: 'RootCause', width: '12rem', vis: 'rootCause' },
  { header: 'Rs. (In Lacs)', field: 'FinancialImpact', width: '9rem', vis: 'rsInLacs' },
  { header: 'Agreed Action Plan', field: 'ActionPlan', width: '14rem', vis: 'agreedActionPlan' },
  { header: 'MSD Remarks', field: 'MsdRemark', width: '12rem', vis: 'msdRemarks' },
  { header: 'Annexure', field: 'Annexture', width: '10rem', vis: 'annexure' },
  { header: 'Person Concerned', field: 'Concern', width: '11rem', vis: 'personConcerned' },
  { header: 'Owner', field: 'Owner', width: '10rem', vis: 'owner' },
  { header: 'Timeline', field: 'Timeline', width: '9rem', vis: 'timeline' },
  { header: 'Residual Risk', field: 'Risk', width: '9rem', vis: 'residualRisk' },
  { header: 'Status', field: 'Status', width: '9rem', vis: 'status' },
  { header: 'Category (P/C/R/I/F/O)', field: 'Category', width: '14rem', vis: 'category' },
  { header: 'Sub Category (P1/P2/P3)', field: 'SubCategory', width: '14rem', vis: 'category' },
  { header: 'Root Cause (PE/PR/TE)', field: 'RootCause', width: '13rem', vis: 'rootCauseType' },
  { header: 'Team Lead', field: 'TeamLead', width: '10rem', vis: 'teamLead' },
  { header: 'Process Name', field: 'ProcessName', width: '11rem', vis: 'processName' },
  { header: 'Process : Location wise', field: 'SubLglEntL2', width: '13rem', vis: 'processLocationWise' },
  { header: 'Department', field: 'Department', width: '10rem', vis: 'department1' },
  { header: 'Related to which Period', field: 'PeriodText', width: '12rem', vis: 'relatedPeriod' },
  { header: 'Related to which year', field: 'FinancialYear', width: '12rem', vis: 'relatedYear' },
  { header: 'Quarters', field: 'Quarters', width: '8rem', vis: 'quarters' },
  { header: 'Earlier Timeline', field: 'EarlierTimeline', width: '10rem', vis: 'earlierTimeline' },
  { header: 'Ageing', field: 'Ageing', width: '8rem', vis: 'ageing' },
];

const col = (name: string, field: string): ExportColumn<Row> => ({ name, value: (r) => r[field] });

// onPressExportToExcel's per-Audit-Type column sets, verbatim (names and bound properties).
const EXPORT_COLUMNS: Record<string, ExportColumn<Row>[]> = {
  MSD_MIS: [
    col('Sl No', 'slNo'), col('Gross Risk', 'GrossRisk'), col('Observation Title', 'ObservationTitle'),
    col('Observations', 'Observations'), col('Business Implication', 'BusinessImplication'), col('Root Cause', 'RootCause'),
    col('RS.(In Lacs)', 'FinancialImpact'), col('Agreed Action Plan', 'ActionPlan'), col('MSD Remarks', 'Remarks'),
    col('Annexure', 'Annexture'), col('Person Concerned', 'Concern'), col('Owner', 'Owner'), col('Timeline', 'Timeline'),
    col('Residual Risk', 'Risk'), col('Status', 'Status'), col('Category (P/C/R/I/F/O)', 'Category'),
    col('Sub Category (P1/P2/P3)', 'SubCategory'), col('Root Cause (PE/PR/TE)', 'RootCause'), col('Team Lead', 'TeamLead'),
    col('Process Name', 'ProcessName'), col('Process : Location wise', 'SubLglEntL2'), col('Department', 'Department'),
    col('Related to which Period', 'PeriodText'), col('Related to which year', 'FinancialYear'), col('Quarters', 'Quarters'),
    col('Earlier Timeline', 'EarlierTimeline'), col('Ageing', 'Ageing'),
  ],
  INDEX: [
    col('Sl No', 'slNo'), col('Gross Risk', 'GrossRisk'), col('Observation Title', 'ObservationTitle'),
    col('RS.(In Lacs)', 'FinancialImpact'), col('Residual Risk', 'Risk'), col('Status', 'Status'),
    col('Category (P1/P2/P3/C/R/I/F/O)', 'Category'), col('Sub Category (P1/P2/P3)', 'SubCategory'),
    col('Root Cause (PE/PR/TE)', 'RootCause'), col('Team Lead', 'TeamLead'), col('Process Name', 'ProcessName'),
    col('Process : Location wise', 'SubLglEntL2'), col('Department', 'Department'),
    col('Related to which Period', 'PeriodText'), col('Related to which year', 'FinancialYear'), col('Quarters', 'Quarters'),
    col('Earlier Timeline', 'EarlierTimeline'), col('Ageing', 'Ageing'),
  ],
  AUDITEE_MIS: [
    col('Sl No', 'slNo'), col('Gross Risk', 'GrossRisk'), col('Observation Title', 'ObservationTitle'),
    col('Observations', 'Observations'), col('Business Implication', 'BusinessImplication'), col('Root Cause', 'RootCause'),
    col('RS.(In Lacs)', 'FinancialImpact'), col('Agreed Action Plan', 'ActionPlan'), col('MSD Remarks', 'Remarks'),
    col('Annexure', 'Annexture'), col('Person Concerned', 'Concern'), col('Owner', 'Owner'), col('Timeline', 'Timeline'),
    col('Residual Risk', 'Risk'), col('Status', 'Status'), col('Category (P1/P2/P3/C/R/I/F/O)', 'Category'),
    col('Sub Category (P1/P2/P3)', 'SubCategory'), col('Root Cause (PE/PR/TE)', 'RootCause'),
  ],
  NHB_MIS: [
    col('Sl No', 'slNo'), col('Observation Title', 'ObservationTitle'), col('Observations', 'Observations'),
    col('RS.(In Lacs)', 'FinancialImpact'), col('Agreed Action Plan', 'ActionPlan'), col('MSD Remarks', 'Remarks'),
    col('Annexure', 'Annexture'), col('Owner', 'Owner'), col('Timeline', 'Timeline'), col('Status', 'Status'),
  ],
};

function orGroup(path: string, value: string): MultiFilter {
  return Or([F(path, 'EQ', value)]);
}

export default function MisReportPage() {
  const ui = useUi();
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [auditType, setAuditType] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(ALL_VISIBLE);
  const [le, setLe] = useState('');
  const [fy, setFy] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    ui.busy(true);
    try {
      const { results } = await read<Row>('/MISReportSet');
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
        // Source change of 28/09/2026 — quarter -> period.
        obj.Quarters = obj.Quarters || obj.Qtr || '';
        obj.PeriodText = quarterToPeriod(obj.Quarters);
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

    // Read for parity with the source (it stores the audit managers in /draft/FilterUser*, which
    // no control on this screen binds to); only its error is visible.
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

  const onFilterAuditType = (key: string) => {
    setAuditType(key);
    setVisibility(VIS_MAP[key] || VIS_MAP['']);
  };

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
    const filter = And([orGroup('LglEnt', le), orGroup('FinancialYear', fy), orGroup('SubLglEntL1', se1)]);
    if (selectedKey != '') filter.filters.push(orGroup('SubLglEntL2', selectedKey));
    setTableFilter(filter);
  };

  const rows = useMemo(() => applyFilters(data, tableFilter), [data, tableFilter]);

  useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  const onPressExportToExcel = () => {
    if (!loaded) {
      ui.messageBox.error('No data found! Fetch data by clicking on Get button.');
      return;
    }
    let finalData = data;
    if (le) finalData = finalData.filter((item) => item.LglEnt == le);
    if (se1) finalData = finalData.filter((item) => item.SubLglEntL1 == se1);
    if (se2) finalData = finalData.filter((item) => item.SubLglEntL2 == se2);

    if (!auditType) {
      ui.messageBox.warning('Please select Audit Type.');
      return;
    }
    const columns = EXPORT_COLUMNS[auditType];
    if (!columns) {
      ui.messageBox.warning('Please select a valid Audit Type.');
      return;
    }
    exportTabSeparatedXls(finalData, columns, 'MIS Report');
  };

  const columns: Column<Row>[] = TABLE_COLUMNS.filter((c) => !c.vis || visibility[c.vis]).map((c, i) => ({
    key: `${c.field}-${i}`,
    header: c.header,
    width: c.width,
    value: (r: Row) => r[c.field],
  }));

  return (
    <Page title="MIS - Report" actions={<HeaderClock />}>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect label="Audit Type" value={auditType} options={AUDIT_TYPES} onChange={onFilterAuditType} width="9rem" />
          <FilterSelect label="Legal Entity" value={le} options={leOptions} onChange={setLe} width="11rem" />
          <FilterSelect label="Financial Year" value={fy} options={toOptions(financialYears, 'FinancialYear')} onChange={onFilterFinancialYear} width="7rem" />
          <FilterSelect label="Sub Entity 1" value={se1} options={toOptions(subEntity1, 'SubLglEntL1')} onChange={onFilterSubEntity1} width="12rem" />
          <FilterSelect label="Sub Entity 2" value={se2} options={toOptions(subEntity2, 'SubLglEntL2')} onChange={onFilterSubEntity2} width="12rem" />
          <button type="button" className="btn-primary" onClick={onPressExportToExcel}>
            <Download size={14} />
            Export To Excel
          </button>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          selectionMode="MultiSelect"
          selected={selected}
          onSelectionChange={setSelected}
          growingThreshold={10}
          maxHeight="385px"
        />
      </Card>
    </Page>
  );
}
