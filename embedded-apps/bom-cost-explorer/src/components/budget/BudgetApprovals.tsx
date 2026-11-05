'use client';
/**
 * Budget approvals: the approver's side of the SAP report (its "approve" mode). SAP lists what was initiated for the signed-in person (AppUser is mapped to
 * the approver in zmm_cost_aprove); this screen shows each version with its lines and components, and approves one version at a time (the report approved
 * everything pending in one go: "Approve all" below does the same, one version after the other). SAP's authority check is the real gate.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Lock, RefreshCw } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { Button, Card, Drawer, Empty, Modal, Pill, Skeleton, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import WacMessages from '../wac/WacMessages';
import { useHubSession } from '@/lib/client/session';
import { fmtDate, fmtNum } from '@/lib/format';
import { abortAll } from '@/lib/wac/cache';
import { approveBudget } from '@/lib/budget/write';
import { canApproveBudget, useBudgetRole } from '@/lib/budget/roles';
import { pendingDetKey, pendingKey, startPending, startPendingDet, useEntry } from '@/lib/budget/useBudget';
import { groupPending, type PendingGroup } from '@/lib/budget/view';
import { downloadBudget, pendingDetSheet, pendingSheet } from '@/lib/budget/export';
import type { BudgetPendingDetRow, BudgetPendingRow } from '@/lib/budget/types';

const CTX = 'budget-approvals';
type Tab = 'lines' | 'components';

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const role = useBudgetRole(email);
  const allowed = typeof role === 'string' && role !== 'checking' && canApproveBudget(role);
  const entry = useEntry<BudgetPendingRow>(email ? pendingKey(email) : null);
  const groups = useMemo(() => groupPending(entry?.status === 'done' ? entry.data ?? [] : []), [entry]);
  const [view, setView] = useState<PendingGroup | null>(null);
  const [ask, setAsk] = useState<PendingGroup[] | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback((force = false) => { if (email) void startPending(email, CTX, force); }, [email]);
  useEffect(() => { if (allowed) load(false); }, [allowed, load]);
  useEffect(() => () => abortAll(), []);

  if (hub === 'checking' || role === 'checking') return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!allowed) return <Card><Empty title="Budget approvals are not open to you" icon={<Lock size={28} />}>Ask an admin to give you the budget-approve role for Costing Cockpit in Manage Access.</Empty></Card>;

  return (
    <>
      <Card title="Waiting for your approval" actions={<Button size="sm" onClick={() => { setNotice(''); load(true); }}><RefreshCw size={13} /> Refresh</Button>}>
        {notice && <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-good" role="status"><CheckCircle2 size={15} /> {notice}</p>}
        <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />
        {(!entry || entry.status === 'loading') && <Skeleton rows={4} />}
        {entry?.status === 'done' && !groups.length && <Empty title="No pending approval">Nothing has been initiated for you, or everything is already approved.</Empty>}
        {groups.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Versions" value={groups.length} /><Stat label="Lines" value={groups.reduce((a, g) => a + g.lines, 0)} />
              <Stat label="Plants" value={new Set(groups.flatMap((g) => g.plants)).size} /><Stat label="Oldest initiated" value={fmtDate(groups.map((g) => g.initiatedOn).filter(Boolean).sort()[0] ?? null) || 'n/a'} />
            </div>
            <div className="scroll-thin overflow-auto rounded-2xl border border-line">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">{['Year', 'Version', 'Lines', 'Plants', 'Initiated by', 'On', 'Remarks', ''].map((h) => <th key={h} className="border-b border-line bg-sunken px-2.5 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="odd:bg-panel even:bg-sunken/40">
                      <td className="border-b border-line/60 px-2.5 py-2 font-bold">{g.gjahr}</td>
                      <td className="border-b border-line/60 px-2.5 py-2"><Pill tone="accent">v{g.version}</Pill></td>
                      <td className="num border-b border-line/60 px-2.5 py-2">{g.lines}</td>
                      <td className="border-b border-line/60 px-2.5 py-2">{g.plants.join(', ')}</td>
                      <td className="border-b border-line/60 px-2.5 py-2">{g.initiatedBy}</td>
                      <td className="border-b border-line/60 px-2.5 py-2">{fmtDate(g.initiatedOn)}</td>
                      <td className="max-w-[18rem] truncate border-b border-line/60 px-2.5 py-2" title={g.remarks}>{g.remarks}</td>
                      <td className="whitespace-nowrap border-b border-line/60 px-2.5 py-2 text-right">
                        <Button size="sm" onClick={() => setView(g)}>View</Button>{' '}
                        <Button size="sm" variant="primary" onClick={() => setAsk([g])}>Approve</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {groups.length > 1 && <div><Button onClick={() => setAsk(groups)}>Approve all {groups.length} versions</Button></div>}
          </div>
        )}
      </Card>
      <VersionDrawer group={view} email={email} onClose={() => setView(null)} />
      <ApproveModal groups={ask} email={email} onClose={() => setAsk(null)} onDone={(m) => { setNotice(m); load(true); }} />
    </>
  );
}

function VersionDrawer({ group, email, onClose }: { group: PendingGroup | null; email: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('lines');
  const detKey = group ? pendingDetKey(email, group.gjahr, group.version) : null;
  const det = useEntry<BudgetPendingDetRow>(detKey);
  useEffect(() => { setTab('lines'); }, [group?.key]);
  useEffect(() => { if (group && tab === 'components') void startPendingDet(email, group.gjahr, group.version, CTX); }, [group, tab, email]);
  const n = (v: string, dp = 4) => fmtNum(v, dp, 'X');
  return (
    <Drawer open={!!group} onClose={onClose} width={1100} title={group && <div><div className="text-xs font-bold text-accent">Year {group.gjahr} · version {group.version}</div><div className="text-sm font-extrabold">{group.lines} lines · {group.plants.join(', ')}</div></div>}>
      {group && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs<Tab> label="Version view" value={tab} onChange={setTab} tabs={[{ id: 'lines', label: 'Finished goods' }, { id: 'components', label: 'Components' }]} />
            <span className="flex-1" />
            <Button size="sm" onClick={() => void downloadBudget([pendingSheet(group.rows), ...(det?.status === 'done' ? [pendingDetSheet(det.data ?? [])] : [])], [['Year', group.gjahr], ['Version', group.version], ['Initiated by', group.initiatedBy], ['Remarks', group.remarks]], `budget-v${group.version}`)}><FileSpreadsheet size={13} /> Excel</Button>
          </div>
          {tab === 'lines' && (
            <div className="scroll-thin max-h-[64vh] overflow-auto rounded-2xl border border-line">
              <table className="w-full border-separate border-spacing-0 text-[13px]">
                <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">{['Material', 'Description', 'Plant', 'Scheme', 'CRS SKU', 'B-RM', 'B-PM', 'B-Perfume', 'Budget / pc', 'Proj / pc', 'Actual / pc', 'Info rate / pc (info)'].map((h, i) => <th key={h} className={cx('sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2', i > 4 && 'text-right')}>{h}</th>)}</tr></thead>
                <tbody>{group.rows.map((r) => (
                  <tr key={r.Rowid} className="odd:bg-panel even:bg-sunken/40">
                    <td className="border-b border-line/60 px-2.5 py-1.5 font-mono text-xs font-bold text-accent">{r.Matnr}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Maktx}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Werks}</td>
                    <td className="border-b border-line/60 px-2.5 py-1.5">{r.Zscheme}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Zskugrcodecrs}</td>
                    {[r.RmCost, r.PmCost, r.PerfumeCost, r.CostPc, r.PcostPc, r.AcostPc, r.LRate].map((v, i) => <td key={i} className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(v)}</td>)}
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {tab === 'components' && (
            <>
              {(!det || det.status === 'loading') && <Skeleton rows={6} />}
              <WacMessages messages={det?.messages ?? []} error={det?.status === 'error' ? det.error : null} />
              {det?.status === 'done' && (
                <div className="scroll-thin max-h-[64vh] overflow-auto rounded-2xl border border-line">
                  <table className="w-full border-separate border-spacing-0 text-[13px]">
                    <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">{['FG', 'Plant', 'Component', 'Description', 'Type', 'Origin', 'Qty', 'Budget / pc', 'Proj / pc', 'Actual / pc', 'Info rate (info)'].map((h, i) => <th key={h} className={cx('sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2', i > 5 && 'text-right')}>{h}</th>)}</tr></thead>
                    <tbody>{(det.data ?? []).map((r) => (
                      <tr key={r.Rowid} className="odd:bg-panel even:bg-sunken/40">
                        <td className="border-b border-line/60 px-2.5 py-1.5 font-mono text-xs">{r.Matnr}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Werks}</td><td className="border-b border-line/60 px-2.5 py-1.5 font-mono text-xs">{r.Idnrk}</td>
                        <td className="border-b border-line/60 px-2.5 py-1.5">{r.ItemDesc}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Mtart}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Hrkft}</td>
                        <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.Menge, 6)}</td>
                        {[r.CostPc, r.PcostPc, r.AcostPc, r.LRate].map((v, i) => <td key={i} className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(v)}</td>)}
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}

function ApproveModal({ groups, email, onClose, onDone }: { groups: PendingGroup[] | null; email: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!groups) { setErr(''); setBusy(false); setRemarks(''); } }, [groups]);
  const go = async () => {
    if (!groups) return;
    setBusy(true); setErr('');
    const done: string[] = [];
    try {
      for (const g of groups) { await approveBudget(g.gjahr, g.version, remarks, email); done.push(`v${g.version}`); } // one after the other: a failure stops the rest
      onDone(`Approved ${done.join(', ')}.`); onClose();
    } catch (e) {
      setErr(`${done.length ? `Approved ${done.join(', ')}. ` : ''}${(e as Error).message}`);
      if (done.length) onDone(`Approved ${done.join(', ')}.`);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={!!groups} onClose={busy ? () => undefined : onClose} title={groups && groups.length > 1 ? `Approve ${groups.length} versions` : 'Approve budget version'}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={() => void go()} disabled={busy}>{busy ? <><Spinner /> Approving…</> : 'Approve'}</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <p>{groups?.map((g) => `${g.gjahr} v${g.version} (${g.lines} lines)`).join(' · ')}</p>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted">Approver remarks
          <input className={inputCls} maxLength={100} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </label>
        <p className="text-2xs text-faint">Approval is final in SAP: the version becomes the approved budget cost of its year.</p>
        {err && <p className="text-bad" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

export default function BudgetApprovals() {
  return <PlanFrame active="budget-approvals"><Screen /></PlanFrame>;
}
