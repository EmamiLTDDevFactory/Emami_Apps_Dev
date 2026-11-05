'use client';
import { useEffect, useState } from 'react';
import { savePrefs } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { BELL_EVENT_LABEL, EMAIL_NOTICE_LABEL } from '@/lib/format';
import type { AgentPrefs, BellEvent } from '@/lib/types';
import { Button, Field, Modal, Notice, Tabs, cx } from './ui';

const VIEWS: { value: string; label: string }[] = [
  { value: '', label: 'Admin default' }, { value: 'mine', label: 'Mine' }, { value: 'open', label: 'Open' }, { value: 'unassigned', label: 'Unassigned' },
  { value: 'pending', label: 'Pending' }, { value: 'overdue', label: 'Overdue' }, { value: 'my_overdue', label: 'My overdue' }, { value: 'my_groups', label: 'Open in my groups' },
  { value: 'urgent_high', label: 'Urgent and high' }, { value: 'due_today', label: 'Due today' }, { value: 'today', label: 'Created today' }, { value: 'watching', label: "I'm watching" },
];

/**
 * The agent's own settings: which bell events and which email / Emami Apps inbox notifications they get, and how the
 * ticket list opens. Admins decide what is available; each agent can only turn things off for themselves.
 */
export default function MyPreferences({ open, onClose, prefs, events, onSaved, start = 'notifications' }: {
  open: boolean; onClose: () => void; prefs: AgentPrefs; events: BellEvent[]; onSaved: (p: AgentPrefs) => void; start?: 'notifications' | 'list';
}) {
  const { meta, mailEnabled } = useSetu();
  const [tab, setTab] = useState<'notifications' | 'list'>(start);
  const [bellMuted, setBellMuted] = useState<BellEvent[]>([]);
  const [emailMuted, setEmailMuted] = useState<string[]>([]);
  const [listView, setListView] = useState('');
  const [pageSize, setPageSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(start);
    setBellMuted(prefs.bellMuted ?? []);
    setEmailMuted(prefs.emailMuted ?? []);
    setListView(prefs.listView ?? '');
    setPageSize(prefs.pageSize ? String(prefs.pageSize) : '');
    setError('');
  }, [open, prefs, start]);

  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await savePrefs({ bellMuted, emailMuted, listView: listView || null, pageSize: pageSize ? Number(pageSize) : null }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const box = (on: boolean, onChange: () => void, label: string, sub?: string) => (
    <label className={cx('flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-[13px] hover:bg-sunken', !on && 'text-muted')}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" checked={on} onChange={onChange} />
      <span>{label}{sub && <span className="block text-2xs text-faint">{sub}</span>}</span>
    </label>
  );
  return (
    <Modal open={open} onClose={onClose} title="My preferences" width={560}>
      <div className="space-y-3 p-4">
        <Tabs label="Preferences" value={tab} onChange={setTab} tabs={[{ id: 'notifications', label: 'Notifications' }, { id: 'list', label: 'Ticket list' }]} />
        {tab === 'notifications' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Bell in Samadhan</h3>
              {events.length === 0 ? <p className="text-xs text-muted">Your admin has switched the bell off.</p>
                : events.map((e) => <div key={e}>{box(!bellMuted.includes(e), () => setBellMuted((l) => flip(l, e)), BELL_EVENT_LABEL[e] ?? e)}</div>)}
              <p className="mt-1 text-[11px] text-faint">Only the events your admin switched on are listed.</p>
            </div>
            <div>
              <h3 className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Email &amp; Emami Apps inbox</h3>
              {meta.agentEmailTemplates.map((k) => <div key={k}>{box(!emailMuted.includes(k), () => setEmailMuted((l) => flip(l, k)), EMAIL_NOTICE_LABEL[k] ?? k)}</div>)}
              {!mailEnabled && <p className="mt-1 text-[11px] text-faint">Outlook mail is off on this server; these still reach the Emami Apps inbox.</p>}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Open the ticket list on" hint={`Admin default: ${VIEWS.find((v) => v.value === meta.options['list.defaultView'])?.label ?? 'All'}`}>
              <select value={listView} onChange={(e) => setListView(e.target.value)} className="h-9 w-full rounded-xl border border-line bg-panel px-3 text-sm">
                {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Tickets per page" hint={`Admin default: ${meta.options['list.pageSize']}`}>
              <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} className="h-9 w-full rounded-xl border border-line bg-panel px-3 text-sm">
                <option value="">Admin default</option>
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>
        )}
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}
