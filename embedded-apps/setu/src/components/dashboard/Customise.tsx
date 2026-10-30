'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { DASHBOARD_WIDGETS, type DashboardWidget } from '@/lib/types';
import { Button, Modal, Notice, Spinner, cx } from '../ui';
import { WIDGET_INFO } from './frame';

const SPAN_WORD = { full: 'Full width', wide: 'Wide', one: 'Standard' } as const;

/**
 * Pick which widgets show and in what order. Shown widgets come first in their current order, hidden ones after.
 * Save keeps the list as the agent's own layout; Reset clears it so the Admin default applies again.
 */
export function CustomiseDialog({ open, onClose, layout, adminDefault, usingDefault, onSave }: {
  open: boolean;
  onClose: () => void;
  layout: DashboardWidget[];
  adminDefault: DashboardWidget[];
  usingDefault: boolean;
  onSave: (list: DashboardWidget[] | null) => Promise<void>;
}) {
  const [rows, setRows] = useState<{ id: DashboardWidget; on: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows([...layout.map((id) => ({ id, on: true })), ...DASHBOARD_WIDGETS.filter((id) => !layout.includes(id)).map((id) => ({ id, on: false }))]);
    setError('');
  }, [open, layout]);

  const move = (i: number, d: -1 | 1) => setRows((r) => {
    const j = i + d;
    if (j < 0 || j >= r.length) return r;
    const n = [...r];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const save = async (list: DashboardWidget[] | null) => {
    setBusy(true);
    try {
      await onSave(list);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your dashboard.');
    } finally {
      setBusy(false);
    }
  };
  const shown = rows.filter((r) => r.on).length;

  return (
    <Modal open={open} onClose={onClose} title="Customise my dashboard" width={620}>
      <p className="mb-3 text-[13px] text-muted">
        Tick the widgets you want and use the arrows to order them. {usingDefault ? 'You are on the Admin default layout.' : 'This is your own layout.'}
      </p>
      {error && <div className="mb-3"><Notice onClose={() => setError('')}>{error}</Notice></div>}
      <ol className="space-y-1.5" aria-label="Dashboard widgets">
        {rows.map((r, i) => {
          const info = WIDGET_INFO[r.id];
          return (
            <li key={r.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors', r.on ? 'border-line bg-panel' : 'border-dashed border-line bg-sunken/60')}>
              <input
                id={`w-${r.id}`}
                type="checkbox"
                checked={r.on}
                onChange={() => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, on: !y.on } : y)))}
                className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
              />
              <label htmlFor={`w-${r.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className={cx('flex items-center gap-2 text-[13px] font-semibold', !r.on && 'text-muted')}>
                  {info.title}
                  <span className="rounded bg-sunken px-1.5 text-2xs font-semibold text-faint">{SPAN_WORD[info.span]}</span>
                </span>
                <span className="block truncate text-2xs text-muted" title={info.description}>{info.description}</span>
              </label>
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="sm" className="!h-7 !px-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${info.title} up`}><ArrowUp size={13} /></Button>
                <Button variant="ghost" size="sm" className="!h-7 !px-1.5" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Move ${info.title} down`}><ArrowDown size={13} /></Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button size="sm" onClick={() => save(null)} disabled={busy || usingDefault} title={`Admin default: ${adminDefault.length} widgets`}>
          <RotateCcw size={13} /> Reset to default
        </Button>
        <div className="flex items-center gap-2">
          <span className="num text-2xs text-muted">{shown} of {rows.length} shown</span>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={() => save(rows.filter((r) => r.on).map((r) => r.id))} disabled={busy}>
            {busy && <Spinner className="h-3 w-3" />} Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
