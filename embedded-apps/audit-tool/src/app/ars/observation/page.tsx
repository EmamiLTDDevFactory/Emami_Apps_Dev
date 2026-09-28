'use client';

// In Process (observation workflow) — port of the Fiori inProcess2Screen view/controller.
// Lists the sub-processes of the process picked upstream (ZSTR_MSD_PROCESS_AUDITSet with the
// inProcessParameters set by Process Summary / Pending / Draft Report / MIS), opens the
// Observation Details dialog per sub-process (deep read with $expand OBSERVATION/EmailTable, deep
// insert on Save), manages observation attachments (ObservationAttachementSet), adds a new
// sub-process (Action 'N'), and bulk-alters status for several selected rows.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useUi } from '../../../context/UiContext';
import { And, F, applyFilters, create, read, type Filter } from '../../../lib/odata';
import { downloadAttachment, readFileAsBase64 } from '../../../lib/files';
import { useNavTo } from '../../../lib/routes';
import { Card, DataTable, Dialog, Field, Page, Select, TextArea, Toolbar, uniqueBy, type Column } from '../../../components/ui';
import ObservationActionDialog from '../../../components/inprocess/ObservationActionDialog';
import { observationFromSap, observationPassthrough, observationToSap, type Row } from '../../../components/inprocess/observation';

const BULK_STATUS_OPTIONS = [
  { key: 'Send Back to Performer', text: 'Send Back to Performer' },
  { key: 'Send To Auditee', text: 'Send To Auditee' },
  { key: 'Close', text: 'Close' },
];

/** getObservationItem / onPressSave's filter list for one sub-process row. */
function processAuditFilters(r: Row): Filter[] {
  return [
    F('SubLglEntL1', 'EQ', r.SubLglEntL1),
    F('SubLglEntL2', 'EQ', r.SubLglEntL2),
    F('Process', 'EQ', r.Process),
    F('SubProcess', 'EQ', r.SubProcess),
    F('Gjahr', 'EQ', r.Gjahr),
    F('Scheduling', 'EQ', r.Scheduling),
    F('Period', 'EQ', r.Period),
    F('Action', 'EQ', 'T'),
  ];
}

export default function InProcessObservationPage() {
  const { getParams, setParams } = useApp();
  const ui = useUi();
  const navTo = useNavTo();
  const loaded = useRef(false);

  // inProcess2ScreenModel + its filter models
  const [rows, setRows] = useState<Row[]>([]);
  const [legal, setLegal] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [tableFilter, setTableFilter] = useState<Filter[] | Filter | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // auditJsonModel>/Visible/SelectedKey
  const [bulkStatus, setBulkStatus] = useState('');

  // auditJsonModel>/InProcess2/User (audit managers; feeds the hidden Mail Id select)
  const [, setManagers] = useState<Row[]>([]);
  // userJsonModel
  const [userList, setUserList] = useState<Row[]>([]);

  // Observation Details dialog (AuditModel + auditJsonModel paths)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [auditModel, setAuditModel] = useState<Row>({});
  const [header, setHeader] = useState<Row>({}); // /InProcess2/ObservationItemHeader
  const [items, setItems] = useState<Row[]>([]); // /InProcess2/ObservationItem
  const [editable, setEditable] = useState(true); // /ObservationDetail/Editable
  const [mailId, setMailId] = useState(''); // /Action/MailId (its select is hidden in the source)
  const [actionStatus, setActionStatus] = useState(''); // /Action/Status
  const [reviewerVisible, setReviewerVisible] = useState(false);
  const [performerVisible, setPerformerVisible] = useState(false);
  const [attachments, setAttachments] = useState<Row[]>([]); // /ObservationAttachement/Data

  // Create SubProcess dialog (/InProcess2/SubProcess, AuditSteps, ControlDesc, RiskDesc, AuditObj)
  const [subOpen, setSubOpen] = useState(false);
  const [sub, setSub] = useState({ SubProcess: '', AuditSteps: '', ControlDesc: '', RiskDesc: '', AuditObj: '' });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const model = getParams<Row>('inProcessParameters');
    const filters = And([
      F('SubLglEntL1', 'EQ', model.SubLglEntL1),
      F('SubLglEntL2', 'EQ', model.SubLglEntL2),
      F('Process', 'EQ', model.Process),
      F('SubProcess', 'EQ', ''),
      F('Gjahr', 'EQ', model.Gjahr),
      F('Scheduling', 'EQ', model.Scheduling),
      F('Period', 'EQ', model.Period),
      F('Action', 'EQ', model.Action),
      F('Status', 'EQ', model.Status),
    ]);
    read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', { filters: [filters] })
      .then(({ results }) => {
        const list: Row[] = results.map((r, i) => ({ ...r, slNo: i + 1 }));
        setRows(list);
        const le = uniqueBy(list, 'LglEnt');
        if (le.length > 0) setLegal(String(le[0].LglEnt ?? '')); // forceSelection="true"
      })
      .catch(() => {
        /* the Fiori error handler is empty */
      });

    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => setManagers(results.filter((u) => u.IsAuditManager === 'X')))
      .catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legalOptions = useMemo(() => uniqueBy(rows, 'LglEnt').map((r) => ({ key: String(r.LglEnt ?? ''), text: String(r.LglEnt ?? '') })), [rows]);
  const se1Options = useMemo(
    () => uniqueBy(rows, 'SubLglEntL1').map((r) => ({ key: String(r.SubLglEntL1 ?? ''), text: String(r.SubLglEntL1 ?? '') })),
    [rows],
  );
  // handleChangeSubEntity1 filters Sub Entity 2's items by the chosen Sub Entity 1.
  const se2Options = useMemo(() => {
    const unique = uniqueBy(rows, 'SubLglEntL2');
    const scoped = se1 ? applyFilters(unique, [F('SubLglEntL1', 'EQ', se1)]) : unique;
    return scoped.map((r) => ({ key: String(r.SubLglEntL2 ?? ''), text: String(r.SubLglEntL2 ?? '') }));
  }, [rows, se1]);

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);
  const selectedRows = useMemo(() => visibleRows.filter((_, i) => selected.has(i)), [visibleRows, selected]); // /inProcess2Mul
  const multi = selectedRows.length > 1; // /Visible/slectAction and /Visible/Action

  const handleCommonFilterFunction = (l: string, s1: string, s2: string) => {
    const arr: Filter[] = [];
    if (l !== 'Legal Entity' && l !== '') arr.push(F('LglEnt', 'EQ', l));
    if (s1 !== 'Sub Entity 1' && s1 !== '') arr.push(F('SubLglEntL1', 'EQ', s1));
    if (s2 !== 'Process' && s2 !== '') arr.push(F('SubLglEntL2', 'EQ', s2));
    setTableFilter(arr.length === 0 ? [] : arr.length === 1 ? arr : And(arr));
    setSelected(new Set());
  };

  // ---------------------------------------------------------------------------------------------
  // Observation Details dialog
  // ---------------------------------------------------------------------------------------------

  const getAttachment = useCallback(
    async (d: Row) => {
      const filters = And([
        F('ControlNumber', 'EQ', d.ControlNumber),
        F('Gjahr', 'EQ', d.Gjahr),
        F('SubLglEntL1', 'EQ', d.SubLglEntL1),
        F('SubLglEntL2', 'EQ', d.SubLglEntL2),
        F('Process', 'EQ', d.Process),
        F('Scheduling', 'EQ', d.Scheduling),
        F('Period', 'EQ', d.Period),
        F('SubProcess', 'EQ', d.SubProcess),
      ]);
      try {
        const { results } = await read<Row>('/ObservationAttachementSet', { filters: [filters] });
        setAttachments(results.map((r) => ({ ...r, Annexture: r.Annexture === 'X' })));
      } catch {
        ui.messageBox.error('Internal Server error');
      }
    },
    [ui],
  );

  const getObservationItem = async (d: Row) => {
    try {
      const { results } = await read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', {
        filters: processAuditFilters(d),
        urlParameters: { $expand: 'OBSERVATION/EmailTable' },
      });
      const data = results[0];
      if (!data) {
        // The source throws on results[0].OBSERVATION here and leaves the busy indicator up.
        ui.busy(false);
        return;
      }
      const obs: Row[] = (data.OBSERVATION?.results || []).map(observationFromSap);
      setHeader(data);
      setItems(obs);

      setReviewerVisible(data.UserType === 'R');
      setPerformerVisible(data.UserType === 'P');
      if (data.Status) setActionStatus(data.Status);

      const s = data.Status;
      if (data.UserType === 'P' && (s === 'Send Back to Performer' || s === '')) setEditable(true);
      else if (data.UserType === 'R' && (s === 'Send to Reviewer' || s === 'Send Back to Performer' || s === 'Management Responded' || s === '')) setEditable(true);
      else setEditable(false);

      ui.busy(false);
      setDialogOpen(true);
    } catch {
      ui.busy(false);
      ui.messageBox.error('Internal Server error');
    }
  };

  const handleInProgressNextScreenPress1 = (row: Row) => {
    ui.busy(true);
    setAuditModel({ ...row });
    setMailId('');
    setActionStatus('');
    setEditable(true);

    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => {
        setUserList(results);
        setParams('userJsonModel', results);
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    getAttachment(row);
    getObservationItem(row);
  };

  const closeDialog = () => setDialogOpen(false);

  /** onPressSave from the dialog (Visible/SelectedKey is "" — single sub-process save). */
  const saveSingle = async () => {
    if (!auditModel.Population || !auditModel.Sample) {
      ui.messageBox.error('Kindly enter mandatory fields.');
      return;
    }
    const observation: Row[] = [];
    for (const item of items) {
      const converted = observationToSap(item);
      if (!converted) {
        ui.messageBox.error('Kindly enter required fields.');
        return;
      }
      observation.push(converted);
    }
    const payload = {
      ControlNumber: auditModel.ControlNumber,
      Gjahr: auditModel.Gjahr,
      LglEnt: auditModel.LglEnt,
      SubLglEntL1: auditModel.SubLglEntL1,
      SubLglEntL2: auditModel.SubLglEntL2,
      BpGud: auditModel.BpGud,
      Process: auditModel.Process,
      SubProcess: auditModel.SubProcess,
      RiskDesc: auditModel.RiskDesc,
      ControlDesc: auditModel.ControlDesc,
      AuditObj: auditModel.AuditObj,
      AuditSteps: auditModel.AuditSteps,
      Rating: auditModel.Rating,
      ProcessWalkthrough: auditModel.ProcessWalkthrough,
      ActualWorkDone: auditModel.ActualWorkDone,
      Population: auditModel.Population,
      Sample: auditModel.Sample,
      Remarks: auditModel.Remarks,
      Resonfordelay: auditModel.Resonfordelay,
      Action: 'T',
      EmailId: mailId,
      MailText: auditModel.MailText,
      Status: actionStatus,
      Scheduling: header.Scheduling,
      Period: header.Period,
      PerformerU: auditModel.PerformerU,
      ReviewerU: auditModel.ReviewerU,
      UserType: auditModel.UserType,
      OBSERVATION: observation,
    };
    ui.busy(true);
    try {
      await create('/ZSTR_MSD_PROCESS_AUDITSet', payload);
      ui.busy(false);
      ui.messageBox.success('Data Saved');
      closeDialog();
    } catch {
      ui.busy(false);
      ui.messageBox.error('Internal Server error');
    }
  };

  /** "Alter Status" (onPressSave with Visible/SelectedKey set) — one deep insert per selected row. */
  const saveBulk = async () => {
    const status = bulkStatus;
    const targets = selectedRows;
    let allOk = true;
    ui.busy(true);
    for (const r of targets) {
      let observation: Row[];
      try {
        const { results } = await read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', {
          filters: processAuditFilters(r),
          urlParameters: { $expand: 'OBSERVATION/EmailTable' },
        });
        observation = (results[0]?.OBSERVATION?.results || []).map(observationPassthrough);
      } catch {
        allOk = false;
        ui.messageBox.error('Internal Server error');
        continue;
      }
      const payload = {
        ControlNumber: r.ControlNumber,
        Gjahr: r.Gjahr,
        LglEnt: r.LglEnt,
        SubLglEntL1: r.SubLglEntL1,
        SubLglEntL2: r.SubLglEntL2,
        BpGud: r.BpGud,
        Process: r.Process,
        SubProcess: r.SubProcess,
        RiskDesc: r.RiskDesc,
        ControlDesc: r.ControlDesc,
        AuditObj: r.AuditObj,
        AuditSteps: r.AuditSteps,
        Rating: r.Rating,
        ProcessWalkthrough: r.ProcessWalkthrough,
        ActualWorkDone: r.ActualWorkDone,
        Population: r.Population,
        Sample: r.Sample,
        Remarks: r.Remarks,
        Resonfordelay: r.Resonfordelay,
        Action: 'T',
        EmailId: mailId,
        MailText: r.MailText,
        Status: status,
        Scheduling: r.Scheduling,
        Period: r.Period,
        PerformerU: r.PerformerU,
        ReviewerU: r.ReviewerU,
        UserType: r.UserType,
        OBSERVATION: observation,
      };
      try {
        await create('/ZSTR_MSD_PROCESS_AUDITSet', payload);
      } catch {
        allOk = false;
        setBulkStatus('');
        ui.messageBox.error('Internal Server error');
      }
    }
    ui.busy(false);
    if (allOk) {
      setSelected(new Set());
      setBulkStatus('');
      ui.messageBox.success('Data Saved');
    }
  };

  const onPressSave = () => {
    if (bulkStatus !== '') saveBulk();
    else saveSingle();
  };

  // ---------------------------------------------------------------------------------------------
  // Attachments
  // ---------------------------------------------------------------------------------------------

  const handleUploadPress = async (file: File | null, annexure: boolean): Promise<boolean> => {
    if (!file) {
      ui.toast('Please Choose any File');
      return false;
    }
    const picked = await readFileAsBase64(file);
    const postObj = {
      ControlNumber: auditModel.ControlNumber,
      Gjahr: auditModel.Gjahr,
      SubLglEntL1: auditModel.SubLglEntL1,
      SubLglEntL2: auditModel.SubLglEntL2,
      Process: auditModel.Process,
      Scheduling: auditModel.Scheduling,
      Period: auditModel.Period,
      SubProcess: auditModel.SubProcess,
      Filename: picked.name,
      Value: btoa(picked.content),
      Mimetype: picked.type,
      Annexture: annexure ? 'X' : '',
    };
    try {
      await create('/ObservationAttachementSet', postObj);
      ui.messageBox.success('Attachment Posted');
      getAttachment(auditModel);
      return true;
    } catch {
      ui.messageBox.error('Internal Server error');
      return false;
    }
  };

  const onPressDeleteAttach = async (a: Row) => {
    const postObj = {
      ControlNumber: a.ControlNumber,
      Gjahr: a.Gjahr,
      SubLglEntL1: a.SubLglEntL1,
      SubLglEntL2: a.SubLglEntL2,
      Process: a.Process,
      Scheduling: a.Scheduling,
      Period: a.Period,
      SubProcess: a.SubProcess,
      Filename: a.Filename,
      Value: '',
      Mimetype: '',
      Annexture: '',
      Action: 'D',
    };
    try {
      await create('/ObservationAttachementSet', postObj);
      setAttachments((list) => list.filter((x) => x.Filename != a.Filename));
      ui.messageBox.success('Attachment Deleted Successfully');
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Create SubProcess
  // ---------------------------------------------------------------------------------------------

  const onPressConfirmSubprocess = async () => {
    const { SubProcess, AuditSteps, RiskDesc, ControlDesc, AuditObj } = sub;
    if (!SubProcess || !AuditSteps || !RiskDesc || !ControlDesc || !AuditObj) {
      ui.messageBox.error('Please provide required field');
      return;
    }
    setSubOpen(false);
    const first = rows[0];
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
    try {
      await create('/ZSTR_MSD_PROCESS_AUDITSet', postObj);
      setSub({ SubProcess: '', AuditSteps: '', ControlDesc: '', RiskDesc: '', AuditObj: '' });
      ui.messageBox.success('Subprocess Added');
    } catch {
      ui.messageBox.error('Internal Server error');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Process', header: 'Process' },
    { key: 'SubProcess', header: 'Sub Process' },
    { key: 'AuditSteps', header: 'Audit Steps', className: 'whitespace-pre-wrap' },
    { key: 'Status', header: 'Status' },
    {
      key: '__action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="Open observation"
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

  const subField = (key: keyof typeof sub, label: string, rows: number, maxLength: number) => (
    <Field label={label} required>
      <TextArea rows={rows} maxLength={maxLength} value={sub[key]} onChange={(e) => setSub((s) => ({ ...s, [key]: e.target.value }))} />
    </Field>
  );

  return (
    <Page title="In Process" onBack={() => navTo('inProcessSumry')}>
      <Card>
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-48">
            <Select
              value={legal}
              options={legalOptions}
              onChange={(v) => {
                setLegal(v);
                handleCommonFilterFunction(v, se1, se2);
              }}
            />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-48">
            <Select
              value={se1}
              options={se1Options}
              placeholder=""
              onChange={(v) => {
                setSe1(v);
                setSe2('');
                handleCommonFilterFunction(legal, v, '');
              }}
            />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-48">
            <Select
              value={se2}
              options={se2Options}
              placeholder=""
              onChange={(v) => {
                setSe2(v);
                handleCommonFilterFunction(legal, se1, v);
              }}
            />
          </Field>
          <button type="button" className="btn-primary" onClick={() => navTo('inProcessSumry')}>
            Back
          </button>
          <button type="button" className="btn-primary" aria-label="Add sub process" onClick={() => setSubOpen(true)}>
            <Plus size={15} />
          </button>
          {multi && (
            <>
              <Field label="Status" className="w-full sm:w-48">
                <Select value={bulkStatus} onChange={setBulkStatus} options={BULK_STATUS_OPTIONS} placeholder="" />
              </Field>
              <button type="button" className="btn-primary" onClick={onPressSave}>
                Alter Status
              </button>
            </>
          )}
        </Toolbar>
      </Card>

      <DataTable
        columns={columns}
        rows={visibleRows}
        selectionMode="MultiSelect"
        selected={selected}
        onSelectionChange={setSelected}
        growingThreshold={10}
        maxHeight="60vh"
      />

      <ObservationActionDialog
        open={dialogOpen}
        auditModel={auditModel}
        onAuditModelChange={(patch) => setAuditModel((m) => ({ ...m, ...patch }))}
        editable={editable}
        items={items}
        onItemsChange={setItems}
        attachments={attachments}
        onUpload={handleUploadPress}
        onDeleteAttachment={onPressDeleteAttach}
        onOpenAttachment={(a) => downloadAttachment(a)}
        actionStatus={actionStatus}
        onActionStatusChange={setActionStatus}
        statusReviewerVisible={reviewerVisible}
        statusPerformerVisible={performerVisible}
        userList={userList}
        onSave={onPressSave}
        onCancel={closeDialog}
        onRequiredFieldsMissing={() => ui.messageBox.error('Kindly enter required fields.')}
      />

      <Dialog
        open={subOpen}
        title="Create SubProcess"
        onClose={() => setSubOpen(false)}
        width="max-w-4xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={onPressConfirmSubprocess}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setSubOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          {subField('SubProcess', 'Sub Process', 2, 100)}
          {subField('AuditSteps', 'Audit Steps', 5, 3000)}
          {subField('ControlDesc', 'Control Description', 5, 3000)}
          {subField('RiskDesc', 'Risk Description', 5, 3000)}
          {subField('AuditObj', 'Audit Objective', 5, 3000)}
        </div>
      </Dialog>
    </Page>
  );
}
