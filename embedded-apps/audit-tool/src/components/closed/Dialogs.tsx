'use client';

// fragments/closed2Action.fragment.xml, observationDialogDisplay.fragment.xml and
// observationDialogDisplayMis.fragment.xml — all read-only here, exactly as in the source
// (/ClosedAction/ObservationDetail/Editable is always false; the Save button, "Attach
// Observation" tab and attachment delete are commented out / hidden in the fragment).
import React, { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { Dialog, DataTable, Tabs, Select, formatDateDisplay } from '../ui';
import { useUi } from '../../context/UiContext';
import { downloadAttachment } from '../../lib/files';
import type { Row } from './shared';

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="text-[12px] font-semibold text-inkSoft">
      {now.toLocaleTimeString()} &nbsp; {now.toDateString()}
    </span>
  );
}

function ReadOnlyArea({ label, value, rows = 3 }: { label: string; value: unknown; rows?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <textarea className="input bg-appBg/60" rows={rows} readOnly value={value == null ? '' : String(value)} title={value == null ? '' : String(value)} />
    </label>
  );
}

function ReadOnlyCheck({ text, checked }: { text: string; checked: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink">
      <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!checked} readOnly disabled />
      {text}
    </label>
  );
}

function CheckGroup({ label, items }: { label: string; items: { text: string; checked: boolean }[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((i) => (
          <ReadOnlyCheck key={i.text} text={i.text} checked={i.checked} />
        ))}
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  { key: 'Send to Reviewer', text: 'Send to Reviewer' },
  { key: 'Send Back to Performer', text: 'Send Back to Performer' },
  { key: 'Send to Auditee', text: 'Send to Auditee' },
  { key: 'Close', text: 'Close' },
  { key: '', text: '' },
];

/** closed2Action.fragment.xml — "Observation Details" dialog with its IconTabBar. */
export function ClosedActionDialog({
  open,
  audit,
  status,
  observationItems,
  attachments,
  onDisplayObservation,
  onClose,
}: {
  open: boolean;
  audit: Row | null;
  status: string;
  observationItems: Row[];
  attachments: Row[];
  onDisplayObservation: (item: Row) => void;
  onClose: () => void;
}) {
  const ui = useUi();
  const [tab, setTab] = useState('steps');
  useEffect(() => {
    if (open) setTab('steps');
  }, [open]);
  const a = audit || {};

  return (
    <Dialog
      open={open}
      title="Observation Details"
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <button type="button" className="btn-danger" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'steps', text: 'Audit-Steps' },
          { key: 'work', text: 'Actual Testing / Work Done' },
          { key: 'obs', text: 'Observation Details' },
          { key: 'att', text: 'Attachement Details' },
          { key: 'action', text: 'Action' },
        ]}
      />
      <div className="pt-3">
        {tab === 'steps' && <ReadOnlyArea label="AuditSteps" value={a.AuditSteps} rows={7} />}
        {tab === 'work' && (
          <div className="grid gap-3">
            <ReadOnlyArea label="Process Walkthrough" value={a.ProcessWalkthrough} />
            <ReadOnlyArea label="Actual Work Done" value={a.ActualWorkDone} />
            <ReadOnlyArea label="Population" value={a.Population} rows={2} />
            <ReadOnlyArea label="Sample" value={a.Sample} rows={2} />
            <ReadOnlyArea label="Remarks" value={a.Remarks} />
            <ReadOnlyArea label="Reason of Delay" value={a.Resonfordelay} />
          </div>
        )}
        {tab === 'obs' && (
          <DataTable
            rows={observationItems}
            columns={[
              { key: 'Lineitem', header: 'Observation No' },
              {
                key: 'display',
                header: 'Display',
                render: (r) => (
                  <button type="button" aria-label="Display observation" className="p-1 text-rust hover:text-rustDeep" onClick={() => onDisplayObservation(r)}>
                    <Eye size={16} />
                  </button>
                ),
              },
            ]}
          />
        )}
        {tab === 'att' && (
          <DataTable
            rows={attachments}
            onRowPress={(r) => {
              if (!downloadAttachment(r)) ui.messageBox.error('Not valid Base64');
            }}
            columns={[
              { key: 'Filename', header: 'Supporting Files' },
              {
                key: 'Annexture',
                header: 'Annexures',
                render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.Annexture} readOnly disabled />,
              },
            ]}
          />
        )}
        {tab === 'action' && (
          <label className="flex max-w-xs flex-col gap-1">
            <span className="field-label">Status</span>
            <Select value={status} onChange={() => undefined} options={STATUS_OPTIONS} disabled />
          </label>
        )}
      </div>
    </Dialog>
  );
}

/** observationDialogDisplay(.Mis).fragment.xml — one observation, read-only, plus its Person
 * Responsible / Owner table. */
export function ObservationDisplayDialog({
  open,
  detail,
  personOwnerRows,
  mis,
  onClose,
}: {
  open: boolean;
  detail: Row | null;
  personOwnerRows: Row[];
  mis?: boolean;
  onClose: () => void;
}) {
  const d = detail || {};
  return (
    <Dialog
      open={open}
      title="Observation Details"
      onClose={onClose}
      width="max-w-5xl"
      footer={
        <button type="button" className="btn-danger" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid gap-3">
        <ReadOnlyArea label="Observation No" value={d.Lineitem} rows={1} />
        <ReadOnlyArea label="Observation Title" value={d.ObservationTitle} rows={4} />
        <ReadOnlyArea label="Observation" value={d.Observation} rows={4} />
        {mis && (
          <>
            <ReadOnlyArea label="MSD Remarks" value={d.MsdRemark} />
            <ReadOnlyArea label="Annexture" value={d.Annexture} />
          </>
        )}
        <CheckGroup
          label="Observation Report"
          items={[
            { text: 'Audit Report', checked: d.ObservationReportAudRep },
            { text: 'MIS', checked: d.ObservationReportMis },
            { text: 'Audit Committee', checked: d.ObservationReportAudCom },
            { text: 'None of these', checked: d.ObservationReportNone },
          ]}
        />
        <ReadOnlyArea label="Business Implication" value={d.BusinessImplication} rows={4} />
        <ReadOnlyArea label="Root Cause" value={d.RootCause} rows={4} />
        <ReadOnlyArea label="Financial Impact(In Lac)" value={d.FinancialImpact} rows={1} />
        <ReadOnlyArea label="Recommendation" value={d.Recommendation} rows={4} />
        <div className="flex flex-col gap-1">
          <span className="field-label">Time Line</span>
          <span className="text-[13px] text-ink">{formatDateDisplay(d.Timeline)}</span>
        </div>
        {mis && (
          <>
            <div className="flex flex-col gap-1">
              <span className="field-label">Earlier TimeLine</span>
              <input className="input bg-appBg/60" readOnly value={formatDateDisplay(d.EarlierTimeline)} />
            </div>
            <ReadOnlyArea label="Ageing" value={d.Ageing} rows={1} />
          </>
        )}
        <div className="flex flex-col gap-1">
          <span className="field-label">Direct Close</span>
          <span className={`pill w-fit ${d.DirectClose === 'X' ? 'bg-greenBg text-green' : 'bg-redBg text-red'}`}>{d.DirectClose === 'X' ? 'Yes' : 'No'}</span>
        </div>
        <ReadOnlyArea label="Score" value={d.Score} rows={1} />
        <ReadOnlyArea label="Gross Risk" value={d.GrossRisk} rows={1} />
        <ReadOnlyArea label="Residual Risk" value={d.ResidualRisk} rows={1} />
        <CheckGroup
          label="Observation Category"
          items={[
            { text: 'P-Process', checked: d.OsrvtnCatProc },
            { text: 'C- Cost Savings', checked: d.OsrvtnCatCost },
            { text: 'R- Regulatory Compliance', checked: d.OsrvtnCatRegu },
            { text: 'O-Others', checked: d.OsrvtnCatOthr },
          ]}
        />
        <CheckGroup
          label="Observation Subcategory"
          items={[
            { text: 'P1', checked: d.OsrvtnScatP1 },
            { text: 'P2', checked: d.OsrvtnScatP2 },
            { text: 'P3', checked: d.OsrvtnScatP3 },
          ]}
        />
        {mis && (
          <>
            <CheckGroup
              label="Root Cause(PE/PR/TE)"
              items={[
                { text: 'PE', checked: d.RootCausePe },
                { text: 'PR', checked: d.RootCausePr },
                { text: 'TE', checked: d.RootCauseTe },
              ]}
            />
            <ReadOnlyArea label="QTR" value={d.Qtr} rows={1} />
          </>
        )}
      </div>
      <p className="mb-2 mt-4 text-[12.5px] font-bold text-ink">Person Responsible And Owner Name</p>
      <DataTable
        rows={personOwnerRows}
        columns={[
          { key: 'PersonResponsible', header: 'Person Responsible', width: '8rem' },
          {
            key: 'PersonResMail',
            header: 'Send Mail',
            width: '4rem',
            render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.PersonResMail} readOnly disabled />,
          },
          { key: 'PersonResComment', header: 'Person Res Comment', width: '20rem' },
          { key: 'OwnerName', header: 'Owner Name', width: '8rem' },
          {
            key: 'OwnerMail',
            header: 'Send Mail',
            width: '4rem',
            render: (r) => <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!r.OwnerMail} readOnly disabled />,
          },
          { key: 'OwnerComment', header: 'Owner Comment', width: '20rem' },
        ]}
      />
    </Dialog>
  );
}
