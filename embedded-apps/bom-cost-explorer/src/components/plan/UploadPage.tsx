'use client';
/**
 * /plan/upload - upload wizard. The file is read and checked in the browser (template columns, required
 * cells, plant format, numbers >= 0, duplicates, plan name length, row limit); rows are grouped by plan and
 * sent one request per plan: Step 1 "Check with SAP" (Dryrun 'X'), Step 2 "Save" (Dryrun '', only after
 * the check passed). Merge (default) keeps the plan's other rows; Replace deletes them first.
 * The WIP tab hands rows over through sessionStorage "plan:pending-upload".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Download, FileUp, Save, ShieldCheck } from 'lucide-react';
import PlanFrame from './PlanFrame';
import { ErrorNote, RoleNote, tdCls, tdNum, thCls, thNum } from './common';
import { planHref } from '@/lib/plan/plants';
import { Button, Card, Modal, Pill, Segmented, Spinner, cx } from '../ui';
import { PENDING_UPLOAD_KEY, cleanMonths, downloadTemplate, groupByPlan, parseWorkbook, validateRows, type ParsedRow, type RowIssue } from '@/lib/plan/upload';
import { uploadPlan, type PlanRowInput } from '@/lib/plan/write';
import { fetchAppRole } from '@/lib/client/hubAccess';
import { readHubSession } from '@/lib/client/session';
import { PLANNER_ROLES } from '@/lib/plan/workspace';
import { FISCAL_MONTHS, type PlanUploadResult } from '@/lib/plan/fields';
import { fmtNum } from '@/lib/format';

type Phase = 'idle' | 'checking' | 'checked' | 'saving' | 'saved';
interface PlanRun { result?: PlanUploadResult; error?: string }

const rowKey = (r: Pick<PlanRowInput, 'matnr' | 'werks' | 'land1'>) => `${r.matnr}|${r.werks}|${r.land1}`.toUpperCase();
const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = { S: 'good', W: 'warn', E: 'bad' };

export default function UploadPage() {
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [parseError, setParseError] = useState('');
  const [mode, setMode] = useState<'M' | 'R'>('M');
  const [phase, setPhase] = useState<Phase>('idle');
  const [runs, setRuns] = useState<Record<string, PlanRun>>({});
  const [confirm, setConfirm] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const s = readHubSession();
    if (s) {
      setEmail(s.email);
      void fetchAppRole(s.email).then(setRole);
    }
    try {
      const pending = sessionStorage.getItem(PENDING_UPLOAD_KEY);
      if (pending) {
        sessionStorage.removeItem(PENDING_UPLOAD_KEY);
        const p = JSON.parse(pending) as { source: string; rows: PlanRowInput[] };
        accept(p.source, p.rows.map((r, i) => ({ ...r, rowNo: i + 1 })));
      }
    } catch {
      /* nothing handed over */
    }
  }, []);
  const canWrite = PLANNER_ROLES.includes(role);

  function accept(name: string, parsed: ParsedRow[]) {
    setFile(name);
    setRows(parsed);
    setIssues(validateRows(parsed));
    setRuns({});
    setPhase('idle');
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setParseError('');
    try {
      const parsed = await parseWorkbook(await f.arrayBuffer());
      if (!parsed.length) throw new Error('No data rows found in the first sheet.');
      accept(f.name, parsed);
    } catch (e) {
      setParseError(`Could not read ${f.name}: ${(e as Error).message}`);
      setRows([]);
      setIssues([]);
    }
    if (input.current) input.current.value = '';
  }

  const groups = useMemo(() => groupByPlan(rows), [rows]);
  const blocking = issues.length > 0;
  const checkPassed = phase === 'checked' && Object.values(runs).every((r) => r.result && r.result.Status !== 'E' && !r.error);

  async function run(dryrun: boolean) {
    setPhase(dryrun ? 'checking' : 'saving');
    const next: Record<string, PlanRun> = {};
    for (const [plan, list] of groups) {
      try {
        next[plan] = { result: await uploadPlan(plan, mode, dryrun, list.map(cleanMonths), email) };
      } catch (e) {
        next[plan] = { error: (e as Error).message };
      }
      setRuns({ ...next });
    }
    setPhase(dryrun ? 'checked' : 'saved');
  }

  // SAP's per-row answer, matched back to the file rows.
  const rowStatus = useMemo(() => {
    const m = new Map<string, { status: string; msg: string }>();
    for (const [plan, r] of Object.entries(runs)) for (const e of r.result?.entries ?? []) m.set(`${plan}|${rowKey({ matnr: e.Matnr, werks: e.Werks, land1: e.Land1 })}`, { status: e.Status, msg: e.Msg });
    return m;
  }, [runs]);
  const issuesByRow = useMemo(() => {
    const m = new Map<number, RowIssue[]>();
    for (const i of issues) m.set(i.rowNo, [...(m.get(i.rowNo) ?? []), i]);
    return m;
  }, [issues]);

  const busy = phase === 'checking' || phase === 'saving';
  return (
    <PlanFrame active="upload">
      <div className="flex items-center gap-3">
        <Link href="/plan/" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><ArrowLeft size={13} /> Plans</Link>
        <h2 className="text-lg font-extrabold">Upload production plan</h2>
      </div>
      <RoleNote ws={{ canWrite, role }} />

      <Card title="1 · Choose the file" actions={<Button size="sm" onClick={() => void downloadTemplate()}><Download size={14} /> Template</Button>}>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button variant="primary" onClick={() => input.current?.click()} disabled={busy}><FileUp size={15} /> Choose Excel file</Button>
          <span className="text-sm text-muted">{file ? <><b className="text-ink">{file}</b> · {rows.length} rows · {groups.size} plan{groups.size === 1 ? '' : 's'}</> : 'Columns: A Material, B Plant, C Plan, D Country, E..P Apr..Mar (header row optional).'}</span>
        </div>
        {parseError && <div className="mt-3"><ErrorNote error={parseError} /></div>}
        {issues.length > 0 && (
          <div className="mt-3 rounded-xl border border-bad/40 bg-bad/[0.04]">
            <p className="border-b border-bad/30 px-3 py-2 text-sm font-semibold text-bad">{issues.length} problem{issues.length === 1 ? '' : 's'} in the file. Fix them and choose the file again.</p>
            <div className="scroll-thin max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr><th className={thNum}>Row</th><th className={thCls}>Column</th><th className={thCls}>Problem</th></tr></thead>
                <tbody>
                  {issues.slice(0, 500).map((i, n) => (
                    <tr key={n} className="border-t border-line/60"><td className={tdNum}>{i.rowNo || '—'}</td><td className={tdCls}>{i.field}</td><td className={tdCls}>{i.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {rows.length > 0 && !blocking && (
        <Card title="2 · Check and save">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-64">
              <p className="mb-1 text-xs font-bold text-muted">Update mode</p>
              <Segmented<'M' | 'R'> label="Update mode" value={mode} onChange={(v) => { setMode(v); setRuns({}); setPhase('idle'); }} options={[{ value: 'M', label: 'Merge', hint: 'Add or change these rows; other rows of the plan stay' }, { value: 'R', label: 'Replace', hint: 'Delete every row of the plan, then save these' }]} />
            </div>
            <Button variant="secondary" disabled={!canWrite || busy} onClick={() => void run(true)} title="Dryrun: SAP checks the rows, nothing is saved">
              {phase === 'checking' ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck size={15} />} Step 1 · Check with SAP
            </Button>
            <Button variant="primary" disabled={!canWrite || busy || !checkPassed} onClick={() => setConfirm(true)} title={checkPassed ? 'Save in SAP' : 'Run the check first; it must pass'}>
              {phase === 'saving' ? <Spinner className="h-3.5 w-3.5" /> : <Save size={15} />} Step 2 · Save
            </Button>
            {phase === 'saved' && Object.values(runs).every((r) => r.result?.Status === 'S') && <span className="inline-flex items-center gap-1 text-sm font-semibold text-good"><CheckCircle2 size={16} /> Saved</span>}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...groups].map(([plan, list]) => {
              const r = runs[plan];
              const st = r?.error ? 'E' : r?.result?.Status;
              return (
                <div key={plan} className="rounded-xl border border-line px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <b className="truncate">{plan}</b>
                    <span className="text-xs text-muted">{list.length} rows</span>
                    {st && <span className="ml-auto"><Pill tone={st === 'E' ? 'bad' : st === 'V' ? 'accent' : 'good'}>{st === 'E' ? 'Errors' : st === 'V' ? 'Check passed' : 'Saved'}</Pill></span>}
                  </div>
                  {r?.result && <p className="mt-1 text-xs text-muted">{r.result.MsgTxt || `${r.result.Saved} saved, ${r.result.Errors} errors`}</p>}
                  {r?.error && <p className="mt-1 text-xs text-bad">{r.error}</p>}
                  {phase === 'saved' && r?.result?.Status === 'S' && (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {[...new Set(list.map((x) => x.werks.toUpperCase()))].sort().map((w) => (
                        <Link key={w} href={planHref(plan, [w])} className="text-xs font-bold text-accent hover:underline">Open {w} →</Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <Card title={`Rows (${rows.length})`}>
          <div className="scroll-thin max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr>
                  <th className={thNum}>Row</th><th className={thCls}>Plan</th><th className={thCls}>Material</th><th className={thCls}>Plant</th><th className={thCls}>Country</th>
                  {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
                  <th className={thCls}>Status</th><th className={thCls}>Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 2000).map((r) => {
                  const own = issuesByRow.get(r.rowNo);
                  const sap = rowStatus.get(`${r.plan.trim()}|${rowKey(r)}`);
                  return (
                    <tr key={r.rowNo} className={cx('border-t border-line/60', own && 'bg-bad/[0.05]')}>
                      <td className={tdNum}>{r.rowNo}</td><td className={tdCls}>{r.plan}</td><td className={cx(tdCls, 'font-mono')}>{r.matnr}</td><td className={cx(tdCls, 'font-mono')}>{r.werks}</td><td className={tdCls}>{r.land1}</td>
                      {r.months.map((m, i) => <td key={i} className={tdNum}>{Number.isFinite(Number(String(m).replace(/,/g, ''))) ? fmtNum(String(Number(String(m).replace(/,/g, ''))), 0, 'X') : <span className="text-bad">{m}</span>}</td>)}
                      <td className={tdCls}>{own ? <Pill tone="bad">File</Pill> : sap ? <Pill tone={STATUS_TONE[sap.status] ?? 'neutral'}>{sap.status}</Pill> : null}</td>
                      <td className={cx(tdCls, 'max-w-md truncate')} title={own?.map((i) => i.message).join('; ') ?? sap?.msg}>{own ? own.map((i) => i.message).join('; ') : sap?.msg}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={mode === 'R' ? 'Replace the plans in SAP?' : 'Save the plans in SAP?'}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant={mode === 'R' ? 'danger' : 'primary'} onClick={() => { setConfirm(false); void run(false); }}>{mode === 'R' ? 'Replace' : 'Save'}</Button>
          </>
        }
      >
        <p className="text-sm">
          {mode === 'R'
            ? <>Every existing row of {[...groups.keys()].map((p) => <b key={p}>{p} </b>)} is deleted and replaced by the {rows.length} rows of this file.</>
            : <>The {rows.length} rows are added to (or update) {[...groups.keys()].map((p) => <b key={p}>{p} </b>)}; other rows of the plan stay.</>}
        </p>
      </Modal>
    </PlanFrame>
  );
}
