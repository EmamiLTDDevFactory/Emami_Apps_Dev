'use client';
import { Suspense } from 'react';
import CwipCreate from '@/components/procure/CwipCreate';
export default function Page() {
  return <Suspense fallback={null}><CwipCreate /></Suspense>;
}
