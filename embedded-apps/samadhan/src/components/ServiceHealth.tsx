'use client';
import { useCallback, useEffect, useState } from 'react';
import { BookMarked, CalendarRange, ClipboardCheck, GitMerge, Link2, Lightbulb, Siren, X } from 'lucide-react';
import { candidateToProblem, dismissCandidate, problemCandidates, serviceHealth } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { relative } from '@/lib/format';
import type { ProblemCandidate, ServiceHealth as Health } from '@/lib/types';
import { Button, Card, Notice, cx } from './ui';

/*
   v7 Phase 7 (§N 7 majorIncidents, problemsOpen, approvalsPending, pendingExternal, changeCalendar): one service-health
   strip on the Dashboard while the service desks are on, plus problem candidates (recurring incidents) to act on.
*/
export default function ServiceHealth() {
  const { can, go, openList, openTicket } = useSamadhan();
  const [h, setH] = useState<Health | null>(null);
  const [cands, setCands] = useState<ProblemCandidate[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    serviceHealth().then(setH).catch(() => setH(null));
    if (can('problem.manage')) problemCandidates().then(setCands).catch(() => setCands([]));
  }, [can]);
  useEffect(() => { load(); }, [load]);
  if (!h) return null;
  const tiles = [
    { label: 'Major incidents', value: h.major, icon: Siren, tone: h.major ? 'text-bad' : 'text-good', onClick: () => openList({ majorIncident: '1' }) },
    { label: 'Open problems', value: h.problems, icon: GitMerge, tone: 'text-accent', onClick: () => openList({ recordClass: 'PROBLEM' }) },
    { label: 'Known errors', value: h.knownErrors, icon: BookMarked, tone: 'text-good', onClick: () => go('registers') },
    { label: 'Awaiting approval', value: h.approvals, icon: ClipboardCheck, tone: h.approvals ? 'text-warn' : 'text-muted', onClick: () => go('approvals') },
    { label: 'Pending external', value: h.external, icon: Link2, tone: 'text-accent', onClick: () => openList({ externalSystem: '' }) },
    { label: 'Changes next 7 days', value: h.changesWeek, icon: CalendarRange, tone: 'text-accent', onClick: () => go('calendar') },
  ];
  return (
    <div className="space-y-3" data-testid="service-health">
      {h.majorList.length > 0 && (
        <div className="rounded-2xl border-2 border-bad/40 bg-bad/10 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-extrabold text-bad"><Siren size={16} className="animate-pulse" /> Major incidents in progress</div>
          <ul className="space-y-1 text-xs">
            {h.majorList.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <button type="button" className="num font-bold text-accent hover:underline" onClick={() => openTicket(m.id)}>{m.ref}</button>
                <span className="min-w-0 flex-1 truncate">{m.subject}</span>
                <span className="text-muted">declared {relative(m.majorDeclaredAt)}</span>
                {m.majorBridgeUrl && <a className="font-bold text-bad hover:underline" href={m.majorBridgeUrl} target="_blank" rel="noopener noreferrer">Bridge</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <button key={t.label} type="button" onClick={t.onClick} className="flex items-center gap-2.5 rounded-2xl border border-line bg-panel p-3 text-left shadow-card transition hover:border-accent/40">
            <t.icon size={18} className={cx('shrink-0', t.tone)} />
            <span><span className="num block text-lg font-extrabold leading-none">{t.value}</span><span className="text-2xs text-muted">{t.label}</span></span>
          </button>
        ))}
      </div>
      {cands.length > 0 && (
        <Card title={<span className="inline-flex items-center gap-1.5"><Lightbulb size={15} className="text-warn" /> Possible problems</span>} sub="The same application and category 3+ times in 7 days - one problem record fixes them all">
          {error && <Notice onClose={() => setError('')}>{error}</Notice>}
          <ul className="space-y-1.5 text-xs" data-testid="problem-candidates">
            {cands.slice(0, 6).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
                <b>{c.count}×</b>
                <span className="min-w-0 flex-1">{c.applicationName ?? c.applicationCode} · {c.category}{c.function ? ` / ${c.function}` : ''}</span>
                <Button size="sm" variant="primary" onClick={async () => { try { const p = await candidateToProblem(c.id); openTicket(p.id); } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the problem.'); } }}>Create problem</Button>
                <button type="button" aria-label="Dismiss" className="p-1 text-muted hover:text-bad" onClick={async () => { await dismissCandidate(c.id).catch(() => {}); load(); }}><X size={14} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
