'use client';
import { Fragment, useMemo, useState } from 'react';
import { Check, RotateCcw, Search, Send, ThumbsDown } from 'lucide-react';
import { Button, Card, Field, Pill, Spinner, cx, inputCls } from '../ui';
import { CatBadge, ErrorBox, NO_RECORDS, OkBox, SkeletonRows, SourceChip, StatusBadge, errorText, td, th } from './shared';
import { fetchRates, postAction } from '@/lib/budgetMgmt/api';
import { ACTION_FROM, csvList, rateBreakup, readBPriority, showDate, stripZeros, validateAction } from '@/lib/budgetMgmt/rules';
import { COUNTRIES, STATUS_LABEL, type BudRateRow, type RateAction } from '@/lib/budgetMgmt/types';
import { fmtNum } from '@/lib/format';

const DONE: Record<RateAction, string> = { SUBMIT: 'SUBMITTED', APPROVE: 'APPROVED', REJECT: 'REJECTED', REVISE: 'REVISED' };

/** `email` is the hub session email: SAP decides who may submit / approve by it (ZBOM_BUD_AUTH), so it is not editable here. */
export default function ReviewTab({ gjahr, email }: { gjahr: string; email: string }) {
  const [land1, setLand1] = useState('IN');
  const [year, setYear] = useState(gjahr);
  const [mats, setMats] = useState('');
  const [plants, setPlants] = useState('');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [errs, setErrs] = useState<{ email?: string; reason?: string; gjahr?: string; land1?: string }>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('S');
  const [rows, setRows] = useState<BudRateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [yearShown, setYearShown] = useState(gjahr);
  if (yearShown !== gjahr) { setYearShown(gjahr); setYear(gjahr); }

  async function loadReview(y = year, l = land1, s = status) {
    if (!/^\d{4}$/.test(y)) return setErrs({ gjahr: 'Year must be 4 digits' });
    setLoading(true); setLoadErr('');
    try { setRows(await fetchRates({ gjahr: y, land1: l, status: s, matnr: csvList(mats), werks: csvList(plants) })); } catch (x) { setRows(null); setLoadErr(errorText(x)); }
    setLoading(false);
  }

  async function act(action: RateAction) {
    const p = { action, gjahr: year, land1, matnrCsv: csvList(mats).join(','), werksCsv: csvList(plants).join(','), reason, email };
    const e = validateAction(p);
    setErrs(e);
    if (Object.keys(e).length) return;
    if (!p.matnrCsv && !p.werksCsv && !window.confirm(`${action} ALL ${ACTION_FROM[action].from === 'D' ? 'draft' : 'matching'} rates of ${land1} ${year} (no material or plant given)?`)) return;
    setBusy(true); setOk(''); setErr('');
    try {
      const r = await postAction(p);
      setOk(`${r.RowsActed} records ${DONE[action]} successfully${r.Message ? ` — ${r.Message}` : ''}`);
      setRejecting(false); setReason('');
      await loadReview();
    } catch (x) { setErr(errorText(x)); }
    setBusy(false);
  }

  const buttons: { a: RateAction; label: string; hint: string; icon: typeof Send }[] = [
    { a: 'SUBMIT', label: 'Submit', hint: 'D→S', icon: Send }, { a: 'APPROVE', label: 'Approve', hint: 'S→A', icon: Check },
    { a: 'REJECT', label: 'Reject', hint: 'S→R', icon: ThumbsDown }, { a: 'REVISE', label: 'Revise', hint: 'R→V', icon: RotateCcw },
  ];
  const [prio] = useState<string[]>(readBPriority);
  const shown = useMemo(() => [...(rows ?? [])].sort((a, b) => (a.Matcat || 'Z').localeCompare(b.Matcat || 'Z')), [rows]);

  return (
    <div className="flex flex-col gap-3">
      <Card title="Action panel">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Country" error={errs.land1}>{(id) => <select id={id} className={inputCls} value={land1} onChange={(e) => setLand1(e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Year" error={errs.gjahr}>{(id) => <input id={id} className={cx(inputCls, errs.gjahr && 'border-bad')} inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} />}</Field>
          <Field label="Materials" hint="Comma separated, blank = all">{(id) => <input id={id} className={inputCls} value={mats} onChange={(e) => setMats(e.target.value)} />}</Field>
          <Field label="Plants" hint="Comma separated, blank = all">{(id) => <input id={id} className={inputCls} value={plants} onChange={(e) => setPlants(e.target.value)} />}</Field>
          <Field label="Your email" error={errs.email} hint="Your sign-in; SAP checks your rights by it">{(id) => <input id={id} className={cx(inputCls, 'bg-sunken')} value={email} readOnly />}</Field>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {buttons.map(({ a, label, hint, icon: Icon }) => (
            <Button key={a} variant={a === 'APPROVE' ? 'primary' : a === 'REJECT' ? 'danger' : 'secondary'} disabled={busy} className="h-12 flex-col gap-0"
              onClick={() => (a === 'REJECT' ? (setRejecting(true), setErrs({})) : void act(a))}>
              <span className="flex items-center gap-1.5">{busy ? <Spinner /> : <Icon size={14} />} {label}</span><span className="text-2xs font-normal opacity-70">({hint})</span>
            </Button>
          ))}
        </div>
        {rejecting && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
            <Field label="Reason" error={errs.reason}>{(id) => <input id={id} className={cx(inputCls, errs.reason && 'border-bad')} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}</Field>
            <div className="flex gap-2"><Button variant="danger" size="sm" disabled={busy} onClick={() => void act('REJECT')}>Confirm Reject</Button><Button size="sm" disabled={busy} onClick={() => { setRejecting(false); setReason(''); setErrs({}); }}>Cancel</Button></div>
          </div>
        )}
        {ok && <div className="mt-3"><OkBox>✅ {ok}</OkBox></div>}
        {err && <div className="mt-3"><ErrorBox>❌ {err}</ErrorBox></div>}
      </Card>

      <Card title="Rates for review (read-only)" actions={
        <>
          <select className={cx(inputCls, 'w-44')} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select>
          <Button size="sm" variant="primary" disabled={loading} onClick={() => void loadReview()}>{loading ? <Spinner /> : <Search size={13} />} Load for review</Button>
        </>
      } bodyClass="p-0">
        {loadErr && <div className="p-3"><ErrorBox>{loadErr}</ErrorBox></div>}
        {rows && rows.length === 0 && !loadErr && <p className="py-6 text-center text-sm text-muted">{NO_RECORDS}</p>}
        {(loading || shown.length > 0) && (
          <div className="max-h-[60vh] overflow-auto">
            <div className="px-3 py-2"><Pill tone="accent">{shown.length} rows</Pill></div>
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10 bg-sunken">
                <tr><th className={th}>Material</th><th className={th}>Plant</th><th className={th}>Cat</th><th className={th}>Source</th><th className={cx(th, 'text-right')}>Derived</th><th className={th}>Rule &amp; breakup</th><th className={cx(th, 'text-right')}>Override</th><th className={cx(th, 'text-right')}>Landed</th><th className={th}>Status</th>
                  <th className={th}>Submitted by / on</th><th className={th}>Approved by / on</th><th className={th}>Rejected by / reason</th></tr>
              </thead>
              {loading ? <SkeletonRows cols={12} /> : (
                <tbody>{shown.map((r, i) => { const bu = rateBreakup(r, prio); return (
                  <Fragment key={`${r.Matnr}|${r.Werks}|${r.ValidFrom}`}>
                  {(i === 0 || shown[i - 1].Matcat !== r.Matcat) && <tr className="bg-sunken/60"><td colSpan={12} className="px-2 py-1 text-xs font-bold"><CatBadge cat={r.Matcat} /> Category {r.Matcat || '—'}</td></tr>}
                  <tr className="border-b border-line/60">
                    <td className={cx(td, 'num')}>{stripZeros(r.Matnr)}</td><td className={td}>{r.Werks}</td><td className={td}><CatBadge cat={r.Matcat} /></td><td className={td}><SourceChip src={r.RateSrc} /></td>
                    <td className={cx(td, 'num text-right')}>{fmtNum(r.DerivedRate, 4)}</td>
                    <td className="min-w-64 px-2 py-1.5 text-2xs"><div className="font-bold">{bu.rule}</div><div className="num text-muted">{bu.steps.map((x) => `${x.k} ${fmtNum(x.v, 3)}`).join(' → ')}</div></td>
                    <td className={cx(td, 'num text-right')}>{r.OverrideRate ? fmtNum(r.OverrideRate, 4) : '—'}</td>
                    <td className={cx(td, 'num text-right font-extrabold')}>{fmtNum(r.LandedRate, 4)}</td><td className={td}><StatusBadge status={r.ApprStatus} /></td>
                    <td className={td}>{r.SubmittedBy ? `${r.SubmittedBy} ${showDate(r.SubmittedOn)}` : '—'}</td><td className={td}>{r.ApprovedBy ? `${r.ApprovedBy} ${showDate(r.ApprovedOn)}` : '—'}</td>
                    <td className={td}>{r.RejectedBy ? `${r.RejectedBy}${r.RejectionRsn ? ` — ${r.RejectionRsn}` : ''}` : '—'}</td>
                  </tr></Fragment>); })}</tbody>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
