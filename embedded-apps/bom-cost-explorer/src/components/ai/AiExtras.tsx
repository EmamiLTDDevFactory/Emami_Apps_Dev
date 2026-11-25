'use client';
/** AI tools of the dashboard's AI tab (review pack, name mapping helper); the code is loaded only when AI_ENABLED. */
import dynamic from 'next/dynamic';
import { AI_ENABLED } from '@/lib/ai/config';

const Pack = AI_ENABLED ? dynamic(() => import('./ReviewPack'), { ssr: false }) : null;
const Mapper = AI_ENABLED ? dynamic(() => import('./NameMapper'), { ssr: false }) : null;

export default function AiExtras() {
  if (!Pack || !Mapper) return null;
  return <div className="mb-3 flex flex-col gap-3"><Pack /><Mapper /></div>;
}
