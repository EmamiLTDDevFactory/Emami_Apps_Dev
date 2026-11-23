'use client';
/** Every settings change (exclusions, budget versions, mapping): who, when, what. */
import { useEffect, useState } from 'react';
import { api, type ApiError } from '@/lib/api';
import { fmtDateTime, fyLabel, short } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { Card, Empty, Notice, Pill, Skeleton } from '../ui';

type R = { id?: number; dimension?: string; values?: string[]; pattern?: string; reason?: string; active?: boolean };
const ruleText = (r: R | undefined) => (r ? `#${r.id ?? ''} ${r.dimension ?? ''} ${[...(r.values ?? []).slice(0, 4), r.pattern].filter(Boolean).join(', ')}${(r.values?.length ?? 0) > 4 ? ` +${(r.values?.length ?? 0) - 4}` : ''} - ${r.reason ?? ''}` : '');

function describe(e: AuditEntry): { tag: string; tone: 'accent' | 'good' | 'warn' | 'bad' | 'neutral'; text: string } {
  const d = e.detail as Record<string, unknown>;
  switch (e.action) {
    case 'exclusion.create': return { tag: 'Rule added', tone: 'good', text: ruleText(d.rule as R) };
    case 'exclusion.update': {
      const b = d.before as R; const a = d.after as R;
      const what = b && a && b.active !== a.active ? (a.active ? 'switched on' : 'switched off') : 'changed';
      return { tag: `Rule ${what}`, tone: 'accent', text: ruleText(a) };
    }
    case 'exclusion.delete': return { tag: 'Rule deleted', tone: 'bad', text: ruleText(d.rule as R) };
    case 'exclusion.bulk': return { tag: 'Rules uploaded', tone: 'good', text: `${d.count} rules from ${d.fileName || 'Excel'} (#${(d.ids as number[] | undefined)?.join(', #')})` };
    case 'budget.upload': return { tag: `${d.kind} uploaded`, tone: 'good', text: `${fyLabel(Number(d.fy))} version ${d.version}: ${short(Number(d.total))} in ${d.lines} lines${d.fileName ? ` · ${d.fileName}` : ''}${d.note ? ` · ${d.note}` : ''}` };
    case 'budget.activate': return { tag: `${d.kind} rolled back`, tone: 'warn', text: `${fyLabel(Number(d.fy))}: version ${d.version} made active` };
    case 'budget.deactivate': return { tag: `${d.kind} switched off`, tone: 'warn', text: `${fyLabel(Number(d.fy))}: uploaded budget no longer used` };
    case 'mapping.save': {
      const a = d.after as { groups?: object; aliases?: object; glMedia?: object } | undefined;
      return { tag: 'Mapping saved', tone: 'accent', text: `${Object.keys(a?.groups ?? {}).length} group overrides, ${Object.keys(a?.aliases ?? {}).length} header mappings, ${Object.keys(a?.glMedia ?? {}).length} G/L buckets` };
    }
    default: return { tag: e.action, tone: 'neutral', text: JSON.stringify(d).slice(0, 200) };
  }
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | { error: string } | null>(null);
  useEffect(() => { api.audit().then(setEntries).catch((e: ApiError) => setEntries({ error: e.message })); }, []);
  if (!entries) return <Card><Skeleton rows={8} /></Card>;
  if ('error' in entries) return <Notice>{entries.error}</Notice>;
  return (
    <Card title="Audit log" sub="Latest 300 settings changes" bodyClass="p-0">
      {entries.length === 0 ? <Empty title="No changes yet" /> : (
        <ul className="divide-y divide-line">
          {entries.map((e) => { const x = describe(e); return (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px]">
              <span className="w-32 shrink-0 text-2xs text-muted">{fmtDateTime(e.at)}</span>
              <Pill tone={x.tone}>{x.tag}</Pill>
              <span className="min-w-0 flex-1 break-words">{x.text}</span>
              <span className="text-2xs text-muted">{e.actor}</span>
            </li>
          ); })}
        </ul>
      )}
    </Card>
  );
}
