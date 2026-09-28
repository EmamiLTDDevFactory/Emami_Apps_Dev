'use client';

// Port of the Fiori inProcess2Action fragment ("Observation Details" dialog with the Audit-Steps /
// Actual Testing / Observation Details / Attach Observation / Attachement Details / Action tabs),
// plus the observationDialogDisplay, observationDialogEdit and UserListDialogPer/Owner fragments it
// opens. State lives in the owning page (inProcess2Screen's AuditModel + auditJsonModel paths);
// this component only renders it and reports edits back.
import { useEffect, useRef, useState } from 'react';
import { Eye, Pencil, Trash2, Plus, Upload } from 'lucide-react';
import {
  Checkbox,
  DataTable,
  DateInput,
  Dialog,
  Field,
  Input,
  Select,
  SelectDialog,
  Tabs,
  TextArea,
  formatDateDisplay,
  type Column,
} from '../ui';
import { newObservation, newPersonOwner, type Row } from './observation';

const TABS = [
  { key: 'steps', text: 'Audit-Steps' },
  { key: 'work', text: 'Actual Testing / Work Done' },
  { key: 'obs', text: 'Observation Details' },
  { key: 'attach', text: 'Attach Observation' },
  { key: 'attachList', text: 'Attachement Details' },
  { key: 'action', text: 'Action' },
];

const RISK_OPTIONS = [
  { key: 'High', text: 'High' },
  { key: 'Medium', text: 'Medium' },
  { key: 'Low', text: 'Low' },
];

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-green' : 'bg-red'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function ReadOnlyText({ value }: { value: unknown }) {
  return (
    <div className="min-h-[2.2rem] whitespace-pre-wrap rounded-lg border border-border bg-appBg px-2.5 py-1.5 text-[13px] text-ink">
      {value === null || value === undefined ? '' : String(value)}
    </div>
  );
}

export interface ObservationActionDialogProps {
  open: boolean;
  auditModel: Row;
  onAuditModelChange: (patch: Row) => void;
  editable: boolean;
  items: Row[];
  onItemsChange: (items: Row[]) => void;
  attachments: Row[];
  onUpload: (file: File | null, annexure: boolean) => Promise<boolean>;
  onDeleteAttachment: (row: Row) => void;
  onOpenAttachment: (row: Row) => void;
  actionStatus: string;
  onActionStatusChange: (v: string) => void;
  statusReviewerVisible: boolean;
  statusPerformerVisible: boolean;
  /** userJsonModel — every ZUSER_MASTERSet row, for the Person/Owner value help. */
  userList: Row[];
  onSave: () => void;
  onCancel: () => void;
  onRequiredFieldsMissing: () => void;
}

export default function ObservationActionDialog(props: ObservationActionDialogProps) {
  const { open, auditModel, onAuditModelChange, editable, items, onItemsChange } = props;
  const [tab, setTab] = useState('steps');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [annexure, setAnnexure] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Observation display / edit (observationDialogDisplay / observationDialogEdit fragments).
  const [detailMode, setDetailMode] = useState<'display' | 'edit' | null>(null);
  const [detailLine, setDetailLine] = useState<string>('');
  // /InProcess2/PersonAndOwnerTableData
  const [personOwner, setPersonOwner] = useState<Row[] | undefined>(undefined);
  const [userDialog, setUserDialog] = useState<{ kind: 'Per' | 'Owner'; owLineitem: string } | null>(null);

  // The source fragment is destroyed on Save/Cancel, so every open starts fresh.
  useEffect(() => {
    if (open) {
      setTab('steps');
      setFile(null);
      setFileKey((k) => k + 1);
      setAnnexure(false);
      setDetailMode(null);
    }
  }, [open]);

  const detail = items.find((i) => i.Lineitem == detailLine) || null;

  // In the Fiori app ObservationDetail and PersonAndOwnerTableData are the SAME objects as the line
  // in ObservationItem (getProperty returns references), so edits apply to the line immediately —
  // Close keeps them; Save only validates, closes, and re-attaches the Person/Owner rows.
  const patchDetail = (patch: Row) => {
    onItemsChange(items.map((i) => (i.Lineitem == detailLine ? { ...i, ...patch } : i)));
  };

  const updatePersonOwner = (next: Row[]) => {
    setPersonOwner(next);
    // Only rows that already belonged to the line (a real EmailTable array) are shared by
    // reference in the source; a freshly created list is attached on Save.
    if (detail && Array.isArray(detail.EmailTable)) patchDetail({ EmailTable: next });
  };

  const openDetail = (line: Row, mode: 'display' | 'edit') => {
    setDetailLine(line.Lineitem);
    setPersonOwner(line.EmailTable);
    // onPressEditObservation: a DirectClose line opens display-only.
    setDetailMode(mode === 'edit' && line.DirectClose ? 'display' : mode);
  };

  const onAddNewObervation = () => {
    const last = items[items.length - 1];
    const itemNumber = items.length > 0 ? (Number(last.Lineitem) + 1).toString() : '1';
    onItemsChange([...items, newObservation(itemNumber)]);
  };

  const onPressDeleteObservation = (line: Row) => {
    onItemsChange(items.filter((i) => i.Lineitem != line.Lineitem));
  };

  const onCloseObservationEditSave = () => {
    if (!detail) return;
    if (!detail.BusinessImplication || !detail.RootCause || !detail.Recommendation) {
      props.onRequiredFieldsMissing();
      return;
    }
    const next = items.map((i) => {
      if (i.Lineitem != detail.Lineitem) return i;
      return personOwner ? { ...i, EmailTable: [...personOwner] } : i;
    });
    onItemsChange(next);
    setDetailMode(null);
  };

  const onAddPersonAndOwner = () => {
    const list = personOwner ? [...personOwner] : [];
    const itemNumber = list.length > 0 ? (Number(list[list.length - 1].OwLineitem) + 1).toString() : '1';
    updatePersonOwner([...list, newPersonOwner(itemNumber)]);
  };

  const patchPersonOwner = (owLineitem: string, patch: Row) => {
    updatePersonOwner((personOwner || []).map((r) => (r.OwLineitem == owLineitem ? { ...r, ...patch } : r)));
  };

  const doUpload = async () => {
    const ok = await props.onUpload(file, annexure);
    if (ok) {
      setFile(null);
      setFileKey((k) => k + 1);
    }
  };

  const obsColumns: Column<Row>[] = [
    { key: 'Lineitem', header: 'Observation No' },
    {
      key: '__display',
      header: 'Display',
      render: (r) => (
        <button type="button" aria-label="Display" onClick={() => openDetail(r, 'display')} className="rounded-md p-1 text-rust hover:bg-glassRust">
          <Eye size={16} />
        </button>
      ),
    },
    {
      key: '__edit',
      header: 'Edit',
      render: (r) => (
        <button
          type="button"
          aria-label="Edit"
          disabled={!editable}
          onClick={() => openDetail(r, 'edit')}
          className="rounded-md p-1 text-rust hover:bg-glassRust disabled:opacity-40"
        >
          <Pencil size={16} />
        </button>
      ),
    },
    {
      key: '__delete',
      header: 'Delete',
      render: (r) => (
        <button
          type="button"
          aria-label="Delete"
          disabled={!editable}
          onClick={() => onPressDeleteObservation(r)}
          className="rounded-md p-1 text-red hover:bg-redBg disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const attachColumns: Column<Row>[] = [
    { key: 'Filename', header: 'Supporting Files' },
    { key: 'Annexture', header: 'Annexures', render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.Annexture} readOnly disabled /> },
    {
      key: '__action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="Delete attachment"
          disabled={!editable}
          onClick={(e) => {
            e.stopPropagation();
            props.onDeleteAttachment(r);
          }}
          className="rounded-md p-1 text-red hover:bg-redBg disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  const ta = (key: string, rows = 3, disabled = !editable) => (
    <TextArea rows={rows} value={auditModel[key] ?? ''} disabled={disabled} onChange={(e) => onAuditModelChange({ [key]: e.target.value })} />
  );

  const userColumns: Column<Row>[] = [
    { key: 'Fname', header: 'First Name' },
    { key: 'Lname', header: 'Last Name' },
    { key: 'Uname', header: 'User Name' },
  ];

  return (
    <>
      <Dialog
        open={open}
        title="Observation Details"
        onClose={props.onCancel}
        width="max-w-6xl"
        footer={
          <>
            {editable && (
              <button type="button" className="btn-primary" onClick={props.onSave}>
                Save
              </button>
            )}
            <button type="button" className="btn-danger" onClick={props.onCancel}>
              Cancel
            </button>
          </>
        }
      >
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="pt-3">
          {tab === 'steps' && (
            <Field label="AuditSteps">
              {ta('AuditSteps', 8, true)}
            </Field>
          )}

          {tab === 'work' && (
            <div className="grid gap-3">
              <Field label="Process Walkthrough">{ta('ProcessWalkthrough', 3)}</Field>
              <Field label="Actual Work Done">{ta('ActualWorkDone', 3)}</Field>
              <Field label="Population" required>{ta('Population', 2)}</Field>
              <Field label="Sample" required>{ta('Sample', 2)}</Field>
              <Field label="Remarks">{ta('Remarks', 3)}</Field>
              <Field label="Reason of Delay">{ta('Resonfordelay', 3)}</Field>
            </div>
          )}

          {tab === 'obs' && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <button type="button" className="btn-primary !py-1.5" disabled={!editable} onClick={onAddNewObervation}>
                  <Plus size={14} />
                </button>
              </div>
              <DataTable columns={obsColumns} rows={items} rowKey={(r) => String(r.Lineitem)} />
            </div>
          )}

          {tab === 'attach' && (
            <div className="grid gap-3">
              <Field label="Attachment">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    key={fileKey}
                    ref={fileInput}
                    type="file"
                    disabled={!editable}
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-[12.5px] file:mr-2 file:rounded-md file:border file:border-border file:bg-white file:px-2.5 file:py-1 file:text-[12px] file:font-semibold"
                  />
                  <button type="button" className="btn-ghost !py-1.5" disabled={!editable} onClick={doUpload}>
                    <Upload size={14} />
                    Upload File
                  </button>
                </div>
              </Field>
              <Field label="Annexures">
                <Checkbox checked={annexure} onChange={setAnnexure} />
              </Field>
            </div>
          )}

          {tab === 'attachList' && (
            <DataTable
              columns={attachColumns}
              rows={props.attachments}
              onRowPress={(r) => props.onOpenAttachment(r)}
              noDataText="No attachments"
            />
          )}

          {tab === 'action' && (
            <div className="grid max-w-sm gap-3">
              {/* Mail Id / Message are visible="false" in the source fragment. */}
              {props.statusReviewerVisible && (
                <Field label="Status">
                  <Select
                    value={props.actionStatus}
                    onChange={props.onActionStatusChange}
                    placeholder=""
                    options={[
                      { key: 'Send Back to Performer', text: 'Send Back to Performer' },
                      { key: 'Send to Auditee', text: 'Send to Auditee' },
                      { key: 'Close', text: 'Close' },
                    ]}
                  />
                </Field>
              )}
              {props.statusPerformerVisible && (
                <Field label="Status">
                  <Select
                    value={props.actionStatus}
                    onChange={props.onActionStatusChange}
                    disabled={!editable}
                    placeholder=""
                    options={[{ key: 'Send to Reviewer', text: 'Send to Reviewer' }]}
                  />
                </Field>
              )}
            </div>
          )}
        </div>
      </Dialog>

      {/* observationDialogDisplay / observationDialogEdit */}
      <Dialog
        open={!!detailMode && !!detail}
        title="Observation Details"
        onClose={() => setDetailMode(null)}
        width="max-w-6xl"
        footer={
          detailMode === 'edit' ? (
            <>
              <button type="button" className="btn-primary" onClick={onCloseObservationEditSave}>
                Save
              </button>
              <button type="button" className="btn-danger" onClick={() => setDetailMode(null)}>
                Close
              </button>
            </>
          ) : (
            <button type="button" className="btn-danger" onClick={() => setDetailMode(null)}>
              Close
            </button>
          )
        }
      >
        {detail && (
          <ObservationDetailForm
            detail={detail}
            edit={detailMode === 'edit'}
            onPatch={patchDetail}
            personOwner={personOwner}
            onAddPersonOwner={onAddPersonAndOwner}
            onPatchPersonOwner={patchPersonOwner}
            onDeletePersonOwner={(ow) => updatePersonOwner((personOwner || []).filter((r) => r.OwLineitem != ow))}
            onValueHelp={(kind, ow) => setUserDialog({ kind, owLineitem: ow })}
          />
        )}
      </Dialog>

      {/* UserListDialogPer / UserListDialogOwner (TableSelectDialog over userJsonModel) */}
      <SelectDialog
        open={!!userDialog}
        title="User"
        rows={props.userList}
        columns={userColumns}
        searchKeys={['Fname', 'Lname', 'Uname']}
        onClose={() => setUserDialog(null)}
        onConfirm={(sel) => {
          const u = sel[0];
          if (u && userDialog) {
            const user = `${u.Fname ?? ''} ${u.Lname ?? ''}`;
            if (userDialog.kind === 'Per') patchPersonOwner(userDialog.owLineitem, { PersonResponsible: user, PersonResUname: u.Uname ?? '' });
            else patchPersonOwner(userDialog.owLineitem, { OwnerName: user, OwnerUname: u.Uname ?? '' });
          }
          setUserDialog(null);
        }}
      />
    </>
  );
}

function ObservationDetailForm({
  detail,
  edit,
  onPatch,
  personOwner,
  onAddPersonOwner,
  onPatchPersonOwner,
  onDeletePersonOwner,
  onValueHelp,
}: {
  detail: Row;
  edit: boolean;
  onPatch: (patch: Row) => void;
  personOwner: Row[] | undefined;
  onAddPersonOwner: () => void;
  onPatchPersonOwner: (owLineitem: string, patch: Row) => void;
  onDeletePersonOwner: (owLineitem: string) => void;
  onValueHelp: (kind: 'Per' | 'Owner', owLineitem: string) => void;
}) {
  const text = (key: string, label: string, rows = 3, required = false) => (
    <Field label={label} required={edit && required}>
      {edit ? (
        <TextArea rows={rows} value={detail[key] ?? ''} title={detail[key] ?? ''} onChange={(e) => onPatch({ [key]: e.target.value })} />
      ) : (
        <ReadOnlyText value={detail[key]} />
      )}
    </Field>
  );
  const box = (key: string, label: string, disabled = false) => (
    <Checkbox checked={!!detail[key]} disabled={!edit || disabled} label={label} onChange={(v) => onPatch({ [key]: v })} />
  );

  const poColumns: Column<Row>[] = [
    {
      key: 'PersonResponsible',
      header: 'Person Responsible',
      width: '12rem',
      render: (r) =>
        edit ? (
          <div className="flex gap-1">
            <Input value={r.PersonResponsible ?? ''} title={r.PersonResponsible ?? ''} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { PersonResponsible: e.target.value })} />
            <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => onValueHelp('Per', r.OwLineitem)} aria-label="Select user">
              …
            </button>
          </div>
        ) : (
          r.PersonResponsible
        ),
    },
    {
      key: 'PersonResMail',
      header: 'Send Mail',
      render: (r) => (
        <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.PersonResMail} disabled={!edit} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { PersonResMail: e.target.checked })} />
      ),
    },
    {
      key: 'PersonResComment',
      header: 'Person Res Comment',
      width: '16rem',
      render: (r) =>
        edit ? (
          <TextArea rows={4} value={r.PersonResComment ?? ''} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { PersonResComment: e.target.value })} />
        ) : (
          <span className="whitespace-pre-wrap">{r.PersonResComment}</span>
        ),
    },
    {
      key: 'OwnerName',
      header: 'Owner Name',
      width: '12rem',
      render: (r) =>
        edit ? (
          <div className="flex gap-1">
            <Input value={r.OwnerName ?? ''} title={r.OwnerName ?? ''} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { OwnerName: e.target.value })} />
            <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => onValueHelp('Owner', r.OwLineitem)} aria-label="Select user">
              …
            </button>
          </div>
        ) : (
          r.OwnerName
        ),
    },
    {
      key: 'OwnerMail',
      header: 'Send Mail',
      render: (r) => (
        <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.OwnerMail} disabled={!edit} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { OwnerMail: e.target.checked })} />
      ),
    },
    {
      key: 'OwnerComment',
      header: 'Owner Comment',
      width: '16rem',
      render: (r) =>
        edit ? (
          <TextArea rows={4} value={r.OwnerComment ?? ''} onChange={(e) => onPatchPersonOwner(r.OwLineitem, { OwnerComment: e.target.value })} />
        ) : (
          <span className="whitespace-pre-wrap">{r.OwnerComment}</span>
        ),
    },
  ];
  if (edit) {
    poColumns.push({
      key: '__delete',
      header: 'Delete',
      render: (r) => (
        <button type="button" aria-label="Delete" onClick={() => onDeletePersonOwner(r.OwLineitem)} className="rounded-md p-1 text-red hover:bg-redBg">
          <Trash2 size={16} />
        </button>
      ),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Observation No">
          <ReadOnlyText value={detail.Lineitem} />
        </Field>
        <div />
        {text('ObservationTitle', 'Observation Title', 4)}
        {text('Observation', 'Observation', 4)}
        <Field label="Observation Report">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {box('ObservationReportAudRep', 'Audit Report')}
            {box('ObservationReportMis', 'MIS')}
            {box('ObservationReportAudCom', 'Audit Committee')}
            {box('ObservationReportNone', 'None of these')}
          </div>
        </Field>
        <div />
        {text('BusinessImplication', 'Business Implication', 4, true)}
        {text('RootCause', 'Root Cause', 4, true)}
        {text('FinancialImpact', 'Financial Impact(In Lac)', 2)}
        {text('Recommendation', 'Recommendation', 4, true)}
        <Field label="Time Line" required={edit}>
          {edit ? (
            <DateInput value={detail.Timeline instanceof Date ? detail.Timeline : null} onChange={(d) => onPatch({ Timeline: d })} />
          ) : (
            <ReadOnlyText value={formatDateDisplay(detail.Timeline)} />
          )}
        </Field>
        <Field label="Direct Close">
          <Switch checked={detail.DirectClose === 'X'} disabled={!edit} onChange={(v) => onPatch({ DirectClose: v ? 'X' : '' })} />
        </Field>
        {text('Score', 'Score', 2)}
        <div />
        <Field label="Gross Risk">
          {edit ? (
            <Select value={detail.GrossRisk ?? ''} onChange={(v) => onPatch({ GrossRisk: v })} options={RISK_OPTIONS} placeholder="" />
          ) : (
            <ReadOnlyText value={detail.GrossRisk} />
          )}
        </Field>
        <Field label="Residual Risk">
          {edit ? (
            <Select value={detail.ResidualRisk ?? ''} onChange={(v) => onPatch({ ResidualRisk: v })} options={RISK_OPTIONS} placeholder="" />
          ) : (
            <ReadOnlyText value={detail.ResidualRisk} />
          )}
        </Field>
        <Field label="Observation Category">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {box('OsrvtnCatProc', 'P-Process')}
            {box('OsrvtnCatCost', 'C- Cost Savings')}
            {box('OsrvtnCatRegu', 'R- Regulatory Compliance')}
            {box('OsrvtnCatOthr', 'O-Others')}
          </div>
        </Field>
        <Field label="Observation Subcategory">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {box('OsrvtnScatP1', 'P1', !detail.OsrvtnCatProc)}
            {box('OsrvtnScatP2', 'P2', !detail.OsrvtnCatProc)}
            {box('OsrvtnScatP3', 'P3', !detail.OsrvtnCatProc)}
          </div>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="field-label">Person Responsible And Owner Name</span>
          {edit && (
            <button type="button" className="btn-primary !py-1.5" onClick={onAddPersonOwner}>
              <Plus size={14} />
            </button>
          )}
        </div>
        <DataTable columns={poColumns} rows={personOwner || []} rowKey={(r, i) => `${r.OwLineitem}-${i}`} />
      </div>
    </div>
  );
}
