'use client';
import { useState } from 'react';
import { BadgePlus, BrickWall, Building2, Clock, Cloud, Database, Eraser, FileSpreadsheet, Flame, History, KeyRound, Laptop, LogIn, Package, Printer, RefreshCw, Rocket, Server, Shield, ShieldCheck, ShoppingBag, Smartphone, Truck, UserPlus, Users, type LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = { BadgePlus, BrickWall, Building2, Clock, Cloud, Database, Eraser, FileSpreadsheet, Flame, History, KeyRound, Laptop, LogIn, Package, Printer, RefreshCw, Rocket, Server, Shield, ShieldCheck, ShoppingBag, Smartphone, Truck, UserPlus, Users };
import type { CatalogField } from '@/lib/types';
import { Field, cx, inputBase, inputCls, textareaCls } from './ui';

/*
   v7 Phase 6 (§O service catalogue): the item tiles and the item's questions, shared by New ticket and the portal.
   Answers are sent as { label: value }; the server checks the required ones and writes them into the description.
*/
export type Answers = Record<string, string | boolean>;
type Item = { id: number; name: string; description: string | null; icon: string | null; formSchema: CatalogField[]; needsManager?: boolean };

function ItemIcon({ name }: { name: string | null }) {
  const I = (name && ICONS[name]) || ShoppingBag;
  return <I size={16} className="mt-0.5 shrink-0 text-accent" />;
}

export function CatalogPicker<T extends Item>({ items, value, onChange }: { items: T[]; value: number | null; onChange: (item: T | null) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = items.filter((i) => !term || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(term));
  return (
    <div className="space-y-2" data-testid="catalog-picker">
      {items.length > 6 && <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests (e.g. VPN, role, laptop)" aria-label="Search the catalogue" />}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((i) => (
          <button key={i.id} type="button" aria-pressed={value === i.id} onClick={() => onChange(value === i.id ? null : i)}
            className={cx('flex items-start gap-2 rounded-xl border p-2.5 text-left transition', value === i.id ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-line hover:border-accent/50 hover:bg-sunken')}>
            <ItemIcon name={i.icon} />
            <span className="min-w-0"><span className="block text-[13px] font-bold">{i.name}</span>{i.description && <span className="block text-2xs text-muted">{i.description}</span>}</span>
          </button>
        ))}
      </div>
      {!shown.length && <p className="text-2xs text-muted">No request matches - describe what you need instead.</p>}
    </div>
  );
}

export function CatalogQuestions({ item, answers, onChange, manager, onManager }: { item: Item; answers: Answers; onChange: (a: Answers) => void; manager: string; onManager: (v: string) => void }) {
  const set = (label: string, v: string | boolean) => onChange({ ...answers, [label]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="catalog-questions">
      {item.formSchema.map((f) => (
        <Field key={f.label} label={f.label} required={f.required} className={f.type === 'textarea' || f.type === 'checkbox' ? 'sm:col-span-2' : undefined}>
          {f.type === 'textarea' ? <textarea rows={3} className={textareaCls} value={String(answers[f.label] ?? '')} onChange={(e) => set(f.label, e.target.value)} />
            : f.type === 'select' ? (
              <select className={cx('h-9 w-full', inputBase)} value={String(answers[f.label] ?? '')} onChange={(e) => set(f.label, e.target.value)}>
                <option value="">—</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : f.type === 'checkbox' ? (
              <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={answers[f.label] === true} onChange={(e) => set(f.label, e.target.checked)} /> Yes</label>
            ) : <input type={f.type === 'date' ? 'date' : 'text'} className={inputCls} value={String(answers[f.label] ?? '')} onChange={(e) => set(f.label, e.target.value)} />}
        </Field>
      ))}
      {item.needsManager && <Field label="Manager's email" required hint="The first approval goes to them (one-click email link)" className="sm:col-span-2"><input type="email" className={inputCls} value={manager} onChange={(e) => onManager(e.target.value)} /></Field>}
    </div>
  );
}

/** True when every required question has an answer (and the manager email when needed). */
export const catalogReady = (item: Item | null, answers: Answers, manager: string) =>
  !item || (item.formSchema.every((f) => !f.required || (f.type === 'checkbox' ? answers[f.label] === true : String(answers[f.label] ?? '').trim())) && (!item.needsManager || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manager.trim())));
