'use client';
import { useEffect, useState } from 'react';
import { list, odataKey, q } from '@/lib/api';
import { fmtDateTime, statusLabel, statusTone, timelineTone } from '@/lib/format';
import type { ApprovalStep, DoaChain, DoaRule } from '@/lib/entities';
import { Chip, Spinner } from '@/components/ui';
import { buildDoaChain, buildStepChain, chooseChain, type ChainStep } from './logic';

const DOT: Record<string, string> = { done: 'bg-emerald-500', current: 'bg-[#4338CA]', reject: 'bg-red-500', hold: 'bg-amber-500', waiting: 'bg-slate-300' };

/** Reads the real steps (ApprovalStepSet) and the DOA chain (DoaChainSet / DoaRuleSet?$expand=DoaRuleToChain); builds the timeline. */
export function useApprovalChain(type: 'CPE' | 'BUD', id: string, doaId: string, currLevel: string, status: string, tick: number) {
  const [chain, setChain] = useState<ChainStep[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoading(true);
    (async () => {
      const steps = await (type === 'CPE'
        ? list<ApprovalStep>(`CPESet${odataKey(id)}/CPEToApprovalSteps`)
        : list<ApprovalStep>('ApprovalStepSet', { $filter: `Doctype eq ${q('BUD')} and Docid eq ${q(id)}` })).then((r) => r.rows).catch(() => [] as ApprovalStep[]);
      let doa: DoaChain[] = [];
      if (doaId) {
        doa = await list<DoaChain>('DoaChainSet', { $filter: `Doaid eq ${q(doaId)}` }).then((r) => r.rows.filter((x) => x.Doaid === doaId)).catch(() => [] as DoaChain[]);
        if (!doa.length) {
          const rules = await list<DoaRule>('DoaRuleSet', { $expand: 'DoaRuleToChain' }).then((r) => r.rows).catch(() => [] as DoaRule[]);
          const rule = rules.find((r) => r.Doaid === doaId);
          const c = rule?.DoaRuleToChain as DoaChain[] | { results?: DoaChain[] } | undefined;
          doa = Array.isArray(c) ? c : c?.results ?? [];
        }
      }
      return chooseChain(buildStepChain(steps), buildDoaChain(doa, currLevel, status));
    })().then((c) => { if (live) setChain(c); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [type, id, doaId, currLevel, status, tick]);
  return { chain, loading };
}

export default function Timeline({ chain, loading }: { chain: ChainStep[]; loading?: boolean }) {
  if (loading && !chain.length) return <Spinner />;
  if (!chain.length) return <p className="text-[12px] text-sap-muted">No approval chain is on record for this document.</p>;
  return (
    <ol className="relative ml-2 border-l-2 border-sap-line pl-5">
      {chain.map((s) => {
        const tone = timelineTone(s.status);
        return (
          <li key={s.level} className="relative pb-4 last:pb-0">
            <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${DOT[tone]}`} />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className={`text-[12.5px] font-extrabold ${tone === 'waiting' ? 'text-sap-muted' : 'text-sap-ink'}`}>{s.level}. {s.role}</div>
                <div className="text-[11px] text-sap-muted">{s.approver || '-'}</div>
              </div>
              <div className="text-right">
                <Chip tone={statusTone(s.status)}>{statusLabel(s.status)}</Chip>
                {s.actedOn && fmtDateTime(s.actedOn) !== '-' && <div className="mt-0.5 text-[11px] text-sap-muted">{fmtDateTime(s.actedOn)}</div>}
              </div>
            </div>
            {s.comment && <p className="mt-1 rounded-md bg-[#F6F7FD] px-2 py-1 text-[11.5px] italic text-sap-muted">{s.comment}</p>}
          </li>
        );
      })}
    </ol>
  );
}
