'use client';

// The two observation dialogs MISinprocess2 opens from its Observation Details tab — ports of
// fragments/observationDialogDisplayMis.fragment.xml and observationDialogEditMis.fragment.xml,
// plus the UserListDialogPer / UserListDialogOwner TableSelectDialogs the edit grid's value helps
// open.
//
// Like the source (which binds these dialogs to /InProcess2/ObservationDetail — the SAME object
// held in /InProcess2/ObservationItem — and /InProcess2/PersonAndOwnerTableData — the SAME array
// as that item's EmailTable), edits are applied directly to the objects passed in and the parent
// re-renders via onChange(). "Close" therefore does not revert edits, exactly as in the source;
// "Save" validates and copies the person/owner grid back onto the item.
import { useState } from 'react';
import { Trash2, Plus, Search } from 'lucide-react';
import { Dialog, Field, TextArea, Checkbox, DateInput, Select, SelectDialog, formatDateDisplay, type Column } from '../ui';

type Row = Record<string, any>;

const RISK_OPTIONS = [
  { key: 'High', text: 'High' },
  { key: 'Medium', text: 'Medium' },
  { key: 'Low', text: 'Low' },
  { key: '', text: '' },
];
const QTR_OPTIONS = [
  { key: 'QTR1', text: 'QTR1' },
  { key: 'QTR2', text: 'QTR2' },
  { key: 'QTR3', text: 'QTR3' },
  { key: 'QTR4', text: 'QTR4' },
  { key: '', text: '' },
];

function ReadOnly({ label, value }: { label: string; value: unknown }) {
  return (
    <Field label={label}>
      <div className="min-h-[34px] whitespace-pre-wrap rounded-lg border border-border bg-appBg px-2.5 py-1.5 text-[13px] text-ink" title={String(value ?? '')}>
        {value instanceof Date ? formatDateDisplay(value) : String(value ?? '')}
      </div>
    </Field>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-green' : 'bg-red'}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function FlagGroup({
  label,
  detail,
  items,
  editable,
  onChange,
}: {
  label: string;
  detail: Row;
  items: { key: string; text: string; editable?: boolean }[];
  editable: boolean;
  onChange: () => void;
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((it) => (
          <Checkbox
            key={it.key}
            label={it.text}
            checked={!!detail[it.key]}
            disabled={!editable || it.editable === false}
            onChange={(v) => {
              detail[it.key] = v;
              onChange();
            }}
          />
        ))}
      </div>
    </Field>
  );
}

const REPORT_FLAGS = [
  { key: 'ObservationReportAudRep', text: 'Audit Report' },
  { key: 'ObservationReportMis', text: 'MIS' },
  { key: 'ObservationReportAudCom', text: 'Audit Committee' },
  { key: 'ObservationReportNone', text: 'None of these' },
];
const CATEGORY_FLAGS = [
  { key: 'OsrvtnCatProc', text: 'P-Process' },
  { key: 'OsrvtnCatCost', text: 'C- Cost Savings' },
  { key: 'OsrvtnCatRegu', text: 'R- Regulatory Compliance' },
  { key: 'OsrvtnCatOthr', text: 'O-Others' },
];

export function ObservationDisplayDialog({
  open,
  detail,
  emailTable,
  onClose,
}: {
  open: boolean;
  detail: Row | null;
  emailTable: Row[] | undefined;
  onClose: () => void;
}) {
  if (!open || !detail) return null;
  const d = detail;
  return (
    <Dialog
      open
      title="Observation Details"
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <button type="button" className="btn-danger" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ReadOnly label="Observation No" value={d.Lineitem} />
        <ReadOnly label="Observation Title" value={d.ObservationTitle} />
        <ReadOnly label="Observation" value={d.Observation} />
        <FlagGroup label="Observation Report" detail={d} items={REPORT_FLAGS} editable={false} onChange={() => undefined} />
        <ReadOnly label="Business Implication" value={d.BusinessImplication} />
        <ReadOnly label="Root Cause" value={d.RootCause} />
        <ReadOnly label="MSD Remarks" value={d.MsdRemark} />
        <ReadOnly label="Annexture" value={d.Annexture} />
        <ReadOnly label="Financial Impact(In Lac)" value={d.FinancialImpact} />
        <ReadOnly label="Recommendation" value={d.Recommendation} />
        <ReadOnly label="Time Line" value={formatDateDisplay(d.Timeline)} />
        <ReadOnly label="Earlier TimeLine" value={formatDateDisplay(d.EarlierTimeline)} />
        <ReadOnly label="Ageing" value={d.Ageing} />
        <Field label="Direct Close">
          <Toggle on={d.DirectClose === 'X'} disabled />
        </Field>
        <ReadOnly label="Score" value={d.Score} />
        <ReadOnly label="Gross Risk" value={d.GrossRisk} />
        <ReadOnly label="Residual Risk" value={d.ResidualRisk} />
        <FlagGroup label="Observation Category" detail={d} items={CATEGORY_FLAGS} editable={false} onChange={() => undefined} />
        <FlagGroup
          label="Observation Subcategory"
          detail={d}
          items={[
            { key: 'OsrvtnScatP1', text: 'P1' },
            { key: 'OsrvtnScatP2', text: 'P2' },
            { key: 'OsrvtnScatP3', text: 'P3' },
          ]}
          editable={false}
          onChange={() => undefined}
        />
        <FlagGroup
          label="Root Cause(PE/PR/TE)"
          detail={d}
          items={[
            { key: 'RootCausePe', text: 'PE' },
            { key: 'RootCausePr', text: 'PR' },
            { key: 'RootCauseTe', text: 'TE' },
          ]}
          editable={false}
          onChange={() => undefined}
        />
        <ReadOnly label="QTR" value={d.Qtr} />
      </div>

      <h3 className="mb-2 mt-4 text-[12.5px] font-bold text-ink">Person Responsible And Owner Name</h3>
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-[12.5px]">
          <thead className="bg-cream text-left text-inkSoft">
            <tr>
              <th className="px-2.5 py-2">Person Responsible</th>
              <th className="px-2.5 py-2">Send Mail</th>
              <th className="px-2.5 py-2">Person Res Comment</th>
              <th className="px-2.5 py-2">Owner Name</th>
              <th className="px-2.5 py-2">Send Mail</th>
              <th className="px-2.5 py-2">Owner Comment</th>
            </tr>
          </thead>
          <tbody>
            {(emailTable || []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-inkSoft">
                  No data
                </td>
              </tr>
            )}
            {(emailTable || []).map((e, i) => (
              <tr key={i} className="border-t border-border/70">
                <td className="px-2.5 py-1.5">{String(e.PersonResponsible ?? '')}</td>
                <td className="px-2.5 py-1.5">
                  <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!e.PersonResMail} disabled readOnly />
                </td>
                <td className="whitespace-pre-wrap px-2.5 py-1.5">{String(e.PersonResComment ?? '')}</td>
                <td className="px-2.5 py-1.5">{String(e.OwnerName ?? '')}</td>
                <td className="px-2.5 py-1.5">
                  <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!e.OwnerMail} disabled readOnly />
                </td>
                <td className="whitespace-pre-wrap px-2.5 py-1.5">{String(e.OwnerComment ?? '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

const USER_COLUMNS: Column<Row>[] = [
  { key: 'Fname', header: 'First Name' },
  { key: 'Lname', header: 'Last Name' },
  { key: 'Uname', header: 'User Name' },
];

export function ObservationEditDialog({
  open,
  detail,
  emailTable,
  users,
  onChange,
  onAddPersonAndOwner,
  onDeletePersonAndOwner,
  onPickUser,
  onSave,
  onClose,
}: {
  open: boolean;
  detail: Row | null;
  emailTable: Row[] | undefined;
  /** userJsonModel rows */
  users: Row[];
  onChange: () => void;
  onAddPersonAndOwner: () => void;
  onDeletePersonAndOwner: (row: Row) => void;
  /** onPressMaterialListDialogLineItemPer / ...Owner */
  onPickUser: (kind: 'Per' | 'Owner', gridRow: Row, user: Row) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [picker, setPicker] = useState<{ kind: 'Per' | 'Owner'; row: Row } | null>(null);
  if (!open || !detail) return null;
  const d = detail;
  const set = (key: string, value: unknown) => {
    d[key] = value;
    onChange();
  };
  const text = (key: string, label: string, required?: boolean, rows = 3) => (
    <Field label={label} required={required}>
      <TextArea rows={rows} value={String(d[key] ?? '')} title={String(d[key] ?? '')} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );
  const procOn = !!d.OsrvtnCatProc;

  return (
    <>
      <Dialog
        open
        title="Observation Details"
        onClose={onClose}
        width="max-w-5xl"
        footer={
          <>
            <button type="button" className="btn-primary" onClick={onSave}>
              Save
            </button>
            <button type="button" className="btn-danger" onClick={onClose}>
              Close
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ReadOnly label="Observation No" value={d.Lineitem} />
          {text('ObservationTitle', 'Observation Title', false, 4)}
          {text('Observation', 'Observation', false, 4)}
          <FlagGroup label="Observation Report" detail={d} items={REPORT_FLAGS} editable onChange={onChange} />
          {text('BusinessImplication', 'Business Implication', true, 4)}
          {text('RootCause', 'Root Cause', true, 4)}
          {text('MsdRemark', 'MSD Remarks')}
          {text('Annexture', 'Annexture')}
          {text('FinancialImpact', 'Financial Impact(In Lac)', false, 1)}
          {text('Recommendation', 'Recommendation', true, 4)}
          <Field label="Time Line" required>
            <DateInput value={d.Timeline instanceof Date ? d.Timeline : null} onChange={(v) => set('Timeline', v)} />
          </Field>
          <Field label="Earlier TimeLine" required>
            <DateInput value={d.EarlierTimeline instanceof Date ? d.EarlierTimeline : null} onChange={(v) => set('EarlierTimeline', v)} />
          </Field>
          {text('Ageing', 'Ageing', false, 1)}
          <Field label="Direct Close">
            {/* onChangeDirectCloseEdit */}
            <Toggle on={d.DirectClose === 'X'} onChange={(v) => set('DirectClose', v ? 'X' : '')} />
          </Field>
          {text('Score', 'Score', false, 1)}
          <Field label="Gross Risk">
            <Select value={String(d.GrossRisk ?? '')} onChange={(v) => set('GrossRisk', v)} options={RISK_OPTIONS} width="10rem" />
          </Field>
          <Field label="Residual Risk">
            <Select value={String(d.ResidualRisk ?? '')} onChange={(v) => set('ResidualRisk', v)} options={RISK_OPTIONS} width="10rem" />
          </Field>
          <FlagGroup label="Observation Category" detail={d} items={CATEGORY_FLAGS} editable onChange={onChange} />
          <FlagGroup
            label="Observation Subcategory"
            detail={d}
            items={[
              { key: 'OsrvtnScatP1', text: 'P1', editable: procOn },
              { key: 'OsrvtnScatP2', text: 'P2', editable: procOn },
              { key: 'OsrvtnScatP3', text: 'P3', editable: procOn },
            ]}
            editable
            onChange={onChange}
          />
          <FlagGroup
            label="Root Cause(PE/PR/TE)"
            detail={d}
            items={[
              { key: 'RootCausePe', text: 'PE', editable: procOn },
              { key: 'RootCausePr', text: 'PR', editable: procOn },
              { key: 'RootCauseTe', text: 'TE', editable: procOn },
            ]}
            editable
            onChange={onChange}
          />
          <Field label="QTR">
            <Select value={String(d.Qtr ?? '')} onChange={(v) => set('Qtr', v)} options={QTR_OPTIONS} width="10rem" />
          </Field>
        </div>

        <div className="mb-2 mt-4 flex items-center justify-between">
          <h3 className="text-[12.5px] font-bold text-ink">Person Responsible And Owner Name</h3>
          <button type="button" className="btn-primary !px-2.5 !py-1" onClick={onAddPersonAndOwner} aria-label="Add">
            <Plus size={14} />
          </button>
        </div>
        <div className="overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[900px] text-[12.5px]">
            <thead className="bg-cream text-left text-inkSoft">
              <tr>
                <th className="w-40 px-2.5 py-2">Person Responsible</th>
                <th className="w-16 px-2.5 py-2">Send Mail</th>
                <th className="px-2.5 py-2">Person Res Comment</th>
                <th className="w-40 px-2.5 py-2">Owner Name</th>
                <th className="w-16 px-2.5 py-2">Send Mail</th>
                <th className="px-2.5 py-2">Owner Comment</th>
                <th className="w-14 px-2.5 py-2">Delete</th>
              </tr>
            </thead>
            <tbody>
              {(emailTable || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-inkSoft">
                    No data
                  </td>
                </tr>
              )}
              {(emailTable || []).map((e, i) => (
                <tr key={i} className="border-t border-border/70 align-top">
                  <td className="px-2 py-1.5">
                    <div className="relative">
                      <input
                        className="input pr-7"
                        value={String(e.PersonResponsible ?? '')}
                        title={String(e.PersonResponsible ?? '')}
                        onChange={(ev) => {
                          e.PersonResponsible = ev.target.value;
                          onChange();
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Select person responsible"
                        onClick={() => setPicker({ kind: 'Per', row: e })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-inkSoft hover:text-rust"
                      >
                        <Search size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="mt-2 h-4 w-4 accent-rust"
                      checked={!!e.PersonResMail}
                      onChange={(ev) => {
                        e.PersonResMail = ev.target.checked;
                        onChange();
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextArea
                      rows={4}
                      value={String(e.PersonResComment ?? '')}
                      title={String(e.PersonResComment ?? '')}
                      onChange={(ev) => {
                        e.PersonResComment = ev.target.value;
                        onChange();
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="relative">
                      <input
                        className="input pr-7"
                        value={String(e.OwnerName ?? '')}
                        title={String(e.OwnerName ?? '')}
                        onChange={(ev) => {
                          e.OwnerName = ev.target.value;
                          onChange();
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Select owner"
                        onClick={() => setPicker({ kind: 'Owner', row: e })}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-inkSoft hover:text-rust"
                      >
                        <Search size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="mt-2 h-4 w-4 accent-rust"
                      checked={!!e.OwnerMail}
                      onChange={(ev) => {
                        e.OwnerMail = ev.target.checked;
                        onChange();
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <TextArea
                      rows={4}
                      value={String(e.OwnerComment ?? '')}
                      title={String(e.OwnerComment ?? '')}
                      onChange={(ev) => {
                        e.OwnerComment = ev.target.value;
                        onChange();
                      }}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" aria-label="Delete" className="mt-1 rounded-md p-1 text-red hover:bg-redBg" onClick={() => onDeletePersonAndOwner(e)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>

      <SelectDialog
        open={!!picker}
        title="User"
        rows={users}
        columns={USER_COLUMNS}
        searchKeys={['Fname', 'Lname', 'Uname']}
        onClose={() => setPicker(null)}
        onConfirm={(sel) => {
          if (picker && sel[0]) onPickUser(picker.kind, picker.row, sel[0]);
          setPicker(null);
        }}
      />
    </>
  );
}
