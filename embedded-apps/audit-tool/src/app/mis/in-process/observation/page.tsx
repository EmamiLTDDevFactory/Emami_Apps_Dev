'use client';

// MIS - Subprocess — port of the source app's MISinprocess2 view/controller and the fragments it
// opens (MISinProcess2Action, observationDialogDisplayMis, observationDialogEditMis,
// UserListDialogPer/Owner, addSubProcess).
//
// SAP calls, identical to the source:
//  - route matched: GET ZSTR_MSD_PROCESS_AUDITSet $filter (one AND multi-filter from
//    inProcessParameters: SubLglEntL1, SubLglEntL2, Process, SubProcess eq '', Gjahr, Scheduling,
//    Period, Action, Status); GET ZUSER_MASTERSet (IsAuditManager 'X' -> /InProcess2/User);
//    GET ZDEPARTMENT_MASTERSet.
//  - row view: GET ZUSER_MASTERSet (-> userJsonModel), GET ObservationAttachementSet (AND of
//    ControlNumber, Gjahr, SubLglEntL1, SubLglEntL2, Process, Scheduling, Period, SubProcess),
//    GET ZSTR_MSD_PROCESS_AUDITSet $filter (SubLglEntL1..Period, Action eq 'M') $expand
//    OBSERVATION/EmailTable -> opens the Observation Details dialog.
//  - "+" (Create SubProcess): POST ZSTR_MSD_PROCESS_AUDITSet Action 'N'.
//  - Save (dialog) / Alter Status (multi-select): POST ZSTR_MSD_PROCESS_AUDITSet Action 'M' deep
//    insert with OBSERVATION (+ nested EmailTable).
//  - Upload File: POST ObservationAttachementSet (Value = btoa(base64 content)); delete icon:
//    POST ObservationAttachementSet with Action 'D'.
//
// State is held the way the source's JSONModels hold it — plain mutable objects shared by
// reference (the dialog's ObservationDetail IS the ObservationItem row, PersonAndOwnerTableData IS
// that row's EmailTable, AuditModel IS the clicked table row) — with refresh() re-rendering, the
// equivalent of oModel.refresh(). That keeps every "edit is live before Save" behaviour identical.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, PencilLine, Trash2, Plus, Download } from 'lucide-react';
import {
  Page,
  Card,
  Toolbar,
  Field,
  Select,
  TextArea,
  Checkbox,
  Dialog,
  DataTable,
  Tabs,
  uniqueBy,
  type Column,
  type Option,
} from '../../../../components/ui';
import HeaderClock from '../../../../components/mis-inprocess/HeaderClock';
import { ObservationDisplayDialog, ObservationEditDialog } from '../../../../components/mis-inprocess/ObservationDialogs';
import { useUi } from '../../../../context/UiContext';
import { useApp } from '../../../../context/AppContext';
import { useNavTo } from '../../../../lib/routes';
import { read, create, F, And, applyFilters, sapErrorMessage, type Filter } from '../../../../lib/odata';
import { readFileAsBase64, downloadAttachment } from '../../../../lib/files';
import { observationPassthrough } from '../../../../components/inprocess/observation';

type Row = Record<string, any>;

const FLAG_FIELDS_BOOL = [
  'ObservationReportAudRep',
  'ObservationReportMis',
  'ObservationReportAudCom',
  'ObservationReportNone',
  'OsrvtnCatProc',
  'OsrvtnCatCost',
  'OsrvtnCatRegu',
  'OsrvtnCatOthr',
  'OsrvtnScatP1',
  'OsrvtnScatP2',
  'OsrvtnScatP3',
  'RootCausePe',
  'RootCausePr',
  'RootCauseTe',
];

const PAYLOAD_FLAG_FIELDS = [...FLAG_FIELDS_BOOL, 'Dropped'];

const BULK_STATUS_OPTIONS: Option[] = [
  { key: 'Send Back to Performer', text: 'Send Back to Performer' },
  { key: 'Send To Auditee', text: 'Send To Auditee' },
  { key: 'Close', text: 'Close' },
];
const REVIEWER_STATUS_OPTIONS: Option[] = [
  { key: 'Send Back to Performer', text: 'Send Back to Performer' },
  { key: 'Send to Auditee', text: 'Send to Auditee' },
  { key: 'Close', text: 'Close' },
  { key: 'MIS Close', text: 'MIS Close' },
  { key: '', text: '' },
];
const PERFORMER_STATUS_OPTIONS: Option[] = [
  { key: 'Send to Reviewer', text: 'Send to Reviewer' },
  { key: '', text: '' },
];

/** forceSelection="false" Select whose bound value may not be one of its items — show it blank. */
function shownKey(value: string, options: Option[]): string {
  return options.some((o) => o.key === value) ? value : '';
}

interface Model {
  // inProcess2ScreenModel + filter models
  rows: Row[];
  legalEntities: Row[];
  subEntity1: Row[];
  subEntity2: Row[];
  // auditJsonModel>/InProcess2/*
  User: Row[];
  ObservationItem: Row[];
  ObservationItemHeader: Row;
  ObservationDetail: Row | null;
  PersonAndOwnerTableData: Row[] | undefined;
  PersonAndOwnerTableSelectedPath: Row | null;
  SubProcess: string;
  AuditSteps: string;
  ControlDesc: string;
  RiskDesc: string;
  AuditObj: string;
  // auditJsonModel>/Action, /ObservationDetail/Editable, /Visible, /inProcess2Mul
  Action: { MailId: string; Status: string; StatusPerformerVisible: boolean; StatusReviewerVisible: boolean };
  Editable: boolean;
  Visible: { slectAction: boolean; Action: boolean; SelectedKey: string };
  inProcess2Mul: Row[];
  // auditJsonModel>/ObservationAttachement
  Attachment: { FileName: string; FileType: string; Content: string; Data: Row[] };
  // AuditModel (the clicked row)
  AuditModel: Row | null;
}

function initialModel(): Model {
  return {
    rows: [],
    legalEntities: [],
    subEntity1: [],
    subEntity2: [],
    User: [],
    ObservationItem: [],
    ObservationItemHeader: {},
    ObservationDetail: null,
    PersonAndOwnerTableData: undefined,
    PersonAndOwnerTableSelectedPath: null,
    SubProcess: '',
    AuditSteps: '',
    ControlDesc: '',
    RiskDesc: '',
    AuditObj: '',
    Action: { MailId: '', Status: '', StatusPerformerVisible: false, StatusReviewerVisible: false },
    Editable: false,
    Visible: { slectAction: false, Action: false, SelectedKey: '' },
    inProcess2Mul: [],
    Attachment: { FileName: '', FileType: '', Content: '', Data: [] },
    AuditModel: null,
  };
}

const toX = (v: unknown) => (v === true || v === 'X' ? 'X' : '');

export default function MisInProcessObservationPage() {
  const ui = useUi();
  const { getParams, setParams } = useApp();
  const navTo = useNavTo();

  const m = useRef<Model>(initialModel()).current;
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Table filters (legalEntityIP2Select / subEntity1IP2Select / subEntity2IP2Select)
  const [le, setLe] = useState('');
  const [se1, setSe1] = useState('');
  const [se2Index, setSe2Index] = useState(''); // display only — see handleChangeSubEntity2 note
  const [se2Filter, setSe2Filter] = useState<string | null>(null); // SubLglEntL1 the se2 items are filtered by
  const [tableFilter, setTableFilter] = useState<Filter[] | Filter | undefined>(undefined);
  const [selectedRows, setSelectedRows] = useState<Set<Row>>(new Set());

  // Dialog state
  const [actionOpen, setActionOpen] = useState(false);
  const [actionTab, setActionTab] = useState('steps');
  const [displayOpen, setDisplayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [users, setUsers] = useState<Row[]>([]); // userJsonModel
  const [fileChosen, setFileChosen] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [annexure, setAnnexure] = useState(false);
  const savingRef = useRef(false);

  // -------------------------------------------------------------------------------------------
  // _objPatternMatched
  // -------------------------------------------------------------------------------------------
  useEffect(() => {
    const p = getParams<Row>('inProcessParameters');
    const filters = And([
      F('SubLglEntL1', 'EQ', p.SubLglEntL1),
      F('SubLglEntL2', 'EQ', p.SubLglEntL2),
      F('Process', 'EQ', p.Process),
      F('SubProcess', 'EQ', ''),
      F('Gjahr', 'EQ', p.Gjahr),
      F('Scheduling', 'EQ', p.Scheduling),
      F('Period', 'EQ', p.Period),
      F('Action', 'EQ', p.Action),
      F('Status', 'EQ', p.Status),
    ]);
    read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', { filters: [filters] })
      .then(({ results }) => {
        let serialNo = 1;
        results.forEach((obj) => {
          obj.slNo = serialNo++;
        });
        m.rows = results;
        m.legalEntities = uniqueBy(results, 'LglEnt');
        m.subEntity1 = uniqueBy(results, 'SubLglEntL1');
        m.subEntity2 = uniqueBy(results, 'SubLglEntL2');
        // forceSelection="true" on the legal entity select
        setLe(m.legalEntities.length ? String(m.legalEntities[0].LglEnt ?? '') : '');
        refresh();
      })
      .catch(() => {
        /* source error handler is empty */
      });

    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => {
        m.User = results.filter((u) => u.IsAuditManager == 'X');
        refresh();
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    // deptMasterModel — only consumed by a Department select that is commented out in the source
    // fragment, but the read is still issued.
    read<Row>('/ZDEPARTMENT_MASTERSet').catch(() => ui.messageBox.error('Unable to load Department Master'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------------------------
  const handleCommonFilterFunction = (leKey: string, se1Key: string, se2Key: string) => {
    const filterArr: Filter[] = [];
    if (leKey != 'Legal Entity' && leKey != '') filterArr.push(F('LglEnt', 'EQ', leKey));
    if (se1Key != 'Sub Entity 1' && se1Key != '') filterArr.push(F('SubLglEntL1', 'EQ', se1Key));
    if (se2Key != 'Process' && se2Key != '') filterArr.push(F('SubLglEntL2', 'EQ', se2Key));
    if (filterArr.length == 0) setTableFilter([]);
    else if (filterArr.length == 1) setTableFilter(filterArr);
    else setTableFilter(And(filterArr));
  };

  // The source's Sub Entity 2 item key binding is "{filterSubEntity2M odel>SubLglEntL2}" (a typo'd
  // model name), so in the Fiori every item key is empty and selecting one never filters. The
  // evident intent — filter by the picked SubLglEntL2 — is implemented, same as the ARS
  // observation screen. SE2_KEY is the Sub Entity 2 key when only Sub Entity 1 changes.
  const SE2_KEY = '';

  const handleChangeSubEntity1 = (key: string) => {
    setSe1(key);
    if (key != 'Sub Entity 1') {
      setSe2Filter(key);
      setSe2Index('');
    } else {
      setSe2Filter(null);
    }
    handleCommonFilterFunction(le, key, SE2_KEY);
  };

  const visibleRows = useMemo(() => applyFilters(m.rows, tableFilter), [m.rows, tableFilter]);
  const se2Items = useMemo(
    () => (se2Filter === null ? m.subEntity2 : applyFilters(m.subEntity2, [F('SubLglEntL1', 'EQ', se2Filter)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.subEntity2, se2Filter],
  );

  // -------------------------------------------------------------------------------------------
  // Table selection (onSelectionChange / onClickAction)
  // -------------------------------------------------------------------------------------------
  const selectedIdx = useMemo(
    () => new Set(visibleRows.map((r, i) => (selectedRows.has(r) ? i : -1)).filter((i) => i >= 0)),
    [visibleRows, selectedRows],
  );

  const onSelectionChange = (next: Set<number>) => {
    const nextSel = new Set(selectedRows);
    visibleRows.forEach((r, i) => {
      if (next.has(i)) nextSel.add(r);
      else nextSel.delete(r);
    });
    setSelectedRows(nextSel);
    const aSelectedData = visibleRows.filter((r) => nextSel.has(r));
    m.inProcess2Mul = aSelectedData;
    if (aSelectedData.length > 1) {
      m.Visible.slectAction = true;
      m.Visible.Action = true;
    } else {
      m.Visible.slectAction = false;
      m.Visible.Action = false;
    }
    refresh();
  };

  // -------------------------------------------------------------------------------------------
  // Row view -> Observation Details dialog
  // -------------------------------------------------------------------------------------------
  const getAttachment = (data: Row) => {
    const filters = And([
      F('ControlNumber', 'EQ', data.ControlNumber),
      F('Gjahr', 'EQ', data.Gjahr),
      F('SubLglEntL1', 'EQ', data.SubLglEntL1),
      F('SubLglEntL2', 'EQ', data.SubLglEntL2),
      F('Process', 'EQ', data.Process),
      F('Scheduling', 'EQ', data.Scheduling),
      F('Period', 'EQ', data.Period),
      F('SubProcess', 'EQ', data.SubProcess),
    ]);
    read<Row>('/ObservationAttachementSet', { filters: [filters] })
      .then(({ results }) => {
        m.Attachment.Data = results.map((item) => {
          item.Annexture = item.Annexture == 'X';
          return item;
        });
        refresh();
      })
      .catch(() => ui.messageBox.error('Internal Server error'));
  };

  const getObservationItem = (data: Row) => {
    const aFilters = [
      F('SubLglEntL1', 'EQ', data.SubLglEntL1),
      F('SubLglEntL2', 'EQ', data.SubLglEntL2),
      F('Process', 'EQ', data.Process),
      F('SubProcess', 'EQ', data.SubProcess),
      F('Gjahr', 'EQ', data.Gjahr),
      F('Scheduling', 'EQ', data.Scheduling),
      F('Period', 'EQ', data.Period),
      F('Action', 'EQ', 'M'),
    ];
    read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', { filters: aFilters, urlParameters: { $expand: 'OBSERVATION/EmailTable' } })
      .then(({ results }) => {
        const Data = results && results[0];
        if (!Data) {
          ui.busy(false);
          ui.messageBox.warning('No audit data found for this sub process.');
          return;
        }
        const ObservationItem: Row[] = (Data.OBSERVATION && Data.OBSERVATION.results) || [];
        for (const item of ObservationItem) {
          const EmailTable: Row[] = item.EmailTable?.results || [];
          let checkSendToAudit = '';
          for (const e of EmailTable) {
            if (e.PersonResMail == 'X') {
              e.PersonResMail = true;
              checkSendToAudit = 'X';
            } else {
              e.PersonResMail = false;
            }
            e.OwnerMail = e.OwnerMail == 'X';
          }
          item.EmailTable = EmailTable;
          item.SendToAuditee = checkSendToAudit === 'X';
          if (item.Lineitem !== undefined && item.Lineitem !== null) item.Lineitem = Number(item.Lineitem.toString()).toString();
          for (const f of FLAG_FIELDS_BOOL) item[f] = item[f] == 'X';
          item.Dropped = item.Dropped === 'X';
        }
        m.ObservationItemHeader = Data;
        m.ObservationItem = ObservationItem;
        m.Action.StatusPerformerVisible = false;
        m.Action.StatusReviewerVisible = false;
        if (Data.UserType) {
          if (Data.UserType == 'R') m.Action.StatusReviewerVisible = true;
          else if (Data.UserType == 'P') m.Action.StatusPerformerVisible = true;
        }
        if (Data.Status) m.Action.Status = Data.Status;
        if (Data.UserType == 'P' && (Data.Status == 'Send Back to Performer' || Data.Status == '')) {
          m.Editable = true;
        } else if (
          Data.UserType == 'R' &&
          (Data.Status == 'Send to Reviewer' ||
            Data.Status == 'Send Back to Performer' ||
            Data.Status == 'Management Responded' ||
            Data.Status == '' ||
            Data.Status == 'Send to Auditee' ||
            Data.Status == 'Close')
        ) {
          m.Editable = true;
        } else {
          m.Editable = false;
        }
        refresh();
        ui.busy(false);
        setActionOpen(true);
      })
      .catch(() => {
        ui.busy(false);
        ui.messageBox.error('Internal Server error');
      });
  };

  const handleInProgressNextScreenPress1 = (selectedRow: Row) => {
    ui.busy(true);
    m.AuditModel = selectedRow;
    m.Action.MailId = '';
    m.Action.Status = '';
    m.Editable = true;
    // A fresh MISinProcess2Action dialog each time, as after the source's close()+destroy().
    setActionTab('steps');
    setAnnexure(false);
    setFileChosen('');
    setFileInputKey((k) => k + 1);
    refresh();
    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => {
        setUsers(results);
        setParams('userJsonModel', results);
      })
      .catch(() => ui.messageBox.error('Internal Server error'));
    getAttachment(selectedRow);
    getObservationItem(selectedRow);
  };

  const closeActionDialog = () => setActionOpen(false);

  // -------------------------------------------------------------------------------------------
  // Create SubProcess (addSubProcess fragment)
  // -------------------------------------------------------------------------------------------
  const onPressConfirmSubprocess = () => {
    const { SubProcess, AuditSteps, RiskDesc, ControlDesc, AuditObj } = m;
    if (!SubProcess || !AuditSteps || !RiskDesc || !ControlDesc || !AuditObj) {
      ui.messageBox.error('Please provide required field');
      return;
    }
    setAddSubOpen(false);
    const first = m.rows[0];
    if (!first) {
      ui.messageBox.error('Process data is missing');
      return;
    }
    const postObj = {
      Action: 'N',
      AuditSteps,
      ControlNumber: first.ControlNumber,
      Gjahr: first.Gjahr,
      LglEnt: first.LglEnt,
      SubLglEntL1: first.SubLglEntL1,
      SubLglEntL2: first.SubLglEntL2,
      Process: first.Process,
      SubProcess,
      RiskDesc,
      ControlDesc,
      AuditObj,
    };
    create('/ZSTR_MSD_PROCESS_AUDITSet', postObj)
      .then(() => {
        m.SubProcess = '';
        m.AuditSteps = '';
        m.RiskDesc = '';
        m.ControlDesc = '';
        m.AuditObj = '';
        refresh();
        ui.messageBox.success('Subprocess Added');
      })
      .catch(() => ui.messageBox.error('Internal Server error'));
  };

  // -------------------------------------------------------------------------------------------
  // onPressSave — dialog "Save" and page "Alter Status"
  // -------------------------------------------------------------------------------------------
  const onPressSave = () => {
    const oModel = m.AuditModel;
    const oinProcess2Mul = m.inProcess2Mul;
    const selectedId = m.Action.MailId;
    const selectedStatus = m.Action.Status;
    const ObservationItemHeader = m.ObservationItemHeader;
    const ObservationItem = m.ObservationItem;
    const selectedStatus1 = m.Visible.SelectedKey;

    if (selectedStatus1 !== '') {
      // Bulk "Alter Status". The source fired this per-row expand read without waiting for it and
      // then posted the screen's leftover /InProcess2/ObservationItem (whichever row's dialog was
      // opened last) as OBSERVATION for EVERY selected row — overwriting their observations with
      // another row's. Here each row's own read is awaited and its own observations are re-posted
      // unchanged, same fix as the ARS observation screen (app/ars/observation/page.tsx).
      void ObservationItem;
      (async () => {
        let allOk = true;
        ui.busy(true);
        for (const oSelectedItem of oinProcess2Mul) {
          let observation: Row[];
          try {
            const { results } = await read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', {
              filters: [
                F('SubLglEntL1', 'EQ', oSelectedItem.SubLglEntL1),
                F('SubLglEntL2', 'EQ', oSelectedItem.SubLglEntL2),
                F('Process', 'EQ', oSelectedItem.Process),
                F('SubProcess', 'EQ', oSelectedItem.SubProcess),
                F('Gjahr', 'EQ', oSelectedItem.Gjahr),
                F('Scheduling', 'EQ', oSelectedItem.Scheduling),
                F('Period', 'EQ', oSelectedItem.Period),
              ],
              urlParameters: { $expand: 'OBSERVATION/EmailTable' },
            });
            observation = (results[0]?.OBSERVATION?.results || []).map(observationPassthrough);
          } catch {
            allOk = false;
            ui.messageBox.error('Internal Server error');
            continue;
          }
          const payloadObserVationItem = {
            ControlNumber: oSelectedItem.ControlNumber,
            Gjahr: oSelectedItem.Gjahr,
            LglEnt: oSelectedItem.LglEnt,
            SubLglEntL1: oSelectedItem.SubLglEntL1,
            SubLglEntL2: oSelectedItem.SubLglEntL2,
            BpGud: oSelectedItem.BpGud,
            Process: oSelectedItem.Process,
            SubProcess: oSelectedItem.SubProcess,
            RiskDesc: oSelectedItem.RiskDesc,
            ControlDesc: oSelectedItem.ControlDesc,
            AuditObj: oSelectedItem.AuditObj,
            AuditSteps: oSelectedItem.AuditSteps,
            Rating: oSelectedItem.Rating,
            ProcessWalkthrough: oSelectedItem.ProcessWalkthrough,
            ActualWorkDone: oSelectedItem.ActualWorkDone,
            Population: oSelectedItem.Population,
            Sample: oSelectedItem.Sample,
            Remarks: oSelectedItem.Remarks,
            Resonfordelay: oSelectedItem.Resonfordelay,
            Action: 'M',
            EmailId: selectedId,
            MailText: oSelectedItem.MailText,
            Status: selectedStatus1,
            Scheduling: oSelectedItem.Scheduling,
            Period: oSelectedItem.Period,
            PerformerU: oSelectedItem.PerformerU,
            ReviewerU: oSelectedItem.ReviewerU,
            UserType: oSelectedItem.UserType,
            OBSERVATION: observation,
          };
          try {
            await create('/ZSTR_MSD_PROCESS_AUDITSet', payloadObserVationItem);
          } catch {
            allOk = false;
            ui.messageBox.error('Internal Server error');
          }
        }
        ui.busy(false);
        m.Visible.SelectedKey = '';
        if (allOk) {
          setSelectedRows(new Set());
          m.Visible.slectAction = false;
          m.Visible.Action = false;
          ui.messageBox.success('Data Saved');
          closeActionDialog();
        }
        refresh();
      })();
    }

    if (selectedStatus1 === '') {
      if (savingRef.current) return;
      const aSourceObs = m.ObservationItem || [];
      const bMissing = aSourceObs.some((o) => !o.BusinessImplication || !o.RootCause || !o.Recommendation);
      if (bMissing) {
        ui.messageBox.error('Kindly enter required fields.');
        return;
      }
      // No row has been opened yet (source would throw reading AuditModel.oData) — nothing to save.
      if (!oModel) return;
      const aPayloadObs = aSourceObs.map((o) => {
        const c: Row = { ...o };
        PAYLOAD_FLAG_FIELDS.forEach((f) => {
          c[f] = toX(c[f]);
        });
        delete c.SendToAuditee; // UI-only field
        c.EmailTable = (o.EmailTable || []).map((e: Row) => {
          const ce: Row = { ...e };
          if (o.Lineitem) ce.Lineitem = o.Lineitem;
          ce.PersonResMail = toX(e.PersonResMail);
          ce.OwnerMail = toX(e.OwnerMail);
          return ce;
        });
        return c;
      });
      const payloadObserVationItem = {
        ControlNumber: oModel.ControlNumber,
        Gjahr: oModel.Gjahr,
        LglEnt: oModel.LglEnt,
        SubLglEntL1: oModel.SubLglEntL1,
        SubLglEntL2: oModel.SubLglEntL2,
        BpGud: oModel.BpGud,
        Process: oModel.Process,
        SubProcess: oModel.SubProcess,
        RiskDesc: oModel.RiskDesc,
        ControlDesc: oModel.ControlDesc,
        AuditObj: oModel.AuditObj,
        AuditSteps: oModel.AuditSteps,
        Rating: oModel.Rating,
        ProcessWalkthrough: oModel.ProcessWalkthrough,
        ActualWorkDone: oModel.ActualWorkDone,
        Population: oModel.Population,
        Sample: oModel.Sample,
        Remarks: oModel.Remarks,
        Resonfordelay: oModel.Resonfordelay,
        Action: 'M',
        EmailId: selectedId,
        MailText: oModel.MailText,
        Status: selectedStatus,
        Scheduling: ObservationItemHeader.Scheduling,
        Period: ObservationItemHeader.Period,
        PerformerU: oModel.PerformerU,
        ReviewerU: oModel.ReviewerU,
        UserType: oModel.UserType,
        OBSERVATION: aPayloadObs,
      };
      savingRef.current = true;
      ui.busy(true);
      create('/ZSTR_MSD_PROCESS_AUDITSet', payloadObserVationItem)
        .then(() => {
          savingRef.current = false;
          ui.busy(false);
          ui.messageBox.success('Data Saved');
          closeActionDialog();
        })
        .catch((err) => {
          savingRef.current = false;
          ui.busy(false);
          ui.messageBox.error(sapErrorMessage(err, 'Internal Server error'));
        });
    }
  };

  // -------------------------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------------------------
  const handleValueChange = async (file: File | undefined) => {
    if (!file) {
      setFileChosen('');
      return;
    }
    setFileChosen(file.name);
    const picked = await readFileAsBase64(file);
    m.Attachment.FileName = picked.name;
    m.Attachment.FileType = picked.type;
    m.Attachment.Content = picked.content;
  };

  const handleUploadPress = () => {
    if (fileChosen === '') {
      ui.toast('Please Choose any File');
      return;
    }
    const d = m.AuditModel;
    if (!d) return;
    const postObj = {
      ControlNumber: d.ControlNumber,
      Gjahr: d.Gjahr,
      SubLglEntL1: d.SubLglEntL1,
      SubLglEntL2: d.SubLglEntL2,
      Process: d.Process,
      Scheduling: d.Scheduling,
      Period: d.Period,
      SubProcess: d.SubProcess,
      Filename: m.Attachment.FileName,
      Value: btoa(m.Attachment.Content),
      Mimetype: m.Attachment.FileType,
      Annexture: annexure ? 'X' : '',
    };
    create('/ObservationAttachementSet', postObj)
      .then(() => {
        setFileChosen('');
        setFileInputKey((k) => k + 1);
        ui.messageBox.success('Attachment Posted');
        getAttachment(d);
      })
      .catch(() => ui.messageBox.error('Internal Server error'));
  };

  const onPressAttachLineItem = (row: Row) => {
    if (!downloadAttachment(row)) ui.messageBox.error('Unable to open this attachment.');
  };

  const onPressDeleteAttach = (selectedAttach: Row) => {
    const postObj = {
      ControlNumber: selectedAttach.ControlNumber,
      Gjahr: selectedAttach.Gjahr,
      SubLglEntL1: selectedAttach.SubLglEntL1,
      SubLglEntL2: selectedAttach.SubLglEntL2,
      Process: selectedAttach.Process,
      Scheduling: selectedAttach.Scheduling,
      Period: selectedAttach.Period,
      SubProcess: selectedAttach.SubProcess,
      Filename: selectedAttach.Filename,
      Value: '',
      Mimetype: '',
      Annexture: '',
      Action: 'D',
    };
    create('/ObservationAttachementSet', postObj)
      .then(() => {
        m.Attachment.Data = m.Attachment.Data.filter((a) => a.Filename != selectedAttach.Filename);
        refresh();
        ui.messageBox.success('Attachment Deleted Successfully');
      })
      .catch(() => ui.messageBox.error('Internal Server error'));
  };

  // -------------------------------------------------------------------------------------------
  // Observation items (Observation Details tab)
  // -------------------------------------------------------------------------------------------
  const onAddNewObervation = () => {
    const Item = m.ObservationItem;
    const length = Item.length;
    const ItemNumber = length > 0 ? (Number(Item[length - 1].Lineitem) + 1).toString() : '1';
    Item.push({
      ObsrvnGuid: '',
      Lineitem: ItemNumber,
      FinancialYear: '',
      ObservationTitle: '',
      Observation: '',
      ObservationReportMis: true,
      BusinessImplication: '',
      RootCause: '',
      FinancialImpact: '',
      Recommendation: '',
      ManagementResponse: '',
      Timeline: null,
      DirectClose: '',
      Score: '',
      PersonResponsible: '',
      PersonResUname: '',
      OwnerName: '',
      OwnerUname: '',
      GrossRisk: '',
      ResidualRisk: '',
    });
    refresh();
  };

  const onPressDeleteObservation = (clicked: Row) => {
    m.ObservationItem = m.ObservationItem.filter((item) => item.Lineitem != clicked.Lineitem);
    refresh();
  };

  const selectObservation = (clicked: Row) => {
    m.ObservationDetail = clicked;
    for (const item of m.ObservationItem) {
      if (item.Lineitem == clicked.Lineitem) m.PersonAndOwnerTableData = item.EmailTable;
    }
    refresh();
  };

  const onPressDisplayObservation = (clicked: Row) => {
    selectObservation(clicked);
    setDisplayOpen(true);
  };

  const onPressEditObservation = (clicked: Row) => {
    selectObservation(clicked);
    if (clicked.DirectClose) setDisplayOpen(true);
    else setEditOpen(true);
  };

  const onCloseObservationEditSave = () => {
    const oSelected = m.ObservationDetail;
    if (!oSelected) return;
    if (!oSelected.BusinessImplication || !oSelected.RootCause || !oSelected.Recommendation) {
      ui.messageBox.error('Kindly enter required fields.');
      return;
    }
    const EmailTable = m.PersonAndOwnerTableData;
    for (let i = 0; i < m.ObservationItem.length; i++) {
      if (m.ObservationItem[i].Lineitem == oSelected.Lineitem) {
        m.ObservationItem[i] = oSelected;
        if (EmailTable) m.ObservationItem[i].EmailTable = [...EmailTable];
      }
    }
    refresh();
    setEditOpen(false);
  };

  const onAddPersonAndOwner = () => {
    const Item = m.PersonAndOwnerTableData || [];
    const length = Item.length;
    const ItemNumber = length > 0 ? (Number(Item[length - 1].OwLineitem) + 1).toString() : '1';
    Item.push({
      Lineitem: '',
      OwLineitem: ItemNumber,
      PersonResponsible: '',
      PersonResUname: '',
      PersonResMail: false,
      PersonResComment: '',
      OwnerName: '',
      OwnerUname: '',
      OwnerMail: false,
      OwnerComment: '',
    });
    m.PersonAndOwnerTableData = Item;
    refresh();
  };

  const onDeletePersonAndOwner = (clicked: Row) => {
    m.PersonAndOwnerTableData = (m.PersonAndOwnerTableData || []).filter((item) => item.OwLineitem != clicked.OwLineitem);
    refresh();
  };

  const onPickUser = (kind: 'Per' | 'Owner', gridRow: Row, user: Row) => {
    m.PersonAndOwnerTableSelectedPath = gridRow;
    const User = `${user.Fname ?? ''} ${user.Lname ?? ''}`;
    const uname = String(user.Uname ?? '');
    const Selected = m.PersonAndOwnerTableSelectedPath;
    for (const d of m.PersonAndOwnerTableData || []) {
      if (d.OwLineitem == Selected.OwLineitem) {
        if (kind === 'Per') {
          d.PersonResponsible = User;
          d.PersonResUname = uname;
        } else {
          d.OwnerName = User;
          d.OwnerUname = uname;
        }
      }
    }
    refresh();
  };

  // -------------------------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------------------------
  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Process', header: 'Process' },
    { key: 'SubProcess', header: 'Sub Process' },
    { key: 'AuditSteps', header: 'Audit Steps', className: 'whitespace-pre-wrap' },
    { key: 'Status', header: 'Status' },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="View"
          onClick={(e) => {
            e.stopPropagation();
            handleInProgressNextScreenPress1(r);
          }}
          className="rounded-md p-1 text-rust hover:bg-glassRust"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  const audit = m.AuditModel || {};
  const editable = m.Editable;
  const setAudit = (key: string, value: string) => {
    if (!m.AuditModel) return;
    m.AuditModel[key] = value;
    refresh();
  };

  const observationColumns: Column<Row>[] = [
    { key: 'Lineitem', header: 'Observation No' },
    {
      key: 'display',
      header: 'Display',
      render: (r) => (
        <button type="button" aria-label="Display" className="rounded-md p-1 text-rust hover:bg-glassRust" onClick={() => onPressDisplayObservation(r)}>
          <FileText size={15} />
        </button>
      ),
    },
    {
      key: 'edit',
      header: 'Edit',
      render: (r) => (
        <button
          type="button"
          aria-label="Edit"
          disabled={!editable}
          className="rounded-md p-1 text-rust hover:bg-glassRust disabled:opacity-40"
          onClick={() => onPressEditObservation(r)}
        >
          <PencilLine size={15} />
        </button>
      ),
    },
    {
      key: 'delete',
      header: 'Delete',
      render: (r) => (
        <button
          type="button"
          aria-label="Delete"
          disabled={!editable}
          className="rounded-md p-1 text-red hover:bg-redBg disabled:opacity-40"
          onClick={() => onPressDeleteObservation(r)}
        >
          <Trash2 size={15} />
        </button>
      ),
    },
    {
      key: 'SendToAuditee',
      header: 'Sent to auditee',
      render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.SendToAuditee} disabled readOnly />,
    },
    {
      key: 'Dropped',
      header: 'Dropped',
      render: (r) => (
        <input
          type="checkbox"
          className="h-4 w-4 accent-rust"
          checked={!!r.Dropped}
          disabled={!editable}
          onChange={(e) => {
            r.Dropped = e.target.checked;
            refresh();
          }}
        />
      ),
    },
  ];

  const attachmentColumns: Column<Row>[] = [
    {
      key: 'Filename',
      header: 'Supporting Files',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 font-semibold text-rust">
          <Download size={13} />
          {String(r.Filename ?? '')}
        </span>
      ),
    },
    {
      key: 'Annexture',
      header: 'Annexures',
      render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.Annexture} disabled readOnly />,
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="Delete attachment"
          disabled={!editable}
          className="rounded-md p-1 text-red hover:bg-redBg disabled:opacity-40"
          onClick={(e) => {
            e.stopPropagation();
            onPressDeleteAttach(r);
          }}
        >
          <Trash2 size={15} />
        </button>
      ),
    },
  ];

  const statusField = (
    <>
      {m.Action.StatusReviewerVisible && (
        <Field label="Status" className="max-w-xs">
          <Select
            value={shownKey(m.Action.Status, REVIEWER_STATUS_OPTIONS)}
            onChange={(v) => {
              m.Action.Status = v;
              refresh();
            }}
            options={REVIEWER_STATUS_OPTIONS}
          />
        </Field>
      )}
      {m.Action.StatusPerformerVisible && (
        <Field label="Status" className="max-w-xs">
          <Select
            value={shownKey(m.Action.Status, PERFORMER_STATUS_OPTIONS)}
            disabled={!editable}
            onChange={(v) => {
              m.Action.Status = v;
              refresh();
            }}
            options={PERFORMER_STATUS_OPTIONS}
          />
        </Field>
      )}
    </>
  );

  return (
    <Page title="MIS - Subprocess" onBack={() => navTo('MISinprocessSmry')} actions={<HeaderClock />}>
      <Card>
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-48">
            <Select
              value={le}
              onChange={(v) => {
                setLe(v);
                handleCommonFilterFunction(v, se1, SE2_KEY);
              }}
              options={m.legalEntities.map((r) => ({ key: String(r.LglEnt ?? ''), text: String(r.LglEnt ?? '') }))}
            />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-48">
            <Select
              value={se1}
              onChange={handleChangeSubEntity1}
              options={m.subEntity1.map((r) => ({ key: String(r.SubLglEntL1 ?? ''), text: String(r.SubLglEntL1 ?? '') }))}
              placeholder=""
            />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-48">
            <Select
              value={se2Index}
              onChange={(v) => {
                setSe2Index(v);
                // handleChangeSubEntity2 -> handleCommonFilterFunction with the picked SubLglEntL2
                const picked = v === '' ? '' : String(se2Items[Number(v)]?.SubLglEntL2 ?? '');
                handleCommonFilterFunction(le, se1, picked);
              }}
              options={se2Items.map((r, i) => ({ key: String(i), text: String(r.SubLglEntL2 ?? '') }))}
              placeholder=""
            />
          </Field>
          <button type="button" className="btn-primary" onClick={() => navTo('MISinprocessSmry')}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={() => setAddSubOpen(true)} aria-label="Add sub process">
            <Plus size={15} />
          </button>
          {m.Visible.slectAction && (
            <Field label="Status" className="w-full sm:w-48">
              <Select
                value={m.Visible.SelectedKey}
                onChange={(v) => {
                  m.Visible.SelectedKey = v;
                  refresh();
                }}
                options={BULK_STATUS_OPTIONS}
                placeholder=""
              />
            </Field>
          )}
          {m.Visible.Action && (
            <button type="button" className="btn-primary" onClick={onPressSave}>
              Alter Status
            </button>
          )}
        </Toolbar>
      </Card>

      <DataTable
        columns={columns}
        rows={visibleRows}
        selectionMode="MultiSelect"
        selected={selectedIdx}
        onSelectionChange={onSelectionChange}
        growingThreshold={10}
        maxHeight="60vh"
      />

      {/* addSubProcess.fragment.xml */}
      <Dialog
        open={addSubOpen}
        title="Create SubProcess"
        onClose={() => setAddSubOpen(false)}
        width="max-w-4xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={onPressConfirmSubprocess}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAddSubOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {(
            [
              ['SubProcess', 'Sub Process', 100, 2],
              ['AuditSteps', 'Audit Steps', 3000, 5],
              ['ControlDesc', 'Control Description', 3000, 5],
              ['RiskDesc', 'Risk Description', 3000, 5],
              ['AuditObj', 'Audit Objective', 3000, 5],
            ] as const
          ).map(([key, label, max, rows]) => (
            <Field key={key} label={label} required>
              <TextArea
                rows={rows}
                maxLength={max}
                value={m[key]}
                onChange={(e) => {
                  m[key] = e.target.value;
                  refresh();
                }}
              />
            </Field>
          ))}
        </div>
      </Dialog>

      {/* MISinProcess2Action.fragment.xml */}
      <Dialog
        open={actionOpen}
        title="Observation Details"
        onClose={closeActionDialog}
        width="max-w-6xl"
        footer={
          <>
            {editable && (
              <button type="button" className="btn-primary" onClick={onPressSave}>
                Save
              </button>
            )}
            <button type="button" className="btn-danger" onClick={closeActionDialog}>
              Cancel
            </button>
          </>
        }
      >
        <Tabs
          value={actionTab}
          onChange={setActionTab}
          tabs={[
            { key: 'steps', text: 'Audit-Steps' },
            { key: 'work', text: 'Actual Testing / Work Done' },
            { key: 'obs', text: 'Observation Details' },
            { key: 'attach', text: 'Attach Observation' },
            { key: 'files', text: 'Attachement Details' },
            { key: 'action', text: 'Action' },
          ]}
        />
        <div className="pt-3">
          {actionTab === 'steps' && (
            <Field label="AuditSteps">
              <TextArea rows={7} value={String(audit.AuditSteps ?? '')} readOnly />
            </Field>
          )}

          {actionTab === 'work' && (
            <div className="space-y-3">
              {(
                [
                  ['ProcessWalkthrough', 'Process Walkthrough', false, 3],
                  ['ActualWorkDone', 'Actual Work Done', false, 3],
                  ['Population', 'Population', true, 2],
                  ['Sample', 'Sample', true, 2],
                  ['Remarks', 'Remarks', false, 3],
                  ['Resonfordelay', 'Reason of Delay', false, 3],
                ] as const
              ).map(([key, label, required, rows]) => (
                <Field key={key} label={label} required={required}>
                  <TextArea rows={rows} value={String(audit[key] ?? '')} readOnly={!editable} onChange={(e) => setAudit(key, e.target.value)} />
                </Field>
              ))}
            </div>
          )}

          {actionTab === 'obs' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button type="button" className="btn-primary !px-2.5 !py-1" disabled={!editable} onClick={onAddNewObervation} aria-label="Add observation">
                  <Plus size={14} />
                </button>
              </div>
              <DataTable columns={observationColumns} rows={m.ObservationItem} />
            </div>
          )}

          {actionTab === 'attach' && (
            <div className="space-y-3">
              <Field label="Attachment">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    key={fileInputKey}
                    type="file"
                    disabled={!editable}
                    className="text-[12.5px] file:mr-2 file:rounded-lg file:border file:border-border file:bg-white file:px-2.5 file:py-1.5 file:text-[12px] file:font-semibold"
                    onChange={(e) => handleValueChange(e.target.files?.[0])}
                  />
                  <button type="button" className="btn-ghost" disabled={!editable} onClick={handleUploadPress}>
                    Upload File
                  </button>
                </div>
              </Field>
              <Field label="Annexures">
                <Checkbox checked={annexure} onChange={setAnnexure} />
              </Field>
            </div>
          )}

          {actionTab === 'files' && <DataTable columns={attachmentColumns} rows={m.Attachment.Data} onRowPress={onPressAttachLineItem} />}

          {actionTab === 'action' && <div className="space-y-3">{statusField}</div>}
        </div>
      </Dialog>

      <ObservationDisplayDialog
        open={displayOpen}
        detail={m.ObservationDetail}
        emailTable={m.PersonAndOwnerTableData}
        onClose={() => setDisplayOpen(false)}
      />
      <ObservationEditDialog
        open={editOpen}
        detail={m.ObservationDetail}
        emailTable={m.PersonAndOwnerTableData}
        users={users}
        onChange={refresh}
        onAddPersonAndOwner={onAddPersonAndOwner}
        onDeletePersonAndOwner={onDeletePersonAndOwner}
        onPickUser={onPickUser}
        onSave={onCloseObservationEditSave}
        onClose={() => setEditOpen(false)}
      />
    </Page>
  );
}
