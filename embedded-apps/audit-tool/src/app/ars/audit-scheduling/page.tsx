'use client';

// Audit Scheduling — port of the source Fiori app's auditScheduling view/controller (route
// "auditScheduling"). SAP calls, identical to the original:
//  - GET  /ZMSD_AUDIT_SCHDL001Set  $filter=FinancialYear eq '…' and Scheduling eq '…' and
//         Period eq '…' and SubLglEntL1 eq '…' and SubLglEntL2 eq '…'  — values from the
//         countParameters model (filled by the dashboard's count links), which is then cleared,
//         so later reloads (after edit/delete) send all five filters with empty values, as in the
//         source.
//  - POST /ZMSD_AUDIT_SCHDL001Set  Action 'C' (Edit dialog -> Update)
//  - POST /ZMSD_AUDIT_SCHDL001Set  Action 'D' (row delete)
// Table filtering by Financial Year / Sub Entity 1 / Sub Entity 2 / Scheduling is client-side,
// cascading like onFilterFinancialYear / onFilterSubEntity1/2/3. The Legal Entity select's
// change handler (OnFilterLegal) does not exist in the source controller, so changing it only
// changes the selection. The "Add New" button is commented out in the source view, so its create
// dialog is not part of this screen.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Page, Card, Toolbar, Field, Select, Input, DateInput, Dialog, DataTable, type Column, type Option } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { useApp } from '../../../context/AppContext';
import { read, create, F, And, Or, applyFilters, type Filter } from '../../../lib/odata';
import { objectValuesBy } from '../../../components/checklist/dedupe';
import { formatScheduleDate } from '../../../components/scheduling/scheduleDateFormat';

type Row = Record<string, any>;

function opts(list: Row[] | null, key: string): Option[] {
  return (list || [])
    .filter((r) => r[key] !== undefined && r[key] !== null && String(r[key]) !== '')
    .map((r) => ({ key: String(r[key]), text: String(r[key]) }));
}

/** The source copies the row's Date into the DatePicker as text and parses it back with
 * new Date(text), which keeps the instant but drops milliseconds. */
function secondsPrecision(v: unknown): Date | null {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return null;
  return new Date(Math.floor(v.getTime() / 1000) * 1000);
}

export default function AuditSchedulingPage() {
  const ui = useUi();
  const { getParams, mergeParams } = useApp();

  // auditSchedulingModel
  const [rows, setRows] = useState<Row[]>([]);
  // auditJsonModel>/AuditScheduling/*
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [subEntity3, setSubEntity3] = useState<Row[]>([]);

  const [legalKey, setLegalKey] = useState('');
  const [fyKey, setFyKey] = useState('');
  const [sub1Key, setSub1Key] = useState('');
  const [sub2Key, setSub2Key] = useState('');
  const [sub3Key, setSub3Key] = useState('');

  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);

  // Edit dialog (valueHelpForAuditSchedulingEdit)
  const [editObj, setEditObj] = useState<Row | null>(null);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);

  const legalOptions = useMemo(() => opts(legalEntities, 'LglEnt'), [legalEntities]);
  // legalEntityASSelectTest is forceSelection="true".
  const effectiveLegal = legalOptions.some((o) => o.key === legalKey) ? legalKey : legalOptions[0]?.key ?? '';

  const objPatternMatched = useCallback(async () => {
    const schModel = getParams<Record<string, any>>('countParameters');
    const filters = And([
      F('FinancialYear', 'EQ', schModel.FiscalYear),
      F('Scheduling', 'EQ', schModel.Scheduling),
      F('Period', 'EQ', schModel.Period),
      F('SubLglEntL1', 'EQ', schModel.SubLglEntL1),
      F('SubLglEntL2', 'EQ', schModel.SubLglEntL2),
    ]);
    mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });

    setSub1Key('');
    setFyKey('');
    setSub2Key('');
    setSub3Key('');

    try {
      const { results } = await read<Row>('/ZMSD_AUDIT_SCHDL001Set', { filters: [filters] });
      let serialNo = 1;
      results.forEach((obj) => {
        obj.slNo = serialNo++;
      });
      setRows(results);
      setTableFilter(undefined);
      if (results.length > 0) setData(results);

      const legalRef = objectValuesBy(results, 'LglEnt');
      if (legalRef.length > 0) setLegalEntities(legalRef.map((r) => ({ LglEnt: r.LglEnt })));

      const fyRef = objectValuesBy(results, 'FinancialYear');
      if (fyRef.length > 0) setFinancialYears([...fyRef.map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
    } catch {
      /* source error handler is empty */
    }
  }, [getParams, mergeParams]);

  // Route-matched handler runs once per visit (guarded so React strict-mode's double effect in
  // dev doesn't clear countParameters before the real read).
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    objPatternMatched();
  }, [objPatternMatched]);

  const onFilterFinancialYear = (selectedKey: string) => {
    setFyKey(selectedKey);
    const matched = data.filter((r) => r.FinancialYear == selectedKey);
    setSubEntity1([...objectValuesBy(matched, 'SubLglEntL1'), { SubLglEntL1: '' }]);
    setSub1Key('');
    setSub2Key('');
    setSub3Key('');
    const f: Filter[] = [Or([F('LglEnt', 'EQ', effectiveLegal)])];
    if (selectedKey !== '') f.push(Or([F('FinancialYear', 'EQ', selectedKey)]));
    setTableFilter(And(f));
  };

  const onFilterSubEntity1 = (selectedKey: string) => {
    setSub1Key(selectedKey);
    const matched = data.filter((r) => r.SubLglEntL1 == selectedKey);
    setSubEntity2([...objectValuesBy(matched, 'SubLglEntL2'), { SubLglEntL2: '' }]);
    setSub2Key('');
    setSub3Key('');
    const f: Filter[] = [Or([F('LglEnt', 'EQ', effectiveLegal)]), Or([F('FinancialYear', 'EQ', fyKey)])];
    if (selectedKey !== '') f.push(Or([F('SubLglEntL1', 'EQ', selectedKey)]));
    setTableFilter(And(f));
  };

  const onFilterSubEntity2 = (selectedKey: string) => {
    setSub2Key(selectedKey);
    const matched = data.filter((r) => r.SubLglEntL2 == selectedKey);
    setSubEntity3([...objectValuesBy(matched, 'Scheduling'), { Scheduling: '' }]);
    setSub3Key('');
    const f: Filter[] = [
      Or([F('LglEnt', 'EQ', effectiveLegal)]),
      Or([F('FinancialYear', 'EQ', fyKey)]),
      Or([F('SubLglEntL1', 'EQ', sub1Key)]),
    ];
    if (selectedKey !== '') f.push(Or([F('SubLglEntL2', 'EQ', selectedKey)]));
    setTableFilter(And(f));
  };

  const onFilterSubEntity3 = (selectedKey: string) => {
    setSub3Key(selectedKey);
    const f: Filter[] = [
      Or([F('LglEnt', 'EQ', effectiveLegal)]),
      Or([F('FinancialYear', 'EQ', fyKey)]),
      Or([F('SubLglEntL1', 'EQ', sub1Key)]),
      Or([F('SubLglEntL2', 'EQ', sub2Key)]),
    ];
    if (selectedKey !== '') f.push(Or([F('Scheduling', 'EQ', selectedKey)]));
    setTableFilter(And(f));
  };

  const displayed = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);

  const handleAuditSchedulingEditPress = (row: Row) => {
    setEditObj(row);
    setEditStart(secondsPrecision(row.StartDate));
    setEditEnd(secondsPrecision(row.EndDate));
  };

  const handleUpdateEditAuditSchedulingPress = () => {
    if (!editObj) return;
    const postObj = {
      AudSchdlGuid: editObj.AudSchdlGuid,
      Location: editObj.Location,
      Process: editObj.Process,
      FinancialYear: editObj.FinancialYear,
      Scheduling: editObj.Scheduling,
      Period: editObj.Period,
      LglEnt: editObj.LglEnt,
      SubLglEntL1: editObj.SubLglEntL1,
      SubLglEntL2: editObj.SubLglEntL2,
      SubLglEntL3: editObj.SubLglEntL3,
      Vertical: editObj.Vertical,
      StartDate: editStart ? formatScheduleDate(editStart) : null,
      EndDate: editEnd ? formatScheduleDate(editEnd) : null,
      Action: 'C',
    };
    ui.messageBox.confirm('Do you want to update the Audit Scheduling?', {
      onClose: (action) => {
        if (action !== 'OK') return;
        create('/ZMSD_AUDIT_SCHDL001Set', postObj)
          .then(() => {
            objPatternMatched();
            ui.messageBox.success('Audit Scheduling Updated Successfully!!');
            setEditObj(null);
          })
          .catch(() => ui.messageBox.error('Internal Server error'));
      },
    });
  };

  const handlAuditSchedulingDeletePress = (row: Row) => {
    const postObj = {
      AudSchdlGuid: row.AudSchdlGuid,
      Scheduling: row.Scheduling,
      Action: 'D',
      FinancialYear: row.FinancialYear, // Anjani 10.12.2025
    };
    ui.messageBox.confirm('Do you want to delete the Audit Scheduling?', {
      onClose: (action) => {
        if (action !== 'OK') return;
        create('/ZMSD_AUDIT_SCHDL001Set', postObj)
          .then(() => {
            objPatternMatched();
            ui.messageBox.success('Audit Scheduling Deleted Successfully!!');
          })
          .catch(() => ui.messageBox.error('Internal Server error'));
      },
    });
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Location', header: 'Location' },
    { key: 'Process', header: 'Process Name' },
    { key: 'FinancialYear', header: 'Financial Year' },
    { key: 'Scheduling', header: 'Scheduling' },
    { key: 'Period', header: 'Period' },
    { key: 'Schdl', header: 'Scheduling Status', value: (r) => (r.Schdl === 'X' ? 'Done' : '') },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <div className="flex gap-1">
          <button type="button" aria-label="Edit" onClick={() => handleAuditSchedulingEditPress(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-rust">
            <Pencil size={15} />
          </button>
          <button type="button" aria-label="Delete" onClick={() => handlAuditSchedulingDeletePress(r)} className="rounded-md p-1.5 text-inkSoft hover:bg-appBg hover:text-red">
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Page title="Audit Scheduling">
      <Card>
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-52">
            <Select value={effectiveLegal} onChange={setLegalKey} options={legalOptions} />
          </Field>
          <Field label="Financial Year" className="w-full sm:w-32">
            <Select value={fyKey} onChange={onFilterFinancialYear} options={opts(financialYears, 'FinancialYear')} placeholder="" />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-52">
            <Select value={sub1Key} onChange={onFilterSubEntity1} options={opts(subEntity1, 'SubLglEntL1')} placeholder="" />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-52">
            <Select value={sub2Key} onChange={onFilterSubEntity2} options={opts(subEntity2, 'SubLglEntL2')} placeholder="" />
          </Field>
          <Field label="Scheduling" className="w-full sm:w-52">
            <Select value={sub3Key} onChange={onFilterSubEntity3} options={opts(subEntity3, 'Scheduling')} placeholder="" />
          </Field>
        </Toolbar>
      </Card>

      <DataTable
        columns={columns}
        rows={displayed}
        growingThreshold={10}
        maxHeight="400px"
        rowKey={(r, i) => `${r.AudSchdlGuid ?? ''}-${i}`}
      />

      <Dialog
        open={!!editObj}
        title="Edit Audit Scheduling"
        onClose={() => setEditObj(null)}
        footer={
          <>
            <button type="button" className="btn-primary" onClick={handleUpdateEditAuditSchedulingPress}>
              Update
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditObj(null)}>
              Close
            </button>
          </>
        }
      >
        {editObj && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Location">
              <Input value={editObj.Location ?? ''} readOnly disabled />
            </Field>
            <Field label="Process Name">
              <Input value={editObj.Process ?? ''} readOnly disabled />
            </Field>
            <Field label="Financial Year">
              <Input value={editObj.FinancialYear ?? ''} readOnly disabled />
            </Field>
            <Field label="Scheduling">
              <Input value={editObj.Scheduling ?? ''} readOnly disabled />
            </Field>
            <Field label="Period">
              <Input value={editObj.Period ?? ''} readOnly disabled />
            </Field>
            <div className="hidden sm:block" />
            <Field label="Start Date">
              <DateInput value={editStart} onChange={setEditStart} />
            </Field>
            <Field label="End Date">
              <DateInput value={editEnd} onChange={setEditEnd} />
            </Field>
          </div>
        )}
      </Dialog>
    </Page>
  );
}
