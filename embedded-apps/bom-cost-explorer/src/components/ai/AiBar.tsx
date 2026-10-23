'use client';
/**
 * The AI entry points next to the BOM costing total: "Explain change", "Ask" and AI settings. Loaded with
 * next/dynamic only when AI_ENABLED, so with the flag off none of the AI code reaches the browser.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Bot, Settings, Sparkles } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import type { CostQuery } from '@/lib/query/schema';
import type { CostResult } from '@/lib/client/api';
import type { Scenario } from '@/lib/client/scenarios';

const ExplainDrawer = dynamic(() => import('./ExplainDrawer'), { ssr: false });
const AssistantPanel = dynamic(() => import('./AssistantPanel'), { ssr: false });
const AiSettings = dynamic(() => import('./AiSettings'), { ssr: false });

export default function AiBar({ rows, result, query, system, user, scenarios, onSelectRow }: {
  rows: CostLine[]; result: CostResult; query: CostQuery; system: string; user: string; scenarios: Scenario[]; onSelectRow?: (row: number) => void;
}) {
  const [explain, setExplain] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const select = (pred: (r: CostLine) => boolean) => { const i = rows.findIndex(pred); if (i >= 0) onSelectRow?.(i); };
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10';
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => setExplain(true)} title="Why did the cost change?"><Sparkles size={13} /> Explain change</button>
      <button type="button" className={btn} onClick={() => setAskOpen(true)} title="Ask the costing assistant"><Bot size={13} /> Ask</button>
      <button type="button" aria-label="AI settings" className="rounded-lg p-1 text-muted hover:bg-sunken hover:text-ink" onClick={() => setSettings(true)}><Settings size={14} /></button>
      {explain && <ExplainDrawer open onClose={() => setExplain(false)} rows={rows} query={query} system={system} user={user} scenarios={scenarios}
        onSelectComponent={(headmat, hwerks, idnrk) => { setExplain(false); select((r) => r.Headmat === headmat && r.Hwerks === hwerks && r.Idnrk === idnrk); }} />}
      {askOpen && <AssistantPanel open onClose={() => setAskOpen(false)} onSettings={() => setSettings(true)} current={{ query, result }} system={system} user={user}
        onSelectComponent={(idnrk) => select((r) => r.Idnrk === idnrk || r.Headmat === idnrk)} />}
      {settings && <AiSettings open onClose={() => setSettings(false)} />}
    </span>
  );
}
