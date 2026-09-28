'use client';

// Audit Kickoff — port of auditKickoff.controller.js / auditKickoff.view.xml plus its
// valueHelpForViewProcessDetails and AuditKickOffDialog fragments. (valueHelpForReAssign… and
// valueHelpForDeleteAssignment… are instantiated in onInit but nothing in the view ever opens them —
// the "Delete Assignment" button is wired to handleOpenDeleteAssignmentAuditKickoff, which posts
// directly — so they have no reachable UI and aren't rendered.)
//
// SAP calls (identical to the source):
//  GET  /ZMSD_AUDIT_KICKOFFSet  $filter from countParameters (FinancialYear, Scheduling, Period,
//                                SubLglEntL1, SubLglEntL2), then those params are cleared
//  GET  /ZUSER_MASTERSet        (IsAuditManager == 'X' kept client-side)
//  POST /MultipleKickOffSet     { Action: 'S', List: [...rows] }        — Multiple Assignment
//  POST /ZMSD_AUDIT_KICKOFFSet  per row, Action 'C'                      — View Process > Save
//  POST /ZMSD_AUDIT_KICKOFFSet  per row, Action 'D'                      — Delete Assignment
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { Page, DataTable, Dialog, DateInput, Input, Field, formatDateDisplay, type Column } from '../../../components/ui';
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
  fullName,
  UserSelect,
  type FilterBarState,
  type FilterBarOptions,
  type UserRow,
} from '../../../components/kickoff/shared';

type Row = Record<string, any>;

interface KickOffState {
  KickoffBegda: Date | null;
  KickoffEndda: Date | null;
  ReasonForDelay: string;
  PerfomerChange: boolean;
  PerfomerUname: string;
  PerfomerName: string;
  RevewerChange: boolean;
  RevewerUname: string;
  RevewerName: string;
}

const INITIAL_AK: KickOffState = {
  KickoffBegda: null,
  KickoffEndda: null,
  ReasonForDelay: '',
  PerfomerChange: false,
  PerfomerUname: '',
  PerfomerName: '',
  RevewerChange: false,
  RevewerUname: '',
  RevewerName: '',
};

export default function AuditKickoffPage() {
  const { getParams, mergeParams } = useApp();
  const ui = useUi();

  // auditKickoffModel
  const [rows, setRows] = useState<Row[]>([]);
  // auditJsonModel>/AuditKickOff/*
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [options, setOptions] = useState<FilterBarOptions>(EMPTY_OPTIONS);
  const [filterUsers, setFilterUsers] = useState<UserRow[]>([]);
  const [userDataPer, setUserDataPer] = useState<UserRow[]>([]);
  const [userDataRev, setUserDataRev] = useState<UserRow[]>([]);
  const akRef = useRef<KickOffState>({ ...INITIAL_AK });
  const [ak, setAkState] = useState<KickOffState>(akRef.current);
  const setAk = useCallback((patch: Partial<KickOffState>) => {
    akRef.current = { ...akRef.current, ...patch };
    setAkState(akRef.current);
  }, []);

  const [bar, setBar] = useState<FilterBarState>(EMPTY_BAR);
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);
  // Selection remembered by row index into `rows` (UI5 rememberSelections — survives filtering).
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // View Process dialog
  const [vpOpen, setVpOpen] = useState(false);
  const [vpGuid, setVpGuid] = useState<string>('');
  const [vpSelected, setVpSelected] = useState<Set<number>>(new Set());

  // Multiple Assignment dialog (AuditKickOffDialog)
  const [maOpen, setMaOpen] = useState(false);
  const [maPaths, setMaPaths] = useState<number[]>([]);
  const [maPerformer, setMaPerformer] = useState('');
  const [maReviewer, setMaReviewer] = useState('');
  const [maStart, setMaStart] = useState<Date | null>(null);
  const [maEnd, setMaEnd] = useState<Date | null>(null);
  const [maReason, setMaReason] = useState('');

  const effectiveLe = effectiveLegalEntity(bar.le, legalEntities);

  /** _objPatternMatched */
  const load = useCallback(async () => {
    const kickoffModel = getParams<Record<string, any>>('countParameters');
    const filters = And([
      F('FinancialYear', 'EQ', kickoffModel.FiscalYear ?? ''),
      F('Scheduling', 'EQ', kickoffModel.Scheduling ?? ''),
      F('Period', 'EQ', kickoffModel.Period ?? ''),
      F('SubLglEntL1', 'EQ', kickoffModel.SubLglEntL1 ?? ''),
      F('SubLglEntL2', 'EQ', kickoffModel.SubLglEntL2 ?? ''),
    ]);
    mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });

    // setSelectedKey() on every select but Legal Entity.
    setBar((b) => ({ ...EMPTY_BAR, le: b.le }));

    read<Row>('/ZMSD_AUDIT_KICKOFFSet', { filters: [filters] })
      .then(({ results }) => {
        let serialNo = 1;
        results.forEach((obj) => {
          obj.slNo = serialNo++;
        });
        // A new auditKickoffModel rebinds the table: application filters and selections reset.
        setRows(results);
        setTableFilter(undefined);
        setSelected(new Set());
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
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r, i])), [rows]);
  const visibleSelected = useMemo(
    () => new Set(visibleRows.map((r, i) => (selected.has(rowIndex.get(r)!) ? i : -1)).filter((i) => i >= 0)),
    [visibleRows, selected, rowIndex],
  );

  const onBarChange = (field: keyof Omit<FilterBarState, 'le'>, key: string) => {
    const change = filterBarChange(field, key, bar, effectiveLe, data, { performerAlwaysFY: false });
    setBar({ ...change.bar, le: bar.le });
    if (change.options) setOptions((o) => ({ ...o, ...change.options }));
    setTableFilter(change.tableFilter);
  };

  // ------------------------------------------------------------------ Multiple Assignment
  const onPressMultipleAssignment = async () => {
    const aPath = Array.from(selected).sort((a, b) => a - b);
    if (aPath.length == 0) return;
    setMaPaths(aPath);
    try {
      const { results } = await read<UserRow>('/ZUSER_MASTERSet');
      const aTemp = auditManagers(results);
      setUserDataPer(aTemp);
      setUserDataRev(aTemp);
      // Fresh fragment each time (destroyed on close/confirm).
      setMaPerformer('');
      setMaReviewer('');
      setMaStart(null);
      setMaEnd(null);
      setMaReason('');
      setMaOpen(true);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const onConfirmAuditKickOffDialog = async () => {
    const Performer = maPerformer;
    const Reviewer = maReviewer;
    if (Performer == Reviewer) {
      ui.messageBox.error('Performer & Reviewer should not be same.');
      return;
    }
    if (!Performer || !Reviewer) {
      ui.messageBox.error('Performer & Reviewer should not be blank.');
      return;
    }
    const StartDate = maStart;
    const EndDate = maEnd;
    if (!StartDate) {
      ui.messageBox.error('Start Date & End Date should not be blank.');
      return;
    }
    if (!EndDate) {
      ui.messageBox.error('Start Date & End Date should not be blank.');
      return;
    }
    if (EndDate < StartDate) {
      ui.messageBox.error('End Date should be greater than or equal to Start Date.');
      return;
    }
    const ReasonforDelay = maReason;

    let PerformerU = '';
    userDataPer.forEach((Per) => {
      if (fullName(Per) == Performer) PerformerU = Per.Uname as string;
    });
    let ReviewerU = '';
    userDataRev.forEach((Rev) => {
      if (fullName(Rev) == Reviewer) ReviewerU = Rev.Uname as string;
    });

    const aTemp = maPaths.map((path) => {
      const data = rows[path];
      delete data.slNo;
      data.Performer = Performer;
      data.PerformerU = PerformerU;
      data.Reviewer = Reviewer;
      data.ReviewerU = ReviewerU;
      data.KickoffBegda = StartDate;
      data.KickoffEndda = EndDate;
      data.ReasonDelay = ReasonforDelay;
      return data;
    });

    setMaOpen(false);

    try {
      await create('/MultipleKickOffSet', { Action: 'S', List: aTemp });
      ui.messageBox.success('Data Updated Successfully!!', { onClose: () => window.location.reload() });
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  // ------------------------------------------------------------------ View Process
  const vpRows = useMemo(() => (vpOpen ? applyFilters(rows, [F('AudSchdlGuid', 'EQ', vpGuid)]) : []), [rows, vpGuid, vpOpen]);

  const handleProcessViewPress = async (row: Row) => {
    setVpSelected(new Set());
    setVpGuid(row.AudSchdlGuid);
    const patch: Partial<KickOffState> = {
      KickoffBegda: row.KickoffBegda ? row.KickoffBegda : null,
      KickoffEndda: row.KickoffEndda ? row.KickoffEndda : null,
    };
    if (row.ReasonDelay) patch.ReasonForDelay = row.ReasonDelay;
    setAk(patch);
    try {
      const { results } = await read<UserRow>('/ZUSER_MASTERSet');
      const aTemp = auditManagers(results);
      setUserDataPer(aTemp);
      setUserDataRev(aTemp);
      setVpOpen(true);
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  /** Two-way selectedKey binding on the row's Performer/Reviewer Select — writes into the row. */
  const updateRow = (row: Row, patch: Row) => {
    Object.assign(row, patch);
    setRows((r) => [...r]);
  };

  const handleSaveViewProcessPress = () => {
    const selectedItems = vpRows.filter((_, i) => vpSelected.has(i));
    // Source reads getSelectedItems()[0] up front and throws with nothing selected.
    if (selectedItems.length === 0) return;
    const total = selectedItems.length;
    let serviceCount = 0;

    const { RevewerChange, RevewerUname, PerfomerChange, PerfomerUname, KickoffBegda, KickoffEndda, ReasonForDelay, PerfomerName, RevewerName } =
      akRef.current;

    if (!KickoffBegda) {
      ui.messageBox.error('Start Date & End Date should not be blank.');
      return;
    }
    if (!KickoffEndda) {
      ui.messageBox.error('Start Date & End Date should not be blank.');
      return;
    }
    if (KickoffEndda < KickoffBegda) {
      ui.messageBox.error('End Date should be greater than or equal to Start Date.');
      return;
    }
    if (RevewerChange && PerfomerChange) {
      if (PerfomerName == RevewerName) {
        ui.messageBox.error('Performer & Reviewer should not be same.');
        return;
      }
    }

    for (let m = 0; m < selectedItems.length; m++) {
      const selectedObj = selectedItems[m];
      const postObj: Record<string, any> = {
        AudSchdlGuid: selectedObj.AudSchdlGuid,
        PerformerU: selectedObj.PerformerU,
        ReviewerU: selectedObj.ReviewerU,
        Location: selectedObj.Location,
        BpGud: selectedObj.BpGud,
        Process: selectedObj.Process,
        FinancialYear: selectedObj.FinancialYear,
        Scheduling: selectedObj.Scheduling,
        Period: selectedObj.Period,
        LglEnt: selectedObj.LglEnt,
        SubLglEntL1: selectedObj.SubLglEntL1,
        SubLglEntL2: selectedObj.SubLglEntL2,
        SubLglEntL3: selectedObj.SubLglEntL3,
        Vertical: selectedObj.Vertical,
        Performer: selectedObj.Performer ?? '',
        Reviewer: selectedObj.Reviewer ?? '',
        Action: 'C',
        KickoffBegda,
        KickoffEndda,
        ReasonDelay: ReasonForDelay,
      };

      if (postObj.Performer == postObj.Reviewer) {
        ui.messageBox.error('Performer & Reviewer should not be same.');
        return;
      }
      if (!postObj.Performer || !postObj.Reviewer) {
        ui.messageBox.error('Performer & Reviewer should not be blank.');
        return;
      }
      if (PerfomerChange) postObj.PerformerU = PerfomerUname;
      if (RevewerChange) postObj.ReviewerU = RevewerUname;

      if (KickoffBegda) {
        const TodayDate = new Date();
        TodayDate.setHours(0, 0, 0, 0);
        if (KickoffBegda < TodayDate) {
          ui.messageBox.error("Kickoff start date should be greater than or equal to today's Date.");
          return;
        }
      }

      create('/ZMSD_AUDIT_KICKOFFSet', postObj)
        .then(() => {
          serviceCount++;
          if (total == serviceCount) {
            load();
            ui.messageBox.success('Data Updated Successfully!!');
            setVpOpen(false);
          }
        })
        .catch(() => ui.messageBox.error('Internal Server error'));
    }
  };

  const handleViewProcessCancelPress = () => {
    setVpOpen(false);
    setAk({ RevewerChange: false, RevewerUname: '', PerfomerChange: false, PerfomerUname: '' });
  };

  // ------------------------------------------------------------------ Delete Assignment
  const handleOpenDeleteAssignmentAuditKickoff = () => {
    // getSelectedItems(): only rows currently shown by the table's filter.
    const selectedTableItems = visibleRows.filter((_, i) => visibleSelected.has(i));
    const total = selectedTableItems.length;
    let count = 0;
    if (total == 0) {
      ui.messageBox.error('Please select atleast one item to delete');
      return;
    }
    for (const o of selectedTableItems) {
      const postObj = {
        AudSchdlGuid: o.AudSchdlGuid,
        Location: o.Location,
        BpGud: o.BpGud,
        Process: o.Process,
        FinancialYear: o.FinancialYear,
        Scheduling: o.Scheduling,
        Period: o.Period,
        LglEnt: o.LglEnt,
        SubLglEntL1: o.SubLglEntL1,
        SubLglEntL2: o.SubLglEntL2,
        SubLglEntL3: o.SubLglEntL3,
        Vertical: o.Vertical,
        Performer: o.Performer,
        Reviewer: o.Reviewer,
        Action: 'D',
      };
      create('/ZMSD_AUDIT_KICKOFFSet', postObj)
        .then(() => {
          count++;
          if (count == total) ui.messageBox.success('Selected Items are deleted Successfully!!');
        })
        .catch(() => ui.messageBox.error('Internal Server error'));
    }
  };

  // ------------------------------------------------------------------ Render
  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3.5rem' },
    { key: 'Location', header: 'Location' },
    { key: 'Process', header: 'Process Name' },
    { key: 'FinancialYear', header: 'Financial Year' },
    { key: 'Period', header: 'Period' },
    { key: 'Performer', header: 'Performer' },
    { key: 'Reviewer', header: 'Reviewer' },
    { key: 'KickoffBegda', header: 'Audit Start Date', render: (r) => formatDateDisplay(r.KickoffBegda) },
    { key: 'KickoffEndda', header: 'Audit End Date', render: (r) => formatDateDisplay(r.KickoffEndda) },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="View process"
          onClick={(e) => {
            e.stopPropagation();
            handleProcessViewPress(r);
          }}
          className="rounded-md p-1.5 text-rust hover:bg-glassRust"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  const vpColumns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3.5rem' },
    { key: 'Location', header: 'Location' },
    { key: 'Process', header: 'Process Name' },
    {
      key: 'Performer',
      header: 'Performer',
      width: '11rem',
      render: (r) => (
        <UserSelect
          users={userDataPer}
          value={r.Performer ?? ''}
          onPick={(name, user) => {
            updateRow(r, { Performer: name });
            if (user) setAk({ PerfomerName: fullName(user), PerfomerChange: true, PerfomerUname: user.Uname as string });
          }}
        />
      ),
    },
    {
      key: 'Reviewer',
      header: 'Reviewer',
      width: '11rem',
      render: (r) => (
        <UserSelect
          users={userDataRev}
          value={r.Reviewer ?? ''}
          onPick={(name, user) => {
            updateRow(r, { Reviewer: name });
            if (user) setAk({ RevewerName: fullName(user), RevewerChange: true, RevewerUname: user.Uname as string });
          }}
        />
      ),
    },
    {
      key: 'start',
      header: 'Start Date',
      width: '9.5rem',
      render: () => (
        <DateInput value={ak.KickoffBegda} onChange={(d) => d && setAk({ KickoffBegda: d })} />
      ),
    },
    {
      key: 'end',
      header: 'End Date',
      width: '9.5rem',
      render: () => <DateInput value={ak.KickoffEndda} onChange={(d) => d && setAk({ KickoffEndda: d })} />,
    },
    {
      key: 'reason',
      header: 'Reason for Delay',
      width: '12rem',
      render: () => (
        <Input value={ak.ReasonForDelay} placeholder="Enter Reason" onChange={(e) => setAk({ ReasonForDelay: e.target.value || '' })} />
      ),
    },
  ];

  return (
    <Page title="Audit Kickoff(List of Audits)" actions={<Clock />}>
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
      >
        <button type="button" className="btn-primary" onClick={handleOpenDeleteAssignmentAuditKickoff}>
          Delete Assignment
        </button>
        <button type="button" className="btn-primary" onClick={onPressMultipleAssignment}>
          Multiple Assignment
        </button>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={visibleRows}
        selectionMode="MultiSelect"
        selected={visibleSelected}
        onSelectionChange={(next) => {
          const s = new Set(selected);
          visibleRows.forEach((r, i) => {
            const idx = rowIndex.get(r)!;
            if (next.has(i)) s.add(idx);
            else s.delete(idx);
          });
          setSelected(s);
        }}
        growingThreshold={20}
        maxHeight="60vh"
      />

      <Dialog
        open={vpOpen}
        title="View Process"
        onClose={handleViewProcessCancelPress}
        width="max-w-6xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={handleSaveViewProcessPress}>
              Save
            </button>
            <button type="button" className="btn-ghost" onClick={handleViewProcessCancelPress}>
              Close
            </button>
          </>
        }
      >
        <DataTable
          columns={vpColumns}
          rows={vpRows}
          selectionMode="MultiSelect"
          selected={vpSelected}
          onSelectionChange={setVpSelected}
          growingThreshold={10}
        />
      </Dialog>

      <Dialog
        open={maOpen}
        title="Confirm"
        onClose={() => setMaOpen(false)}
        width="max-w-xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={onConfirmAuditKickOffDialog}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMaOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Performer" required>
            <UserSelect users={userDataPer} value={maPerformer} onPick={(name) => setMaPerformer(name)} />
          </Field>
          <Field label="Reviewer" required>
            <UserSelect users={userDataRev} value={maReviewer} onPick={(name) => setMaReviewer(name)} />
          </Field>
          <Field label="Start Date" required>
            <DateInput value={maStart} onChange={setMaStart} />
          </Field>
          <Field label="End Date" required>
            <DateInput value={maEnd} onChange={setMaEnd} />
          </Field>
          <Field label="Reason for Delay" className="sm:col-span-2">
            <Input value={maReason} onChange={(e) => setMaReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Page>
  );
}
