'use client';

// Pending — port of pending.controller.js / pending.view.xml plus the DateDialog fragment.
//
// SAP calls (identical to the source):
//  GET  /ZSTR_PENDING_PROCESSSet  $filter from countParameters (FinancialYear, Scheduling, Period,
//                                  SubLglEntL1, SubLglEntL2) + Action eq 'I'; params then cleared
//  GET  /ZUSER_MASTERSet          (IsAuditManager == 'X' kept client-side)
//  POST /ZSTR_PENDING_PROCESSSet  Accept > Confirm, Action "5"
//
// The source controller also carries View Process / Delete Assignment / inProcess2Screen
// navigation handlers copied from other screens, but pending.view.xml binds none of them (their
// buttons are commented out and they reference controls/models this view doesn't have), so they
// have no reachable UI here and aren't ported.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Page, DataTable, Dialog, DateInput, Field, formatDateDisplay, type Column } from '../../../components/ui';
import { useApp } from '../../../context/AppContext';
import { useUi } from '../../../context/UiContext';
import { read, create, applyFilters, F, And, type Filter } from '../../../lib/odata';
import {
  Clock,
  FilterBar,
  EMPTY_BAR,
  EMPTY_OPTIONS,
  dedupeBy,
  filterBarChange,
  effectiveLegalEntity,
  auditManagers,
  type FilterBarState,
  type FilterBarOptions,
  type UserRow,
} from '../../../components/kickoff/shared';

type Row = Record<string, any>;

interface PendingDates {
  StartDate: Date | null;
  StartDateCheck: string;
  EndDate: Date | null;
  EndDateCheck: string;
  PendingPostData: Row | null;
}

export default function PendingPage() {
  const { getParams, mergeParams } = useApp();
  const ui = useUi();

  const [rows, setRows] = useState<Row[]>([]);
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [options, setOptions] = useState<FilterBarOptions>(EMPTY_OPTIONS);
  const [filterUsers, setFilterUsers] = useState<UserRow[]>([]);
  const [bar, setBar] = useState<FilterBarState>(EMPTY_BAR);
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);

  // auditJsonModel>/Pending/{StartDate,StartDateCheck,EndDate,EndDateCheck,PendingPostData} —
  // model state that outlives the (destroyed-on-close) DateDialog, kept in a ref since the
  // source mutates the stored Date objects in place.
  const pend = useRef<PendingDates>({ StartDate: null, StartDateCheck: '', EndDate: null, EndDateCheck: '', PendingPostData: null });
  const [dateOpen, setDateOpen] = useState(false);
  // The DateDialog's own DatePicker values (a fresh fragment each open, so empty each time).
  const [dlgStart, setDlgStart] = useState<Date | null>(null);
  const [dlgEnd, setDlgEnd] = useState<Date | null>(null);

  const effectiveLe = effectiveLegalEntity(bar.le, legalEntities);

  /** _objPatternMatched */
  const load = useCallback(() => {
    const penModel = getParams<Record<string, any>>('countParameters');
    const filters = And([
      F('FinancialYear', 'EQ', penModel.FiscalYear ?? ''),
      F('Scheduling', 'EQ', penModel.Scheduling ?? ''),
      F('Period', 'EQ', penModel.Period ?? ''),
      F('SubLglEntL1', 'EQ', penModel.SubLglEntL1 ?? ''),
      F('SubLglEntL2', 'EQ', penModel.SubLglEntL2 ?? ''),
      F('Action', 'EQ', 'I'),
    ]);
    mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });
    setBar((b) => ({ ...EMPTY_BAR, le: b.le }));

    read<Row>('/ZSTR_PENDING_PROCESSSet', { filters: [filters] })
      .then(({ results }) => {
        let serialNo = 1;
        results.forEach((obj) => {
          obj.slNo = serialNo++;
          obj.IsEnabled = !!(obj.KickoffBegda && obj.KickoffEndda);
          if (obj.NoAcpt) obj.IsEnabled = false;
        });
        setRows(results);
        setTableFilter(undefined);
        if (results.length > 0) setData(results);

        const le = dedupeBy(results, 'LglEnt');
        if (le.length > 0) setLegalEntities(le.map((r) => ({ LglEnt: r.LglEnt })));
        const fy = dedupeBy(results, 'FinancialYear');
        if (fy.length > 0) setFinancialYears([...fy.map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
      })
      .catch(() => {
        /* source error handler is empty */
      });

    read<UserRow>('/ZUSER_MASTERSet')
      .then(({ results }) => setFilterUsers(auditManagers(results)))
      .catch(() => ui.messageBox.error('Internal Server error'));
  }, [getParams, mergeParams, ui]);

  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    load();
  }, [load]);

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);

  const onBarChange = (field: keyof Omit<FilterBarState, 'le'>, key: string) => {
    // Pending's onFilterPerformer pushes FinancialYear unconditionally (Kickoff's only when set).
    const change = filterBarChange(field, key, bar, effectiveLe, data, { performerAlwaysFY: true });
    setBar({ ...change.bar, le: bar.le });
    if (change.options) setOptions((o) => ({ ...o, ...change.options }));
    setTableFilter(change.tableFilter);
  };

  const onPressAccept = (selected: Row) => {
    pend.current.PendingPostData = selected;
    setDlgStart(null);
    setDlgEnd(null);
    setDateOpen(true);
  };

  const onChangeStartDate = (d: Date | null) => {
    setDlgStart(d);
    pend.current.StartDate = d;
    pend.current.StartDateCheck = 'X';
  };

  const onChangeEndDate = (d: Date | null) => {
    setDlgEnd(d);
    pend.current.EndDate = d;
    pend.current.EndDateCheck = 'X';
  };

  const onPressConfirm = async () => {
    setDateOpen(false);
    const p = pend.current;
    const StartDate = p.StartDate;
    const EndDate = p.EndDate;

    // Plain JS comparison like the source — a null EndDate compares as 0, so it errors too.
    if ((EndDate as unknown as number) < (StartDate as unknown as number)) {
      ui.messageBox.error('End Date should be greater than or equal to Start Date.');
      return;
    }

    const Selected = p.PendingPostData || {};

    // The source shifts a freshly picked date forward one day before posting (it ends up at
    // local midnight, which SAP would otherwise store as the previous UTC day).
    if (p.StartDateCheck && StartDate) StartDate.setDate(StartDate.getDate() + 1);
    if (p.EndDateCheck && EndDate) EndDate.setDate(EndDate.getDate() + 1);
    p.StartDateCheck = '';
    p.EndDateCheck = '';

    const postObj = {
      AudSchdlGuid: Selected.AudSchdlGuid,
      AcceptBegda: StartDate,
      AcceptEndda: EndDate,
      Location: Selected.Location,
      BpGud: Selected.BpGud,
      Process: Selected.Process,
      SubProcess: Selected.SubProcess,
      FinancialYear: Selected.FinancialYear,
      Scheduling: Selected.Scheduling,
      Period: Selected.Period,
      LglEnt: Selected.LglEnt,
      SubLglEntL1: Selected.SubLglEntL1,
      SubLglEntL2: Selected.SubLglEntL2,
      SubLglEntL3: Selected.SubLglEntL3,
      Vertical: Selected.Vertical,
      Performer: Selected.Performer,
      Reviewer: Selected.Reviewer,
      KickoffBegda: Selected.KickoffBegda,
      KickoffEndda: Selected.KickoffEndda,
      Action: '5',
    };

    try {
      await create('/ZSTR_PENDING_PROCESSSet', postObj);
      ui.messageBox.success('Success', { onClose: () => window.location.reload() });
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3.5rem' },
    { key: 'Location', header: 'Location' },
    { key: 'Process', header: 'Process' },
    { key: 'FinancialYear', header: 'Year' },
    { key: 'Period', header: 'Month' },
    { key: 'Performer', header: 'Performer' },
    { key: 'Reviewer', header: 'Reviewer' },
    { key: 'KickoffBegda', header: 'Scheduled Start Date', render: (r) => formatDateDisplay(r.KickoffBegda) },
    { key: 'KickoffEndda', header: 'Scheduled End Date', render: (r) => formatDateDisplay(r.KickoffEndda) },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          className="btn-success !px-3 !py-1 text-[12px]"
          disabled={!r.IsEnabled}
          onClick={(e) => {
            e.stopPropagation();
            onPressAccept(r);
          }}
        >
          Accept
        </button>
      ),
    },
  ];

  return (
    <Page title="Pending" actions={<Clock />}>
      <FilterBar
        bar={bar}
        effectiveLe={effectiveLe}
        legalEntities={legalEntities}
        financialYears={financialYears}
        options={options}
        performers={filterUsers}
        reviewers={filterUsers}
        onLegalEntity={(k) => setBar((b) => ({ ...b, le: k }))}
        onChange={onBarChange}
      />

      <DataTable columns={columns} rows={visibleRows} growingThreshold={10} maxHeight="60vh" />

      <Dialog
        open={dateOpen}
        title="Confirm"
        onClose={() => setDateOpen(false)}
        width="max-w-md"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={onPressConfirm}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDateOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start Date" required>
            <DateInput value={dlgStart} onChange={onChangeStartDate} />
          </Field>
          <Field label="End Date" required>
            <DateInput value={dlgEnd} onChange={onChangeEndDate} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
