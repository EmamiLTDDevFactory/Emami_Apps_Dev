'use client';
/** Where a screen shows "Explain with AI": the AI code is loaded only when AI_ENABLED (default on in deployed builds), so with the flag off none of it ships. */
import dynamic from 'next/dynamic';
import { AI_ENABLED } from '@/lib/ai/config';
import type { NarrateSpec } from '@/lib/ai/narrate';

const Real = AI_ENABLED ? dynamic(() => import('./AiNarrate'), { ssr: false }) : null;

export default function AiNarrateSlot(p: { build: () => NarrateSpec | null; label?: string; disabled?: boolean; className?: string }) {
  return Real ? <Real {...p} /> : null;
}
