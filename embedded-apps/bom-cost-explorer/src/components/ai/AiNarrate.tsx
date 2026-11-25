'use client';
/** "Explain with AI" for a costing screen: builds the facts when pressed (so they are fresh), shows the written review with its fact ids, or the plain summary. */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ClipboardCopy, Settings, Sparkles } from 'lucide-react';
import { Button, Pill, Spinner } from '../ui';
import { hasAiAccess } from '@/lib/ai/config';
import { narrate, type NarrateSpec, type Narrative } from '@/lib/ai/narrate';
import { sapConfig } from '@/lib/sap/config';
import { readHubSession } from '@/lib/client/session';
import { FactText } from './ExplainDrawer';

const AiSettings = dynamic(() => import('./AiSettings'), { ssr: false });

export default function AiNarrate({ build, label = 'Explain with AI', disabled, className }: { build: () => NarrateSpec | null; label?: string; disabled?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Narrative | null>(null);
  const [err, setErr] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  async function run() {
    const spec = build();
    if (!spec) { setErr('Run the screen first.'); return; }
    setBusy(true); setErr('');
    try {
      let system = '';
      try { system = sapConfig().system; } catch { /* no config */ }
      setOut(await narrate(spec, { user: readHubSession()?.email ?? 'unknown', system }));
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  const byId = new Map((out?.spec.facts.list() ?? []).map((f) => [f.id, f]));
  const copy = () => out && void navigator.clipboard?.writeText([...out.result.answer.paragraphs, ...(out.result.answer.checks ?? [])].map((p) => p.text.replace(/\s*\[F\d+\]/g, '')).join('\n'));
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy || disabled}><Sparkles size={13} /> {busy ? 'Writing…' : label}</Button>
        {busy && <Spinner className="h-4 w-4" />}
        <button type="button" aria-label="AI settings" className="rounded-lg p-1 text-muted hover:bg-sunken hover:text-ink" onClick={() => setSettings(true)}><Settings size={14} /></button>
        {!hasAiAccess() && <span className="text-2xs text-muted">No Groq key yet: you get the plain summary. Add one in AI settings.</span>}
      </div>
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
      {out && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-sunken/30 p-3 text-sm leading-relaxed">
          <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">{out.spec.title} · {out.at}{out.result.template && <Pill tone="neutral">plain summary</Pill>}{out.result.error && <span className="text-warn">{out.result.error}</span>}</div>
          {out.result.answer.paragraphs.map((p, i) => <p key={i}><FactText text={p.text} byId={byId} onHover={setHover} /></p>)}
          {(out.result.answer.checks ?? []).length > 0 && (
            <div><div className="text-2xs font-bold uppercase tracking-wide text-muted">What to check</div>
              <ul className="ml-4 list-disc">{out.result.answer.checks!.map((p, i) => <li key={i}><FactText text={p.text} byId={byId} onHover={setHover} /></li>)}</ul></div>
          )}
          {hover && byId.get(hover) && <p className="text-2xs text-muted">{hover}: {byId.get(hover)!.label} = {byId.get(hover)!.display} {byId.get(hover)!.unit} ({byId.get(hover)!.source})</p>}
          <div><Button size="sm" variant="ghost" onClick={copy}><ClipboardCopy size={13} /> Copy as text</Button></div>
        </div>
      )}
      {settings && <AiSettings open onClose={() => setSettings(false)} />}
    </div>
  );
}
