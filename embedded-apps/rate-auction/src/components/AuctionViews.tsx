'use client';

import React, { useEffect, useState } from 'react';
import {
  Clock, Pause, Play, Plus, Square, Gavel, Trophy, Mail, FileText, Users, ListOrdered, Activity, ScrollText,
  CheckCircle2, AlertTriangle, Eye, Inbox, Send, Database,
} from 'lucide-react';
// Shared with the server so the forms here and the server's checks always agree (see that file).
import { inr, SAP_SPEC, checkSap, MATERIAL_TYPES, suggestRates } from '../../server/src/rules.js';
import type { Result } from '../lib/api';

/* eslint-disable @typescript-eslint/no-explicit-any */
// The live view is built on the server (engine.js adminView/vendorView) and differs per role.
type View = any;
type Act = (action: string, extra?: object) => Promise<Result>;

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const clock = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour12: false });

const STATUS: Record<string, { label: string; classes: string }> = {
  live: { label: 'Live', classes: 'bg-greenBg text-green' },
  paused: { label: 'Paused', classes: 'bg-amberBg text-amber' },
  closed: { label: 'Closed', classes: 'bg-appBg text-inkSoft' },
  awarded: { label: 'Awarded', classes: 'bg-blueBg text-blue' },
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`card p-4 sm:p-5 ${className}`}>{children}</div>;
}

function SectionHead({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rust/10 text-rust"><Icon size={15} /></span>
        <h3 className="section-title">{title}</h3>
      </div>
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'err' | 'info'; children: React.ReactNode }) {
  const c = { ok: 'border-green/30 bg-greenBg text-green', warn: 'border-amber/30 bg-amberBg text-amber', err: 'border-red/30 bg-redBg text-red', info: 'border-blue/30 bg-blueBg text-blue' }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${c}`}>{children}</div>;
}

function ErrText({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-red" role="alert">{children}</p>;
}

function Empty({ icon: Icon, title, hint, children }: { icon: React.ElementType; title: string; hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-white/50 px-4 py-14 text-center">
      <Icon size={30} className="text-inkSoft" />
      <p className="text-base font-extrabold text-ink">{title}</p>
      <p className="hint max-w-md">{hint}</p>
      {children}
    </div>
  );
}

// The material being auctioned: always the first thing on the screen.
function MaterialLine({ view }: { view: View }) {
  const m = view.material;
  const t = MATERIAL_TYPES.find((x) => x.code === m.type);
  return (
    <div className="border-l-4 border-rust pl-3" aria-label="Material being auctioned">
      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft">Auction for</p>
      <p className="text-lg font-extrabold leading-tight text-ink sm:text-xl">{m.desc}</p>
      <p className="mt-0.5 text-xs text-inkSoft"><span className="font-bold text-ink">{m.code}</span> · {t ? t.code + ' – ' + t.name : m.type} · {view.unit}</p>
    </div>
  );
}

function MaterialTag({ view }: { view: View }) {
  return <p className="hint">Material: <span className="font-bold text-ink">{view.material.code}</span> {view.material.desc}</p>;
}

function Clock_({ view }: { view: View }) {
  const urgent = view.status === 'live' && view.remaining <= 30000;
  const s = STATUS[view.status];
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <span className={`pill ${s.classes}`}>{view.status === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />}{s.label}</span>
      <div className={`flex items-center gap-1.5 text-3xl font-extrabold tabular-nums sm:text-4xl ${urgent ? 'text-red' : 'text-ink'}`}>
        <Clock size={20} className={urgent ? 'text-red' : 'text-inkSoft'} />
        {mmss(view.remaining)}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`card p-4 ${highlight ? '!border-amber/50 !bg-amberBg' : ''}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-inkSoft">{sub}</p>}
    </div>
  );
}

// The threshold: the highest rate a vendor may bid, set by the admin when starting the auction.
function ThresholdCard({ view, admin }: { view: View; admin?: boolean }) {
  const t = view.threshold;
  if (t == null) return null;
  let note: string;
  if (admin) {
    const low = view.ladder && view.ladder[0];
    const gap = low ? Math.round((t - low.amount) * 100) / 100 : null;
    note = !low ? 'No bids yet' : gap === 0 ? 'Lowest bid is at the threshold' : 'Lowest bid is ' + inr(gap as number) + ' below it';
  } else {
    const gap = view.myBest != null ? Math.round((t - view.myBest) * 100) / 100 : null;
    note = gap == null ? 'Bid at or below it' : gap === 0 ? 'Your best rate is at it' : 'Your best rate is ' + inr(gap) + ' below it';
  }
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft">Threshold rate · highest bid allowed{admin ? ' (set by you)' : ''}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-ink">{inr(t)}</p>
          <p className="hint">{view.unit}. {admin ? 'The server refuses any bid above it.' : 'Bids above it are refused.'}</p>
        </div>
        <span className="pill bg-greenBg text-green">{note}</span>
      </div>
    </Card>
  );
}

/* ================================================================ vendor ===================== */

export function VendorView({ view, bid }: { view: View; bid: (amount: number | string) => Promise<Result> }) {
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!view) return <p className="hint p-6">Connecting…</p>;
  if (view.status === 'none') return <Empty icon={Gavel} title="No auction is open" hint="You will see the auction here as soon as Central Purchase starts one you are invited to." />;
  if (view.status === 'not-invited') {
    return <Empty icon={Gavel} title="You are not invited to the current auction" hint={`An auction is running for ${view.material.code} ${view.material.desc}, but your email (${view.me}) is not on its vendor list. If you should be, ask Central Purchase to check the mail address on your SAP vendor record.`} />;
  }
  const live = view.status === 'live';

  async function submit(amount: number | string) {
    setBusy(true);
    const r = await bid(amount);
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: 'Bid placed at ' + inr(Number(amount)) } : { ok: false, t: r.error || 'Bid refused.' });
    if (r.ok) setVal('');
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <MaterialLine view={view} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="pill bg-rust/10 text-rust">{view.auctionType}</span>
            <h2 className="mt-2 text-xl font-extrabold text-ink">You are {view.alias}</h2>
            <p className="hint">{view.invited} vendors invited. Other bidders stay anonymous.</p>
          </div>
          <Clock_ view={view} />
        </div>
      </Card>

      {view.result && <Banner tone={view.result === 'won' ? 'ok' : 'info'}>{view.result === 'won' ? 'You won this auction at ' + inr(view.myBest) + '.' : 'This auction was awarded to another vendor.'}</Banner>}

      <ThresholdCard view={view} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Your rank" value={view.myRank ? '#' + view.myRank : 'No bid yet'} highlight={view.leading}
          sub={view.myRank ? (view.leading ? 'You have the lowest rate' : 'Another bidder is ahead') : 'Place a bid to get ranked'} />
        <Stat label="Your best rate" value={view.myBest ? inr(view.myBest) : '—'} sub={view.lowest ? 'Lowest in auction: ' + inr(view.lowest) : 'Lowest rate is hidden'} />
      </div>

      <Card>
        <label htmlFor="bid" className="field-label">Your next bid ({view.unit}). Bid {inr(view.nextMax)} or lower.</label>
        <div className="flex gap-2">
          <input id="bid" className="input" type="number" step="any" inputMode="decimal" value={val} disabled={!live}
            placeholder={String(view.nextMax)} onChange={(e) => setVal(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={!live || busy || !val} onClick={() => submit(val)}><Gavel size={15} />Place bid</button>
        </div>
        <button className="btn-ghost mt-2 w-full" disabled={!live || busy} onClick={() => submit(view.nextMax)}>Bid {inr(view.nextMax)}</button>
        {msg && <p className={`mt-2 text-sm font-semibold ${msg.ok ? 'text-green' : 'text-red'}`} role="status">{msg.t}</p>}
        {!live && <p className="hint mt-2">{view.status === 'paused' ? 'Central Purchase paused bidding.' : 'Bidding has ended.'}</p>}
      </Card>

      {view.inbox && view.inbox.length > 0 && (
        <Card>
          <SectionHead icon={Inbox} title="Messages from Emami" />
          {view.inbox.map((m: any, i: number) => (
            <details key={i} className="border-t border-border py-2 first:border-t-0" open>
              <summary className="cursor-pointer text-sm font-bold text-ink">{m.subject}</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-appBg p-3 font-sans text-xs text-inkSoft">{m.body}</pre>
            </details>
          ))}
        </Card>
      )}

      <Card>
        <SectionHead icon={ListOrdered} title="Your bids" />
        {view.myBids.length === 0 ? <p className="hint">No bids yet.</p> : (
          <ul className="divide-y divide-border">
            {view.myBids.map((b: any) => (
              <li key={b.id} className="flex justify-between py-2 text-sm"><span className="font-bold tabular-nums text-ink">{inr(b.amount)}</span><span className="text-inkSoft tabular-nums">{clock(b.at)}</span></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ================================================================ admin ====================== */

type Loaders = {
  loadMaterials: (type: string) => Promise<any>;
  loadRate: (code: string) => Promise<any>;
  loadVendors: (term: string) => Promise<any>;
};

export function AdminView({ view, act, ...loaders }: { view: View; act: Act } & Loaders) {
  const [creating, setCreating] = useState(false);
  if (!view) return <p className="hint p-6">Connecting…</p>;
  if (view.status === 'none') {
    return (
      <div className="flex flex-col gap-4">
        <PersistBanner view={view} />
        {creating ? <CreateAuction view={view} act={act} {...loaders} onDone={() => setCreating(false)} /> : (
          <Empty icon={Gavel} title="No auction is open" hint="Start one by choosing the material and the vendors to invite.">
            <button className="btn-primary mt-2" onClick={() => setCreating(true)}><Plus size={15} />New auction</button>
          </Empty>
        )}
      </div>
    );
  }
  const lowest = view.ladder[0];
  const running = view.status === 'live' || view.status === 'paused';
  return (
    <div className="flex flex-col gap-4">
      <PersistBanner view={view} />
      <Card>
        <MaterialLine view={view} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="pill bg-rust/10 text-rust">{view.auctionType}</span>
            <h2 className="mt-2 text-xl font-extrabold text-ink">{lowest ? 'Lowest: ' + inr(lowest.amount) : 'No bids yet'}</h2>
            <p className="hint">
              {lowest ? lowest.name + ' (' + lowest.alias + ')' : 'Highest bid allowed ' + inr(view.threshold)} · {view.totalBids} bids · extended {view.extensions}/{view.maxExt}
            </p>
          </div>
          <Clock_ view={view} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {view.status === 'live' && <button className="btn-ghost" onClick={() => act('pause')}><Pause size={15} />Pause</button>}
          {view.status === 'paused' && <button className="btn-primary" onClick={() => act('resume')}><Play size={15} />Resume</button>}
          {running && <button className="btn-ghost" onClick={() => act('extend')}><Plus size={15} />Add 1 min</button>}
          {running && <button className="btn-danger" onClick={() => act('close')}><Square size={14} />Close now</button>}
          <button className="btn-ghost" onClick={() => setCreating(true)}><Gavel size={15} />New auction</button>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rust" checked={view.showLowest} onChange={() => act('toggleLowest')} />
          <span><Eye size={13} className="mr-1 inline text-inkSoft" />Let vendors see the lowest rate (otherwise they see only their own rank)</span>
        </label>
        {view.winner && (
          <div className="mt-3">
            <Banner tone="ok">
              Awarded to {view.winner.name} ({view.winner.alias}) at {inr(view.winner.amount)}.{' '}
              {view.winner.lowest ? 'Lowest valid bid.' : 'Not the lowest bid. Reason: ' + view.winner.reason}
            </Banner>
          </div>
        )}
      </Card>

      <ThresholdCard view={view} admin />

      {creating && <CreateAuction view={view} act={act} {...loaders} onDone={() => setCreating(false)} />}
      {view.status === 'closed' && <AwardPanel view={view} act={act} />}
      {view.status === 'awarded' && <SapPanel view={view} act={act} />}
      {view.status === 'awarded' && <MailPanel view={view} act={act} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHead icon={ListOrdered} title="Bid ladder" hint="Real names for you; vendors only see the alias." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-inkSoft">
                  <th className="py-2 pr-2">Rank</th><th className="py-2 pr-2">Vendor</th><th className="py-2 pr-2">Alias</th><th className="py-2 pr-2 text-right">Best rate</th><th className="py-2 text-right">Bids</th>
                </tr>
              </thead>
              <tbody>
                {view.ladder.map((r: any) => (
                  <tr key={r.vid} className={`border-t border-border ${r.rank === 1 ? 'bg-amberBg font-bold' : ''}`}>
                    <td className="py-2 pr-2">{r.rank === 1 ? <Trophy size={14} className="text-amber" /> : r.rank}</td>
                    <td className="py-2 pr-2 whitespace-nowrap text-ink">{r.name}</td>
                    <td className="py-2 pr-2 text-inkSoft">{r.alias}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{inr(r.amount)}</td>
                    <td className="py-2 text-right tabular-nums">{r.count}</td>
                  </tr>
                ))}
                {view.noBid.map((r: any) => (
                  <tr key={r.alias} className="border-t border-border text-inkSoft opacity-70">
                    <td className="py-2 pr-2">–</td><td className="py-2 pr-2 whitespace-nowrap">{r.name}</td><td className="py-2 pr-2">{r.alias}</td><td className="py-2 pr-2 text-right">No bid</td><td className="py-2 text-right">0</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHead icon={Activity} title="Live bids" />
          {view.feed.length === 0 ? <p className="hint">Waiting for the first bid.</p> : (
            <ul className="divide-y divide-border">
              {view.feed.slice(0, 12).map((b: any) => (
                <li key={b.id} className={`flex items-center justify-between gap-2 py-2 text-sm ${b.void ? 'opacity-50' : ''}`}>
                  <span className="min-w-0">
                    <span className="font-bold tabular-nums text-ink">{b.void ? <s>{inr(b.amount)}</s> : inr(b.amount)}</span>{' '}
                    <span className="text-inkSoft">{b.name} ({b.alias})</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs tabular-nums text-inkSoft">{clock(b.at)}</span>
                    {!b.void && view.status !== 'awarded' && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => act('void', { bidId: b.id })}>Void</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <SectionHead icon={ScrollText} title="Audit log" />
        <ul className="divide-y divide-border">
          {view.log.slice(0, 12).map((l: any) => (
            <li key={l.id} className="flex justify-between gap-3 py-2 text-sm"><span className="text-ink">{l.text}</span><span className="shrink-0 text-xs tabular-nums text-inkSoft">{clock(l.at)}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function AwardPanel({ view, act }: { view: View; act: Act }) {
  const [sel, setSel] = useState<string | null>(view.ladder[0] ? view.ladder[0].vid : null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!view.ladder.length) {
    return <Card><SectionHead icon={Trophy} title="Award" hint="No valid bids, so there is nothing to award. Start a new auction." /></Card>;
  }
  const low = view.ladder[0].amount;
  const pick = view.ladder.find((r: any) => r.vid === sel);
  const notLowest = pick && pick.amount !== low;
  async function confirm() {
    const r = await act('award', { vid: sel, reason });
    if (r && !r.ok) setErr(r.error || 'Could not award.');
  }
  return (
    <Card>
      <SectionHead icon={Trophy} title="Award decision" hint="You can award any bidder. The lowest bid is not always the right choice. If you pick another bidder, a reason is required and goes into the audit trail." />
      <MaterialTag view={view} />
      <div role="radiogroup" aria-label="Select vendor to award" className="mt-3 flex flex-col gap-2">
        {view.ladder.map((r: any) => (
          <label key={r.vid} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${sel === r.vid ? 'border-rust bg-rust/5' : 'border-border hover:bg-appBg'}`}>
            <input type="radio" name="award" className="h-4 w-4 accent-rust" checked={sel === r.vid} onChange={() => { setSel(r.vid); setErr(null); }} />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-bold text-ink">#{r.rank} {r.name}</span> <span className="text-xs text-inkSoft">({r.alias}, SAP {r.sapCode})</span>
            </span>
            <span className="text-sm font-bold tabular-nums text-ink">{inr(r.amount)}{r.amount > low && <span className="text-xs font-semibold text-inkSoft"> +{inr(r.amount - low)}</span>}</span>
          </label>
        ))}
      </div>
      {notLowest && (
        <div className="mt-3">
          <label htmlFor="why" className="field-label">Reason for not awarding the lowest bidder (required)</label>
          <textarea id="why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. better transit time, safety record, capacity" />
        </div>
      )}
      {err && <div className="mt-2"><ErrText>{err}</ErrText></div>}
      <button className="btn-primary mt-3" onClick={confirm}><CheckCircle2 size={15} />Confirm award to {pick ? pick.name : '…'}</button>
    </Card>
  );
}

function Field({ f, form, set, bad }: { f: any; form: any; set: (k: string, v: string) => void; bad: boolean }) {
  const v = form[f.key] ?? '';
  const id = 'f-' + f.key;
  const req = typeof f.req === 'function' ? f.req(form) : f.req;
  return (
    <div>
      <label htmlFor={id} className="field-label">{f.label}{req ? ' *' : ''}</label>
      {f.type === 'select' ? (
        <select id={id} className={`input ${bad ? '!border-amber' : ''}`} value={v} onChange={(e) => set(f.key, e.target.value)}>
          {f.options.map((o: string) => <option key={o} value={o}>{o || 'Select…'}</option>)}
        </select>
      ) : (
        <input id={id} className={`input ${bad ? '!border-amber' : ''}`} type={f.type || 'text'} value={v} readOnly={f.ro} disabled={f.ro} onChange={(e) => set(f.key, e.target.value)} />
      )}
    </div>
  );
}

type SapKind = keyof typeof SAP_SPEC;

function SapPanel({ view, act }: { view: View; act: Act }) {
  const [kind, setKind] = useState<SapKind>('inforecord');
  const [forms, setForms] = useState<Record<SapKind, any>>(() => ({ inforecord: view.sapDefaults.inforecord, contract: view.sapDefaults.contract }));
  const [err, setErr] = useState<string | null>(null);
  const [docNo, setDocNo] = useState('');
  const spec = SAP_SPEC[kind];
  const form = forms[kind];
  const chk = checkSap(kind, form);
  const doc = view.sap.find((d: any) => d.kind === kind);
  const unk = (view.sapUnknown || []).find((u: any) => u.kind === kind);
  const set = (k: string, v: string) => setForms((f) => ({ ...f, [kind]: { ...f[kind], [k]: v } }));
  async function create() {
    const r = await act('createSap', { kind, form });
    setErr(r && !r.ok ? r.error || 'SAP request failed.' : null);
  }
  const missingKeys = new Set(spec.fields.filter((f: any) => {
    const req = typeof f.req === 'function' ? f.req(form) : f.req;
    return req && String(form[f.key] ?? '').trim() === '';
  }).map((f: any) => f.key));
  return (
    <Card>
      <SectionHead icon={Database} title="Create in SAP" hint={`Based on the awarded rate of ${inr(view.winner.amount)} for ${view.winner.name}. Vendor, price and currency always come from the award.`} />
      <MaterialTag view={view} />
      <div className="mt-3 mb-3 flex w-fit gap-1 rounded-2xl bg-appBg p-1" role="tablist">
        {(Object.entries(SAP_SPEC) as [SapKind, any][]).map(([k, sp]) => (
          <button key={k} role="tab" aria-selected={kind === k}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors ${kind === k ? 'bg-white text-rust shadow-card' : 'text-inkSoft hover:text-ink'}`}
            onClick={() => { setKind(k); setErr(null); }}>
            {sp.title} ({sp.tcode}){view.sap.some((d: any) => d.kind === k) ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {unk && !doc ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber/30 bg-amberBg p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber"><AlertTriangle size={15} />SAP did not answer for this {spec.title.toLowerCase()}.</p>
          <p className="text-xs text-ink">It may already exist. Look in SAP ({spec.tcode === 'ME11' ? 'ME13' : 'ME33K'}) for this vendor and material before doing anything else.</p>
          <div className="flex flex-wrap gap-2">
            <input className="input flex-1" aria-label="SAP document number" placeholder="Document number found in SAP" value={docNo} onChange={(e) => setDocNo(e.target.value)} />
            <button className="btn-primary" disabled={!docNo} onClick={async () => { const r = await act('resolveSap', { kind, docNo }); setErr(r && !r.ok ? r.error || 'Failed.' : null); }}>Record it</button>
          </div>
          <div><button className="btn-ghost" onClick={() => act('resolveSap', { kind })}>It is not in SAP: allow a retry</button></div>
          {err && <ErrText>{err}</ErrText>}
        </div>
      ) : doc ? (
        <Banner tone="ok">{spec.title} <strong>{doc.docNo}</strong> created in SAP ({spec.tcode}).</Banner>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink">
            <strong>{chk.done} of {chk.total}</strong> required fields complete.
            {chk.missing.length > 0 && <span className="text-inkSoft"> Still needed: {chk.missing.join(', ')}.</span>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spec.fields.map((f: any) => <Field key={f.key} f={f} form={form} set={set} bad={missingKeys.has(f.key)} />)}
          </div>
          {chk.errors.map((e: string) => <p key={e} className="mt-2 text-sm font-semibold text-red">{e}</p>)}
          {err && <div className="mt-2"><ErrText>{err}</ErrText></div>}
          <button className="btn-primary mt-3" disabled={chk.missing.length > 0 || chk.errors.length > 0} onClick={create}><FileText size={15} />Create {spec.title.toLowerCase()} in SAP</button>
        </>
      )}
    </Card>
  );
}

function MailPanel({ view, act }: { view: View; act: Act }) {
  const [off, setOff] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const unsent = view.mails.filter((m: any) => !m.sent);
  const chosen: string[] = unsent.filter((m: any) => !off.includes(m.id)).map((m: any) => m.id);
  const toggle = (id: string) => setOff((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  async function send() {
    const r = await act('sendMail', { ids: chosen, note });
    setErr(r && !r.ok ? r.error || 'Could not send.' : null);
  }
  return (
    <Card>
      <SectionHead icon={Mail} title="Send result mails" hint="Choose who to notify. Vendors who did not win get the result only: no winner name and no other vendor's rate. Mail is not sent outside this app yet: vendors see it in their Rate Auction inbox." />
      <MaterialTag view={view} />
      <div className="mt-3 flex flex-col">
        {view.mails.map((m: any) => (
          <div key={m.id} className="border-t border-border py-2.5 first:border-t-0">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rust" disabled={m.sent} checked={!m.sent && !off.includes(m.id)} onChange={() => toggle(m.id)} />
              <span className="min-w-0 flex-1"><strong className="text-ink">{m.group}:</strong> {m.toName} <span className="text-inkSoft">&lt;{m.to}&gt;</span>{m.sent && <span className="ml-1 font-bold text-green">Sent</span>}</span>
            </label>
            <details className="ml-6 mt-1">
              <summary className="cursor-pointer text-xs font-semibold text-inkSoft">{m.subject}</summary>
              <pre className="mt-1.5 whitespace-pre-wrap rounded-xl bg-appBg p-3 font-sans text-xs text-inkSoft">{m.body}</pre>
            </details>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <label htmlFor="note" className="field-label">Optional note added to every mail</label>
        <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please share your GST and bank details by Friday" />
      </div>
      {err && <div className="mt-2"><ErrText>{err}</ErrText></div>}
      <button className="btn-primary mt-3" disabled={!chosen.length} onClick={send}><Send size={15} />Send selected ({chosen.length})</button>
      {view.outbox.length > 0 && (
        <div className="mt-4">
          <p className="field-label">Sent mail</p>
          <ul className="divide-y divide-border">
            {view.outbox.map((m: any, i: number) => (
              <li key={i} className="flex justify-between gap-3 py-2 text-sm"><span>{m.subject} <span className="text-xs text-inkSoft">to {m.toName}</span></span><span className="shrink-0 text-xs tabular-nums text-inkSoft">{clock(m.at)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function CreateAuction({ view, act, loadMaterials, loadRate, loadVendors, onDone }: { view: View; act: Act; onDone: () => void } & Loaders) {
  const [type, setType] = useState('');
  const [list, setList] = useState<null | 'loading' | any[]>(null);
  const [q, setQ] = useState('');
  const [mat, setMat] = useState<any>(null);
  const [f, setF] = useState({ ceiling: '', decrement: '', minutes: '5', threshold: '' });
  const [err, setErr] = useState<string | null>(null);
  const [vq, setVq] = useState('');
  const [vlist, setVlist] = useState<any[]>([]);
  const [vsel, setVsel] = useState<Record<string, any>>({}); // code -> vendor, kept while searching
  const [vload, setVload] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setVload(true);
    const t = setTimeout(() => {
      loadVendors(vq).then((d) => {
        if (!live) return;
        setVload(false);
        if (d.error) { setErr(d.error); return; }
        setVlist(d.vendors);
        if (vq === '' && d.vendors.length) setVsel((cur) => (Object.keys(cur).length ? cur : Object.fromEntries(d.vendors.map((v: any) => [v.code, v]))));
      });
    }, vq ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [vq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!type) { setList(null); return; }
    let live = true;
    setList('loading'); setMat(null); setQ('');
    loadMaterials(type).then((d) => { if (!live) return; if (d.error) { setErr(d.error); setList(null); } else setList(d.materials); });
    return () => { live = false; };
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVendor = (v: any) => setVsel((cur) => { const n = { ...cur }; if (n[v.code]) delete n[v.code]; else n[v.code] = v; return n; });
  const vcount = Object.keys(vsel).length;

  async function pickMaterial(m: any) {
    setErr(null);
    let rate = m.lastRate;
    if (rate == null) { try { rate = (await loadRate(m.code)).lastRate; } catch { rate = null; } }
    const full = { ...m, lastRate: rate };
    setMat(full);
    const sug = suggestRates(full);
    setF((x) => ({ ...x, ceiling: String(sug.ceiling), decrement: String(sug.decrement), threshold: full.lastRate != null ? String(full.lastRate) : '' }));
  }
  const shown = Array.isArray(list) ? list.filter((m) => (m.code + ' ' + m.desc).toLowerCase().includes(q.toLowerCase())) : [];
  const offList = Object.values(vsel).filter((v: any) => !vlist.some((x) => x.code === v.code));

  async function start() {
    setBusy(true);
    const r = await act('create', { materialType: type, materialCode: mat && mat.code, vendorCodes: Object.keys(vsel), ...f });
    setBusy(false);
    if (r && !r.ok) setErr(r.error || 'Could not start the auction.'); else onDone();
  }

  return (
    <Card>
      <SectionHead icon={Gavel} title="New auction" hint="Pick the material type, then the material to be auctioned, then the vendors to invite. Materials and vendors are read from SAP." />
      {(view.status === 'live' || view.status === 'paused') && <div className="mb-3"><Banner tone="warn">Starting a new auction replaces the one that is running now.</Banner></div>}
      <div className="flex flex-col gap-4">
        <div className="max-w-sm">
          <label htmlFor="mtype" className="field-label">Material type *</label>
          <select id="mtype" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Select…</option>
            {MATERIAL_TYPES.map((t) => <option key={t.code} value={t.code}>{t.code} – {t.name}</option>)}
          </select>
        </div>
        {list === 'loading' && <p className="hint" role="status">Reading materials from SAP…</p>}
        {Array.isArray(list) && (
          <div>
            <label htmlFor="msearch" className="field-label">Material * ({list.length} found, search by code or description)</label>
            <input id="msearch" className="input mb-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
            <div role="radiogroup" aria-label="Materials from SAP" className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {shown.length === 0 && <p className="hint">No material matches.</p>}
              {shown.map((m) => (
                <label key={m.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-sm transition-colors ${mat && mat.code === m.code ? 'border-rust bg-rust/5' : 'border-border hover:bg-appBg'}`}>
                  <input type="radio" name="mat" className="h-4 w-4 accent-rust" checked={!!mat && mat.code === m.code} onChange={() => pickMaterial(m)} />
                  <span className="min-w-0 flex-1"><strong className="text-ink">{m.code}</strong> {m.desc}</span>
                  <span className="shrink-0 text-xs text-inkSoft">{m.uom}{m.lastRate != null ? ' · last ' + inr(m.lastRate) : ''}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {mat && (
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div><label htmlFor="c-ceil" className="field-label">Ceiling / reference rate (₹ per {mat.uom}) *</label><input id="c-ceil" className="input" type="number" step="any" value={f.ceiling} onChange={(e) => setF({ ...f, ceiling: e.target.value })} /></div>
              <div><label htmlFor="c-dec" className="field-label">Minimum decrement *</label><input id="c-dec" className="input" type="number" step="any" value={f.decrement} onChange={(e) => setF({ ...f, decrement: e.target.value })} /></div>
              <div><label htmlFor="c-thr" className="field-label">Threshold rate (highest bid allowed) *</label><input id="c-thr" className="input" type="number" step="any" value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} /></div>
              <div><label htmlFor="c-min" className="field-label">Duration (minutes) *</label><input id="c-min" className="input" type="number" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
            </div>
            <p className="hint mt-2"><strong>Threshold</strong> is the highest rate a vendor can bid: the server refuses anything above it, and vendors see it. The <strong>ceiling</strong> is only the reference for measuring savings and is not shown to vendors. {mat.lastRate != null ? 'Suggested from the last purchase rate of ' + inr(mat.lastRate) + ': ceiling about 5% above it, decrement about 0.5%. You can change both.' : 'No last purchase rate found in SAP for this material. Enter the ceiling and decrement yourself.'}</p>
          </div>
        )}
        <div>
          <label htmlFor="vsearch" className="field-label"><Users size={12} className="mr-1 inline" />Invite vendors * ({vcount} selected, at least 2). Search the SAP vendor master by name, 3 letters or more.</label>
          <input id="vsearch" className="input mb-2" value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Vendor name" />
          {vload && <p className="hint" role="status">Reading vendors from SAP…</p>}
          <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto" role="group" aria-label="Vendors from SAP">
            {!vload && vlist.length === 0 && <p className="hint">{vq.length > 0 && vq.length < 3 ? 'Type at least 3 letters.' : vq ? 'No vendor found.' : 'Search by name to find vendors.'}</p>}
            {vlist.map((v) => (
              <label key={v.code} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-sm transition-colors ${vsel[v.code] ? 'border-rust bg-rust/5' : 'border-border hover:bg-appBg'}`}>
                <input type="checkbox" className="h-4 w-4 accent-rust" checked={!!vsel[v.code]} onChange={() => toggleVendor(v)} />
                <span className="min-w-0 flex-1"><strong className="text-ink">{v.name}</strong> <span className="text-xs text-inkSoft">SAP {v.code}</span></span>
                <span className="shrink-0 truncate text-xs text-inkSoft">{v.email || 'no mail address'}</span>
              </label>
            ))}
          </div>
          {offList.length > 0 && <p className="hint mt-1.5">Also selected: {offList.map((v: any) => v.name).join(', ')}</p>}
          <p className="hint mt-1.5">Each vendor bids by signing in to Emami Apps with the mail address on their SAP vendor record, and needs the <strong>User</strong> role on Rate Auction in Manage Access.</p>
        </div>
        {err && <ErrText>{err}</ErrText>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !mat || !f.ceiling || !f.decrement || !f.threshold || vcount < 2} onClick={start}><Play size={15} />Start reverse auction</button>
          <button className="btn-ghost" onClick={onDone}>Cancel</button>
        </div>
      </div>
    </Card>
  );
}

function PersistBanner({ view }: { view: View }) {
  const p = view.persist;
  if (!p || !p.enabled) return null;
  if (p.lastError) return <Banner tone="warn">Not saved in SAP yet: {p.lastError}. Retrying every second. Bidding continues.</Banner>;
  return <p className="hint" role="status">{p.pending ? 'Saving to SAP…' : 'All changes are saved in SAP.'}</p>;
}
