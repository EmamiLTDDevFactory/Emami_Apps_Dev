'use client';
import Decimal from 'decimal.js';
import { Card } from '../ui';
import { BASE_PATH } from '@/lib/client/session';
import { toLakh, type Band } from '@/lib/dash/logic';

export const lakh = (v: Decimal, dp = 1) => toLakh(v).toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const pct = (v: Decimal | null) => (v === null ? '-' : `${v.toFixed(1)} %`);
export const money = (v: Decimal | null, dp = 2) => (v === null ? '-' : v.toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const BAND: Record<Band, string> = { good: 'text-good', amber: 'text-warn', red: 'text-bad', none: 'text-muted' };
export const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
/** 1 April of the financial year of the given day (YYYY-MM-DD). */
export const fyStart = (day: string) => { const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)); return `${m < 4 ? y - 1 : y}-04-01`; };
export const thCls = 'whitespace-nowrap border-b border-line bg-sunken px-2.5 py-1.5 text-right text-2xs font-bold uppercase tracking-wide text-muted';
export const tdCls = 'whitespace-nowrap px-2.5 py-1.5 text-right text-xs tabular-nums';

export function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={`${BASE_PATH}${href}`} className="inline-flex rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-accent hover:bg-sunken">{children}</a>;
}

export function NeedsSap({ title, object, why, links }: { title: string; object: string; why: string; links?: { href: string; label: string }[] }) {
  return (
    <Card className="p-4 text-sm">
      <h3 className="text-base font-extrabold">{title}</h3>
      <p className="mt-1 inline-flex rounded-full bg-warn/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-warn">Needs SAP: {object}</p>
      <p className="mt-2 text-muted">{why}</p>
      {links && <div className="mt-3 flex flex-wrap gap-2">{links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</div>}
    </Card>
  );
}

