import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ccbApi } from './api.js';
import { Blocker, Button, Card, CcbShell, Empty, KpiTile, Loading, PageHeader, Pill, useCcbMe, useToast } from './ui.jsx';
import { CATEGORY_META, LANDSCAPES, actionOverdue, businessDaysBetween, fiscalYearStart, fmtDate, meetingLink } from './model.js';
import { BarChartIcon, BoltIcon, CheckCircleIcon, ClipboardIcon, ClockIcon, DownloadIcon, GavelIcon, UsersIcon } from '../shared/icons.jsx';

/*
 * CCB Insights: how the board is performing, computed in the browser from /change-control/insights.
 *   approval rate      approved / (approved + rejected) among requests decided in the period
 *   cycle times        median business days: submitted -> reviewed -> decided -> delivered (Dev Tracker completed date)
 *   on-time review     feasibility reviews finished within the Governance target (reviewSlaDays)
 *   attendance         CCB members present / members on the board, per completed meeting
 */

export default function Insights() {
  const { me, error, loading, reload } = useCcbMe();
  return (
    <CcbShell active="ccbInsights">
      {loading ? <Loading /> : error ? <Blocker error={error} onRetry={reload} /> : <Content me={me} />}
    </CcbShell>
  );
}

const APPROVED = (r) => ['approved', 'terminated'].includes(r.status) && r.decidedAt;
const REJECTED = (r) => r.status === 'rejected' && r.decidedAt;
const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10;
};
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (k) => new Date(`${k}-01T00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

const PERIODS = [
  { key: 'fy', label: 'This FY', from: () => fiscalYearStart(), to: () => null },
  { key: 'lastfy', label: 'Last FY', from: () => { const d = fiscalYearStart(); return new Date(d.getFullYear() - 1, 3, 1); }, to: () => fiscalYearStart() },
  { key: 'all', label: 'All time', from: () => null, to: () => null },
];

function Content() {
  const [data, setData] = useState({ loading: true, insights: null, error: null });
  const [period, setPeriod] = useState('fy');
  const [toast, showToast] = useToast();
  const load = useCallback(() => {
    ccbApi.insights()
      .then((d) => setData({ loading: false, insights: d.insights, error: null }))
      .catch((e) => setData({ loading: false, insights: null, error: e }));
  }, []);
  useEffect(load, [load]);

  const p = PERIODS.find((x) => x.key === period);
  const inPeriod = useCallback((d) => {
    if (!d) return false;
    const t = new Date(d);
    const from = p.from();
    const to = p.to();
    return (!from || t >= from) && (!to || t < to);
  }, [p]);

  const x = useMemo(() => {
    if (!data.insights) return null;
    const { requests, meetings, actions, members, settings } = data.insights;
    const logged = requests.filter((r) => inPeriod(r.createdAt));
    const decided = requests.filter((r) => inPeriod(r.decidedAt));
    const approved = decided.filter(APPROVED);
    const rejected = decided.filter(REJECTED);
    const reviewed = requests.filter((r) => inPeriod(r.reviewedAt) && r.submittedAt);
    const reviewDays = reviewed.map((r) => businessDaysBetween(r.submittedAt, r.reviewedAt));
    const onTime = reviewDays.filter((d) => d <= settings.reviewSlaDays).length;
    const toDecision = decided.filter((r) => r.reviewedAt).map((r) => businessDaysBetween(r.reviewedAt, r.decidedAt));
    const endToEnd = decided.filter((r) => r.submittedAt).map((r) => businessDaysBetween(r.submittedAt, r.decidedAt));
    const delivered = requests.filter((r) => r.devCompletedDate && r.decidedAt && inPeriod(r.devCompletedDate));
    const toDelivery = delivered.map((r) => businessDaysBetween(r.decidedAt, r.devCompletedDate));
    const emergencies = decided.filter((r) => r.approvalRoute === 'emergency');
    const informedLate = emergencies.filter((r) => r.informDueBy && (r.ccbInformedAt ? new Date(r.ccbInformedAt) > new Date(`${r.informDueBy}T23:59:59`) : new Date() > new Date(`${r.informDueBy}T23:59:59`))).length;

    // Monthly throughput (last 12 months of the period, or the period's months).
    const months = new Map();
    const bump = (d, k) => { if (!inPeriod(d)) return; const m = monthKey(d); const o = months.get(m) || { logged: 0, approved: 0, rejected: 0 }; o[k]++; months.set(m, o); };
    requests.forEach((r) => { bump(r.createdAt, 'logged'); if (APPROVED(r)) bump(r.decidedAt, 'approved'); if (REJECTED(r)) bump(r.decidedAt, 'rejected'); });
    const monthly = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);

    const group = (keyOf, labelOf) => {
      const g = new Map();
      logged.forEach((r) => {
        for (const k of [].concat(keyOf(r) || '—')) {
          const o = g.get(k) || { key: k, label: labelOf ? labelOf(k) : k, logged: 0, approved: 0, rejected: 0, cycle: [] };
          o.logged++;
          if (APPROVED(r)) o.approved++;
          if (REJECTED(r)) o.rejected++;
          if (r.submittedAt && r.decidedAt) o.cycle.push(businessDaysBetween(r.submittedAt, r.decidedAt));
          g.set(k, o);
        }
      });
      return [...g.values()].map((o) => ({ ...o, rate: pct(o.approved, o.approved + o.rejected), cycleMedian: median(o.cycle) })).sort((a, b) => b.logged - a.logged);
    };

    const completed = meetings.filter((m) => m.status === 'completed' && inPeriod(m.scheduledAt));
    const attendance = completed.map((m) => pct(m.membersPresent, members)).filter((v) => v !== null);
    const acts = actions.filter((a) => inPeriod(a.createdAt));
    const closedActs = acts.filter((a) => a.status === 'done');
    const closedOnTime = closedActs.filter((a) => !a.dueDate || new Date(a.closedAt) <= new Date(`${String(a.dueDate).slice(0, 10)}T23:59:59`)).length;

    return {
      settings, members,
      logged: logged.length, decided: decided.length, approved: approved.length, rejected: rejected.length,
      approvalRate: pct(approved.length, approved.length + rejected.length),
      reviewMedian: median(reviewDays), reviewOnTime: pct(onTime, reviewDays.length), reviewCount: reviewDays.length,
      decisionMedian: median(toDecision), endToEndMedian: median(endToEnd), deliveryMedian: median(toDelivery), deliveredCount: delivered.length,
      emergencies: emergencies.length, emergencyShare: pct(emergencies.length, decided.length), informedLate,
      monthly,
      byCategory: group((r) => r.category, (k) => CATEGORY_META[k]?.label || k),
      byFunction: group((r) => r.requestingFunction),
      byLandscape: group((r) => (LANDSCAPES.includes(r.sapSystem) ? r.sapSystem : 'Earlier IT areas')),
      byModule: group((r) => (r.sapModules?.length ? r.sapModules : ['—'])).slice(0, 10),
      completed, attendanceAvg: attendance.length ? Math.round(attendance.reduce((a, b) => a + b, 0) / attendance.length) : null,
      quorumMet: completed.filter((m) => m.membersPresent >= settings.quorum).length,
      actionsOpen: actions.filter((a) => a.status === 'open').length, actionsOverdue: actions.filter(actionOverdue).length,
      actionsOnTime: pct(closedOnTime, closedActs.length), actionsRaised: acts.length,
    };
  }, [data.insights, inPeriod]);

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'No data' }]), name);
      add('Summary', [
        { Measure: 'Period', Value: p.label },
        { Measure: 'Requests logged', Value: x.logged },
        { Measure: 'Decided', Value: x.decided },
        { Measure: 'Approved', Value: x.approved },
        { Measure: 'Rejected', Value: x.rejected },
        { Measure: 'Approval rate %', Value: x.approvalRate ?? '' },
        { Measure: 'Median feasibility review (business days)', Value: x.reviewMedian ?? '' },
        { Measure: `Reviews within ${x.settings.reviewSlaDays} business days %`, Value: x.reviewOnTime ?? '' },
        { Measure: 'Median recommendation to decision (business days)', Value: x.decisionMedian ?? '' },
        { Measure: 'Median submission to decision (business days)', Value: x.endToEndMedian ?? '' },
        { Measure: 'Median decision to delivery (business days)', Value: x.deliveryMedian ?? '' },
        { Measure: 'Emergency approvals', Value: x.emergencies },
        { Measure: 'Emergency approvals informed late', Value: x.informedLate },
        { Measure: 'Meetings held', Value: x.completed.length },
        { Measure: 'Average member attendance %', Value: x.attendanceAvg ?? '' },
        { Measure: 'Action items closed on time %', Value: x.actionsOnTime ?? '' },
      ]);
      const g = (rows) => rows.map((o) => ({ Group: o.label, Logged: o.logged, Approved: o.approved, Rejected: o.rejected, 'Approval rate %': o.rate ?? '', 'Median cycle (business days)': o.cycleMedian ?? '' }));
      add('By category', g(x.byCategory));
      add('By function', g(x.byFunction));
      add('By landscape', g(x.byLandscape));
      add('By area', g(x.byModule));
      add('Monthly', x.monthly.map(([k, v]) => ({ Month: monthLabel(k), Logged: v.logged, Approved: v.approved, Rejected: v.rejected })));
      add('Meetings', x.completed.map((m) => ({ Meeting: m.meetingNo, Date: fmtDate(m.scheduledAt), Items: m.items, Approved: m.approved, Rejected: m.rejected, Deferred: m.deferred, 'Members present': m.membersPresent, Quorum: x.settings.quorum })));
      XLSX.writeFile(wb, `CCB-insights-${p.key}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      showToast('Could not export insights.', 'error');
    }
  }

  if (data.loading) return <Loading />;
  if (data.error) return <Blocker error={data.error} onRetry={load} />;
  const days = (v) => (v === null ? '—' : `${v} d`);
  const maxMonth = Math.max(1, ...x.monthly.map(([, v]) => Math.max(v.logged, v.approved + v.rejected)));

  return (
    <>
      <PageHeader eyebrow="Change Control Board" title="Insights" sub="How the board is performing: throughput, approval rate, cycle times against the Governance targets, meetings and follow-ups.">
        <div className="ccb-chips">
          {PERIODS.map((o) => <button key={o.key} type="button" className={`ccb-chip-toggle${period === o.key ? ' on' : ''}`} onClick={() => setPeriod(o.key)}>{o.label}</button>)}
        </div>
        <Button icon={DownloadIcon} onClick={exportExcel}>Export Excel</Button>
      </PageHeader>

      <div className="ccb-kpis">
        <KpiTile tone="indigo" icon={ClipboardIcon} label="Requests logged" value={x.logged} sub={`${x.decided} decided · ${p.label}`} />
        <KpiTile tone="green" icon={CheckCircleIcon} label="Approval rate" value={x.approvalRate === null ? '—' : `${x.approvalRate}%`} sub={`${x.approved} approved · ${x.rejected} rejected`} />
        <KpiTile tone="amber" icon={ClockIcon} label="Submission to decision" value={days(x.endToEndMedian)} sub="Median, business days" />
        <KpiTile tone="teal" icon={GavelIcon} label="Reviews on time" value={x.reviewOnTime === null ? '—' : `${x.reviewOnTime}%`} sub={`Within ${x.settings.reviewSlaDays} business days · ${x.reviewCount} reviews`} alert={x.reviewOnTime !== null && x.reviewOnTime < 80 ? 'Below 80%' : null} />
        <KpiTile tone="purple" icon={BoltIcon} label="Emergency route" value={x.emergencyShare === null ? '—' : `${x.emergencyShare}%`} sub={`${x.emergencies} of ${x.decided} decisions`} alert={x.informedLate ? `${x.informedLate} informed late` : null} />
      </div>

      <div className="ccb-grid two">
        <Card title="Monthly throughput" sub="Requests logged vs decided each month">
          {x.monthly.length === 0 ? <Empty icon={BarChartIcon} title="No activity in this period" /> : (
            <>
              <div className="ccb-bars">
                {x.monthly.map(([k, v]) => (
                  <div key={k} className="ccb-bar-col" title={`${monthLabel(k)}: ${v.logged} logged, ${v.approved} approved, ${v.rejected} rejected`}>
                    <div className="ccb-bar-pair">
                      <span className="ccb-bar logged" style={{ height: `${(v.logged / maxMonth) * 100}%` }}>{v.logged || ''}</span>
                      <span className="ccb-bar-stack" style={{ height: `${((v.approved + v.rejected) / maxMonth) * 100}%` }}>
                        <span className="ccb-bar rejected" style={{ flex: v.rejected }} />
                        <span className="ccb-bar approved" style={{ flex: v.approved }} />
                      </span>
                    </div>
                    <span className="ccb-bar-lbl">{monthLabel(k)}</span>
                  </div>
                ))}
              </div>
              <div className="ccb-legend">
                <span><i style={{ background: 'var(--st-indigo)' }} /> Logged</span>
                <span><i style={{ background: 'var(--st-green)' }} /> Approved</span>
                <span><i style={{ background: 'var(--st-red)' }} /> Rejected</span>
              </div>
            </>
          )}
        </Card>

        <Card title="Cycle time" sub="Median business days per stage, for requests that passed it in the period">
          <StageBar label="Feasibility review" sub="Submitted → recommended / decided by the IT Application Head" value={x.reviewMedian} target={x.settings.reviewSlaDays} />
          <StageBar label="Board decision" sub="Recommended → decided" value={x.decisionMedian} />
          <StageBar label="Delivery" sub={`Decided → completed in Dev Tracker · ${x.deliveredCount} delivered`} value={x.deliveryMedian} />
          <div className="ccb-callout tone-indigo" style={{ marginTop: 10 }}><ClockIcon size={15} /><span>End to end, a request takes a median of <strong>{days(x.endToEndMedian)}</strong> from submission to decision.</span></div>
        </Card>
      </div>

      <div className="ccb-grid halves" style={{ marginTop: 16 }}>
        <BreakdownCard title="By category" rows={x.byCategory} />
        <BreakdownCard title="By requesting function" rows={x.byFunction} />
      </div>

      <div className="ccb-grid halves" style={{ marginTop: 16 }}>
        <BreakdownCard title="By IT landscape (SAP / Non-SAP)" rows={x.byLandscape} />
        <BreakdownCard title="By area affected (top 10)" rows={x.byModule} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Meetings" sub={`${x.completed.length} held · attendance ${x.attendanceAvg === null ? '—' : `${x.attendanceAvg}%`} · quorum met ${x.quorumMet}/${x.completed.length}`}>
          {x.completed.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No meetings held in this period.</p> : (
            <div className="ccb-table-wrap">
              <table className="ccb-table">
                <thead><tr><th>Meeting</th><th>Items</th><th>Outcome</th><th>Members present</th></tr></thead>
                <tbody>
                  {x.completed.slice().reverse().map((m) => (
                    <tr key={m.id} onClick={() => { window.location.href = meetingLink(m.id); }}>
                      <td className="nowrap"><span className="ccb-key">{m.meetingNo}</span> <small className="ccb-muted">{fmtDate(m.scheduledAt)}</small>{m.isEmergency && <BoltIcon size={11} style={{ color: 'var(--st-red)', marginLeft: 4 }} />}</td>
                      <td>{m.items}</td>
                      <td className="nowrap"><Pill tone="green">{m.approved}</Pill> <Pill tone="red">{m.rejected}</Pill>{m.deferred > 0 && <> <Pill tone="amber">{m.deferred} deferred</Pill></>}</td>
                      <td className="nowrap"><MiniBar value={m.membersPresent} max={Math.max(x.members, 1)} ok={m.membersPresent >= x.settings.quorum} /> {m.membersPresent}/{x.members}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ccb-legend" style={{ marginTop: 10 }}>
            <span><UsersIcon size={12} /> Action items: {x.actionsRaised} raised · {x.actionsOpen} open · {x.actionsOverdue} overdue · closed on time {x.actionsOnTime === null ? '—' : `${x.actionsOnTime}%`}</span>
          </div>
        </Card>
      </div>
      {toast}
    </>
  );
}

function StageBar({ label, sub, value, target }) {
  const max = Math.max(target || 0, value || 0, 1) * 1.25;
  const over = target && value !== null && value > target;
  return (
    <div className="ccb-stage">
      <div className="ccb-stage-top"><strong>{label}</strong><span className={over ? 'over' : ''}>{value === null ? '—' : `${value} d`}{target ? ` · target ${target}` : ''}</span></div>
      <div className="ccb-stage-track">
        <span className={`ccb-stage-fill${over ? ' over' : ''}`} style={{ width: `${value === null ? 0 : Math.min(100, (value / max) * 100)}%` }} />
        {target ? <span className="ccb-stage-target" style={{ left: `${(target / max) * 100}%` }} title={`Target ${target} business days`} /> : null}
      </div>
      <div className="ccb-muted" style={{ fontSize: 11 }}>{sub}</div>
    </div>
  );
}

function MiniBar({ value, max, ok }) {
  return <span className="ccb-minibar"><span style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: ok ? 'var(--st-green)' : 'var(--st-amber)' }} /></span>;
}

function BreakdownCard({ title, rows }) {
  const max = Math.max(1, ...rows.map((r) => r.logged));
  return (
    <Card title={title}>
      {rows.length === 0 ? <p className="ccb-muted" style={{ margin: 0, fontSize: 12.5 }}>No requests in this period.</p> : (
        <div className="ccb-table-wrap">
          <table className="ccb-table">
            <thead><tr><th>Group</th><th style={{ width: '38%' }}>Requests</th><th>Approval</th><th>Median cycle</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.key} style={{ cursor: 'default' }}>
                  <td>{o.label}</td>
                  <td><span className="ccb-hbar"><span style={{ width: `${(o.logged / max) * 100}%` }} /></span> {o.logged}</td>
                  <td className="nowrap">{o.rate === null ? '—' : `${o.rate}%`}</td>
                  <td className="nowrap">{o.cycleMedian === null ? '—' : `${o.cycleMedian} d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
