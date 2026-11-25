'use client';
/** "Ask" on the costing dashboard: the assistant with the read-only dashboard tools (MIS, Sales, Margin) and the costing tools. Loaded only when AI_ENABLED. */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Bot, Settings } from 'lucide-react';
import { AI_ENABLED } from '@/lib/ai/config';
import { sapConfig } from '@/lib/sap/config';
import { readHubSession } from '@/lib/client/session';

const AssistantPanel = AI_ENABLED ? dynamic(() => import('./AssistantPanel'), { ssr: false }) : null;
const AiSettings = AI_ENABLED ? dynamic(() => import('./AiSettings'), { ssr: false }) : null;

export default function AskDashButton() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!AssistantPanel || !AiSettings) return null;
  let system = '';
  try { system = sapConfig().system; } catch { /* no config */ }
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10" onClick={() => setOpen(true)} title="Ask the cockpit a question in plain words (read-only)"><Bot size={13} /> Ask the cockpit</button>
      <button type="button" aria-label="AI settings" className="rounded-lg p-1 text-muted hover:bg-sunken hover:text-ink" onClick={() => setSettings(true)}><Settings size={14} /></button>
      {open && <AssistantPanel open onClose={() => setOpen(false)} onSettings={() => setSettings(true)} current={null} system={system} user={readHubSession()?.email ?? 'unknown'} />}
      {settings && <AiSettings open onClose={() => setSettings(false)} />}
    </span>
  );
}
