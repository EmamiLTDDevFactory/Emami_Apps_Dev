'use client';
// Freight comparison (actual vs standard, plant and FG wise): its own route, loaded on demand.
import dynamic from 'next/dynamic';

const Screen = dynamic(() => import('@/components/freight/FreightCompare'), { ssr: false });

export default function Page() {
  return <Screen />;
}
