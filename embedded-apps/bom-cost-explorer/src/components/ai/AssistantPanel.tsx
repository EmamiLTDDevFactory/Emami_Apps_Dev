'use client';
/**
 * Ask-the-costing assistant panel (side panel on desktop, sheet on mobile). Questions in plain language, answered from
 * SAP through read-only tools (lib/ai/assistant.ts). Every number carries a fact chip; SAP runs need a click on Run.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, ChevronDown, ChevronRight, Loader2, Send, Settings, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { Button, cx, inputBase } from '../ui';
import type { CostQuery } from '@/lib/query/schema';
import type { CostResult } from '@/lib/client/api';
import { ask, newConversation, type AskResult } from '@/lib/ai/assistant';
import { getApiKey, getModels } from '@/lib/ai/config';
import { makeClient } from '@/lib/ai/gateway';
import { audit } from '@/lib/ai/guard';
import type { ToolContext } from '@/lib/ai/tools/registry';
import { FactText } from './ExplainDrawer';

type Msg = { role: 'user'; text: string } | { role: 'assistant'; res: AskResult };
type ConfirmReq = Parameters<ToolContext['confirm']>[0] & { resolve: (ok: boolean) => void };
const TOOL_LABEL: Record<string, string> = {
  search_materials: 'Searching materials', search_plants: 'Looking up plants', run_costing: 'Running SAP costing', get_result_summary: 'Reading the result', top_cost_drivers: 'Finding cost drivers',
  find_components: 'Filtering components', get_rate_options: 'Reading rate options', get_freight_breakup: 'Reading freight', compare_plants: 'Comparing plants', explain_change: 'Explaining the change',
  run_scenario: 'Simulating', get_plan_summary: 'Reading the plan', get_shortages: 'Checking shortages',
};

export default function AssistantPanel({ open, onClose, onSettings, current, system, user, onSelectComponent }: {
  open: boolean; onClose: () => void; onSettings: () => void; current: { query: CostQuery; result: CostResult } | null; system: string; user: string;
  onSelectComponent?: (idnrk: string) => void;
}) {
  const conv = useRef(newConversation());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; start: number; end?: number; error?: string }[]>([]);
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [, tick] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [msgs, progress, confirm]);
  useEffect(() => { if (!busy) return; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [busy]);
  useEffect(() => () => abort.current?.abort(), []);
  const hasKey = !!getApiKey();
  const known = new Set(current?.result.rows.flatMap((r) => [r.Idnrk, r.Headmat]) ?? []);

  async function send() {
    const text = q.trim();
    if (!text || busy) return;
    if (!hasKey) { onSettings(); return; }
    setQ(''); setBusy(true); setProgress([]);
    setMsgs((m) => [...m, { role: 'user', text }]);
    abort.current = new AbortController();
    const res = await ask({
      client: makeClient(getApiKey()), model: getModels().main, conv: conv.current, question: text, system, user, current, signal: abort.current.signal,
      confirm: (req) => new Promise<boolean>((resolve) => setConfirm({ ...req, resolve })),
      onEvent: (e) => {
        if (e.type === 'tool_start') setProgress((p) => [...p, { name: e.name, start: Date.now() }]);
        if (e.type === 'tool_end') setProgress((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, end: Date.now(), error: e.error } : x)));
      },
    });
    setMsgs((m) => [...m, { role: 'assistant', res }]);
    setBusy(false);
  }
  const answerConfirm = (ok: boolean) => { confirm?.resolve(ok); setConfirm(null); };
  const byId = new Map(conv.current.book.list().map((f) => [f.id, f]));

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-y-0 right-0 z-[55] flex w-full max-w-[460px] flex-col border-l border-line bg-panel shadow-2xl" role="dialog" aria-label="Costing assistant">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Bot size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Costing assistant</div>
          <div className="truncate text-2xs text-muted">{current ? `On screen: ${current.query.materials.slice(0, 3).join(', ') || 'all FGs'} · plant ${current.query.plants.join(', ')} · qty ${current.query.explQty} · ${current.query.prio.join('>')} · SAP ${system}` : `No costing on screen · SAP ${system}`}</div>
        </div>
        <button type="button" aria-label="AI settings" onClick={onSettings} className="rounded p-1.5 text-muted hover:bg-sunken"><Settings size={15} /></button>
        <button type="button" aria-label="Close assistant" onClick={() => { abort.current?.abort(); onClose(); }} className="rounded p-1.5 text-muted hover:bg-sunken"><X size={16} /></button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3 text-sm">
        {!msgs.length && (
          <div className="text-xs text-muted">
            <p>Ask about costs, rates, freight and plans in SAP. Examples:</p>
            <ul className="ml-4 mt-1 list-disc space-y-0.5">
              {['Which components of the current run have only a C-MAP (MBEW) rate?', 'What are the top 5 cost drivers per piece?', 'What if contract rates go up 5%?', 'Why did the cost change versus budget?'].map((x) => (
                <li key={x}><button type="button" className="text-left text-accent hover:underline" onClick={() => setQ(x)}>{x}</button></li>
              ))}
            </ul>
            {!hasKey && <p className="mt-3 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-ink">Add your Claude API key in <button type="button" className="font-semibold text-accent underline" onClick={onSettings}>AI settings</button> to start.</p>}
          </div>
        )}
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} className="mb-3 ml-8 rounded-xl bg-accent/10 px-3 py-2">{m.text}</div>
        ) : (
          <AnswerBlock key={i} res={m.res} byId={byId} known={known} onSelectComponent={onSelectComponent} user={user} question={(msgs[i - 1] as { text?: string })?.text ?? ''} />
        ))}
        {busy && (
          <div className="mb-3 flex flex-col gap-1 text-xs text-muted">
            {progress.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">{p.end ? <Check size={12} className={p.error ? 'text-bad' : 'text-good'} /> : <Loader2 size={12} className="animate-spin" />}{TOOL_LABEL[p.name] ?? p.name} · {(((p.end ?? Date.now()) - p.start) / 1000).toFixed(1)} s{p.error ? ' · failed' : ''}</div>
            ))}
            {!confirm && <div className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Thinking…</div>}
          </div>
        )}
        {confirm && (
          <div className="mb-3 rounded-xl border border-accent/40 bg-accent/[0.05] p-3 text-xs">
            <div className="mb-1 font-bold text-ink">Run SAP {confirm.tool === 'compare_plants' ? 'plant comparison' : 'costing'}?</div>
            <div>Materials {confirm.materials.join(', ')} · plant {confirm.plant} · qty {confirm.qty}</div>
            <div className="text-muted">Priority {confirm.prio} · donor {confirm.donor} · look-back {confirm.lookback} days · SAP {system}</div>
            <div className="mt-2 flex gap-2"><Button size="sm" variant="primary" onClick={() => answerConfirm(true)}>Run</Button><Button size="sm" onClick={() => answerConfirm(false)}>Cancel</Button></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <div className="flex gap-2">
          <textarea aria-label="Ask a question" rows={2} className={cx(inputBase, 'min-h-[44px] flex-1 resize-none py-2 text-sm')} placeholder={hasKey ? 'Ask about this costing…' : 'Add a Claude API key in AI settings first'} value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} disabled={busy} />
          <Button variant="primary" aria-label="Send" disabled={busy || !q.trim()} onClick={() => void send()}><Send size={15} /></Button>
        </div>
        <p className="mt-1 text-2xs text-faint">Read-only: the assistant never changes SAP. Numbers come from SAP tools and carry a fact id.</p>
      </div>
    </div>,
    document.body,
  );
}

function AnswerBlock({ res, byId, known, onSelectComponent, user, question }: { res: AskResult; byId: Map<string, import('@/lib/ai/facts').Fact>; known: Set<string>; onSelectComponent?: (idnrk: string) => void; user: string; question: string }) {
  const [how, setHow] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const [reason, setReason] = useState('');
  const sendVote = (v: 'up' | 'down', why = '') => { setVote(v); audit({ ts: new Date().toISOString(), user, feature: `feedback:${v}`, question: `${question} | ${why}`, tools: [], inputTokens: 0, outputTokens: 0, validatorOk: res.validatorOk, templateUsed: res.template, ms: 0, model: '', system: '' }); };
  return (
    <div className="mb-4">
      {res.error && <div className="mb-1 rounded-lg border border-warn/40 bg-warn/[0.07] px-2 py-1 text-xs">{res.error}</div>}
      <div className="flex flex-col gap-2 leading-relaxed">
        {res.answer.paragraphs.map((p, i) => <Para key={i} text={p.text} byId={byId} known={known} onSelect={onSelectComponent} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-2xs text-muted">
        {res.template && <span className="rounded bg-sunken px-1.5 py-px font-semibold">template</span>}
        <button type="button" className="inline-flex items-center gap-0.5 hover:text-ink" onClick={() => setHow((h) => !h)}>{how ? <ChevronDown size={11} /> : <ChevronRight size={11} />} How I got this ({res.tools.length} tool{res.tools.length === 1 ? '' : 's'})</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" aria-label="Good answer" className={cx('rounded p-1 hover:bg-sunken', vote === 'up' && 'text-good')} onClick={() => sendVote('up')}><ThumbsUp size={12} /></button>
          <button type="button" aria-label="Bad answer" className={cx('rounded p-1 hover:bg-sunken', vote === 'down' && 'text-bad')} onClick={() => setVote('down')}><ThumbsDown size={12} /></button>
        </span>
      </div>
      {vote === 'down' && !reason.startsWith('sent:') && (
        <div className="mt-1 flex gap-1"><input aria-label="What was wrong" className={cx(inputBase, 'h-7 flex-1 text-xs')} placeholder="What was wrong?" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" onClick={() => { sendVote('down', reason); setReason(`sent:${reason}`); }}>Send</Button></div>
      )}
      {how && (
        <ul className="mt-1 space-y-0.5 rounded-lg bg-sunken/50 px-2 py-1.5 font-mono text-[10px] text-muted">
          {res.tools.map((t, i) => <li key={i}>{t.name}({JSON.stringify(t.input)}) · {(t.ms / 1000).toFixed(1)} s</li>)}
          {!res.tools.length && <li>No tools were needed.</li>}
          <li>tokens in {res.usage.input} · out {res.usage.output} · numbers check {res.validatorOk ? 'passed' : 'not passed'}</li>
        </ul>
      )}
    </div>
  );
}

/** A paragraph: Markdown table rows rendered as a table; material numbers from the run are clickable. */
function Para({ text, byId, known, onSelect }: { text: string; byId: Map<string, import('@/lib/ai/facts').Fact>; known: Set<string>; onSelect?: (idnrk: string) => void }) {
  const lines = text.split('\n');
  const isTable = lines.filter((l) => l.trim().startsWith('|')).length >= 2;
  const rich = (s: string) => s.split(/(\b[A-Z0-9]{5,18}\b)/g).map((part, i) => (known.has(part) && onSelect
    ? <button key={i} type="button" className="font-mono font-semibold text-accent hover:underline" onClick={() => onSelect(part)}>{part}</button>
    : <FactText key={i} text={part} byId={byId} />));
  if (!isTable) return <p>{rich(text)}</p>;
  const rows = lines.filter((l) => l.trim().startsWith('|') && !/^\|\s*:?-{2,}/.test(l.trim())).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const pre = lines.filter((l) => !l.trim().startsWith('|')).join(' ').trim();
  return (
    <div>
      {pre && <p className="mb-1">{rich(pre)}</p>}
      <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-xs">
        <thead className="bg-sunken/60"><tr>{rows[0]?.map((h, i) => <th key={i} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((r, i) => <tr key={i} className="border-t border-line/60">{r.map((c, j) => <td key={j} className="px-2 py-1">{rich(c)}</td>)}</tr>)}</tbody>
      </table></div>
    </div>
  );
}
