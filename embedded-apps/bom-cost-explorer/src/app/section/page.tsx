'use client';
// A side-pane section page (the tiles of Costing, Analysis, Margin ...). The section comes from ?s=; the content is the same SectionHome the costing page shows in place.
import { useEffect, useState } from 'react';
import PlanFrame from '@/components/plan/PlanFrame';
import SectionHome from '@/components/SectionHome';
import type { SectionId } from '@/lib/nav/sections';

const IDS: SectionId[] = ['costing', 'analysis', 'margin', 'budget', 'plan', 'monitoring'];

export default function Page() {
  const [id, setId] = useState<SectionId | null>(null);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('s') as SectionId | null;
    setId(s && IDS.includes(s) ? s : 'costing');
  }, []);
  if (!id) return null;
  return <PlanFrame active="section" section={id}><SectionHome id={id} /></PlanFrame>;
}
