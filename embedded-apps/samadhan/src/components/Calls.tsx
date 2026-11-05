'use client';
import { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneCall, PhoneIncoming, X } from 'lucide-react';
import { logCall } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { CallMode, Ticket } from '@/lib/types';
import { Button, Field, Modal, Notice, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

/** Where the Call button dials: the PC's phone app / softphone (tel:), or Microsoft Teams calling. */
function dialUrl(phone: string, mode: CallMode): string {
  const n = phone.replace(/[^\d+]/g, '');
  return mode === 'teams' ? `https://teams.microsoft.com/l/call/0/0?users=4:${encodeURIComponent(n)}` : `tel:${n}`;
}

/** Every number we know for the requester on this ticket, once each. */
function numbersOf(t: Ticket): { label: string; phone: string }[] {
  const seen = new Set<string>();
  const out: { label: string; phone: string }[] = [];
  for (const [label, v] of [['Requester', t.requesterMobile || t.requesterPhone], ['Mobile', t.mobileNo], ['Alternate', t.alternateMobileNo], ['Caller', t.callerContactNumber]] as const) {
    const phone = String(v ?? '').trim();
    const key = phone.replace(/\D/g, '').slice(-10);
    if (phone && key.length >= 6 && !seen.has(key)) { seen.add(key); out.push({ label, phone }); }
  }
  return out;
}

type Form = { phone: string; direction: 'OUTBOUND' | 'INBOUND'; outcome: string; durationMins: string; notes: string };

/**
 * Call the requester from the ticket: the number dials through tel: or Teams, a timer runs while the agent is on the
 * call, and "Log call" records the outcome, length and notes on the ticket (shown in the conversation and activity).
 */
export function CallPanel({ ticket: t, reload }: { ticket: Ticket; reload: () => Promise<void> }) {
  const { meta } = useSamadhan();
  const numbers = useMemo(() => numbersOf(t), [t]);
  const [active, setActive] = useState<{ phone: string; startedAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const elapsed = active ? Math.max(0, Math.round((now - active.startedAt) / 1000)) : 0;
  const start = (phone: string) => { setActive({ phone, startedAt: Date.now() }); setNow(Date.now()); };
  const openLog = (phone: string, direction: Form['direction'] = 'OUTBOUND') => {
    setError('');
    setForm({ phone, direction, outcome: 'Connected', durationMins: active ? String(Math.max(0.1, Math.round((elapsed / 60) * 10) / 10)) : '', notes: '' });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await logCall(t.id, { phone: form.phone, direction: form.direction, outcome: form.outcome, durationMins: Number(form.durationMins || 0), notes: form.notes });
      setForm(null);
      setActive(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log the call.');
    } finally {
      setBusy(false);
    }
  };

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return (
    <div className="mt-2 space-y-1.5">
      {numbers.length === 0 && <p className="text-2xs text-muted">No phone number on this ticket. Add the mobile number in the ticket details to call.</p>}
      {numbers.map((n) => (
        <div key={n.phone} className="flex items-center gap-2 text-[13px]">
          <Phone size={14} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate"><span className="num">{n.phone}</span> <span className="text-2xs text-faint">{n.label}</span></span>
          <a
            href={dialUrl(n.phone, meta.callMode)}
            target={meta.callMode === 'teams' ? '_blank' : undefined}
            rel="noopener noreferrer"
            onClick={() => start(n.phone)}
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-good/10 px-2 text-2xs font-bold text-good hover:bg-good/20"
          >
            <PhoneCall size={12} /> Call
          </a>
        </div>
      ))}
      {active && (
        <div className="flex items-center gap-2 rounded-xl border border-good/30 bg-good/[0.06] px-2.5 py-2 text-xs">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-good" aria-hidden />
          <span className="min-w-0 flex-1 truncate">On a call with <span className="num font-semibold">{active.phone}</span> · <span className="num">{mmss}</span></span>
          <Button size="sm" variant="primary" onClick={() => openLog(active.phone)}>Log call</Button>
          <button type="button" onClick={() => setActive(null)} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={14} /></button>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
        {numbers.length > 0 && !active && <button type="button" onClick={() => openLog(numbers[0].phone)} className="text-2xs font-bold text-accent hover:underline">Log a call</button>}
        <button type="button" onClick={() => openLog(numbers[0]?.phone ?? '', 'INBOUND')} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><PhoneIncoming size={11} /> Log a call they made</button>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Log a call" width={480}>
        {form && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Number" required><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Direction">
                <select className={cx('h-9 w-full', inputBase)} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Form['direction'] })}>
                  <option value="OUTBOUND">I called them</option>
                  <option value="INBOUND">They called me</option>
                </select>
              </Field>
              <Field label="Outcome" required>
                <select className={cx('h-9 w-full', inputBase)} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
                  {meta.callOutcomes.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Length (minutes)"><input className={inputCls} type="number" min={0} max={600} step={0.5} value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} /></Field>
            </div>
            <Field label="What was discussed" hint="Visible to agents on the ticket - not sent to the requester">
              <textarea rows={4} className={textareaCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            {error && <Notice onClose={() => setError('')}>{error}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={busy || !form.phone.trim()}>{busy ? <Spinner /> : <Phone size={14} />} Save call</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
