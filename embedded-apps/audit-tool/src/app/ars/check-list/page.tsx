'use client';

// Check List — port of the source Fiori app's CheckList view/controller (route "RouteCheckList").
// SAP calls, identical to the original:
//  - GET  /ZMSD_ADD_RSK_CRNSet                         (route matched / after De-Activate)
//  - GET  /ZMSD_ADD_RSK_CRNSet  $filter=Gjahr eq '<FY>' ("Get Fiscal Year Data")
//  - GET  /CheckAuditHeadSet('')                        (De-Activate visible only when AuditHead = 'X')
//  - POST /ZMSD_ADD_RSK_CRNSet  one per selected row, Action 'D' (De-Activate)
// The Legal Entity / Sub Entity 1 / Sub Entity 2 / Process selects filter the table client-side,
// cascading exactly like OnFilterLegal / onFilterSubEntity1/2/3. "Export To Excel" writes the
// same tab-separated .xls the Fiori ExportTypeCSV produced. The Add/Edit risk dialog fragments
// are commented out in the source (no button opens them), so they are not part of this screen.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Download, Ban } from 'lucide-react';
import { Page, Card, Toolbar, Field, Select, DataTable, type Column, type Option } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { read, readEntity, create, F, And, Or, applyFilters, type Filter } from '../../../lib/odata';
import { exportTabSeparatedXls } from '../../../lib/exportFile';
import { objectValuesBy } from '../../../components/checklist/dedupe';

type Row = Record<string, any>;

const FISCAL_YEARS = ['2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034'];

/** Options for a forceSelection="false" select whose list already carries a trailing "" entry —
 * the empty entry is rendered as the select's blank placeholder instead. */
function opts(list: Row[] | null, key: string): Option[] {
  return (list || [])
    .filter((r) => r[key] !== undefined && r[key] !== null && String(r[key]) !== '')
    .map((r) => ({ key: String(r[key]), text: String(r[key]) }));
}

function Clamp({ text }: { text: unknown }) {
  const s = text == null ? '' : String(text);
  return (
    <span title={s} className="line-clamp-2 block max-w-[28rem]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {s}
    </span>
  );
}

export default function CheckListPage() {
  const ui = useUi();

  // addRiskCreationModel
  const [rows, setRows] = useState<Row[] | null>(null);
  // auditJsonModel>/AdditionalRiskCreation/*
  const [data, setData] = useState<Row[] | null>([]);
  const [legalEntities, setLegalEntities] = useState<Row[] | null>([]);
  const [subEntity1, setSubEntity1] = useState<Row[] | null>([]);
  const [subEntity2, setSubEntity2] = useState<Row[] | null>([]);
  const [subEntity3, setSubEntity3] = useState<Row[] | null>([]);

  const [legalKey, setLegalKey] = useState('');
  const [sub1Key, setSub1Key] = useState('');
  const [sub2Key, setSub2Key] = useState('');
  const [processKey, setProcessKey] = useState('');
  const [fiscalKey, setFiscalKey] = useState('');

  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);
  const [selectedRows, setSelectedRows] = useState<Set<Row>>(new Set());
  const [isAuditHead, setIsAuditHead] = useState(false);

  // legalEntitySelectTest is forceSelection="true": when nothing valid is chosen it shows (and
  // getSelectedKey() returns) the first item.
  const legalOptions = useMemo(() => opts(legalEntities, 'LglEnt'), [legalEntities]);
  const effectiveLegal = legalOptions.some((o) => o.key === legalKey) ? legalKey : legalOptions[0]?.key ?? '';

  /** Applies a fresh result set the way both success handlers do: slNo numbering, a new
   * addRiskCreationModel (which also drops any table binding filter), and the select lists. */
  const applyResults = useCallback((results: Row[]) => {
    let serialNo = 1;
    results.forEach((obj) => {
      obj.slNo = serialNo++;
    });
    setRows(results);
    setTableFilter(undefined);
    setSelectedRows(new Set());
    if (results.length > 0) setData(results);

    const legalRef = objectValuesBy(results, 'LglEnt');
    if (legalRef.length > 0) setLegalEntities(legalRef.map((r) => ({ LglEnt: r.LglEnt })));

    const sub1Ref = objectValuesBy(results, 'SubLglEntL1');
    if (sub1Ref.length > 0) setSubEntity1([...sub1Ref.map((r) => ({ SubLglEntL1: r.SubLglEntL1 })), { SubLglEntL1: '' }]);
  }, []);

  const objPatternMatched = useCallback(async () => {
    setSub1Key('');
    setSub2Key('');
    setProcessKey('');
    try {
      const { results } = await read<Row>('/ZMSD_ADD_RSK_CRNSet');
      applyResults(results);
    } catch {
      /* source error handler is empty */
    }
    try {
      const head = await readEntity<Row>("/CheckAuditHeadSet('')");
      setIsAuditHead(head?.AuditHead === 'X');
    } catch {
      /* source error handler is empty */
    }
  }, [applyResults]);

  useEffect(() => {
    objPatternMatched();
  }, [objPatternMatched]);

  const onGetFiscalYearData = async () => {
    const FiscalYear = fiscalKey;
    setRows(null);
    setData(null);
    setLegalEntities(null);
    setSubEntity1(null);
    setSubEntity2(null);
    setSubEntity3(null);
    setSub1Key('');
    setSub2Key('');
    setProcessKey('');
    try {
      const { results } = await read<Row>('/ZMSD_ADD_RSK_CRNSet', { filters: [F('Gjahr', 'EQ', FiscalYear)] });
      applyResults(results);
    } catch {
      /* source error handler is empty */
    }
  };

  const onFilterLegal = (selectedKey: string) => {
    setLegalKey(selectedKey);
    const matched = (data || []).filter((r) => r.LglEnt == selectedKey);
    setSubEntity1([...objectValuesBy(matched, 'SubLglEntL1'), { SubLglEntL1: '' }]);
    setSub1Key('');
    setSub2Key('');
    setProcessKey('');
    setTableFilter(And([Or([F('LglEnt', 'EQ', selectedKey)])]));
  };

  const onFilterSubEntity1 = (selectedKey: string) => {
    setSub1Key(selectedKey);
    const matched = (data || []).filter((r) => r.SubLglEntL1 == selectedKey);
    setSubEntity2([...objectValuesBy(matched, 'SubLglEntL2'), { SubLglEntL2: '' }]);
    setSub2Key('');
    setProcessKey('');
    const filters: Filter[] = [Or([F('LglEnt', 'EQ', effectiveLegal)])];
    if (selectedKey !== '') filters.push(Or([F('SubLglEntL1', 'EQ', selectedKey)]));
    setTableFilter(And(filters));
  };

  const onFilterSubEntity2 = (selectedKey: string) => {
    setSub2Key(selectedKey);
    const matched = (data || []).filter((r) => r.SubLglEntL2 == selectedKey);
    setSubEntity3([...objectValuesBy(matched, 'Process'), { Process: '' }]);
    setProcessKey('');
    const filters: Filter[] = [Or([F('LglEnt', 'EQ', effectiveLegal)]), Or([F('SubLglEntL1', 'EQ', sub1Key)])];
    if (selectedKey !== '') filters.push(Or([F('SubLglEntL2', 'EQ', selectedKey)]));
    setTableFilter(And(filters));
  };

  const onFilterSubEntity3 = (selectedKey: string) => {
    setProcessKey(selectedKey);
    const filters: Filter[] = [
      Or([F('LglEnt', 'EQ', effectiveLegal)]),
      Or([F('SubLglEntL1', 'EQ', sub1Key)]),
      Or([F('SubLglEntL2', 'EQ', sub2Key)]),
    ];
    if (selectedKey !== '') filters.push(Or([F('Process', 'EQ', selectedKey)]));
    setTableFilter(And(filters));
  };

  const displayed = useMemo(() => applyFilters(rows || [], tableFilter), [rows, tableFilter]);

  const onExportToExcel = () => {
    let FinalData = rows || [];
    if (effectiveLegal) FinalData = FinalData.filter((item) => item.LglEnt == effectiveLegal);
    if (sub1Key) FinalData = FinalData.filter((item) => item.SubLglEntL1 == sub1Key);
    if (sub2Key) FinalData = FinalData.filter((item) => item.SubLglEntL2 == sub2Key);
    if (processKey) FinalData = FinalData.filter((item) => item.Process == processKey);
    if (fiscalKey) FinalData = FinalData.filter((item) => item.Gjahr == fiscalKey);
    exportTabSeparatedXls(
      FinalData,
      [
        { name: 'Control No', value: (r) => r.ControlNumber },
        { name: 'Branch', value: (r) => r.SubLglEntL2 },
        { name: 'Process', value: (r) => r.Process },
        { name: 'Risk Desription', value: (r) => r.RiskDesc },
        { name: 'Control Description', value: (r) => r.ControlDesc },
        { name: 'Audit Steps', value: (r) => r.AuditSteps },
        { name: 'Rating', value: (r) => r.Rating },
      ],
      'Check List',
    );
  };

  const handleOpenDeactivateAddRiskCreation = () => {
    // oTable.getSelectedItems(): only rows currently shown by the table can be selected items.
    const selectedTableItems = displayed.filter((r) => selectedRows.has(r));
    let count = 0;
    for (const obj of selectedTableItems) {
      const postObj = {
        ControlNumber: obj.ControlNumber,
        Gjahr: obj.Gjahr,
        AudRiskCrnGUid: obj.AudRiskCrnGUid,
        RiskDesc: obj.RiskDesc,
        ControlDesc: obj.ControlDesc,
        AuditSteps: obj.AuditSteps,
        Rating: obj.Rating,
        Action: 'D',
      };
      create('/ZMSD_ADD_RSK_CRNSet', postObj)
        .then(() => {
          count += 1;
          if (count === selectedTableItems.length) {
            objPatternMatched();
            setSelectedRows(new Set());
            ui.messageBox.success('Selected Items are Deactivated Successfully!!');
          }
        })
        .catch(() => {
          ui.messageBox.error('Internal Server error');
        });
    }
  };

  const selectedIdx = useMemo(() => new Set(displayed.map((r, i) => (selectedRows.has(r) ? i : -1)).filter((i) => i >= 0)), [displayed, selectedRows]);

  const columns: Column<Row>[] = [
    { key: 'ControlNumber', header: 'Control No' },
    { key: 'SubLglEntL2', header: 'Branch' },
    { key: 'Process', header: 'Process' },
    { key: 'RiskDesc', header: 'Risk Desription', render: (r) => <Clamp text={r.RiskDesc} /> },
    { key: 'ControlDesc', header: 'Control Description', render: (r) => <Clamp text={r.ControlDesc} /> },
    { key: 'AuditSteps', header: 'Audit Steps', render: (r) => <Clamp text={r.AuditSteps} /> },
    { key: 'Rating', header: 'Rating' },
  ];

  return (
    <Page title="Check List">
      <Card className="space-y-3">
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-48">
            <Select value={effectiveLegal} onChange={onFilterLegal} options={legalOptions} />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-48">
            <Select value={sub1Key} onChange={onFilterSubEntity1} options={opts(subEntity1, 'SubLglEntL1')} placeholder="" />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-48">
            <Select value={sub2Key} onChange={onFilterSubEntity2} options={opts(subEntity2, 'SubLglEntL2')} placeholder="" />
          </Field>
          <Field label="Process" className="w-full sm:w-48">
            <Select value={processKey} onChange={onFilterSubEntity3} options={opts(subEntity3, 'Process')} placeholder="" />
          </Field>
        </Toolbar>
        <Toolbar>
          <Field label="Fiscal Year" className="w-full sm:w-40">
            {/* onChangeFiscalYear is referenced by the source view but not defined in its controller — selecting a year does nothing until "Get Fiscal Year Data". */}
            <Select value={fiscalKey} onChange={setFiscalKey} options={FISCAL_YEARS.map((y) => ({ key: y, text: y }))} placeholder="" />
          </Field>
          <button type="button" className="btn-primary" onClick={onGetFiscalYearData}>
            <FileSpreadsheet size={15} />
            Get Fiscal Year Data
          </button>
          <button type="button" className="btn-primary" onClick={onExportToExcel}>
            <Download size={15} />
            Export To Excel
          </button>
          {isAuditHead && (
            <button type="button" className="btn-primary" onClick={handleOpenDeactivateAddRiskCreation}>
              <Ban size={15} />
              De-Activate
            </button>
          )}
        </Toolbar>
      </Card>

      <DataTable
        columns={columns}
        rows={displayed}
        selectionMode="MultiSelect"
        selected={selectedIdx}
        onSelectionChange={(next) => {
          const s = new Set(selectedRows);
          displayed.forEach((r, i) => {
            if (next.has(i)) s.add(r);
            else s.delete(r);
          });
          setSelectedRows(s);
        }}
        growingThreshold={5}
        maxHeight="400px"
        rowKey={(r, i) => `${r.ControlNumber ?? ''}-${r.Gjahr ?? ''}-${r.AudRiskCrnGUid ?? ''}-${i}`}
      />
    </Page>
  );
}
