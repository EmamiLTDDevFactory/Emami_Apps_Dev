'use client';
// Freight analysis (component-wise standard vs actual freight, plant wise): its own route, loaded on demand.
import dynamic from 'next/dynamic';

const Screen = dynamic(() => import('@/components/freight/FreightAnalysis'), { ssr: false });

export default function Page() {
  return <Screen />;
}
